-- =============================================================================
-- MODULO 3 - 82: politica v2 (amostragem), deduplicacao por captured_at e
--   ingest_trip_locations com downsampling no servidor.
--
--   Achado da homologacao nativa (18/09/2026): watchPosition entrega ~1 Hz e o
--   servidor aceitava tudo (387 pontos em ~7 min de viagem em primeiro plano);
--   o primeiro ponto foi gravado duas vezes (readOnce + fix em cache do watch com
--   o mesmo captured_at). A politica congelada v1 nao definia amostragem.
--
--   * operational_policies: 4 colunas NOVAS, NULAS na v1 (semantica da v1
--     preservada); CHECK condicional exige valores validos a partir da v2.
--   * politica v2 (append-only): min_interval 30 s, min_distance 50 m,
--     stationary_interval 120 s, flush_interval 30 s; demais valores = v1.
--     Viagens ja criadas continuam congeladas na v1 (sem amostragem no servidor).
--   * trip_locations: indice UNICO (trip_id, device_id, captured_at) com
--     auditoria previa de duplicatas (falha com mensagem clara).
--   * ingest_trip_locations (assinatura unica; retorno ganha `downsampled`):
--       - lote ordenado deterministicamente por (captured_at, seq);
--       - duplicata (seq_device OU captured_at ja gravados) contada em
--         `duplicates`, sem insercao e sem efeito;
--       - amostragem (so quando a politica congelada define intervalo):
--           primeiro ponto aceito do aparelho: sempre aceito;
--           dt < min_interval  -> downsampled (piso absoluto, ignora distancia);
--           dt >= min_interval -> aceito se dist >= min_distance
--                                 OU dt >= stationary_interval; senao downsampled;
--         referencia = ULTIMO PONTO ACEITO do mesmo trip/device (nao o ultimo
--         recebido); ponto fora de ordem compara com o aceito imediatamente
--         anterior a ele no tempo;
--       - downsampled: nao insere, nao incrementa points_received, nao gera
--         alerta/ETA; contado separadamente em `downsampled`.
--   Servidor continua a autoridade final; o cliente deve amostrar antes de enviar.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. politica: colunas de amostragem (nulas na v1) + CHECKs condicionais
-- -----------------------------------------------------------------------------
alter table public.operational_policies
  add column location_min_interval_s        integer,
  add column location_min_distance_m        integer,
  add column location_stationary_interval_s integer,
  add column location_flush_interval_s      integer;

comment on column public.operational_policies.location_min_interval_s is
  'Piso absoluto entre pontos aceitos do mesmo aparelho (s). Nulo somente na v1.';
comment on column public.operational_policies.location_min_distance_m is
  'Apos o piso, aceita se deslocou >= este valor (m) desde o ultimo ponto aceito.';
comment on column public.operational_policies.location_stationary_interval_s is
  'Apos o piso, aceita mesmo parado quando dt >= este valor (s).';
comment on column public.operational_policies.location_flush_interval_s is
  'Cadencia maxima de envio de lotes pelo cliente (s). Informativo para o app.';

-- todas as quatro nulas (v1) ou todas preenchidas (v2+)
alter table public.operational_policies add constraint operational_policies_sampling_all_or_none check (
  (location_min_interval_s is null) = (location_min_distance_m is null)
  and (location_min_interval_s is null) = (location_stationary_interval_s is null)
  and (location_min_interval_s is null) = (location_flush_interval_s is null));
-- a partir da v2 os valores sao obrigatorios e validos (CHECK com NULL passaria; por isso o is not null explicito)
alter table public.operational_policies add constraint operational_policies_sampling_v2_required check (
  version < 2 or (
    location_min_interval_s is not null and location_min_interval_s between 5 and 600
    and location_min_distance_m is not null and location_min_distance_m between 5 and 5000
    and location_stationary_interval_s is not null and location_stationary_interval_s between location_min_interval_s and 3600
    and location_flush_interval_s is not null and location_flush_interval_s between 5 and 600));

-- politica v2 (append-only; v1 intacta). created_by nulo como na v1 (semeada por migration).
insert into public.operational_policies (
  version, reason, geofence_radius_m, location_silence_min_transit, location_silence_min_stationary,
  long_stop_min, impossible_speed_kmh, clock_future_tolerance_min, accuracy_primary_m, accuracy_reject_m,
  raw_retention_days, legal_hold_tail_days, summary_retention_years, sos_ack_target_min,
  alert_ack_target_min, comm_loss_critical_min, eta_fallback_speed_kmh, eta_route_factor,
  location_batch_max_points, location_max_age_hours, moving_away_min_km, no_progress_min,
  location_min_interval_s, location_min_distance_m, location_stationary_interval_s, location_flush_interval_s)
