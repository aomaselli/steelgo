-- =============================================================================
-- MODULO 3 - 76/81: checkpoints, documentos, POD, excecao de entrega, transbordo,
--   recibo de retorno e integracao POD -> contrato
--   * POD aceita: viagem delivered + delivery_completed_at na MESMA transacao
--     (complete_contract_delivery_core, ator driver). Nao libera pagamento:
--     try_complete_contract continua exigindo a condicao financeira;
--   * POD recusada/parcial: tentativa + excecao high + delivery_exception; NADA de
--     delivery_completed_at; resolucao administrativa decide o caminho;
--   * evidencia obrigatoria validada no Storage (assert_trip_media); sem media_pending;
--   * complete_contract_delivery (transportadora, web) vira wrapper: com viagem
--     viva so aceita se a POD ja entregou (idempotente); sem viagem, comportamento M1.
-- =============================================================================
begin;

-- POD derivada de resolucao administrativa pode nao ter assinatura (recusa formal)
alter table public.proof_of_delivery alter column signature_object_path drop not null;
alter table public.proof_of_delivery alter column signature_sha256 drop not null;
alter table public.proof_of_delivery add constraint pod_signature_required check (
  derived_from_attempt_id is not null or (signature_object_path is not null and signature_sha256 is not null));
alter table public.proof_of_delivery add constraint pod_derived_fk
  foreign key (derived_from_attempt_id) references public.proof_of_delivery_attempts(id);

-- -----------------------------------------------------------------------------
-- complete_contract_delivery: core (sem verificacao de parte) + wrapper M1
-- -----------------------------------------------------------------------------
create function public.complete_contract_delivery_core(
  p_contract_id uuid, p_actor uuid, p_actor_kind text, p_rpc text, p_request_id uuid, p_fp text)
