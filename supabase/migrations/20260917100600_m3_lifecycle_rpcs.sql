-- =============================================================================
-- MODULO 3 - 74/81: ciclo de vida da viagem
--   RPCs publicas: create_trip_for_contract, assign_trip, reassign_trip,
--     respond_trip_assignment, start_tracking_session, transition_trip,
--     cancel_trip (SO antes de loading), pause_trip, resume_trip,
--     force_trip_transition (admin), resolve_cargo_disposition (admin).
--   Helpers postgres-only: trip_lock, trip_policy, trip_actor_kind_of, notify_trip,
--     trip_release_capacity, trip_end_tracking_sessions, trip_create_core,
--     trip_assign_core, trips_follow_contract_status (trigger em contracts),
--     trips_follow_contract_completed (chamado por try_complete_contract v3).
--   Ordem de locks: contracts -> ... -> operational_trips -> trip_assignments -> trip_exceptions.
--   Nenhuma funcao aqui referencia payment_* (auditado na 81).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- helpers
-- -----------------------------------------------------------------------------
create function public.trip_lock(p_trip_id uuid)
returns public.operational_trips language plpgsql security definer set search_path = '' as $fn$
declare v public.operational_trips%rowtype;
begin
  select * into v from public.operational_trips t where t.id = p_trip_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'viagem inexistente';
  end if;
  return v;
end $fn$;

create function public.trip_policy(p_trip public.operational_trips)
returns public.operational_policies language sql stable security definer set search_path = '' as $fn$
  select public.operational_policy_version(p_trip.policy_version);
$fn$;

create function public.trip_actor_kind_of(p_role text)
returns public.trip_actor_kind language sql immutable set search_path = '' as $fn$
  select case when p_role = 'admin' then 'admin'::public.trip_actor_kind
              when p_role like 'carrier_%' then 'carrier'::public.trip_actor_kind
              when p_role like 'shipper_%' then 'shipper'::public.trip_actor_kind
              when p_role = 'driver' then 'driver'::public.trip_actor_kind
              else 'system'::public.trip_actor_kind end;
$fn$;

