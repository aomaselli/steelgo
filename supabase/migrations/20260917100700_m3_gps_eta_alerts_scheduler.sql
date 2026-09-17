-- =============================================================================
-- MODULO 3 - 75/81: GPS, ETA, alertas, scheduler, retencao e legal hold
--   * ingest_trip_locations: lote idempotente (pk trip/device/seq), flags por
--     politica congelada, posicao corrente, ETA interno "estimativa operacional";
--   * alertas apenas de silencio, parada, falta de progresso, afastamento e atraso.
--     route_deviation SOMENTE com corredor confiavel (geofence 'corridor', admin);
--   * run_operational_scheduler: pg_cron a cada minuto, advisory lock, idempotente,
--     registra scheduler_runs; escalonamento de SOS (nivel 1 e 2; sem nivel 3);
--   * retencao: retention_until/legal_hold; purga bruta SO por RPC governada
--     (gera resumo + fatos operacionais antes); toda leitura bruta e auditada (79).
-- =============================================================================
begin;

create function public.steelgo_now()
returns timestamptz language sql stable set search_path = '' as $fn$
  select case when session_user = 'postgres'
              then coalesce(nullif(current_setting('steelgo.test_now', true), '')::timestamptz, now())
              else now() end;
$fn$;
revoke all on function public.steelgo_now() from public, anon, authenticated, service_role;

create table public.scheduler_runs (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind in ('operational_tick', 'push_dispatch', 'housekeeping')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  outcome          text not null default 'running' check (outcome in ('running', 'ok', 'skipped_overlap', 'error')),
  trips_scanned    integer not null default 0,
  alerts_opened    integer not null default 0,
  alerts_closed    integer not null default 0,
  alerts_escalated integer not null default 0,
  pushes_enqueued  integer not null default 0,
  purges           integer not null default 0,
  error            text
);
alter table public.scheduler_runs enable row level security;
revoke all on public.scheduler_runs from public, anon, authenticated, service_role;
grant select on public.scheduler_runs to service_role;

