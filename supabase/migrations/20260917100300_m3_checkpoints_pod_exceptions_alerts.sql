-- =============================================================================
-- MODULO 3 - 71/81: trip_checkpoints, trip_documents, proof_of_delivery (+attempts),
--   trip_exceptions (+evidence), operational_alerts, trip_admin_actions,
--   trip_operational_facts, cargo_dispositions
--   * POD aceita e imutavel e versionada (supersede so por admin, preservando);
--   * POD recusada/parcial NAO e entrega: vira tentativa + excecao high;
--   * recebedor: nome, tipo opcional, ultimos 4; NUNCA documento integral nem hash;
--   * M3 grava FATOS operacionais (distancia/duracao/paradas/qualidade), nunca emissao.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
create table public.trip_checkpoints (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.operational_trips(id) on delete restrict,
  kind                 public.trip_checkpoint_kind not null,
  seq                  integer not null,
  actor_id             uuid not null references auth.users(id) on delete restrict,
  actor_kind           public.trip_actor_kind not null,
  captured_at          timestamptz not null,
  received_at          timestamptz not null default now(),
  geog                 extensions.geography(Point, 4326),
  accuracy_m           numeric check (accuracy_m is null or accuracy_m >= 0),
  inside_geofence      boolean,
  distance_to_target_m numeric,
  geofence_override_reason text,
  photo_object_path    text,
  photo_sha256         text check (photo_sha256 is null or photo_sha256 ~ '^[0-9a-f]{64}$'),
  photo_size_bytes     bigint,
  photo_mime           text,
  seal_code            text,
  seal_verified        boolean,
  note                 text,
  command_id           uuid,
  device_id            uuid,
  event_id             uuid,
  created_at           timestamptz not null default now(),
  unique (trip_id, seq),
  constraint trip_checkpoints_command_unique unique (trip_id, command_id),
  constraint trip_checkpoints_photo_coherent check (
    (photo_object_path is null) = (photo_sha256 is null)
    and (photo_object_path is null) = (photo_size_bytes is null)),
  constraint trip_checkpoints_evidence_required check (
    kind not in ('loaded', 'unloaded', 'transshipment', 'return_receipt') or photo_object_path is not null)
);
create index trip_checkpoints_trip_idx on public.trip_checkpoints (trip_id, captured_at);
create unique index trip_checkpoints_photo_unique on public.trip_checkpoints (photo_object_path) where photo_object_path is not null;
alter table public.trip_checkpoints enable row level security;
revoke all on public.trip_checkpoints from public, anon, authenticated, service_role;
grant select on public.trip_checkpoints to service_role;

-- -----------------------------------------------------------------------------
create table public.trip_documents (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.operational_trips(id) on delete restrict,
  kind             text not null check (kind in ('cte', 'mdfe', 'nfe', 'dacte', 'insurance', 'report', 'receipt', 'other')),
  number           text,
  object_path      text not null unique,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes       bigint not null check (size_bytes > 0),
  mime             text not null,
  issued_at        timestamptz,
  uploaded_by      uuid not null references auth.users(id) on delete restrict,
  uploaded_by_kind public.trip_actor_kind not null,
  visibility       public.trip_visibility not null default 'parties',
  superseded_by    uuid references public.trip_documents(id),
  superseded_at    timestamptz,
  note             text,
  request_id       uuid not null,
  event_id         uuid,
  created_at       timestamptz not null default now()
);
create unique index trip_documents_current_number on public.trip_documents (trip_id, kind, number)
  where superseded_by is null and number is not null;
alter table public.trip_documents enable row level security;
revoke all on public.trip_documents from public, anon, authenticated, service_role;
grant select on public.trip_documents to service_role;

