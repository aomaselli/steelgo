-- =============================================================================
-- MODULO 3 (Control Tower operacional) - 68/81: fundacao
--   * extensoes pg_cron e pg_net (scheduler aprovado; job de push nasce inativo
--     na 78; nenhum segredo e criado aqui);
--   * enums do modulo;
--   * operational_policies: limites operacionais VERSIONADOS e auditados. Nenhum
--     numero critico vive em RPC ou frontend; a viagem congela policy_version;
--   * privacy_notices: aviso de privacidade do motorista, versionado com hash e
--     vigencia. NASCE VAZIA: o texto e publicado por RPC administrativa depois
--     da aprovacao da fundadora. Sem aviso publicado nao ha aceite de viagem,
--     sessao de rastreamento nem ingestao de localizacao (gates nas RPCs);
--   * drivers: identidade canonica (id operacional, profile_id autenticacao);
--   * bids.driver_record_id, capacity_availability.reserved_by_trip_id.
-- =============================================================================
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
-- reflexo operacional no frete (matriz de eventos do frete e estendida na 74;
-- valores novos de enum precisam nascer em transacao separada do primeiro uso)
alter type public.freight_lifecycle_transition add value if not exists 'in_transit';
alter type public.freight_lifecycle_transition add value if not exists 'delivered';
alter type public.freight_lifecycle_transition add value if not exists 'completed';

create type public.trip_status as enum (
  'planned', 'assigned', 'driver_accepted', 'en_route_to_pickup', 'at_pickup',
  'loading', 'in_transit', 'at_delivery', 'unloading', 'returning',
  'delivered', 'returned', 'completed', 'cancelled');

create type public.trip_actor_kind as enum ('driver', 'carrier', 'shipper', 'admin', 'system');

create type public.trip_event_type as enum (
  'trip_created', 'policy_frozen',
  'assigned', 'reassigned', 'assignment_accepted', 'assignment_declined', 'assignment_revoked',
  'transition', 'checkpoint', 'transshipment_registered',
  'tracking_started', 'tracking_ended',
  'eta_reported',
  'exception_opened', 'exception_acknowledged', 'exception_resolved', 'exception_escalated',
  'sos_opened', 'sos_acknowledged', 'sos_escalated', 'sos_resolved',
  'document_added',
  'pod_submitted', 'pod_attempt_refused', 'pod_superseded', 'delivery_exception_resolved',
  'paused', 'resumed', 'cancelled', 'completed',
  'contract_terminal_hold', 'cargo_disposition_resolved', 'emergency_release',
  'admin_override', 'command_rejected',
  'alert_opened', 'alert_acknowledged', 'alert_closed',
  'legal_hold_set', 'legal_hold_released', 'raw_locations_purged',
  'notification_sent');

create type public.trip_assignment_state as enum ('offered', 'accepted', 'declined', 'superseded', 'revoked');

create type public.trip_checkpoint_kind as enum (
  'arrived_pickup', 'loading_started', 'loaded', 'departed_pickup', 'waypoint', 'border',
  'rest_stop', 'arrived_delivery', 'unloading_started', 'unloaded', 'transshipment',
  'return_receipt', 'custom');

create type public.trip_exception_kind as enum (
  'delay', 'cargo_damage', 'cargo_refusal', 'document_issue', 'vehicle_breakdown', 'accident',
  'theft', 'route_deviation', 'long_stop', 'comm_loss', 'delivery_mismatch', 'sos',
  'cargo_disposition_required', 'other');

create type public.trip_exception_status as enum (
  'open', 'acknowledged', 'in_progress', 'escalated', 'resolved', 'converted_to_dispute');

create type public.trip_exception_severity as enum ('low', 'medium', 'high', 'critical');

create type public.trip_alert_kind as enum (
  'no_update', 'late_eta', 'route_deviation', 'long_stop', 'no_progress', 'moving_away',
  'geofence_exit', 'low_battery', 'gps_anomaly', 'pod_outside_geofence', 'sos_ack_overdue',
  'cargo_without_progress', 'scheduler_stale', 'sos');

create type public.pod_outcome as enum ('accepted', 'accepted_with_notes', 'partially_refused', 'refused');

create type public.cargo_disposition as enum (
  'delivered_by_resolution', 'returned_to_origin', 'transferred_to_custodian', 'transshipped',
  'emergency_release');