-- -----------------------------------------------------------------------------
-- legal hold helpers
-- -----------------------------------------------------------------------------
create function public.trip_apply_legal_hold(p_trip_id uuid, p_reason text, p_actor uuid, p_rpc text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_t public.operational_trips%rowtype;
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id for update;
  if not found then return; end if;
  if v_t.legal_hold_reason is null or v_t.legal_hold_until < 'infinity'::timestamptz then
    update public.operational_trips t set legal_hold_reason = p_reason, legal_hold_until = 'infinity'::timestamptz where t.id = p_trip_id;
    perform public.trip_event_append(p_trip_id, 'legal_hold_set', p_actor, (case when p_actor is null then 'system' else 'admin' end)::public.trip_actor_kind, p_rpc,
      null, null, 'Legal hold aplicado: ' || p_reason, jsonb_build_object('reason', p_reason));
  end if;
end $fn$;

-- ao encerrar o evento que motivou o hold: hold vira cauda (tail) da politica
create function public.trip_settle_legal_hold(p_trip_id uuid, p_actor uuid, p_rpc text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype; v_open boolean;
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id for update;
  if not found or v_t.legal_hold_reason is null then return; end if;
  if v_t.legal_hold_reason = 'legal_hold_admin' then return; end if; -- so admin libera
  v_open := exists (select 1 from public.trip_exceptions x where x.trip_id = p_trip_id
                     and x.kind in ('sos', 'accident', 'theft') and x.status not in ('resolved', 'converted_to_dispute'))
         or exists (select 1 from public.dispute_cases d where d.contract_id = v_t.contract_id
                     and d.status in ('open', 'under_review', 'awaiting_evidence', 'decided'));
  if v_open then return; end if;
  v_pol := public.trip_policy(v_t);
  update public.operational_trips t set legal_hold_until = public.steelgo_now() + make_interval(days => v_pol.legal_hold_tail_days)
   where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'legal_hold_set', p_actor, (case when p_actor is null then 'system' else 'admin' end)::public.trip_actor_kind, p_rpc,
    null, null, format('Evento encerrado; hold mantido por %s dias (cauda da politica).', v_pol.legal_hold_tail_days),
    jsonb_build_object('legal_hold_until', public.steelgo_now() + make_interval(days => v_pol.legal_hold_tail_days)));
end $fn$;

create function public.set_trip_legal_hold(p_trip_id uuid, p_note text, p_request_id uuid)
returns table (legal_hold_reason text, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('set_trip_legal_hold'); v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype;
begin
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023', message = 'set_trip_legal_hold: nota (>= 20)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'note', p_note));
  v_log := public.rpc_idempotency_probe('set_trip_legal_hold', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id; return query select v_t.legal_hold_reason, true; return;
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.raw_locations_purged_at is not null then
    raise exception using errcode = '22023', message = 'set_trip_legal_hold: trilha bruta ja purgada';
  end if;
  update public.operational_trips t set legal_hold_reason = 'legal_hold_admin', legal_hold_until = 'infinity'::timestamptz where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'legal_hold_set', v_actor, 'admin', 'set_trip_legal_hold', null, null, btrim(p_note),
    jsonb_build_object('reason', 'legal_hold_admin'), p_request_id => p_request_id, p_fingerprint => v_fp);
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (p_trip_id, v_actor, 'set_trip_legal_hold', jsonb_build_object('legal_hold_reason', v_t.legal_hold_reason),
          jsonb_build_object('legal_hold_reason', 'legal_hold_admin'), p_note, p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('set_trip_legal_hold', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select 'legal_hold_admin'::text, false;
end $fn$;

create function public.release_trip_legal_hold(p_trip_id uuid, p_note text, p_request_id uuid)
returns table (legal_hold_until timestamptz, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('release_trip_legal_hold'); v_fp text; v_log public.rpc_call_log%rowtype;
        v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype; v_until timestamptz;
begin
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023', message = 'release_trip_legal_hold: nota (>= 20)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'note', p_note));
  v_log := public.rpc_idempotency_probe('release_trip_legal_hold', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id; return query select v_t.legal_hold_until, true; return;
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.legal_hold_reason is null then
    raise exception using errcode = '22023', message = 'release_trip_legal_hold: viagem sem legal hold';
  end if;
  if exists (select 1 from public.trip_exceptions x where x.trip_id = p_trip_id and x.kind in ('sos', 'accident', 'theft') and x.status not in ('resolved', 'converted_to_dispute'))
     or exists (select 1 from public.dispute_cases d where d.contract_id = v_t.contract_id and d.status in ('open', 'under_review', 'awaiting_evidence', 'decided')) then
    raise exception using errcode = '22023', message = 'release_trip_legal_hold: evento motivador ainda aberto';
  end if;
  v_pol := public.trip_policy(v_t);
  v_until := public.steelgo_now() + make_interval(days => v_pol.legal_hold_tail_days);
  update public.operational_trips t set legal_hold_until = v_until where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'legal_hold_released', v_actor, 'admin', 'release_trip_legal_hold', null, null, btrim(p_note),
    jsonb_build_object('legal_hold_until', v_until), p_request_id => p_request_id, p_fingerprint => v_fp);
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (p_trip_id, v_actor, 'release_trip_legal_hold', jsonb_build_object('legal_hold_until', v_t.legal_hold_until),
          jsonb_build_object('legal_hold_until', v_until), p_note, p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('release_trip_legal_hold', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_until, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- alertas: abrir/fechar (uma aberta por tipo)
-- -----------------------------------------------------------------------------
create function public.trip_alert_open(p_trip public.operational_trips, p_kind public.trip_alert_kind,
  p_severity public.trip_exception_severity, p_details jsonb, p_rpc text)
returns boolean language plpgsql security definer set search_path = '' as $fn$
declare v_id uuid; v_prev public.trip_exception_severity;
begin
  select id, severity into v_id, v_prev from public.operational_alerts a where a.trip_id = p_trip.id and a.kind = p_kind and a.status <> 'closed';
  if found then
    if v_prev <> p_severity then
      update public.operational_alerts a set severity = p_severity, details = p_details, last_evaluated_at = public.steelgo_now() where a.id = v_id;
      perform public.trip_event_append(p_trip.id, 'alert_opened', null, 'system', p_rpc, null, null,
        format('Alerta %s: severidade %s -> %s.', p_kind, v_prev, p_severity), p_details, p_alert_id => v_id);
      return true;
    end if;
    update public.operational_alerts a set last_evaluated_at = public.steelgo_now() where a.id = v_id;
    return false;
  end if;
  insert into public.operational_alerts (trip_id, kind, severity, details, policy_version, detected_at)
  values (p_trip.id, p_kind, p_severity, p_details, p_trip.policy_version, public.steelgo_now()) returning id into v_id;
  perform public.trip_event_append(p_trip.id, 'alert_opened', null, 'system', p_rpc, null, null,
    format('Alerta %s (%s).', p_kind, p_severity), p_details, p_alert_id => v_id);
  if p_severity in ('high', 'critical') then
    perform public.notify_trip(p_trip.id, 'trip_alert_' || p_kind::text, format('Viagem %s: alerta %s', p_trip.trip_number, p_kind),
      coalesce(p_details ->> 'message', 'Verifique a viagem na Control Tower.'), false, true, false, true, null,
      case when p_severity = 'critical' then 'high' else 'normal' end);
  end if;
  return true;
end $fn$;

create function public.trip_alert_close(p_trip_id uuid, p_kind public.trip_alert_kind, p_reason text, p_rpc text)
returns boolean language plpgsql security definer set search_path = '' as $fn$
declare v_id uuid;
begin
  select id into v_id from public.operational_alerts a where a.trip_id = p_trip_id and a.kind = p_kind and a.status <> 'closed';
  if not found then return false; end if;
  update public.operational_alerts a set status = 'closed', closed_at = public.steelgo_now(), close_reason = p_reason where a.id = v_id;
  perform public.trip_event_append(p_trip_id, 'alert_closed', null, 'system', p_rpc, null, null, format('Alerta %s fechado: %s.', p_kind, p_reason), '{}'::jsonb, p_alert_id => v_id);
  return true;
end $fn$;

-- -----------------------------------------------------------------------------
-- ETA interno (estimativa operacional). Formula, fonte e horario ficam em eta_basis.
-- -----------------------------------------------------------------------------
create function public.trip_compute_eta(p_trip_id uuid, p_rpc text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype;
  v_target extensions.geography; v_dist_km numeric; v_speed numeric; v_obs_km numeric; v_obs_h numeric; v_eta timestamptz; v_now timestamptz := public.steelgo_now();
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  if v_t.last_location_geog is null then return; end if;
  if v_t.eta_source = 'reported' and v_t.eta_updated_at > v_now - interval '2 hours' then return; end if;
  v_pol := public.trip_policy(v_t);
  v_target := case when v_t.status in ('en_route_to_pickup') then v_t.pickup_geog
                   when v_t.status = 'returning' then v_t.pickup_geog
                   else v_t.delivery_geog end;
  if v_target is null then return; end if;
  v_dist_km := (extensions.ST_Distance(v_t.last_location_geog, v_target) / 1000.0) * v_pol.eta_route_factor;
  -- velocidade observada nas ultimas 2 h (pontos aceitos, sem flags de anomalia)
  select coalesce(sum(q.step_m), 0) / 1000.0, coalesce(extract(epoch from (max(q.captured_at) - min(q.captured_at))) / 3600.0, 0)
    into v_obs_km, v_obs_h
    from (select l.captured_at, extensions.ST_Distance(l.geog, lag(l.geog) over (order by l.captured_at)) as step_m
            from public.trip_locations l
           where l.trip_id = p_trip_id and l.accepted and l.captured_at > v_now - interval '2 hours'
             and not (l.flags && array['impossible_speed', 'jump', 'low_accuracy'])) q;
  if v_obs_km >= 5 and v_obs_h >= 0.25 then
    v_speed := greatest(v_obs_km / v_obs_h, 5);
  else
    v_speed := v_pol.eta_fallback_speed_kmh;
  end if;
  v_eta := v_now + make_interval(secs => (v_dist_km / v_speed) * 3600.0);
  update public.operational_trips t
     set eta_at = v_eta, eta_source = 'calculated', eta_updated_at = v_now,
         eta_basis = jsonb_build_object('formula', 'straight_line_km * route_factor / observed_speed_kmh',
                       'straight_line_km', round(v_dist_km / v_pol.eta_route_factor, 1), 'route_factor', v_pol.eta_route_factor,
                       'speed_kmh', round(v_speed, 1), 'speed_source', case when v_obs_km >= 5 and v_obs_h >= 0.25 then 'observed_2h' else 'policy_fallback' end,
                       'computed_at', v_now, 'policy_version', v_pol.version, 'target', case when v_t.status = 'en_route_to_pickup' then 'pickup' else 'delivery' end)
   where t.id = p_trip_id;
end $fn$;

-- -----------------------------------------------------------------------------
-- avaliacao de alertas de uma viagem (usada na ingestao e pelo scheduler)
-- -----------------------------------------------------------------------------
create function public.trip_evaluate_alerts(p_trip_id uuid, p_rpc text)
returns table (opened integer, closed integer)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype; v_now timestamptz := public.steelgo_now();
  v_o integer := 0; v_c integer := 0; v_silence interval; v_gap interval;
  v_last extensions.geography; v_first_same timestamptz; v_moving boolean;
  v_dist_now numeric; v_dist_ago numeric; v_corr public.trip_geofences%rowtype; v_outside integer;
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  if not found or v_t.status not in ('en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'returning') then
    return query select 0, 0; return;
  end if;
  v_pol := public.trip_policy(v_t);
  if v_t.paused_by_exception_id is not null then
    return query select 0, 0; return; -- pausada por excecao: alertas suspensos (SOS tem escalonamento proprio)
  end if;

  -- 1. silencio de localizacao
  if v_t.tracking_state in ('active', 'paused') then
    v_silence := make_interval(mins => case when v_t.status in ('in_transit', 'en_route_to_pickup', 'returning')
                                            then v_pol.location_silence_min_transit else v_pol.location_silence_min_stationary end);
    v_gap := v_now - coalesce(v_t.last_location_at, (select s.started_at from public.trip_tracking_sessions s where s.trip_id = p_trip_id order by s.started_at desc limit 1), v_now);
    if v_gap > v_silence then
      if public.trip_alert_open(v_t, 'no_update',
           (case when v_gap > make_interval(mins => v_pol.comm_loss_critical_min) then 'critical' else 'medium' end)::public.trip_exception_severity,
           jsonb_build_object('minutes_silent', round(extract(epoch from v_gap) / 60), 'message', 'Sem localizacao ha ' || round(extract(epoch from v_gap) / 60) || ' min.'), p_rpc) then v_o := v_o + 1; end if;
    else
      if public.trip_alert_close(p_trip_id, 'no_update', 'location_received', p_rpc) then v_c := v_c + 1; end if;
    end if;
  end if;

  -- 2. parada excessiva (em transito, fora de geofence)
  if v_t.status in ('in_transit', 'en_route_to_pickup', 'returning') and v_t.last_location_geog is not null then
    select min(l.captured_at) into v_first_same
      from public.trip_locations l
     where l.trip_id = p_trip_id and l.accepted and l.captured_at > v_now - make_interval(mins => v_pol.long_stop_min * 3)
       and extensions.ST_Distance(l.geog, v_t.last_location_geog) <= 150
       and not exists (select 1 from public.trip_locations m where m.trip_id = p_trip_id and m.accepted and m.captured_at > l.captured_at
                        and m.captured_at <= v_t.last_location_at and extensions.ST_Distance(m.geog, v_t.last_location_geog) > 150);
    v_moving := v_first_same is null or (v_t.last_location_at - v_first_same) < make_interval(mins => v_pol.long_stop_min);
    if not v_moving and not exists (select 1 from public.trip_geofences g where g.trip_id = p_trip_id and g.is_current and g.center_geog is not null
                                      and extensions.ST_Distance(g.center_geog, v_t.last_location_geog) <= g.radius_m) then
      if public.trip_alert_open(v_t, 'long_stop', 'medium',
           jsonb_build_object('stopped_minutes', round(extract(epoch from (v_t.last_location_at - v_first_same)) / 60),
                              'message', 'Veiculo parado fora de geofence.'), p_rpc) then v_o := v_o + 1; end if;
    else
      if public.trip_alert_close(p_trip_id, 'long_stop', 'moving_again', p_rpc) then v_c := v_c + 1; end if;
    end if;
  end if;

  -- 3. falta de progresso / afastamento (distancia ao destino; NAO e "desvio de rota")
  if v_t.status in ('in_transit', 'en_route_to_pickup') and v_t.last_location_geog is not null then
    v_dist_now := extensions.ST_Distance(v_t.last_location_geog, case when v_t.status = 'in_transit' then v_t.delivery_geog else v_t.pickup_geog end) / 1000.0;
    select extensions.ST_Distance(l.geog, case when v_t.status = 'in_transit' then v_t.delivery_geog else v_t.pickup_geog end) / 1000.0 into v_dist_ago
      from public.trip_locations l where l.trip_id = p_trip_id and l.accepted and l.captured_at <= v_now - make_interval(mins => v_pol.no_progress_min)
      order by l.captured_at desc limit 1;
    if v_dist_now is not null and v_dist_ago is not null then
      if v_dist_now - v_dist_ago >= v_pol.moving_away_min_km then
        if public.trip_alert_open(v_t, 'moving_away', 'medium', jsonb_build_object('km_farther', round(v_dist_now - v_dist_ago, 1),
             'message', 'Distancia ao destino aumentou (nao e desvio confirmado).'), p_rpc) then v_o := v_o + 1; end if;
      else
        if public.trip_alert_close(p_trip_id, 'moving_away', 'approaching', p_rpc) then v_c := v_c + 1; end if;
      end if;
      if abs(v_dist_now - v_dist_ago) < 1 and v_moving is not false and v_t.status = 'in_transit'
         and not exists (select 1 from public.operational_alerts a where a.trip_id = p_trip_id and a.kind = 'long_stop' and a.status <> 'closed') then
        if public.trip_alert_open(v_t, 'no_progress', 'low', jsonb_build_object('window_min', v_pol.no_progress_min,
             'message', 'Sem aproximacao do destino na janela.'), p_rpc) then v_o := v_o + 1; end if;
      elsif v_dist_now < v_dist_ago - 1 then
        if public.trip_alert_close(p_trip_id, 'no_progress', 'progress_resumed', p_rpc) then v_c := v_c + 1; end if;
      end if;
    end if;
  end if;

  -- 4. atraso de ETA (estimativa) vs planejado
  if v_t.eta_at is not null and v_t.planned_delivery_at is not null and v_t.status in ('in_transit', 'at_delivery', 'unloading', 'loading', 'at_pickup', 'en_route_to_pickup') then
    if v_t.eta_at > v_t.planned_delivery_at + interval '60 minutes' then
      if public.trip_alert_open(v_t, 'late_eta', (case when v_t.eta_at > v_t.planned_delivery_at + interval '4 hours' then 'medium' else 'low' end)::public.trip_exception_severity,
           jsonb_build_object('eta_at', v_t.eta_at, 'planned_delivery_at', v_t.planned_delivery_at, 'eta_source', v_t.eta_source,
                              'message', 'ETA estimado apos o prazo planejado.'), p_rpc) then v_o := v_o + 1; end if;
    else
      if public.trip_alert_close(p_trip_id, 'late_eta', 'eta_within_plan', p_rpc) then v_c := v_c + 1; end if;
    end if;
  end if;

  -- 5. desvio de rota SOMENTE com corredor confiavel (poligono cadastrado por admin)
  select * into v_corr from public.trip_geofences g where g.trip_id = p_trip_id and g.kind = 'corridor' and g.is_current and g.area_geog is not null;
  if found and v_t.status = 'in_transit' then
    select count(*) into v_outside from (
      select l.geog from public.trip_locations l where l.trip_id = p_trip_id and l.accepted and not (l.flags && array['low_accuracy', 'impossible_speed', 'jump'])
      order by l.captured_at desc limit 3) q where not extensions.ST_Covers(v_corr.area_geog, q.geog);
    if v_outside >= 3 then
      if public.trip_alert_open(v_t, 'route_deviation', 'medium', jsonb_build_object('corridor_id', v_corr.id, 'message', 'Fora do corredor cadastrado (3 pontos).'), p_rpc) then v_o := v_o + 1; end if;
    else
      if public.trip_alert_close(p_trip_id, 'route_deviation', 'inside_corridor', p_rpc) then v_c := v_c + 1; end if;
    end if;
  end if;
  return query select v_o, v_c;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: ingest_trip_locations (motorista; lote)
-- p_points: [{seq, captured_at, lat, lng, accuracy_m, speed_mps?, heading?, altitude_m?, battery_pct?, is_moving?}]
-- -----------------------------------------------------------------------------
create function public.ingest_trip_locations(p_trip_id uuid, p_device_id uuid, p_batch_id uuid, p_points jsonb)
returns table (accepted integer, stored_flagged integer, duplicates integer, rejected jsonb, tracking_active boolean, trip_status public.trip_status)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_s public.trip_tracking_sessions%rowtype;
  v_pol public.operational_policies%rowtype; v_now timestamptz := public.steelgo_now();
  v_p jsonb; v_seq bigint; v_cap timestamptz; v_lat numeric; v_lng numeric; v_acc numeric; v_geog extensions.geography;
  v_flags text[]; v_ok boolean; v_prev_geog extensions.geography; v_prev_at timestamptz; v_speed numeric;
  v_acc_n integer := 0; v_flag_n integer := 0; v_dup_n integer := 0; v_rej jsonb := '[]'::jsonb; v_ins integer;
  v_best_geog extensions.geography; v_best_at timestamptz;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'ingest_trip_locations: sessao obrigatoria'; end if;
  if p_trip_id is null or p_device_id is null or p_batch_id is null or p_points is null or jsonb_typeof(p_points) <> 'array' then
    raise exception using errcode = '22023', message = 'ingest_trip_locations: parametros invalidos';
  end if;
  v_t := public.trip_lock(p_trip_id);
  v_a := public.trip_live_assignment_of_caller(p_trip_id);
  if v_a.id is null or v_a.state <> 'accepted' then
    raise exception using errcode = '42501', message = 'ingest_trip_locations: chamador nao e o motorista vinculado';
  end if;
  v_pol := public.trip_policy(v_t);
  if jsonb_array_length(p_points) > v_pol.location_batch_max_points then
    raise exception using errcode = '22023', message = format('ingest_trip_locations: lote acima de %s pontos', v_pol.location_batch_max_points);
  end if;
  select * into v_s from public.trip_tracking_sessions s where s.trip_id = p_trip_id and s.device_id = p_device_id and s.ended_at is null;
  if not found or v_t.tracking_state = 'off'
     or v_t.status not in ('en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'returning') then
    -- fora de viagem ativa: NENHUMA coleta e aceita
    raise exception using errcode = '22023', message = 'ingest_trip_locations: tracking_inactive';
  end if;
  select l.geog, l.captured_at into v_prev_geog, v_prev_at from public.trip_locations l
   where l.trip_id = p_trip_id and l.accepted and not (l.flags && array['impossible_speed', 'jump'])
   order by l.captured_at desc limit 1;

  for v_p in select * from jsonb_array_elements(p_points) order by (value ->> 'seq')::bigint loop
    v_seq := (v_p ->> 'seq')::bigint; v_cap := (v_p ->> 'captured_at')::timestamptz;
    v_lat := (v_p ->> 'lat')::numeric; v_lng := (v_p ->> 'lng')::numeric; v_acc := (v_p ->> 'accuracy_m')::numeric;
    v_flags := '{}'; v_ok := true;
    if v_seq is null or v_cap is null or v_lat is null or v_lng is null or v_acc is null
       or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_rej := v_rej || jsonb_build_object('seq', v_seq, 'code', 'malformed'); continue;
    end if;
    if v_acc > v_pol.accuracy_reject_m then
      v_rej := v_rej || jsonb_build_object('seq', v_seq, 'code', 'accuracy_rejected'); continue;
    end if;
    if v_cap < v_now - make_interval(hours => v_pol.location_max_age_hours) then
      v_rej := v_rej || jsonb_build_object('seq', v_seq, 'code', 'too_old'); continue;
    end if;
    v_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography;
    if v_cap > v_now + make_interval(mins => v_pol.clock_future_tolerance_min) then
      v_flags := array_append(v_flags, 'future_clock'); v_ok := false;
    end if;
    if v_acc > v_pol.accuracy_primary_m then v_flags := array_append(v_flags, 'low_accuracy'); end if;
    if v_prev_at is not null and v_cap < v_prev_at then v_flags := array_append(v_flags, 'out_of_order'); end if;
    if v_prev_geog is not null and v_prev_at is not null and v_cap > v_prev_at then
      v_speed := (extensions.ST_Distance(v_geog, v_prev_geog) / 1000.0) / greatest(extract(epoch from (v_cap - v_prev_at)) / 3600.0, 1.0 / 3600.0);
      if v_speed > v_pol.impossible_speed_kmh then
        v_flags := array_append(v_flags, 'impossible_speed');
        if extensions.ST_Distance(v_geog, v_prev_geog) > 50000 and (v_cap - v_prev_at) < interval '10 minutes' then v_flags := array_append(v_flags, 'jump'); end if;
        v_ok := false;
      end if;
    end if;
    insert into public.trip_locations (trip_id, device_id, seq_device, session_id, batch_id, captured_at, received_at, geog, accuracy_m,
      speed_mps, heading, altitude_m, battery_pct, is_moving, flags, accepted)
    values (p_trip_id, p_device_id, v_seq, v_s.id, p_batch_id, v_cap, v_now, v_geog, v_acc,
      (v_p ->> 'speed_mps')::numeric, (v_p ->> 'heading')::numeric, (v_p ->> 'altitude_m')::numeric, (v_p ->> 'battery_pct')::integer,
      (v_p ->> 'is_moving')::boolean, v_flags, v_ok)
    on conflict (trip_id, device_id, seq_device) do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 0 then v_dup_n := v_dup_n + 1; continue; end if;
    if not v_ok then
      v_flag_n := v_flag_n + 1;
    else
      v_acc_n := v_acc_n + 1;
      if not ('out_of_order' = any(v_flags)) and not ('low_accuracy' = any(v_flags)) then
        v_prev_geog := v_geog; v_prev_at := v_cap;
        if v_best_at is null or v_cap > v_best_at then v_best_geog := v_geog; v_best_at := v_cap; end if;
      end if;
    end if;
  end loop;

  update public.trip_tracking_sessions s set points_received = s.points_received + v_acc_n + v_flag_n,
         last_point_at = greatest(coalesce(s.last_point_at, v_now), v_now) where s.id = v_s.id;
  if v_best_at is not null and (v_t.last_location_at is null or v_best_at > v_t.last_location_at) then
    update public.operational_trips t set last_location_at = v_best_at, last_location_geog = v_best_geog where t.id = p_trip_id;
  end if;
  if v_acc_n > 0 then perform public.trip_compute_eta(p_trip_id, 'ingest_trip_locations'); end if;
  if v_flag_n >= 3 then
    perform public.trip_alert_open(v_t, 'gps_anomaly', 'low', jsonb_build_object('flagged_in_batch', v_flag_n, 'message', 'Pontos com velocidade impossivel/salto no lote.'), 'ingest_trip_locations');
  end if;
  perform public.trip_evaluate_alerts(p_trip_id, 'ingest_trip_locations');
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select v_acc_n, v_flag_n, v_dup_n, v_rej, v_t.tracking_state = 'active', v_t.status;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: report_trip_eta (transportadora operator+ ou motorista vinculado)
-- -----------------------------------------------------------------------------
create function public.report_trip_eta(p_trip_id uuid, p_eta_at timestamptz, p_note text, p_request_id uuid)
returns table (eta_at timestamptz, eta_source text, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_role text; v_t public.operational_trips%rowtype; v_fp text; v_log public.rpc_call_log%rowtype; v_now timestamptz := public.steelgo_now();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'report_trip_eta: sessao obrigatoria'; end if;
  if p_eta_at is null or p_eta_at <= v_now or p_eta_at > v_now + interval '7 days' then
    raise exception using errcode = '22023', message = 'report_trip_eta: ETA deve estar no futuro (ate 7 dias)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'eta', p_eta_at, 'note', p_note));
  v_log := public.rpc_idempotency_probe('report_trip_eta', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = p_trip_id; return query select v_t.eta_at, v_t.eta_source, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator', 'driver') then
    raise exception using errcode = '42501', message = 'report_trip_eta: papel sem permissao';
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status not in ('driver_accepted', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'returning') then
    raise exception using errcode = '22023', message = format('report_trip_eta: viagem em %s', v_t.status);
  end if;
  update public.operational_trips t set eta_at = p_eta_at, eta_source = 'reported', eta_updated_at = v_now,
         eta_basis = jsonb_build_object('reported_by_role', v_role, 'note', p_note, 'reported_at', v_now) where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'eta_reported', v_actor, public.trip_actor_kind_of(v_role), 'report_trip_eta', null, null,
    coalesce(p_note, ''), jsonb_build_object('eta_at', p_eta_at), p_request_id => p_request_id, p_fingerprint => v_fp);
  perform public.trip_evaluate_alerts(p_trip_id, 'report_trip_eta');
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('report_trip_eta', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select p_eta_at, 'reported'::text, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- purge_trip_raw_locations: unica exclusao de trilha bruta. Gera resumo por hora
-- e fatos operacionais ANTES. Exige retencao vencida e sem legal hold.
-- -----------------------------------------------------------------------------
create function public.trip_purge_core(p_trip_id uuid, p_actor uuid, p_rpc text, p_request_id uuid)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  v_t public.operational_trips%rowtype; v_now timestamptz := public.steelgo_now(); v_n integer; v_total integer; v_acc integer; v_low integer; v_flag integer;
  v_km numeric; v_dur integer; v_mov integer; v_stops integer; v_gaps integer; v_hash text; v_pol public.operational_policies%rowtype; v_q text;
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'purge: viagem inexistente'; end if;
  if v_t.status not in ('completed', 'cancelled', 'returned', 'delivered') then
    raise exception using errcode = '22023', message = 'purge: viagem ainda ativa';
  end if;
  if v_t.raw_locations_purged_at is not null then
    raise exception using errcode = '22023', message = 'purge: trilha bruta ja purgada';
  end if;
  if v_t.retention_until is null or v_t.retention_until > v_now then
    raise exception using errcode = '22023', message = format('purge: retencao vigente ate %s', v_t.retention_until);
  end if;
  if v_t.legal_hold_reason is not null and (v_t.legal_hold_until is null or v_t.legal_hold_until > v_now) then
    raise exception using errcode = '22023', message = format('purge: legal hold (%s) ate %s', v_t.legal_hold_reason, v_t.legal_hold_until);
  end if;
  v_pol := public.trip_policy(v_t);
  -- resumo por hora
  insert into public.trip_location_summaries (trip_id, hour_bucket, n_points, n_accepted, path_simplified, distance_km, avg_speed_kmh, max_speed_kmh, stops_count, first_at, last_at)
  select p_trip_id, q.hb, count(*), count(*) filter (where q.accepted),
         case when count(*) filter (where q.clean) >= 2 then
           extensions.ST_Simplify(extensions.ST_MakeLine((array_agg(q.geog::extensions.geometry order by q.captured_at) filter (where q.clean))), 0.001)::extensions.geography
         end,
         round((coalesce(sum(q.step_m) filter (where q.clean), 0) / 1000.0)::numeric, 3),
         null, null, 0, min(q.captured_at), max(q.captured_at)
    from (select l.captured_at, l.geog, l.accepted, date_trunc('hour', l.captured_at) as hb,
                 (l.accepted and not (l.flags && array['impossible_speed', 'jump'])) as clean,
                 extensions.ST_Distance(l.geog, lag(l.geog) over (partition by date_trunc('hour', l.captured_at) order by l.captured_at)) as step_m
            from public.trip_locations l where l.trip_id = p_trip_id) q
   group by q.hb
  on conflict (trip_id, hour_bucket) do nothing;
  -- fatos operacionais (sem emissao)
  select count(*), count(*) filter (where accepted), count(*) filter (where 'low_accuracy' = any(flags)), count(*) filter (where not accepted)
    into v_total, v_acc, v_low, v_flag from public.trip_locations where trip_id = p_trip_id;
  with pts as (select captured_at, geog, lag(captured_at) over (order by captured_at) pa, lag(geog) over (order by captured_at) pg
                 from public.trip_locations where trip_id = p_trip_id and accepted and not (flags && array['impossible_speed', 'jump']))
  select coalesce(round((sum(extensions.ST_Distance(geog, pg)) / 1000.0)::numeric, 3), 0),
         coalesce(round(extract(epoch from (max(captured_at) - min(captured_at))) / 60), 0),
         coalesce(round(sum(extract(epoch from (captured_at - pa))) filter (where extensions.ST_Distance(geog, pg) / greatest(extract(epoch from (captured_at - pa)), 1) > 1.0) / 60), 0),
         coalesce(count(*) filter (where extensions.ST_Distance(geog, pg) < 50 and (captured_at - pa) >= interval '10 minutes'), 0),
         coalesce(count(*) filter (where (captured_at - pa) > make_interval(mins => v_pol.location_silence_min_transit)), 0)
    into v_km, v_dur, v_mov, v_stops, v_gaps from pts;
  v_q := case when v_total = 0 then 'none' when v_acc::numeric / greatest(v_total, 1) >= 0.9 and v_gaps = 0 then 'good'
              when v_acc::numeric / greatest(v_total, 1) >= 0.7 then 'fair' else 'poor' end;
  insert into public.trip_operational_facts (trip_id, version, planned_distance_km, gps_distance_km, aggregated_distance_km, distance_source,
    duration_min, moving_min, stops_count, points_total, points_accepted, points_low_accuracy, points_flagged, gaps_over_silence, sample_quality, computed_by_rpc)
  values (p_trip_id, 1, v_t.planned_distance_km, nullif(v_km, 0), (select round(sum(distance_km), 3) from public.trip_location_summaries where trip_id = p_trip_id),
    case when v_km > 0 then 'gps_raw' when v_t.planned_distance_km is not null then 'planned' else 'none' end,
    v_dur, v_mov, v_stops, v_total, v_acc, v_low, v_flag, v_gaps, v_q, p_rpc)
  on conflict (trip_id) do update set version = public.trip_operational_facts.version + 1, gps_distance_km = excluded.gps_distance_km,
    aggregated_distance_km = excluded.aggregated_distance_km, distance_source = excluded.distance_source, duration_min = excluded.duration_min,
    moving_min = excluded.moving_min, stops_count = excluded.stops_count, points_total = excluded.points_total, points_accepted = excluded.points_accepted,
    points_low_accuracy = excluded.points_low_accuracy, points_flagged = excluded.points_flagged, gaps_over_silence = excluded.gaps_over_silence,
    sample_quality = excluded.sample_quality, computed_at = v_now, computed_by_rpc = p_rpc;
  select encode(extensions.digest(coalesce(string_agg(extensions.ST_AsText(path_simplified::extensions.geometry), '|' order by hour_bucket), ''), 'sha256'), 'hex')
    into v_hash from public.trip_location_summaries where trip_id = p_trip_id;
  perform set_config('steelgo.purge_context', 'purge:' || p_trip_id::text, true);
  delete from public.trip_locations where trip_id = p_trip_id;
  get diagnostics v_n = row_count;
  perform set_config('steelgo.purge_context', '', true);
  update public.operational_trips t set raw_locations_purged_at = v_now where t.id = p_trip_id;
  perform public.trip_event_append(p_trip_id, 'raw_locations_purged', p_actor, (case when p_actor is null then 'system' else 'admin' end)::public.trip_actor_kind, p_rpc, null, null,
    format('%s pontos brutos purgados; resumo e fatos preservados.', v_n),
    jsonb_build_object('points_deleted', v_n, 'summary_sha256', v_hash, 'gps_distance_km', v_km, 'sample_quality', v_q), p_request_id => p_request_id);
  return v_n;
end $fn$;

create function public.purge_trip_raw_locations(p_trip_id uuid, p_request_id uuid)
returns table (points_deleted integer, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('purge_trip_raw_locations'); v_fp text; v_log public.rpc_call_log%rowtype; v_n integer;
begin
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id));
  v_log := public.rpc_idempotency_probe('purge_trip_raw_locations', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then return query select 0, true; return; end if;
  v_n := public.trip_purge_core(p_trip_id, v_actor, 'purge_trip_raw_locations', p_request_id);
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (p_trip_id, v_actor, 'purge_trip_raw_locations', jsonb_build_object('points', v_n), jsonb_build_object('points', 0), 'Retencao vencida; purga governada.', p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('purge_trip_raw_locations', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_n, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- scheduler (pg_cron, a cada minuto). Sem EXECUTE publico. Idempotente.
-- -----------------------------------------------------------------------------
create function public.run_operational_scheduler()
returns table (outcome text, trips_scanned integer, alerts_opened integer, alerts_closed integer, alerts_escalated integer, purges integer)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_run bigint; v_now timestamptz := public.steelgo_now(); v_t record; v_x record; v_r record;
  v_scanned integer := 0; v_o integer := 0; v_c integer := 0; v_e integer := 0; v_p integer := 0; v_pol public.operational_policies%rowtype;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'run_operational_scheduler: execucao restrita ao agendador';
  end if;
  insert into public.scheduler_runs (kind, started_at) values ('operational_tick', v_now) returning id into v_run;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('steelgo.operational_tick', 0)) then
    update public.scheduler_runs set finished_at = public.steelgo_now(), outcome = 'skipped_overlap' where id = v_run;
    return query select 'skipped_overlap'::text, 0, 0, 0, 0, 0; return;
  end if;
  begin
    -- 1. alertas por viagem ativa
    for v_t in select t.id from public.operational_trips t
                where t.status in ('en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'returning')
                order by t.last_location_at nulls first loop
      v_scanned := v_scanned + 1;
      select * into v_r from public.trip_evaluate_alerts(v_t.id, 'run_operational_scheduler');
      v_o := v_o + coalesce(v_r.opened, 0); v_c := v_c + coalesce(v_r.closed, 0);
    end loop;
    -- 2. escalonamento de SOS sem reconhecimento (nivel 1 = meta vencida; nivel 2 = 2x meta). Sem nivel 3.
    for v_x in select x.*, t.trip_number from public.trip_exceptions x join public.operational_trips t on t.id = x.trip_id
                where x.kind = 'sos' and x.status in ('open', 'escalated') and x.acknowledged_at is null
                  and x.ack_target_at is not null for update of x loop
      if v_x.escalation_level = 0 and v_now >= v_x.ack_target_at then
        update public.trip_exceptions set escalation_level = 1, escalated_at = v_now, status = 'escalated' where id = v_x.id;
        perform public.trip_event_append(v_x.trip_id, 'sos_escalated', null, 'system', 'run_operational_scheduler', null, null,
          'Alerta critico sem reconhecimento dentro da meta; escalonamento nivel 1.', jsonb_build_object('level', 1), p_exception_id => v_x.id);
        perform public.notify_trip(v_x.trip_id, 'sos_escalated', format('ALERTA CRITICO sem reconhecimento - viagem %s', v_x.trip_number),
          'Meta de reconhecimento vencida. Reconheca o alerta na Control Tower.', false, true, false, true, null, 'high');
        v_e := v_e + 1;
      elsif v_x.escalation_level = 1 and v_now >= v_x.ack_target_at + (v_x.ack_target_at - v_x.captured_at) then
        update public.trip_exceptions set escalation_level = 2, escalated_at = v_now where id = v_x.id;
        perform public.trip_event_append(v_x.trip_id, 'sos_escalated', null, 'system', 'run_operational_scheduler', null, null,
          'Alerta critico sem reconhecimento; escalonamento nivel 2 (maximo).', jsonb_build_object('level', 2), p_exception_id => v_x.id);
        perform public.notify_trip(v_x.trip_id, 'sos_escalated', format('ALERTA CRITICO nivel 2 - viagem %s', v_x.trip_number),
          'Segundo escalonamento. Nenhum contato externo automatico e feito.', false, true, false, true, null, 'high');
        v_e := v_e + 1;
      end if;
    end loop;
    -- 3. retencao: viagens terminais sem prazo calculado
    for v_t in select t.* from public.operational_trips t where t.status in ('completed', 'cancelled', 'returned') and t.retention_until is null loop
      v_pol := public.operational_policy_version(v_t.policy_version);
      update public.operational_trips t set retention_until = coalesce(t.completed_at, t.cancelled_at, t.returned_at, v_now) + make_interval(days => v_pol.raw_retention_days),
             summary_retention_until = coalesce(t.completed_at, t.cancelled_at, t.returned_at, v_now) + make_interval(years => v_pol.summary_retention_years)
       where t.id = v_t.id;
    end loop;
    -- 4. legal hold vencido -> liberado
    for v_t in select t.* from public.operational_trips t where t.legal_hold_reason is not null and t.legal_hold_until < v_now loop
      update public.operational_trips t set legal_hold_reason = null, legal_hold_until = null where t.id = v_t.id;
      perform public.trip_event_append(v_t.id, 'legal_hold_released', null, 'system', 'run_operational_scheduler', null, null,
        'Cauda do legal hold vencida.', jsonb_build_object('previous_reason', v_t.legal_hold_reason));
    end loop;
    -- 5. purga bruta vencida (viagens terminais, sem hold)
    for v_t in select t.id from public.operational_trips t
                where t.status in ('completed', 'cancelled', 'returned') and t.raw_locations_purged_at is null
                  and t.retention_until < v_now and t.legal_hold_reason is null
                  and exists (select 1 from public.trip_locations l where l.trip_id = t.id) limit 20 loop
      perform public.trip_purge_core(v_t.id, null, 'run_operational_scheduler', null);
      v_p := v_p + 1;
    end loop;
    update public.scheduler_runs set finished_at = public.steelgo_now(), outcome = 'ok', trips_scanned = v_scanned, alerts_opened = v_o,
           alerts_closed = v_c, alerts_escalated = v_e, purges = v_p where id = v_run;
  exception when others then
    update public.scheduler_runs set finished_at = public.steelgo_now(), outcome = 'error', error = sqlstate || ' ' || sqlerrm where id = v_run;
    raise;
  end;
  return query select 'ok'::text, v_scanned, v_o, v_c, v_e, v_p;
end $fn$;

create function public.scheduler_health()
returns table (kind text, last_started_at timestamptz, last_outcome text, seconds_since_last numeric, last_error text, stale boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('scheduler_health');
begin
  return query
    select k.kind, r.started_at, r.outcome, extract(epoch from (now() - r.started_at)), r.error,
           coalesce(now() - r.started_at > interval '5 minutes', true)
      from (values ('operational_tick'), ('push_dispatch'), ('housekeeping')) k(kind)
      left join lateral (select * from public.scheduler_runs s where s.kind = k.kind order by s.started_at desc limit 1) r on true;
end $fn$;

-- jobs (SQL puro; executam como postgres)
select cron.schedule('steelgo_operational_tick', '* * * * *', $$select public.run_operational_scheduler()$$);
select cron.schedule('steelgo_cron_housekeeping', '15 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '30 days';
    delete from public.scheduler_runs where started_at < now() - interval '1 year';
    insert into public.scheduler_runs (kind, finished_at, outcome) values ('housekeeping', now(), 'ok')$$);

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.trip_apply_legal_hold(uuid, text, uuid, text)', 'public.trip_settle_legal_hold(uuid, uuid, text)',
    'public.trip_alert_open(public.operational_trips, public.trip_alert_kind, public.trip_exception_severity, jsonb, text)',
    'public.trip_alert_close(uuid, public.trip_alert_kind, text, text)', 'public.trip_compute_eta(uuid, text)',
    'public.trip_evaluate_alerts(uuid, text)', 'public.trip_purge_core(uuid, uuid, text, uuid)', 'public.run_operational_scheduler()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array[
    'public.set_trip_legal_hold(uuid, text, uuid)', 'public.release_trip_legal_hold(uuid, text, uuid)',
    'public.ingest_trip_locations(uuid, uuid, uuid, jsonb)', 'public.report_trip_eta(uuid, timestamptz, text, uuid)',
    'public.purge_trip_raw_locations(uuid, uuid)', 'public.scheduler_health()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
