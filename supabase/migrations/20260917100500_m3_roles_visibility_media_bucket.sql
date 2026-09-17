-- =============================================================================
-- MODULO 3 - 73/81: papeis operacionais, visibilidade, bucket trip-media
--   * company_members: estrutura da delegacao operacional limitada (alternativa B).
--     operator/viewer valem SOMENTE para as RPCs do M3 (helpers proprios; nenhuma
--     funcao financeira/contratual/disputa os usa - auditado na 81);
--   * trip_role_of / trip_visible: autorizacao pelo vinculo real;
--   * bucket privado trip-media (10 MB; jpeg/png/pdf), paths <trip>/<command>/...;
--     INSERT so por vinculado; SELECT so apos acesso auditado (request_trip_media_access);
--     sem UPDATE/DELETE; assert_trip_media valida objeto, dono, MIME, tamanho e hash.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. company_members: delegacao operacional (estrutura; RPCs na 81)
-- -----------------------------------------------------------------------------
-- member_role permanece text (policies legadas de company-docs dependem da coluna):
--   owner  = linha criada no registro da empresa (redundante com companies.owner_id;
--            so vale como owner se companies.owner_id confirmar);
--   operator / viewer = delegacao operacional limitada (M3).
update public.company_members set member_role = 'viewer' where member_role not in ('owner', 'operator', 'viewer');
alter table public.company_members
  alter column member_role set default 'viewer',
  alter column member_role set not null,
  add constraint company_members_role_check check (member_role in ('owner', 'operator', 'viewer')),
  add column status text not null default 'active' check (status in ('invited', 'active', 'revoked')),
  add column invited_email text,
  add column invite_token_hash text,
  add column invite_expires_at timestamptz,
  add column invited_by uuid references auth.users(id) on delete restrict,
  add column invited_at timestamptz,
  add column accepted_at timestamptz,
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id),
  add column revoke_reason text,
  add column updated_at timestamptz not null default now(),
  alter column user_id drop not null;
alter table public.company_members
  add constraint company_members_status_coherent check (
    (status = 'revoked') = (revoked_at is not null)
    and (status <> 'active' or user_id is not null)
    and (status <> 'invited' or invite_token_hash is not null));
create unique index company_members_one_active_per_user on public.company_members (company_id, user_id)
  where status <> 'revoked' and user_id is not null;
create unique index company_members_invite_token on public.company_members (invite_token_hash) where invite_token_hash is not null;

-- DML direto revogado; leitura direta mantida so ao proprio membro/owner/admin (policy existente)
revoke insert, update, delete, truncate on public.company_members from public, anon, authenticated, service_role;
drop policy if exists company_members_insert_owner on public.company_members;

