-- =============================================================================
-- MODULO 3 - 79/81: leitura sanitizada, place_bid, aviso de privacidade,
--   politica operacional versionada, contato operacional da transportadora
--   Visibilidade (decisao 10): embarcador da viagem ATIVA ve nome operacional
--   completo do motorista, placa completa, veiculo e status de verificacao;
--   nunca CPF/CNH/telefone/UUIDs pessoais; apos o encerramento, rotulo reduzido e
--   placa mascarada. Transportadora ve sua equipe/frota. Contato exibido e o
--   operacional da transportadora, nunca o telefone pessoal do motorista.
--   Toda leitura de posicao/trilha/midia/POD e auditada em trip_access_log.
-- =============================================================================
begin;

alter table public.companies
  add column operational_contact_email text check (operational_contact_email is null or operational_contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column operational_contact_phone text check (operational_contact_phone is null or length(btrim(operational_contact_phone)) between 8 and 30);

create function public.set_company_operational_contact(p_company_id uuid, p_email text, p_phone text, p_request_id uuid)
returns table (was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'set_company_operational_contact: sessao obrigatoria'; end if;
  if not public.is_current_user_company_owner(p_company_id) and not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'set_company_operational_contact: somente o proprietario da empresa';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('c', p_company_id, 'e', p_email, 'p', p_phone));
  v_log := public.rpc_idempotency_probe('set_company_operational_contact', p_request_id, v_actor, p_company_id, v_fp);
  if v_log.id is not null then return query select true; return; end if;
  update public.companies c set operational_contact_email = nullif(btrim(p_email), ''), operational_contact_phone = nullif(btrim(p_phone), ''), updated_at = now() where c.id = p_company_id;
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('set_company_operational_contact', p_request_id, v_actor, p_company_id, v_fp, 'accepted');
  return query select false;
end $fn$;

-- -----------------------------------------------------------------------------
-- helpers de sanitizacao
-- -----------------------------------------------------------------------------
create function public.mask_plate(p_plate text)
returns text language sql immutable set search_path = '' as $fn$
  select case when p_plate is null then null when length(p_plate) <= 3 then p_plate else left(p_plate, 3) || repeat('*', length(p_plate) - 3) end;
$fn$;

create function public.trip_is_active(p_status public.trip_status)
returns boolean language sql immutable set search_path = '' as $fn$
  select p_status not in ('planned', 'completed', 'cancelled', 'returned');
$fn$;

-- bloco motorista/veiculo conforme papel e estado da viagem
create function public.trip_driver_block(p_trip public.operational_trips, p_role text)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_d public.drivers%rowtype; v_k public.trucks%rowtype; v_a public.trip_assignments%rowtype; v_full boolean; v_c public.companies%rowtype;
begin
  select * into v_a from public.trip_assignments a where a.trip_id = p_trip.id and a.state in ('offered', 'accepted') limit 1;
  if v_a.id is null then
    select * into v_a from public.trip_assignments a where a.trip_id = p_trip.id order by a.assigned_at desc limit 1;
  end if;
  if v_a.id is null then return jsonb_build_object('assigned', false); end if;
  select * into v_d from public.drivers d where d.id = v_a.driver_id;
  select * into v_k from public.trucks k where k.id = v_a.truck_id;
  select * into v_c from public.companies c where c.id = p_trip.carrier_company_id;
  v_full := p_role = 'admin' or p_role like 'carrier_%' or (p_role like 'shipper_%' and public.trip_is_active(p_trip.status) and v_a.state in ('offered', 'accepted'))
            or (p_role = 'driver' and v_a.driver_profile_id = (select auth.uid()));
  return jsonb_build_object(
    'assigned', true,
    'assignment_state', v_a.state,
    'driver_label', v_a.driver_label_at_assignment,
    'driver_name', case when v_full then v_d.full_name end,
    'driver_verification', case when v_full then v_d.license_verification_status end,
    'driver_country', case when v_full then v_d.country_code end,
    'truck_plate', case when v_full then v_k.plate else public.mask_plate(coalesce(v_a.truck_plate_at_assignment, v_k.plate)) end,
    'truck', case when v_full then jsonb_build_object('type', v_k.type, 'brand', v_k.brand, 'model', v_k.model, 'year', v_k.year, 'body_type', v_k.body_type, 'is_ev', v_k.is_ev) end,
    'carrier_operational_contact', case when p_role = 'admin' or p_role like 'shipper_%' then jsonb_build_object('email', v_c.operational_contact_email, 'phone', v_c.operational_contact_phone, 'name', coalesce(v_c.trade_name, v_c.name)) end,
    'accepted_at', v_a.accepted_at, 'assigned_at', v_a.assigned_at);
end $fn$;

-- -----------------------------------------------------------------------------
-- list_my_trips
-- -----------------------------------------------------------------------------
create function public.list_my_trips(p_scope text default 'mine', p_status public.trip_status[] default null, p_limit integer default 100)
returns table (trip_id uuid, trip_number text, contract_id uuid, contract_number text, attempt_number integer, status public.trip_status, my_role text,
  shipper_company_name text, carrier_company_name text, driver_label text, truck_plate_masked text, origin text, destination text,
  planned_pickup_at timestamptz, planned_delivery_at timestamptz, eta_at timestamptz, eta_source text, eta_updated_at timestamptz,
  last_location_at timestamptz, open_alerts integer, open_exceptions integer, has_open_sos boolean, paused boolean, delivery_exception boolean,
  tracking_state text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_admin boolean;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'list_my_trips: sessao obrigatoria'; end if;
  v_admin := public.has_role(v_actor, 'admin'::public.app_role);
  if p_scope not in ('mine', 'all', 'active', 'attention') then raise exception using errcode = '22023', message = 'list_my_trips: escopo invalido'; end if;
  if p_scope <> 'mine' and not v_admin then raise exception using errcode = '42501', message = 'list_my_trips: escopo administrativo'; end if;
  return query
    select t.id, t.trip_number, t.contract_id, c.contract_number, t.attempt_number, t.status,
           public.trip_role_of(t.id),
           coalesce(sc.trade_name, sc.name), coalesce(cc.trade_name, cc.name),
           (select a.driver_label_at_assignment from public.trip_assignments a where a.trip_id = t.id order by (a.state in ('offered', 'accepted')) desc, a.assigned_at desc limit 1),
           (select public.mask_plate(a.truck_plate_at_assignment) from public.trip_assignments a where a.trip_id = t.id order by (a.state in ('offered', 'accepted')) desc, a.assigned_at desc limit 1),
           f.origin_city || '/' || f.origin_state, f.dest_city || '/' || f.dest_state,
           t.planned_pickup_at, t.planned_delivery_at, t.eta_at, t.eta_source, t.eta_updated_at, t.last_location_at,
           (select count(*)::integer from public.operational_alerts a where a.trip_id = t.id and a.status <> 'closed'),
           (select count(*)::integer from public.trip_exceptions x where x.trip_id = t.id and x.status not in ('resolved', 'converted_to_dispute')),
           exists (select 1 from public.trip_exceptions x where x.trip_id = t.id and x.kind = 'sos' and x.status not in ('resolved', 'converted_to_dispute')),
           t.paused_by_contract or t.paused_by_exception_id is not null, t.delivery_exception, t.tracking_state, t.updated_at
      from public.operational_trips t
      join public.contracts c on c.id = t.contract_id
      join public.freights f on f.id = t.freight_id
      left join public.companies sc on sc.id = t.shipper_company_id
      left join public.companies cc on cc.id = t.carrier_company_id
     where (p_status is null or t.status = any(p_status))
       and (case p_scope when 'mine' then public.trip_visible(t.id)
                         when 'all' then true
                         when 'active' then public.trip_is_active(t.status)
                         when 'attention' then (exists (select 1 from public.operational_alerts a where a.trip_id = t.id and a.status <> 'closed')
                                                or exists (select 1 from public.trip_exceptions x where x.trip_id = t.id and x.status not in ('resolved', 'converted_to_dispute'))
                                                or t.delivery_exception) end)
     order by (exists (select 1 from public.trip_exceptions x where x.trip_id = t.id and x.kind = 'sos' and x.status not in ('resolved', 'converted_to_dispute'))) desc,
              public.trip_is_active(t.status) desc, t.updated_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $fn$;

-- -----------------------------------------------------------------------------
-- get_trip (jsonb sanitizado; audita 'timeline')
-- -----------------------------------------------------------------------------
create function public.get_trip(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_role text; v_t public.operational_trips%rowtype; v_c public.contracts%rowtype; v_f public.freights%rowtype;
  v_is_party boolean; v_kind public.trip_actor_kind; v_out jsonb; v_pol jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'get_trip: sessao obrigatoria'; end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null then raise exception using errcode = '42501', message = 'get_trip: viagem nao visivel'; end if;
  v_kind := public.trip_actor_kind_of(v_role);
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  select * into v_c from public.contracts c where c.id = v_t.contract_id;
  select * into v_f from public.freights f where f.id = v_t.freight_id;
  v_is_party := v_role like 'shipper_%';
  select e.payload into v_pol from public.trip_events e where e.trip_id = p_trip_id and e.event_type = 'policy_frozen' order by e.seq limit 1;
  perform public.trip_access_append(p_trip_id, v_actor, v_kind, 'timeline', null, 'get_trip');
  v_out := jsonb_build_object(
    'id', v_t.id, 'trip_number', v_t.trip_number, 'attempt_number', v_t.attempt_number, 'status', v_t.status, 'previous_status', v_t.previous_status,
    'my_role', v_role, 'sos_mode', case when public.operational_flag('sos_operational') then 'operational' else 'homologation' end,
    'contract', jsonb_build_object('id', v_c.id, 'contract_number', v_c.contract_number, 'status', v_c.status, 'escrow_status', v_c.escrow_status,
                                   'delivery_completed_at', v_c.delivery_completed_at),
    'freight', jsonb_build_object('id', v_f.id, 'origin', v_f.origin_city || '/' || v_f.origin_state, 'destination', v_f.dest_city || '/' || v_f.dest_state,
                                  'origin_lat', v_f.origin_lat, 'origin_lng', v_f.origin_lng, 'dest_lat', v_f.dest_lat, 'dest_lng', v_f.dest_lng,
                                  'steel_type', v_f.steel_type, 'weight_tons', v_f.weight_tons, 'status', v_f.status),
    'shipper', (select jsonb_build_object('name', coalesce(c.trade_name, c.name)) from public.companies c where c.id = v_t.shipper_company_id),
    'carrier', (select jsonb_build_object('name', coalesce(c.trade_name, c.name)) from public.companies c where c.id = v_t.carrier_company_id),
    'driver', public.trip_driver_block(v_t, v_role),
    'planned_pickup_at', v_t.planned_pickup_at, 'planned_delivery_at', v_t.planned_delivery_at, 'planned_distance_km', v_t.planned_distance_km,
    'eta', jsonb_build_object('at', v_t.eta_at, 'source', v_t.eta_source, 'updated_at', v_t.eta_updated_at, 'basis', v_t.eta_basis,
                              'label', 'estimativa operacional (nao e rota rodoviaria exata)'),
    'tracking_state', v_t.tracking_state, 'last_location_at', v_t.last_location_at,
    'last_location', case when v_t.last_location_geog is not null and (v_role = 'admin' or public.trip_is_active(v_t.status) or v_role like 'carrier_%')
                          then jsonb_build_object('lat', extensions.ST_Y(v_t.last_location_geog::extensions.geometry), 'lng', extensions.ST_X(v_t.last_location_geog::extensions.geometry)) end,
    'paused_by_contract', v_t.paused_by_contract, 'paused_by_exception_id', v_t.paused_by_exception_id,
    'has_open_critical_exception', v_t.has_open_critical_exception, 'delivery_exception', v_t.delivery_exception,
    'loaded_at', v_t.loaded_at, 'departed_pickup_at', v_t.departed_pickup_at, 'delivered_at', v_t.delivered_at, 'returned_at', v_t.returned_at,
    'completed_at', v_t.completed_at, 'cancelled_at', v_t.cancelled_at, 'cancel_reason', v_t.cancel_reason, 'terminal_reason', v_t.terminal_reason,
    'cargo_disposition', v_t.cargo_disposition, 'cargo_disposition_at', v_t.cargo_disposition_at,
    'policy_version', v_t.policy_version, 'policy', v_pol,
    'retention', case when v_role = 'admin' then jsonb_build_object('retention_until', v_t.retention_until, 'summary_retention_until', v_t.summary_retention_until,
                     'legal_hold_reason', v_t.legal_hold_reason, 'legal_hold_until', v_t.legal_hold_until, 'raw_locations_purged_at', v_t.raw_locations_purged_at) end,
    'geofences', (select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'lat', extensions.ST_Y(g.center_geog::extensions.geometry), 'lng', extensions.ST_X(g.center_geog::extensions.geometry),
                    'radius_m', g.radius_m, 'source', g.source) order by g.kind), '[]'::jsonb) from public.trip_geofences g where g.trip_id = p_trip_id and g.is_current),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'state', a.state, 'driver_label', a.driver_label_at_assignment,
                      'truck_plate', case when v_role = 'admin' or v_role like 'carrier_%' then a.truck_plate_at_assignment else public.mask_plate(a.truck_plate_at_assignment) end,
                      'assigned_at', a.assigned_at, 'accepted_at', a.accepted_at, 'declined_at', a.declined_at, 'decline_reason', a.decline_reason,
                      'revoked_at', a.revoked_at, 'revoke_reason', a.revoke_reason, 'assigned_by_kind', a.assigned_by_kind,
                      'is_mine', a.driver_profile_id = v_actor) order by a.assigned_at), '[]'::jsonb) from public.trip_assignments a where a.trip_id = p_trip_id),
    'checkpoints', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'seq', c.seq, 'captured_at', c.captured_at, 'received_at', c.received_at,
                      'lat', extensions.ST_Y(c.geog::extensions.geometry), 'lng', extensions.ST_X(c.geog::extensions.geometry), 'accuracy_m', c.accuracy_m,
                      'inside_geofence', c.inside_geofence, 'distance_to_target_m', c.distance_to_target_m, 'geofence_override_reason', c.geofence_override_reason,
                      'photo_path', c.photo_object_path, 'photo_sha256', c.photo_sha256, 'seal_code', c.seal_code, 'seal_verified', c.seal_verified,
                      'note', c.note, 'actor_kind', c.actor_kind) order by c.seq), '[]'::jsonb) from public.trip_checkpoints c where c.trip_id = p_trip_id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'number', d.number, 'path', d.object_path, 'sha256', d.sha256,
                      'size_bytes', d.size_bytes, 'mime', d.mime, 'issued_at', d.issued_at, 'uploaded_by_kind', d.uploaded_by_kind, 'visibility', d.visibility,
                      'superseded', d.superseded_by is not null, 'created_at', d.created_at) order by d.created_at), '[]'::jsonb)
                    from public.trip_documents d where d.trip_id = p_trip_id
                      and (v_role = 'admin' or d.visibility = 'parties' or (d.visibility = 'carrier_admin' and v_role like 'carrier_%'))),
    'exceptions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'severity', x.severity, 'status', x.status, 'opened_by_kind', x.opened_by_kind,
                      'captured_at', x.captured_at, 'description', x.description, 'acknowledged_at', x.acknowledged_at, 'acknowledged_by_kind', x.acknowledged_by_kind,
                      'ack_target_at', x.ack_target_at, 'escalation_level', x.escalation_level, 'resolved_at', x.resolved_at, 'resolution_kind', x.resolution_kind,
                      'resolution_note', x.resolution_note, 'dispute_case_id', x.dispute_case_id, 'blocks_delivery', x.blocks_delivery, 'pauses_trip', x.pauses_trip,
                      'lat', extensions.ST_Y(x.geog::extensions.geometry), 'lng', extensions.ST_X(x.geog::extensions.geometry),
                      'evidence', (select coalesce(jsonb_agg(jsonb_build_object('path', e.object_path, 'sha256', e.sha256, 'mime', e.mime)), '[]'::jsonb) from public.trip_exception_evidence e where e.exception_id = x.id))
                      order by x.captured_at), '[]'::jsonb)
                    from public.trip_exceptions x where x.trip_id = p_trip_id
                      and (v_role = 'admin' or x.visibility = 'parties' or (x.visibility = 'carrier_admin' and v_role in ('carrier_owner', 'carrier_operator', 'carrier_viewer', 'driver')))),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'severity', a.severity, 'status', a.status, 'detected_at', a.detected_at,
                      'details', a.details, 'acknowledged_at', a.acknowledged_at, 'closed_at', a.closed_at) order by a.detected_at desc), '[]'::jsonb)
                 from public.operational_alerts a where a.trip_id = p_trip_id
                   and (v_role = 'admin' or v_role like 'carrier_%' or (v_is_party and a.kind in ('late_eta', 'no_update', 'pod_outside_geofence')))),
    'pod', (select jsonb_build_object('id', p.id, 'version', p.version, 'outcome', p.outcome, 'receiver_name', p.receiver_name, 'receiver_document_kind', p.receiver_document_kind,
                      'receiver_document_last4', p.receiver_document_last4, 'signature_path', p.signature_object_path, 'signature_sha256', p.signature_sha256,
                      'photos', p.photos, 'quantity_declared', p.quantity_declared, 'quantity_received', p.quantity_received, 'notes', p.notes, 'delivered_at', p.delivered_at,
                      'inside_geofence', p.inside_geofence, 'geofence_override_reason', p.geofence_override_reason, 'submitted_by_kind', p.submitted_by_kind,
                      'derived_from_attempt', p.derived_from_attempt_id is not null, 'supersedes_id', p.supersedes_id, 'supersede_reason', p.supersede_reason)
            from public.proof_of_delivery p where p.trip_id = p_trip_id and p.is_current),
    'pod_versions', (select count(*) from public.proof_of_delivery p where p.trip_id = p_trip_id),
    'pod_attempts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'attempt_seq', a.attempt_seq, 'outcome', a.outcome, 'receiver_name', a.receiver_name,
                      'photos', a.photos, 'notes', a.notes, 'captured_at', a.captured_at, 'inside_geofence', a.inside_geofence, 'exception_id', a.exception_id,
                      'quantity_declared', a.quantity_declared, 'quantity_received', a.quantity_received) order by a.attempt_seq), '[]'::jsonb)
                     from public.proof_of_delivery_attempts a where a.trip_id = p_trip_id),
    'cargo_dispositions', (select coalesce(jsonb_agg(jsonb_build_object('disposition', d.disposition, 'reason', d.reason, 'note', d.note, 'occurred_at', d.occurred_at,
                      'location_text', d.location_text, 'custodian_label', d.custodian_label, 'is_emergency', d.is_emergency, 'evidence', d.evidence)), '[]'::jsonb)
                          from public.cargo_dispositions d where d.trip_id = p_trip_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('seq', e.seq, 'type', e.event_type, 'from', e.from_status, 'to', e.to_status, 'actor_kind', e.actor_kind,
                      'captured_at', e.captured_at, 'received_at', e.received_at, 'note', e.note,
                      'internal_note', case when v_role = 'admin' then e.internal_note end,
                      'payload', case when v_role = 'admin' or v_role like 'carrier_%' then e.payload else e.payload - 'assignment_id' - 'previous_assignment_id' end,
                      'lat', extensions.ST_Y(e.geog::extensions.geometry), 'lng', extensions.ST_X(e.geog::extensions.geometry)) order by e.seq), '[]'::jsonb)
               from public.trip_events e where e.trip_id = p_trip_id and (v_role = 'admin' or e.event_type <> 'command_rejected' or v_role in ('driver', 'carrier_owner', 'carrier_operator'))),
    'facts', (select jsonb_build_object('gps_distance_km', o.gps_distance_km, 'aggregated_distance_km', o.aggregated_distance_km, 'planned_distance_km', o.planned_distance_km,
                      'distance_source', o.distance_source, 'duration_min', o.duration_min, 'moving_min', o.moving_min, 'stops_count', o.stops_count, 'sample_quality', o.sample_quality)
              from public.trip_operational_facts o where o.trip_id = p_trip_id),
    'access_log_count', (select count(*) from public.trip_access_log l where l.trip_id = p_trip_id)
  );
  return v_out;
