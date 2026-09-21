-- =============================================================================
-- MODULO 3 - 83: start_trip_tracking - inicio ATOMICO do deslocamento
--
--   Achado da homologacao nativa (18/09/2026): o cliente encadeava tres RPCs
--   (start_tracking_session -> transition_trip -> ingest_trip_locations). Uma falha
--   apos a primeira deixava viagem driver_accepted com tracking_state='active' e
--   sessao aberta orfa, sem nenhum encerramento automatico.
--
--   Esta RPC faz, em UMA transacao: autentica o motorista, trava a viagem (ordem
--   oficial: contracts -> operational_trips -> trip_assignments -> trip_exceptions;
--   aqui so operational_trips FOR UPDATE, como as demais RPCs do motorista), exige
--   designacao accepted, aviso vigente reconhecido, status driver_accepted e
--   primeiro ponto valido; idempotencia por command_id; cria OU reutiliza sessao
--   COMPATIVEL (trip, device, motorista, provider, platform; ended_at nulo);
--   tracking_state='active'; transicao driver_accepted -> en_route_to_pickup;
--   insere o primeiro ponto; atualiza sessao e last_location somente se a linha
--   foi inserida (ROW_COUNT = 1). Qualquer excecao reverte tudo (sessao,
--   tracking_state, eventos, ponto). Nenhuma notificacao (paridade com
--   transition_trip para en_route_to_pickup). ETA NAO e calculada aqui: fica para
--   o primeiro lote de ingest_trip_locations (<= location_flush_interval_s) ou
--   para o scheduler - evita efeito derivado no caminho critico do inicio.
--
--   Dois grupos de resultado:
--   * EXCECOES DURAS (nada e gravado): 42501 nao autenticado / nao e o motorista
--     vinculado; 22004 parametros obrigatorios ausentes; 22023 parametros
--     invalidos (platform/provider/lat/lng/precisao negativa, captured_at no
--     futuro ou alem de location_max_age_hours), privacy_notice_unpublished,
--     privacy_notice_required, session_context_mismatch (sessao aberta do
--     aparelho com motorista/provider/platform diferentes); P0002 viagem inexistente.
--   * REJEICOES DE NEGOCIO (evento command_rejected COM command_id; applied=false):
--     assignment_not_accepted, invalid_state:<status>, trip_paused_by_contract,
--     trip_paused_by_exception, critical_exception_open, accuracy_rejected.
--     Sao gravadas ANTES de qualquer sessao: nunca ha sessao nova orfa.
--   * IDEMPOTENCIA: command_id ja presente em trip_events (aplicado OU rejeitado)
--     -> duplicate=true, sem escrita. Para tentar de novo apos uma rejeicao o
--     cliente DEVE gerar um novo command_id (contrato documentado no comentario).
--
--   O primeiro ponto NAO passa pela amostragem (e o primeiro aceito por definicao),
--   mas passa por validade, relogio e precisao maxima. Conflito inesperado do
--   ponto (mesmo captured_at/seq ja gravados para o aparelho) => point_accepted=false,
--   point_flags={'duplicate'}, sem incrementar sessao/resumo (nunca finge aceite).
-- =============================================================================
begin;

create function public.start_trip_tracking(
  p_trip_id uuid, p_command_id uuid, p_device_id uuid,
  p_platform text, p_provider public.tracking_provider, p_app_version text,
  p_seq bigint, p_captured_at timestamptz, p_lat numeric, p_lng numeric, p_accuracy_m numeric,
  p_speed_mps numeric default null, p_heading numeric default null, p_altitude_m numeric default null)
returns table (applied boolean, duplicate boolean, rejection_code text, trip_status public.trip_status,
               session_id uuid, session_was_existing boolean, point_accepted boolean, point_flags text[], policy jsonb)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_pol public.operational_policies%rowtype;
  v_d public.drivers%rowtype; v_n public.privacy_notices%rowtype; v_s public.trip_tracking_sessions%rowtype;
  v_now timestamptz := public.steelgo_now();
  v_alert text; v_was_existing boolean := false; v_geog extensions.geography; v_flags text[] := '{}';
  v_ins integer := 0; v_pol_json jsonb;
