-- =============================================================================
-- MODULO 3 - 78/81: push (FCM/APNs via Edge Function push-dispatch)
--   * push_devices (token nunca sai por RPC), push_outbox (fila com claim
--     transacional FOR UPDATE SKIP LOCKED, lease com expiracao, tentativas com
--     backoff, idempotency_key, recuperacao de claims abandonados);
--   * homologacao ponta a ponta: success SOMENTE com ACK do aparelho autenticado
--     (homologation_id + nonce, expiracao, unicidade). "fcm_accepted" e separado de
--     "device_received";
--   * job steelgo_push_dispatch nasce INATIVO; assinatura HMAC-SHA256 real
--     (ts.nonce.body canonico) com segredo do Vault (NAO criado aqui);
--   * plataformas exigidas registradas no servidor: android obrigatorio; ios nao
--     homologado/nao publicavel ate credenciais Apple;
--   * notify_trip passa a enfileirar push (payload sem dados pessoais).
-- =============================================================================
begin;

create table public.push_devices (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references auth.users(id) on delete cascade,
  device_id     uuid not null,
  platform      text not null check (platform in ('android', 'ios', 'web')),
  token         text not null check (length(token) between 20 and 4096),
  app_version   text,
  build         text,
  registered_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  revoke_reason text
);
create unique index push_devices_one_active_per_device on public.push_devices (device_id) where revoked_at is null;
create unique index push_devices_token_active on public.push_devices (token) where revoked_at is null;
create index push_devices_profile_idx on public.push_devices (profile_id) where revoked_at is null;
alter table public.push_devices enable row level security;
revoke all on public.push_devices from public, anon, authenticated, service_role;
grant select on public.push_devices to service_role;

-- Padroes proibidos em titulo/corpo de push (tela bloqueada). IMMUTABLE para
-- servir ao CHECK da tabela. Nao e um detector de PII geral: e a lista do que
-- NUNCA pode aparecer fora do app autenticado.
create function public.push_text_is_minimized(p_text text)
returns boolean language sql immutable strict set search_path = '' as $fn$
  select p_text !~ '@'                                              -- e-mail
     and p_text !~ 'R\$'                                            -- valor financeiro
     and p_text !~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}'                     -- CPF
     and p_text !~ '\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}'               -- CNPJ
     and p_text !~ '\(?\d{2}\)?\s?9?\d{4}-?\d{4}'                     -- telefone
     and p_text !~ '-?\d{1,3}\.\d{4,}'                               -- coordenada decimal
     and p_text !~ '\d{9,}'                                          -- documento/telefone sem mascara
$fn$;
revoke all on function public.push_text_is_minimized(text) from public, anon, authenticated, service_role;

create table public.push_outbox (
  id               bigint generated always as identity primary key,
  profile_id       uuid not null references auth.users(id) on delete cascade,
  trip_id          uuid,
  kind             text not null,
  title            text not null,
  body             text not null,
  data             jsonb not null default '{}'::jsonb,
  priority         text not null default 'normal' check (priority in ('normal', 'high')),
  idempotency_key  text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'leased', 'sent', 'failed', 'dead', 'skipped')),
  attempts         integer not null default 0,
  max_attempts     integer not null default 6,
  next_attempt_at  timestamptz not null default now(),
  lease_token      uuid,
  lease_expires_at timestamptz,
  last_error       text,
  fcm_message_ids  jsonb not null default '[]'::jsonb,
  fcm_accepted_at  timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  constraint push_outbox_no_pii check (not (data ? 'cpf' or data ? 'phone' or data ? 'email' or data ? 'name' or data ? 'full_name')),
  -- Minimizacao (tela bloqueada): data so carrega identificadores de roteamento
  -- (kind/ref/link) e de homologacao (homologation_id/nonce, sem PII); titulo e
  -- corpo nunca levam e-mail, CPF/CNPJ, telefone, valores financeiros nem
  -- coordenadas. O texto detalhado fica na notificacao in-app (apos login).
  constraint push_outbox_data_allowlist check ((data - 'kind' - 'ref' - 'link' - 'homologation_id' - 'nonce') = '{}'::jsonb),
  constraint push_outbox_text_minimized check (
    public.push_text_is_minimized(title) and public.push_text_is_minimized(body))
);
create index push_outbox_pending_idx on public.push_outbox (next_attempt_at) where status in ('pending', 'leased');
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public, anon, authenticated, service_role;
grant select on public.push_outbox to service_role;

