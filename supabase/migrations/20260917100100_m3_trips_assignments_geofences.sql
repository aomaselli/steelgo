-- =============================================================================
-- MODULO 3 - 69/81: operational_trips, trip_assignments, trip_geofences
--   * varias TENTATIVAS por contrato, mas so UMA viva (indice parcial) e
--     nenhuma nova tentativa depois que a carga embarcou (custodia fisica);
--   * cancelamento operacional so antes de loading; depois de loading a viagem
--     so termina por resolucao explicita de disposicao de carga (RPC admin);
--   * driver_id = drivers.id (identidade operacional); snapshots no assignment;
--   * policy_version congelada; retencao e legal hold registrados na viagem;
--   * escrita SOMENTE por RPC (nenhum DML para anon/authenticated/service_role).
-- =============================================================================
begin;

create table public.operational_trips (
  id                       uuid primary key default gen_random_uuid(),
  contract_id              uuid not null references public.contracts(id) on delete restrict,
  freight_id               uuid not null references public.freights(id) on delete restrict,
  shipper_company_id       uuid not null references public.companies(id) on delete restrict,
  carrier_company_id       uuid not null references public.companies(id) on delete restrict,
  attempt_number           integer not null check (attempt_number >= 1),
  trip_number              text not null unique,
  status                   public.trip_status not null default 'planned',
  previous_status          public.trip_status,
  driver_id                uuid references public.drivers(id) on delete restrict,
  truck_id                 uuid references public.trucks(id) on delete restrict,
  policy_version           integer not null references public.operational_policies(version),
  planned_pickup_at        timestamptz,
  planned_delivery_at      timestamptz,
  pickup_geog              extensions.geography(Point, 4326),
  delivery_geog            extensions.geography(Point, 4326),
  planned_distance_km      numeric check (planned_distance_km is null or planned_distance_km >= 0),
  eta_at                   timestamptz,
  eta_source               text check (eta_source in ('calculated', 'reported')),
  eta_updated_at           timestamptz,
  eta_basis                jsonb,
  last_location_at         timestamptz,
  last_location_geog       extensions.geography(Point, 4326),
  tracking_state           text not null default 'off' check (tracking_state in ('off', 'active', 'paused')),
  paused_by_contract       boolean not null default false,
  paused_by_exception_id   uuid,
  has_open_critical_exception boolean not null default false,
  delivery_exception       boolean not null default false,
  loaded_at                timestamptz,
  departed_pickup_at       timestamptz,
  delivered_at             timestamptz,
  returned_at              timestamptz,
  completed_at             timestamptz,
  cancelled_at             timestamptz,
  cancel_reason            text,
  terminal_reason          text check (terminal_reason in (
                             'delivered_completed', 'cancelled_operational', 'cancelled_with_contract',
                             'cargo_disposition_resolved')),
  cargo_disposition        public.cargo_disposition,
  cargo_disposition_at     timestamptz,
  retention_until          timestamptz,
  summary_retention_until  timestamptz,
  legal_hold_reason        text check (legal_hold_reason is null or legal_hold_reason in (
                             'dispute_open', 'sos', 'accident', 'theft', 'legal_hold_admin')),
  legal_hold_until         timestamptz,
  raw_locations_purged_at  timestamptz,
  last_event_id            uuid,
  version                  integer not null default 1,
  created_by               uuid references auth.users(id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (contract_id, attempt_number),
  constraint operational_trips_terminal_coherent check (
    (status = 'cancelled') = (cancelled_at is not null)
    and (status = 'completed') = (completed_at is not null)
    and (status in ('delivered', 'completed') or delivered_at is null)
    and (status = 'returned' or returned_at is null)
    and ((status in ('cancelled', 'completed', 'returned')) = (terminal_reason is not null))),
  constraint operational_trips_cancel_reason check (status <> 'cancelled' or length(btrim(cancel_reason)) >= 20),
  constraint operational_trips_assignment_coherent check (
    status in ('planned', 'cancelled') or (driver_id is not null and truck_id is not null)),
  constraint operational_trips_loaded_states check (
    loaded_at is null or status in ('loading', 'in_transit', 'at_delivery', 'unloading', 'returning',
                                    'delivered', 'returned', 'completed', 'cancelled')),
  constraint operational_trips_disposition_coherent check (
    (cargo_disposition is null) = (cargo_disposition_at is null)),
  constraint operational_trips_legal_hold_coherent check (
    (legal_hold_reason is null) = (legal_hold_until is null))
);
comment on table public.operational_trips is
  'Tentativas operacionais de execucao de um contrato (M3). Uma viva por contrato; nenhuma nova '
  'tentativa apos loaded_at (custodia fisica). Escrita so por RPC.';

create unique index operational_trips_one_live_per_contract
  on public.operational_trips (contract_id) where status not in ('completed', 'cancelled', 'returned');
create index operational_trips_status_idx on public.operational_trips (status);
create index operational_trips_carrier_status_idx on public.operational_trips (carrier_company_id, status);
create index operational_trips_shipper_status_idx on public.operational_trips (shipper_company_id, status);
create index operational_trips_driver_idx on public.operational_trips (driver_id) where driver_id is not null;
create index operational_trips_last_location_idx on public.operational_trips (last_location_at)
  where status in ('en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'returning');
create index operational_trips_retention_idx on public.operational_trips (retention_until)
  where raw_locations_purged_at is null and status in ('completed', 'cancelled', 'returned', 'delivered');

alter table public.operational_trips enable row level security;
revoke all on public.operational_trips from public, anon, authenticated, service_role;
grant select on public.operational_trips to service_role;

alter table public.capacity_availability
  add constraint capacity_availability_reserved_trip_fk
  foreign key (reserved_by_trip_id) references public.operational_trips(id) on delete set null;

-- -----------------------------------------------------------------------------
-- trip_assignments: historico motorista/veiculo com snapshots
-- -----------------------------------------------------------------------------
create table public.trip_assignments (
  id                             uuid primary key default gen_random_uuid(),
  trip_id                        uuid not null references public.operational_trips(id) on delete restrict,
  driver_id                      uuid not null references public.drivers(id) on delete restrict,
  driver_profile_id              uuid not null references auth.users(id) on delete restrict,
  truck_id                       uuid not null references public.trucks(id) on delete restrict,
  carrier_id_at_assignment       uuid not null references public.carriers(id) on delete restrict,
  carrier_company_id_at_assignment uuid not null references public.companies(id) on delete restrict,
  truck_plate_at_assignment      text,
  driver_label_at_assignment     text not null,
  state                          public.trip_assignment_state not null default 'offered',
  assigned_by                    uuid not null references auth.users(id) on delete restrict,
  assigned_by_kind               public.trip_actor_kind not null,
  assigned_at                    timestamptz not null default now(),
  accepted_at                    timestamptz,
  declined_at                    timestamptz,
  decline_reason                 text,
  revoked_at                     timestamptz,
  revoke_reason                  text,
  superseded_by                  uuid references public.trip_assignments(id),
  request_id                     uuid not null,
  note                           text,
  constraint trip_assignments_driver_identity
    foreign key (driver_id, driver_profile_id) references public.drivers(id, profile_id),
  constraint trip_assignments_state_coherent check (
    (state <> 'accepted' or accepted_at is not null)
    and (accepted_at is null or state in ('accepted', 'revoked', 'superseded'))
    and (state = 'declined') = (declined_at is not null)
    and (state in ('revoked', 'superseded')) = (revoked_at is not null)
    and (state <> 'declined' or length(btrim(decline_reason)) >= 10))
);
create unique index trip_assignments_one_live_per_trip
  on public.trip_assignments (trip_id) where state in ('offered', 'accepted');
create index trip_assignments_driver_state_idx on public.trip_assignments (driver_id, state);
create index trip_assignments_profile_idx on public.trip_assignments (driver_profile_id) where state in ('offered', 'accepted');

alter table public.trip_assignments enable row level security;
revoke all on public.trip_assignments from public, anon, authenticated, service_role;
grant select on public.trip_assignments to service_role;

-- vinculo real motorista-transportadora-viagem no momento da atribuicao
create function public.trip_assignments_enforce_link()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  v_trip    public.operational_trips%rowtype;
  v_driver  public.drivers%rowtype;
  v_truck   public.trucks%rowtype;
  v_carrier public.carriers%rowtype;
begin
  select * into v_trip from public.operational_trips t where t.id = NEW.trip_id;
  if not found then
    raise exception using errcode = '23503', message = 'trip_assignments: viagem inexistente';
  end if;
  select * into v_driver from public.drivers d where d.id = NEW.driver_id;
  select * into v_truck from public.trucks k where k.id = NEW.truck_id;
  if v_driver.id is null or v_truck.id is null then
    raise exception using errcode = '23503', message = 'trip_assignments: motorista ou veiculo inexistente';
  end if;
  if v_driver.profile_id is null or v_driver.profile_id <> NEW.driver_profile_id then
    raise exception using errcode = '23514',
      message = 'trip_assignments: motorista sem perfil de autenticacao ou snapshot divergente';
  end if;
  if v_driver.carrier_id is null then
    raise exception using errcode = '23514', message = 'trip_assignments: motorista sem vinculo com transportadora';
  end if;
  select * into v_carrier from public.carriers c where c.id = v_driver.carrier_id;
  if v_carrier.company_id is distinct from v_trip.carrier_company_id then
    raise exception using errcode = '23514',
      message = 'trip_assignments: motorista nao pertence a transportadora do contrato';
  end if;
  if v_truck.carrier_id is distinct from v_carrier.id then
    raise exception using errcode = '23514',
      message = 'trip_assignments: veiculo nao pertence a transportadora do contrato';
  end if;
  if not coalesce(v_driver.is_active, false) or not coalesce(v_truck.is_active, false) then
    raise exception using errcode = '23514', message = 'trip_assignments: motorista ou veiculo inativo';
  end if;
  if v_driver.license_verification_status is distinct from 'approved' then
    raise exception using errcode = '23514',
      message = 'trip_assignments: habilitacao do motorista nao aprovada';
  end if;
  if NEW.carrier_id_at_assignment <> v_carrier.id
     or NEW.carrier_company_id_at_assignment <> v_carrier.company_id then
    raise exception using errcode = '23514', message = 'trip_assignments: snapshot de transportadora divergente';
  end if;
  return NEW;
end $fn$;
create trigger trip_assignments_enforce_link_trg before insert on public.trip_assignments
  for each row execute function public.trip_assignments_enforce_link();

-- assignments so mudam de estado (offered/accepted -> outro), nunca de identidade
create function public.trip_assignments_guard_update()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if NEW.trip_id <> OLD.trip_id or NEW.driver_id <> OLD.driver_id or NEW.truck_id <> OLD.truck_id
     or NEW.driver_profile_id <> OLD.driver_profile_id or NEW.assigned_at <> OLD.assigned_at
     or NEW.assigned_by <> OLD.assigned_by or NEW.request_id <> OLD.request_id then
    raise exception using errcode = '42501', message = 'trip_assignments: identidade do vinculo e imutavel';
  end if;
  if OLD.state in ('declined', 'superseded', 'revoked') then
    if OLD.state = 'superseded' and NEW.state = 'superseded' and OLD.superseded_by is null and NEW.superseded_by is not null
       and (to_jsonb(NEW) - 'superseded_by') = (to_jsonb(OLD) - 'superseded_by') then
      return NEW; -- ponteiro para o vinculo sucessor, uma unica vez
    end if;
    raise exception using errcode = '42501', message = 'trip_assignments: vinculo terminal nao e reaberto';
  end if;
  return NEW;
end $fn$;
create trigger trip_assignments_guard_update_trg before update on public.trip_assignments
  for each row execute function public.trip_assignments_guard_update();
create function public.trip_assignments_block_delete()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'trip_assignments: historico nao e apagado';
end $fn$;
create trigger trip_assignments_block_delete_trg before delete on public.trip_assignments
  for each row execute function public.trip_assignments_block_delete();

-- -----------------------------------------------------------------------------
-- trip_geofences
-- -----------------------------------------------------------------------------
create table public.trip_geofences (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.operational_trips(id) on delete restrict,
  kind       text not null check (kind in ('pickup', 'delivery', 'return', 'waypoint', 'corridor')),
  center_geog extensions.geography(Point, 4326),
  radius_m   integer check (radius_m is null or radius_m between 50 and 50000),
  area_geog  extensions.geography(Polygon, 4326),
  source     text not null check (source in ('freight', 'admin', 'resolution')),
  is_current boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint trip_geofences_shape check ((center_geog is not null and radius_m is not null) or area_geog is not null)
);
create unique index trip_geofences_current_kind on public.trip_geofences (trip_id, kind) where is_current;
create index trip_geofences_center_gix on public.trip_geofences using gist (center_geog);
alter table public.trip_geofences enable row level security;
revoke all on public.trip_geofences from public, anon, authenticated, service_role;
grant select on public.trip_geofences to service_role;

-- -----------------------------------------------------------------------------
-- Guardas da viagem
-- -----------------------------------------------------------------------------
-- (a) nenhuma tentativa nova apos custodia; nenhuma em contrato nao-active
create function public.operational_trips_guard_insert()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  v_c public.contracts%rowtype;
begin
  select * into v_c from public.contracts c where c.id = NEW.contract_id;
  if not found then
    raise exception using errcode = '23503', message = 'operational_trips: contrato inexistente';
  end if;
  if v_c.status <> 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('operational_trips: contrato em %s; viagem so nasce em contrato active', v_c.status);
  end if;
  if v_c.delivery_completed_at is not null then
    raise exception using errcode = '22023',
      message = 'operational_trips: contrato ja tem entrega concluida; nenhuma nova tentativa';
  end if;
  if exists (select 1 from public.operational_trips t
              where t.contract_id = NEW.contract_id and t.loaded_at is not null) then
    raise exception using errcode = '22023',
      message = 'operational_trips: a carga ja embarcou em tentativa anterior (custodia fisica); '
                'nenhuma nova tentativa reutiliza a coleta original';
  end if;
  if NEW.shipper_company_id <> v_c.shipper_company_id or NEW.carrier_company_id <> v_c.carrier_company_id
     or NEW.freight_id <> v_c.freight_id then
    raise exception using errcode = '23514', message = 'operational_trips: partes/frete divergem do contrato';
  end if;
  if NEW.attempt_number <> coalesce((select max(t.attempt_number) from public.operational_trips t
                                      where t.contract_id = NEW.contract_id), 0) + 1 then
    raise exception using errcode = '23514', message = 'operational_trips: attempt_number fora de sequencia';
  end if;
  return NEW;
end $fn$;
create trigger operational_trips_guard_insert_trg before insert on public.operational_trips
  for each row execute function public.operational_trips_guard_insert();

-- (b) atualizacao: imutaveis, custodia e terminalidade
create function public.operational_trips_guard_update()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  v_ctx text := current_setting('steelgo.trip_guard_context', true);
begin
  if NEW.contract_id <> OLD.contract_id or NEW.attempt_number <> OLD.attempt_number
     or NEW.trip_number <> OLD.trip_number or NEW.policy_version <> OLD.policy_version
     or NEW.created_at <> OLD.created_at then
    raise exception using errcode = '42501', message = 'operational_trips: identidade da tentativa e imutavel';
  end if;
  if OLD.status in ('completed', 'cancelled', 'returned') and NEW.status <> OLD.status then
    raise exception using errcode = '42501', message = 'operational_trips: viagem terminal nao reabre';
  end if;
  if OLD.loaded_at is not null and NEW.loaded_at is distinct from OLD.loaded_at then
    raise exception using errcode = '42501', message = 'operational_trips: loaded_at e fato historico';
  end if;
  if OLD.delivered_at is not null and NEW.delivered_at is distinct from OLD.delivered_at then
    raise exception using errcode = '42501', message = 'operational_trips: delivered_at e fato historico';
  end if;
  -- CUSTODIA: viagem carregada so termina por disposicao de carga registrada
  -- (RPC admin marca contexto E grava cargo_disposition na mesma escrita) ou
  -- por conclusao regular (delivered -> completed).
  if NEW.status in ('cancelled', 'returned') and NEW.status <> OLD.status and OLD.loaded_at is not null then
    if NEW.cargo_disposition is null or NEW.terminal_reason <> 'cargo_disposition_resolved'
       or v_ctx is distinct from ('cargo_disposition:' || OLD.id::text) then
      raise exception using errcode = '42501',
        message = 'operational_trips: viagem com carga embarcada so termina por resolucao explicita '
                  'de disposicao de carga (resolve_cargo_disposition)';
    end if;
  end if;
  if NEW.status = 'cancelled' and NEW.status <> OLD.status and OLD.loaded_at is null
     and NEW.terminal_reason not in ('cancelled_operational', 'cancelled_with_contract') then
    raise exception using errcode = '23514', message = 'operational_trips: terminal_reason incoerente';
  end if;
  if NEW.status = 'completed' and NEW.status <> OLD.status and OLD.status <> 'delivered' then
    raise exception using errcode = '22023',
      message = 'operational_trips: completed so a partir de delivered';
  end if;
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  return NEW;
end $fn$;
create trigger operational_trips_guard_update_trg before update on public.operational_trips
  for each row execute function public.operational_trips_guard_update();

create function public.operational_trips_block_delete()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception using errcode = '42501', message = 'operational_trips: viagens nao sao apagadas';
end $fn$;
create trigger operational_trips_block_delete_trg before delete on public.operational_trips
  for each row execute function public.operational_trips_block_delete();

commit;
