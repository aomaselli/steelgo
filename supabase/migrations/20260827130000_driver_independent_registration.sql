-- ============================================================================
-- Modelo de motorista independente + consolidacao da habilitacao em license_*
-- ============================================================================
--
-- Contexto (diagnostico Fase 0, 27/08/2026):
--   public.drivers estava VAZIA (0 linhas). Nao ha backfill a fazer, nao ha
--   divergencia cnh_* x license_*, nao ha colisao no indice unico e nao ha
--   vinculo historico a preservar. Isso permite consolidar direto, sem periodo
--   de convivencia entre as duas geracoes de colunas.
--
--   3 profiles com role=driver existiam sem linha em public.drivers, porque o
--   cadastro (RegisterPage) so cria auth.users + profiles + user_roles.
--
-- Decisoes de produto aplicadas:
--   carrier_id NULL  = motorista independente (entidade valida por si so)
--   carrier_id UUID  = motorista atualmente vinculado a uma transportadora
--   Sem carrier placeholder. license_* e a unica fonte de verdade da CNH.
--
-- Preservado sem alteracao: license_verification_status, is_verified,
--   license_verified_at, license_verified_by, review_driver_license,
--   drivers_license_identity_uidx.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. carrier_id passa a aceitar NULL
-- ----------------------------------------------------------------------------
alter table public.drivers
  alter column carrier_id drop not null;

-- A FK era ON DELETE CASCADE: apagar uma transportadora destruiria o motorista
-- e todo o historico de verificacao junto. Com motorista independente sendo
-- entidade propria, o correto e desvincular, nao destruir.
alter table public.drivers
  drop constraint if exists drivers_carrier_id_fkey,
  add constraint drivers_carrier_id_fkey
    foreign key (carrier_id) references public.carriers(id) on delete set null;

-- As constraints abaixo foram criadas NOT VALID em 20260813220000, ou seja,
-- as linhas pre-existentes nunca foram checadas. Com a tabela vazia, validar
-- agora custa nada e impede que dados invalidos entrem no futuro.
alter table public.drivers validate constraint drivers_profile_id_fkey;
alter table public.drivers validate constraint drivers_license_country_format;
alter table public.drivers validate constraint drivers_license_verification_status_valid;


-- ----------------------------------------------------------------------------
-- 2. Remocao das colunas legadas de CNH
-- ----------------------------------------------------------------------------
-- Seguro porque a tabela esta vazia e todas as referencias em src/ foram
-- migradas para license_* no mesmo commit.
--
-- cnh_doc_url TEM consumidor (src/routes/driver.docs.tsx), entao e RENOMEADA
-- para license_doc_url em vez de removida: a funcionalidade de documento da
-- CNH e preservada e passa a seguir a mesma nomenclatura das demais colunas.
alter table public.drivers
  rename column cnh_doc_url to license_doc_url;

alter table public.drivers
  drop column if exists cnh_number,
  drop column if exists cnh_category,
  drop column if exists cnh_expiry;