-- destinatarios: owner + operator/viewer ativos da empresa
create function public.company_operational_users(p_company_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $fn$
  select c.owner_id from public.companies c where c.id = p_company_id and c.owner_id is not null
  union
  select cm.user_id from public.company_members cm
   where cm.company_id = p_company_id and cm.status = 'active' and cm.user_id is not null
     and cm.member_role in ('operator', 'viewer');
$fn$;

-- notificacao in-app (push e acrescentado na 78 via create or replace)
create function public.notify_trip(
  p_trip_id uuid, p_type text, p_title text, p_body text,
  p_to_shipper boolean, p_to_carrier boolean, p_to_driver boolean, p_to_admins boolean,
  p_exclude uuid default null, p_priority text default 'normal')
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  v_t public.operational_trips%rowtype;
  v_u uuid; v_n integer := 0;
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  if not found then return 0; end if;
  if p_to_shipper then
    for v_u in select * from public.company_operational_users(v_t.shipper_company_id) loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/shipper/trips/' || p_trip_id::text, null, v_t.contract_id);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  if p_to_carrier then
    for v_u in select * from public.company_operational_users(v_t.carrier_company_id) loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/carrier/trips/' || p_trip_id::text, null, v_t.contract_id);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  if p_to_driver then
    for v_u in select a.driver_profile_id from public.trip_assignments a
                where a.trip_id = p_trip_id and a.state in ('offered', 'accepted') loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/driver', null, v_t.contract_id);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  if p_to_admins then
    for v_u in select ur.user_id from public.user_roles ur where ur.role = 'admin'::public.app_role loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/admin/operations/' || p_trip_id::text, null, v_t.contract_id);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  return v_n;
end $fn$;

create function public.trip_release_capacity(p_trip_id uuid)
returns void language sql security definer set search_path = '' as $fn$
  update public.capacity_availability ca
     set status = 'available', reserved_by_trip_id = null, updated_at = now()
   where ca.reserved_by_trip_id = p_trip_id and ca.status = 'reserved';
$fn$;

create function public.trip_reserve_capacity(p_trip_id uuid, p_driver_id uuid, p_truck_id uuid)
returns void language sql security definer set search_path = '' as $fn$
  update public.capacity_availability ca
     set status = 'reserved', reserved_by_trip_id = p_trip_id, updated_at = now()
   where (ca.driver_id = p_driver_id or ca.truck_id = p_truck_id)
     and ca.status = 'available' and ca.reserved_by_trip_id is null;
$fn$;

create function public.trip_end_tracking_sessions(p_trip_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare v_n integer;
begin
  update public.trip_tracking_sessions s set ended_at = now(), end_reason = p_reason
   where s.trip_id = p_trip_id and s.ended_at is null;
  get diagnostics v_n = row_count;
  update public.operational_trips t set tracking_state = 'off' where t.id = p_trip_id and t.tracking_state <> 'off';
  return v_n;
end $fn$;

-- rotulo operacional do motorista: "Joao S." (nunca nome completo em listas frias)
create function public.driver_label(p_full_name text)
returns text language sql immutable set search_path = '' as $fn$
  select case when p_full_name is null or btrim(p_full_name) = '' then 'Motorista'
    else split_part(btrim(p_full_name), ' ', 1) ||
         case when position(' ' in btrim(p_full_name)) > 0
              then ' ' || left(regexp_replace(btrim(p_full_name), '^\S+\s+', ''), 1) || '.'
              else '' end end;
$fn$;

-- -----------------------------------------------------------------------------
-- trip_create_core: cria a tentativa N+1 (chamado por RPC e pelo trigger de contrato)
-- Exige contrato ja travado pelo chamador quando via RPC (ordem de locks).
-- -----------------------------------------------------------------------------
create function public.trip_create_core(
  p_contract_id uuid, p_actor uuid, p_actor_kind public.trip_actor_kind, p_rpc text,
  p_request_id uuid, p_fp text)
returns public.operational_trips language plpgsql security definer set search_path = '' as $fn$
declare
  v_c public.contracts%rowtype;
  v_f public.freights%rowtype;
  v_pol public.operational_policies%rowtype := public.current_operational_policy();
  v_t public.operational_trips%rowtype;
  v_attempt integer;
  v_ev uuid;
  v_dist numeric;
begin
  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then
    raise exception using errcode = 'P0002', message = format('%s: contrato inexistente', p_rpc);
  end if;
  select * into v_f from public.freights f where f.id = v_c.freight_id;
  select coalesce(max(t.attempt_number), 0) + 1 into v_attempt from public.operational_trips t where t.contract_id = p_contract_id;
  if v_f.origin_geog is not null and v_f.destination_geog is not null then
    v_dist := round((extensions.ST_Distance(v_f.origin_geog, v_f.destination_geog) / 1000.0)::numeric, 1);
  end if;
  insert into public.operational_trips (
    contract_id, freight_id, shipper_company_id, carrier_company_id, attempt_number, trip_number,
    status, policy_version, planned_pickup_at, planned_delivery_at, pickup_geog, delivery_geog,
    planned_distance_km, created_by)
  values (
    p_contract_id, v_c.freight_id, v_c.shipper_company_id, v_c.carrier_company_id, v_attempt,
    coalesce(v_c.contract_number, 'SG-' || left(p_contract_id::text, 8)) || '-V' || v_attempt::text,
    'planned', v_pol.version,
    case when v_f.pickup_date is not null then v_f.pickup_date::timestamptz end,
    case when v_f.delivery_date is not null then (v_f.delivery_date::timestamptz + interval '1 day' - interval '1 second') end,
    v_f.origin_geog, v_f.destination_geog, coalesce(v_f.distance_km, v_dist), p_actor)
  returning * into v_t;

  if v_f.origin_geog is not null then
    insert into public.trip_geofences (trip_id, kind, center_geog, radius_m, source, created_by)
    values (v_t.id, 'pickup', v_f.origin_geog, v_pol.geofence_radius_m, 'freight', p_actor);
  end if;
  if v_f.destination_geog is not null then
    insert into public.trip_geofences (trip_id, kind, center_geog, radius_m, source, created_by)
    values (v_t.id, 'delivery', v_f.destination_geog, v_pol.geofence_radius_m, 'freight', p_actor);
  end if;

  v_ev := public.trip_event_append(v_t.id, 'trip_created', p_actor, p_actor_kind, p_rpc,
            null, null, format('Tentativa %s criada para o contrato %s.', v_attempt, v_c.contract_number),
            jsonb_build_object('attempt_number', v_attempt), p_request_id => p_request_id, p_fingerprint => p_fp);
  perform public.trip_event_append(v_t.id, 'policy_frozen', p_actor, p_actor_kind, p_rpc,
            null, null, format('Politica operacional v%s congelada.', v_pol.version),
            to_jsonb(v_pol) - 'id' - 'created_by' - 'request_id', p_request_id => p_request_id, p_fingerprint => p_fp);
  perform public.notify_trip(v_t.id, 'trip_created', format('Viagem %s criada', v_t.trip_number),
            'A execucao do contrato foi aberta. Designe motorista e veiculo.', false, true, false, false);
  select * into v_t from public.operational_trips t where t.id = v_t.id;
  return v_t;
end $fn$;

-- -----------------------------------------------------------------------------
-- trip_assign_core: atribuicao/reatribuicao (chamado por assign_trip/reassign_trip
-- e pela criacao automatica quando o lance ja nomeava motorista/veiculo validos)
-- -----------------------------------------------------------------------------
create function public.trip_assign_core(
  p_trip public.operational_trips, p_driver_id uuid, p_truck_id uuid, p_actor uuid,
  p_actor_kind public.trip_actor_kind, p_rpc text, p_request_id uuid, p_fp text, p_note text,
  p_is_reassignment boolean)
returns public.trip_assignments language plpgsql security definer set search_path = '' as $fn$
declare
  v_d public.drivers%rowtype;
  v_k public.trucks%rowtype;
  v_ca public.carriers%rowtype;
  v_old public.trip_assignments%rowtype;
  v_a public.trip_assignments%rowtype;
  v_ev uuid;
begin
  select * into v_d from public.drivers d where d.id = p_driver_id;
  if not found then
    raise exception using errcode = 'P0002', message = format('%s: motorista (drivers.id) inexistente', p_rpc);
  end if;
  if v_d.profile_id is null then
    raise exception using errcode = '22023', message = format('%s: motorista sem perfil de autenticacao vinculado', p_rpc);
  end if;
  select * into v_k from public.trucks k where k.id = p_truck_id;
  if not found then
    raise exception using errcode = 'P0002', message = format('%s: veiculo inexistente', p_rpc);
  end if;
  select * into v_ca from public.carriers c where c.id = v_d.carrier_id;
  if not found or v_ca.company_id is distinct from p_trip.carrier_company_id then
    raise exception using errcode = '42501', message = format('%s: motorista nao pertence a transportadora do contrato', p_rpc);
  end if;
  if v_k.carrier_id is distinct from v_ca.id then
    raise exception using errcode = '42501', message = format('%s: veiculo nao pertence a transportadora do contrato', p_rpc);
  end if;

  select * into v_old from public.trip_assignments a where a.trip_id = p_trip.id and a.state in ('offered', 'accepted') for update;
  if found then
    if not p_is_reassignment then
      raise exception using errcode = '23505', message = format('%s: a viagem ja tem vinculo vivo; use reassign_trip', p_rpc);
    end if;
    if v_old.driver_id = p_driver_id and v_old.truck_id = p_truck_id then
      raise exception using errcode = '22023', message = format('%s: mesmo motorista e veiculo ja vinculados', p_rpc);
    end if;
  elsif p_is_reassignment then
    raise exception using errcode = '22023', message = format('%s: nao ha vinculo vivo a substituir; use assign_trip', p_rpc);
  end if;

  if v_old.id is not null then
    -- fecha o vinculo anterior ANTES de abrir o novo (indice parcial: um vinculo vivo por viagem)
    update public.trip_assignments a
       set state = 'superseded', revoked_at = now(), revoke_reason = coalesce(p_note, 'Reatribuicao')
     where a.id = v_old.id;
    perform public.trip_end_tracking_sessions(p_trip.id, 'reassigned');
    perform public.trip_release_capacity(p_trip.id);
  end if;

  insert into public.trip_assignments (
    trip_id, driver_id, driver_profile_id, truck_id, carrier_id_at_assignment, carrier_company_id_at_assignment,
    truck_plate_at_assignment, driver_label_at_assignment, state, assigned_by, assigned_by_kind, request_id, note)
  values (
    p_trip.id, v_d.id, v_d.profile_id, v_k.id, v_ca.id, v_ca.company_id, v_k.plate,
    public.driver_label(v_d.full_name), 'offered', p_actor, p_actor_kind, p_request_id, p_note)
  returning * into v_a;
  if v_old.id is not null then
    update public.trip_assignments a set superseded_by = v_a.id where a.id = v_old.id;
  end if;

  update public.operational_trips t set driver_id = v_d.id, truck_id = v_k.id where t.id = p_trip.id;

  -- contrato: driver_id (auth) = drivers.profile_id; truck_id. Unico caminho de escrita.
  perform set_config('steelgo.assign_context', p_trip.contract_id::text, true);
  update public.contracts c set driver_id = v_d.profile_id, truck_id = v_k.id where c.id = p_trip.contract_id;
  perform set_config('steelgo.assign_context', '', true);

  perform public.trip_reserve_capacity(p_trip.id, v_d.id, v_k.id);

  if p_is_reassignment then
    v_ev := public.trip_event_append(p_trip.id, 'reassigned', p_actor, p_actor_kind, p_rpc, null, null,
              coalesce(p_note, 'Motorista/veiculo substituidos.'),
              jsonb_build_object('assignment_id', v_a.id, 'previous_assignment_id', v_old.id,
                                 'driver_label', v_a.driver_label_at_assignment, 'truck_plate', v_k.plate),
              p_assignment_id => v_a.id, p_request_id => p_request_id, p_fingerprint => p_fp);
    if v_old.driver_profile_id is distinct from v_d.profile_id then
      perform public.notify_user(v_old.driver_profile_id, 'trip_assignment_revoked',
        format('Viagem %s: vinculo encerrado', p_trip.trip_number),
        'Voce foi desvinculado desta viagem pela transportadora/SteelGo.', '/driver', null, p_trip.contract_id);
    end if;
  else
    v_ev := public.trip_event_append(p_trip.id, 'assigned', p_actor, p_actor_kind, p_rpc, null, null,
              coalesce(p_note, 'Motorista e veiculo designados.'),
              jsonb_build_object('assignment_id', v_a.id, 'driver_label', v_a.driver_label_at_assignment, 'truck_plate', v_k.plate),
              p_assignment_id => v_a.id, p_request_id => p_request_id, p_fingerprint => p_fp);
    if p_trip.status = 'planned' then
      perform public.trip_event_append(p_trip.id, 'transition', p_actor, p_actor_kind, p_rpc, 'planned', 'assigned',
                'Viagem atribuida; aguardando aceite do motorista.', '{}'::jsonb,
                p_assignment_id => v_a.id, p_request_id => p_request_id, p_fingerprint => p_fp);
    end if;
  end if;
  perform public.notify_user(v_d.profile_id, 'trip_assignment_offered',
    format('Nova viagem %s', p_trip.trip_number), 'Voce foi designado para uma viagem. Abra o app para aceitar ou recusar.',
    '/driver', null, p_trip.contract_id);
  perform public.notify_trip(p_trip.id, 'trip_assigned', format('Viagem %s: motorista designado', p_trip.trip_number),
    format('Motorista %s, veiculo %s.', v_a.driver_label_at_assignment, coalesce(v_k.plate, '-')), true, false, false, false, p_actor);
  return v_a;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: create_trip_for_contract
-- -----------------------------------------------------------------------------
create function public.create_trip_for_contract(p_contract_id uuid, p_request_id uuid)
returns table (trip_id uuid, attempt_number integer, trip_number text, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype;
  v_kind public.trip_actor_kind; v_t public.operational_trips%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'create_trip_for_contract: sessao obrigatoria';
  end if;
  if p_contract_id is null then
    raise exception using errcode = '22004', message = 'create_trip_for_contract: p_contract_id e obrigatorio';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('contract_id', p_contract_id));
  v_log := public.rpc_idempotency_probe('create_trip_for_contract', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.contract_id = p_contract_id order by t.attempt_number desc limit 1;
    return query select v_t.id, v_t.attempt_number, v_t.trip_number, true;
    return;
  end if;
  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'create_trip_for_contract: contrato inexistente';
  end if;
  if public.has_role(v_actor, 'admin'::public.app_role) then
    v_kind := 'admin';
  elsif public.is_company_operator(v_c.carrier_company_id) then
    v_kind := 'carrier';
  else
    raise exception using errcode = '42501',
      message = 'create_trip_for_contract: somente transportadora (owner/operator) ou administrador';
  end if;
  if exists (select 1 from public.operational_trips t where t.contract_id = p_contract_id
              and t.status not in ('completed', 'cancelled', 'returned')) then
    raise exception using errcode = '23505', message = 'create_trip_for_contract: ja existe viagem viva para o contrato';
  end if;
  v_t := public.trip_create_core(p_contract_id, v_actor, v_kind, 'create_trip_for_contract', p_request_id, v_fp);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('create_trip_for_contract', p_request_id, v_actor, p_contract_id, v_fp, 'accepted', v_t.trip_number);
  return query select v_t.id, v_t.attempt_number, v_t.trip_number, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: assign_trip / reassign_trip
-- -----------------------------------------------------------------------------
create function public.assign_trip(p_trip_id uuid, p_driver_id uuid, p_truck_id uuid, p_note text, p_request_id uuid)
returns table (assignment_id uuid, trip_status public.trip_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text; v_kind public.trip_actor_kind;
  v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'assign_trip: sessao obrigatoria'; end if;
  if p_trip_id is null or p_driver_id is null or p_truck_id is null then
    raise exception using errcode = '22004', message = 'assign_trip: trip, motorista (drivers.id) e veiculo sao obrigatorios';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'driver', p_driver_id, 'truck', p_truck_id));
  v_log := public.rpc_idempotency_probe('assign_trip', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id;
    select * into v_a from public.trip_assignments a where a.trip_id = p_trip_id and a.request_id = p_request_id;
    return query select v_a.id, v_t.status, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null then raise exception using errcode = '42501', message = 'assign_trip: viagem nao visivel'; end if;
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator') then
    raise exception using errcode = '42501', message = 'assign_trip: somente transportadora (owner/operator) ou administrador';
  end if;
  v_kind := public.trip_actor_kind_of(v_role);
  perform 1 from public.contracts c where c.id = (select contract_id from public.operational_trips where id = p_trip_id) for update;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status <> 'planned' then
    raise exception using errcode = '22023', message = format('assign_trip: viagem em %s; atribuicao inicial so em planned', v_t.status);
  end if;
  if v_t.paused_by_contract then
    raise exception using errcode = '22023', message = 'assign_trip: viagem pausada pelo contrato (disputa)';
  end if;
  v_a := public.trip_assign_core(v_t, p_driver_id, p_truck_id, v_actor, v_kind, 'assign_trip', p_request_id, v_fp, p_note, false);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('assign_trip', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select v_a.id, v_t.status, false;
end $fn$;

create function public.reassign_trip(p_trip_id uuid, p_driver_id uuid, p_truck_id uuid, p_reason text, p_request_id uuid)
returns table (assignment_id uuid, trip_status public.trip_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text; v_kind public.trip_actor_kind;
  v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'reassign_trip: sessao obrigatoria'; end if;
  if p_trip_id is null or p_driver_id is null or p_truck_id is null then
    raise exception using errcode = '22004', message = 'reassign_trip: trip, motorista e veiculo sao obrigatorios';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception using errcode = '22023', message = 'reassign_trip: motivo com pelo menos 10 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'driver', p_driver_id, 'truck', p_truck_id, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('reassign_trip', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id;
    select * into v_a from public.trip_assignments a where a.trip_id = p_trip_id and a.request_id = p_request_id;
    return query select v_a.id, v_t.status, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null then raise exception using errcode = '42501', message = 'reassign_trip: viagem nao visivel'; end if;
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator') then
    raise exception using errcode = '42501', message = 'reassign_trip: somente transportadora (owner/operator) ou administrador';
  end if;
  v_kind := public.trip_actor_kind_of(v_role);
  perform 1 from public.contracts c where c.id = (select contract_id from public.operational_trips where id = p_trip_id) for update;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status in ('planned', 'delivered', 'returned', 'completed', 'cancelled') then
    raise exception using errcode = '22023', message = format('reassign_trip: viagem em %s nao admite reatribuicao', v_t.status);
  end if;
  if v_role <> 'admin' and v_t.status not in ('assigned', 'driver_accepted', 'en_route_to_pickup', 'at_pickup') then
    raise exception using errcode = '42501',
      message = 'reassign_trip: apos o carregamento a reatribuicao e administrativa (abra excecao)';
  end if;
  v_a := public.trip_assign_core(v_t, p_driver_id, p_truck_id, v_actor, v_kind, 'reassign_trip', p_request_id, v_fp, p_reason, true);
  if v_role = 'admin' then
    insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
    values (p_trip_id, v_actor, 'reassign_trip', jsonb_build_object('driver_id', v_t.driver_id, 'truck_id', v_t.truck_id),
            jsonb_build_object('driver_id', p_driver_id, 'truck_id', p_truck_id), p_reason, p_request_id);
  end if;
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('reassign_trip', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select v_a.id, v_t.status, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: respond_trip_assignment (motorista aceita/recusa)
-- Aceite exige aviso de privacidade VIGENTE reconhecido (versao + hash).
-- -----------------------------------------------------------------------------
create function public.respond_trip_assignment(
  p_assignment_id uuid, p_accept boolean, p_reason text, p_command_id uuid, p_captured_at timestamptz)
returns table (applied boolean, duplicate boolean, rejection_code text, trip_status public.trip_status)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_a public.trip_assignments%rowtype; v_t public.operational_trips%rowtype;
  v_d public.drivers%rowtype; v_n public.privacy_notices%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'respond_trip_assignment: sessao obrigatoria'; end if;
  if p_assignment_id is null or p_accept is null or p_command_id is null then
    raise exception using errcode = '22004', message = 'respond_trip_assignment: parametros obrigatorios';
  end if;
  if not p_accept and (p_reason is null or length(btrim(p_reason)) < 10) then
    raise exception using errcode = '22023', message = 'respond_trip_assignment: recusa exige motivo (>= 10)';
  end if;
  select * into v_a from public.trip_assignments a where a.id = p_assignment_id;
  if not found or v_a.driver_profile_id <> v_actor then
    raise exception using errcode = '42501', message = 'respond_trip_assignment: vinculo nao pertence ao chamador';
  end if;
  perform 1 from public.contracts c where c.id = (select contract_id from public.operational_trips where id = v_a.trip_id) for update;
  v_t := public.trip_lock(v_a.trip_id);
  if exists (select 1 from public.trip_events e where e.trip_id = v_t.id and e.command_id = p_command_id) then
    return query select false, true, null::text, v_t.status; return;
  end if;
  select * into v_a from public.trip_assignments a where a.id = p_assignment_id for update;
  if v_a.state <> 'offered' then
    return query select false, false, 'assignment_not_offered'::text, v_t.status; return;
  end if;
  if v_t.paused_by_contract then
    return query select false, false, 'trip_paused_by_contract'::text, v_t.status; return;
  end if;
  if p_accept then
    v_n := public.current_privacy_notice();
    if v_n.id is null then
      return query select false, false, 'privacy_notice_unpublished'::text, v_t.status; return;
    end if;
    select * into v_d from public.drivers d where d.id = v_a.driver_id;
    if v_d.privacy_notice_version is distinct from v_n.version or v_d.privacy_notice_sha256 is distinct from v_n.body_sha256 then
      return query select false, false, 'privacy_notice_required'::text, v_t.status; return;
    end if;
    update public.trip_assignments a set state = 'accepted', accepted_at = now() where a.id = p_assignment_id;
    perform public.trip_event_append(v_t.id, 'assignment_accepted', v_actor, 'driver', 'respond_trip_assignment',
      null, null, 'Motorista aceitou a viagem.', jsonb_build_object('assignment_id', v_a.id),
      p_command_id, null, null, p_captured_at, p_assignment_id => v_a.id);
    if v_t.status = 'assigned' then
      perform public.trip_event_append(v_t.id, 'transition', v_actor, 'driver', 'respond_trip_assignment',
        'assigned', 'driver_accepted', 'Aceite do motorista.', '{}'::jsonb, p_assignment_id => v_a.id);
    end if;
    perform public.notify_trip(v_t.id, 'trip_accepted', format('Viagem %s aceita pelo motorista', v_t.trip_number),
      'O motorista confirmou a viagem.', true, true, false, false, v_actor);
  else
    update public.trip_assignments a set state = 'declined', declined_at = now(), decline_reason = btrim(p_reason)
     where a.id = p_assignment_id;
    perform public.trip_event_append(v_t.id, 'assignment_declined', v_actor, 'driver', 'respond_trip_assignment',
      null, null, btrim(p_reason), jsonb_build_object('assignment_id', v_a.id),
      p_command_id, null, null, p_captured_at, p_assignment_id => v_a.id);
    perform public.trip_release_capacity(v_t.id);
    if v_t.status = 'assigned' then
      update public.operational_trips t set driver_id = null, truck_id = null where t.id = v_t.id;
      perform set_config('steelgo.assign_context', v_t.contract_id::text, true);
      update public.contracts c set driver_id = null, truck_id = null where c.id = v_t.contract_id;
      perform set_config('steelgo.assign_context', '', true);
      perform public.trip_event_append(v_t.id, 'transition', v_actor, 'driver', 'respond_trip_assignment',
        'assigned', 'planned', 'Recusa do motorista; viagem volta a planned.', '{}'::jsonb);
    else
      insert into public.operational_alerts (trip_id, kind, severity, details, policy_version)
      values (v_t.id, 'cargo_without_progress', 'high',
              jsonb_build_object('reason', 'reassignment_declined', 'assignment_id', v_a.id), v_t.policy_version)
      on conflict (trip_id, kind) where status <> 'closed' do nothing;
    end if;
    perform public.notify_trip(v_t.id, 'trip_declined', format('Viagem %s recusada pelo motorista', v_t.trip_number),
      'Designe outro motorista/veiculo.', false, true, false, true, v_actor);
  end if;
  select * into v_t from public.operational_trips t where t.id = v_t.id;
  return query select true, false, null::text, v_t.status;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: start_tracking_session (motorista, antes de en_route_to_pickup)
-- -----------------------------------------------------------------------------
create function public.start_tracking_session(
  p_trip_id uuid, p_device_id uuid, p_platform text, p_provider public.tracking_provider, p_app_version text)
returns table (session_id uuid, policy jsonb, was_existing boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_a public.trip_assignments%rowtype; v_t public.operational_trips%rowtype;
  v_d public.drivers%rowtype; v_n public.privacy_notices%rowtype; v_s public.trip_tracking_sessions%rowtype;
  v_pol public.operational_policies%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'start_tracking_session: sessao obrigatoria'; end if;
  if p_device_id is null or p_platform not in ('web', 'android', 'ios') or p_provider is null then
    raise exception using errcode = '22023', message = 'start_tracking_session: device/platform/provider invalidos';
  end if;
  v_t := public.trip_lock(p_trip_id);
  v_a := public.trip_live_assignment_of_caller(p_trip_id);
  if v_a.id is null or v_a.state <> 'accepted' then
    raise exception using errcode = '42501', message = 'start_tracking_session: exige vinculo aceito do motorista';
  end if;
  if v_t.status not in ('driver_accepted', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'returning') then
    raise exception using errcode = '22023', message = format('start_tracking_session: viagem em %s nao rastreia', v_t.status);
  end if;
  v_n := public.current_privacy_notice();
  if v_n.id is null then
    raise exception using errcode = '22023', message = 'start_tracking_session: privacy_notice_unpublished';
  end if;
  select * into v_d from public.drivers d where d.id = v_a.driver_id;
  if v_d.privacy_notice_version is distinct from v_n.version or v_d.privacy_notice_sha256 is distinct from v_n.body_sha256 then
    raise exception using errcode = '22023', message = 'start_tracking_session: privacy_notice_required';
  end if;
  v_pol := public.trip_policy(v_t);
  select * into v_s from public.trip_tracking_sessions s
   where s.trip_id = p_trip_id and s.device_id = p_device_id and s.ended_at is null;
  if found then
    return query select v_s.id, to_jsonb(v_pol) - 'id' - 'created_by' - 'request_id' - 'reason', true; return;
  end if;
  insert into public.trip_tracking_sessions (
    trip_id, assignment_id, driver_id, device_id, platform, provider, app_version,
    privacy_notice_version, privacy_notice_sha256, privacy_notice_acknowledged_at)
  values (p_trip_id, v_a.id, v_a.driver_id, p_device_id, p_platform, p_provider, p_app_version,
          v_n.version, v_n.body_sha256, v_d.privacy_notice_acknowledged_at)
  returning * into v_s;
  update public.operational_trips t set tracking_state = 'active' where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'tracking_started', v_actor, 'driver', 'start_tracking_session', null, null,
    format('Rastreamento iniciado (%s, %s).', p_platform, p_provider),
    jsonb_build_object('session_id', v_s.id, 'provider', p_provider, 'platform', p_platform, 'app_version', p_app_version),
    p_device_id => p_device_id, p_assignment_id => v_a.id);
  return query select v_s.id, to_jsonb(v_pol) - 'id' - 'created_by' - 'request_id' - 'reason', false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: transition_trip (motorista). Comandos com command_id imutavel; conflitos de
-- estado NAO lancam excecao: devolvem applied=false + rejection_code e ficam na
-- trilha como command_rejected (o cliente marca a outbox).
-- Transicoes permitidas aqui:
--   driver_accepted -> en_route_to_pickup   (exige sessao de rastreamento ativa)
--   en_route_to_pickup -> at_pickup         (geofence ou justificativa)
--   at_pickup -> loading
--   loading -> in_transit                   (exige checkpoint 'loaded' com foto)
--   in_transit -> at_delivery               (geofence ou justificativa)
--   at_delivery -> unloading
-- delivered/returned: somente por POD / recibo de retorno (76). Localizacao obrigatoria.
-- -----------------------------------------------------------------------------
create function public.transition_trip(
  p_trip_id uuid, p_to public.trip_status, p_command_id uuid, p_seq bigint, p_captured_at timestamptz,
  p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_note text, p_device_id uuid,
  p_geofence_override_reason text default null)
returns table (applied boolean, duplicate boolean, rejection_code text, trip_status public.trip_status, alert_kind text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_pol public.operational_policies%rowtype;
  v_g public.trip_geofences%rowtype;
  v_pt extensions.geography; v_dist numeric; v_inside boolean; v_alert text;
  v_from public.trip_status;
  v_ok boolean := false;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'transition_trip: sessao obrigatoria'; end if;
  if p_trip_id is null or p_to is null or p_command_id is null or p_captured_at is null then
    raise exception using errcode = '22004', message = 'transition_trip: parametros obrigatorios ausentes';
  end if;
  v_t := public.trip_lock(p_trip_id);
  v_a := public.trip_live_assignment_of_caller(p_trip_id);
  if v_a.id is null then
    raise exception using errcode = '42501', message = 'transition_trip: chamador nao e o motorista vinculado desta viagem';
  end if;
  if exists (select 1 from public.trip_events e where e.trip_id = p_trip_id and e.command_id = p_command_id) then
    return query select false, true, null::text, v_t.status, null::text; return;
  end if;
  v_pol := public.trip_policy(v_t);
  if p_captured_at > now() + make_interval(mins => v_pol.clock_future_tolerance_min) then
    raise exception using errcode = '22023', message = 'transition_trip: captured_at no futuro (relogio do aparelho)';
  end if;
  v_from := v_t.status;

  -- motivos de rejeicao (registrados, nao lancados)
  if v_a.state <> 'accepted' then
    v_alert := 'assignment_not_accepted';
  elsif v_t.paused_by_contract then
    v_alert := 'trip_paused_by_contract';
  elsif v_t.paused_by_exception_id is not null then
    v_alert := 'trip_paused_by_exception';
  elsif v_t.has_open_critical_exception and p_to <> v_from then
    v_alert := 'critical_exception_open';
  elsif p_to in ('delivered', 'returned', 'completed', 'cancelled', 'planned', 'assigned', 'driver_accepted', 'returning') then
    v_alert := 'transition_requires_dedicated_rpc';
  elsif not ((v_from, p_to) in (('driver_accepted', 'en_route_to_pickup'), ('en_route_to_pickup', 'at_pickup'),
             ('at_pickup', 'loading'), ('loading', 'in_transit'), ('in_transit', 'at_delivery'), ('at_delivery', 'unloading'))) then
    v_alert := 'invalid_transition:' || v_from::text || '->' || p_to::text;
  elsif p_lat is null or p_lng is null or p_accuracy_m is null then
    v_alert := 'location_required';
  elsif p_accuracy_m > v_pol.accuracy_reject_m then
    v_alert := 'accuracy_rejected';
  elsif p_to = 'en_route_to_pickup' and v_t.tracking_state <> 'active' then
    v_alert := 'tracking_session_required';
  elsif p_to = 'in_transit' and not exists (select 1 from public.trip_checkpoints c where c.trip_id = p_trip_id and c.kind = 'loaded') then
    v_alert := 'loaded_checkpoint_required';
  end if;

  if v_alert is not null then
    perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'transition_trip', null, null,
      v_alert, jsonb_build_object('requested_to', p_to, 'from', v_from), p_command_id, p_device_id, p_seq, p_captured_at,
      p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
    return query select false, false, v_alert, v_t.status, null::text; return;
  end if;

  v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  -- geofences de chegada
  if p_to in ('at_pickup', 'at_delivery') then
    select * into v_g from public.trip_geofences g where g.trip_id = p_trip_id and g.is_current
      and g.kind = case when p_to = 'at_pickup' then 'pickup' else 'delivery' end;
    if v_g.id is not null then
      v_dist := extensions.ST_Distance(v_pt, v_g.center_geog);
      v_inside := v_dist <= v_g.radius_m + least(p_accuracy_m, v_pol.accuracy_primary_m);
      if not v_inside and (p_geofence_override_reason is null or length(btrim(p_geofence_override_reason)) < 20) then
        perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'transition_trip', null, null,
          'outside_geofence', jsonb_build_object('requested_to', p_to, 'distance_m', round(v_dist)), p_command_id, p_device_id,
          p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
        return query select false, false, 'outside_geofence'::text, v_t.status, null::text; return;
      end if;
      if not v_inside then
        insert into public.operational_alerts (trip_id, kind, severity, details, policy_version)
        values (p_trip_id, 'geofence_exit', 'medium',
                jsonb_build_object('transition', p_to, 'distance_m', round(v_dist), 'reason', btrim(p_geofence_override_reason)),
                v_t.policy_version)
        on conflict (trip_id, kind) where status <> 'closed' do nothing;
        v_alert := 'geofence_exit';
      end if;
    end if;
  end if;

  perform public.trip_event_append(p_trip_id, 'transition', v_actor, 'driver', 'transition_trip', v_from, p_to,
    coalesce(p_note, ''), jsonb_build_object('inside_geofence', v_inside, 'distance_m', round(coalesce(v_dist, 0)),
                                             'override_reason', p_geofence_override_reason),
    p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);

  if p_to = 'in_transit' then
    update public.operational_trips t set departed_pickup_at = coalesce(t.departed_pickup_at, p_captured_at) where t.id = p_trip_id;
    perform public.freight_operational_transition(v_t.freight_id, 'in_transit', v_actor, 'transition_trip', p_command_id);
    perform public.notify_trip(p_trip_id, 'trip_in_transit', format('Viagem %s em transito', v_t.trip_number),
      'A carga saiu da origem.', true, true, false, false, v_actor);
  elsif p_to = 'at_pickup' then
    perform public.notify_trip(p_trip_id, 'trip_at_pickup', format('Viagem %s: veiculo na coleta', v_t.trip_number),
      'O veiculo chegou ao local de coleta.', true, true, false, false, v_actor);
  elsif p_to = 'at_delivery' then
    perform public.notify_trip(p_trip_id, 'trip_at_delivery', format('Viagem %s: veiculo na entrega', v_t.trip_number),
      'O veiculo chegou ao local de entrega.', true, true, false, false, v_actor);
  end if;
  update public.operational_trips t set last_location_at = greatest(coalesce(t.last_location_at, p_captured_at), p_captured_at),
         last_location_geog = v_pt where t.id = p_trip_id;
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select true, false, null::text, v_t.status, v_alert;
end $fn$;

-- -----------------------------------------------------------------------------
-- Reflexo operacional no frete. A matriz de eventos do frete (L2a) e estendida
-- com tres transicoes: in_transit, delivered, completed. Todos os demais campos
-- economicos/matching permanecem identicos (o CHECK exige).
-- -----------------------------------------------------------------------------
alter table public.freight_publication_events drop constraint freight_publication_events_transition_matrix;
alter table public.freight_publication_events add constraint freight_publication_events_transition_matrix check (
case transition
  when 'publish' then ((previous_status is null or previous_status in ('draft', 'withdrawn')) and new_status = 'published'
     and new_published_at is not null and new_budget_brl is not null and new_budget_brl > 0 and new_budget_amount is not null
     and new_budget_amount = new_budget_brl and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  when 'withdraw' then (previous_status = 'published' and new_status = 'withdrawn'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  when 'reprice' then (previous_status = 'published' and new_status = 'published'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not null and new_budget_brl > 0
     and new_budget_brl is distinct from previous_budget_brl and new_budget_amount is not null and new_budget_amount = new_budget_brl
     and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  when 'cancel' then (new_status = 'cancelled'
     and (previous_status is null or previous_status in ('draft', 'published', 'withdrawn', 'bidding', 'matched'))
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  when 'contract_pending' then (previous_status = 'published' and new_status = 'contract_pending'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not null and new_final_price_brl > 0
     and new_final_price_amount is not null and new_final_price_amount = new_final_price_brl and new_matched_carrier_id is not null)
  when 'contracted' then (previous_status = 'contract_pending' and new_status = 'contracted'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  -- MODULO 3: reflexo operacional; nada economico ou de matching muda
  when 'in_transit' then (previous_status in ('contract_pending', 'contracted') and new_status = 'in_transit'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  when 'delivered' then (previous_status in ('in_transit', 'contracted', 'contract_pending') and new_status = 'delivered'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  when 'completed' then (previous_status in ('delivered', 'in_transit') and new_status = 'completed'
     and new_published_at is not distinct from previous_published_at and new_budget_brl is not distinct from previous_budget_brl
     and new_budget_amount is not distinct from previous_budget_amount and new_final_price_brl is not distinct from previous_final_price_brl
     and new_final_price_amount is not distinct from previous_final_price_amount
     and new_matched_carrier_id is not distinct from previous_matched_carrier_id
     and new_matched_driver_id is not distinct from previous_matched_driver_id
     and new_matched_truck_id is not distinct from previous_matched_truck_id)
  else false end);

create function public.freight_operational_transition(
  p_freight_id uuid, p_new public.freight_status, p_actor uuid, p_rpc text, p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_f public.freights%rowtype; v_ev uuid; v_ov uuid; v_tr public.freight_lifecycle_transition;
begin
  select * into v_f from public.freights f where f.id = p_freight_id for update;
  if not found or v_f.status = p_new then return; end if;
  if p_new = 'in_transit' and v_f.status in ('contract_pending', 'contracted') then v_tr := 'in_transit';
  elsif p_new = 'delivered' and v_f.status in ('in_transit', 'contracted', 'contract_pending') then v_tr := 'delivered';
  elsif p_new = 'completed' and v_f.status in ('delivered', 'in_transit') then v_tr := 'completed';
  else return; -- reflexo e best-effort; a verdade operacional esta na viagem
  end if;
  select ov.id into v_ov from public.freight_offer_versions ov where ov.freight_id = p_freight_id order by ov.created_at desc limit 1;
  if v_ov is null or p_actor is null then return; end if;
  insert into public.freight_publication_events (
    freight_id, offer_version_id, previous_event_id, transition, previous_status, new_status,
    previous_published_at, new_published_at, previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
    previous_final_price_brl, new_final_price_brl, previous_final_price_amount, new_final_price_amount,
    previous_matched_carrier_id, new_matched_carrier_id, previous_matched_driver_id, new_matched_driver_id,
    previous_matched_truck_id, new_matched_truck_id, actor_id, actor_was_admin, actor_company_id, reason, rpc_name,
    request_id, params_fingerprint)
  values (p_freight_id, v_ov, v_f.last_publication_event_id, v_tr, v_f.status, p_new,
    v_f.published_at, v_f.published_at, v_f.budget_brl, v_f.budget_brl, v_f.budget_amount, v_f.budget_amount,
    v_f.final_price_brl, v_f.final_price_brl, v_f.final_price_amount, v_f.final_price_amount,
    v_f.matched_carrier_id, v_f.matched_carrier_id, v_f.matched_driver_id, v_f.matched_driver_id,
    v_f.matched_truck_id, v_f.matched_truck_id, p_actor, false, v_f.company_id,
    'Reflexo operacional (Modulo 3): ' || p_new::text, p_rpc, coalesce(p_request_id, gen_random_uuid()),
    encode(extensions.digest('m3:' || p_freight_id::text || ':' || p_new::text || ':' || coalesce(p_request_id::text, ''), 'sha256'), 'hex'))
  returning id into v_ev;
  update public.freights f set status = p_new, last_publication_event_id = v_ev where f.id = p_freight_id;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: cancel_trip - SOMENTE antes do carregamento
-- -----------------------------------------------------------------------------
create function public.cancel_trip(p_trip_id uuid, p_reason text, p_request_id uuid)
returns table (trip_status public.trip_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text; v_kind public.trip_actor_kind; v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'cancel_trip: sessao obrigatoria'; end if;
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception using errcode = '22023', message = 'cancel_trip: motivo com pelo menos 20 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('cancel_trip', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id;
    return query select v_t.status, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null then raise exception using errcode = '42501', message = 'cancel_trip: viagem nao visivel'; end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status in ('completed', 'cancelled', 'returned', 'delivered') then
    raise exception using errcode = '22023', message = format('cancel_trip: viagem em %s', v_t.status);
  end if;
  if v_t.loaded_at is not null or v_t.status in ('loading', 'in_transit', 'at_delivery', 'unloading', 'returning') then
    raise exception using errcode = '22023',
      message = 'cancel_trip: carga embarcada; a viagem nao e cancelada (use excecao, pausa, reatribuicao ou '
                'disposicao de carga apos encerramento contratual)';
  end if;
  if v_role in ('carrier_owner', 'carrier_operator') then
    v_kind := 'carrier';
  elsif v_role = 'shipper_owner' then
    if v_t.status <> 'planned' then
      raise exception using errcode = '42501', message = 'cancel_trip: embarcador so cancela viagem ainda planned (abra excecao)';
    end if;
    v_kind := 'shipper';
  elsif v_role = 'admin' then
    v_kind := 'admin';
  else
    raise exception using errcode = '42501', message = 'cancel_trip: papel sem permissao';
  end if;

  update public.trip_assignments a set state = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason)
   where a.trip_id = p_trip_id and a.state in ('offered', 'accepted');
  perform public.trip_end_tracking_sessions(p_trip_id, 'cancelled');
  perform public.trip_release_capacity(p_trip_id);
  update public.operational_alerts al set status = 'closed', closed_at = now(), close_reason = 'trip_cancelled'
   where al.trip_id = p_trip_id and al.status <> 'closed';
  v_pol := public.trip_policy(v_t);
  update public.operational_trips t
     set status = 'cancelled', previous_status = t.status, cancelled_at = now(), cancel_reason = btrim(p_reason),
         terminal_reason = 'cancelled_operational',
         retention_until = now() + make_interval(days => v_pol.raw_retention_days),
         summary_retention_until = now() + make_interval(years => v_pol.summary_retention_years)
   where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'cancelled', v_actor, v_kind, 'cancel_trip', v_t.status, 'cancelled',
    btrim(p_reason), jsonb_build_object('terminal_reason', 'cancelled_operational', 'attempt_number', v_t.attempt_number),
    p_request_id => p_request_id, p_fingerprint => v_fp);
  if v_kind = 'admin' then
    insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
    values (p_trip_id, v_actor, 'cancel_trip', jsonb_build_object('status', v_t.status), jsonb_build_object('status', 'cancelled'), p_reason, p_request_id);
  end if;
  perform public.notify_trip(p_trip_id, 'trip_cancelled', format('Viagem %s cancelada', v_t.trip_number),
    'Tentativa operacional cancelada antes do carregamento. O contrato permanece; uma nova tentativa pode ser criada.',
    true, true, true, v_kind <> 'admin', v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('cancel_trip', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select 'cancelled'::public.trip_status, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: pause_trip / resume_trip (transportadora operator+ ou admin)
-- -----------------------------------------------------------------------------
create function public.pause_trip(p_trip_id uuid, p_exception_id uuid, p_reason text, p_request_id uuid)
returns table (trip_status public.trip_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_role text; v_t public.operational_trips%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype; v_x public.trip_exceptions%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'pause_trip: sessao obrigatoria'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception using errcode = '22023', message = 'pause_trip: motivo (>= 10)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'exc', p_exception_id, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('pause_trip', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id; return query select v_t.status, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator') then
    raise exception using errcode = '42501', message = 'pause_trip: somente transportadora (owner/operator) ou administrador';
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status in ('planned', 'delivered', 'returned', 'completed', 'cancelled') then
    raise exception using errcode = '22023', message = format('pause_trip: viagem em %s', v_t.status);
  end if;
  if v_t.paused_by_exception_id is not null then
    raise exception using errcode = '22023', message = 'pause_trip: viagem ja pausada';
  end if;
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id and x.trip_id = p_trip_id
    and x.status not in ('resolved', 'converted_to_dispute');
  if not found then
    raise exception using errcode = '22023', message = 'pause_trip: excecao aberta desta viagem e obrigatoria';
  end if;
  update public.operational_trips t set paused_by_exception_id = p_exception_id, tracking_state = case when t.tracking_state = 'active' then 'paused' else t.tracking_state end
   where t.id = p_trip_id;
  update public.trip_exceptions x set pauses_trip = true where x.id = p_exception_id;
  perform public.trip_event_append(p_trip_id, 'paused', v_actor, public.trip_actor_kind_of(v_role), 'pause_trip', null, null,
    btrim(p_reason), jsonb_build_object('exception_id', p_exception_id), p_exception_id => p_exception_id,
    p_request_id => p_request_id, p_fingerprint => v_fp);
  perform public.notify_trip(p_trip_id, 'trip_paused', format('Viagem %s pausada', v_t.trip_number), btrim(p_reason), true, true, true, true, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('pause_trip', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_t.status, false;
end $fn$;

create function public.resume_trip(p_trip_id uuid, p_reason text, p_request_id uuid)
returns table (trip_status public.trip_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_role text; v_t public.operational_trips%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'resume_trip: sessao obrigatoria'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception using errcode = '22023', message = 'resume_trip: motivo (>= 10)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('resume_trip', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id; return query select v_t.status, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator') then
    raise exception using errcode = '42501', message = 'resume_trip: somente transportadora (owner/operator) ou administrador';
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.paused_by_exception_id is null then
    raise exception using errcode = '22023', message = 'resume_trip: viagem nao esta pausada por excecao';
  end if;
  if v_t.paused_by_contract then
    raise exception using errcode = '22023', message = 'resume_trip: pausa contratual (disputa) so termina com o contrato';
  end if;
  update public.operational_trips t set paused_by_exception_id = null,
         tracking_state = case when t.tracking_state = 'paused' then 'active' else t.tracking_state end
   where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'resumed', v_actor, public.trip_actor_kind_of(v_role), 'resume_trip', null, null,
    btrim(p_reason), '{}'::jsonb, p_request_id => p_request_id, p_fingerprint => v_fp);
  perform public.notify_trip(p_trip_id, 'trip_resumed', format('Viagem %s retomada', v_t.trip_number), btrim(p_reason), true, true, true, false, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('resume_trip', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_t.status, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: force_trip_transition (admin; nunca para delivered/returned/completed/cancelled)
-- -----------------------------------------------------------------------------
create function public.force_trip_transition(p_trip_id uuid, p_to public.trip_status, p_reason text, p_request_id uuid)
returns table (trip_status public.trip_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('force_trip_transition');
  v_t public.operational_trips%rowtype; v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception using errcode = '22023', message = 'force_trip_transition: motivo (>= 20)';
  end if;
  if p_to in ('delivered', 'returned', 'completed', 'cancelled', 'planned') then
    raise exception using errcode = '22023',
      message = 'force_trip_transition: estados terminais/POD/planned nao sao forcados; use as RPCs proprias';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'to', p_to, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('force_trip_transition', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id; return query select v_t.status, true; return;
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status in ('delivered', 'returned', 'completed', 'cancelled') then
    raise exception using errcode = '22023', message = format('force_trip_transition: viagem em %s', v_t.status);
  end if;
  if v_t.driver_id is null and p_to <> 'planned' then
    raise exception using errcode = '22023', message = 'force_trip_transition: viagem sem motorista vinculado';
  end if;
  if p_to in ('in_transit', 'at_delivery', 'unloading') and v_t.loaded_at is null
     and not exists (select 1 from public.trip_checkpoints c where c.trip_id = p_trip_id and c.kind = 'loaded') then
    raise exception using errcode = '22023', message = 'force_trip_transition: sem checkpoint loaded nao ha transito';
  end if;
  perform public.trip_event_append(p_trip_id, 'admin_override', v_actor, 'admin', 'force_trip_transition', v_t.status, p_to,
    btrim(p_reason), jsonb_build_object('from', v_t.status, 'to', p_to), p_request_id => p_request_id, p_fingerprint => v_fp);
  perform public.trip_event_append(p_trip_id, 'transition', v_actor, 'admin', 'force_trip_transition', v_t.status, p_to,
    'Transicao administrativa.', '{}'::jsonb);
  if p_to = 'in_transit' then
    perform public.freight_operational_transition(v_t.freight_id, 'in_transit', v_actor, 'force_trip_transition', p_request_id);
  end if;
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (p_trip_id, v_actor, 'force_trip_transition', jsonb_build_object('status', v_t.status), jsonb_build_object('status', p_to), p_reason, p_request_id);
  perform public.notify_trip(p_trip_id, 'trip_admin_override', format('Viagem %s: estado ajustado pela SteelGo', v_t.trip_number),
    btrim(p_reason), true, true, true, false, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('force_trip_transition', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select p_to, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- Hook contratual: trigger em contracts (status) -> viagens
--   awaiting_carrier_signature -> active : cria tentativa 1 (+ atribuicao automatica
--     se o lance nomeou motorista/veiculo validos);
--   active -> disputed : pausa contratual (viagem viva permanece);
--   disputed -> active : retoma;
--   -> cancelled / completed : viagem viva sem carga -> cancelled_with_contract;
--     viagem viva COM carga -> NAO encerra: pausa, abre cargo_disposition_required
--     (critical) e notifica admins/transportadora;
--     viagem delivered + contrato completed -> completed.
-- -----------------------------------------------------------------------------
create function public.trips_follow_contract_status()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_t public.operational_trips%rowtype; v_d public.drivers%rowtype; v_x public.trip_exceptions%rowtype;
  v_pol public.operational_policies%rowtype;
begin
  if NEW.status = 'active'::public.contract_status and OLD.status = 'awaiting_carrier_signature'::public.contract_status then
    if not exists (select 1 from public.operational_trips t where t.contract_id = NEW.id) then
      v_t := public.trip_create_core(NEW.id, v_actor, 'system', 'contracts:activated', NEW.last_lifecycle_event_id, 'contract_activated');
      if NEW.driver_id is not null and NEW.truck_id is not null then
        select * into v_d from public.drivers d where d.profile_id = NEW.driver_id;
        if found then
          begin
            perform public.trip_assign_core(v_t, v_d.id, NEW.truck_id, v_actor, 'system', 'contracts:activated',
                      gen_random_uuid(), 'contract_activated', 'Motorista/veiculo do lance vencedor.', false);
          exception when others then
            perform public.trip_event_append(v_t.id, 'command_rejected', v_actor, 'system', 'contracts:activated', null, null,
              'Motorista/veiculo do lance nao atendem aos requisitos: ' || sqlerrm, '{}'::jsonb);
          end;
        end if;
      end if;
    end if;
    return NEW;
  end if;

  select * into v_t from public.operational_trips t where t.contract_id = NEW.id
    and t.status not in ('completed', 'cancelled', 'returned') for update;
  if not found then return NEW; end if;

  if NEW.status = 'disputed'::public.contract_status then
    update public.operational_trips t set paused_by_contract = true where t.id = v_t.id;
    perform public.trip_event_append(v_t.id, 'paused', v_actor, 'system', 'contracts:disputed', null, null,
      'Pausa contratual: contrato em disputa.', '{}'::jsonb);
  elsif NEW.status = 'active'::public.contract_status and OLD.status = 'disputed'::public.contract_status then
    update public.operational_trips t set paused_by_contract = false where t.id = v_t.id;
    perform public.trip_event_append(v_t.id, 'resumed', v_actor, 'system', 'contracts:dispute_resolved', null, null,
      'Contrato voltou a active; viagem retomada.', '{}'::jsonb);
  elsif NEW.status in ('cancelled'::public.contract_status, 'completed'::public.contract_status) then
    v_pol := public.trip_policy(v_t);
    if NEW.status = 'completed'::public.contract_status and v_t.status = 'delivered' then
      update public.operational_trips t set status = 'completed', previous_status = t.status, completed_at = now(),
             terminal_reason = 'delivered_completed',
             retention_until = coalesce(t.retention_until, now() + make_interval(days => v_pol.raw_retention_days)),
             summary_retention_until = coalesce(t.summary_retention_until, now() + make_interval(years => v_pol.summary_retention_years))
       where t.id = v_t.id;
      perform public.trip_event_append(v_t.id, 'completed', v_actor, 'system', 'contracts:completed', 'delivered', 'completed',
        'Contrato concluido; viagem concluida.', '{}'::jsonb);
      perform public.trip_release_capacity(v_t.id);
      perform public.freight_operational_transition(v_t.freight_id, 'completed', coalesce(v_actor, NEW.delivery_completed_by), 'contracts:completed', NEW.last_lifecycle_event_id);
    elsif v_t.loaded_at is null then
      update public.trip_assignments a set state = 'revoked', revoked_at = now(), revoke_reason = 'contrato ' || NEW.status::text
       where a.trip_id = v_t.id and a.state in ('offered', 'accepted');
      perform public.trip_end_tracking_sessions(v_t.id, 'contract_terminal');
      perform public.trip_release_capacity(v_t.id);
      update public.operational_alerts al set status = 'closed', closed_at = now(), close_reason = 'contract_terminal'
       where al.trip_id = v_t.id and al.status <> 'closed';
      update public.operational_trips t set status = 'cancelled', previous_status = t.status, cancelled_at = now(),
             cancel_reason = 'Contrato encerrado por fluxo contratual governado (' || NEW.status::text || ').',
             terminal_reason = 'cancelled_with_contract',
             retention_until = now() + make_interval(days => v_pol.raw_retention_days),
             summary_retention_until = now() + make_interval(years => v_pol.summary_retention_years)
       where t.id = v_t.id;
      perform public.trip_event_append(v_t.id, 'cancelled', v_actor, 'system', 'contracts:' || NEW.status::text, v_t.status, 'cancelled',
        'Viagem sem carga encerrada com o contrato.', jsonb_build_object('terminal_reason', 'cancelled_with_contract'));
      perform public.notify_trip(v_t.id, 'trip_cancelled', format('Viagem %s encerrada', v_t.trip_number),
        'O contrato foi encerrado; a tentativa operacional foi cancelada.', true, true, true, false);
    else
      -- CARGA EMBARCADA: nao encerra. Pausa e exige disposicao de carga.
      update public.operational_trips t set paused_by_contract = true where t.id = v_t.id;
      insert into public.trip_exceptions (trip_id, kind, severity, status, opened_by, opened_by_kind, captured_at,
        description, visibility, ack_target_at, blocks_delivery, pauses_trip)
      values (v_t.id, 'cargo_disposition_required', 'critical', 'open', v_actor, 'system', now(),
        format('Contrato %s encerrado (%s) com carga embarcada na viagem %s. A viagem permanece viva e rastreavel ate '
               'resolucao explicita de disposicao da carga pela SteelGo.', NEW.contract_number, NEW.status, v_t.trip_number),
        'carrier_admin', now() + make_interval(mins => v_pol.alert_ack_target_min), true, true)
      on conflict (trip_id) where kind = 'cargo_disposition_required' and status not in ('resolved', 'converted_to_dispute') do nothing
      returning * into v_x;
      if v_x.id is not null then
        update public.operational_trips t set paused_by_exception_id = coalesce(t.paused_by_exception_id, v_x.id),
               has_open_critical_exception = true where t.id = v_t.id;
        perform public.trip_event_append(v_t.id, 'contract_terminal_hold', v_actor, 'system', 'contracts:' || NEW.status::text, null, null,
          'Contrato encerrado com carga embarcada; disposicao de carga exigida.', jsonb_build_object('exception_id', v_x.id),
          p_exception_id => v_x.id);
        perform public.notify_trip(v_t.id, 'cargo_disposition_required',
          format('Viagem %s: carga embarcada e contrato encerrado', v_t.trip_number),
          'Resolucao de disposicao de carga exigida. A viagem segue rastreada.', false, true, true, true, null, 'high');
      end if;
    end if;
  end if;
  return NEW;
end $fn$;
create trigger contracts_status_follow_trips after update of status on public.contracts
  for each row when (OLD.status is distinct from NEW.status)
  execute function public.trips_follow_contract_status();

-- -----------------------------------------------------------------------------
-- try_complete_contract v3: viagem viva (se houver) precisa estar delivered e
-- sem excecao de entrega; a sincronizacao viagem->completed acontece pelo trigger
-- acima (deterministica, na mesma transacao). Condicao financeira INALTERADA.
-- -----------------------------------------------------------------------------
create or replace function public.try_complete_contract(
  p_contract_id uuid, p_actor_id uuid, p_actor_kind text, p_rpc_name text, p_request_id uuid, p_fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_c      public.contracts%rowtype;
  v_intent public.payment_intents%rowtype;
  v_t      public.operational_trips%rowtype;
begin
  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then return false; end if;
  if v_c.status is distinct from 'active'::public.contract_status then return false; end if;
  if v_c.delivery_completed_at is null then return false; end if;

  select * into v_intent from public.payment_intents pi where pi.contract_id = p_contract_id;
  if not found then return false; end if;
  if v_intent.internal_status not in ('released_confirmed'::public.payment_internal_status,
                                      'settled'::public.payment_internal_status) then
    return false;
  end if;

  if exists (select 1 from public.dispute_cases d
              where d.contract_id = p_contract_id
                and d.status in ('open'::public.dispute_status, 'under_review'::public.dispute_status,
                                 'awaiting_evidence'::public.dispute_status, 'decided'::public.dispute_status)) then
    return false;
  end if;

  -- MODULO 3: viagem viva precisa estar entregue (POD aceita) e sem excecao de entrega
  select * into v_t from public.operational_trips t where t.contract_id = p_contract_id
    and t.status not in ('completed', 'cancelled', 'returned');
  if found and (v_t.status <> 'delivered' or v_t.delivery_exception) then
    return false;
  end if;

  perform public.contract_lifecycle_append(
    p_contract_id, 'completed'::public.contract_lifecycle_transition,
    'completed'::public.contract_status, v_intent.internal_status::text,
    v_c.delivery_completed_at, coalesce(v_intent.released_confirmed_at, v_intent.settled_at),
    v_intent.id, null, v_intent.gross_amount,
    p_actor_id, p_actor_kind,
    case when v_intent.internal_status = 'settled'::public.payment_internal_status
         then 'Entrega concluida e liquidacao de disputa confirmada: as duas condicoes satisfeitas.'
         else 'Entrega concluida e liberacao confirmada: as duas condicoes satisfeitas.' end,
    p_rpc_name, p_request_id, p_fingerprint);
  return true;
end;
$function$;

-- contracts_enforce_completion: completed exige viagem viva delivered sem excecao (se existir viagem)
create or replace function public.contracts_enforce_completion()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_paid boolean;
  v_t public.operational_trips%rowtype;
begin
  if NEW.status = 'completed'::public.contract_status
     and OLD.status is distinct from 'completed'::public.contract_status then
    if NEW.delivery_completed_at is null then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido sem entrega concluida. Entrega e pagamento sao fatos independentes e os DOIS sao necessarios.';
    end if;
    select (pi.internal_status in ('released_confirmed'::public.payment_internal_status, 'settled'::public.payment_internal_status))
      into v_paid from public.payment_intents pi where pi.contract_id = NEW.id;
    if not coalesce(v_paid, false) then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido sem liberacao de pagamento CONFIRMADA ou liquidacao de disputa CONFIRMADA. Solicitacao registrada nao e confirmacao.';
    end if;
    select * into v_t from public.operational_trips t where t.contract_id = NEW.id and t.status not in ('completed', 'cancelled', 'returned');
    if found and (v_t.status <> 'delivered' or v_t.delivery_exception) then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido com viagem viva nao entregue ou com excecao de entrega aberta.';
    end if;
  end if;
  return NEW;
end;
$function$;

-- contracts_enforce_lifecycle_facts: driver_id/truck_id so mudam pelas RPCs de atribuicao
create or replace function public.contracts_enforce_lifecycle_facts()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if OLD.delivery_completed_at is not null
     and (NEW.delivery_completed_at is distinct from OLD.delivery_completed_at
          or NEW.delivery_completed_by is distinct from OLD.delivery_completed_by) then
    raise exception using errcode = '42501',
      message = 'public.contracts: a conclusao da entrega ja esta registrada e nao e reescrita nem apagada.';
  end if;
  if OLD.pricing_rule_id is not null and NEW.pricing_rule_id is distinct from OLD.pricing_rule_id then
    raise exception using errcode = '42501',
      message = 'public.contracts: a regra de precificacao do contrato e historica e nao e reapontada.';
  end if;
  if OLD.completed_at is not null and NEW.completed_at is distinct from OLD.completed_at then
    raise exception using errcode = '42501',
      message = 'public.contracts: a conclusao do contrato ja esta datada e nao e reescrita.';
  end if;
  if (NEW.driver_id is distinct from OLD.driver_id or NEW.truck_id is distinct from OLD.truck_id)
     and exists (select 1 from public.operational_trips t where t.contract_id = NEW.id)
     and current_setting('steelgo.assign_context', true) is distinct from NEW.id::text then
    raise exception using errcode = '42501',
      message = 'public.contracts: motorista/veiculo so mudam pelas RPCs de atribuicao da viagem (Modulo 3).';
  end if;
  return NEW;
end;
$function$;

-- -----------------------------------------------------------------------------
-- RPC: resolve_cargo_disposition (admin) - unico caminho terminal para viagem
-- com carga embarcada apos encerramento contratual.
-- -----------------------------------------------------------------------------
create function public.resolve_cargo_disposition(
  p_trip_id uuid, p_disposition public.cargo_disposition, p_reason text, p_note text, p_occurred_at timestamptz,
  p_lat numeric, p_lng numeric, p_location_text text, p_custodian_label text, p_evidence jsonb,
  p_is_emergency boolean, p_request_id uuid)
returns table (trip_status public.trip_status, disposition public.cargo_disposition, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('resolve_cargo_disposition');
  v_t public.operational_trips%rowtype; v_x public.trip_exceptions%rowtype; v_fp text; v_log public.rpc_call_log%rowtype;
  v_ev jsonb; v_pol public.operational_policies%rowtype; v_new public.trip_status; v_geog extensions.geography; v_c public.contracts%rowtype;
  v_i integer := 0; v_d public.cargo_dispositions%rowtype;
begin
  if p_trip_id is null or p_disposition is null or p_occurred_at is null then
    raise exception using errcode = '22004', message = 'resolve_cargo_disposition: trip, disposition e occurred_at sao obrigatorios';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 20 or p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: motivo e nota com pelo menos 20 caracteres';
  end if;
  if p_disposition = 'emergency_release' and not coalesce(p_is_emergency, false) then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: emergency_release exige p_is_emergency=true';
  end if;
  if coalesce(p_is_emergency, false) then
    if length(btrim(p_reason)) < 50 or p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) < 1 then
      raise exception using errcode = '22023',
        message = 'resolve_cargo_disposition: override emergencial exige motivo forte (>= 50) e ao menos uma evidencia';
    end if;
  end if;
  if p_disposition = 'transferred_to_custodian' and (p_custodian_label is null or length(btrim(p_custodian_label)) < 3) then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: custodiante obrigatorio';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: occurred_at no futuro';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'disp', p_disposition, 'reason', p_reason, 'at', p_occurred_at));
  v_log := public.rpc_idempotency_probe('resolve_cargo_disposition', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id;
    return query select v_t.status, v_t.cargo_disposition, true; return;
  end if;
  select * into v_c from public.contracts c where c.id = (select contract_id from public.operational_trips where id = p_trip_id) for update;
  v_t := public.trip_lock(p_trip_id);
  if v_t.loaded_at is null then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: viagem sem carga embarcada; use cancel_trip';
  end if;
  if v_t.status in ('completed', 'cancelled', 'returned') then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: viagem ja terminal';
  end if;
  select * into v_x from public.trip_exceptions x where x.trip_id = p_trip_id and x.kind = 'cargo_disposition_required'
    and x.status not in ('resolved', 'converted_to_dispute') for update;
  if not found then
    raise exception using errcode = '22023',
      message = 'resolve_cargo_disposition: nao ha disposicao pendente (contrato ainda nao encerrado por fluxo governado)';
  end if;
  if v_c.status not in ('cancelled'::public.contract_status, 'completed'::public.contract_status) then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: contrato nao esta encerrado';
  end if;

  v_ev := coalesce(p_evidence, '[]'::jsonb);
  if jsonb_typeof(v_ev) <> 'array' then
    raise exception using errcode = '22023', message = 'resolve_cargo_disposition: evidencia deve ser array';
  end if;
  for v_i in 0 .. jsonb_array_length(v_ev) - 1 loop
    perform public.assert_trip_media(p_trip_id, p_request_id, 'evidence', v_ev -> v_i ->> 'path', v_ev -> v_i ->> 'sha256', v_actor);
  end loop;
  if p_lat is not null and p_lng is not null then
    v_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  v_pol := public.trip_policy(v_t);
  v_new := case when p_disposition = 'returned_to_origin' then 'returned' else 'cancelled' end;

  insert into public.cargo_dispositions (trip_id, exception_id, disposition, reason, note, occurred_at, geog, location_text,
    custodian_label, evidence, is_emergency, admin_id, request_id)
  values (p_trip_id, v_x.id, p_disposition, btrim(p_reason), btrim(p_note), p_occurred_at, v_geog, p_location_text,
    p_custodian_label, v_ev, coalesce(p_is_emergency, false), v_actor, p_request_id)
  returning * into v_d;

  update public.trip_exceptions x set status = 'resolved', resolved_at = now(), resolved_by = v_actor,
         resolution_kind = p_disposition::text, resolution_note = btrim(p_note) where x.id = v_x.id;
  update public.trip_assignments a set state = 'revoked', revoked_at = now(), revoke_reason = 'disposicao de carga: ' || p_disposition::text
   where a.trip_id = p_trip_id and a.state in ('offered', 'accepted');
  perform public.trip_end_tracking_sessions(p_trip_id, 'contract_terminal');
  perform public.trip_release_capacity(p_trip_id);
  update public.operational_alerts al set status = 'closed', closed_at = now(), close_reason = 'cargo_disposition_resolved'
   where al.trip_id = p_trip_id and al.status <> 'closed';

  perform set_config('steelgo.trip_guard_context', 'cargo_disposition:' || p_trip_id::text, true);
  update public.operational_trips t
     set status = v_new, previous_status = t.status,
         cancelled_at = case when v_new = 'cancelled' then now() end,
         returned_at = case when v_new = 'returned' then p_occurred_at end,
         cancel_reason = case when v_new = 'cancelled' then btrim(p_reason) end,
         terminal_reason = 'cargo_disposition_resolved', cargo_disposition = p_disposition, cargo_disposition_at = p_occurred_at,
         paused_by_exception_id = null, has_open_critical_exception = false,
         retention_until = now() + make_interval(days => v_pol.raw_retention_days),
         summary_retention_until = now() + make_interval(years => v_pol.summary_retention_years)
   where t.id = p_trip_id;
  perform set_config('steelgo.trip_guard_context', '', true);

  perform public.trip_event_append(p_trip_id, 'cargo_disposition_resolved', v_actor, 'admin', 'resolve_cargo_disposition', v_t.status, v_new,
    btrim(p_note), jsonb_build_object('disposition', p_disposition, 'disposition_id', v_d.id, 'occurred_at', p_occurred_at,
      'location_text', p_location_text, 'custodian_label', p_custodian_label, 'evidence_count', jsonb_array_length(v_ev),
      'is_emergency', coalesce(p_is_emergency, false)),
    p_exception_id => v_x.id, p_request_id => p_request_id, p_fingerprint => v_fp, p_lat => p_lat, p_lng => p_lng);
  if coalesce(p_is_emergency, false) then
    perform public.trip_event_append(p_trip_id, 'emergency_release', v_actor, 'admin', 'resolve_cargo_disposition', null, null,
      btrim(p_reason), jsonb_build_object('disposition_id', v_d.id), p_exception_id => v_x.id);
  end if;
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (p_trip_id, v_actor, 'resolve_cargo_disposition', jsonb_build_object('status', v_t.status, 'loaded_at', v_t.loaded_at),
          jsonb_build_object('status', v_new, 'disposition', p_disposition, 'is_emergency', coalesce(p_is_emergency, false)), p_reason, p_request_id);
  perform public.notify_trip(p_trip_id, 'cargo_disposition_resolved', format('Viagem %s: disposicao da carga registrada', v_t.trip_number),
    format('Desfecho: %s.', p_disposition), true, true, true, false, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('resolve_cargo_disposition', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_new, p_disposition, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.trip_lock(uuid)', 'public.trip_policy(public.operational_trips)', 'public.trip_actor_kind_of(text)',
    'public.company_operational_users(uuid)',
    'public.notify_trip(uuid, text, text, text, boolean, boolean, boolean, boolean, uuid, text)',
    'public.trip_release_capacity(uuid)', 'public.trip_reserve_capacity(uuid, uuid, uuid)',
    'public.trip_end_tracking_sessions(uuid, text)', 'public.driver_label(text)',
    'public.trip_create_core(uuid, uuid, public.trip_actor_kind, text, uuid, text)',
    'public.trip_assign_core(public.operational_trips, uuid, uuid, uuid, public.trip_actor_kind, text, uuid, text, text, boolean)',
    'public.freight_operational_transition(uuid, public.freight_status, uuid, text, uuid)',
    'public.trips_follow_contract_status()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array[
    'public.create_trip_for_contract(uuid, uuid)',
    'public.assign_trip(uuid, uuid, uuid, text, uuid)',
    'public.reassign_trip(uuid, uuid, uuid, text, uuid)',
    'public.respond_trip_assignment(uuid, boolean, text, uuid, timestamptz)',
    'public.start_tracking_session(uuid, uuid, text, public.tracking_provider, text)',
    'public.transition_trip(uuid, public.trip_status, uuid, bigint, timestamptz, numeric, numeric, numeric, text, uuid, text)',
    'public.cancel_trip(uuid, text, uuid)', 'public.pause_trip(uuid, uuid, text, uuid)', 'public.resume_trip(uuid, text, uuid)',
    'public.force_trip_transition(uuid, public.trip_status, text, uuid)',
    'public.resolve_cargo_disposition(uuid, public.cargo_disposition, text, text, timestamptz, numeric, numeric, text, text, jsonb, boolean, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