select 2, 'Politica v2: amostragem de localizacao (30 s / 50 m / 120 s parado / lote 30 s) aprovada pela fundadora em 2026-09-19 apos homologacao nativa.',
       p.geofence_radius_m, p.location_silence_min_transit, p.location_silence_min_stationary,
       p.long_stop_min, p.impossible_speed_kmh, p.clock_future_tolerance_min, p.accuracy_primary_m, p.accuracy_reject_m,
       p.raw_retention_days, p.legal_hold_tail_days, p.summary_retention_years, p.sos_ack_target_min,
       p.alert_ack_target_min, p.comm_loss_critical_min, p.eta_fallback_speed_kmh, p.eta_route_factor,
       p.location_batch_max_points, p.location_max_age_hours, p.moving_away_min_km, p.no_progress_min,
       30, 50, 120, 30
  from public.operational_policies p where p.version = 1;

-- -----------------------------------------------------------------------------
-- 2. deduplicacao: um captured_at por aparelho e viagem
-- -----------------------------------------------------------------------------
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select 1 from public.trip_locations group by trip_id, device_id, captured_at having count(*) > 1) d;
  if v_n > 0 then
    raise exception using errcode = '23505',
      message = format('trip_locations: %s grupo(s) (trip_id, device_id, captured_at) duplicados; deduplique antes de criar trip_locations_device_capture_unique', v_n);
  end if;
end $$;
create unique index trip_locations_device_capture_unique on public.trip_locations (trip_id, device_id, captured_at);