create table public.push_dispatch_nonces (
  nonce   uuid primary key,
  ts      bigint not null,
  seen_at timestamptz not null default now()
);
alter table public.push_dispatch_nonces enable row level security;
revoke all on public.push_dispatch_nonces from public, anon, authenticated, service_role;

create table public.push_required_platforms (
  platform        text primary key check (platform in ('android', 'ios')),
  required        boolean not null,
  publishable     boolean not null default false,
  homologated_at  timestamptz,
  homologation_id uuid,
  note            text,
  updated_at      timestamptz not null default now()
);
insert into public.push_required_platforms (platform, required, publishable, note) values
  ('android', true, false, 'Obrigatoria para ativar push/SOS. Homologacao so com ACK real do aparelho.'),
  ('ios', false, false, 'Nao homologada e nao publicavel: sem conta Apple Developer/APNs. Nao pode ser escondida.');
alter table public.push_required_platforms enable row level security;
revoke all on public.push_required_platforms from public, anon, authenticated, service_role;
grant select on public.push_required_platforms to service_role;

create table public.push_homologation (
  id                 uuid primary key default gen_random_uuid(),
  push_device_id     uuid not null references public.push_devices(id),
  profile_id         uuid not null references auth.users(id),
  platform           text not null,
  app_version        text,
  build              text,
  nonce              text not null,
  outbox_id          bigint references public.push_outbox(id),
  requested_by       uuid not null references auth.users(id),
  requested_at       timestamptz not null default now(),
  expires_at         timestamptz not null,
  fcm_accepted_at    timestamptz,
  device_received_at timestamptz,
  acked_by           uuid references auth.users(id),
  status             text not null default 'sent' check (status in ('sent', 'fcm_accepted', 'device_received', 'expired', 'failed')),
  error              text
);
create unique index push_homologation_nonce on public.push_homologation (nonce);
alter table public.push_homologation enable row level security;
revoke all on public.push_homologation from public, anon, authenticated, service_role;
grant select on public.push_homologation to service_role;

