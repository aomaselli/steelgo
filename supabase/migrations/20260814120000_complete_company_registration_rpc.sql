begin;

create or replace function public.complete_company_registration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role;
  v_pending jsonb;
  v_company_id uuid;
  v_company_record public.companies%rowtype;
  v_has_member boolean;
  v_legal_name text;
  v_trade_name text;
  v_cnpj_digits text;
  v_type text;
  v_state text;
  v_antt text;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária para concluir o cadastro da empresa.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select role
    into v_role
  from public.user_roles
  where user_id = v_user_id
  order by created_at asc
  limit 1;

  if v_role is null or v_role not in ('shipper', 'carrier') then
    raise exception 'Apenas usuários com papel shipper ou carrier podem concluir cadastro empresarial.';
  end if;

  v_pending := nullif((auth.jwt() -> 'user_metadata' -> 'pending_company')::text, '')::jsonb;

  if v_pending is null then
    select jsonb_build_object(
      'legal_name', c.name,
      'trade_name', c.trade_name,
      'cnpj', c.cnpj,
      'type', c.type,
      'state', c.address_state,
      'antt', coalesce(car.antt_rntrc, '')
    )
      into v_pending
    from public.companies c
    left join public.carriers car on car.company_id = c.id
    where c.owner_id = v_user_id
    limit 1;
  end if;

  if v_pending is null or jsonb_typeof(v_pending) <> 'object' then
    raise exception 'pending_company inválido: o payload deve ser um objeto JSON.';
  end if;

  v_legal_name := nullif(trim(v_pending->>'legal_name'), '');
  if v_legal_name is null or length(v_legal_name) < 2 or length(v_legal_name) > 200 then
    raise exception 'pending_company.legal_name inválido: informe uma razão social com 2 a 200 caracteres.';
  end if;

  v_trade_name := nullif(trim(v_pending->>'trade_name'), '');
  if v_trade_name is not null and (length(v_trade_name) < 2 or length(v_trade_name) > 200) then
    raise exception 'pending_company.trade_name inválido: use até 200 caracteres.';
  end if;

  v_cnpj_digits := regexp_replace(coalesce(v_pending->>'cnpj', ''), '\D', '', 'g');
  if length(v_cnpj_digits) <> 14 or v_cnpj_digits !~ '^[0-9]{14}$' then
    raise exception 'pending_company.cnpj inválido: envie somente dígitos e 14 caracteres.';
  end if;

  v_state := coalesce(v_pending->>'state', '');
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'pending_company.state inválido: use exatamente 2 letras maiúsculas (ex.: SP).';
  end if;

  v_type := nullif(trim(v_pending->>'type'), '');
  if v_type is null then
    raise exception 'pending_company.type obrigatório.';
  end if;
  if length(v_type) > 50 then
    raise exception 'pending_company.type inválido: excede 50 caracteres.';
  end if;
  if v_type not in ('siderurgica', 'distribuidora', 'industria', 'transportadora') then
    raise exception 'pending_company.type inválido: valores aceitos são siderurgica, distribuidora, industria ou transportadora.';
  end if;

  if v_role = 'carrier' then
    v_antt := nullif(trim(v_pending->>'antt'), '');
    if v_antt is not null and (length(v_antt) > 50 or v_antt !~ '^[A-Za-z0-9/-]+$') then
      raise exception 'pending_company.antt inválido: use até 50 caracteres alfanuméricos e hífen/barra.';
    end if;
  end if;

  select c.id
    into v_company_id
  from public.companies c
  where c.owner_id = v_user_id
  limit 1;

  if v_company_id is null then
    insert into public.companies (
      owner_id,
      name,
      trade_name,
      cnpj,
      type,
      address_state
    )
    values (
      v_user_id,
      v_legal_name,
      v_trade_name,
      v_cnpj_digits,
      v_type,
      v_state
    )
    returning id into v_company_id;
  else
    update public.companies
    set
      name = v_legal_name,
      trade_name = v_trade_name,
      cnpj = v_cnpj_digits,
      type = v_type,
      address_state = v_state
    where id = v_company_id
      and owner_id = v_user_id;
  end if;

  select * into v_company_record
  from public.companies
  where id = v_company_id;

  if v_company_record.owner_id <> v_user_id then
    raise exception 'Empresa não pertence ao usuário autenticado.';
  end if;

  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = v_company_id
      and cm.user_id = v_user_id
  ) into v_has_member;

  if not v_has_member then
    insert into public.company_members (company_id, user_id, member_role)
    values (v_company_id, v_user_id, 'owner')
    on conflict (company_id, user_id) do nothing;
  end if;

  if v_role = 'carrier' then
    if not exists (select 1 from public.carriers where company_id = v_company_id) then
      insert into public.carriers (company_id, antt_rntrc, is_active)
      values (v_company_id, v_antt, true);
    else
      update public.carriers
      set antt_rntrc = coalesce(antt_rntrc, v_antt)
      where company_id = v_company_id;
    end if;
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'owner_id', v_user_id,
    'role', v_role
  );
end;
$$;

revoke all on function public.complete_company_registration() from public;
revoke all on function public.complete_company_registration() from anon;
grant execute on function public.complete_company_registration() to authenticated;

commit;