end $fn$;

-- -----------------------------------------------------------------------------
-- posicoes (auditadas)
-- -----------------------------------------------------------------------------
create function public.list_trip_positions(p_trip_id uuid, p_since timestamptz default null)
returns table (captured_at timestamptz, lat numeric, lng numeric, accuracy_m numeric, speed_kmh numeric, flags text[], accepted boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_role text; v_t public.operational_trips%rowtype; v_since timestamptz;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'list_trip_positions: sessao obrigatoria'; end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null then raise exception using errcode = '42501', message = 'list_trip_positions: viagem nao visivel'; end if;
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  if v_role like 'shipper_%' and not public.trip_is_active(v_t.status) and v_t.status <> 'delivered' then
    raise exception using errcode = '42501', message = 'list_trip_positions: trilha bruta so durante a viagem ativa (embarcador)';
  end if;
  v_since := greatest(coalesce(p_since, now() - interval '24 hours'), case when v_role = 'admin' or v_role like 'carrier_%' then '-infinity'::timestamptz else now() - interval '24 hours' end);
  perform public.trip_access_append(p_trip_id, v_actor, public.trip_actor_kind_of(v_role), 'track_raw', 'since=' || v_since::text, 'list_trip_positions');
  return query
    select l.captured_at, round(extensions.ST_Y(l.geog::extensions.geometry)::numeric, 6), round(extensions.ST_X(l.geog::extensions.geometry)::numeric, 6), l.accuracy_m,
           round((l.speed_mps * 3.6)::numeric, 1), l.flags, l.accepted
      from public.trip_locations l where l.trip_id = p_trip_id and l.captured_at >= v_since and l.accepted
     order by l.captured_at limit 5000;
end $fn$;

create function public.list_trip_positions_admin()
returns table (trip_id uuid, trip_number text, status public.trip_status, lat numeric, lng numeric, last_location_at timestamptz, eta_at timestamptz,
               open_alerts integer, has_open_sos boolean, carrier_company_name text, driver_label text)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('list_trip_positions_admin');
begin
  insert into public.trip_access_log (trip_id, actor_id, actor_kind, what, object_ref, rpc_name)
  select t.id, v_actor, 'admin', 'position', null, 'list_trip_positions_admin' from public.operational_trips t
   where public.trip_is_active(t.status) and t.last_location_geog is not null;
  return query
    select t.id, t.trip_number, t.status, round(extensions.ST_Y(t.last_location_geog::extensions.geometry)::numeric, 6), round(extensions.ST_X(t.last_location_geog::extensions.geometry)::numeric, 6),
           t.last_location_at, t.eta_at,
           (select count(*)::integer from public.operational_alerts a where a.trip_id = t.id and a.status <> 'closed'),
           exists (select 1 from public.trip_exceptions x where x.trip_id = t.id and x.kind = 'sos' and x.status not in ('resolved', 'converted_to_dispute')),
           (select coalesce(c.trade_name, c.name) from public.companies c where c.id = t.carrier_company_id),
           (select a.driver_label_at_assignment from public.trip_assignments a where a.trip_id = t.id and a.state in ('offered', 'accepted') limit 1)
      from public.operational_trips t where public.trip_is_active(t.status) and t.last_location_geog is not null;
end $fn$;

create function public.list_operational_alerts(p_status text default 'open', p_limit integer default 200)
returns table (alert_id uuid, trip_id uuid, trip_number text, kind public.trip_alert_kind, severity public.trip_exception_severity, status text,
               detected_at timestamptz, details jsonb, acknowledged_at timestamptz, trip_status public.trip_status)
language plpgsql stable security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_admin boolean;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'list_operational_alerts: sessao obrigatoria'; end if;
  v_admin := public.has_role(v_actor, 'admin'::public.app_role);
  return query
    select a.id, t.id, t.trip_number, a.kind, a.severity, a.status, a.detected_at, a.details, a.acknowledged_at, t.status
      from public.operational_alerts a join public.operational_trips t on t.id = a.trip_id
     where (p_status = 'all' or (p_status = 'open' and a.status <> 'closed') or a.status = p_status)
       and (v_admin or (public.trip_visible(t.id) and (public.trip_role_of(t.id) like 'carrier_%' or a.kind in ('late_eta', 'no_update', 'pod_outside_geofence'))))
     order by (a.severity = 'critical') desc, (a.severity = 'high') desc, a.detected_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $fn$;

create function public.list_sos_queue()
returns table (exception_id uuid, trip_id uuid, trip_number text, status public.trip_exception_status, captured_at timestamptz, ack_target_at timestamptz,
               acknowledged_at timestamptz, acknowledged_by_kind public.trip_actor_kind, escalation_level integer, seconds_open numeric, lat numeric, lng numeric,
               carrier_company_name text, driver_label text, sos_mode text)
language plpgsql stable security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_admin boolean;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'list_sos_queue: sessao obrigatoria'; end if;
  v_admin := public.has_role(v_actor, 'admin'::public.app_role);
  return query
    select x.id, t.id, t.trip_number, x.status, x.captured_at, x.ack_target_at, x.acknowledged_at, x.acknowledged_by_kind, x.escalation_level,
           extract(epoch from (now() - x.captured_at)), extensions.ST_Y(coalesce(t.last_location_geog, x.geog)::extensions.geometry)::numeric, extensions.ST_X(coalesce(t.last_location_geog, x.geog)::extensions.geometry)::numeric,
           (select coalesce(c.trade_name, c.name) from public.companies c where c.id = t.carrier_company_id),
           (select a.driver_label_at_assignment from public.trip_assignments a where a.trip_id = t.id and a.state in ('offered', 'accepted') limit 1),
           case when public.operational_flag('sos_operational') then 'operational' else 'homologation' end
      from public.trip_exceptions x join public.operational_trips t on t.id = x.trip_id
     where x.kind = 'sos' and x.status not in ('resolved', 'converted_to_dispute')
       and (v_admin or public.trip_role_of(t.id) in ('carrier_owner', 'carrier_operator', 'carrier_viewer'))
     order by x.captured_at;
end $fn$;

-- -----------------------------------------------------------------------------
-- motorista: viagem corrente e aviso de privacidade
-- -----------------------------------------------------------------------------
create function public.get_my_driver_trip()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_a public.trip_assignments%rowtype; v_d public.drivers%rowtype; v_n public.privacy_notices%rowtype; v_t public.operational_trips%rowtype; v_pol public.operational_policies%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'get_my_driver_trip: sessao obrigatoria'; end if;
  select * into v_d from public.drivers d where d.profile_id = v_actor;
  v_n := public.current_privacy_notice();
  select * into v_a from public.trip_assignments a where a.driver_profile_id = v_actor and a.state in ('offered', 'accepted') order by a.assigned_at desc limit 1;
  if v_a.id is null then
    return jsonb_build_object('has_trip', false, 'driver_record', v_d.id is not null,
      'privacy_notice', jsonb_build_object('published', v_n.id is not null, 'version', v_n.version, 'sha256', v_n.body_sha256,
        'acknowledged', v_d.privacy_notice_version is not distinct from v_n.version and v_d.privacy_notice_sha256 is not distinct from v_n.body_sha256),
      'sos_mode', case when public.operational_flag('sos_operational') then 'operational' else 'homologation' end);
  end if;
  select * into v_t from public.operational_trips t where t.id = v_a.trip_id;
  v_pol := public.trip_policy(v_t);
  return jsonb_build_object('has_trip', true, 'trip', public.get_trip(v_t.id), 'assignment', jsonb_build_object('id', v_a.id, 'state', v_a.state, 'assigned_at', v_a.assigned_at),
    'policy', to_jsonb(v_pol) - 'id' - 'created_by' - 'request_id' - 'reason',
    'privacy_notice', jsonb_build_object('published', v_n.id is not null, 'version', v_n.version, 'sha256', v_n.body_sha256,
      'acknowledged', v_d.privacy_notice_version is not distinct from v_n.version and v_d.privacy_notice_sha256 is not distinct from v_n.body_sha256),
    'tracking_required', v_t.status in ('en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'returning'),
    'sos_mode', case when public.operational_flag('sos_operational') then 'operational' else 'homologation' end);
end $fn$;

create function public.get_current_privacy_notice()
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_n public.privacy_notices%rowtype; v_d public.drivers%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'get_current_privacy_notice: sessao obrigatoria'; end if;
  v_n := public.current_privacy_notice();
  select * into v_d from public.drivers d where d.profile_id = v_actor;
  if v_n.id is null then return jsonb_build_object('published', false); end if;
  return jsonb_build_object('published', true, 'version', v_n.version, 'sha256', v_n.body_sha256, 'effective_from', v_n.effective_from, 'url', v_n.url, 'body_md', v_n.body_md,
    'legal_basis', v_n.legal_basis, 'acknowledged', v_d.privacy_notice_version is not distinct from v_n.version and v_d.privacy_notice_sha256 is not distinct from v_n.body_sha256,
    'acknowledged_at', v_d.privacy_notice_acknowledged_at);
end $fn$;

create function public.acknowledge_privacy_notice(p_version text, p_sha256 text)
returns table (acknowledged boolean, version text)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_n public.privacy_notices%rowtype; v_d public.drivers%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'acknowledge_privacy_notice: sessao obrigatoria'; end if;
  v_n := public.current_privacy_notice();
  if v_n.id is null then raise exception using errcode = '22023', message = 'acknowledge_privacy_notice: privacy_notice_unpublished'; end if;
  if v_n.version <> p_version or v_n.body_sha256 <> p_sha256 then
    raise exception using errcode = '22023', message = 'acknowledge_privacy_notice: versao/hash nao correspondem ao aviso vigente';
  end if;
  select * into v_d from public.drivers d where d.profile_id = v_actor for update;
  if not found then raise exception using errcode = '42501', message = 'acknowledge_privacy_notice: chamador nao e motorista'; end if;
  update public.drivers d set privacy_notice_version = v_n.version, privacy_notice_sha256 = v_n.body_sha256, privacy_notice_acknowledged_at = now(), updated_at = now() where d.id = v_d.id;
  return query select true, v_n.version;
end $fn$;

create function public.publish_privacy_notice(p_version text, p_body_md text, p_effective_from timestamptz, p_url text, p_request_id uuid)
returns table (version text, body_sha256 text, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('publish_privacy_notice'); v_hash text; v_fp text; v_log public.rpc_call_log%rowtype; v_n public.privacy_notices%rowtype;
begin
  if p_body_md is null or length(p_body_md) < 500 then raise exception using errcode = '22023', message = 'publish_privacy_notice: texto completo obrigatorio (>= 500)'; end if;
  if p_body_md ~* 'placeholder|lorem ipsum|rascunho|\[a definir\]|TODO' then
    raise exception using errcode = '22023', message = 'publish_privacy_notice: texto contem marcadores de rascunho';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_body_md, 'UTF8'), 'sha256'), 'hex');
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('version', p_version, 'sha256', v_hash));
  v_log := public.rpc_idempotency_probe('publish_privacy_notice', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then return query select p_version, v_hash, true; return; end if;
  insert into public.privacy_notices (version, body_md, body_sha256, url, effective_from, published_by, request_id)
  values (p_version, p_body_md, v_hash, p_url, coalesce(p_effective_from, now()), v_actor, p_request_id) returning * into v_n;
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (null, v_actor, 'publish_privacy_notice', null, jsonb_build_object('version', p_version, 'sha256', v_hash, 'effective_from', v_n.effective_from), 'Publicacao do aviso de privacidade aprovado.', p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('publish_privacy_notice', p_request_id, v_actor, null, v_fp, 'accepted');
  return query select v_n.version, v_n.body_sha256, false;
end $fn$;

create function public.publish_operational_policy(p_values jsonb, p_reason text, p_request_id uuid)
returns table (version integer, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('publish_operational_policy'); v_cur public.operational_policies%rowtype; v_new jsonb; v_fp text; v_log public.rpc_call_log%rowtype; v_v integer;
begin
  if p_reason is null or length(btrim(p_reason)) < 10 then raise exception using errcode = '22023', message = 'publish_operational_policy: motivo (>= 10)'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception using errcode = '22023', message = 'publish_operational_policy: valores devem ser objeto'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('values', p_values, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('publish_operational_policy', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then return query select (select max(p.version) from public.operational_policies p), true; return; end if;
  v_cur := public.current_operational_policy();
  v_new := (to_jsonb(v_cur) - 'id' - 'version' - 'effective_from' - 'created_by' - 'reason' - 'request_id' - 'created_at') || p_values;
  select coalesce(max(p.version), 0) + 1 into v_v from public.operational_policies p;
  insert into public.operational_policies
  select * from jsonb_populate_record(null::public.operational_policies,
    v_new || jsonb_build_object('id', gen_random_uuid(), 'version', v_v, 'effective_from', now(), 'created_by', v_actor, 'reason', btrim(p_reason), 'request_id', p_request_id, 'created_at', now()));
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (null, v_actor, 'publish_operational_policy', to_jsonb(v_cur) - 'id' - 'created_by', v_new || jsonb_build_object('version', v_v), p_reason, p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('publish_operational_policy', p_request_id, v_actor, null, v_fp, 'accepted');
  return query select v_v, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- export_my_trip_data: portabilidade/acesso do MOTORISTA (LGPD art. 18).
-- Regra: somente dados pessoais do proprio motorista e fatos operacionais das
-- viagens em que atuou. NUNCA: assinatura, nome ou documento do recebedor;
-- telefone/e-mail/nome de terceiros; caminhos de midia (fotos podem conter
-- terceiros); notas/descricoes livres escritas por outros; ids de outras pessoas.
-- Testado por export_test_m3.sql (campos proibidos ausentes no JSON inteiro).
-- -----------------------------------------------------------------------------
create function public.export_my_trip_data()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_d public.drivers%rowtype; v_name text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'export_my_trip_data: sessao obrigatoria'; end if;
  select * into v_d from public.drivers d where d.profile_id = v_actor;
  if not found then return jsonb_build_object('driver', false); end if;
  select p.full_name into v_name from public.profiles p where p.id = v_actor;
  insert into public.trip_access_log (trip_id, actor_id, actor_kind, what, object_ref, rpc_name)
  select s.trip_id, v_actor, 'driver', 'export', null, 'export_my_trip_data' from public.trip_tracking_sessions s where s.driver_id = v_d.id group by s.trip_id;
  return jsonb_build_object(
    'driver', true,
    'generated_at', now(),
    'subject', jsonb_build_object('driver_id', v_d.id, 'full_name', v_name),
    'privacy_notice', jsonb_build_object('version', v_d.privacy_notice_version, 'acknowledged_at', v_d.privacy_notice_acknowledged_at),
    -- viagens em que houve sessao de rastreamento deste motorista: fatos operacionais, sem partes
    'trips', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', t.id, 'trip_number', t.trip_number, 'status', t.status,
                 'planned_pickup_at', t.planned_pickup_at, 'planned_delivery_at', t.planned_delivery_at, 'planned_distance_km', t.planned_distance_km,
                 'loaded_at', t.loaded_at, 'departed_pickup_at', t.departed_pickup_at, 'delivered_at', t.delivered_at, 'returned_at', t.returned_at,
                 'completed_at', t.completed_at, 'cancelled_at', t.cancelled_at, 'cargo_disposition', t.cargo_disposition,
                 'raw_locations_purged_at', t.raw_locations_purged_at, 'retention_until', t.retention_until) order by t.created_at), '[]'::jsonb)
              from public.operational_trips t where t.id in (select s.trip_id from public.trip_tracking_sessions s where s.driver_id = v_d.id)),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', s.trip_id, 'started_at', s.started_at, 'ended_at', s.ended_at, 'end_reason', s.end_reason,
                   'points_received', s.points_received, 'provider', s.provider, 'platform', s.platform, 'app_version', s.app_version,
                   'privacy_notice_version', s.privacy_notice_version) order by s.started_at), '[]'::jsonb)
                 from public.trip_tracking_sessions s where s.driver_id = v_d.id),
    -- eventos praticados PELO motorista (sem payload, sem notas - texto livre pode citar terceiros -, sem outros atores)
    'events', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', e.trip_id, 'seq', e.seq, 'event_type', e.event_type, 'from_status', e.from_status,
                 'to_status', e.to_status, 'captured_at', e.captured_at, 'received_at', e.received_at) order by e.trip_id, e.seq), '[]'::jsonb)
               from public.trip_events e where e.actor_id = v_actor and e.actor_kind = 'driver'),
    -- checkpoints do motorista: fato, hora, geofence, lacre, hash da foto (sem caminho, conteudo nem nota: o recibo de retorno grava o nome de quem recebeu)
    'checkpoints', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', c.trip_id, 'kind', c.kind, 'seq', c.seq, 'captured_at', c.captured_at,
                      'inside_geofence', c.inside_geofence, 'distance_to_target_m', c.distance_to_target_m, 'seal_code', c.seal_code,
                      'seal_verified', c.seal_verified, 'photo_sha256', c.photo_sha256) order by c.trip_id, c.seq), '[]'::jsonb)
                    from public.trip_checkpoints c where c.actor_id = v_actor and c.actor_kind = 'driver'),
    -- comprovantes submetidos pelo motorista: desfecho e quantidades; NADA do recebedor (nome, documento, assinatura), sem fotos, sem notas
    'proofs_of_delivery', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', p.trip_id, 'version', p.version, 'is_current', p.is_current, 'outcome', p.outcome,
                             'delivered_at', p.delivered_at, 'received_at', p.received_at, 'inside_geofence', p.inside_geofence,
                             'quantity_declared', p.quantity_declared, 'quantity_received', p.quantity_received) order by p.trip_id, p.version), '[]'::jsonb)
                           from public.proof_of_delivery p where p.submitted_by = v_actor and p.submitted_by_kind = 'driver'),
    -- ocorrencias abertas pelo motorista: classificacao e desfecho (sem descricao livre nem notas de resolucao de terceiros)
    'exceptions', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', x.trip_id, 'kind', x.kind, 'severity', x.severity, 'status', x.status,
                     'captured_at', x.captured_at, 'acknowledged_at', x.acknowledged_at, 'resolved_at', x.resolved_at, 'resolution_kind', x.resolution_kind) order by x.captured_at), '[]'::jsonb)
                   from public.trip_exceptions x where x.opened_by = v_actor and x.opened_by_kind = 'driver'),
    'summaries', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', m.trip_id, 'hour', m.hour_bucket, 'n_points', m.n_points, 'n_accepted', m.n_accepted,
                    'distance_km', m.distance_km, 'avg_speed_kmh', m.avg_speed_kmh, 'stops_count', m.stops_count) order by m.trip_id, m.hour_bucket), '[]'::jsonb)
                  from public.trip_location_summaries m where m.trip_id in (select s.trip_id from public.trip_tracking_sessions s where s.driver_id = v_d.id)),
    -- trilha bruta ainda retida (dado pessoal do proprio motorista), somente das sessoes dele
    'raw_points', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', l.trip_id, 'captured_at', l.captured_at,
                     'lat', extensions.st_y(l.geog::extensions.geometry), 'lng', extensions.st_x(l.geog::extensions.geometry),
                     'accuracy_m', l.accuracy_m, 'speed_mps', l.speed_mps, 'heading', l.heading, 'accepted', l.accepted) order by l.trip_id, l.captured_at), '[]'::jsonb)
                   from public.trip_locations l where l.session_id in (select s.id from public.trip_tracking_sessions s where s.driver_id = v_d.id)),
    'raw_points_retained', (select count(*) from public.trip_locations l where l.session_id in (select s.id from public.trip_tracking_sessions s where s.driver_id = v_d.id)));
