-- SteelGo | Secure capacity availability API
-- Requires: 20260813150000_capacity_matching_engine.sql
begin;

-- A driver and a truck can participate in only one live availability at a time.
create unique index if not exists capacity_availability_live_driver_uidx
  on public.capacity_availability (driver_id)
  where status in ('available', 'reserved');

create unique index if not exists capacity_availability_live_truck_uidx
  on public.capacity_availability (truck_id)
  where status in ('available', 'reserved');

create or replace function public.can_manage_capacity(
  p_carrier_id uuid,
  p_driver_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.carriers c
      where c.id = p_carrier_id
        and (
          public.is_current_user_company_owner(c.company_id)
          or public.is_current_user_company_member(c.company_id)
        )
    )
    or (
      p_driver_id is not null
      and exists (
        select 1
        from public.drivers d
        where d.id = p_driver_id
          and d.carrier_id = p_carrier_id
          and d.profile_id = (select auth.uid())
      )
    )
    or public.has_role((select auth.uid()), 'admin'::public.app_role);
$$;

revoke all on function public.can_manage_capacity(uuid, uuid) from public;
revoke all on function public.can_manage_capacity(uuid, uuid) from anon;
grant execute on function public.can_manage_capacity(uuid, uuid) to authenticated;

-- Opens or refreshes a capacity window. Exact coordinates remain protected by RLS.
create or replace function public.set_capacity_available(
  p_driver_id uuid,
  p_truck_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy_m numeric default null,
  p_available_from timestamptz default now(),
  p_available_until timestamptz default null,
  p_max_pickup_radius_km integer default 100,
  p_preferred_destination_countries text[] default '{}'::text[],
  p_preferred_destination_subdivisions text[] default '{}'::text[],
  p_accepts_backhaul boolean default true,
  p_min_rate_per_loaded_km numeric default null,
  p_min_total_amount numeric default null,
  p_currency_code text default 'BRL'
)
returns table (
  availability_id uuid,
  availability_status text,
  available_from timestamptz,
  available_until timestamptz,
  max_pickup_radius_km integer,
  location_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_driver public.drivers%rowtype;
  v_truck public.trucks%rowtype;
  v_existing_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_driver from public.drivers where id = p_driver_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Driver not found';
  end if;

  select * into v_truck from public.trucks where id = p_truck_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Truck not found';
  end if;

  if v_driver.carrier_id is distinct from v_truck.carrier_id then
    raise exception using errcode = '23514', message = 'Driver and truck must belong to the same carrier';
  end if;

  if not public.can_manage_capacity(v_driver.carrier_id, v_driver.id) then
    raise exception using errcode = '42501', message = 'Not authorized to manage this capacity';
  end if;

  if not coalesce(v_driver.is_active, false) then
    raise exception using errcode = '22023', message = 'Driver is inactive';
  end if;

  if not coalesce(v_driver.is_verified, false) then
    raise exception using errcode = '22023', message = 'Driver verification is required';
  end if;

  if not coalesce(v_truck.is_active, false) then
    raise exception using errcode = '22023', message = 'Truck is inactive';
  end if;

  if p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Invalid coordinates';
  end if;

  if p_available_until is not null
     and p_available_until <= coalesce(p_available_from, now()) then
    raise exception using errcode = '22023', message = 'Availability end must be after its start';
  end if;

  if p_max_pickup_radius_km not between 10 and 500 then
    raise exception using errcode = '22023', message = 'Pickup radius must be between 10 and 500 km';
  end if;

  if upper(p_currency_code) !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'Invalid currency code';
  end if;

  -- Serialize changes for this driver and truck, avoiding simultaneous live records.
  perform pg_advisory_xact_lock(hashtextextended(p_driver_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_truck_id::text, 1));

  select ca.id into v_existing_id
  from public.capacity_availability ca
  where ca.driver_id = p_driver_id
     or ca.truck_id = p_truck_id
  order by
    case when ca.status in ('available', 'reserved') then 0 else 1 end,
    ca.updated_at desc
  limit 1;

  -- Close another live pairing before activating the selected combination.
  update public.capacity_availability
  set status = 'offline', updated_at = now()
  where status in ('available', 'reserved')
    and (driver_id = p_driver_id or truck_id = p_truck_id)
    and id is distinct from v_existing_id;

  if v_existing_id is null then
    insert into public.capacity_availability (
      carrier_id, driver_id, truck_id, status,
      available_from, available_until,
      current_lat, current_lng, current_geog,
      location_accuracy_m, location_updated_at,
      max_pickup_radius_km,
      preferred_destination_countries,
      preferred_destination_subdivisions,
      accepts_backhaul,
      min_rate_per_loaded_km, min_total_amount, currency_code
    ) values (
      v_driver.carrier_id, p_driver_id, p_truck_id, 'available',
      coalesce(p_available_from, now()), p_available_until,
      p_lat, p_lng,
      extensions.st_setsrid(
        extensions.st_makepoint(p_lng::double precision, p_lat::double precision),
        4326
      )::extensions.geography,
      p_accuracy_m, now(), p_max_pickup_radius_km,
      coalesce(p_preferred_destination_countries, '{}'::text[]),
      coalesce(p_preferred_destination_subdivisions, '{}'::text[]),
      coalesce(p_accepts_backhaul, true),
      p_min_rate_per_loaded_km, p_min_total_amount, upper(p_currency_code)
    )
    returning id into v_existing_id;
  else
    update public.capacity_availability
    set carrier_id = v_driver.carrier_id,
        driver_id = p_driver_id,
        truck_id = p_truck_id,
        status = 'available',
        available_from = coalesce(p_available_from, now()),
        available_until = p_available_until,
        current_lat = p_lat,
        current_lng = p_lng,
        location_accuracy_m = p_accuracy_m,
        location_updated_at = now(),
        max_pickup_radius_km = p_max_pickup_radius_km,
        preferred_destination_countries = coalesce(p_preferred_destination_countries, '{}'::text[]),
        preferred_destination_subdivisions = coalesce(p_preferred_destination_subdivisions, '{}'::text[]),
        accepts_backhaul = coalesce(p_accepts_backhaul, true),
        min_rate_per_loaded_km = p_min_rate_per_loaded_km,
        min_total_amount = p_min_total_amount,
        currency_code = upper(p_currency_code),
        updated_at = now()
    where id = v_existing_id;
  end if;

  return query
  select ca.id, ca.status, ca.available_from, ca.available_until,
         ca.max_pickup_radius_km, ca.location_updated_at
  from public.capacity_availability ca
  where ca.id = v_existing_id;
end;
$$;

-- Updates only the exact position of a previously authorized live availability.
create or replace function public.update_capacity_location(
  p_availability_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy_m numeric default null
)
returns table (
  availability_id uuid,
  availability_status text,
  location_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_capacity public.capacity_availability%rowtype;
begin
  select * into v_capacity
  from public.capacity_availability
  where id = p_availability_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Availability not found';
  end if;

  if not public.can_manage_capacity(v_capacity.carrier_id, v_capacity.driver_id) then
    raise exception using errcode = '42501', message = 'Not authorized to update this capacity';
  end if;

  if v_capacity.status not in ('available', 'reserved') then
    raise exception using errcode = '22023', message = 'Availability is not live';
  end if;

  if p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Invalid coordinates';
  end if;

  update public.capacity_availability
  set current_lat = p_lat,
      current_lng = p_lng,
      location_accuracy_m = p_accuracy_m,
      location_updated_at = now(),
      updated_at = now()
  where id = p_availability_id;

  return query
  select ca.id, ca.status, ca.location_updated_at
  from public.capacity_availability ca
  where ca.id = p_availability_id;
end;
$$;

-- Pauses or closes a live availability without deleting its audit history.
create or replace function public.set_capacity_status(
  p_availability_id uuid,
  p_status text
)
returns table (
  availability_id uuid,
  availability_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_capacity public.capacity_availability%rowtype;
begin
  select * into v_capacity
  from public.capacity_availability
  where id = p_availability_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Availability not found';
  end if;

  if not public.can_manage_capacity(v_capacity.carrier_id, v_capacity.driver_id) then
    raise exception using errcode = '42501', message = 'Not authorized to change this capacity';
  end if;

  if p_status not in ('available', 'paused', 'offline') then
    raise exception using errcode = '22023', message = 'Status must be available, paused or offline';
  end if;

  if p_status = 'available' and
     (v_capacity.available_until is not null and v_capacity.available_until <= now()) then
    raise exception using errcode = '22023', message = 'Availability window has expired';
  end if;

  update public.capacity_availability
  set status = p_status,
      location_updated_at = case when p_status = 'available' then now() else location_updated_at end,
      updated_at = now()
  where id = p_availability_id;

  return query
  select ca.id, ca.status, ca.updated_at
  from public.capacity_availability ca
  where ca.id = p_availability_id;
end;
$$;

revoke all on function public.set_capacity_available(
  uuid, uuid, numeric, numeric, numeric, timestamptz, timestamptz,
  integer, text[], text[], boolean, numeric, numeric, text
) from public;
revoke all on function public.set_capacity_available(
  uuid, uuid, numeric, numeric, numeric, timestamptz, timestamptz,
  integer, text[], text[], boolean, numeric, numeric, text
) from anon;
grant execute on function public.set_capacity_available(
  uuid, uuid, numeric, numeric, numeric, timestamptz, timestamptz,
  integer, text[], text[], boolean, numeric, numeric, text
) to authenticated;

revoke all on function public.update_capacity_location(uuid, numeric, numeric, numeric) from public;
revoke all on function public.update_capacity_location(uuid, numeric, numeric, numeric) from anon;
grant execute on function public.update_capacity_location(uuid, numeric, numeric, numeric) to authenticated;

revoke all on function public.set_capacity_status(uuid, text) from public;
revoke all on function public.set_capacity_status(uuid, text) from anon;
grant execute on function public.set_capacity_status(uuid, text) to authenticated;

comment on function public.set_capacity_available(
  uuid, uuid, numeric, numeric, numeric, timestamptz, timestamptz,
  integer, text[], text[], boolean, numeric, numeric, text
) is 'Creates or refreshes a privacy-protected capacity window for an authorized carrier or driver.';

comment on function public.update_capacity_location(uuid, numeric, numeric, numeric)
is 'Updates the exact location of a live capacity record for its authorized carrier or driver.';

comment on function public.set_capacity_status(uuid, text)
is 'Pauses, resumes or closes capacity without deleting audit history.';

commit;
