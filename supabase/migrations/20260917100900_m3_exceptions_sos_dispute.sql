-- =============================================================================
-- MODULO 3 - 77/81: excecoes operacionais e "Alerta critico operacional" (SOS)
--   * open/acknowledge/resolve_trip_exception; open_sos/acknowledge_sos/escalate_sos/
--     resolve_sos; operational_flags (sos_operational nasce FALSE);
--   * SOS: nao promete central 24h nem contato automatico com autoridades; exibe
--     190/192/193 no aparelho; meta de reconhecimento e indicador (politica);
--     motorista so ve "recebido" apos ack real; escalonamento niveis 1 e 2, sem nivel 3;
--   * open_dispute_case v3: p_exception_id opcional (conversao segura), legal hold
--     da trilha; ordem de locks contracts -> payment_intents -> dispute_cases ->
--     operational_trips -> trip_exceptions (nunca o inverso).
-- =============================================================================
begin;

create table public.operational_flags (
  key        text primary key,
  value      boolean not null,
  reason     text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  request_id uuid
);
alter table public.operational_flags enable row level security;
revoke all on public.operational_flags from public, anon, authenticated, service_role;
grant select on public.operational_flags to service_role;
insert into public.operational_flags (key, value, reason) values
  ('sos_operational', false, 'Nasce desabilitado: exige push homologado por plataforma e scheduler saudavel.'),
  ('push_dispatch_enabled', false, 'Nasce desabilitado: exige segredo no Vault, Edge Function implantada e homologacao real.');

