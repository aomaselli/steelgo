-- =============================================================================
-- MODULO 3 - 81/81: delegacao operacional (alternativa B) e auditoria final
--   * company_members: convite por token (hash), aceite pelo proprio usuario,
--     mudanca de papel, revogacao (revoga tambem dispositivos push), listagem
--     sanitizada; trilha append-only company_member_events;
--   * auditoria: ACL de tabelas/funcoes/triggers/storage, isolamento M1/M2 dos
--     helpers de delegacao, RPCs M3 sem acesso a payment_*/dispute_decisions,
--     limites vindos de politica, cron jobs (push inativo), flags desligados,
--     consistencia de dados SEM exigir tabelas vazias.
-- =============================================================================
begin;

-- company_members: anon nao le a tabela (a listagem sanitizada e list_company_members)
revoke select on public.company_members from anon;

create table public.company_member_events (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.company_members(id) on delete restrict,
  company_id  uuid not null references public.companies(id) on delete restrict,
  event_type  text not null check (event_type in ('invited', 'accepted', 'role_changed', 'revoked', 'invite_expired')),
  actor_id    uuid references auth.users(id),
  before_role text,
  after_role  text,
  reason      text,
  request_id  uuid,
  created_at  timestamptz not null default now()
);
alter table public.company_member_events enable row level security;
revoke all on public.company_member_events from public, anon, authenticated, service_role;
grant select on public.company_member_events to service_role;
create function public.company_member_events_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'company_member_events e append-only';
end $fn$;
create trigger company_member_events_no_update before update or delete on public.company_member_events
  for each row execute function public.company_member_events_block_mutation();

create function public.company_member_event_append(p_member_id uuid, p_company_id uuid, p_type text, p_actor uuid, p_before text, p_after text, p_reason text, p_request_id uuid)
returns void language sql security definer set search_path = '' as $fn$
  insert into public.company_member_events (member_id, company_id, event_type, actor_id, before_role, after_role, reason, request_id)
  values (p_member_id, p_company_id, p_type, p_actor, p_before, p_after, p_reason, p_request_id);
$fn$;