-- ----------------------------------------------------------------------------
-- 3. ensure_driver_record(): criacao idempotente da linha do motorista
-- ----------------------------------------------------------------------------
-- Por que RPC e nao trigger em handle_new_user:
--   drivers.full_name e NOT NULL e viria de raw_user_meta_data. Se faltasse,
--   o INSERT falharia e derrubaria o signUp inteiro — handle_new_user nao tem
--   tratamento de excecao. Alem disso o trigger criaria linha para todo
--   cadastro abandonado. A RPC so cria para quem confirmou e-mail e entrou.
--
-- Nao recebe nem grava carrier_id: motorista nasce independente.
-- Nao ha policy de escrita para o motorista em public.drivers — RLS nao
-- restringe coluna, e uma policy de auto-gestao permitiria ao proprio
-- motorista editar license_verification_status e is_verified (auto-aprovacao).
create or replace function public.ensure_driver_record()
returns table (
  id uuid,
  carrier_id uuid,
  profile_id uuid,
  license_verification_status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor   uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not public.has_role(v_actor, 'driver'::public.app_role) then
    raise exception using errcode = '42501', message = 'Driver role required';
  end if;

  select * into v_profile from public.profiles p where p.id = v_actor;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  insert into public.drivers (
    carrier_id, profile_id, full_name, cpf, country_code,
    license_issuer_country, license_verification_status, is_active, is_verified
  ) values (
    null,
    v_actor,
    coalesce(nullif(btrim(v_profile.full_name), ''), 'Motorista'),
    nullif(btrim(v_profile.cpf), ''),
    'BR',
    'BR',
    'pending',
    true,
    false
  )
  on conflict (profile_id) do nothing;

  return query
  select d.id, d.carrier_id, d.profile_id, d.license_verification_status
  from public.drivers d
  where d.profile_id = v_actor;
end;
$$;

revoke execute on function public.ensure_driver_record() from public, anon;
grant  execute on function public.ensure_driver_record() to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Backfill idempotente dos profiles role=driver ja existentes
-- ----------------------------------------------------------------------------
-- Descobre por consulta; nenhum UUID ou nome hardcoded. Reexecutar e inofensivo.
insert into public.drivers (
  carrier_id, profile_id, full_name, cpf, country_code,
  license_issuer_country, license_verification_status, is_active, is_verified
)
select
  null,
  p.id,
  coalesce(nullif(btrim(p.full_name), ''), 'Motorista'),
  nullif(btrim(p.cpf), ''),
  'BR',
  'BR',
  'pending',
  true,
  false
from public.profiles p
join public.user_roles ur
  on ur.user_id = p.id
 and ur.role = 'driver'::public.app_role
left join public.drivers d
  on d.profile_id = p.id
where d.id is null
on conflict (profile_id) do nothing;


-- ----------------------------------------------------------------------------
-- 5. Fluxos de vinculo cientes de motorista independente
-- ----------------------------------------------------------------------------
-- Tres guardas assumiam que "existe linha em drivers com meu profile_id"
-- significava "estou vinculado a uma transportadora". Com motorista
-- independente tendo linha desde o cadastro, o predicado correto passa a ser
-- "carrier_id is not null". Sem isso, o motorista independente ficaria preso:
-- nao conseguiria pedir vinculo, aceitar convite, nem ser aprovado.
--
-- As funcoes abaixo sao copias verbatim de 20260813220000 com os patches
-- marcados. Nenhuma outra linha foi alterada.

-- 5.1 request_driver_carrier_link — guarda passa a exigir carrier_id not null
create or replace function public.request_driver_carrier_link(
  p_carrier_id uuid,
  p_license_number text,
  p_license_country text default 'BR',
  p_license_category text default null,
  p_license_expiry date default null,
  p_cpf text default null,
  p_message text default null
)
returns table (
  request_id uuid,
  request_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_created_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not public.has_role((select auth.uid()), 'driver'::public.app_role) then
    raise exception using errcode = '42501', message = 'Driver role required';
  end if;

  if exists (
    select 1 from public.drivers
    where profile_id = (select auth.uid())
      and carrier_id is not null
  ) then
    raise exception using errcode = '22023', message = 'Account is already linked to a carrier';
  end if;

  if not exists (select 1 from public.carriers where id = p_carrier_id and is_active is true) then
    raise exception using errcode = 'P0002', message = 'Carrier not found';
  end if;

  if char_length(coalesce(p_message, '')) > 500 then
    raise exception using errcode = '22023', message = 'Message is too long';
  end if;

  if public.normalize_identity_document(p_license_number) is null then
    raise exception using errcode = '22023', message = 'Driver license number is required';
  end if;

  if upper(p_license_country) !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Invalid license country';
  end if;

  if p_license_expiry is not null and p_license_expiry < current_date then
    raise exception using errcode = '22023', message = 'Driver license is expired';
  end if;

  insert into public.driver_carrier_requests (
    profile_id, carrier_id, submitted_cpf, submitted_license_number,
    submitted_license_country, submitted_license_category,
    submitted_license_expiry, message
  ) values (
    (select auth.uid()), p_carrier_id, nullif(btrim(p_cpf), ''),
    public.normalize_identity_document(p_license_number), upper(p_license_country),
    nullif(upper(btrim(p_license_category)), ''), p_license_expiry,
    nullif(btrim(p_message), '')
  )
  on conflict (profile_id, carrier_id) where status = 'pending'
  do update set
    submitted_cpf = excluded.submitted_cpf,
    submitted_license_number = excluded.submitted_license_number,
    submitted_license_country = excluded.submitted_license_country,
    submitted_license_category = excluded.submitted_license_category,
    submitted_license_expiry = excluded.submitted_license_expiry,
    message = excluded.message,
    updated_at = now()
  returning id, created_at into v_id, v_created_at;

  return query select v_id, 'pending'::text, v_created_at;
end;
$$;
-- 5.2 accept_driver_invitation — distingue vinculado x independente
create or replace function public.accept_driver_invitation(
  p_token text,
  p_cpf text,
  p_license_number text,
  p_license_country text default 'BR'
)
returns table (
  driver_id uuid,
  carrier_id uuid,
  linked_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_invitation public.driver_carrier_invitations%rowtype;
  v_profile public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not public.has_role((select auth.uid()), 'driver'::public.app_role) then
    raise exception using errcode = '42501', message = 'Driver role required';
  end if;

  select * into v_invitation
  from public.driver_carrier_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found';
  end if;

  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    if v_invitation.status = 'pending' and v_invitation.expires_at <= now() then
      update public.driver_carrier_invitations
      set status = 'expired', updated_at = now()
      where id = v_invitation.id;
    end if;
    raise exception using errcode = '22023', message = 'Invitation is no longer valid';
  end if;

  select * into v_profile from public.profiles where id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  if v_invitation.invited_email is not null
     and lower(coalesce(v_profile.email, '')) <> v_invitation.invited_email then
    raise exception using errcode = '42501', message = 'Invitation email does not match the signed-in account';
  end if;

  if v_invitation.invited_email is null
     and v_invitation.invited_phone is not null
     and regexp_replace(coalesce(v_profile.phone, ''), '[^0-9+]', '', 'g')
         <> v_invitation.invited_phone then
    raise exception using errcode = '42501', message = 'Invitation phone does not match the signed-in account';
  end if;

  if v_invitation.expected_cpf_hash is not null
     and encode(
       extensions.digest(public.normalize_identity_document(p_cpf), 'sha256'),
       'hex'
     ) <> v_invitation.expected_cpf_hash then
    raise exception using errcode = '42501', message = 'CPF does not match the invited driver';
  end if;

  if v_invitation.expected_license_hash is not null
     and (
       upper(p_license_country) <> v_invitation.expected_license_country
       or encode(
         extensions.digest(public.normalize_identity_document(p_license_number), 'sha256'),
         'hex'
       ) <> v_invitation.expected_license_hash
     ) then
    raise exception using errcode = '42501', message = 'Driver license does not match the invitation';
  end if;

  if exists (
    select 1 from public.drivers d
    where d.profile_id = (select auth.uid())
      and d.id <> v_invitation.driver_id
      and d.carrier_id is not null
  ) then
    raise exception using errcode = '23505', message = 'Account is already linked to another driver record';
  end if;

  if exists (
    select 1 from public.drivers d
    where d.profile_id = (select auth.uid())
      and d.id <> v_invitation.driver_id
      and d.carrier_id is null
  ) then
    raise exception using errcode = '22023',
      message = 'Independent driver record already exists for this account; use the carrier link request flow';
  end if;

  update public.drivers
  set profile_id = (select auth.uid()),
      cpf = coalesce(cpf, nullif(btrim(p_cpf), '')),
      license_number = coalesce(license_number, public.normalize_identity_document(p_license_number)),
      license_issuer_country = upper(p_license_country),
      updated_at = now()
  where id = v_invitation.driver_id and profile_id is null;

  if not found then
    raise exception using errcode = '23505', message = 'Driver was linked by another request';
  end if;

  update public.driver_carrier_invitations
  set status = 'accepted', accepted_by = (select auth.uid()),
      accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  update public.driver_carrier_requests
  set status = 'cancelled', updated_at = now()
  where profile_id = (select auth.uid()) and status = 'pending';

  return query select v_invitation.driver_id, v_invitation.carrier_id, now();
end;
$$;
-- 5.3 review_driver_carrier_request — ADOTA a linha independente (preserva drivers.id)
create or replace function public.review_driver_carrier_request(
  p_request_id uuid,
  p_decision text,
  p_driver_id uuid default null,
  p_rejection_reason text default null
)
returns table (
  request_id uuid,
  request_status text,
  driver_id uuid,
  profile_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request public.driver_carrier_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_driver public.drivers%rowtype;
  v_driver_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Decision must be approved or rejected';
  end if;

  select * into v_request
  from public.driver_carrier_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Request not found';
  end if;

  if not public.can_manage_capacity(v_request.carrier_id, null) then
    raise exception using errcode = '42501', message = 'Not authorized to review this request';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Request was already reviewed';
  end if;

  if p_decision = 'rejected' then
    update public.driver_carrier_requests
    set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now(),
        rejection_reason = nullif(btrim(p_rejection_reason), ''), updated_at = now()
    where id = v_request.id;

    return query select v_request.id, 'rejected'::text, null::uuid, v_request.profile_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request.profile_id::text, 11));

  if exists (
    select 1 from public.drivers
    where profile_id = v_request.profile_id
      and carrier_id is not null
  ) then
    raise exception using errcode = '23505', message = 'Driver account was already linked to a carrier';
  end if;

  select * into v_profile from public.profiles where id = v_request.profile_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  -- (1) Adocao: linha independente do proprio motorista (carrier_id null).
  if p_driver_id is null then
    select d.id into p_driver_id
    from public.drivers d
    where d.profile_id = v_request.profile_id
      and d.carrier_id is null
    limit 1;
  end if;

  -- (2) Fallback: linha pre-cadastrada pela transportadora, ainda sem conta.
  if p_driver_id is null then
    select d.id into p_driver_id
    from public.drivers d
    where d.carrier_id = v_request.carrier_id
      and d.profile_id is null
      and d.license_issuer_country = v_request.submitted_license_country
      and public.normalize_identity_document(d.license_number)
          = public.normalize_identity_document(v_request.submitted_license_number)
    limit 1;
  end if;

  if p_driver_id is not null then
    select * into v_driver from public.drivers where id = p_driver_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Driver record not found';
    end if;

    if v_driver.carrier_id is not null and v_driver.carrier_id <> v_request.carrier_id then
      raise exception using errcode = '22023', message = 'Driver record does not belong to this carrier';
    end if;

    if v_driver.profile_id is not null and v_driver.profile_id <> v_request.profile_id then
      raise exception using errcode = '23505', message = 'Driver record is already linked';
    end if;

    update public.drivers
    set carrier_id = v_request.carrier_id,
        profile_id = v_request.profile_id,
        cpf = coalesce(cpf, v_request.submitted_cpf, v_profile.cpf),
        license_number = coalesce(license_number, v_request.submitted_license_number),
        license_issuer_country = v_request.submitted_license_country,
        license_category = coalesce(license_category, v_request.submitted_license_category),
        license_expiry = coalesce(license_expiry, v_request.submitted_license_expiry),
        license_verification_status = 'under_review',
        updated_at = now()
    where id = v_driver.id;
    v_driver_id := v_driver.id;
  else
    insert into public.drivers (
      carrier_id, profile_id, full_name, cpf, country_code,
      license_number, license_issuer_country, license_category, license_expiry,
      license_verification_status, is_active, is_verified
    ) values (
      v_request.carrier_id,
      v_request.profile_id,
      coalesce(nullif(btrim(v_profile.full_name), ''), 'Motorista'),
      coalesce(nullif(btrim(v_request.submitted_cpf), ''), nullif(btrim(v_profile.cpf), '')),
      v_request.submitted_license_country,
      v_request.submitted_license_number,
      v_request.submitted_license_country,
      v_request.submitted_license_category,
      v_request.submitted_license_expiry,
      'under_review',
      true,
      false
    ) returning id into v_driver_id;
  end if;

  update public.driver_carrier_requests
  set status = case when id = v_request.id then 'approved' else 'cancelled' end,
      reviewed_by = case when id = v_request.id then (select auth.uid()) else reviewed_by end,
      reviewed_at = case when id = v_request.id then now() else reviewed_at end,
      proposed_driver_id = case when id = v_request.id then v_driver_id else proposed_driver_id end,
      updated_at = now()
  where profile_id = v_request.profile_id and status = 'pending';

  update public.driver_carrier_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where driver_id = v_driver_id and status = 'pending';

  return query select v_request.id, 'approved'::text, v_driver_id, v_request.profile_id;
end;
$$;