create type public.delivery_exception_resolution as enum (
  'accept_delivery', 'retry_delivery', 'return_to_origin', 'transshipment', 'open_dispute');

create type public.trip_visibility as enum ('parties', 'carrier_admin', 'admin_only');

create type public.tracking_provider as enum ('web', 'community-dev', 'transistorsoft', 'unknown');


-- -----------------------------------------------------------------------------
-- 2. operational_policies (append-only; a versao corrente e a de maior version
--    com effective_from <= now())
-- -----------------------------------------------------------------------------
create table public.operational_policies (
  id                              uuid primary key default gen_random_uuid(),
  version                         integer not null unique check (version > 0),
  effective_from                  timestamptz not null default now(),
  created_by                      uuid references auth.users(id) on delete restrict,
  reason                          text not null check (length(btrim(reason)) >= 10),
  request_id                      uuid,
  geofence_radius_m               integer not null check (geofence_radius_m between 50 and 5000),
  location_silence_min_transit    integer not null check (location_silence_min_transit between 5 and 240),
  location_silence_min_stationary integer not null check (location_silence_min_stationary between 5 and 480),
  long_stop_min                   integer not null check (long_stop_min between 10 and 600),
  impossible_speed_kmh            integer not null check (impossible_speed_kmh between 80 and 300),
  clock_future_tolerance_min      integer not null check (clock_future_tolerance_min between 1 and 60),
  accuracy_primary_m              integer not null check (accuracy_primary_m between 10 and 1000),
  accuracy_reject_m               integer not null check (accuracy_reject_m >= accuracy_primary_m),
  raw_retention_days              integer not null check (raw_retention_days between 30 and 3650),
  legal_hold_tail_days            integer not null check (legal_hold_tail_days between 1 and 365),
  summary_retention_years         integer not null check (summary_retention_years between 1 and 20),
  sos_ack_target_min              integer not null check (sos_ack_target_min between 1 and 120),
  alert_ack_target_min            integer not null check (alert_ack_target_min between 1 and 1440),
  comm_loss_critical_min          integer not null check (comm_loss_critical_min between 30 and 1440),
  eta_fallback_speed_kmh          integer not null check (eta_fallback_speed_kmh between 20 and 120),
  eta_route_factor                numeric not null check (eta_route_factor between 1.0 and 2.0),
  location_batch_max_points       integer not null check (location_batch_max_points between 10 and 500),
  location_max_age_hours          integer not null check (location_max_age_hours between 1 and 168),
  moving_away_min_km              numeric not null check (moving_away_min_km between 1 and 200),
  no_progress_min                 integer not null check (no_progress_min between 10 and 600),
  created_at                      timestamptz not null default now()
);
comment on table public.operational_policies is
  'Limites operacionais versionados (M3). Append-only: cada mudanca e uma nova versao; '
  'a viagem congela policy_version na criacao e nunca e afetada retroativamente.';

alter table public.operational_policies enable row level security;
revoke all on public.operational_policies from public, anon, authenticated, service_role;
grant select on public.operational_policies to service_role;

create function public.operational_policies_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501',
    message = 'public.operational_policies e append-only: publique uma nova versao';
end $fn$;
create trigger operational_policies_no_update before update or delete on public.operational_policies
  for each row execute function public.operational_policies_block_mutation();

-- valores iniciais aprovados (versao 1)
insert into public.operational_policies (
  version, reason, geofence_radius_m, location_silence_min_transit, location_silence_min_stationary,
  long_stop_min, impossible_speed_kmh, clock_future_tolerance_min, accuracy_primary_m, accuracy_reject_m,
  raw_retention_days, legal_hold_tail_days, summary_retention_years, sos_ack_target_min,
  alert_ack_target_min, comm_loss_critical_min, eta_fallback_speed_kmh, eta_route_factor,
  location_batch_max_points, location_max_age_hours, moving_away_min_km, no_progress_min)
values (
  1, 'Politica operacional inicial do Modulo 3 (valores aprovados pela fundadora em 2026-09-16).',
  300, 20, 30, 45, 150, 5, 100, 500, 90, 30, 5, 5, 15, 120, 60, 1.3, 200, 72, 5, 30);

