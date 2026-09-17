-- =============================================================================
-- MODULO 3 - 70/81: trip_events (trilha append-only) e trip_event_append
--   * seq por viagem; command_id imutavel por comando offline (dedup);
--   * captured_at (aparelho) x received_at (servidor);
--   * payload sem dados pessoais (regra de projeto; RPCs so gravam ids/rotulos);
--   * UPDATE/DELETE bloqueados por trigger; DML so via helper postgres-only.
-- =============================================================================
begin;

create table public.trip_events (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.operational_trips(id) on delete restrict,
  seq                   bigint not null,
  event_type            public.trip_event_type not null,
  from_status           public.trip_status,
  to_status             public.trip_status,
  actor_id              uuid references auth.users(id) on delete restrict,
  actor_kind            public.trip_actor_kind not null,
  assignment_id         uuid references public.trip_assignments(id),
  checkpoint_id         uuid,
  exception_id          uuid,
  document_id           uuid,
  pod_id                uuid,
  alert_id              uuid,
  command_id            uuid,
  device_id             uuid,
  seq_device            bigint,
  captured_at           timestamptz,
  received_at           timestamptz not null default now(),
  geog                  extensions.geography(Point, 4326),
  accuracy_m            numeric,
  note                  text,
  internal_note         text,
  payload               jsonb not null default '{}'::jsonb,
  rpc_name              text not null,
  request_id            uuid,
  params_fingerprint    text,
  created_at            timestamptz not null default now(),
  unique (trip_id, seq),
  constraint trip_events_command_unique unique (trip_id, command_id),
  constraint trip_events_id_trip_unique unique (id, trip_id),
  constraint trip_events_capture_not_future check (
    captured_at is null or captured_at <= received_at + interval '6 hours'),
  constraint trip_events_transition_shape check (
    event_type <> 'transition' or (from_status is not null and to_status is not null))
);
create index trip_events_trip_created_idx on public.trip_events (trip_id, created_at);
create index trip_events_type_idx on public.trip_events (event_type);
create unique index trip_events_request_unique
  on public.trip_events (request_id, trip_id, event_type) where request_id is not null;

alter table public.trip_events enable row level security;
revoke all on public.trip_events from public, anon, authenticated, service_role;
grant select on public.trip_events to service_role;

alter table public.operational_trips
  add constraint operational_trips_last_event_fk
  foreign key (last_event_id, id) references public.trip_events (id, trip_id)
  deferrable initially deferred;

create function public.trip_events_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'public.trip_events e append-only';
end $fn$;
create trigger trip_events_no_update before update or delete on public.trip_events
  for each row execute function public.trip_events_block_mutation();

-- -----------------------------------------------------------------------------
-- trip_event_append: unico escritor. Exige que o chamador ja tenha a viagem
-- travada (FOR UPDATE) - o seq e derivado sob essa trava. Atualiza
-- operational_trips.last_event_id (e status quando e transicao).
-- -----------------------------------------------------------------------------
create function public.trip_event_append(
  p_trip_id        uuid,
  p_event_type     public.trip_event_type,
  p_actor_id       uuid,
  p_actor_kind     public.trip_actor_kind,
  p_rpc_name       text,
  p_from_status    public.trip_status default null,
  p_to_status      public.trip_status default null,
  p_note           text default null,
  p_payload        jsonb default '{}'::jsonb,
  p_command_id     uuid default null,
  p_device_id      uuid default null,
  p_seq_device     bigint default null,
  p_captured_at    timestamptz default null,
  p_lat            numeric default null,
  p_lng            numeric default null,
  p_accuracy_m     numeric default null,
  p_assignment_id  uuid default null,
  p_checkpoint_id  uuid default null,
  p_exception_id   uuid default null,
  p_document_id    uuid default null,
  p_pod_id         uuid default null,
  p_alert_id       uuid default null,
  p_request_id     uuid default null,
  p_fingerprint    text default null,
  p_internal_note  text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_seq bigint;
  v_id  uuid;
  v_geog extensions.geography;
begin
  if p_trip_id is null or p_event_type is null or p_actor_kind is null or p_rpc_name is null then
    raise exception using errcode = '22004', message = 'trip_event_append: parametros obrigatorios ausentes';
  end if;
  if p_payload is not null and (p_payload ? 'cpf' or p_payload ? 'cnh' or p_payload ? 'phone' or p_payload ? 'email') then
    raise exception using errcode = '22023', message = 'trip_event_append: payload nao pode conter dados pessoais';
  end if;
  if p_lat is not null and p_lng is not null then
    v_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  select coalesce(max(e.seq), 0) + 1 into v_seq from public.trip_events e where e.trip_id = p_trip_id;
  insert into public.trip_events (
    trip_id, seq, event_type, from_status, to_status, actor_id, actor_kind, assignment_id,
    checkpoint_id, exception_id, document_id, pod_id, alert_id, command_id, device_id, seq_device,
    captured_at, geog, accuracy_m, note, internal_note, payload, rpc_name, request_id, params_fingerprint)
  values (
    p_trip_id, v_seq, p_event_type, p_from_status, p_to_status, p_actor_id, p_actor_kind, p_assignment_id,
    p_checkpoint_id, p_exception_id, p_document_id, p_pod_id, p_alert_id, p_command_id, p_device_id, p_seq_device,
    p_captured_at, v_geog, p_accuracy_m, p_note, p_internal_note, coalesce(p_payload, '{}'::jsonb), p_rpc_name,
    p_request_id, p_fingerprint)
  returning id into v_id;

  if p_event_type = 'transition' then
    update public.operational_trips t
       set status = p_to_status, previous_status = p_from_status, last_event_id = v_id
     where t.id = p_trip_id;
  else
    update public.operational_trips t set last_event_id = v_id where t.id = p_trip_id;
  end if;
  return v_id;
end $fn$;
revoke all on function public.trip_event_append(uuid, public.trip_event_type, uuid, public.trip_actor_kind, text,
  public.trip_status, public.trip_status, text, jsonb, uuid, uuid, bigint, timestamptz, numeric, numeric, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;

commit;