create function public.operational_flag(p_key text)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce((select f.value from public.operational_flags f where f.key = p_key), false);
$fn$;
revoke all on function public.operational_flag(text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- open_trip_exception
-- -----------------------------------------------------------------------------
create function public.open_trip_exception(p_trip_id uuid, p_kind public.trip_exception_kind, p_severity public.trip_exception_severity,
  p_description text, p_command_id uuid, p_captured_at timestamptz, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_evidence jsonb, p_device_id uuid)
returns table (applied boolean, duplicate boolean, rejection_code text, exception_id uuid, severity public.trip_exception_severity)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_role text; v_kind public.trip_actor_kind; v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype;
  v_sev public.trip_exception_severity; v_x public.trip_exceptions%rowtype; v_i integer; v_ev jsonb; v_pt extensions.geography; v_vis public.trip_visibility; v_evid uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'open_trip_exception: sessao obrigatoria'; end if;
  if p_trip_id is null or p_kind is null or p_command_id is null or p_captured_at is null then
    raise exception using errcode = '22004', message = 'open_trip_exception: parametros obrigatorios ausentes';
  end if;
  if p_description is null or length(btrim(p_description)) < 10 then
    raise exception using errcode = '22023', message = 'open_trip_exception: descricao (>= 10)';
  end if;
  if p_kind in ('sos', 'cargo_disposition_required', 'cargo_refusal') then
    raise exception using errcode = '22023', message = format('open_trip_exception: %s tem RPC propria', p_kind);
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null or v_role in ('shipper_viewer', 'carrier_viewer') then
    raise exception using errcode = '42501', message = 'open_trip_exception: papel sem permissao';
  end if;
  if v_role like 'shipper_%' and p_kind not in ('delivery_mismatch', 'cargo_damage', 'document_issue', 'delay', 'other') then
    raise exception using errcode = '42501', message = format('open_trip_exception: embarcador nao abre %s', p_kind);
  end if;
  v_kind := public.trip_actor_kind_of(v_role);
  v_t := public.trip_lock(p_trip_id);
  if exists (select 1 from public.trip_exceptions x where x.trip_id = p_trip_id and x.command_id = p_command_id) then
    select * into v_x from public.trip_exceptions x where x.trip_id = p_trip_id and x.command_id = p_command_id;
    return query select false, true, null::text, v_x.id, v_x.severity; return;
  end if;
  if v_t.status in ('completed', 'cancelled', 'returned') then
    return query select false, false, 'trip_terminal'::text, null::uuid, null::public.trip_exception_severity; return;
  end if;
  if v_role = 'driver' and (select state from public.trip_live_assignment_of_caller(p_trip_id)) <> 'accepted' then
    return query select false, false, 'assignment_not_accepted'::text, null::uuid, null::public.trip_exception_severity; return;
  end if;
  v_pol := public.trip_policy(v_t);
  v_sev := (case p_kind when 'accident' then 'critical' when 'theft' then 'critical'
                        when 'cargo_damage' then greatest(coalesce(p_severity, 'high'::public.trip_exception_severity), 'high'::public.trip_exception_severity)::text
                        when 'delivery_mismatch' then greatest(coalesce(p_severity, 'high'::public.trip_exception_severity), 'high'::public.trip_exception_severity)::text
                        when 'vehicle_breakdown' then greatest(coalesce(p_severity, 'high'::public.trip_exception_severity), 'high'::public.trip_exception_severity)::text
                        else coalesce(p_severity, 'medium'::public.trip_exception_severity)::text end)::public.trip_exception_severity;
  v_ev := coalesce(p_evidence, '[]'::jsonb);
  if jsonb_typeof(v_ev) <> 'array' then raise exception using errcode = '22023', message = 'open_trip_exception: evidencia deve ser array'; end if;
  if p_kind = 'cargo_damage' and jsonb_array_length(v_ev) < 1 then
    raise exception using errcode = '22023', message = 'open_trip_exception: avaria exige foto';
  end if;
  for v_i in 0 .. jsonb_array_length(v_ev) - 1 loop
    perform public.assert_trip_media(p_trip_id, p_command_id, 'evidence', v_ev -> v_i ->> 'path', v_ev -> v_i ->> 'sha256', v_actor);
  end loop;
  if p_lat is not null and p_lng is not null then v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography; end if;
  v_vis := (case when p_kind = 'theft' then 'carrier_admin' else 'parties' end)::public.trip_visibility;
  insert into public.trip_exceptions (trip_id, kind, severity, status, opened_by, opened_by_kind, captured_at, geog, description, visibility, ack_target_at,
    blocks_delivery, command_id, device_id)
  values (p_trip_id, p_kind, v_sev, 'open', v_actor, v_kind, p_captured_at, v_pt, btrim(p_description), v_vis, now() + make_interval(mins => v_pol.alert_ack_target_min),
    v_sev in ('high', 'critical') and p_kind in ('cargo_damage', 'accident', 'theft', 'delivery_mismatch'), p_command_id, p_device_id)
  returning * into v_x;
  for v_i in 0 .. jsonb_array_length(v_ev) - 1 loop
    insert into public.trip_exception_evidence (exception_id, object_path, sha256, size_bytes, mime, captured_at, uploaded_by)
    select v_x.id, v_ev -> v_i ->> 'path', v_ev -> v_i ->> 'sha256', m.size_bytes, m.mime, p_captured_at, v_actor
      from public.assert_trip_media(p_trip_id, p_command_id, 'evidence', v_ev -> v_i ->> 'path', v_ev -> v_i ->> 'sha256', v_actor) m;
  end loop;
  if v_sev = 'critical' then
    update public.operational_trips t set has_open_critical_exception = true where t.id = p_trip_id;
  end if;
  if p_kind in ('accident', 'theft') then
    perform public.trip_apply_legal_hold(p_trip_id, p_kind::text, v_actor, 'open_trip_exception');
  end if;
  v_evid := public.trip_event_append(p_trip_id, 'exception_opened', v_actor, v_kind, 'open_trip_exception', null, null, btrim(p_description),
    jsonb_build_object('exception_id', v_x.id, 'kind', p_kind, 'severity', v_sev, 'evidence_count', jsonb_array_length(v_ev)),
    p_command_id, p_device_id, null, p_captured_at, p_lat, p_lng, p_accuracy_m, p_exception_id => v_x.id);
  update public.trip_exceptions x set event_id = v_evid where x.id = v_x.id;
  perform public.notify_trip(p_trip_id, 'trip_exception_' || p_kind::text, format('Viagem %s: ocorrencia %s (%s)', v_t.trip_number, p_kind, v_sev), btrim(p_description),
    v_vis = 'parties', true, v_role <> 'driver', v_sev in ('high', 'critical'), v_actor, case when v_sev = 'critical' then 'high' else 'normal' end);
  return query select true, false, null::text, v_x.id, v_sev;
end $fn$;

-- -----------------------------------------------------------------------------
-- acknowledge_trip_exception / resolve_trip_exception
-- -----------------------------------------------------------------------------
create function public.acknowledge_trip_exception(p_exception_id uuid, p_note text, p_request_id uuid)
returns table (status public.trip_exception_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_x public.trip_exceptions%rowtype; v_role text; v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'acknowledge_trip_exception: sessao obrigatoria'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('exc', p_exception_id, 'note', p_note));
  v_log := public.rpc_idempotency_probe('acknowledge_trip_exception', p_request_id, v_actor, p_exception_id, v_fp);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id;
  if not found then raise exception using errcode = 'P0002', message = 'acknowledge_trip_exception: excecao inexistente'; end if;
  if v_log.id is not null then return query select v_x.status, true; return; end if;
  if v_x.kind in ('sos') then raise exception using errcode = '22023', message = 'acknowledge_trip_exception: use acknowledge_sos'; end if;
  v_role := public.trip_role_of(v_x.trip_id);
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator') then
    raise exception using errcode = '42501', message = 'acknowledge_trip_exception: somente transportadora (owner/operator) ou administrador';
  end if;
  v_t := public.trip_lock(v_x.trip_id);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
  if v_x.status not in ('open', 'escalated') then
    raise exception using errcode = '22023', message = format('acknowledge_trip_exception: excecao em %s', v_x.status);
  end if;
  update public.trip_exceptions x set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = v_actor,
         acknowledged_by_kind = public.trip_actor_kind_of(v_role), assigned_admin = case when v_role = 'admin' then v_actor else x.assigned_admin end
   where x.id = p_exception_id;
  perform public.trip_event_append(v_x.trip_id, 'exception_acknowledged', v_actor, public.trip_actor_kind_of(v_role), 'acknowledge_trip_exception', null, null,
    coalesce(p_note, ''), jsonb_build_object('exception_id', p_exception_id), p_exception_id => p_exception_id, p_request_id => p_request_id, p_fingerprint => v_fp);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('acknowledge_trip_exception', p_request_id, v_actor, p_exception_id, v_fp, 'accepted');
  return query select 'acknowledged'::public.trip_exception_status, false;
end $fn$;

create function public.resolve_trip_exception(p_exception_id uuid, p_resolution_kind text, p_note text, p_request_id uuid)
returns table (status public.trip_exception_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_x public.trip_exceptions%rowtype; v_role text; v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype; v_crit boolean;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'resolve_trip_exception: sessao obrigatoria'; end if;
  if p_note is null or length(btrim(p_note)) < 20 then raise exception using errcode = '22023', message = 'resolve_trip_exception: nota (>= 20)'; end if;
  if p_resolution_kind is null or length(btrim(p_resolution_kind)) < 3 then raise exception using errcode = '22023', message = 'resolve_trip_exception: resolution_kind obrigatorio'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('exc', p_exception_id, 'kind', p_resolution_kind, 'note', p_note));
  v_log := public.rpc_idempotency_probe('resolve_trip_exception', p_request_id, v_actor, p_exception_id, v_fp);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id;
  if not found then raise exception using errcode = 'P0002', message = 'resolve_trip_exception: excecao inexistente'; end if;
  if v_log.id is not null then return query select v_x.status, true; return; end if;
  if v_x.kind in ('sos', 'cargo_refusal', 'delivery_mismatch', 'cargo_disposition_required') then
    raise exception using errcode = '22023', message = format('resolve_trip_exception: %s tem RPC de resolucao propria', v_x.kind);
  end if;
  v_role := public.trip_role_of(v_x.trip_id);
  if v_role = 'admin' then null;
  elsif v_role in ('carrier_owner', 'carrier_operator') and v_x.kind in ('delay', 'vehicle_breakdown', 'document_issue', 'long_stop', 'comm_loss', 'route_deviation', 'other') then null;
  else raise exception using errcode = '42501', message = 'resolve_trip_exception: papel sem permissao para este tipo'; end if;
  v_t := public.trip_lock(v_x.trip_id);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
  if v_x.status in ('resolved', 'converted_to_dispute') then
    raise exception using errcode = '22023', message = 'resolve_trip_exception: excecao ja encerrada';
  end if;
  update public.trip_exceptions x set status = 'resolved', resolved_at = now(), resolved_by = v_actor, resolution_kind = btrim(p_resolution_kind), resolution_note = btrim(p_note)
   where x.id = p_exception_id;
  select exists (select 1 from public.trip_exceptions y where y.trip_id = v_t.id and y.severity = 'critical' and y.status not in ('resolved', 'converted_to_dispute')) into v_crit;
  update public.operational_trips t set has_open_critical_exception = v_crit,
         paused_by_exception_id = case when t.paused_by_exception_id = p_exception_id then null else t.paused_by_exception_id end,
         tracking_state = case when t.paused_by_exception_id = p_exception_id and t.tracking_state = 'paused' then 'active' else t.tracking_state end
   where t.id = v_t.id;
  if v_x.kind in ('accident', 'theft') then perform public.trip_settle_legal_hold(v_t.id, v_actor, 'resolve_trip_exception'); end if;
  perform public.trip_event_append(v_t.id, 'exception_resolved', v_actor, public.trip_actor_kind_of(v_role), 'resolve_trip_exception', null, null, btrim(p_note),
    jsonb_build_object('exception_id', p_exception_id, 'resolution_kind', btrim(p_resolution_kind)), p_exception_id => p_exception_id, p_request_id => p_request_id, p_fingerprint => v_fp);
  if v_role = 'admin' then
    insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
    values (v_t.id, v_actor, 'resolve_trip_exception', jsonb_build_object('exception_id', p_exception_id, 'status', v_x.status), jsonb_build_object('status', 'resolved', 'resolution_kind', p_resolution_kind), p_note, p_request_id);
  end if;
  perform public.notify_trip(v_t.id, 'trip_exception_resolved', format('Viagem %s: ocorrencia %s resolvida', v_t.trip_number, v_x.kind), btrim(p_note), v_x.visibility = 'parties', true, true, false, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('resolve_trip_exception', p_request_id, v_actor, p_exception_id, v_fp, 'accepted');
  return query select 'resolved'::public.trip_exception_status, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- SOS = "Alerta critico operacional"
-- -----------------------------------------------------------------------------
create function public.open_sos(p_trip_id uuid, p_command_id uuid, p_captured_at timestamptz, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_device_id uuid, p_note text)
returns table (applied boolean, duplicate boolean, rejection_code text, exception_id uuid, sos_mode text, ack_target_at timestamptz)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_role text; v_kind public.trip_actor_kind; v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype;
  v_x public.trip_exceptions%rowtype; v_pt extensions.geography; v_mode text; v_ev uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'open_sos: sessao obrigatoria'; end if;
  if p_trip_id is null or p_command_id is null or p_captured_at is null then
    raise exception using errcode = '22004', message = 'open_sos: parametros obrigatorios ausentes';
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role not in ('driver', 'carrier_owner', 'carrier_operator', 'admin') then
    raise exception using errcode = '42501', message = 'open_sos: papel sem permissao';
  end if;
  v_kind := public.trip_actor_kind_of(v_role);
  v_mode := case when public.operational_flag('sos_operational') then 'operational' else 'homologation' end;
  v_t := public.trip_lock(p_trip_id);
  if exists (select 1 from public.trip_exceptions x where x.trip_id = p_trip_id and x.command_id = p_command_id) then
    select * into v_x from public.trip_exceptions x where x.trip_id = p_trip_id and x.command_id = p_command_id;
    return query select false, true, null::text, v_x.id, v_mode, v_x.ack_target_at; return;
  end if;
  select * into v_x from public.trip_exceptions x where x.trip_id = p_trip_id and x.kind = 'sos' and x.status not in ('resolved', 'converted_to_dispute');
  if found then
    return query select false, false, 'sos_already_open'::text, v_x.id, v_mode, v_x.ack_target_at; return;
  end if;
  if v_t.status in ('planned', 'completed', 'cancelled', 'returned') then
    return query select false, false, 'trip_not_active'::text, null::uuid, v_mode, null::timestamptz; return;
  end if;
  v_pol := public.trip_policy(v_t);
  if p_lat is not null and p_lng is not null then v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography; end if;
  insert into public.trip_exceptions (trip_id, kind, severity, status, opened_by, opened_by_kind, captured_at, geog, description, visibility, ack_target_at, blocks_delivery, command_id, device_id)
  values (p_trip_id, 'sos', 'critical', 'open', v_actor, v_kind, p_captured_at, v_pt,
    'Alerta critico operacional acionado' || case when v_role = 'driver' then ' pelo motorista' else ' pela transportadora/SteelGo' end || coalesce(': ' || btrim(p_note), '') || '.',
    'carrier_admin', now() + make_interval(mins => v_pol.sos_ack_target_min), true, p_command_id, p_device_id)
  returning * into v_x;
  update public.operational_trips t set has_open_critical_exception = true where t.id = p_trip_id;
  perform public.trip_apply_legal_hold(p_trip_id, 'sos', v_actor, 'open_sos');
  perform public.trip_alert_open(v_t, 'sos', 'critical', jsonb_build_object('exception_id', v_x.id, 'mode', v_mode, 'message', 'ALERTA CRITICO OPERACIONAL acionado.'), 'open_sos');
  v_ev := public.trip_event_append(p_trip_id, 'sos_opened', v_actor, v_kind, 'open_sos', null, null, coalesce(btrim(p_note), 'Alerta critico acionado.'),
    jsonb_build_object('exception_id', v_x.id, 'mode', v_mode, 'ack_target_at', v_x.ack_target_at), p_command_id, p_device_id, null, p_captured_at, p_lat, p_lng, p_accuracy_m, p_exception_id => v_x.id);
  update public.trip_exceptions x set event_id = v_ev where x.id = v_x.id;
  perform public.notify_trip(p_trip_id, 'sos_opened', format('ALERTA CRITICO - viagem %s', v_t.trip_number),
    'Alerta critico operacional acionado. Reconheca na Control Tower. Nenhum servico de emergencia e acionado automaticamente.' ||
    case when v_mode = 'homologation' then ' [EM HOMOLOGACAO]' else '' end, false, true, false, true, v_actor, 'high');
  return query select true, false, null::text, v_x.id, v_mode, v_x.ack_target_at;
end $fn$;

create function public.acknowledge_sos(p_exception_id uuid, p_note text, p_request_id uuid)
returns table (acknowledged_at timestamptz, acknowledged_by_kind public.trip_actor_kind, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_x public.trip_exceptions%rowtype; v_role text; v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype; v_k public.trip_actor_kind;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'acknowledge_sos: sessao obrigatoria'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('exc', p_exception_id));
  v_log := public.rpc_idempotency_probe('acknowledge_sos', p_request_id, v_actor, p_exception_id, v_fp);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id;
  if not found or v_x.kind <> 'sos' then raise exception using errcode = 'P0002', message = 'acknowledge_sos: alerta critico inexistente'; end if;
  if v_log.id is not null then return query select v_x.acknowledged_at, v_x.acknowledged_by_kind, true; return; end if;
  v_role := public.trip_role_of(v_x.trip_id);
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator') then
    raise exception using errcode = '42501', message = 'acknowledge_sos: somente transportadora (owner/operator) ou administrador';
  end if;
  v_k := public.trip_actor_kind_of(v_role);
  v_t := public.trip_lock(v_x.trip_id);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
  if v_x.acknowledged_at is not null then
    return query select v_x.acknowledged_at, v_x.acknowledged_by_kind, false; return;
  end if;
  update public.trip_exceptions x set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = v_actor, acknowledged_by_kind = v_k,
         assigned_admin = case when v_role = 'admin' then v_actor else x.assigned_admin end where x.id = p_exception_id;
  update public.operational_alerts a set status = 'acknowledged', acknowledged_by = v_actor, acknowledged_at = now(), ack_note = p_note
   where a.trip_id = v_t.id and a.kind = 'sos' and a.status = 'open';
  perform public.trip_event_append(v_t.id, 'sos_acknowledged', v_actor, v_k, 'acknowledge_sos', null, null, coalesce(p_note, ''),
    jsonb_build_object('exception_id', p_exception_id, 'within_target', now() <= v_x.ack_target_at, 'seconds_to_ack', extract(epoch from (now() - v_x.captured_at))),
    p_exception_id => p_exception_id, p_request_id => p_request_id, p_fingerprint => v_fp);
  -- motorista SO agora ve "recebido" (ack real)
  perform public.notify_trip(v_t.id, 'sos_acknowledged', 'Alerta critico recebido',
    format('Seu alerta foi recebido por %s as %s.', case when v_k = 'admin' then 'Equipe SteelGo' else 'sua transportadora' end, to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI')),
    false, false, true, false, v_actor, 'high');
  perform public.notify_trip(v_t.id, 'sos_acknowledged', format('Alerta critico da viagem %s reconhecido', v_t.trip_number), format('Reconhecido por %s.', case when v_k = 'admin' then 'Equipe SteelGo' else 'transportadora' end), false, true, false, true, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('acknowledge_sos', p_request_id, v_actor, p_exception_id, v_fp, 'accepted');
  return query select now(), v_k, false;
end $fn$;

create function public.escalate_sos(p_exception_id uuid, p_note text, p_request_id uuid)
returns table (escalation_level integer, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('escalate_sos'); v_x public.trip_exceptions%rowtype; v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype;
begin
  if p_note is null or length(btrim(p_note)) < 10 then raise exception using errcode = '22023', message = 'escalate_sos: nota (>= 10)'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('exc', p_exception_id, 'note', p_note));
  v_log := public.rpc_idempotency_probe('escalate_sos', p_request_id, v_actor, p_exception_id, v_fp);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id;
  if not found or v_x.kind <> 'sos' then raise exception using errcode = 'P0002', message = 'escalate_sos: alerta critico inexistente'; end if;
  if v_log.id is not null then return query select v_x.escalation_level, true; return; end if;
  v_t := public.trip_lock(v_x.trip_id);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
  if v_x.status in ('resolved', 'converted_to_dispute') then raise exception using errcode = '22023', message = 'escalate_sos: alerta encerrado'; end if;
  if v_x.escalation_level >= 2 then raise exception using errcode = '22023', message = 'escalate_sos: nivel maximo (2) atingido; nao existe nivel 3'; end if;
  update public.trip_exceptions x set escalation_level = x.escalation_level + 1, escalated_at = now(), status = case when x.status = 'open' then 'escalated' else x.status end where x.id = p_exception_id;
  perform public.trip_event_append(v_t.id, 'sos_escalated', v_actor, 'admin', 'escalate_sos', null, null, btrim(p_note), jsonb_build_object('level', v_x.escalation_level + 1, 'manual', true),
    p_exception_id => p_exception_id, p_request_id => p_request_id, p_fingerprint => v_fp);
  perform public.notify_trip(v_t.id, 'sos_escalated', format('ALERTA CRITICO escalonado (nivel %s) - viagem %s', v_x.escalation_level + 1, v_t.trip_number), btrim(p_note), false, true, false, true, v_actor, 'high');
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (v_t.id, v_actor, 'escalate_sos', jsonb_build_object('level', v_x.escalation_level), jsonb_build_object('level', v_x.escalation_level + 1), p_note, p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('escalate_sos', p_request_id, v_actor, p_exception_id, v_fp, 'accepted');
  return query select v_x.escalation_level + 1, false;
end $fn$;

create function public.resolve_sos(p_exception_id uuid, p_outcome text, p_note text, p_request_id uuid)
returns table (status public.trip_exception_status, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('resolve_sos'); v_x public.trip_exceptions%rowtype; v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype; v_crit boolean;
begin
  if p_note is null or length(btrim(p_note)) < 20 then raise exception using errcode = '22023', message = 'resolve_sos: nota (>= 20)'; end if;
  if p_outcome not in ('false_alarm', 'assisted', 'authorities_contacted_by_user', 'other') then
    raise exception using errcode = '22023', message = 'resolve_sos: desfecho invalido';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('exc', p_exception_id, 'outcome', p_outcome, 'note', p_note));
  v_log := public.rpc_idempotency_probe('resolve_sos', p_request_id, v_actor, p_exception_id, v_fp);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id;
  if not found or v_x.kind <> 'sos' then raise exception using errcode = 'P0002', message = 'resolve_sos: alerta critico inexistente'; end if;
  if v_log.id is not null then return query select v_x.status, true; return; end if;
  v_t := public.trip_lock(v_x.trip_id);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
  if v_x.status in ('resolved', 'converted_to_dispute') then raise exception using errcode = '22023', message = 'resolve_sos: ja encerrado'; end if;
  if v_x.acknowledged_at is null then raise exception using errcode = '22023', message = 'resolve_sos: alerta ainda nao reconhecido'; end if;
  update public.trip_exceptions x set status = 'resolved', resolved_at = now(), resolved_by = v_actor, resolution_kind = p_outcome, resolution_note = btrim(p_note) where x.id = p_exception_id;
  select exists (select 1 from public.trip_exceptions y where y.trip_id = v_t.id and y.severity = 'critical' and y.status not in ('resolved', 'converted_to_dispute')) into v_crit;
  update public.operational_trips t set has_open_critical_exception = v_crit where t.id = v_t.id;
  perform public.trip_alert_close(v_t.id, 'sos', 'resolved:' || p_outcome, 'resolve_sos');
  perform public.trip_settle_legal_hold(v_t.id, v_actor, 'resolve_sos');
  perform public.trip_event_append(v_t.id, 'sos_resolved', v_actor, 'admin', 'resolve_sos', null, null, btrim(p_note), jsonb_build_object('exception_id', p_exception_id, 'outcome', p_outcome),
    p_exception_id => p_exception_id, p_request_id => p_request_id, p_fingerprint => v_fp);
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (v_t.id, v_actor, 'resolve_sos', jsonb_build_object('status', v_x.status), jsonb_build_object('status', 'resolved', 'outcome', p_outcome), p_note, p_request_id);
  perform public.notify_trip(v_t.id, 'sos_resolved', format('Alerta critico da viagem %s encerrado', v_t.trip_number), btrim(p_note), false, true, true, true, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('resolve_sos', p_request_id, v_actor, p_exception_id, v_fp, 'accepted');
  return query select 'resolved'::public.trip_exception_status, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- open_dispute_case v3 (mesma logica M2 + p_exception_id + legal hold da viagem)
-- -----------------------------------------------------------------------------
drop function public.open_dispute_case(uuid, public.dispute_reason_code, text, numeric, text, uuid);
create function public.open_dispute_case(p_contract_id uuid, p_reason_code public.dispute_reason_code, p_description text, p_disputed_amount numeric, p_statement text, p_request_id uuid, p_exception_id uuid default null)
 returns table(case_id uuid, case_number text, dispute_state public.dispute_status, release_suspended boolean, was_replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid := (select auth.uid());
  v_c      public.contracts%rowtype;
  v_i      public.payment_intents%rowtype;
  v_party  text;
  v_fp     text;
  v_log    public.rpc_call_log%rowtype;
  v_case   uuid;
  v_num    text;
  v_claim  uuid;
  v_susp   boolean := false;
  v_state  public.dispute_status;
  v_my_co  uuid;
  v_oth_co uuid;
  v_oth_ow uuid;
  v_t      public.operational_trips%rowtype;
  v_x      public.trip_exceptions%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'open_dispute_case: chamador nao autenticado';
  end if;
  if p_contract_id is null or p_reason_code is null then
    raise exception using errcode = '22004',
      message = 'open_dispute_case: contrato e motivo sao obrigatorios';
  end if;
  if p_description is null or length(btrim(p_description)) < 20 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: descricao e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  if p_statement is null or length(btrim(p_statement)) < 20 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: a alegacao de quem abre e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  if p_disputed_amount is null or p_disputed_amount <= 0 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado tem de ser positivo';
  end if;
  if scale(p_disputed_amount) > 2 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado com mais de duas casas decimais';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'reason_code', p_reason_code::text,
    'disputed_amount', p_disputed_amount::text, 'exception_id', p_exception_id));
  v_log := public.rpc_idempotency_probe(
    'open_dispute_case', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select d.id, d.case_number, d.status into v_case, v_num, v_state
      from public.dispute_cases d where d.contract_id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select v_case, v_num, v_state, coalesce(v_i.release_blocked_by_dispute, false), true;
    return;
  end if;

  -- locks: contrato -> intent (o caso ainda nao existe)
  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'open_dispute_case: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id for update;

  -- SOMENTE PROPRIETARIOS das empresas do contrato. Motorista e administrador
  -- nao abrem disputa.
  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is null then
    raise exception using errcode = '42501',
      message = 'open_dispute_case: somente o proprietario da empresa embarcadora ou da '
                'transportadora do contrato abre disputa';
  end if;

  -- UMA DISPUTA POR CONTRATO, PERMANENTE: verificado antes do status, para a
  -- mensagem dizer a causa real (o contrato 'disputed' e consequencia do caso)
  if exists (select 1 from public.dispute_cases d where d.contract_id = p_contract_id) then
    raise exception using errcode = '23505',
      message = 'open_dispute_case: este contrato ja possui disputa registrada; e admitida uma '
                'unica disputa por contrato';
  end if;

  if v_c.status = 'active'::public.contract_status then
    null;
  elsif v_c.status = 'completed'::public.contract_status then
    if v_c.completed_at is null or now() > v_c.completed_at + interval '7 days' then
      raise exception using errcode = '22023',
        message = format('open_dispute_case: prazo de disputa encerrado em %s (7 dias apos a '
                         'conclusao do contrato)',
                         coalesce((v_c.completed_at + interval '7 days')::text, 'data desconhecida'));
    end if;
    if v_i.id is null or v_i.internal_status not in ('released_confirmed'::public.payment_internal_status,
                                                      'settled'::public.payment_internal_status) then
      raise exception using errcode = '22023',
        message = format('open_dispute_case: contrato concluido sem estado financeiro governado '
                         '(%s); inconsistencia - a disputa nao pode ser aberta',
                         coalesce(v_i.internal_status::text, 'sem intencao de pagamento'));
    end if;
  else
    raise exception using errcode = '22023',
      message = format('open_dispute_case: contrato em %s; disputa so se abre sobre contrato '
                       'active ou completed (ate 7 dias)', v_c.status);
  end if;
  if p_disputed_amount > coalesce(v_c.total_amount_brl, 0) then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado maior que o valor do contrato';
  end if;
  if v_party = 'shipper' then
    v_my_co := v_c.shipper_company_id; v_oth_co := v_c.carrier_company_id;
  else
    v_my_co := v_c.carrier_company_id; v_oth_co := v_c.shipper_company_id;
  end if;
  select co.owner_id into v_oth_ow from public.companies co where co.id = v_oth_co;

  v_num := 'SG-D-' || to_char(now(), 'YYYYMMDD') || '-'
           || upper(right(replace(p_contract_id::text, '-', ''), 8));

  insert into public.dispute_cases (
    case_number, contract_id, freight_id, payment_intent_id,
    opened_by, opened_by_role, reason_code, description,
    disputed_amount, currency_code, status, priority, due_at,
    previous_contract_status, settlement_state
  ) values (
    v_num, p_contract_id, v_c.freight_id, v_i.id,
    v_actor, 'claimant', p_reason_code, p_description,
    p_disputed_amount, 'BRL', 'open', 'normal', now() + interval '7 days',
    v_c.status, 'undecided'
  )
  returning id into v_case;

  -- as DUAS partes, desde a abertura
  insert into public.dispute_parties (case_id, user_id, company_id, role, added_by)
  values (v_case, v_actor, v_my_co, 'claimant', v_actor),
         (v_case, v_oth_ow, v_oth_co, 'respondent', v_actor);

  insert into public.dispute_claims (
    case_id, claimed_by, claimed_by_role, reason_code, statement, claimed_amount, currency_code
  ) values (v_case, v_actor, 'claimant', p_reason_code, p_statement, p_disputed_amount, 'BRL')
  returning id into v_claim;

  -- SUSPENSAO DA LIBERACAO AINDA NAO CONFIRMADA. Pagamento ja repassado ou ja
  -- liquidado nao e tocado: o efeito sera uma obrigacao de recuperacao.
  if v_i.id is not null
     and v_i.internal_status not in ('released_confirmed'::public.payment_internal_status,
                                     'settled'::public.payment_internal_status) then
    update public.payment_intents pi set release_blocked_by_dispute = true where pi.id = v_i.id;
    v_susp := true;
    perform public.payment_event_append(
      v_i.id, 'release_blocked_by_dispute', v_i.internal_status,
      null, null, null, null, 'internal', v_actor, 'party', null, null, null, null,
      format('Liberacao suspensa pela abertura do caso %s.', v_num),
      'open_dispute_case', p_request_id, v_fp);
  end if;

  perform public.dispute_event_append(
    v_case, 'opened', 'open'::public.dispute_status, null, null, v_claim,
    v_actor, 'party', p_description, 'open_dispute_case', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'disputed'::public.contract_lifecycle_transition,
    'disputed'::public.contract_status, v_c.escrow_status,
    null, null, v_i.id, v_case, p_disputed_amount,
    v_actor, 'party', format('Disputa %s aberta.', v_num),
    'open_dispute_case', p_request_id, v_fp);

  perform public.notify_dispute_case(
    v_case, 'dispute_opened', format('Disputa %s aberta', v_num),
    format('Uma disputa foi aberta sobre o contrato %s. Valor contestado: R$ %s.',
           coalesce(v_c.contract_number, left(p_contract_id::text, 8)), p_disputed_amount),
    v_actor, true);

  -- MODULO 3: viagem operacional do contrato (ordem de locks: contracts -> payment_intents
  -- -> dispute_cases -> operational_trips -> trip_exceptions). Legal hold da trilha e,
  -- se informada, conversao da excecao de viagem em disputa.
  select * into v_t from public.operational_trips t where t.contract_id = p_contract_id
   order by (t.status not in ('completed', 'cancelled', 'returned')) desc, t.attempt_number desc limit 1 for update;
  if found then
    perform public.trip_apply_legal_hold(v_t.id, 'dispute_open', v_actor, 'open_dispute_case');
    if p_exception_id is not null then
      select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
      if not found or v_x.trip_id <> v_t.id then
        raise exception using errcode = '22023',
          message = 'open_dispute_case: excecao nao pertence a viagem deste contrato';
      end if;
      if v_x.kind not in ('delivery_mismatch', 'cargo_damage', 'cargo_refusal', 'delay', 'document_issue', 'other') then
        raise exception using errcode = '22023',
          message = format('open_dispute_case: excecao %s nao origina disputa', v_x.kind);
      end if;
      if v_x.status = 'converted_to_dispute' then
        raise exception using errcode = '23505',
          message = 'open_dispute_case: excecao ja convertida em disputa';
      end if;
      if v_x.status = 'resolved' then
        -- corrida: a excecao foi resolvida (operacionalmente) antes de a disputa abrir.
        -- A disputa abre mesmo assim; a excecao nao e reaberta nem convertida (fato historico).
        perform public.dispute_event_append(v_case, 'comment_added', 'open'::public.dispute_status, null, null, null, v_actor, 'party',
          format('Origem operacional: excecao %s (%s) da viagem %s, ja resolvida em %s (%s).', v_x.kind, v_x.severity, v_t.trip_number,
                 to_char(v_x.resolved_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI"Z"'), coalesce(v_x.resolution_kind, '-')),
          'open_dispute_case', gen_random_uuid(), v_fp, null, null, null);
      else
        update public.trip_exceptions x
           set status = 'converted_to_dispute', resolved_at = now(), resolved_by = v_actor,
               resolution_kind = 'open_dispute', resolution_note = 'Convertida em disputa ' || v_num, dispute_case_id = v_case
         where x.id = p_exception_id;
        perform public.trip_event_append(v_t.id, 'exception_resolved', v_actor, 'shipper'::public.trip_actor_kind, 'open_dispute_case',
          null, null, format('Excecao convertida na disputa %s.', v_num),
          jsonb_build_object('exception_id', p_exception_id, 'dispute_case_id', v_case), p_exception_id => p_exception_id,
          p_request_id => p_request_id, p_fingerprint => v_fp);
        perform public.dispute_event_append(v_case, 'comment_added', 'open'::public.dispute_status, null, null, null, v_actor, 'party',
          format('Origem operacional: excecao %s (%s) da viagem %s.', v_x.kind, v_x.severity, v_t.trip_number),
          'open_dispute_case', gen_random_uuid(), v_fp, null, null, null);
      end if;
    end if;
  elsif p_exception_id is not null then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: contrato sem viagem operacional; p_exception_id nao se aplica';
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('open_dispute_case', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('caso %s aberto pela empresa %s (%s); liberacao %s', v_num, v_my_co, v_party,
                 case when v_susp then 'SUSPENSA' else 'nao suspensa' end));

  return query select v_case, v_num, 'open'::public.dispute_status, v_susp, false;
end;
$function$;
revoke all on function public.open_dispute_case(uuid, public.dispute_reason_code, text, numeric, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.open_dispute_case(uuid, public.dispute_reason_code, text, numeric, text, uuid, uuid) to authenticated, service_role;

-- trigger contratual: ao retomar/encerrar, acomodar legal hold da disputa
create or replace function public.trips_follow_contract_status_after()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_t record;
begin
  if NEW.status in ('active'::public.contract_status, 'completed'::public.contract_status, 'cancelled'::public.contract_status)
     and OLD.status = 'disputed'::public.contract_status then
    for v_t in select t.id from public.operational_trips t where t.contract_id = NEW.id loop
      perform public.trip_settle_legal_hold(v_t.id, null, 'contracts:' || NEW.status::text);
    end loop;
  end if;
  return NEW;
end $fn$;
create trigger contracts_status_follow_trips_after after update of status on public.contracts
  for each row when (OLD.status is distinct from NEW.status)
  execute function public.trips_follow_contract_status_after();

-- Disputa encerrada (withdrawn/closed): o hold "dispute_open" das viagens do contrato vira cauda.
-- O gatilho de contracts nao basta: no withdraw o contrato volta a active ANTES de o caso mudar de status.
create function public.dispute_cases_settle_trip_holds()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_t record;
begin
  if NEW.status in ('closed'::public.dispute_status, 'withdrawn'::public.dispute_status) then
    for v_t in select t.id from public.operational_trips t where t.contract_id = NEW.contract_id and t.legal_hold_reason = 'dispute_open' loop
      perform public.trip_settle_legal_hold(v_t.id, null, 'dispute_cases:' || NEW.status::text);
    end loop;
  end if;
  return NEW;
end $fn$;
create trigger dispute_cases_settle_trip_holds_trg after update of status on public.dispute_cases
  for each row when (OLD.status is distinct from NEW.status)
  execute function public.dispute_cases_settle_trip_holds();

-- GRANTS
do $$
declare v_sig text;
begin
  foreach v_sig in array array['public.operational_flag(text)', 'public.trips_follow_contract_status_after()', 'public.dispute_cases_settle_trip_holds()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array[
    'public.open_trip_exception(uuid, public.trip_exception_kind, public.trip_exception_severity, text, uuid, timestamptz, numeric, numeric, numeric, jsonb, uuid)',
    'public.acknowledge_trip_exception(uuid, text, uuid)', 'public.resolve_trip_exception(uuid, text, text, uuid)',
    'public.open_sos(uuid, uuid, timestamptz, numeric, numeric, numeric, uuid, text)', 'public.acknowledge_sos(uuid, text, uuid)',
    'public.escalate_sos(uuid, text, uuid)', 'public.resolve_sos(uuid, text, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