-- -----------------------------------------------------------------------------
-- 3. ingest_trip_locations: retorno ganha `downsampled` (tipo muda => drop/create;
--    a assinatura de entrada e a mesma e continua unica)
-- p_points: [{seq, captured_at, lat, lng, accuracy_m, speed_mps?, heading?, altitude_m?, battery_pct?, is_moving?}]
-- -----------------------------------------------------------------------------
drop function public.ingest_trip_locations(uuid, uuid, uuid, jsonb);
create function public.ingest_trip_locations(p_trip_id uuid, p_device_id uuid, p_batch_id uuid, p_points jsonb)
returns table (accepted integer, stored_flagged integer, duplicates integer, downsampled integer, rejected jsonb,
               tracking_active boolean, trip_status public.trip_status)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_t public.operational_trips%rowtype; v_a public.trip_assignments%rowtype; v_s public.trip_tracking_sessions%rowtype;
  v_pol public.operational_policies%rowtype; v_now timestamptz := public.steelgo_now();
  v_p jsonb; v_seq bigint; v_cap timestamptz; v_lat numeric; v_lng numeric; v_acc numeric; v_geog extensions.geography;
  v_flags text[]; v_ok boolean; v_prev_geog extensions.geography; v_prev_at timestamptz; v_speed numeric;
  v_acc_n integer := 0; v_flag_n integer := 0; v_dup_n integer := 0; v_down_n integer := 0; v_rej jsonb := '[]'::jsonb; v_ins integer;
  v_best_geog extensions.geography; v_best_at timestamptz;
  -- amostragem: ultimo ponto ACEITO deste trip/device (referencia em memoria, em ordem)
  v_ref_geog extensions.geography; v_ref_at timestamptz;
  v_cmp_geog extensions.geography; v_cmp_at timestamptz; v_dt numeric; v_dist numeric;
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
  -- referencia de velocidade (viagem): ultimo aceito sem anomalia
  select l.geog, l.captured_at into v_prev_geog, v_prev_at from public.trip_locations l
   where l.trip_id = p_trip_id and l.accepted and not (l.flags && array['impossible_speed', 'jump'])
   order by l.captured_at desc limit 1;
  -- referencia de amostragem (aparelho): ultimo aceito deste device
  select l.geog, l.captured_at into v_ref_geog, v_ref_at from public.trip_locations l
   where l.trip_id = p_trip_id and l.device_id = p_device_id and l.accepted
   order by l.captured_at desc limit 1;

  -- ordem deterministica: tempo de captura, depois seq (captured_at malformado vai primeiro e cai em 'malformed')
  for v_p in select value from jsonb_array_elements(p_points)
             order by nullif(value ->> 'captured_at', '')::timestamptz nulls first, (value ->> 'seq')::bigint loop
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
    -- duplicata ANTES da amostragem: mesmo seq_device ou mesmo captured_at ja gravados (reenvio de lote)
    if exists (select 1 from public.trip_locations l
                where l.trip_id = p_trip_id and l.device_id = p_device_id and (l.seq_device = v_seq or l.captured_at = v_cap)) then
      v_dup_n := v_dup_n + 1; continue;
    end if;
    v_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography;
    -- amostragem (politica v2+; v1 nao define e aceita tudo)
    if v_pol.location_min_interval_s is not null then
      if v_ref_at is not null and v_cap > v_ref_at then
        v_cmp_geog := v_ref_geog; v_cmp_at := v_ref_at;
      elsif v_ref_at is not null then
        -- fora de ordem: compara com o aceito imediatamente anterior no tempo
        select l.geog, l.captured_at into v_cmp_geog, v_cmp_at from public.trip_locations l
         where l.trip_id = p_trip_id and l.device_id = p_device_id and l.accepted and l.captured_at < v_cap
         order by l.captured_at desc limit 1;
      else
        v_cmp_geog := null; v_cmp_at := null;
      end if;
      if v_cmp_at is not null then
        v_dt := extract(epoch from (v_cap - v_cmp_at));
        if v_dt < v_pol.location_min_interval_s then
          v_down_n := v_down_n + 1; continue; -- piso absoluto: distancia nao importa
        end if;
        v_dist := extensions.ST_Distance(v_geog, v_cmp_geog);
        if not (v_dist >= v_pol.location_min_distance_m or v_dt >= v_pol.location_stationary_interval_s) then
          v_down_n := v_down_n + 1; continue;
        end if;
      end if;
    end if;
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
    on conflict do nothing; -- PK (seq_device) ou captured_at: nunca duas linhas
    get diagnostics v_ins = row_count;
    if v_ins = 0 then v_dup_n := v_dup_n + 1; continue; end if;
    if not v_ok then
      v_flag_n := v_flag_n + 1;
    else
      v_acc_n := v_acc_n + 1;
      -- referencia de amostragem avanca com todo ponto ACEITO deste aparelho (em ordem)
      if v_ref_at is null or v_cap > v_ref_at then v_ref_geog := v_geog; v_ref_at := v_cap; end if;
      if not ('out_of_order' = any(v_flags)) and not ('low_accuracy' = any(v_flags)) then
        v_prev_geog := v_geog; v_prev_at := v_cap;
        if v_best_at is null or v_cap > v_best_at then v_best_geog := v_geog; v_best_at := v_cap; end if;
      end if;
    end if;
  end loop;

  -- somente linhas realmente inseridas incrementam sessao/resumo
  if v_acc_n + v_flag_n > 0 then
    update public.trip_tracking_sessions s set points_received = s.points_received + v_acc_n + v_flag_n,
           last_point_at = greatest(coalesce(s.last_point_at, v_now), v_now) where s.id = v_s.id;
  end if;
  if v_best_at is not null and (v_t.last_location_at is null or v_best_at > v_t.last_location_at) then
    update public.operational_trips t set last_location_at = v_best_at, last_location_geog = v_best_geog where t.id = p_trip_id;
  end if;
  if v_acc_n > 0 then perform public.trip_compute_eta(p_trip_id, 'ingest_trip_locations'); end if;
  if v_flag_n >= 3 then
    perform public.trip_alert_open(v_t, 'gps_anomaly', 'low', jsonb_build_object('flagged_in_batch', v_flag_n, 'message', 'Pontos com velocidade impossivel/salto no lote.'), 'ingest_trip_locations');
  end if;
  if v_acc_n + v_flag_n > 0 then perform public.trip_evaluate_alerts(p_trip_id, 'ingest_trip_locations'); end if;
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  return query select v_acc_n, v_flag_n, v_dup_n, v_down_n, v_rej, v_t.tracking_state = 'active', v_t.status;
end $fn$;
comment on function public.ingest_trip_locations(uuid, uuid, uuid, jsonb) is
  'Lote de posicoes do motorista vinculado. Ordem (captured_at, seq); duplicates = seq/captured_at ja gravados; '
  'downsampled = descartados pela amostragem da politica congelada (v2+: piso min_interval, depois min_distance OU stationary_interval); '
  'rejected = malformed/accuracy_rejected/too_old. Downsampled/duplicates nao alteram sessao, resumo, ETA ou alertas.';

