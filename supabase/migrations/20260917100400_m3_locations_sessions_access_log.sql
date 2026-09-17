-- =============================================================================
-- MODULO 3 - 72/81: trip_locations (bruto), trip_location_summaries (agregado),
--   trip_tracking_sessions (inicio/fim do rastreamento + aviso de privacidade),
--   trip_access_log (toda leitura de trilha/posicao/midia e auditada)
--   Base legal: execucao contratual, legitimo interesse documentado e protecao
--   da vida (SOS). NAO e consentimento. Nenhuma coleta fora de viagem ativa.
-- =============================================================================
begin;

create table public.trip_tracking_sessions (
  id                             uuid primary key default gen_random_uuid(),
  trip_id                        uuid not null references public.operational_trips(id) on delete restrict,
  assignment_id                  uuid not null references public.trip_assignments(id),
  driver_id                      uuid not null references public.drivers(id),
  device_id                      uuid not null,
  platform                       text not null check (platform in ('web', 'android', 'ios')),
  provider                       public.tracking_provider not null,
  app_version                    text,
  privacy_notice_version         text not null,
  privacy_notice_sha256          text not null check (privacy_notice_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_notice_acknowledged_at timestamptz not null,
  started_at                     timestamptz not null default now(),
  ended_at                       timestamptz,
  end_reason                     text check (end_reason is null or end_reason in (
                                   'delivered', 'returned', 'cancelled', 'reassigned', 'driver_stopped',
                                   'timeout', 'paused', 'contract_terminal')),
  points_received                integer not null default 0,
  last_point_at                  timestamptz,
  created_at                     timestamptz not null default now(),
  constraint tracking_sessions_end_coherent check ((ended_at is null) = (end_reason is null)),
  constraint tracking_sessions_notice_fk foreign key (privacy_notice_version) references public.privacy_notices(version)
);
create unique index trip_tracking_sessions_one_open_per_device on public.trip_tracking_sessions (trip_id, device_id) where ended_at is null;
create index trip_tracking_sessions_trip_idx on public.trip_tracking_sessions (trip_id, started_at);
alter table public.trip_tracking_sessions enable row level security;
revoke all on public.trip_tracking_sessions from public, anon, authenticated, service_role;
grant select on public.trip_tracking_sessions to service_role;

-- -----------------------------------------------------------------------------
create table public.trip_locations (
  trip_id       uuid not null references public.operational_trips(id) on delete restrict,
  device_id     uuid not null,
  seq_device    bigint not null,
  session_id    uuid not null references public.trip_tracking_sessions(id),
  batch_id      uuid not null,
  captured_at   timestamptz not null,
  received_at   timestamptz not null default now(),
  geog          extensions.geography(Point, 4326) not null,
  accuracy_m    numeric not null check (accuracy_m >= 0),
  speed_mps     numeric check (speed_mps is null or speed_mps >= 0),
  heading       numeric check (heading is null or heading between 0 and 360),
  altitude_m    numeric,
  battery_pct   integer check (battery_pct is null or battery_pct between 0 and 100),
  is_moving     boolean,
  flags         text[] not null default '{}',
  accepted      boolean not null,
  primary key (trip_id, device_id, seq_device)
);
create index trip_locations_trip_time_idx on public.trip_locations (trip_id, captured_at) where accepted;
create index trip_locations_geog_gix on public.trip_locations using gist (geog);
alter table public.trip_locations enable row level security;
revoke all on public.trip_locations from public, anon, authenticated, service_role;
grant select on public.trip_locations to service_role;
create function public.trip_locations_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if TG_OP = 'DELETE' and current_setting('steelgo.purge_context', true) = ('purge:' || OLD.trip_id::text) then
    return OLD;
  end if;
  raise exception using errcode = '42501',
    message = 'public.trip_locations: append-only; exclusao so pela RPC de purga governada';
end $fn$;
create trigger trip_locations_no_update before update or delete on public.trip_locations
  for each row execute function public.trip_locations_block_mutation();

-- -----------------------------------------------------------------------------
create table public.trip_location_summaries (
  trip_id        uuid not null references public.operational_trips(id) on delete restrict,
  hour_bucket    timestamptz not null,
  n_points       integer not null,
  n_accepted     integer not null,
  path_simplified extensions.geography(LineString, 4326),
  distance_km    numeric not null default 0,
  avg_speed_kmh  numeric,
  max_speed_kmh  numeric,
  stops_count    integer not null default 0,
  first_at       timestamptz not null,
  last_at        timestamptz not null,
  created_at     timestamptz not null default now(),
  primary key (trip_id, hour_bucket)
);
alter table public.trip_location_summaries enable row level security;
revoke all on public.trip_location_summaries from public, anon, authenticated, service_role;
grant select on public.trip_location_summaries to service_role;

-- -----------------------------------------------------------------------------
create table public.trip_access_log (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null,
  actor_id    uuid,
  actor_kind  public.trip_actor_kind not null,
  what        text not null check (what in ('position', 'track_raw', 'track_summary', 'media', 'pod', 'timeline', 'export')),
  object_ref  text,
  rpc_name    text not null,
  at          timestamptz not null default now()
);
create index trip_access_log_trip_idx on public.trip_access_log (trip_id, at);
alter table public.trip_access_log enable row level security;
revoke all on public.trip_access_log from public, anon, authenticated, service_role;
grant select on public.trip_access_log to service_role;
create function public.trip_access_log_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'trip_access_log e append-only';
end $fn$;
create trigger trip_access_log_no_update before update or delete on public.trip_access_log
  for each row execute function public.trip_access_log_block_mutation();

create function public.trip_access_append(p_trip_id uuid, p_actor_id uuid, p_actor_kind public.trip_actor_kind,
                                          p_what text, p_object_ref text, p_rpc_name text)
returns void language sql security definer set search_path = '' as $fn$
  insert into public.trip_access_log (trip_id, actor_id, actor_kind, what, object_ref, rpc_name)
  values (p_trip_id, p_actor_id, p_actor_kind, p_what, p_object_ref, p_rpc_name);
$fn$;
revoke all on function public.trip_access_append(uuid, uuid, public.trip_actor_kind, text, text, text)
  from public, anon, authenticated, service_role;

commit;