-- -----------------------------------------------------------------------------
-- proof_of_delivery: SOMENTE desfechos aceitos. Versionada.
-- -----------------------------------------------------------------------------
create table public.proof_of_delivery (
  id                       uuid primary key default gen_random_uuid(),
  trip_id                  uuid not null references public.operational_trips(id) on delete restrict,
  version                  integer not null check (version >= 1),
  is_current               boolean not null default true,
  supersedes_id            uuid references public.proof_of_delivery(id),
  superseded_at            timestamptz,
  superseded_by            uuid references auth.users(id),
  supersede_reason         text,
  derived_from_attempt_id  uuid,
  checkpoint_id            uuid references public.trip_checkpoints(id),
  outcome                  public.pod_outcome not null check (outcome in ('accepted', 'accepted_with_notes')),
  receiver_name            text not null check (length(btrim(receiver_name)) between 2 and 120),
  receiver_document_kind   text check (receiver_document_kind is null or receiver_document_kind in ('cpf', 'rg', 'cnh', 'passport', 'other')),
  receiver_document_last4  text check (receiver_document_last4 is null or receiver_document_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  signature_object_path    text not null,
  signature_sha256         text not null check (signature_sha256 ~ '^[0-9a-f]{64}$'),
  photos                   jsonb not null,
  quantity_declared        numeric,
  quantity_received        numeric,
  notes                    text,
  delivered_at             timestamptz not null,
  received_at              timestamptz not null default now(),
  geog                     extensions.geography(Point, 4326),
  accuracy_m               numeric,
  inside_geofence          boolean not null,
  geofence_override_reason text,
  submitted_by             uuid not null references auth.users(id) on delete restrict,
  submitted_by_kind        public.trip_actor_kind not null,
  command_id               uuid,
  device_id                uuid,
  event_id                 uuid,
  request_id               uuid,
  created_at               timestamptz not null default now(),
  unique (trip_id, version),
  constraint pod_photos_shape check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) >= 1),
  constraint pod_geofence_or_reason check (inside_geofence or length(btrim(geofence_override_reason)) >= 20),
  constraint pod_supersede_coherent check (
    (supersedes_id is null) = (supersede_reason is null) and (is_current or superseded_at is not null)),
  constraint pod_notes_when_noted check (outcome <> 'accepted_with_notes' or length(btrim(notes)) >= 10)
);
create unique index proof_of_delivery_current on public.proof_of_delivery (trip_id) where is_current;
create unique index proof_of_delivery_command on public.proof_of_delivery (trip_id, command_id) where command_id is not null;
alter table public.proof_of_delivery enable row level security;
revoke all on public.proof_of_delivery from public, anon, authenticated, service_role;
grant select on public.proof_of_delivery to service_role;

create function public.proof_of_delivery_guard_update()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  -- vinculo do evento de criacao (uma unica vez, logo apos o insert)
  if OLD.event_id is null and NEW.event_id is not null
     and (to_jsonb(NEW) - 'event_id') = (to_jsonb(OLD) - 'event_id') then
    return NEW;
  end if;
  -- unica outra mutacao permitida: fechar a versao corrente ao ser substituida
  if not (OLD.is_current and not NEW.is_current
          and NEW.superseded_at is not null and NEW.superseded_by is not null
          and row(NEW.trip_id, NEW.version, NEW.outcome, NEW.receiver_name, NEW.signature_object_path,
                  NEW.signature_sha256, NEW.photos, NEW.delivered_at, NEW.submitted_by, NEW.notes,
                  NEW.quantity_declared, NEW.quantity_received, NEW.geog::text, NEW.inside_geofence)
              is not distinct from
              row(OLD.trip_id, OLD.version, OLD.outcome, OLD.receiver_name, OLD.signature_object_path,
                  OLD.signature_sha256, OLD.photos, OLD.delivered_at, OLD.submitted_by, OLD.notes,
                  OLD.quantity_declared, OLD.quantity_received, OLD.geog::text, OLD.inside_geofence)) then
    raise exception using errcode = '42501',
      message = 'proof_of_delivery: a POD e imutavel; substituicao preserva a versao anterior';
  end if;
  return NEW;
end $fn$;
create trigger proof_of_delivery_guard_update_trg before update on public.proof_of_delivery
  for each row execute function public.proof_of_delivery_guard_update();