revoke all on function public.ingest_trip_locations(uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ingest_trip_locations(uuid, uuid, uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- AUDITORIA FAIL-CLOSED (desta migration)
-- -----------------------------------------------------------------------------
do $$
declare v_p public.operational_policies%rowtype; v_src text; v_n integer; v_acl text;
begin
  -- politica: v1 intacta (valores aprovados em 2026-09-16) e sem amostragem
  select * into v_p from public.operational_policies where version = 1;
  if v_p.id is null or v_p.location_min_interval_s is not null or v_p.accuracy_reject_m <> 500 or v_p.accuracy_primary_m <> 100
     or v_p.location_batch_max_points <> 200 or v_p.impossible_speed_kmh <> 150 or v_p.geofence_radius_m <> 300 then
    raise exception 'POLITICA: v1 alterada ou ausente';
  end if;
  -- politica: v2 corrente com os valores aprovados
  select * into v_p from public.operational_policies where version = 2;
  if v_p.id is null or v_p.location_min_interval_s <> 30 or v_p.location_min_distance_m <> 50
     or v_p.location_stationary_interval_s <> 120 or v_p.location_flush_interval_s <> 30 then
    raise exception 'POLITICA: v2 ausente ou com valores diferentes de 30/50/120/30';
  end if;
  if (public.current_operational_policy()).version <> 2 then raise exception 'POLITICA: current_operational_policy() <> 2'; end if;
  if (select count(*) from public.operational_policies) <> 2 then raise exception 'POLITICA: esperadas exatamente 2 versoes'; end if;
  -- CHECKs presentes
  foreach v_acl in array array['operational_policies_sampling_all_or_none', 'operational_policies_sampling_v2_required'] loop
    if not exists (select 1 from pg_constraint where conname = v_acl and contype = 'c') then raise exception 'POLITICA: CHECK % ausente', v_acl; end if;
  end loop;
  -- indice unico de deduplicacao
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'trip_locations'
                  and indexname = 'trip_locations_device_capture_unique' and indexdef ~ 'UNIQUE' and indexdef ~ 'captured_at') then
    raise exception 'DEDUP: indice trip_locations_device_capture_unique ausente';
  end if;
  -- ingest: assinatura unica, security definer, search_path vazio, retorno com downsampled, le a politica, sem limite fixo
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ingest_trip_locations';
  if v_n <> 1 then raise exception 'RPC: ingest_trip_locations deve ter exatamente 1 assinatura (tem %)', v_n; end if;
  select p.prosrc into v_src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ingest_trip_locations';
  if v_src !~ 'trip_policy\(' then raise exception 'POLITICA: ingest_trip_locations nao le a politica versionada'; end if;
  if v_src ~ 'interval ''(20|45|120) min' then raise exception 'POLITICA: ingest_trip_locations contem limite fixo'; end if;
  if v_src !~ 'v_down_n' or v_src !~ 'location_min_interval_s' then raise exception 'RPC: ingest_trip_locations sem downsampling'; end if;
  if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ingest_trip_locations'
                  and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c in ('search_path=""', 'search_path='))) then
    raise exception 'RPC: ingest_trip_locations deve ser SECURITY DEFINER com search_path vazio';
  end if;
  if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ingest_trip_locations'
                  and 'downsampled' = any(p.proargnames)) then
    raise exception 'RPC: retorno de ingest_trip_locations sem coluna downsampled';
  end if;
  -- ACL: nada para PUBLIC/anon; authenticated e service_role podem executar; sem ACL herdada por default privileges
  if has_function_privilege('anon', 'public.ingest_trip_locations(uuid, uuid, uuid, jsonb)', 'execute') then raise exception 'ACL: anon executa ingest_trip_locations'; end if;
  if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
              where p.pronamespace = 'public'::regnamespace and p.proname = 'ingest_trip_locations' and a::text like '=X/%') then
    raise exception 'ACL: ingest_trip_locations concedida a PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.ingest_trip_locations(uuid, uuid, uuid, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.ingest_trip_locations(uuid, uuid, uuid, jsonb)', 'execute') then
    raise exception 'ACL: authenticated/service_role sem execute em ingest_trip_locations';
  end if;
  -- ACL efetiva == exatamente {owner, authenticated, service_role}: nada herdado dos default privileges do
  -- Supabase (que concedem EXECUTE a anon/authenticated/service_role em toda funcao nova; por isso o REVOKE explicito acima)
  if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
              where p.pronamespace = 'public'::regnamespace and p.proname = 'ingest_trip_locations'
                and split_part(a::text, '=', 1) not in ('authenticated', 'service_role', pg_get_userbyid(p.proowner))) then
    raise exception 'ACL: ingest_trip_locations com grantee inesperado (herdado de default privileges?)';
  end if;
  -- nada financeiro
  if v_src ~ 'payment_intents|payment_transactions|payment_events|payment_allocations|payment_recoveries|external_reconciliation|dispute_decisions|confirm_escrow|request_escrow' then
    raise exception 'FINANCEIRO: ingest_trip_locations referencia tabela/RPC financeira';
  end if;
end $$;

commit;