end $fn$;

-- -----------------------------------------------------------------------------
-- place_bid: o frontend nunca escolhe qual id de motorista gravar
-- -----------------------------------------------------------------------------
create function public.place_bid(p_freight_id uuid, p_amount numeric, p_toll numeric, p_estimated_hours numeric, p_ev_certified boolean,
  p_driver_id uuid, p_truck_id uuid, p_request_id uuid)
returns table (bid_id uuid, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_ca public.carriers%rowtype; v_d public.drivers%rowtype; v_k public.trucks%rowtype; v_f public.freights%rowtype; v_fp text; v_log public.rpc_call_log%rowtype; v_b public.bids%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'place_bid: sessao obrigatoria'; end if;
  if p_freight_id is null or p_amount is null or p_amount <= 0 or scale(p_amount) > 2 then
    raise exception using errcode = '22023', message = 'place_bid: valor invalido';
  end if;
  select ca.* into v_ca from public.carriers ca join public.companies co on co.id = ca.company_id where co.owner_id = v_actor limit 1;
  if not found then raise exception using errcode = '42501', message = 'place_bid: chamador nao e proprietario de transportadora'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('f', p_freight_id, 'a', p_amount, 'd', p_driver_id, 't', p_truck_id));
  v_log := public.rpc_idempotency_probe('place_bid', p_request_id, v_actor, p_freight_id, v_fp);
  if v_log.id is not null then
    select * into v_b from public.bids b where b.freight_id = p_freight_id and b.carrier_id = v_ca.id order by b.submitted_at desc limit 1;
    return query select v_b.id, true; return;
  end if;
  select * into v_f from public.freights f where f.id = p_freight_id;
  if not found or v_f.status not in ('published', 'bidding') then
    raise exception using errcode = '22023', message = 'place_bid: frete nao esta aberto a lances';
  end if;
  if p_driver_id is not null then
    select * into v_d from public.drivers d where d.id = p_driver_id;
    if not found or v_d.carrier_id is distinct from v_ca.id then raise exception using errcode = '42501', message = 'place_bid: motorista nao pertence a transportadora'; end if;
    if v_d.profile_id is null then raise exception using errcode = '22023', message = 'place_bid: motorista sem perfil de autenticacao'; end if;
  end if;
  if p_truck_id is not null then
    select * into v_k from public.trucks k where k.id = p_truck_id;
    if not found or v_k.carrier_id is distinct from v_ca.id then raise exception using errcode = '42501', message = 'place_bid: veiculo nao pertence a transportadora'; end if;
  end if;
  insert into public.bids (freight_id, carrier_id, driver_id, driver_record_id, truck_id, amount_brl, toll_brl, estimated_hours, ev_certified, status)
  values (p_freight_id, v_ca.id, v_d.profile_id, v_d.id, p_truck_id, p_amount, coalesce(p_toll, 0), p_estimated_hours, coalesce(p_ev_certified, false), 'pending')
  returning * into v_b;
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('place_bid', p_request_id, v_actor, p_freight_id, v_fp, 'accepted');
  return query select v_b.id, false;
end $fn$;

-- GRANTS
do $$
declare v_sig text;
begin
  foreach v_sig in array array['public.mask_plate(text)', 'public.trip_is_active(public.trip_status)', 'public.trip_driver_block(public.operational_trips, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array[
    'public.set_company_operational_contact(uuid, text, text, uuid)', 'public.list_my_trips(text, public.trip_status[], integer)', 'public.get_trip(uuid)',
    'public.list_trip_positions(uuid, timestamptz)', 'public.list_trip_positions_admin()', 'public.list_operational_alerts(text, integer)', 'public.list_sos_queue()',
    'public.get_my_driver_trip()', 'public.get_current_privacy_notice()', 'public.acknowledge_privacy_notice(text, text)', 'public.publish_privacy_notice(text, text, timestamptz, text, uuid)',
    'public.publish_operational_policy(jsonb, text, uuid)', 'public.export_my_trip_data()', 'public.place_bid(uuid, numeric, numeric, numeric, boolean, uuid, uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