create function public.proof_of_delivery_block_delete()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'proof_of_delivery: nao e apagada';
end $fn$;
create trigger proof_of_delivery_block_delete_trg before delete on public.proof_of_delivery
  for each row execute function public.proof_of_delivery_block_delete();

-- tentativas recusadas/parciais (append-only)
create table public.proof_of_delivery_attempts (
  id                       uuid primary key default gen_random_uuid(),
  trip_id                  uuid not null references public.operational_trips(id) on delete restrict,
  attempt_seq              integer not null,
  outcome                  public.pod_outcome not null check (outcome in ('partially_refused', 'refused')),
  receiver_name            text check (receiver_name is null or length(btrim(receiver_name)) between 2 and 120),
  receiver_document_kind   text check (receiver_document_kind is null or receiver_document_kind in ('cpf', 'rg', 'cnh', 'passport', 'other')),
  receiver_document_last4  text check (receiver_document_last4 is null or receiver_document_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  signature_object_path    text,
  signature_sha256         text check (signature_sha256 is null or signature_sha256 ~ '^[0-9a-f]{64}$'),
  photos                   jsonb not null,
  quantity_declared        numeric,
  quantity_received        numeric,
  notes                    text not null check (length(btrim(notes)) >= 20),
  captured_at              timestamptz not null,
  received_at              timestamptz not null default now(),
  geog                     extensions.geography(Point, 4326),
  accuracy_m               numeric,
  inside_geofence          boolean not null,
  geofence_override_reason text,
  submitted_by             uuid not null references auth.users(id) on delete restrict,
  exception_id             uuid,
  command_id               uuid,
  device_id                uuid,
  event_id                 uuid,
  created_at               timestamptz not null default now(),
  unique (trip_id, attempt_seq),
  constraint pod_attempt_photos check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) >= 1),
  constraint pod_attempt_geofence_or_reason check (inside_geofence or length(btrim(geofence_override_reason)) >= 20)
);
create unique index pod_attempts_command on public.proof_of_delivery_attempts (trip_id, command_id) where command_id is not null;
alter table public.proof_of_delivery_attempts enable row level security;
revoke all on public.proof_of_delivery_attempts from public, anon, authenticated, service_role;
grant select on public.proof_of_delivery_attempts to service_role;
create function public.pod_attempts_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if TG_OP = 'UPDATE' and OLD.event_id is null and NEW.event_id is not null then
    return NEW; -- vinculo do evento de criacao, uma unica vez
  end if;
  raise exception using errcode = '42501', message = 'proof_of_delivery_attempts e append-only';
end $fn$;
create trigger pod_attempts_no_update before update or delete on public.proof_of_delivery_attempts
  for each row execute function public.pod_attempts_block_mutation();

-- -----------------------------------------------------------------------------
create table public.trip_exceptions (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.operational_trips(id) on delete restrict,
  kind                  public.trip_exception_kind not null,
  severity              public.trip_exception_severity not null,
  status                public.trip_exception_status not null default 'open',
  opened_by             uuid references auth.users(id) on delete restrict,
  opened_by_kind        public.trip_actor_kind not null,
  captured_at           timestamptz not null,
  received_at           timestamptz not null default now(),
  geog                  extensions.geography(Point, 4326),
  description           text not null check (length(btrim(description)) >= 10),
  visibility            public.trip_visibility not null default 'parties',
  assigned_admin        uuid references auth.users(id),
  acknowledged_at       timestamptz,
  acknowledged_by       uuid references auth.users(id),
  acknowledged_by_kind  public.trip_actor_kind,
  ack_target_at         timestamptz,
  escalation_level      integer not null default 0 check (escalation_level between 0 and 2),
  escalated_at          timestamptz,
  resolved_at           timestamptz,
  resolved_by           uuid references auth.users(id),
  resolution_kind       text,
  resolution_note       text,
  dispute_case_id       uuid references public.dispute_cases(id),
  blocks_delivery       boolean not null default false,
  pauses_trip           boolean not null default false,
  command_id            uuid,
  device_id             uuid,
  event_id              uuid,
  request_id            uuid,
  created_at            timestamptz not null default now(),
  constraint trip_exceptions_resolution_shape check (
    (status in ('resolved', 'converted_to_dispute')) = (resolved_at is not null)
    and (status <> 'resolved' or length(btrim(resolution_note)) >= 20)
    and (status <> 'converted_to_dispute' or dispute_case_id is not null))
);
create unique index trip_exceptions_command on public.trip_exceptions (trip_id, command_id) where command_id is not null;
create unique index trip_exceptions_one_open_sos on public.trip_exceptions (trip_id)
  where kind = 'sos' and status not in ('resolved', 'converted_to_dispute');