create function public.company_operational_role(p_company_id uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  select case
    when public.is_current_user_company_owner(p_company_id) then 'owner'
    else (select cm.member_role from public.company_members cm
           where cm.company_id = p_company_id and cm.user_id = (select auth.uid()) and cm.status = 'active'
             and cm.member_role in ('operator', 'viewer')
           limit 1)
  end;
$fn$;
create function public.is_company_operator(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.company_operational_role(p_company_id) in ('owner', 'operator');
$fn$;
create function public.is_company_viewer(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.company_operational_role(p_company_id) in ('owner', 'operator', 'viewer');
$fn$;
revoke all on function public.company_operational_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_company_operator(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_company_viewer(uuid) from public, anon, authenticated, service_role;
-- is_company_viewer participa de policy RLS (trucks, 80): a expressao roda como o papel consultante
grant execute on function public.is_company_viewer(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. papel do chamador numa viagem
--    retorna: admin | shipper_owner | shipper_operator | shipper_viewer |
--             carrier_owner | carrier_operator | carrier_viewer | driver | null
-- -----------------------------------------------------------------------------
create function public.trip_role_of(p_trip_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_t public.operational_trips%rowtype;
  v_r text;
begin
  if v_actor is null or p_trip_id is null then return null; end if;
  if public.has_role(v_actor, 'admin'::public.app_role) then return 'admin'; end if;
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  if not found then return null; end if;
  v_r := public.company_operational_role(v_t.carrier_company_id);
  if v_r is not null then return 'carrier_' || v_r; end if;
  v_r := public.company_operational_role(v_t.shipper_company_id);
  if v_r is not null then return 'shipper_' || v_r; end if;
  if exists (select 1 from public.trip_assignments a
              where a.trip_id = p_trip_id and a.driver_profile_id = v_actor
                and a.state in ('offered', 'accepted')) then
    return 'driver';
  end if;
  return null;
end $fn$;
revoke all on function public.trip_role_of(uuid) from public, anon, authenticated, service_role;

create function public.trip_visible(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.trip_role_of(p_trip_id) is not null;
$fn$;
revoke all on function public.trip_visible(uuid) from public, anon, authenticated, service_role;

-- assignment vivo do motorista autenticado na viagem (ou nulo)
create function public.trip_live_assignment_of_caller(p_trip_id uuid)
returns public.trip_assignments language sql stable security definer set search_path = '' as $fn$
  select a from public.trip_assignments a
   where a.trip_id = p_trip_id and a.driver_profile_id = (select auth.uid())
     and a.state in ('offered', 'accepted')
   limit 1;
$fn$;
revoke all on function public.trip_live_assignment_of_caller(uuid) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. bucket trip-media
--    path: <trip_id>/<command_id>/<kind>-<UTC>-<uuid>-<sha16>.<ext>
--    kind: photo | signature | document | evidence | receiver_id
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-media', 'trip-media', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']);

create function public.trip_upload_allowed(p_trip text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_t public.operational_trips%rowtype;
begin
  if v_actor is null or p_trip is null
     or p_trip !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_role := public.trip_role_of(p_trip::uuid);
  if v_role is null or v_role in ('shipper_viewer', 'carrier_viewer') then
    return false;
  end if;
  select * into v_t from public.operational_trips t where t.id = p_trip::uuid;
  return v_t.status not in ('completed', 'cancelled');
end $fn$;

-- SELECT no bucket exige acesso registrado nos ultimos 2 minutos pela RPC
-- request_trip_media_access (trilha obrigatoria; sem ela a URL assinada nao nasce)
create function public.trip_object_visible(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_name is null then return false; end if;
  return exists (
    select 1 from public.trip_access_log l
     where l.actor_id = v_actor and l.what = 'media' and l.object_ref = p_name
       and l.at > now() - interval '2 minutes');
end $fn$;
revoke all on function public.trip_upload_allowed(text) from public, anon, authenticated, service_role;
revoke all on function public.trip_object_visible(text) from public, anon, authenticated, service_role;
grant execute on function public.trip_upload_allowed(text) to authenticated, service_role;
grant execute on function public.trip_object_visible(text) to authenticated, service_role;

create policy trip_media_insert_linked on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trip-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(photo|signature|document|evidence|receiver_id)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$'
    and public.trip_upload_allowed((storage.foldername(name))[1])
  );
create policy trip_media_select_audited on storage.objects
  for select to authenticated
  using (bucket_id = 'trip-media' and public.trip_object_visible(name));

-- -----------------------------------------------------------------------------
-- 4. assert_trip_media: objeto existe, pertence a viagem/comando, dono = chamador,
--    MIME/tamanho no limite, sufixo do path coerente com o sha-256 declarado.
-- -----------------------------------------------------------------------------
create function public.assert_trip_media(
  p_trip_id uuid, p_command_id uuid, p_kind text, p_object_path text, p_sha256 text,
  p_uploader uuid, p_min_bytes bigint default 1024)
returns table (size_bytes bigint, mime text, etag text)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_o record;
  v_size bigint; v_mime text; v_etag text;
  v_prefix text := p_trip_id::text || '/' || p_command_id::text || '/' || p_kind || '-';
begin
  if p_object_path is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'assert_trip_media: caminho ou hash ausente/invalido';
  end if;
  if position(v_prefix in p_object_path) <> 1 then
    raise exception using errcode = '22023',
      message = format('assert_trip_media: caminho nao pertence ao comando (%s)', p_kind);
  end if;
  if p_object_path !~ ('-' || substr(p_sha256, 1, 16) || '\.(pdf|jpg|jpeg|png)$') then
    raise exception using errcode = '22023', message = 'assert_trip_media: sufixo do caminho nao confere com o hash';
  end if;
  select o.metadata, o.owner_id, o.owner into v_o
    from storage.objects o where o.bucket_id = 'trip-media' and o.name = p_object_path;
  if not found then
    raise exception using errcode = '22023', message = 'assert_trip_media: objeto inexistente no bucket trip-media';
  end if;
  if coalesce(v_o.owner_id, v_o.owner::text) is distinct from p_uploader::text then
    raise exception using errcode = '22023', message = 'assert_trip_media: objeto enviado por outro usuario';
  end if;
  v_size := (v_o.metadata ->> 'size')::bigint;
  v_mime := v_o.metadata ->> 'mimetype';
  v_etag := v_o.metadata ->> 'eTag';
  if v_size is null or v_size < p_min_bytes or v_size > 10485760 then
    raise exception using errcode = '22023', message = format('assert_trip_media: tamanho invalido (%s bytes)', v_size);
  end if;
  if v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception using errcode = '22023', message = format('assert_trip_media: MIME nao permitido (%s)', v_mime);
  end if;
  if p_kind in ('photo', 'signature') and v_mime = 'application/pdf' then
    raise exception using errcode = '22023', message = 'assert_trip_media: foto/assinatura deve ser imagem';
  end if;
  return query select v_size, v_mime, v_etag;
end $fn$;
revoke all on function public.assert_trip_media(uuid, uuid, text, text, text, uuid, bigint) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. request_trip_media_access: RPC publica. Valida visibilidade do objeto
--    (viagem visivel ao chamador; POD/assinatura/receiver_id so partes+admin) e
--    grava trip_access_log. Depois disso o cliente pode pedir URL assinada
--    (max. 120 s) ao Storage - a policy SELECT exige registro de acesso nos ultimos 2 min.
-- -----------------------------------------------------------------------------
create function public.request_trip_media_access(p_object_path text)
returns table (granted boolean, expires_in_seconds integer)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_trip uuid; v_kind text; v_role text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'request_trip_media_access: sessao obrigatoria';
  end if;
  if p_object_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(photo|signature|document|evidence|receiver_id)-' then
    raise exception using errcode = '22023', message = 'request_trip_media_access: caminho invalido';
  end if;
  v_trip := split_part(p_object_path, '/', 1)::uuid;
  v_kind := split_part(split_part(p_object_path, '/', 3), '-', 1);
  v_role := public.trip_role_of(v_trip);
  if v_role is null then
    raise exception using errcode = '42501', message = 'request_trip_media_access: viagem nao visivel';
  end if;
  if v_kind = 'receiver_id' and v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'request_trip_media_access: documento do recebedor e restrito';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'trip-media' and o.name = p_object_path) then
    raise exception using errcode = 'P0002', message = 'request_trip_media_access: objeto inexistente';
  end if;
  perform public.trip_access_append(v_trip, v_actor,
    case when v_role = 'admin' then 'admin'::public.trip_actor_kind
         when v_role like 'carrier_%' then 'carrier'::public.trip_actor_kind
         when v_role like 'shipper_%' then 'shipper'::public.trip_actor_kind
         else 'driver'::public.trip_actor_kind end,
    'media', p_object_path, 'request_trip_media_access');
  return query select true, 120;
end $fn$;
revoke all on function public.request_trip_media_access(text) from public, anon, authenticated, service_role;
grant execute on function public.request_trip_media_access(text) to authenticated, service_role;

commit;