returns table (delivery_at timestamptz, contract_completed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_c public.contracts%rowtype; v_now timestamptz := now(); v_done boolean;
        -- contract_lifecycle_events aceita party/admin/provider/system: o motorista age pela parte transportadora
        v_kind text := case when p_actor_kind = 'driver' then 'party' else p_actor_kind end;
begin
  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = format('%s: contrato inexistente', p_rpc);
  end if;
  if v_c.status is distinct from 'active'::public.contract_status then
    raise exception using errcode = '22023', message = format('%s: contrato em %s; somente contrato active tem entrega a concluir', p_rpc, v_c.status);
  end if;
  if v_c.delivery_completed_at is not null then
    return query select v_c.delivery_completed_at, false; return;
  end if;
  update public.contracts c set delivery_completed_at = v_now, delivery_completed_by = p_actor
   where c.id = p_contract_id and c.status = 'active'::public.contract_status and c.delivery_completed_at is null;
  if not found then
    raise exception using errcode = '40001', message = format('%s: o contrato mudou de estado durante a operacao', p_rpc);
  end if;
  perform public.contract_lifecycle_append(
    p_contract_id, 'delivery_completed'::public.contract_lifecycle_transition, 'active'::public.contract_status, v_c.escrow_status,
    v_now, null, null, null, null, p_actor, v_kind,
    case when p_actor_kind = 'driver' then 'Entrega concluida por prova de entrega (POD) do motorista.'
         when p_actor_kind = 'admin' then 'Entrega concluida por resolucao administrativa de excecao de entrega.'
         else 'Entrega declarada concluida pela transportadora.' end,
    p_rpc, p_request_id, p_fp);
  v_done := public.try_complete_contract(p_contract_id, p_actor, v_kind, p_rpc, p_request_id, p_fp);
  return query select v_now, v_done;
end $fn$;

create or replace function public.complete_contract_delivery(p_contract_id uuid, p_request_id uuid)
returns table (affected_contract_id uuid, new_status public.contract_status, new_escrow_status text, delivery_at timestamptz, contract_completed boolean, was_replayed boolean)
language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype; v_party text; v_fp text; v_log public.rpc_call_log%rowtype; v_t public.operational_trips%rowtype; v_r record;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'complete_contract_delivery: chamador nao autenticado';
  end if;
  if p_contract_id is null then
    raise exception using errcode = '22004', message = 'complete_contract_delivery: p_contract_id e obrigatorio';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('contract_id', p_contract_id));
  v_log := public.rpc_idempotency_probe('complete_contract_delivery', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    return query select v_c.id, v_c.status, v_c.escrow_status, v_c.delivery_completed_at, v_c.status = 'completed'::public.contract_status, true;
    return;
  end if;
  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'complete_contract_delivery: contrato inexistente';
  end if;
  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is distinct from 'carrier' then
    raise exception using errcode = '42501', message = 'complete_contract_delivery: somente a transportadora do contrato conclui a entrega';
  end if;
  -- MODULO 3: com viagem operacional, a entrega e provada pela POD do motorista
  select * into v_t from public.operational_trips t where t.contract_id = p_contract_id order by t.attempt_number desc limit 1;
  if found then
    if v_t.status in ('delivered', 'completed') and v_c.delivery_completed_at is not null then
      insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
      values ('complete_contract_delivery', p_request_id, v_actor, p_contract_id, v_fp, 'accepted', 'entrega ja provada por POD; sem efeito');
      return query select v_c.id, v_c.status, v_c.escrow_status, v_c.delivery_completed_at, v_c.status = 'completed'::public.contract_status, false;
      return;
    end if;
    raise exception using errcode = '22023',
      message = format('complete_contract_delivery: contrato com viagem operacional (%s em %s); a entrega e registrada pela prova de entrega do motorista',
                       v_t.trip_number, v_t.status);
  end if;
  if v_c.status is distinct from 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('complete_contract_delivery: contrato em %s; somente contrato active tem entrega a concluir', coalesce(v_c.status::text, 'nulo'));
  end if;
  if v_c.delivery_completed_at is not null then
    raise exception using errcode = '23505', message = 'complete_contract_delivery: entrega ja concluida; conclusao nao e substituida';
  end if;
  select * into v_r from public.complete_contract_delivery_core(p_contract_id, v_actor, 'party', 'complete_contract_delivery', p_request_id, v_fp);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('complete_contract_delivery', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('entrega concluida; contrato %s', case when v_r.contract_completed then 'CONCLUIDO na mesma transacao' else 'segue active, aguardando liberacao confirmada' end));
  select * into v_c from public.contracts c where c.id = p_contract_id;
  return query select p_contract_id, v_c.status, v_c.escrow_status, v_c.delivery_completed_at, v_r.contract_completed, false;
end;
$function$;

-- -----------------------------------------------------------------------------
-- RPC: record_trip_checkpoint (motorista)
-- -----------------------------------------------------------------------------
create function public.record_trip_checkpoint(
  p_trip_id uuid, p_kind public.trip_checkpoint_kind, p_command_id uuid, p_seq bigint, p_captured_at timestamptz,
  p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_seal_code text, p_photo_path text, p_photo_sha256 text,
  p_note text, p_device_id uuid, p_geofence_override_reason text default null)
returns table (applied boolean, duplicate boolean, rejection_code text, checkpoint_id uuid, trip_status public.trip_status)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_pol public.operational_policies%rowtype;
  v_rej text; v_pt extensions.geography; v_g public.trip_geofences%rowtype; v_dist numeric; v_inside boolean; v_m record; v_cp public.trip_checkpoints%rowtype; v_seq integer; v_ev uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'record_trip_checkpoint: sessao obrigatoria'; end if;
  if p_trip_id is null or p_kind is null or p_command_id is null or p_captured_at is null then
    raise exception using errcode = '22004', message = 'record_trip_checkpoint: parametros obrigatorios ausentes';
  end if;
  v_t := public.trip_lock(p_trip_id);
  v_a := public.trip_live_assignment_of_caller(p_trip_id);
  if v_a.id is null then
    raise exception using errcode = '42501', message = 'record_trip_checkpoint: chamador nao e o motorista vinculado';
  end if;
  if exists (select 1 from public.trip_checkpoints c where c.trip_id = p_trip_id and c.command_id = p_command_id) then
    select * into v_cp from public.trip_checkpoints c where c.trip_id = p_trip_id and c.command_id = p_command_id;
    return query select false, true, null::text, v_cp.id, v_t.status; return;
  end if;
  if exists (select 1 from public.trip_events e where e.trip_id = p_trip_id and e.command_id = p_command_id) then
    return query select false, true, null::text, null::uuid, v_t.status; return;
  end if;
  v_pol := public.trip_policy(v_t);
  if p_captured_at > now() + make_interval(mins => v_pol.clock_future_tolerance_min) then
    raise exception using errcode = '22023', message = 'record_trip_checkpoint: captured_at no futuro';
  end if;
  if v_a.state <> 'accepted' then v_rej := 'assignment_not_accepted';
  elsif v_t.paused_by_contract then v_rej := 'trip_paused_by_contract';
  elsif v_t.paused_by_exception_id is not null and p_kind <> 'custom' then v_rej := 'trip_paused_by_exception';
  elsif p_kind in ('unloaded', 'transshipment', 'return_receipt') then v_rej := 'checkpoint_requires_dedicated_rpc';
  elsif p_lat is null or p_lng is null or p_accuracy_m is null then v_rej := 'location_required';
  elsif p_accuracy_m > v_pol.accuracy_reject_m then v_rej := 'accuracy_rejected';
  elsif p_kind = 'arrived_pickup' and v_t.status not in ('en_route_to_pickup', 'at_pickup') then v_rej := 'invalid_state';
  elsif p_kind = 'loading_started' and v_t.status not in ('at_pickup', 'loading') then v_rej := 'invalid_state';
  elsif p_kind = 'loaded' and v_t.status <> 'loading' then v_rej := 'invalid_state';
  elsif p_kind = 'departed_pickup' and v_t.status not in ('loading', 'in_transit') then v_rej := 'invalid_state';
  elsif p_kind in ('waypoint', 'border', 'rest_stop') and v_t.status not in ('in_transit', 'returning') then v_rej := 'invalid_state';
  elsif p_kind = 'arrived_delivery' and v_t.status not in ('in_transit', 'at_delivery') then v_rej := 'invalid_state';
  elsif p_kind = 'unloading_started' and v_t.status not in ('at_delivery', 'unloading') then v_rej := 'invalid_state';
  elsif p_kind = 'loaded' and (p_photo_path is null or p_photo_sha256 is null) then v_rej := 'photo_required';
  elsif p_kind = 'loaded' and exists (select 1 from public.trip_checkpoints c where c.trip_id = p_trip_id and c.kind = 'loaded') then v_rej := 'already_loaded';
  end if;
  if v_rej is not null then
    perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'record_trip_checkpoint', null, null, v_rej,
      jsonb_build_object('kind', p_kind), p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
    return query select false, false, v_rej, null::uuid, v_t.status; return;
  end if;
  if p_photo_path is not null then
    select * into v_m from public.assert_trip_media(p_trip_id, p_command_id, 'photo', p_photo_path, p_photo_sha256, v_actor);
  end if;
  v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  select * into v_g from public.trip_geofences g where g.trip_id = p_trip_id and g.is_current
    and g.kind = case when p_kind in ('arrived_pickup', 'loading_started', 'loaded', 'departed_pickup') then 'pickup'
                      when p_kind in ('arrived_delivery', 'unloading_started') then 'delivery' else '' end;
  if v_g.id is not null then
    v_dist := extensions.ST_Distance(v_pt, v_g.center_geog);
    v_inside := v_dist <= v_g.radius_m + least(p_accuracy_m, v_pol.accuracy_primary_m);
    if not v_inside and p_kind in ('loaded', 'arrived_pickup', 'arrived_delivery')
       and (p_geofence_override_reason is null or length(btrim(p_geofence_override_reason)) < 20) then
      perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'record_trip_checkpoint', null, null, 'outside_geofence',
        jsonb_build_object('kind', p_kind, 'distance_m', round(v_dist)), p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
      return query select false, false, 'outside_geofence'::text, null::uuid, v_t.status; return;
    end if;
  end if;
  select coalesce(max(c.seq), 0) + 1 into v_seq from public.trip_checkpoints c where c.trip_id = p_trip_id;
  insert into public.trip_checkpoints (trip_id, kind, seq, actor_id, actor_kind, captured_at, geog, accuracy_m, inside_geofence, distance_to_target_m,
    geofence_override_reason, photo_object_path, photo_sha256, photo_size_bytes, photo_mime, seal_code, seal_verified, note, command_id, device_id)
  values (p_trip_id, p_kind, v_seq, v_actor, 'driver', p_captured_at, v_pt, p_accuracy_m, v_inside, round(coalesce(v_dist, 0)),
    p_geofence_override_reason, p_photo_path, p_photo_sha256, v_m.size_bytes, v_m.mime, p_seal_code, case when p_seal_code is not null then true end, p_note, p_command_id, p_device_id)
  returning * into v_cp;
  v_ev := public.trip_event_append(p_trip_id, 'checkpoint', v_actor, 'driver', 'record_trip_checkpoint', null, null, coalesce(p_note, p_kind::text),
    jsonb_build_object('kind', p_kind, 'checkpoint_id', v_cp.id, 'inside_geofence', v_inside, 'has_photo', p_photo_path is not null, 'seal', p_seal_code is not null),
    p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id, p_checkpoint_id => v_cp.id);
  update public.trip_checkpoints c set event_id = v_ev where c.id = v_cp.id;
  if p_kind = 'loaded' then
    update public.operational_trips t set loaded_at = coalesce(t.loaded_at, p_captured_at) where t.id = p_trip_id;
    perform public.notify_trip(p_trip_id, 'trip_loaded', format('Viagem %s: carga embarcada', v_t.trip_number), 'Foto do carregamento registrada.', true, true, false, false, v_actor);
  end if;
  update public.operational_trips t set last_location_at = greatest(coalesce(t.last_location_at, p_captured_at), p_captured_at), last_location_geog = v_pt where t.id = p_trip_id;
  return query select true, false, null::text, v_cp.id, v_t.status;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: add_trip_document
-- -----------------------------------------------------------------------------
create function public.add_trip_document(p_trip_id uuid, p_kind text, p_number text, p_object_path text, p_sha256 text,
  p_issued_at timestamptz, p_visibility public.trip_visibility, p_note text, p_request_id uuid)
returns table (document_id uuid, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_role text; v_t public.operational_trips%rowtype; v_fp text; v_log public.rpc_call_log%rowtype; v_m record; v_d public.trip_documents%rowtype; v_ev uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'add_trip_document: sessao obrigatoria'; end if;
  if p_kind is null or p_object_path is null or p_sha256 is null then
    raise exception using errcode = '22004', message = 'add_trip_document: kind, caminho e hash sao obrigatorios';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'path', p_object_path, 'sha', p_sha256));
  v_log := public.rpc_idempotency_probe('add_trip_document', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_d from public.trip_documents d where d.trip_id = p_trip_id and d.request_id = p_request_id; return query select v_d.id, true; return;
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role is null or v_role in ('shipper_viewer', 'carrier_viewer') then
    raise exception using errcode = '42501', message = 'add_trip_document: papel sem permissao';
  end if;
  v_t := public.trip_lock(p_trip_id);
  if v_t.status in ('completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'add_trip_document: viagem encerrada';
  end if;
  if v_role like 'shipper_%' and coalesce(p_visibility, 'parties') <> 'parties' then
    raise exception using errcode = '22023', message = 'add_trip_document: embarcador so anexa com visibilidade parties';
  end if;
  select * into v_m from public.assert_trip_media(p_trip_id, p_request_id, 'document', p_object_path, p_sha256, v_actor);
  insert into public.trip_documents (trip_id, kind, number, object_path, sha256, size_bytes, mime, issued_at, uploaded_by, uploaded_by_kind, visibility, note, request_id)
  values (p_trip_id, p_kind, nullif(btrim(p_number), ''), p_object_path, p_sha256, v_m.size_bytes, v_m.mime, p_issued_at, v_actor,
          public.trip_actor_kind_of(v_role), coalesce(p_visibility, 'parties'), p_note, p_request_id) returning * into v_d;
  v_ev := public.trip_event_append(p_trip_id, 'document_added', v_actor, public.trip_actor_kind_of(v_role), 'add_trip_document', null, null,
    format('Documento %s%s anexado.', p_kind, case when p_number is not null then ' ' || p_number else '' end),
    jsonb_build_object('document_id', v_d.id, 'kind', p_kind, 'visibility', v_d.visibility), p_document_id => v_d.id, p_request_id => p_request_id, p_fingerprint => v_fp);
  update public.trip_documents d set event_id = v_ev where d.id = v_d.id;
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('add_trip_document', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_d.id, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: submit_proof_of_delivery (motorista)
-- p_photos: [{"path":..,"sha256":..}]
-- -----------------------------------------------------------------------------
create function public.submit_proof_of_delivery(
  p_trip_id uuid, p_command_id uuid, p_seq bigint, p_captured_at timestamptz, p_lat numeric, p_lng numeric, p_accuracy_m numeric,
  p_outcome public.pod_outcome, p_receiver_name text, p_receiver_document_kind text, p_receiver_document_last4 text,
  p_signature_path text, p_signature_sha256 text, p_photos jsonb, p_qty_declared numeric, p_qty_received numeric, p_notes text,
  p_device_id uuid, p_geofence_override_reason text default null)
returns table (applied boolean, duplicate boolean, rejection_code text, outcome public.pod_outcome, trip_status public.trip_status,
               pod_id uuid, attempt_id uuid, delivery_completed boolean, contract_completed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_pol public.operational_policies%rowtype;
  v_rej text; v_pt extensions.geography; v_g public.trip_geofences%rowtype; v_dist numeric; v_inside boolean := false; v_m record; v_i integer;
  v_pod public.proof_of_delivery%rowtype; v_att public.proof_of_delivery_attempts%rowtype; v_x public.trip_exceptions%rowtype; v_cp public.trip_checkpoints%rowtype;
  v_seq integer; v_r record; v_ev uuid; v_c public.contracts%rowtype; v_refused boolean;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'submit_proof_of_delivery: sessao obrigatoria'; end if;
  if p_trip_id is null or p_command_id is null or p_captured_at is null or p_outcome is null then
    raise exception using errcode = '22004', message = 'submit_proof_of_delivery: parametros obrigatorios ausentes';
  end if;
  v_refused := p_outcome in ('partially_refused', 'refused');
  -- ordem de locks: contracts -> operational_trips
  select * into v_c from public.contracts c where c.id = (select t.contract_id from public.operational_trips t where t.id = p_trip_id) for update;
  v_t := public.trip_lock(p_trip_id);
  v_a := public.trip_live_assignment_of_caller(p_trip_id);
  if v_a.id is null then
    raise exception using errcode = '42501', message = 'submit_proof_of_delivery: chamador nao e o motorista vinculado';
  end if;
  if exists (select 1 from public.proof_of_delivery p where p.trip_id = p_trip_id and p.command_id = p_command_id) then
    select * into v_pod from public.proof_of_delivery p where p.trip_id = p_trip_id and p.command_id = p_command_id;
    return query select false, true, null::text, v_pod.outcome, v_t.status, v_pod.id, null::uuid, true, v_c.status = 'completed'; return;
  end if;
  if exists (select 1 from public.proof_of_delivery_attempts p where p.trip_id = p_trip_id and p.command_id = p_command_id) then
    select * into v_att from public.proof_of_delivery_attempts p where p.trip_id = p_trip_id and p.command_id = p_command_id;
    return query select false, true, null::text, v_att.outcome, v_t.status, null::uuid, v_att.id, false, false; return;
  end if;
  if exists (select 1 from public.trip_events e where e.trip_id = p_trip_id and e.command_id = p_command_id) then
    return query select false, true, null::text, p_outcome, v_t.status, null::uuid, null::uuid, false, false; return;
  end if;
  v_pol := public.trip_policy(v_t);
  if p_captured_at > now() + make_interval(mins => v_pol.clock_future_tolerance_min) then
    raise exception using errcode = '22023', message = 'submit_proof_of_delivery: captured_at no futuro';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) < 1 then
    raise exception using errcode = '22023', message = 'submit_proof_of_delivery: pelo menos uma foto e obrigatoria';
  end if;
  if not v_refused and (p_signature_path is null or p_signature_sha256 is null or p_receiver_name is null or length(btrim(p_receiver_name)) < 2) then
    raise exception using errcode = '22023', message = 'submit_proof_of_delivery: entrega aceita exige assinatura e nome do recebedor';
  end if;
  if p_outcome = 'accepted_with_notes' and (p_notes is null or length(btrim(p_notes)) < 10) then
    raise exception using errcode = '22023', message = 'submit_proof_of_delivery: aceite com ressalvas exige nota (>= 10)';
  end if;
  if v_refused and (p_notes is null or length(btrim(p_notes)) < 20) then
    raise exception using errcode = '22023', message = 'submit_proof_of_delivery: recusa exige nota (>= 20)';
  end if;
  if p_receiver_document_last4 is not null and p_receiver_document_last4 !~ '^[A-Za-z0-9]{1,4}$' then
    raise exception using errcode = '22023', message = 'submit_proof_of_delivery: ultimos 4 caracteres do documento invalidos';
  end if;
  -- rejeicoes de estado (registradas)
  if v_a.state <> 'accepted' then v_rej := 'assignment_not_accepted';
  elsif v_t.paused_by_contract then v_rej := 'trip_paused_by_contract';
  elsif v_t.paused_by_exception_id is not null then v_rej := 'trip_paused_by_exception';
  elsif v_t.delivery_exception then v_rej := 'delivery_exception_open';
  elsif v_t.has_open_critical_exception then v_rej := 'critical_exception_open';
  elsif v_t.status not in ('at_delivery', 'unloading') then v_rej := 'invalid_state:' || v_t.status::text;
  elsif p_lat is null or p_lng is null or p_accuracy_m is null then v_rej := 'location_required';
  elsif p_accuracy_m > v_pol.accuracy_reject_m then v_rej := 'accuracy_rejected';
  elsif v_t.loaded_at is null then v_rej := 'not_loaded';
  end if;
  if v_rej is not null then
    perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'submit_proof_of_delivery', null, null, v_rej,
      jsonb_build_object('outcome', p_outcome), p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
    return query select false, false, v_rej, p_outcome, v_t.status, null::uuid, null::uuid, false, false; return;
  end if;
  v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  select * into v_g from public.trip_geofences g where g.trip_id = p_trip_id and g.is_current and g.kind = 'delivery';
  if v_g.id is not null then
    v_dist := extensions.ST_Distance(v_pt, v_g.center_geog);
    v_inside := v_dist <= v_g.radius_m + least(p_accuracy_m, v_pol.accuracy_primary_m);
  else
    v_inside := true; -- sem geofence cadastrado: nao ha como exigir
  end if;
  if not v_inside and (p_geofence_override_reason is null or length(btrim(p_geofence_override_reason)) < 20) then
    perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'submit_proof_of_delivery', null, null, 'outside_geofence',
      jsonb_build_object('distance_m', round(v_dist)), p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
    return query select false, false, 'outside_geofence'::text, p_outcome, v_t.status, null::uuid, null::uuid, false, false; return;
  end if;
  -- evidencias validadas no Storage (sem media_pending)
  for v_i in 0 .. jsonb_array_length(p_photos) - 1 loop
    perform public.assert_trip_media(p_trip_id, p_command_id, 'photo', p_photos -> v_i ->> 'path', p_photos -> v_i ->> 'sha256', v_actor);
  end loop;
  if p_signature_path is not null then
    perform public.assert_trip_media(p_trip_id, p_command_id, 'signature', p_signature_path, p_signature_sha256, v_actor, 256);
  end if;
  if not v_inside then
    perform public.trip_alert_open(v_t, 'pod_outside_geofence', 'medium',
      jsonb_build_object('distance_m', round(v_dist), 'reason', btrim(p_geofence_override_reason), 'outcome', p_outcome, 'message', 'POD registrada fora do geofence de entrega.'), 'submit_proof_of_delivery');
  end if;
  if v_t.status = 'at_delivery' then
    perform public.trip_event_append(p_trip_id, 'transition', v_actor, 'driver', 'submit_proof_of_delivery', 'at_delivery', 'unloading', 'Descarga iniciada com a prova de entrega.', '{}'::jsonb);
  end if;

  if v_refused then
    select coalesce(max(a.attempt_seq), 0) + 1 into v_seq from public.proof_of_delivery_attempts a where a.trip_id = p_trip_id;
    insert into public.trip_exceptions (trip_id, kind, severity, status, opened_by, opened_by_kind, captured_at, geog, description, visibility,
      ack_target_at, blocks_delivery, command_id, device_id)
    values (p_trip_id, (case when p_outcome = 'refused' then 'cargo_refusal' else 'delivery_mismatch' end)::public.trip_exception_kind, 'high', 'open', v_actor, 'driver', p_captured_at, v_pt,
      format('%s na entrega: %s', case when p_outcome = 'refused' then 'Recusa total' else 'Recusa parcial' end, btrim(p_notes)), 'parties',
      now() + make_interval(mins => v_pol.alert_ack_target_min), true, p_command_id, p_device_id)
    returning * into v_x;
    insert into public.proof_of_delivery_attempts (trip_id, attempt_seq, outcome, receiver_name, receiver_document_kind, receiver_document_last4,
      signature_object_path, signature_sha256, photos, quantity_declared, quantity_received, notes, captured_at, geog, accuracy_m, inside_geofence,
      geofence_override_reason, submitted_by, exception_id, command_id, device_id)
    values (p_trip_id, v_seq, p_outcome, nullif(btrim(p_receiver_name), ''), p_receiver_document_kind, p_receiver_document_last4, p_signature_path, p_signature_sha256,
      p_photos, p_qty_declared, p_qty_received, btrim(p_notes), p_captured_at, v_pt, p_accuracy_m, v_inside, p_geofence_override_reason, v_actor, v_x.id, p_command_id, p_device_id)
    returning * into v_att;
    update public.operational_trips t set delivery_exception = true, last_location_at = greatest(coalesce(t.last_location_at, p_captured_at), p_captured_at), last_location_geog = v_pt where t.id = p_trip_id;
    v_ev := public.trip_event_append(p_trip_id, 'pod_attempt_refused', v_actor, 'driver', 'submit_proof_of_delivery', null, null, btrim(p_notes),
      jsonb_build_object('outcome', p_outcome, 'attempt_id', v_att.id, 'exception_id', v_x.id, 'photos', jsonb_array_length(p_photos), 'inside_geofence', v_inside),
      p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id, p_exception_id => v_x.id);
    update public.proof_of_delivery_attempts a set event_id = v_ev where a.id = v_att.id;
    update public.trip_exceptions x set event_id = v_ev where x.id = v_x.id;
    perform public.notify_trip(p_trip_id, 'delivery_refused', format('Viagem %s: entrega %s', v_t.trip_number, case when p_outcome = 'refused' then 'RECUSADA' else 'parcialmente recusada' end),
      'A entrega NAO foi concluida. A SteelGo definira o caminho (aceite, nova tentativa, retorno, transbordo ou disputa).', true, true, false, true, v_actor, 'high');
    select * into v_t from public.operational_trips t where t.id = p_trip_id;
    return query select true, false, null::text, p_outcome, v_t.status, null::uuid, v_att.id, false, false; return;
  end if;

  -- ENTREGA ACEITA
  select coalesce(max(c.seq), 0) + 1 into v_seq from public.trip_checkpoints c where c.trip_id = p_trip_id;
  insert into public.trip_checkpoints (trip_id, kind, seq, actor_id, actor_kind, captured_at, geog, accuracy_m, inside_geofence, distance_to_target_m,
    geofence_override_reason, photo_object_path, photo_sha256, photo_size_bytes, photo_mime, note, command_id, device_id)
  select p_trip_id, 'unloaded', v_seq, v_actor, 'driver', p_captured_at, v_pt, p_accuracy_m, v_inside, round(coalesce(v_dist, 0)), p_geofence_override_reason,
         p_photos -> 0 ->> 'path', p_photos -> 0 ->> 'sha256', m.size_bytes, m.mime, 'Descarga concluida (POD).', p_command_id, p_device_id
    from public.assert_trip_media(p_trip_id, p_command_id, 'photo', p_photos -> 0 ->> 'path', p_photos -> 0 ->> 'sha256', v_actor) m
  returning * into v_cp;
  insert into public.proof_of_delivery (trip_id, version, checkpoint_id, outcome, receiver_name, receiver_document_kind, receiver_document_last4,
    signature_object_path, signature_sha256, photos, quantity_declared, quantity_received, notes, delivered_at, geog, accuracy_m, inside_geofence,
    geofence_override_reason, submitted_by, submitted_by_kind, command_id, device_id)
  values (p_trip_id, 1, v_cp.id, p_outcome, btrim(p_receiver_name), p_receiver_document_kind, p_receiver_document_last4, p_signature_path, p_signature_sha256,
    p_photos, p_qty_declared, p_qty_received, nullif(btrim(p_notes), ''), p_captured_at, v_pt, p_accuracy_m, v_inside, p_geofence_override_reason, v_actor, 'driver', p_command_id, p_device_id)
  returning * into v_pod;
  update public.operational_trips t set status = 'delivered', previous_status = t.status, delivered_at = p_captured_at,
         last_location_at = greatest(coalesce(t.last_location_at, p_captured_at), p_captured_at), last_location_geog = v_pt where t.id = p_trip_id;
  v_ev := public.trip_event_append(p_trip_id, 'pod_submitted', v_actor, 'driver', 'submit_proof_of_delivery', 'unloading', 'delivered', coalesce(nullif(btrim(p_notes), ''), 'Prova de entrega registrada.'),
    jsonb_build_object('outcome', p_outcome, 'pod_id', v_pod.id, 'photos', jsonb_array_length(p_photos), 'inside_geofence', v_inside, 'receiver_label', left(btrim(p_receiver_name), 1) || '.'),
    p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id, p_pod_id => v_pod.id, p_checkpoint_id => v_cp.id);
  update public.proof_of_delivery p set event_id = v_ev where p.id = v_pod.id;
  update public.trip_checkpoints c set event_id = v_ev where c.id = v_cp.id;
  perform public.trip_end_tracking_sessions(p_trip_id, 'delivered');
  perform public.trip_release_capacity(p_trip_id);
  update public.operational_alerts al set status = 'closed', closed_at = now(), close_reason = 'delivered' where al.trip_id = p_trip_id and al.status <> 'closed' and al.kind <> 'pod_outside_geofence';
  perform public.freight_operational_transition(v_t.freight_id, 'delivered', v_actor, 'submit_proof_of_delivery', p_command_id);
  -- contrato: entrega concluida na mesma transacao (nao libera pagamento)
  select * into v_r from public.complete_contract_delivery_core(v_c.id, v_actor, 'driver', 'submit_proof_of_delivery', p_command_id,
    public.rpc_params_fingerprint(jsonb_build_object('contract_id', v_c.id, 'pod', v_pod.id)));
  perform public.notify_trip(p_trip_id, 'trip_delivered', format('Viagem %s entregue', v_t.trip_number),
    'Prova de entrega registrada pelo motorista. A conclusao financeira do contrato segue as regras de pagamento.', true, true, false, false, v_actor);
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select true, false, null::text, p_outcome, v_t.status, v_pod.id, null::uuid, true, coalesce(v_r.contract_completed, false);
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: resolve_delivery_exception (admin)
-- -----------------------------------------------------------------------------
create function public.resolve_delivery_exception(p_exception_id uuid, p_resolution public.delivery_exception_resolution, p_note text,
  p_new_delivery_lat numeric, p_new_delivery_lng numeric, p_request_id uuid)
returns table (trip_status public.trip_status, resolution public.delivery_exception_resolution, delivery_completed boolean, contract_completed boolean, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('resolve_delivery_exception'); v_x public.trip_exceptions%rowtype; v_t public.operational_trips%rowtype; v_c public.contracts%rowtype;
  v_fp text; v_log public.rpc_call_log%rowtype; v_att public.proof_of_delivery_attempts%rowtype; v_pod public.proof_of_delivery%rowtype; v_r record; v_new public.trip_status; v_ev uuid; v_completed boolean := false;
begin
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023', message = 'resolve_delivery_exception: nota (>= 20)';
  end if;
  if p_resolution = 'open_dispute' then
    raise exception using errcode = '22023', message = 'resolve_delivery_exception: disputa e aberta pelas partes via open_dispute_case(p_exception_id)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('exc', p_exception_id, 'res', p_resolution, 'note', p_note));
  v_log := public.rpc_idempotency_probe('resolve_delivery_exception', p_request_id, v_actor, p_exception_id, v_fp);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id;
  if not found then raise exception using errcode = 'P0002', message = 'resolve_delivery_exception: excecao inexistente'; end if;
  if v_log.id is not null then
    select * into v_t from public.operational_trips t where t.id = v_x.trip_id; select * into v_c from public.contracts c where c.id = v_t.contract_id;
    return query select v_t.status, p_resolution, v_c.delivery_completed_at is not null, v_c.status = 'completed', true; return;
  end if;
  select * into v_c from public.contracts c where c.id = (select t.contract_id from public.operational_trips t where t.id = v_x.trip_id) for update;
  v_t := public.trip_lock(v_x.trip_id);
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id for update;
  if v_x.kind not in ('cargo_refusal', 'delivery_mismatch') or v_x.status in ('resolved', 'converted_to_dispute') or not v_x.blocks_delivery then
    raise exception using errcode = '22023', message = 'resolve_delivery_exception: excecao nao e uma excecao de entrega aberta';
  end if;
  if not v_t.delivery_exception then
    raise exception using errcode = '22023', message = 'resolve_delivery_exception: viagem sem excecao de entrega pendente';
  end if;
  select * into v_att from public.proof_of_delivery_attempts a where a.exception_id = p_exception_id order by a.attempt_seq desc limit 1;

  if p_resolution = 'accept_delivery' then
    if v_c.status <> 'active' then
      raise exception using errcode = '22023', message = 'resolve_delivery_exception: contrato nao esta active';
    end if;
    insert into public.proof_of_delivery (trip_id, version, derived_from_attempt_id, outcome, receiver_name, receiver_document_kind, receiver_document_last4,
      signature_object_path, signature_sha256, photos, quantity_declared, quantity_received, notes, delivered_at, geog, accuracy_m, inside_geofence,
      geofence_override_reason, submitted_by, submitted_by_kind, request_id)
    values (v_t.id, coalesce((select max(version) from public.proof_of_delivery where trip_id = v_t.id), 0) + 1, v_att.id, 'accepted_with_notes',
      coalesce(v_att.receiver_name, 'Recebedor registrado por resolucao da SteelGo'), v_att.receiver_document_kind, v_att.receiver_document_last4,
      v_att.signature_object_path, v_att.signature_sha256, v_att.photos, v_att.quantity_declared, v_att.quantity_received,
      'Aceite por resolucao administrativa: ' || btrim(p_note), v_att.captured_at, v_att.geog, v_att.accuracy_m, v_att.inside_geofence,
      coalesce(v_att.geofence_override_reason, case when not v_att.inside_geofence then 'Aceite administrativo apos tentativa fora do geofence.' end),
      v_actor, 'admin', p_request_id)
    returning * into v_pod;
    update public.operational_trips t set status = 'delivered', previous_status = t.status, delivered_at = v_att.captured_at, delivery_exception = false where t.id = v_t.id;
    v_new := 'delivered';
    perform public.trip_end_tracking_sessions(v_t.id, 'delivered');
    perform public.trip_release_capacity(v_t.id);
    perform public.freight_operational_transition(v_t.freight_id, 'delivered', v_actor, 'resolve_delivery_exception', p_request_id);
    select * into v_r from public.complete_contract_delivery_core(v_c.id, v_actor, 'admin', 'resolve_delivery_exception', p_request_id, v_fp);
    v_completed := coalesce(v_r.contract_completed, false);
  elsif p_resolution in ('retry_delivery', 'transshipment') then
    if p_new_delivery_lat is not null and p_new_delivery_lng is not null then
      update public.trip_geofences g set is_current = false where g.trip_id = v_t.id and g.kind = 'delivery' and g.is_current;
      insert into public.trip_geofences (trip_id, kind, center_geog, radius_m, source, created_by)
      values (v_t.id, 'delivery', extensions.ST_SetSRID(extensions.ST_MakePoint(p_new_delivery_lng, p_new_delivery_lat), 4326)::extensions.geography,
              (public.trip_policy(v_t)).geofence_radius_m, 'resolution', v_actor);
      update public.operational_trips t set delivery_geog = extensions.ST_SetSRID(extensions.ST_MakePoint(p_new_delivery_lng, p_new_delivery_lat), 4326)::extensions.geography where t.id = v_t.id;
    end if;
    update public.operational_trips t set status = 'in_transit', previous_status = t.status, delivery_exception = false where t.id = v_t.id;
    v_new := 'in_transit';
  elsif p_resolution = 'return_to_origin' then
    update public.trip_geofences g set is_current = false where g.trip_id = v_t.id and g.kind = 'return' and g.is_current;
    insert into public.trip_geofences (trip_id, kind, center_geog, radius_m, source, created_by)
    select v_t.id, 'return', v_t.pickup_geog, (public.trip_policy(v_t)).geofence_radius_m, 'resolution', v_actor where v_t.pickup_geog is not null;
    update public.operational_trips t set status = 'returning', previous_status = t.status, delivery_exception = false where t.id = v_t.id;
    v_new := 'returning';
  end if;
  update public.trip_exceptions x set status = 'resolved', resolved_at = now(), resolved_by = v_actor, resolution_kind = p_resolution::text, resolution_note = btrim(p_note) where x.id = p_exception_id;
  v_ev := public.trip_event_append(v_t.id, 'delivery_exception_resolved', v_actor, 'admin', 'resolve_delivery_exception', v_t.status, v_new, btrim(p_note),
    jsonb_build_object('resolution', p_resolution, 'exception_id', p_exception_id, 'pod_id', v_pod.id, 'new_delivery_point', p_new_delivery_lat is not null),
    p_exception_id => p_exception_id, p_pod_id => v_pod.id, p_request_id => p_request_id, p_fingerprint => v_fp);
  if v_pod.id is not null then update public.proof_of_delivery p set event_id = v_ev where p.id = v_pod.id; end if;
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (v_t.id, v_actor, 'resolve_delivery_exception', jsonb_build_object('status', v_t.status, 'exception_id', p_exception_id),
          jsonb_build_object('status', v_new, 'resolution', p_resolution), p_note, p_request_id);
  perform public.trip_settle_legal_hold(v_t.id, v_actor, 'resolve_delivery_exception');
  perform public.notify_trip(v_t.id, 'delivery_exception_resolved', format('Viagem %s: excecao de entrega resolvida (%s)', v_t.trip_number, p_resolution), btrim(p_note), true, true, true, false, v_actor);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('resolve_delivery_exception', p_request_id, v_actor, p_exception_id, v_fp, 'accepted');
  select * into v_c from public.contracts c where c.id = v_c.id;
  return query select v_new, p_resolution, v_c.delivery_completed_at is not null, v_completed, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: supersede_proof_of_delivery (admin; preserva versao anterior integralmente)
-- -----------------------------------------------------------------------------
create function public.supersede_proof_of_delivery(p_trip_id uuid, p_reason text, p_receiver_name text, p_receiver_document_kind text,
  p_receiver_document_last4 text, p_signature_path text, p_signature_sha256 text, p_photos jsonb, p_qty_declared numeric, p_qty_received numeric,
  p_notes text, p_request_id uuid)
returns table (pod_id uuid, version integer, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('supersede_proof_of_delivery'); v_t public.operational_trips%rowtype; v_old public.proof_of_delivery%rowtype;
        v_new public.proof_of_delivery%rowtype; v_fp text; v_log public.rpc_call_log%rowtype; v_i integer; v_ev uuid;
begin
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception using errcode = '22023', message = 'supersede_proof_of_delivery: motivo (>= 20)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('trip', p_trip_id, 'reason', p_reason, 'photos', p_photos, 'sig', p_signature_sha256));
  v_log := public.rpc_idempotency_probe('supersede_proof_of_delivery', p_request_id, v_actor, p_trip_id, v_fp);
  if v_log.id is not null then
    select * into v_new from public.proof_of_delivery p where p.trip_id = p_trip_id and p.request_id = p_request_id; return query select v_new.id, v_new.version, true; return;
  end if;
  v_t := public.trip_lock(p_trip_id);
  select * into v_old from public.proof_of_delivery p where p.trip_id = p_trip_id and p.is_current for update;
  if not found then raise exception using errcode = '22023', message = 'supersede_proof_of_delivery: viagem sem POD corrente'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) < 1 then
    raise exception using errcode = '22023', message = 'supersede_proof_of_delivery: pelo menos uma foto';
  end if;
  for v_i in 0 .. jsonb_array_length(p_photos) - 1 loop
    perform public.assert_trip_media(p_trip_id, p_request_id, 'photo', p_photos -> v_i ->> 'path', p_photos -> v_i ->> 'sha256', v_actor);
  end loop;
  if p_signature_path is not null then
    perform public.assert_trip_media(p_trip_id, p_request_id, 'signature', p_signature_path, p_signature_sha256, v_actor, 256);
  end if;
  update public.proof_of_delivery p set is_current = false, superseded_at = now(), superseded_by = v_actor where p.id = v_old.id;
  insert into public.proof_of_delivery (trip_id, version, is_current, supersedes_id, supersede_reason, derived_from_attempt_id, checkpoint_id, outcome, receiver_name,
    receiver_document_kind, receiver_document_last4, signature_object_path, signature_sha256, photos, quantity_declared, quantity_received, notes,
    delivered_at, geog, accuracy_m, inside_geofence, geofence_override_reason, submitted_by, submitted_by_kind, request_id)
  values (p_trip_id, v_old.version + 1, true, v_old.id, btrim(p_reason), v_old.derived_from_attempt_id, v_old.checkpoint_id, v_old.outcome,
    coalesce(btrim(p_receiver_name), v_old.receiver_name), coalesce(p_receiver_document_kind, v_old.receiver_document_kind), coalesce(p_receiver_document_last4, v_old.receiver_document_last4),
    coalesce(p_signature_path, v_old.signature_object_path), coalesce(p_signature_sha256, v_old.signature_sha256), p_photos, coalesce(p_qty_declared, v_old.quantity_declared),
    coalesce(p_qty_received, v_old.quantity_received), coalesce(nullif(btrim(p_notes), ''), v_old.notes), v_old.delivered_at, v_old.geog, v_old.accuracy_m, v_old.inside_geofence,
    v_old.geofence_override_reason, v_actor, 'admin', p_request_id)
  returning * into v_new;
  v_ev := public.trip_event_append(p_trip_id, 'pod_superseded', v_actor, 'admin', 'supersede_proof_of_delivery', null, null, btrim(p_reason),
    jsonb_build_object('previous_pod_id', v_old.id, 'pod_id', v_new.id, 'version', v_new.version), p_pod_id => v_new.id, p_request_id => p_request_id, p_fingerprint => v_fp);
  update public.proof_of_delivery p set event_id = v_ev where p.id = v_new.id;
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (p_trip_id, v_actor, 'supersede_proof_of_delivery', jsonb_build_object('pod_id', v_old.id, 'version', v_old.version), jsonb_build_object('pod_id', v_new.id, 'version', v_new.version), p_reason, p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('supersede_proof_of_delivery', p_request_id, v_actor, p_trip_id, v_fp, 'accepted');
  return query select v_new.id, v_new.version, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: register_transshipment (motorista vinculado ou transportadora operator+)
-- -----------------------------------------------------------------------------
create function public.register_transshipment(p_trip_id uuid, p_exception_id uuid, p_new_truck_id uuid, p_new_driver_id uuid, p_command_id uuid,
  p_captured_at timestamptz, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_photo_path text, p_photo_sha256 text, p_seal_code text, p_note text, p_device_id uuid)
returns table (applied boolean, duplicate boolean, checkpoint_id uuid, assignment_id uuid, trip_status public.trip_status)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_role text; v_kind public.trip_actor_kind; v_t public.operational_trips%rowtype; v_x public.trip_exceptions%rowtype;
  v_m record; v_cp public.trip_checkpoints%rowtype; v_a public.trip_assignments%rowtype; v_seq integer; v_pt extensions.geography; v_ev uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'register_transshipment: sessao obrigatoria'; end if;
  if p_trip_id is null or p_exception_id is null or p_command_id is null or p_captured_at is null or p_photo_path is null or p_photo_sha256 is null then
    raise exception using errcode = '22004', message = 'register_transshipment: trip, excecao, comando, horario e foto sao obrigatorios';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023', message = 'register_transshipment: nota (>= 10)';
  end if;
  v_role := public.trip_role_of(p_trip_id);
  if v_role not in ('admin', 'carrier_owner', 'carrier_operator', 'driver') then
    raise exception using errcode = '42501', message = 'register_transshipment: papel sem permissao';
  end if;
  v_kind := public.trip_actor_kind_of(v_role);
  perform 1 from public.contracts c where c.id = (select t.contract_id from public.operational_trips t where t.id = p_trip_id) for update;
  v_t := public.trip_lock(p_trip_id);
  if exists (select 1 from public.trip_checkpoints c where c.trip_id = p_trip_id and c.command_id = p_command_id) then
    select * into v_cp from public.trip_checkpoints c where c.trip_id = p_trip_id and c.command_id = p_command_id;
    return query select false, true, v_cp.id, null::uuid, v_t.status; return;
  end if;
  if v_t.loaded_at is null or v_t.status not in ('in_transit', 'at_delivery', 'unloading', 'returning') then
    raise exception using errcode = '22023', message = 'register_transshipment: transbordo exige carga embarcada em transito';
  end if;
  select * into v_x from public.trip_exceptions x where x.id = p_exception_id and x.trip_id = p_trip_id and x.status not in ('resolved', 'converted_to_dispute');
  if not found then raise exception using errcode = '22023', message = 'register_transshipment: excecao aberta desta viagem e obrigatoria'; end if;
  if p_lat is null or p_lng is null or p_accuracy_m is null then
    raise exception using errcode = '22023', message = 'register_transshipment: localizacao obrigatoria';
  end if;
  select * into v_m from public.assert_trip_media(p_trip_id, p_command_id, 'photo', p_photo_path, p_photo_sha256, v_actor);
  v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  select coalesce(max(c.seq), 0) + 1 into v_seq from public.trip_checkpoints c where c.trip_id = p_trip_id;
  insert into public.trip_checkpoints (trip_id, kind, seq, actor_id, actor_kind, captured_at, geog, accuracy_m, photo_object_path, photo_sha256, photo_size_bytes, photo_mime,
    seal_code, seal_verified, note, command_id, device_id)
  values (p_trip_id, 'transshipment', v_seq, v_actor, v_kind, p_captured_at, v_pt, p_accuracy_m, p_photo_path, p_photo_sha256, v_m.size_bytes, v_m.mime,
    p_seal_code, case when p_seal_code is not null then true end, btrim(p_note), p_command_id, p_device_id) returning * into v_cp;
  if p_new_truck_id is not null or p_new_driver_id is not null then
    v_a := public.trip_assign_core(v_t, coalesce(p_new_driver_id, v_t.driver_id), coalesce(p_new_truck_id, v_t.truck_id), v_actor, v_kind, 'register_transshipment',
             p_command_id, 'transshipment', 'Transbordo: ' || btrim(p_note), true);
  end if;
  v_ev := public.trip_event_append(p_trip_id, 'transshipment_registered', v_actor, v_kind, 'register_transshipment', null, null, btrim(p_note),
    jsonb_build_object('checkpoint_id', v_cp.id, 'exception_id', p_exception_id, 'new_truck', p_new_truck_id is not null, 'new_driver', p_new_driver_id is not null, 'assignment_id', v_a.id),
    p_command_id, p_device_id, null, p_captured_at, p_lat, p_lng, p_accuracy_m, p_checkpoint_id => v_cp.id, p_exception_id => p_exception_id, p_assignment_id => v_a.id);
  update public.trip_checkpoints c set event_id = v_ev where c.id = v_cp.id;
  perform public.notify_trip(p_trip_id, 'trip_transshipment', format('Viagem %s: transbordo registrado', v_t.trip_number), btrim(p_note), true, true, false, true, v_actor);
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select true, false, v_cp.id, v_a.id, v_t.status;
end $fn$;

-- -----------------------------------------------------------------------------
-- RPC: submit_return_receipt (motorista; viagem returning -> returned)
-- -----------------------------------------------------------------------------
create function public.submit_return_receipt(p_trip_id uuid, p_command_id uuid, p_seq bigint, p_captured_at timestamptz, p_lat numeric, p_lng numeric,
  p_accuracy_m numeric, p_photo_path text, p_photo_sha256 text, p_receiver_name text, p_note text, p_device_id uuid, p_geofence_override_reason text default null)
returns table (applied boolean, duplicate boolean, rejection_code text, trip_status public.trip_status)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid()); v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_pol public.operational_policies%rowtype; v_rej text;
  v_pt extensions.geography; v_g public.trip_geofences%rowtype; v_dist numeric; v_inside boolean := true; v_m record; v_cp public.trip_checkpoints%rowtype; v_seq integer; v_x public.trip_exceptions%rowtype; v_d public.cargo_dispositions%rowtype; v_ev uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'submit_return_receipt: sessao obrigatoria'; end if;
  if p_trip_id is null or p_command_id is null or p_captured_at is null or p_photo_path is null or p_photo_sha256 is null then
    raise exception using errcode = '22004', message = 'submit_return_receipt: parametros obrigatorios ausentes';
  end if;
  perform 1 from public.contracts c where c.id = (select t.contract_id from public.operational_trips t where t.id = p_trip_id) for update;
  v_t := public.trip_lock(p_trip_id);
  v_a := public.trip_live_assignment_of_caller(p_trip_id);
  if v_a.id is null then raise exception using errcode = '42501', message = 'submit_return_receipt: chamador nao e o motorista vinculado'; end if;
  if exists (select 1 from public.trip_events e where e.trip_id = p_trip_id and e.command_id = p_command_id) then
    return query select false, true, null::text, v_t.status; return;
  end if;
  v_pol := public.trip_policy(v_t);
  if v_t.status <> 'returning' then v_rej := 'invalid_state:' || v_t.status::text;
  elsif v_a.state <> 'accepted' then v_rej := 'assignment_not_accepted';
  elsif v_t.paused_by_contract then v_rej := 'trip_paused_by_contract';
  elsif v_t.paused_by_exception_id is not null then v_rej := 'trip_paused_by_exception';
  elsif p_lat is null or p_lng is null or p_accuracy_m is null then v_rej := 'location_required';
  elsif p_accuracy_m > v_pol.accuracy_reject_m then v_rej := 'accuracy_rejected';
  elsif p_note is null or length(btrim(p_note)) < 10 then v_rej := 'note_required';
  end if;
  if v_rej is not null then
    perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'submit_return_receipt', null, null, v_rej, '{}'::jsonb,
      p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
    return query select false, false, v_rej, v_t.status; return;
  end if;
  v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  select * into v_g from public.trip_geofences g where g.trip_id = p_trip_id and g.is_current and g.kind = 'return';
  if v_g.id is not null then
    v_dist := extensions.ST_Distance(v_pt, v_g.center_geog); v_inside := v_dist <= v_g.radius_m + least(p_accuracy_m, v_pol.accuracy_primary_m);
    if not v_inside and (p_geofence_override_reason is null or length(btrim(p_geofence_override_reason)) < 20) then
      perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'submit_return_receipt', null, null, 'outside_geofence',
        jsonb_build_object('distance_m', round(v_dist)), p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
      return query select false, false, 'outside_geofence'::text, v_t.status; return;
    end if;
  end if;
  select * into v_m from public.assert_trip_media(p_trip_id, p_command_id, 'photo', p_photo_path, p_photo_sha256, v_actor);
  select coalesce(max(c.seq), 0) + 1 into v_seq from public.trip_checkpoints c where c.trip_id = p_trip_id;
  insert into public.trip_checkpoints (trip_id, kind, seq, actor_id, actor_kind, captured_at, geog, accuracy_m, inside_geofence, distance_to_target_m, geofence_override_reason,
    photo_object_path, photo_sha256, photo_size_bytes, photo_mime, note, command_id, device_id)
  values (p_trip_id, 'return_receipt', v_seq, v_actor, 'driver', p_captured_at, v_pt, p_accuracy_m, v_inside, round(coalesce(v_dist, 0)), p_geofence_override_reason,
    p_photo_path, p_photo_sha256, v_m.size_bytes, v_m.mime, format('Retorno recebido por %s. %s', coalesce(btrim(p_receiver_name), '-'), btrim(p_note)), p_command_id, p_device_id)
  returning * into v_cp;
  select * into v_x from public.trip_exceptions x where x.trip_id = p_trip_id and x.resolution_kind = 'return_to_origin' order by x.resolved_at desc limit 1;
  insert into public.cargo_dispositions (trip_id, exception_id, disposition, reason, note, occurred_at, geog, location_text, evidence, is_emergency, admin_id, request_id)
  values (p_trip_id, v_x.id, 'returned_to_origin', 'Retorno a origem concluido pelo motorista apos resolucao administrativa.', btrim(p_note) || ' (recibo de retorno)', p_captured_at, v_pt, null,
    jsonb_build_array(jsonb_build_object('path', p_photo_path, 'sha256', p_photo_sha256)), false, coalesce(v_x.resolved_by, v_actor), p_command_id)
  returning * into v_d;
  perform public.trip_end_tracking_sessions(p_trip_id, 'returned');
  perform public.trip_release_capacity(p_trip_id);
  update public.trip_assignments a set state = 'revoked', revoked_at = now(), revoke_reason = 'retorno concluido' where a.trip_id = p_trip_id and a.state in ('offered', 'accepted');
  update public.operational_alerts al set status = 'closed', closed_at = now(), close_reason = 'returned' where al.trip_id = p_trip_id and al.status <> 'closed';
  perform set_config('steelgo.trip_guard_context', 'cargo_disposition:' || p_trip_id::text, true);
  update public.operational_trips t set status = 'returned', previous_status = t.status, returned_at = p_captured_at, terminal_reason = 'cargo_disposition_resolved',
         cargo_disposition = 'returned_to_origin', cargo_disposition_at = p_captured_at,
         retention_until = now() + make_interval(days => v_pol.raw_retention_days), summary_retention_until = now() + make_interval(years => v_pol.summary_retention_years),
         last_location_at = greatest(coalesce(t.last_location_at, p_captured_at), p_captured_at), last_location_geog = v_pt
   where t.id = p_trip_id;
  perform set_config('steelgo.trip_guard_context', '', true);
  v_ev := public.trip_event_append(p_trip_id, 'cargo_disposition_resolved', v_actor, 'driver', 'submit_return_receipt', 'returning', 'returned', btrim(p_note),
    jsonb_build_object('checkpoint_id', v_cp.id, 'disposition', 'returned_to_origin', 'disposition_id', v_d.id), p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m,
    p_assignment_id => v_a.id, p_checkpoint_id => v_cp.id);
  update public.trip_checkpoints c set event_id = v_ev where c.id = v_cp.id;
  perform public.notify_trip(p_trip_id, 'trip_returned', format('Viagem %s: carga retornou a origem', v_t.trip_number), 'Recibo de retorno registrado. O contrato nao foi entregue; siga o fluxo contratual/disputa.', true, true, false, true, v_actor);
  return query select true, false, null::text, 'returned'::public.trip_status;
end $fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array['public.complete_contract_delivery_core(uuid, uuid, text, text, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array[
    'public.complete_contract_delivery(uuid, uuid)',
    'public.record_trip_checkpoint(uuid, public.trip_checkpoint_kind, uuid, bigint, timestamptz, numeric, numeric, numeric, text, text, text, text, uuid, text)',
    'public.add_trip_document(uuid, text, text, text, text, timestamptz, public.trip_visibility, text, uuid)',
    'public.submit_proof_of_delivery(uuid, uuid, bigint, timestamptz, numeric, numeric, numeric, public.pod_outcome, text, text, text, text, text, jsonb, numeric, numeric, text, uuid, text)',
    'public.resolve_delivery_exception(uuid, public.delivery_exception_resolution, text, numeric, numeric, uuid)',
    'public.supersede_proof_of_delivery(uuid, text, text, text, text, text, text, jsonb, numeric, numeric, text, uuid)',
    'public.register_transshipment(uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, text, text, text, uuid)',
    'public.submit_return_receipt(uuid, uuid, bigint, timestamptz, numeric, numeric, numeric, text, text, text, text, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