create unique index trip_exceptions_one_open_disposition on public.trip_exceptions (trip_id)
  where kind = 'cargo_disposition_required' and status not in ('resolved', 'converted_to_dispute');
create index trip_exceptions_open_idx on public.trip_exceptions (status, severity, ack_target_at)
  where status not in ('resolved', 'converted_to_dispute');
alter table public.trip_exceptions enable row level security;
revoke all on public.trip_exceptions from public, anon, authenticated, service_role;
grant select on public.trip_exceptions to service_role;

create function public.trip_exceptions_guard_update()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if NEW.trip_id <> OLD.trip_id or NEW.kind <> OLD.kind or NEW.opened_by is distinct from OLD.opened_by
     or NEW.captured_at <> OLD.captured_at or NEW.description <> OLD.description then
    raise exception using errcode = '42501', message = 'trip_exceptions: fatos de abertura sao imutaveis';
  end if;
  if OLD.status in ('resolved', 'converted_to_dispute') then
    raise exception using errcode = '42501', message = 'trip_exceptions: excecao encerrada nao reabre';
  end if;
  return NEW;
end $fn$;
create trigger trip_exceptions_guard_update_trg before update on public.trip_exceptions
  for each row execute function public.trip_exceptions_guard_update();
create function public.trip_exceptions_block_delete()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'trip_exceptions: nao sao apagadas';
end $fn$;
create trigger trip_exceptions_block_delete_trg before delete on public.trip_exceptions
  for each row execute function public.trip_exceptions_block_delete();

alter table public.operational_trips
  add constraint operational_trips_paused_exception_fk
  foreign key (paused_by_exception_id) references public.trip_exceptions(id);
alter table public.proof_of_delivery_attempts
  add constraint pod_attempts_exception_fk foreign key (exception_id) references public.trip_exceptions(id);

create table public.trip_exception_evidence (
  id            uuid primary key default gen_random_uuid(),
  exception_id  uuid not null references public.trip_exceptions(id) on delete restrict,
  object_path   text not null unique,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    bigint not null check (size_bytes > 0),
  mime          text not null,
  captured_at   timestamptz,
  uploaded_by   uuid not null references auth.users(id) on delete restrict,
  created_at    timestamptz not null default now()
);
alter table public.trip_exception_evidence enable row level security;
revoke all on public.trip_exception_evidence from public, anon, authenticated, service_role;
grant select on public.trip_exception_evidence to service_role;