-- -----------------------------------------------------------------------------
-- dispositivos (usuario autenticado)
-- -----------------------------------------------------------------------------
create function public.register_push_device(p_device_id uuid, p_platform text, p_token text, p_app_version text, p_build text)
returns table (push_device_id uuid, was_existing boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_d public.push_devices%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'register_push_device: sessao obrigatoria'; end if;
  if p_device_id is null or p_platform not in ('android', 'ios', 'web') or p_token is null or length(p_token) < 20 then
    raise exception using errcode = '22023', message = 'register_push_device: parametros invalidos';
  end if;
  select * into v_d from public.push_devices d where d.device_id = p_device_id and d.revoked_at is null for update;
  if found then
    if v_d.profile_id <> v_actor then
      update public.push_devices d set revoked_at = now(), revoke_reason = 'device_reassigned' where d.id = v_d.id;
    elsif v_d.token = p_token then
      update public.push_devices d set last_seen_at = now(), app_version = coalesce(p_app_version, d.app_version), build = coalesce(p_build, d.build) where d.id = v_d.id;
      return query select v_d.id, true; return;
    else
      update public.push_devices d set revoked_at = now(), revoke_reason = 'token_rotated' where d.id = v_d.id;
    end if;
  end if;
  update public.push_devices d set revoked_at = now(), revoke_reason = 'token_reused_elsewhere' where d.token = p_token and d.revoked_at is null;
  insert into public.push_devices (profile_id, device_id, platform, token, app_version, build) values (v_actor, p_device_id, p_platform, p_token, p_app_version, p_build)
  returning * into v_d;
  return query select v_d.id, false;
end $fn$;

create function public.revoke_push_device(p_device_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_n integer;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'revoke_push_device: sessao obrigatoria'; end if;
  update public.push_devices d set revoked_at = now(), revoke_reason = coalesce(p_reason, 'logout')
   where d.profile_id = v_actor and d.revoked_at is null and (p_device_id is null or d.device_id = p_device_id);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

-- todos os dispositivos de um usuario (usado por revogacao de membro/motorista)
create function public.revoke_push_devices_of(p_profile_id uuid, p_reason text)
returns integer language sql security definer set search_path = '' as $fn$
  with u as (update public.push_devices d set revoked_at = now(), revoke_reason = p_reason
              where d.profile_id = p_profile_id and d.revoked_at is null returning 1)
  select count(*)::integer from u;
$fn$;

-- -----------------------------------------------------------------------------
-- fila: enfileirar (helper), claim/mark (Edge Function via service_role)
-- -----------------------------------------------------------------------------
-- Corpo da notificacao push por tipo: catalogo FIXO. O texto livre das RPCs
-- (motivo, descricao, nota, nome do motorista, placa) fica so na notificacao
-- in-app; na tela bloqueada aparece apenas o generico abaixo.
create function public.push_minimized_body(p_kind text)
returns text language sql immutable strict set search_path = '' as $fn$
  select case
    when p_kind = 'trip_created'                then 'Nova viagem aberta. Designe motorista e veículo no aplicativo.'
    when p_kind = 'trip_assigned'               then 'Motorista e veículo designados. Detalhes no aplicativo.'
    when p_kind = 'trip_accepted'               then 'O motorista confirmou a viagem.'
    when p_kind = 'trip_declined'               then 'O motorista recusou a viagem. Designe outro no aplicativo.'
    when p_kind = 'trip_in_transit'             then 'A carga saiu da origem.'
    when p_kind = 'trip_at_pickup'              then 'O veículo chegou ao local de coleta.'
    when p_kind = 'trip_at_delivery'            then 'O veículo chegou ao local de entrega.'
    when p_kind = 'trip_loaded'                 then 'Carga embarcada. Foto registrada no aplicativo.'
    when p_kind = 'trip_delivered'              then 'Prova de entrega registrada.'
    when p_kind = 'delivery_refused'            then 'Entrega não concluída. Veja os detalhes no aplicativo.'
    when p_kind = 'delivery_exception_resolved' then 'Exceção de entrega resolvida. Detalhes no aplicativo.'
    when p_kind = 'trip_cancelled'              then 'Tentativa operacional encerrada. Detalhes no aplicativo.'
    when p_kind = 'trip_paused'                 then 'Viagem pausada. Motivo no aplicativo.'
    when p_kind = 'trip_resumed'                then 'Viagem retomada. Motivo no aplicativo.'
    when p_kind = 'trip_admin_override'         then 'Estado ajustado pela SteelGo. Motivo no aplicativo.'
    when p_kind = 'trip_transshipment'          then 'Transbordo registrado. Detalhes no aplicativo.'
    when p_kind = 'trip_returned'               then 'Carga retornou à origem. Detalhes no aplicativo.'
    when p_kind = 'cargo_disposition_required'  then 'Disposição de carga exigida. Resolva no aplicativo.'
    when p_kind = 'cargo_disposition_resolved'  then 'Disposição da carga registrada.'
    when p_kind = 'sos_opened'                  then 'Alerta crítico acionado. Reconheça no aplicativo. Nenhum serviço de emergência é acionado automaticamente.'
    when p_kind = 'sos_acknowledged'            then 'Alerta crítico reconhecido.'
    when p_kind = 'sos_escalated'               then 'Alerta crítico sem reconhecimento. Reconheça no aplicativo.'
    when p_kind = 'sos_resolved'                then 'Alerta crítico encerrado.'
    when p_kind = 'trip_exception_resolved'     then 'Ocorrência resolvida. Detalhes no aplicativo.'
    when p_kind like 'trip_exception_%'         then 'Ocorrência registrada. Detalhes no aplicativo.'
    when p_kind like 'trip_alert_%'             then 'Alerta operacional. Verifique a viagem no aplicativo.'
    else 'Atualização da viagem. Abra o aplicativo para ver os detalhes.'
  end
$fn$;
revoke all on function public.push_minimized_body(text) from public, anon, authenticated, service_role;

-- p_body e o texto in-app: NAO vai para o push. O corpo enviado sai do catalogo
-- (push_minimized_body) e o titulo e validado pelo CHECK push_outbox_text_minimized.
create function public.push_enqueue(p_profile_id uuid, p_trip_id uuid, p_kind text, p_title text, p_body text, p_data jsonb, p_priority text, p_idempotency_key text)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare v_id bigint;
begin
  if not exists (select 1 from public.push_devices d where d.profile_id = p_profile_id and d.revoked_at is null) then
    return null; -- sem dispositivo: nada a enviar (in-app cobre)
  end if;
  insert into public.push_outbox (profile_id, trip_id, kind, title, body, data, priority, idempotency_key)
  values (p_profile_id, p_trip_id, p_kind, left(p_title, 120), public.push_minimized_body(p_kind),
          coalesce(p_data, '{}'::jsonb) - 'cpf' - 'phone' - 'email' - 'name' - 'full_name', coalesce(p_priority, 'normal'), p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  return v_id;
end $fn$;

create function public.claim_push_batch(p_limit integer, p_lease_seconds integer)
returns table (outbox_id bigint, lease_token uuid, profile_id uuid, kind text, title text, body text, data jsonb, priority text, attempts integer,
               devices jsonb)
language plpgsql security definer set search_path = '' as $fn$
declare v_tok uuid := gen_random_uuid(); v_now timestamptz := now();
begin
  if session_user not in ('postgres', 'supabase_admin') and current_setting('request.jwt.claims', true)::jsonb ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'claim_push_batch: somente service_role';
  end if;
  return query
    with c as (
      select o.id from public.push_outbox o
       where (o.status = 'pending' and o.next_attempt_at <= v_now)
          or (o.status = 'leased' and o.lease_expires_at < v_now)   -- claim abandonado
       order by o.priority desc, o.next_attempt_at
       limit greatest(1, least(coalesce(p_limit, 100), 500))
       for update skip locked)
    update public.push_outbox o
       set status = 'leased', lease_token = v_tok, lease_expires_at = v_now + make_interval(secs => greatest(10, coalesce(p_lease_seconds, 60))), attempts = o.attempts + 1
      from c where o.id = c.id
    returning o.id, o.lease_token, o.profile_id, o.kind, o.title, o.body, o.data, o.priority, o.attempts,
      (select coalesce(jsonb_agg(jsonb_build_object('push_device_id', d.id, 'platform', d.platform, 'token', d.token)), '[]'::jsonb)
         from public.push_devices d where d.profile_id = o.profile_id and d.revoked_at is null);
end $fn$;

create function public.mark_push_result(p_outbox_id bigint, p_lease_token uuid, p_result text, p_fcm_message_ids jsonb, p_error text, p_dead_tokens text[])
returns boolean language plpgsql security definer set search_path = '' as $fn$
declare v_o public.push_outbox%rowtype; v_next timestamptz;
begin
  if session_user not in ('postgres', 'supabase_admin') and current_setting('request.jwt.claims', true)::jsonb ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'mark_push_result: somente service_role';
  end if;
  select * into v_o from public.push_outbox o where o.id = p_outbox_id for update;
  if not found or v_o.lease_token is distinct from p_lease_token or v_o.status <> 'leased' then
    return false; -- lease perdido: outro worker recuperou
  end if;
  if p_dead_tokens is not null and array_length(p_dead_tokens, 1) > 0 then
    update public.push_devices d set revoked_at = now(), revoke_reason = 'fcm_unregistered' where d.token = any(p_dead_tokens) and d.revoked_at is null;
  end if;
  if p_result = 'sent' then
    update public.push_outbox o set status = 'sent', sent_at = now(), fcm_accepted_at = now(), fcm_message_ids = coalesce(p_fcm_message_ids, '[]'::jsonb), lease_token = null, lease_expires_at = null where o.id = p_outbox_id;
    update public.push_homologation h set fcm_accepted_at = now(), status = case when h.status = 'sent' then 'fcm_accepted' else h.status end where h.outbox_id = p_outbox_id;
  elsif p_result = 'no_device' then
    update public.push_outbox o set status = 'skipped', last_error = 'no_active_device', lease_token = null, lease_expires_at = null where o.id = p_outbox_id;
  else
    if v_o.attempts >= v_o.max_attempts then
      update public.push_outbox o set status = 'dead', last_error = left(p_error, 500), lease_token = null, lease_expires_at = null where o.id = p_outbox_id;
      update public.push_homologation h set status = 'failed', error = left(p_error, 500) where h.outbox_id = p_outbox_id and h.status in ('sent');
    else
      v_next := now() + make_interval(mins => power(2, v_o.attempts)::integer);
      update public.push_outbox o set status = 'pending', next_attempt_at = v_next, last_error = left(p_error, 500), lease_token = null, lease_expires_at = null where o.id = p_outbox_id;
    end if;
  end if;
  return true;
end $fn$;

create function public.consume_push_nonce(p_nonce uuid, p_ts bigint)
returns boolean language plpgsql security definer set search_path = '' as $fn$
begin
  if session_user not in ('postgres', 'supabase_admin') and current_setting('request.jwt.claims', true)::jsonb ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'consume_push_nonce: somente service_role';
  end if;
  if p_nonce is null or p_ts is null or abs(extract(epoch from now())::bigint - p_ts) > 60 then
    return false; -- fora da tolerancia de replay
  end if;
  insert into public.push_dispatch_nonces (nonce, ts) values (p_nonce, p_ts) on conflict (nonce) do nothing;
  return found;
end $fn$;

create function public.record_push_dispatch_run(p_pushes integer, p_error text)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  if session_user not in ('postgres', 'supabase_admin') and current_setting('request.jwt.claims', true)::jsonb ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'record_push_dispatch_run: somente service_role';
  end if;
  insert into public.scheduler_runs (kind, finished_at, outcome, pushes_enqueued, error)
  values ('push_dispatch', now(), case when p_error is null then 'ok' else 'error' end, coalesce(p_pushes, 0), left(p_error, 500));
end $fn$;

-- -----------------------------------------------------------------------------
-- homologacao ponta a ponta
-- -----------------------------------------------------------------------------
create function public.request_push_homologation(p_device_id uuid)
returns table (homologation_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_d public.push_devices%rowtype; v_h public.push_homologation%rowtype; v_nonce text; v_ob bigint;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'request_push_homologation: sessao obrigatoria'; end if;
  select * into v_d from public.push_devices d where d.device_id = p_device_id and d.revoked_at is null;
  if not found then raise exception using errcode = 'P0002', message = 'request_push_homologation: dispositivo nao registrado'; end if;
  if v_d.profile_id <> v_actor and not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'request_push_homologation: dispositivo de outro usuario';
  end if;
  v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.push_homologation (push_device_id, profile_id, platform, app_version, build, nonce, requested_by, expires_at)
  values (v_d.id, v_d.profile_id, v_d.platform, v_d.app_version, v_d.build, v_nonce, v_actor, now() + interval '15 minutes') returning * into v_h;
  insert into public.push_outbox (profile_id, kind, title, body, data, priority, idempotency_key)
  values (v_d.profile_id, 'homologation', 'SteelGo: teste de notificacao', 'Toque para confirmar o recebimento no aparelho.',
          jsonb_build_object('kind', 'homologation', 'homologation_id', v_h.id, 'nonce', v_nonce), 'high', 'homologation:' || v_h.id::text)
  returning id into v_ob;
  update public.push_homologation h set outbox_id = v_ob where h.id = v_h.id;
  return query select v_h.id, v_h.expires_at;
end $fn$;

create function public.ack_push_homologation(p_homologation_id uuid, p_nonce text, p_device_id uuid)
returns table (status text, device_received_at timestamptz)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := (select auth.uid()); v_h public.push_homologation%rowtype; v_d public.push_devices%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'ack_push_homologation: sessao obrigatoria'; end if;
  select * into v_h from public.push_homologation h where h.id = p_homologation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ack_push_homologation: homologacao inexistente'; end if;
  select * into v_d from public.push_devices d where d.id = v_h.push_device_id;
  if v_d.profile_id <> v_actor or v_d.device_id <> p_device_id then
    raise exception using errcode = '42501', message = 'ack_push_homologation: ACK deve vir do proprio aparelho autenticado';
  end if;
  if v_h.status = 'device_received' then
    raise exception using errcode = '23505', message = 'ack_push_homologation: ACK ja registrado (replay)';
  end if;
  if now() > v_h.expires_at then
    update public.push_homologation h set status = 'expired' where h.id = v_h.id;
    raise exception using errcode = '22023', message = 'ack_push_homologation: homologacao expirada';
  end if;
  if v_h.nonce <> p_nonce then
    raise exception using errcode = '22023', message = 'ack_push_homologation: nonce invalido';
  end if;
  update public.push_homologation h set status = 'device_received', device_received_at = now(), acked_by = v_actor where h.id = v_h.id;
  update public.push_required_platforms p set homologated_at = now(), homologation_id = v_h.id, updated_at = now() where p.platform = v_h.platform;
  return query select 'device_received'::text, now();
end $fn$;

-- -----------------------------------------------------------------------------
-- gates de ativacao (admin). Nada aqui cria segredo.
-- -----------------------------------------------------------------------------
create function public.push_activation_gates()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v jsonb;
begin
  select jsonb_build_object(
    'vault_secret_present', exists (select 1 from vault.secrets s where s.name = 'steelgo_cron_secret'),
    'job_active', coalesce((select j.active from cron.job j where j.jobname = 'steelgo_push_dispatch'), false),
    'flag_push_dispatch_enabled', public.operational_flag('push_dispatch_enabled'),
    'flag_sos_operational', public.operational_flag('sos_operational'),
    'required_platforms', (select jsonb_agg(jsonb_build_object('platform', p.platform, 'required', p.required, 'publishable', p.publishable,
                              'homologated_at', p.homologated_at,
                              'homologated_recently', p.homologated_at is not null and p.homologated_at > now() - interval '30 days')
                              order by p.platform) from public.push_required_platforms p),
    'all_required_homologated', not exists (select 1 from public.push_required_platforms p where p.required
                                              and (p.homologated_at is null or p.homologated_at < now() - interval '30 days')),
    'scheduler_healthy', coalesce((select r.started_at > now() - interval '5 minutes' from public.scheduler_runs r where r.kind = 'operational_tick' order by r.started_at desc limit 1), false),
    'last_push_dispatch', (select r.started_at from public.scheduler_runs r where r.kind = 'push_dispatch' order by r.started_at desc limit 1)
  ) into v;
  return v;
end $fn$;

create function public.get_push_activation_gates()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('get_push_activation_gates');
begin
  return public.push_activation_gates();
end $fn$;

create function public.enable_push_dispatch(p_request_id uuid)
returns table (enabled boolean, gates jsonb)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('enable_push_dispatch'); v_g jsonb; v_jobid bigint; v_fp text; v_log public.rpc_call_log%rowtype;
begin
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('op', 'enable_push_dispatch'));
  v_log := public.rpc_idempotency_probe('enable_push_dispatch', p_request_id, v_actor, null, v_fp, true);
  v_g := public.push_activation_gates();
  if v_log.id is not null then return query select public.operational_flag('push_dispatch_enabled'), v_g; return; end if;
  if not (v_g ->> 'vault_secret_present')::boolean then
    raise exception using errcode = '22023', message = 'enable_push_dispatch: segredo steelgo_cron_secret ausente no Vault';
  end if;
  if not (v_g ->> 'all_required_homologated')::boolean then
    raise exception using errcode = '22023', message = 'enable_push_dispatch: plataforma obrigatoria sem homologacao real (ACK do aparelho) nos ultimos 30 dias';
  end if;
  select jobid into v_jobid from cron.job where jobname = 'steelgo_push_dispatch';
  if v_jobid is null then raise exception using errcode = '22023', message = 'enable_push_dispatch: job inexistente'; end if;
  perform cron.alter_job(v_jobid, active := true);
  update public.operational_flags f set value = true, reason = 'Ativado por administrador apos gates.', updated_by = v_actor, updated_at = now(), request_id = p_request_id
   where f.key = 'push_dispatch_enabled';
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (null, v_actor, 'enable_push_dispatch', v_g, jsonb_build_object('job_active', true), 'Ativacao do despacho de push apos gates.', p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('enable_push_dispatch', p_request_id, v_actor, null, v_fp, 'accepted');
  return query select true, public.push_activation_gates();
end $fn$;

create function public.set_operational_flag(p_key text, p_value boolean, p_reason text, p_request_id uuid)
returns table (key text, value boolean, was_replayed boolean)
language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('set_operational_flag'); v_g jsonb; v_fp text; v_log public.rpc_call_log%rowtype; v_old boolean;
begin
  if p_key not in ('sos_operational', 'push_dispatch_enabled') then
    raise exception using errcode = '22023', message = 'set_operational_flag: chave desconhecida';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 20 then raise exception using errcode = '22023', message = 'set_operational_flag: motivo (>= 20)'; end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('key', p_key, 'value', p_value, 'reason', p_reason));
  v_log := public.rpc_idempotency_probe('set_operational_flag', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then return query select p_key, public.operational_flag(p_key), true; return; end if;
  v_old := public.operational_flag(p_key);
  if p_key = 'sos_operational' and p_value then
    v_g := public.push_activation_gates();
    if not (v_g ->> 'flag_push_dispatch_enabled')::boolean or not (v_g ->> 'job_active')::boolean then
      raise exception using errcode = '22023', message = 'set_operational_flag: SOS operacional exige despacho de push ativo';
    end if;
    if not (v_g ->> 'all_required_homologated')::boolean then
      raise exception using errcode = '22023', message = 'set_operational_flag: SOS operacional exige plataformas obrigatorias homologadas';
    end if;
    if not (v_g ->> 'scheduler_healthy')::boolean then
      raise exception using errcode = '22023', message = 'set_operational_flag: scheduler operacional sem execucao recente';
    end if;
  end if;
  if p_key = 'push_dispatch_enabled' and p_value then
    raise exception using errcode = '22023', message = 'set_operational_flag: use enable_push_dispatch (gates)';
  end if;
  if p_key = 'push_dispatch_enabled' and not p_value then
    perform cron.alter_job((select jobid from cron.job where jobname = 'steelgo_push_dispatch'), active := false);
    update public.operational_flags f set value = false, reason = btrim(p_reason), updated_by = v_actor, updated_at = now(), request_id = p_request_id where f.key = 'sos_operational';
  end if;
  update public.operational_flags f set value = p_value, reason = btrim(p_reason), updated_by = v_actor, updated_at = now(), request_id = p_request_id where f.key = p_key;
  insert into public.trip_admin_actions (trip_id, admin_id, action, before_state, after_state, reason, request_id)
  values (null, v_actor, 'set_operational_flag', jsonb_build_object(p_key, v_old), jsonb_build_object(p_key, p_value), p_reason, p_request_id);
  insert into public.rpc_call_log (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('set_operational_flag', p_request_id, v_actor, null, v_fp, 'accepted');
  return query select p_key, p_value, false;
end $fn$;

-- -----------------------------------------------------------------------------
-- tick de despacho (chamado pelo job inativo): assina e envia SOMENTE se o segredo
-- existir no Vault e o flag estiver ligado. Corpo canonico construido UMA vez.
-- -----------------------------------------------------------------------------
create function public.run_push_dispatch_tick()
returns text language plpgsql security definer set search_path = '' as $fn$
declare v_secret text; v_url text; v_ts bigint; v_nonce uuid; v_body jsonb; v_body_txt text; v_sig text; v_req bigint;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'run_push_dispatch_tick: execucao restrita ao agendador';
  end if;
  if not public.operational_flag('push_dispatch_enabled') then return 'disabled'; end if;
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'steelgo_cron_secret';
  if v_secret is null or length(v_secret) < 32 then return 'no_secret'; end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'steelgo_push_dispatch_url';
  if v_url is null then return 'no_url'; end if;
  if not exists (select 1 from public.push_outbox o where (o.status = 'pending' and o.next_attempt_at <= now()) or (o.status = 'leased' and o.lease_expires_at < now())) then
    return 'idle';
  end if;
  v_ts := extract(epoch from now())::bigint;
  v_nonce := gen_random_uuid();
  v_body := jsonb_build_object('ts', v_ts, 'nonce', v_nonce, 'batch', 200);
  v_body_txt := v_body::text;   -- representacao canonica do jsonb; pg_net envia body::text
  v_sig := encode(extensions.hmac(convert_to(v_ts::text || '.' || v_nonce::text || '.' || v_body_txt, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex');
  select net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-steelgo-ts', v_ts::text, 'x-steelgo-nonce', v_nonce::text, 'x-steelgo-signature', 'v1=' || v_sig),
    body := v_body, timeout_milliseconds := 8000) into v_req;
  return 'posted:' || coalesce(v_req::text, '?');
end $fn$;

select cron.schedule('steelgo_push_dispatch', '15 seconds', $$select public.run_push_dispatch_tick()$$);
select cron.alter_job((select jobid from cron.job where jobname = 'steelgo_push_dispatch'), active := false);

-- housekeeping: nonces antigos e outbox obsoleta
select cron.unschedule('steelgo_cron_housekeeping');
select cron.schedule('steelgo_cron_housekeeping', '15 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '30 days';
    delete from public.scheduler_runs where started_at < now() - interval '1 year';
    delete from public.push_dispatch_nonces where seen_at < now() - interval '1 day';
    update public.push_outbox set status = 'skipped', last_error = 'stale' where status in ('pending', 'leased') and created_at < now() - interval '1 day';
    delete from public.push_outbox where status in ('sent', 'skipped', 'dead', 'failed') and created_at < now() - interval '30 days';
    update public.push_homologation set status = 'expired' where status in ('sent', 'fcm_accepted') and expires_at < now();
    insert into public.scheduler_runs (kind, finished_at, outcome) values ('housekeeping', now(), 'ok')$$);

-- -----------------------------------------------------------------------------
-- notify_trip v2: in-app (texto completo, apos login) + push (titulo fixo por
-- tipo + corpo do catalogo push_minimized_body; data = {kind, ref, link})
-- -----------------------------------------------------------------------------
create or replace function public.notify_trip(
  p_trip_id uuid, p_type text, p_title text, p_body text,
  p_to_shipper boolean, p_to_carrier boolean, p_to_driver boolean, p_to_admins boolean,
  p_exclude uuid default null, p_priority text default 'normal')
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  v_t public.operational_trips%rowtype; v_u uuid; v_n integer := 0; v_key text := gen_random_uuid()::text;
begin
  select * into v_t from public.operational_trips t where t.id = p_trip_id;
  if not found then return 0; end if;
  if p_to_shipper then
    for v_u in select * from public.company_operational_users(v_t.shipper_company_id) loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/shipper/trips/' || p_trip_id::text, null, v_t.contract_id);
        perform public.push_enqueue(v_u, p_trip_id, p_type, p_title, p_body, jsonb_build_object('kind', p_type, 'ref', p_trip_id, 'link', '/shipper/trips/' || p_trip_id::text), p_priority, v_key || ':' || v_u::text);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  if p_to_carrier then
    for v_u in select * from public.company_operational_users(v_t.carrier_company_id) loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/carrier/trips/' || p_trip_id::text, null, v_t.contract_id);
        perform public.push_enqueue(v_u, p_trip_id, p_type, p_title, p_body, jsonb_build_object('kind', p_type, 'ref', p_trip_id, 'link', '/carrier/trips/' || p_trip_id::text), p_priority, v_key || ':' || v_u::text);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  if p_to_driver then
    for v_u in select a.driver_profile_id from public.trip_assignments a where a.trip_id = p_trip_id and a.state in ('offered', 'accepted') loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/driver', null, v_t.contract_id);
        perform public.push_enqueue(v_u, p_trip_id, p_type, p_title, p_body, jsonb_build_object('kind', p_type, 'ref', p_trip_id, 'link', '/driver'), p_priority, v_key || ':' || v_u::text);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  if p_to_admins then
    for v_u in select ur.user_id from public.user_roles ur where ur.role = 'admin'::public.app_role loop
      if v_u is distinct from p_exclude then
        perform public.notify_user(v_u, p_type, p_title, p_body, '/admin/operations/' || p_trip_id::text, null, v_t.contract_id);
        perform public.push_enqueue(v_u, p_trip_id, p_type, p_title, p_body, jsonb_build_object('kind', p_type, 'ref', p_trip_id, 'link', '/admin/operations/' || p_trip_id::text), p_priority, v_key || ':' || v_u::text);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  return v_n;
end $fn$;

-- GRANTS
do $$
declare v_sig text;
begin
  foreach v_sig in array array['public.push_enqueue(uuid, uuid, text, text, text, jsonb, text, text)', 'public.revoke_push_devices_of(uuid, text)',
                                'public.push_activation_gates()', 'public.run_push_dispatch_tick()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array['public.claim_push_batch(integer, integer)', 'public.mark_push_result(bigint, uuid, text, jsonb, text, text[])',
                                'public.consume_push_nonce(uuid, bigint)', 'public.record_push_dispatch_run(integer, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
  end loop;
  foreach v_sig in array array['public.register_push_device(uuid, text, text, text, text)', 'public.revoke_push_device(uuid, text)',
                                'public.request_push_homologation(uuid)', 'public.ack_push_homologation(uuid, text, uuid)',
                                'public.get_push_activation_gates()', 'public.enable_push_dispatch(uuid)', 'public.set_operational_flag(text, boolean, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
