-- SteelGo | Privacy-safe capacity matching engine
-- Requires: 20260812140000_latam_capacity_pricing_foundation.sql
begin;

-- Keep the geography point consistent with the coordinates supplied by the carrier.
create or replace function public.set_capacity_availability_geog()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.current_geog := extensions.st_setsrid(
    extensions.st_makepoint(
      new.current_lng::double precision,
      new.current_lat::double precision
    ),
    4326
  )::extensions.geography;
  new.location_updated_at := now();
  return new;
end;
$$;

drop trigger if exists capacity_availability_set_geog
  on public.capacity_availability;
create trigger capacity_availability_set_geog
before insert or update of current_lat, current_lng
on public.capacity_availability
for each row execute function public.set_capacity_availability_geog();

-- Prevent a capacity record from combining resources owned by different carriers.
create or replace function public.validate_capacity_availability_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.drivers d
    where d.id = new.driver_id
      and d.carrier_id = new.carrier_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Driver does not belong to the selected carrier';
  end if;

  if not exists (
    select 1
    from public.trucks t
    where t.id = new.truck_id
      and t.carrier_id = new.carrier_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Truck does not belong to the selected carrier';
  end if;

  return new;
end;
$$;

drop trigger if exists capacity_availability_validate_ownership
  on public.capacity_availability;
create trigger capacity_availability_validate_ownership
before insert or update of carrier_id, driver_id, truck_id
on public.capacity_availability
for each row execute function public.validate_capacity_availability_ownership();

-- Searches and stores eligible candidates without returning exact coordinates,
-- driver identity, truck identity or plate to the shipper.
create or replace function public.match_capacity_for_freight(
  p_freight_id uuid,
  p_max_radius_km integer default 500,
  p_location_max_age_minutes integer default 60,
  p_limit integer default 50
)
returns table (
  match_id uuid,
  carrier_id uuid,
  distance_km numeric,
  radius_band_km integer,
  pickup_eta_minutes integer,
  truck_type public.truck_type,
  payload_tons numeric,
  total_score numeric,
  eligibility_status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_freight public.freights%rowtype;
  v_authorized boolean;
  v_max_radius_km integer;
  v_location_max_age_minutes integer;
  v_limit integer;
begin
  select * into v_freight
  from public.freights
  where id = p_freight_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Freight not found';
  end if;

  v_authorized :=
    public.is_current_user_company_owner(v_freight.company_id)
    or public.is_current_user_company_member(v_freight.company_id)
    or public.has_role((select auth.uid()), 'admin'::public.app_role);

  if not coalesce(v_authorized, false) then
    raise exception using errcode = '42501', message = 'Not authorized for this freight';
  end if;

  if v_freight.status not in (
    'published'::public.freight_status,
    'bidding'::public.freight_status
  ) then
    raise exception using
      errcode = '22023',
      message = 'Freight must be published or bidding';
  end if;

  if v_freight.origin_geog is null then
    raise exception using
      errcode = '22023',
      message = 'Freight origin must be geocoded before matching';
  end if;

  v_max_radius_km := least(greatest(coalesce(p_max_radius_km, 500), 10), 500);
  v_location_max_age_minutes := least(
    greatest(coalesce(p_location_max_age_minutes, 60), 5),
    1440
  );
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  -- A refresh must not leave a previously eligible but now stale candidate active.
  update public.capacity_matches
  set eligibility_status = 'expired',
      updated_at = now()
  where freight_id = p_freight_id
    and eligibility_status = 'eligible';

  return query
  with eligible as (
    select
      ca.id as availability_id,
      ca.carrier_id,
      t.type as matched_truck_type,
      coalesce(t.payload_tons, t.max_weight_tons, t.capacity_tons) as matched_payload_tons,
      (extensions.st_distance(ca.current_geog, v_freight.origin_geog) / 1000.0)::numeric
        as calculated_distance_km,
      ca.available_from,
      ca.location_updated_at
    from public.capacity_availability ca
    join public.drivers d
      on d.id = ca.driver_id
     and d.carrier_id = ca.carrier_id
    join public.trucks t
      on t.id = ca.truck_id
     and t.carrier_id = ca.carrier_id
    join public.carriers c
      on c.id = ca.carrier_id
    where ca.status = 'available'
      and ca.available_from <= now()
      and (ca.available_until is null or ca.available_until > now())
      and ca.location_updated_at >= now() - make_interval(mins => v_location_max_age_minutes)
      and d.is_active is true
      and d.is_verified is true
      and t.is_active is true
      and c.is_active is true
      and (v_freight.weight_tons is null or
           coalesce(t.payload_tons, t.max_weight_tons, t.capacity_tons) >= v_freight.weight_tons)
      and (v_freight.required_truck is null or
           cardinality(v_freight.required_truck) = 0 or
           t.type = any(v_freight.required_truck))
      and (not v_freight.requires_mopp or
           coalesce(d.mopp_certified, false) or
           coalesce(d.has_mopp, false))
      and (t.country_code = v_freight.origin_country_code or
           v_freight.operation_scope = 'cross_border')
      and (cardinality(ca.preferred_destination_countries) = 0 or
           v_freight.destination_country_code = any(ca.preferred_destination_countries))
      and extensions.st_dwithin(
        ca.current_geog,
        v_freight.origin_geog,
        least(v_max_radius_km, ca.max_pickup_radius_km) * 1000.0
      )
  ), ranked as (
    select
      e.*,
      least(
        500,
        greatest(
          greatest(v_freight.search_radius_km, 10),
          (ceil(e.calculated_distance_km / 100.0) * 100)::integer
        )
      ) as calculated_radius_band_km,
      greatest(
        0,
        round((100 - (e.calculated_distance_km / v_max_radius_km * 100))::numeric, 4)
      ) as calculated_score
    from eligible e
  ), persisted as (
    insert into public.capacity_matches (
      freight_id,
      capacity_availability_id,
      carrier_id,
      eligibility_status,
      total_score,
      proximity_score,
      equipment_score,
      availability_score,
      compliance_score,
      empty_distance_km,
      pickup_eta_minutes,
      reasons,
      rejection_reasons
    )
    select
      p_freight_id,
      r.availability_id,
      r.carrier_id,
      'eligible',
      r.calculated_score,
      r.calculated_score,
      100,
      100,
      100,
      round(r.calculated_distance_km, 3),
      ceil(r.calculated_distance_km / 50.0 * 60)::integer,
      jsonb_build_array(
        jsonb_build_object('code', 'within_radius', 'radius_km', r.calculated_radius_band_km),
        jsonb_build_object('code', 'equipment_compatible'),
        jsonb_build_object('code', 'capacity_compatible'),
        jsonb_build_object('code', 'compliance_compatible')
      ),
      '[]'::jsonb
    from ranked r
    order by r.calculated_distance_km, r.calculated_score desc
    limit v_limit
    on conflict (freight_id, capacity_availability_id)
    do update set
      carrier_id = excluded.carrier_id,
      eligibility_status = excluded.eligibility_status,
      total_score = excluded.total_score,
      proximity_score = excluded.proximity_score,
      equipment_score = excluded.equipment_score,
      availability_score = excluded.availability_score,
      compliance_score = excluded.compliance_score,
      empty_distance_km = excluded.empty_distance_km,
      pickup_eta_minutes = excluded.pickup_eta_minutes,
      reasons = excluded.reasons,
      rejection_reasons = excluded.rejection_reasons,
      updated_at = now()
    returning public.capacity_matches.*
  )
  select
    p.id,
    p.carrier_id,
    round(p.empty_distance_km, 1),
    least(
      500,
      greatest(
        greatest(v_freight.search_radius_km, 10),
        (ceil(p.empty_distance_km / 100.0) * 100)::integer
      )
    ),
    p.pickup_eta_minutes,
    t.type,
    coalesce(t.payload_tons, t.max_weight_tons, t.capacity_tons),
    p.total_score,
    p.eligibility_status
  from persisted p
  join public.capacity_availability ca on ca.id = p.capacity_availability_id
  join public.trucks t on t.id = ca.truck_id
  order by p.empty_distance_km, p.total_score desc;
end;
$$;

revoke all on function public.match_capacity_for_freight(uuid, integer, integer, integer)
  from public;
revoke all on function public.match_capacity_for_freight(uuid, integer, integer, integer)
  from anon;
grant execute on function public.match_capacity_for_freight(uuid, integer, integer, integer)
  to authenticated;

comment on function public.match_capacity_for_freight(uuid, integer, integer, integer)
is 'Returns privacy-safe eligible capacity matches for an authorized freight. Exact coordinates and resource identities are not exposed.';

commit;