-- -----------------------------------------------------------------------------
create table public.operational_alerts (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.operational_trips(id) on delete restrict,
  kind          public.trip_alert_kind not null,
  severity      public.trip_exception_severity not null,
  status        text not null default 'open' check (status in ('open', 'acknowledged', 'closed')),
  detected_at   timestamptz not null default now(),
  details       jsonb not null default '{}'::jsonb,
  policy_version integer not null references public.operational_policies(version),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  ack_note      text,
  closed_at     timestamptz,
  close_reason  text,
  exception_id  uuid references public.trip_exceptions(id),
  last_evaluated_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create unique index operational_alerts_one_open on public.operational_alerts (trip_id, kind) where status <> 'closed';
create index operational_alerts_open_idx on public.operational_alerts (status, severity, detected_at) where status <> 'closed';
alter table public.operational_alerts enable row level security;
revoke all on public.operational_alerts from public, anon, authenticated, service_role;
grant select on public.operational_alerts to service_role;

-- -----------------------------------------------------------------------------
create table public.trip_admin_actions (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid references public.operational_trips(id) on delete restrict,
  admin_id    uuid not null references auth.users(id) on delete restrict,
  action      text not null,
  before_state jsonb,
  after_state  jsonb,
  reason      text not null check (length(btrim(reason)) >= 10),
  request_id  uuid not null,
  created_at  timestamptz not null default now()
);
create index trip_admin_actions_trip_idx on public.trip_admin_actions (trip_id, created_at);
alter table public.trip_admin_actions enable row level security;
revoke all on public.trip_admin_actions from public, anon, authenticated, service_role;
grant select on public.trip_admin_actions to service_role;
create function public.trip_admin_actions_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'trip_admin_actions e append-only';
end $fn$;
create trigger trip_admin_actions_no_update before update or delete on public.trip_admin_actions
  for each row execute function public.trip_admin_actions_block_mutation();

-- -----------------------------------------------------------------------------
-- cargo_dispositions: resolucao explicita de custodia apos encerramento contratual
-- -----------------------------------------------------------------------------
create table public.cargo_dispositions (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.operational_trips(id) on delete restrict,
  exception_id   uuid not null references public.trip_exceptions(id),
  disposition    public.cargo_disposition not null,
  reason         text not null check (length(btrim(reason)) >= 20),
  note           text not null check (length(btrim(note)) >= 20),
  occurred_at    timestamptz not null,
  geog           extensions.geography(Point, 4326),
  location_text  text,
  custodian_label text,
  evidence       jsonb not null default '[]'::jsonb,
  is_emergency   boolean not null default false,
  admin_id       uuid not null references auth.users(id) on delete restrict,
  request_id     uuid not null unique,
  event_id       uuid,
  created_at     timestamptz not null default now(),
  constraint cargo_dispositions_evidence_shape check (jsonb_typeof(evidence) = 'array'),
  constraint cargo_dispositions_emergency_evidence check (
    not is_emergency or (jsonb_array_length(evidence) >= 1 and length(btrim(reason)) >= 50)),
  constraint cargo_dispositions_custodian check (
    disposition <> 'transferred_to_custodian' or length(btrim(custodian_label)) >= 3)
);
create unique index cargo_dispositions_one_per_trip on public.cargo_dispositions (trip_id);
alter table public.cargo_dispositions enable row level security;
revoke all on public.cargo_dispositions from public, anon, authenticated, service_role;
grant select on public.cargo_dispositions to service_role;
create function public.cargo_dispositions_block_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'cargo_dispositions e append-only';
end $fn$;
create trigger cargo_dispositions_no_update before update or delete on public.cargo_dispositions
  for each row execute function public.cargo_dispositions_block_mutation();

-- -----------------------------------------------------------------------------
-- trip_operational_facts: fatos para o motor ESG (sem emissao)
-- -----------------------------------------------------------------------------
create table public.trip_operational_facts (
  trip_id                uuid primary key references public.operational_trips(id) on delete restrict,
  version                integer not null default 1,
  planned_distance_km    numeric,
  gps_distance_km        numeric,
  aggregated_distance_km numeric,
  distance_source        text not null check (distance_source in ('gps_raw', 'gps_summary', 'planned', 'none')),
  duration_min           integer,
  moving_min             integer,
  stops_count            integer,
  points_total           integer not null default 0,
  points_accepted        integer not null default 0,
  points_low_accuracy    integer not null default 0,
  points_flagged         integer not null default 0,
  gaps_over_silence      integer not null default 0,
  sample_quality         text not null check (sample_quality in ('none', 'poor', 'fair', 'good')),
  computed_at            timestamptz not null default now(),
  computed_by_rpc        text not null
);
alter table public.trip_operational_facts enable row level security;
revoke all on public.trip_operational_facts from public, anon, authenticated, service_role;
grant select on public.trip_operational_facts to service_role;

commit;