create function public.invite_company_member(p_company_id uuid, p_email text, p_role text, p_expires_in_hours integer, p_request_id uuid)
returns table (member_id uuid, invite_token text, expires_at timestamptz, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_fp text; v_log public.rpc_call_log%rowtype; v_tok text; v_m public.company_members%rowtype; v_uid uuid; v_email text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'invite_company_member: sessao obrigatoria'; end if;
  if p_role not in ('operator', 'viewer') then raise exception using errcode = '22023', message = 'invite_company_member: papel deve ser operator ou viewer'; end if;
  v_email := lower(btrim(p_email));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception using errcode = '22023', message = 'invite_company_member: e-mail invalido'; end if;
  if not public.is_current_user_company_owner(p_company_id) and not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'invite_company_member: somente o proprietario da empresa (ou administrador)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('c', p_company_id, 'e', v_email, 'r', p_role));
  v_log := public.rpc_idempotency_probe('invite_company_member', p_request_id, v_actor, p_company_id, v_fp);
  if v_log.id is not null then
    select * into v_m from public.company_members m where m.company_id = p_company_id and m.invited_email = v_email and m.status <> 'revoked' order by m.invited_at desc limit 1;
    return query select v_m.id, null::text, v_m.invite_expires_at, true; return;
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = v_email;
  if v_uid is not null and exists (select 1 from public.companies c where c.id = p_company_id and c.owner_id = v_uid) then
    raise exception using errcode = '22023', message = 'invite_company_member: o proprietario ja tem todos os poderes';
  end if;
  if exists (select 1 from public.company_members m where m.company_id = p_company_id and m.status <> 'revoked'
              and ((v_uid is not null and m.user_id = v_uid) or m.invited_email = v_email)) then
    raise exception using errcode = '23505', message = 'invite_company_member: ja existe convite/membro ativo para este e-mail';
  end if;
  v_tok := encode(extensions.gen_random_bytes(24), 'hex');
  -- reconvite de membro REVOGADO: unique (company_id, user_id) impede segunda linha;
  -- a linha revogada e reaproveitada (a trilha company_member_events guarda o historico)
  select * into v_m from public.company_members m
   where m.company_id = p_company_id and m.status = 'revoked'
     and ((v_uid is not null and m.user_id = v_uid) or m.invited_email = v_email)
   order by m.revoked_at desc limit 1;
  if v_m.id is not null then
    update public.company_members m
       set member_role = p_role, status = 'invited', invited_email = v_email,
           invite_token_hash = encode(extensions.digest(v_tok, 'sha256'), 'hex'),
           invite_expires_at = now() + make_interval(hours => least(greatest(coalesce(p_expires_in_hours, 72), 1), 720)),
           invited_by = v_actor, invited_at = now(), accepted_at = null,
           revoked_at = null, revoked_by = null, revoke_reason = null, updated_at = now()
     where m.id = v_m.id
    returning * into v_m;
  else
    insert into public.company_members (company_id, user_id, member_role, status, invited_email, invite_token_hash, invite_expires_at, invited_by, invited_at)
    values (p_company_id, null, p_role, 'invited', v_email, encode(extensions.digest(v_tok, 'sha256'), 'hex'),
            now() + make_interval(hours => least(greatest(coalesce(p_expires_in_hours, 72), 1), 720)), v_actor, now())
    returning * into v_m;
  end if;
  perform public.company_member_event_append(v_m.id, p_company_id, 'invited', v_actor, null, p_role, null, p_request_id);
  if v_uid is not null then
    perform public.notify_user(v_uid, 'company_member_invited', 'Convite para operar uma empresa na SteelGo',
      format('Voce foi convidado como %s. Abra o app e aceite o convite.', p_role), '/dashboard', null, null);
  end if;
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('invite_company_member', p_request_id, v_actor, p_company_id, v_fp, 'accepted');
  return query select v_m.id, v_tok, v_m.invite_expires_at, false;
end $fn$;

create function public.accept_company_member_invitation(p_token text)
returns table (member_id uuid, company_id uuid, member_role text)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_m public.company_members%rowtype; v_email text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'accept_company_member_invitation: sessao obrigatoria'; end if;
  if p_token is null or length(p_token) < 32 then raise exception using errcode = '22023', message = 'accept_company_member_invitation: token invalido'; end if;
  select * into v_m from public.company_members m where m.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_m.status <> 'invited' then raise exception using errcode = '22023', message = 'accept_company_member_invitation: convite inexistente ou ja utilizado'; end if;
  if v_m.invite_expires_at < now() then
    perform public.company_member_event_append(v_m.id, v_m.company_id, 'invite_expired', v_actor, null, null, 'expirado no aceite', null);
    raise exception using errcode = '22023', message = 'accept_company_member_invitation: convite expirado';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_actor;
  if v_email is distinct from v_m.invited_email then
    raise exception using errcode = '42501', message = 'accept_company_member_invitation: convite emitido para outro e-mail';
  end if;
  if exists (select 1 from public.companies c where c.id = v_m.company_id and c.owner_id = v_actor) then
    raise exception using errcode = '22023', message = 'accept_company_member_invitation: proprietario nao precisa de delegacao';
  end if;
  update public.company_members m set user_id = v_actor, status = 'active', accepted_at = now(), invite_token_hash = null, updated_at = now() where m.id = v_m.id;
  perform public.company_member_event_append(v_m.id, v_m.company_id, 'accepted', v_actor, null, v_m.member_role, null, null);
  return query select v_m.id, v_m.company_id, v_m.member_role;
end $fn$;

create function public.change_company_member_role(p_member_id uuid, p_role text, p_reason text, p_request_id uuid)
returns table (member_role text, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_m public.company_members%rowtype; v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'change_company_member_role: sessao obrigatoria'; end if;
  if p_role not in ('operator', 'viewer') then raise exception using errcode = '22023', message = 'change_company_member_role: papel invalido'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then raise exception using errcode = '22023', message = 'change_company_member_role: motivo (>= 10)'; end if;
  select * into v_m from public.company_members m where m.id = p_member_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'change_company_member_role: membro inexistente'; end if;
  if not public.is_current_user_company_owner(v_m.company_id) and not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'change_company_member_role: somente o proprietario (ou administrador)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('m', p_member_id, 'r', p_role, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('change_company_member_role', p_request_id, v_actor, p_member_id, v_fp);
  if v_log.id is not null then return query select v_m.member_role, true; return; end if;
  if v_m.status = 'revoked' then raise exception using errcode = '22023', message = 'change_company_member_role: membro revogado'; end if;
  update public.company_members m set member_role = p_role, updated_at = now() where m.id = p_member_id;
  perform public.company_member_event_append(p_member_id, v_m.company_id, 'role_changed', v_actor, v_m.member_role, p_role, btrim(p_reason), p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('change_company_member_role', p_request_id, v_actor, p_member_id, v_fp, 'accepted');
  return query select p_role, false;
end $fn$;

create function public.revoke_company_member(p_member_id uuid, p_reason text, p_request_id uuid)
returns table (revoked boolean, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_m public.company_members%rowtype; v_fp text; v_log public.rpc_call_log%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'revoke_company_member: sessao obrigatoria'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then raise exception using errcode = '22023', message = 'revoke_company_member: motivo (>= 10)'; end if;
  select * into v_m from public.company_members m where m.id = p_member_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'revoke_company_member: membro inexistente'; end if;
  if not public.is_current_user_company_owner(v_m.company_id) and not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'revoke_company_member: somente o proprietario (ou administrador)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('m', p_member_id, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('revoke_company_member', p_request_id, v_actor, p_member_id, v_fp);
  if v_log.id is not null then return query select v_m.status = 'revoked', true; return; end if;
  if v_m.status = 'revoked' then return query select true, false; return; end if;
  if v_m.member_role = 'owner' then raise exception using errcode = '22023', message = 'revoke_company_member: a linha do proprietario nao e revogavel por aqui'; end if;
  update public.company_members m set status = 'revoked', revoked_at = now(), revoked_by = v_actor, revoke_reason = btrim(p_reason), invite_token_hash = null, updated_at = now() where m.id = p_member_id;
  perform public.company_member_event_append(p_member_id, v_m.company_id, 'revoked', v_actor, v_m.member_role, null, btrim(p_reason), p_request_id);
  if v_m.user_id is not null and not exists (select 1 from public.company_members m2 where m2.user_id = v_m.user_id and m2.status = 'active' and m2.id <> p_member_id)
     and not exists (select 1 from public.companies c where c.owner_id = v_m.user_id)
     and not exists (select 1 from public.drivers d where d.profile_id = v_m.user_id) then
    perform public.revoke_push_devices_of(v_m.user_id, 'company_member_revoked');
  end if;
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('revoke_company_member', p_request_id, v_actor, p_member_id, v_fp, 'accepted');
  return query select true, false;
end $fn$;

create function public.list_company_members(p_company_id uuid)
returns table (member_id uuid, member_role text, status text, email_masked text, label text, invited_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'list_company_members: sessao obrigatoria'; end if;
  if not public.is_current_user_company_owner(p_company_id) and not public.has_role(v_actor, 'admin'::public.app_role)
     and not exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = v_actor and m.status = 'active') then
    raise exception using errcode = '42501', message = 'list_company_members: sem vinculo com a empresa';
  end if;
  return query
    select m.id, m.member_role, m.status,
           regexp_replace(coalesce(m.invited_email, lower(u.email), ''), '^(.).*(@.*)$', '\1***\2'),
           case when m.user_id is null then 'Convite pendente' else public.driver_label(p.full_name) end, m.invited_at, m.accepted_at, m.revoked_at, m.user_id = v_actor
      from public.company_members m
      left join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
     where m.company_id = p_company_id and m.member_role in ('operator', 'viewer')
     order by m.status, m.invited_at desc nulls last;
end $fn$;

-- -----------------------------------------------------------------------------
-- GRANTS (delegacao + triggers do modulo)
-- -----------------------------------------------------------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array['public.company_member_event_append(uuid, uuid, text, uuid, text, text, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array['public.invite_company_member(uuid, text, text, integer, uuid)', 'public.accept_company_member_invitation(text)',
    'public.change_company_member_role(uuid, text, text, uuid)', 'public.revoke_company_member(uuid, text, uuid)', 'public.list_company_members(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
  -- trigger functions: sem EXECUTE para ninguem alem do dono
  foreach v_sig in array array['operational_policies_block_mutation', 'privacy_notices_block_mutation', 'trip_assignments_enforce_link', 'trip_assignments_guard_update',
    'trip_assignments_block_delete', 'operational_trips_guard_insert', 'operational_trips_guard_update', 'operational_trips_block_delete', 'trip_events_block_mutation',
    'proof_of_delivery_guard_update', 'proof_of_delivery_block_delete', 'pod_attempts_block_mutation', 'trip_exceptions_guard_update', 'trip_exceptions_block_delete',
    'trip_admin_actions_block_mutation', 'cargo_dispositions_block_mutation', 'trip_locations_block_mutation', 'trip_access_log_block_mutation',
    'company_member_events_block_mutation', 'trips_follow_contract_status', 'trips_follow_contract_status_after', 'contracts_enforce_completion', 'contracts_enforce_lifecycle_facts'] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', v_sig);
  end loop;
end $$;

-- =============================================================================
-- AUDITORIA FINAL
-- =============================================================================
do $$
declare
  v_t text; v_r text; v_p text; v_f text; v_n int; v_gr text; v_src text;
  v_tables text[] := array['operational_policies', 'privacy_notices', 'operational_trips', 'trip_assignments', 'trip_geofences', 'trip_events',
    'trip_checkpoints', 'trip_documents', 'proof_of_delivery', 'proof_of_delivery_attempts', 'trip_exceptions', 'trip_exception_evidence', 'operational_alerts',
    'trip_admin_actions', 'cargo_dispositions', 'trip_operational_facts', 'trip_tracking_sessions', 'trip_locations', 'trip_location_summaries', 'trip_access_log',
    'scheduler_runs', 'operational_flags', 'push_devices', 'push_outbox', 'push_dispatch_nonces', 'push_required_platforms', 'push_homologation',
    'company_member_events', 'checkpoints', 'driver_positions', 'security_alerts', 'security_alerts_tracking'];
  v_helpers text[] := array['current_operational_policy', 'operational_policy_version', 'current_privacy_notice', 'trip_event_append', 'trip_access_append',
    'company_operational_role', 'is_company_operator', 'trip_role_of', 'trip_visible', 'trip_live_assignment_of_caller', 'assert_trip_media',
    'trip_lock', 'trip_policy', 'trip_actor_kind_of', 'company_operational_users', 'notify_trip', 'trip_release_capacity', 'trip_reserve_capacity',
    'trip_end_tracking_sessions', 'driver_label', 'trip_create_core', 'trip_assign_core', 'freight_operational_transition', 'steelgo_now', 'trip_apply_legal_hold',
    'trip_settle_legal_hold', 'trip_alert_open', 'trip_alert_close', 'trip_compute_eta', 'trip_evaluate_alerts', 'trip_purge_core', 'run_operational_scheduler',
    'complete_contract_delivery_core', 'operational_flag', 'push_enqueue', 'revoke_push_devices_of', 'push_activation_gates', 'run_push_dispatch_tick',
    'mask_plate', 'trip_is_active', 'trip_driver_block', 'company_member_event_append'];
  v_rpcs text[] := array['request_trip_media_access', 'trip_upload_allowed', 'trip_object_visible', 'is_company_viewer', 'create_trip_for_contract', 'assign_trip', 'reassign_trip',
    'respond_trip_assignment', 'start_tracking_session', 'transition_trip', 'cancel_trip', 'pause_trip', 'resume_trip', 'force_trip_transition',
    'resolve_cargo_disposition', 'set_trip_legal_hold', 'release_trip_legal_hold', 'ingest_trip_locations', 'report_trip_eta', 'purge_trip_raw_locations',
    'scheduler_health', 'complete_contract_delivery', 'record_trip_checkpoint', 'add_trip_document', 'submit_proof_of_delivery', 'resolve_delivery_exception',
    'supersede_proof_of_delivery', 'register_transshipment', 'submit_return_receipt', 'open_trip_exception', 'acknowledge_trip_exception', 'resolve_trip_exception',
    'open_sos', 'acknowledge_sos', 'escalate_sos', 'resolve_sos', 'open_dispute_case', 'register_push_device', 'revoke_push_device', 'request_push_homologation',
    'ack_push_homologation', 'get_push_activation_gates', 'enable_push_dispatch', 'set_operational_flag', 'set_company_operational_contact', 'list_my_trips', 'get_trip',
    'list_trip_positions', 'list_trip_positions_admin', 'list_operational_alerts', 'list_sos_queue', 'get_my_driver_trip', 'get_current_privacy_notice',
    'acknowledge_privacy_notice', 'publish_privacy_notice', 'publish_operational_policy', 'export_my_trip_data', 'place_bid', 'list_legacy_operational_records',
    'invite_company_member', 'accept_company_member_invitation', 'change_company_member_role', 'revoke_company_member', 'list_company_members'];
  v_service text[] := array['claim_push_batch', 'mark_push_result', 'consume_push_nonce', 'record_push_dispatch_run', 'try_complete_contract'];
  v_triggers text[] := array['operational_policies_block_mutation', 'privacy_notices_block_mutation', 'trip_assignments_enforce_link', 'trip_assignments_guard_update',
    'trip_assignments_block_delete', 'operational_trips_guard_insert', 'operational_trips_guard_update', 'operational_trips_block_delete', 'trip_events_block_mutation',
    'proof_of_delivery_guard_update', 'proof_of_delivery_block_delete', 'pod_attempts_block_mutation', 'trip_exceptions_guard_update', 'trip_exceptions_block_delete',
    'trip_admin_actions_block_mutation', 'cargo_dispositions_block_mutation', 'trip_locations_block_mutation', 'trip_access_log_block_mutation',
    'company_member_events_block_mutation', 'trips_follow_contract_status', 'trips_follow_contract_status_after'];
  v_m12 text[] := array['request_escrow_funding', 'confirm_escrow_funding', 'request_escrow_release', 'confirm_escrow_release', 'open_dispute_case', 'decide_dispute_case',
    'close_dispute_case', 'settle_dispute_decision', 'confirm_dispute_settlement', 'confirm_dispute_recovery', 'write_off_dispute_recovery', 'sign_contract',
    'accept_bid_and_create_contract', 'publish_freight', 'reprice_published_freight', 'withdraw_freight', 'cancel_freight', 'cancel_contract_for_unpaid_settlement',
    'try_complete_contract', 'complete_contract_delivery_core'];
begin
  -- tabelas: nenhum DML nem SELECT para anon/authenticated; service_role sem DML
  foreach v_t in array v_tables loop
    foreach v_r in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = v_t and g.grantee = v_r and g.privilege_type = v_p) then
          raise exception 'ACL: % concede % a %', v_t, v_p, v_r;
        end if;
      end loop;
    end loop;
    foreach v_r in array array['anon', 'authenticated'] loop
      if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = v_t and g.grantee = v_r and g.privilege_type = 'SELECT') then
        raise exception 'ACL: % concede SELECT a %', v_t, v_r;
      end if;
    end loop;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_t) then
      raise exception 'ACL: % tem policy; esperado deny-by-default', v_t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_t)::regclass) then
      raise exception 'ACL: % sem RLS', v_t;
    end if;
  end loop;
  -- funcoes: 1 overload, secdef + search_path vazio, sem PUBLIC/anon
  foreach v_f in array v_helpers || v_rpcs || v_service loop
    select count(*) into v_n from pg_proc where pronamespace = 'public'::regnamespace and proname = v_f;
    if v_n <> 1 then raise exception 'ACL: funcao % com % overload(s)', v_f, v_n; end if;
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_f
                     and (p.prosecdef or v_f in ('trip_actor_kind_of', 'driver_label', 'mask_plate', 'trip_is_active', 'steelgo_now'))
                     and coalesce('search_path=""' = any(p.proconfig), false)) then
      raise exception 'ACL: % nao e SECURITY DEFINER com search_path vazio', v_f;
    end if;
    if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE' and (a.grantee = 0 or a.grantee::regrole::text = 'anon')) then
      raise exception 'ACL: % executavel por PUBLIC ou anon', v_f;
    end if;
  end loop;
  foreach v_f in array v_helpers loop
    select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_gr
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE';
    if v_gr is distinct from 'postgres' then raise exception 'ACL: helper % executavel por [%]', v_f, v_gr; end if;
  end loop;
  foreach v_f in array v_rpcs loop
    select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_gr
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE';
    if v_gr is distinct from 'authenticated,postgres,service_role' then raise exception 'ACL: RPC % executavel por [%]', v_f, v_gr; end if;
  end loop;
  foreach v_f in array v_service loop
    select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_gr
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE';
    if v_gr is distinct from 'postgres,service_role' then raise exception 'ACL: RPC de servico % executavel por [%]', v_f, v_gr; end if;
  end loop;
  foreach v_f in array v_triggers loop
    if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE' and a.grantee::regrole::text <> 'postgres') then
      raise exception 'ACL: trigger function % executavel por outro papel', v_f;
    end if;
  end loop;
  -- isolamento: helpers de delegacao NAO aparecem em funcoes M1/M2
  foreach v_f in array v_m12 loop
    select p.prosrc into v_src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_f limit 1;
    if v_src ~ 'is_company_operator|is_company_viewer|company_operational_role' then
      raise exception 'ISOLAMENTO: % referencia helpers de delegacao operacional', v_f;
    end if;
  end loop;
  -- RPCs M3 nao tocam confirmacao financeira nem decisoes de disputa
  foreach v_f in array v_rpcs || v_helpers loop
    if v_f in ('open_dispute_case', 'complete_contract_delivery', 'complete_contract_delivery_core') then continue; end if;
    select p.prosrc into v_src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_f limit 1;
    if v_src ~ 'payment_intents|payment_transactions|payment_events|payment_allocations|payment_recoveries|external_reconciliation|dispute_decisions|confirm_escrow|request_escrow' then
      raise exception 'FINANCEIRO: funcao M3 % referencia tabela/RPC financeira', v_f;
    end if;
  end loop;
  -- limites vem da politica congelada
  foreach v_f in array array['ingest_trip_locations', 'transition_trip', 'trip_evaluate_alerts', 'trip_compute_eta', 'trip_purge_core', 'submit_proof_of_delivery',
                             'record_trip_checkpoint', 'open_sos', 'open_trip_exception', 'submit_return_receipt', 'start_tracking_session'] loop
    select p.prosrc into v_src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_f limit 1;
    if v_src !~ 'trip_policy\(|operational_policy' then raise exception 'POLITICA: % nao le a politica versionada', v_f; end if;
    if v_src ~ 'interval ''(20|45|120) min' then raise exception 'POLITICA: % contem limite fixo', v_f; end if;
  end loop;
  -- storage
  if not exists (select 1 from storage.buckets where id = 'trip-media' and public = false and file_size_limit = 10485760) then
    raise exception 'STORAGE: bucket trip-media ausente/publico/sem limite';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')
              and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'trip-media') then
    raise exception 'STORAGE: policy UPDATE/DELETE/ALL em trip-media';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('trip_media_insert_linked', 'trip_media_select_audited');
  if v_n <> 2 then raise exception 'STORAGE: policies de trip-media ausentes'; end if;
  -- cron e flags
  if not exists (select 1 from cron.job where jobname = 'steelgo_operational_tick' and active) then raise exception 'CRON: steelgo_operational_tick ausente/inativo'; end if;
  if not exists (select 1 from cron.job where jobname = 'steelgo_push_dispatch' and not active) then raise exception 'CRON: steelgo_push_dispatch deve nascer INATIVO'; end if;
  if not exists (select 1 from cron.job where jobname = 'steelgo_cron_housekeeping' and active) then raise exception 'CRON: housekeeping ausente'; end if;
  if public.operational_flag('sos_operational') or public.operational_flag('push_dispatch_enabled') then raise exception 'FLAGS: devem nascer desligados'; end if;
  if exists (select 1 from public.push_required_platforms where platform = 'android' and not required) then raise exception 'PUSH: android deve ser obrigatorio'; end if;
  if exists (select 1 from public.push_required_platforms where platform = 'ios' and (publishable or homologated_at is not null)) then raise exception 'PUSH: ios nao pode nascer homologado/publicavel'; end if;
  -- aviso de privacidade: nenhum texto placeholder gravado por migration
  if exists (select 1 from public.privacy_notices) then raise exception 'PRIVACIDADE: privacy_notices deve nascer vazia (publicacao e ato administrativo)'; end if;
  -- legado congelado
  foreach v_t in array array['checkpoints', 'driver_positions', 'security_alerts', 'security_alerts_tracking', 'bids', 'esg_logs', 'company_members'] loop
    if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = v_t and g.grantee in ('anon', 'authenticated')
                and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) then
      raise exception 'LEGADO: % ainda aceita DML direto', v_t;
    end if;
  end loop;
  if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'payments' and g.grantee in ('anon', 'authenticated')) then
    raise exception 'LEGADO: payments ainda legivel por anon/authenticated';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trucks' and policyname = 'trucks_select_auth') then
    raise exception 'LEGADO: trucks_select_auth ainda existe';
  end if;
  -- consistencia de dados (sem exigir tabelas vazias)
  if exists (select 1 from public.operational_trips t where t.status not in ('completed', 'cancelled', 'returned')
              group by t.contract_id having count(*) > 1) then raise exception 'DADOS: contrato com mais de uma viagem viva'; end if;
  if exists (select 1 from public.trip_events e group by e.trip_id having count(*) <> max(e.seq)) then raise exception 'DADOS: seq de eventos com lacunas'; end if;
  if exists (select 1 from public.operational_trips t where t.status in ('cancelled', 'returned') and t.loaded_at is not null and t.cargo_disposition is null) then
    raise exception 'DADOS: viagem carregada encerrada sem disposicao de carga';
  end if;
  if exists (select 1 from public.contracts c join public.operational_trips t on t.contract_id = c.id
              where c.status = 'completed'::public.contract_status and t.status not in ('completed', 'cancelled', 'returned')) then
    raise exception 'DADOS: contrato completed com viagem viva';
  end if;
  if exists (select 1 from public.trip_assignments a join public.drivers d on d.id = a.driver_id where d.profile_id is distinct from a.driver_profile_id and a.state in ('offered', 'accepted')) then
    raise exception 'DADOS: assignment vivo com identidade divergente';
  end if;
end $$;

commit;