begin
  -- ---------------------------------------------------------------- excecoes duras
  if v_actor is null then raise exception using errcode = '42501', message = 'start_trip_tracking: sessao obrigatoria'; end if;
  if p_trip_id is null or p_command_id is null or p_device_id is null or p_seq is null or p_captured_at is null
     or p_lat is null or p_lng is null or p_accuracy_m is null then
    raise exception using errcode = '22004', message = 'start_trip_tracking: parametros obrigatorios ausentes (trip, command, device, seq, captured_at, lat, lng, accuracy_m)';
  end if;
  if p_platform is null or p_platform not in ('web', 'android', 'ios') or p_provider is null then
    raise exception using errcode = '22023', message = 'start_trip_tracking: platform/provider invalidos';
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy_m < 0 then
    raise exception using errcode = '22023', message = 'start_trip_tracking: lat/lng/precisao invalidos';
  end if;

  v_t := public.trip_lock(p_trip_id);                       -- FOR UPDATE (ordem oficial)
  v_a := public.trip_live_assignment_of_caller(p_trip_id);  -- designacao viva do chamador
  if v_a.id is null then
    raise exception using errcode = '42501', message = 'start_trip_tracking: chamador nao e o motorista vinculado desta viagem';
  end if;

  -- idempotencia: comando ja visto (aplicado ou rejeitado) => duplicate, sem escrita
  if exists (select 1 from public.trip_events e where e.trip_id = p_trip_id and e.command_id = p_command_id) then
    select * into v_s from public.trip_tracking_sessions s
     where s.trip_id = p_trip_id and s.device_id = p_device_id and s.ended_at is null;
    return query select false, true, null::text, v_t.status, v_s.id, (v_s.id is not null), false, '{}'::text[], null::jsonb;
    return;
  end if;

  v_pol := public.trip_policy(v_t);
  v_pol_json := to_jsonb(v_pol) - 'id' - 'created_by' - 'request_id' - 'reason';
  if p_captured_at > v_now + make_interval(mins => v_pol.clock_future_tolerance_min) then
    raise exception using errcode = '22023', message = 'start_trip_tracking: captured_at no futuro (relogio do aparelho)';
  end if;
  if p_captured_at < v_now - make_interval(hours => v_pol.location_max_age_hours) then
    raise exception using errcode = '22023', message = 'start_trip_tracking: captured_at alem de location_max_age_hours (too_old)';
  end if;

  v_n := public.current_privacy_notice();
  if v_n.id is null then
    raise exception using errcode = '22023', message = 'start_trip_tracking: privacy_notice_unpublished';
  end if;
  select * into v_d from public.drivers d where d.id = v_a.driver_id;
  if v_d.privacy_notice_version is distinct from v_n.version or v_d.privacy_notice_sha256 is distinct from v_n.body_sha256 then
    raise exception using errcode = '22023', message = 'start_trip_tracking: privacy_notice_required';
  end if;

  -- sessao aberta deste aparelho: reutilizar SOMENTE se compativel; incompativel => excecao dura, sem mutacao
  select * into v_s from public.trip_tracking_sessions s
   where s.trip_id = p_trip_id and s.device_id = p_device_id and s.ended_at is null;
  if v_s.id is not null then
    if v_s.driver_id <> v_a.driver_id or v_s.provider <> p_provider or v_s.platform <> p_platform then
      raise exception using errcode = '22023',
        message = format('start_trip_tracking: session_context_mismatch (sessao aberta %s: driver/provider/platform diferentes)', v_s.id);
    end if;
    v_was_existing := true;
  end if;

  -- ------------------------------------------------- rejeicoes de negocio (registradas)
  if v_a.state <> 'accepted' then
    v_alert := 'assignment_not_accepted';
  elsif v_t.status <> 'driver_accepted' then
    v_alert := 'invalid_state:' || v_t.status::text;
  elsif v_t.paused_by_contract then
    v_alert := 'trip_paused_by_contract';
  elsif v_t.paused_by_exception_id is not null then
    v_alert := 'trip_paused_by_exception';
  elsif v_t.has_open_critical_exception then
    v_alert := 'critical_exception_open';
  elsif p_accuracy_m > v_pol.accuracy_reject_m then
    v_alert := 'accuracy_rejected';
  end if;
  if v_alert is not null then
    perform public.trip_event_append(p_trip_id, 'command_rejected', v_actor, 'driver', 'start_trip_tracking', null, null,
      v_alert, jsonb_build_object('requested_to', 'en_route_to_pickup', 'from', v_t.status, 'retry_requires_new_command_id', true),
      p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);
    return query select false, false, v_alert, v_t.status, v_s.id, v_was_existing, false, '{}'::text[], v_pol_json;
    return;
  end if;

  -- ---------------------------------------------------------------- mutacoes (tudo ou nada)
  if not v_was_existing then
    insert into public.trip_tracking_sessions (
      trip_id, assignment_id, driver_id, device_id, platform, provider, app_version,
      privacy_notice_version, privacy_notice_sha256, privacy_notice_acknowledged_at)
    values (p_trip_id, v_a.id, v_a.driver_id, p_device_id, p_platform, p_provider, p_app_version,
            v_n.version, v_n.body_sha256, v_d.privacy_notice_acknowledged_at)
    returning * into v_s;
    perform public.trip_event_append(p_trip_id, 'tracking_started', v_actor, 'driver', 'start_trip_tracking', null, null,
      format('Rastreamento iniciado (%s, %s).', p_platform, p_provider),
      jsonb_build_object('session_id', v_s.id, 'provider', p_provider, 'platform', p_platform, 'app_version', p_app_version),
      p_device_id => p_device_id, p_assignment_id => v_a.id);
  end if;
  update public.operational_trips t set tracking_state = 'active' where t.id = p_trip_id and t.tracking_state <> 'active';

  v_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  perform public.trip_event_append(p_trip_id, 'transition', v_actor, 'driver', 'start_trip_tracking', 'driver_accepted', 'en_route_to_pickup',
    '', jsonb_build_object('session_id', v_s.id, 'session_was_existing', v_was_existing, 'atomic_start', true),
    p_command_id, p_device_id, p_seq, p_captured_at, p_lat, p_lng, p_accuracy_m, p_assignment_id => v_a.id);

  -- primeiro ponto: sem amostragem; flags de precisao como no ingest; sem ponto anterior => sem velocidade
  if p_accuracy_m > v_pol.accuracy_primary_m then v_flags := array_append(v_flags, 'low_accuracy'); end if;
  insert into public.trip_locations (trip_id, device_id, seq_device, session_id, batch_id, captured_at, received_at, geog, accuracy_m,
    speed_mps, heading, altitude_m, flags, accepted)
  values (p_trip_id, p_device_id, p_seq, v_s.id, p_command_id, p_captured_at, v_now, v_geog, p_accuracy_m,
    p_speed_mps, p_heading, p_altitude_m, v_flags, true)
  on conflict do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 1 then
    update public.trip_tracking_sessions s set points_received = s.points_received + 1,
           last_point_at = greatest(coalesce(s.last_point_at, v_now), v_now) where s.id = v_s.id;
    update public.operational_trips t
       set last_location_at = greatest(coalesce(t.last_location_at, p_captured_at), p_captured_at), last_location_geog = v_geog
     where t.id = p_trip_id;
  else
    v_flags := array['duplicate']::text[]; -- ponto ja existia para este aparelho: nao finge aceite
  end if;

  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select true, false, null::text, v_t.status, v_s.id, v_was_existing, (v_ins = 1), v_flags, v_pol_json;