create function public.current_operational_policy()
returns public.operational_policies
language sql stable security definer set search_path = '' as $fn$
  select p from public.operational_policies p
   where p.effective_from <= now()
   order by p.version desc limit 1;
$fn$;
revoke all on function public.current_operational_policy() from public, anon, authenticated, service_role;

create function public.operational_policy_version(p_version integer)
returns public.operational_policies
language sql stable security definer set search_path = '' as $fn$
  select p from public.operational_policies p where p.version = p_version;
$fn$;
revoke all on function public.operational_policy_version(integer) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. privacy_notices (vazia ate publicacao explicita por RPC administrativa)
-- -----------------------------------------------------------------------------
create table public.privacy_notices (
  id             uuid primary key default gen_random_uuid(),
  version        text not null unique check (version ~ '^[0-9]+(\.[0-9]+)*$'),
  body_md        text not null check (length(body_md) >= 500),
  body_sha256    text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  url            text,
  effective_from timestamptz not null,
  published_by   uuid not null references auth.users(id) on delete restrict,
  published_at   timestamptz not null default now(),
  request_id     uuid not null,
  legal_basis    text not null default 'execucao_contratual;legitimo_interesse;protecao_da_vida'
);
comment on table public.privacy_notices is
  'Aviso de privacidade do motorista (M3), versionado com hash SHA-256 do texto e vigencia. '
  'NASCE VAZIA: nenhum texto placeholder e gravado por migration; a publicacao e ato '
  'administrativo explicito apos aprovacao. Sem aviso vigente nao ha rastreamento.';
alter table public.privacy_notices enable row level security;
revoke all on public.privacy_notices from public, anon, authenticated, service_role;
grant select on public.privacy_notices to service_role;

create function public.privacy_notices_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501',
    message = 'public.privacy_notices e append-only: publique uma nova versao';
end $fn$;
create trigger privacy_notices_no_update before update or delete on public.privacy_notices
  for each row execute function public.privacy_notices_block_mutation();

create function public.current_privacy_notice()
returns public.privacy_notices
language sql stable security definer set search_path = '' as $fn$
  select n from public.privacy_notices n
   where n.effective_from <= now()
   order by n.effective_from desc, n.published_at desc limit 1;
$fn$;
revoke all on function public.current_privacy_notice() from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. drivers: identidade canonica
--    id = identidade operacional; profile_id = autenticacao (unico global).
-- -----------------------------------------------------------------------------
alter table public.drivers
  add column privacy_notice_version         text,
  add column privacy_notice_sha256          text check (privacy_notice_sha256 is null or privacy_notice_sha256 ~ '^[0-9a-f]{64}$'),
  add column privacy_notice_acknowledged_at timestamptz,
  add constraint drivers_privacy_notice_coherent check (
    (privacy_notice_version is null) = (privacy_notice_acknowledged_at is null)
    and (privacy_notice_version is null) = (privacy_notice_sha256 is null));

do $$
declare v_dups integer;
begin
  select count(*) into v_dups from (
    select profile_id from public.drivers where profile_id is not null group by 1 having count(*) > 1) d;
  if v_dups > 0 then
    raise exception 'M3: % profile_id duplicados em public.drivers; a unicidade global exige saneamento manual antes desta migration', v_dups;
  end if;
end $$;

create unique index drivers_profile_id_unique on public.drivers (profile_id) where profile_id is not null;
alter table public.drivers add constraint drivers_id_profile_unique unique (id, profile_id);

-- -----------------------------------------------------------------------------
-- 5. bids: rastreabilidade do registro operacional do motorista
--    (bids.driver_id mantem a FK para auth.users; e preenchido pela RPC place_bid
--     com drivers.profile_id; o frontend nunca escolhe qual id gravar)
-- -----------------------------------------------------------------------------
alter table public.bids
  add column driver_record_id uuid references public.drivers(id) on delete restrict,
  add constraint bids_driver_record_matches_profile
    foreign key (driver_record_id, driver_id) references public.drivers(id, profile_id);

-- -----------------------------------------------------------------------------
-- 6. capacity_availability: reserva por viagem
-- -----------------------------------------------------------------------------
alter table public.capacity_availability
  add column reserved_by_trip_id uuid;
-- FK para operational_trips e adicionada na 69 (tabela criada la)

commit;