end $fn$;

comment on function public.start_trip_tracking(uuid, uuid, uuid, text, public.tracking_provider, text, bigint, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric) is
  'Inicio atomico do deslocamento (motorista): sessao (nova ou compativel) + tracking_state=active + transicao driver_accepted->en_route_to_pickup + primeiro ponto, em uma transacao. '
  'Idempotente por p_command_id (aplicado OU rejeitado => duplicate=true). Rejeicoes de negocio gravam command_rejected com o command_id: '
  'para tentar novamente apos corrigir a causa o cliente DEVE usar um novo command_id. Excecoes duras (42501/22004/22023/P0002) nao gravam nada. '
  'Sessao aberta incompativel (driver/provider/platform) => 22023 session_context_mismatch sem mutacao. Sem notificacoes; ETA fica para o ingest.';

revoke all on function public.start_trip_tracking(uuid, uuid, uuid, text, public.tracking_provider, text, bigint, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.start_trip_tracking(uuid, uuid, uuid, text, public.tracking_provider, text, bigint, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- AUDITORIA FAIL-CLOSED (desta migration)
-- -----------------------------------------------------------------------------
do $$
declare v_src text; v_n integer;
        v_sig text := 'public.start_trip_tracking(uuid, uuid, uuid, text, public.tracking_provider, text, bigint, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric)';
begin
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'start_trip_tracking';
  if v_n <> 1 then raise exception 'RPC: start_trip_tracking deve ter exatamente 1 assinatura (tem %)', v_n; end if;
  if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'start_trip_tracking'
                  and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c in ('search_path=""', 'search_path='))) then
    raise exception 'RPC: start_trip_tracking deve ser SECURITY DEFINER com search_path vazio';
  end if;
  select p.prosrc into v_src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'start_trip_tracking';
  -- contrato: trava, politica, aviso, idempotencia, compatibilidade de sessao, ROW_COUNT, sem notificacao, sem ingest completo, sem ETA
  if v_src !~ 'trip_lock\(' then raise exception 'RPC: start_trip_tracking nao trava a viagem'; end if;
  if v_src !~ 'trip_policy\(' then raise exception 'POLITICA: start_trip_tracking nao le a politica versionada'; end if;
  if v_src ~ 'interval ''(20|45|120) min' then raise exception 'POLITICA: start_trip_tracking contem limite fixo'; end if;
  if v_src !~ 'current_privacy_notice\(' or v_src !~ 'privacy_notice_required' then raise exception 'PRIVACIDADE: start_trip_tracking nao exige o aviso vigente'; end if;
  if v_src !~ 'session_context_mismatch' then raise exception 'RPC: start_trip_tracking sem verificacao de compatibilidade de sessao'; end if;
  if v_src !~ 'get diagnostics v_ins = row_count' then raise exception 'RPC: start_trip_tracking sem ROW_COUNT do primeiro ponto'; end if;
  if v_src ~ 'notify_trip\(|notify_user\(|push_enqueue\(' then raise exception 'RPC: start_trip_tracking nao pode notificar'; end if;
  if v_src ~ 'ingest_trip_locations\(|start_tracking_session\(|transition_trip\(|trip_compute_eta\(|trip_evaluate_alerts\(' then
    raise exception 'RPC: start_trip_tracking nao pode encadear RPCs publicas nem efeitos derivados';
  end if;
  if v_src ~ 'payment_intents|payment_transactions|payment_events|payment_allocations|payment_recoveries|external_reconciliation|dispute_decisions|confirm_escrow|request_escrow' then
    raise exception 'FINANCEIRO: start_trip_tracking referencia tabela/RPC financeira';
  end if;
  -- ACL
  if has_function_privilege('anon', v_sig, 'execute') then raise exception 'ACL: anon executa start_trip_tracking'; end if;
  if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
              where p.pronamespace = 'public'::regnamespace and p.proname = 'start_trip_tracking' and a::text like '=X/%') then
    raise exception 'ACL: start_trip_tracking concedida a PUBLIC';
  end if;
  if not has_function_privilege('authenticated', v_sig, 'execute') or not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'ACL: authenticated/service_role sem execute em start_trip_tracking';
  end if;
  -- ACL efetiva == exatamente {owner, authenticated, service_role}: nada herdado dos default privileges do
  -- Supabase (que concedem EXECUTE a anon/authenticated/service_role em toda funcao nova; por isso o REVOKE explicito acima)
  if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
              where p.pronamespace = 'public'::regnamespace and p.proname = 'start_trip_tracking'
                and split_part(a::text, '=', 1) not in ('authenticated', 'service_role', pg_get_userbyid(p.proowner))) then
    raise exception 'ACL: start_trip_tracking com grantee inesperado (herdado de default privileges?)';
  end if;
  -- helpers internos continuam sem grants
  foreach v_sig in array array['public.trip_lock(uuid)', 'public.trip_live_assignment_of_caller(uuid)', 'public.current_privacy_notice()',
                               'public.trip_end_tracking_sessions(uuid, text)'] loop
    if has_function_privilege('authenticated', v_sig, 'execute') or has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'ACL: helper % exposto', v_sig;
    end if;
  end loop;
  -- dependencias de schema desta RPC
  if not exists (select 1 from pg_indexes where indexname = 'trip_locations_device_capture_unique') then raise exception 'SCHEMA: indice de dedup ausente (migration 82)'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'trip_tracking_sessions_one_open_per_device') then raise exception 'SCHEMA: indice de sessao unica por aparelho ausente'; end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_events_command_unique') then raise exception 'SCHEMA: unique (trip_id, command_id) ausente'; end if;
end $$;

commit;
