-- SteelGo | LATAM capacity and pricing foundation
-- Additive migration: preserves all current Brazil-specific fields and data.
begin;

create extension if not exists postgis with schema extensions;

-- Generic updated_at trigger shared by the new operational tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- LATAM identity defaults. Brazil remains the first operational adapter.
alter table public.companies
  add column if not exists country_code text not null default 'BR',
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists timezone text not null default 'America/Sao_Paulo';

alter table public.companies
  drop constraint if exists companies_country_code_format,
  add constraint companies_country_code_format check (country_code ~ '^[A-Z]{2}$') not valid,
  drop constraint if exists companies_currency_code_format,
  add constraint companies_currency_code_format check (currency_code ~ '^[A-Z]{3}$') not valid;

alter table public.carriers
  add column if not exists operating_countries text[] not null default array['BR']::text[],
  add column if not exists home_country_code text not null default 'BR';

alter table public.drivers
  add column if not exists country_code text not null default 'BR',
  add column if not exists license_number text,
  add column if not exists license_category text,
  add column if not exists license_expiry date,
  add column if not exists regulatory_attributes jsonb not null default '{}'::jsonb;

update public.drivers
set license_number = coalesce(license_number, cnh_number),
    license_category = coalesce(license_category, cnh_category),
    license_expiry = coalesce(license_expiry, cnh_expiry)
where license_number is null
   or license_category is null
   or license_expiry is null;

alter table public.trucks
  add column if not exists country_code text not null default 'BR',
  add column if not exists registration_number text,
  add column if not exists body_type text,
  add column if not exists payload_tons numeric(10,2),
  add column if not exists volume_capacity_m3 numeric(12,2),
  add column if not exists fuel_type text,
  add column if not exists regulatory_attributes jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.trucks
set registration_number = coalesce(registration_number, plate),
    payload_tons = coalesce(payload_tons, max_weight_tons, capacity_tons)
where registration_number is null or payload_tons is null;

-- Extend freights without removing the original steel and BRL fields.
alter table public.freights
  add column if not exists goods_type_code text,
  add column if not exists cargo_description text,
  add column if not exists volume_m3 numeric(12,2),
  add column if not exists requires_mopp boolean not null default false,
  add column if not exists regulatory_requirements jsonb not null default '{}'::jsonb,
  add column if not exists handling_requirements jsonb not null default '{}'::jsonb,
  add column if not exists internal_reference text,
  add column if not exists waypoints jsonb not null default '[]'::jsonb,
  add column if not exists toll_included boolean not null default false,
  add column if not exists origin_country_code text not null default 'BR',
  add column if not exists origin_subdivision_code text,
  add column if not exists origin_postal_code text,
  add column if not exists origin_timezone text not null default 'America/Sao_Paulo',
  add column if not exists destination_country_code text not null default 'BR',
  add column if not exists destination_subdivision_code text,
  add column if not exists destination_postal_code text,
  add column if not exists destination_timezone text not null default 'America/Sao_Paulo',
  add column if not exists operation_scope text not null default 'domestic',
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists cargo_value_amount numeric(16,2),
  add column if not exists budget_amount numeric(16,2),
  add column if not exists final_price_amount numeric(16,2),
  add column if not exists search_radius_km integer not null default 100,
  add column if not exists origin_geog extensions.geography(Point,4326),
  add column if not exists destination_geog extensions.geography(Point,4326);

update public.freights
set cargo_value_amount = coalesce(cargo_value_amount, cargo_value_brl),
    budget_amount = coalesce(budget_amount, budget_brl),
    final_price_amount = coalesce(final_price_amount, final_price_brl),
    origin_subdivision_code = coalesce(origin_subdivision_code, case when origin_state is not null then 'BR-' || upper(origin_state) end),
    destination_subdivision_code = coalesce(destination_subdivision_code, case when dest_state is not null then 'BR-' || upper(dest_state) end),
    origin_geog = case
      when origin_geog is null and origin_lat between -90 and 90 and origin_lng between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(origin_lng::double precision, origin_lat::double precision), 4326)::extensions.geography
      else origin_geog end,
    destination_geog = case
      when destination_geog is null and dest_lat between -90 and 90 and dest_lng between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(dest_lng::double precision, dest_lat::double precision), 4326)::extensions.geography
      else destination_geog end;

alter table public.freights
  drop constraint if exists freights_origin_country_format,
  add constraint freights_origin_country_format check (origin_country_code ~ '^[A-Z]{2}$') not valid,
  drop constraint if exists freights_destination_country_format,
  add constraint freights_destination_country_format check (destination_country_code ~ '^[A-Z]{2}$') not valid,
  drop constraint if exists freights_currency_format,
  add constraint freights_currency_format check (currency_code ~ '^[A-Z]{3}$') not valid,
  drop constraint if exists freights_operation_scope_valid,
  add constraint freights_operation_scope_valid check (operation_scope in ('domestic','cross_border')) not valid,
  drop constraint if exists freights_search_radius_valid,
  add constraint freights_search_radius_valid check (search_radius_km between 10 and 500) not valid;

create index if not exists freights_origin_geog_gix on public.freights using gist (origin_geog);
create index if not exists freights_destination_geog_gix on public.freights using gist (destination_geog);

-- Availability before a contract. Exact position remains private to carrier/admin;
-- shippers will query it only through a safe matching RPC in the next migration.
create table if not exists public.capacity_availability (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  truck_id uuid not null references public.trucks(id) on delete cascade,
  status text not null default 'available',
  available_from timestamptz not null default now(),
  available_until timestamptz,
  current_lat numeric(9,6) not null,
  current_lng numeric(9,6) not null,
  current_geog extensions.geography(Point,4326) not null,
  location_accuracy_m numeric(10,2),
  location_updated_at timestamptz not null default now(),
  max_pickup_radius_km integer not null default 100,
  preferred_destination_countries text[] not null default '{}'::text[],
  preferred_destination_subdivisions text[] not null default '{}'::text[],
  accepts_backhaul boolean not null default true,
  min_rate_per_loaded_km numeric(14,4),
  min_total_amount numeric(16,2),
  currency_code text not null default 'BRL',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capacity_availability_status_valid check (status in ('available','reserved','assigned','paused','offline')),
  constraint capacity_availability_lat_valid check (current_lat between -90 and 90),
  constraint capacity_availability_lng_valid check (current_lng between -180 and 180),
  constraint capacity_availability_radius_valid check (max_pickup_radius_km between 10 and 1000),
  constraint capacity_availability_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint capacity_availability_window_valid check (available_until is null or available_until > available_from)
);

create index if not exists capacity_availability_geog_gix
  on public.capacity_availability using gist (current_geog);
create index if not exists capacity_availability_search_idx
  on public.capacity_availability (status, available_from, available_until, location_updated_at);
create index if not exists capacity_availability_carrier_idx
  on public.capacity_availability (carrier_id, status);

drop trigger if exists capacity_availability_set_updated_at on public.capacity_availability;
create trigger capacity_availability_set_updated_at
before update on public.capacity_availability
for each row execute function public.set_updated_at();

-- Versioned pricing configuration. Rules can be global or scoped to a carrier.
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carriers(id) on delete cascade,
  country_code text not null,
  origin_subdivision_code text,
  destination_subdivision_code text,
  currency_code text not null,
  truck_type public.truck_type,
  goods_type_code text,
  rate_per_loaded_km numeric(14,4),
  rate_per_empty_km numeric(14,4),
  rate_per_ton numeric(14,4),
  minimum_freight_amount numeric(16,2),
  waiting_hour_amount numeric(14,2),
  risk_percentage numeric(8,4) not null default 0,
  insurance_percentage numeric(8,4) not null default 0,
  platform_fee_percentage numeric(8,4) not null default 3.5,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  version integer not null default 1,
  priority integer not null default 100,
  is_active boolean not null default true,
  parameters jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_rules_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint pricing_rules_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint pricing_rules_period_valid check (effective_until is null or effective_until > effective_from)
);

create index if not exists pricing_rules_lookup_idx
  on public.pricing_rules (country_code, currency_code, is_active, priority, effective_from);

drop trigger if exists pricing_rules_set_updated_at on public.pricing_rules;
create trigger pricing_rules_set_updated_at
before update on public.pricing_rules
for each row execute function public.set_updated_at();

-- Immutable route inputs/results used by pricing and audit.
create table if not exists public.route_estimates (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  capacity_availability_id uuid references public.capacity_availability(id) on delete set null,
  provider text not null default 'google_maps',
  provider_route_id text,
  loaded_distance_km numeric(12,3) not null,
  empty_distance_km numeric(12,3) not null default 0,
  duration_minutes integer,
  toll_amount numeric(16,2) not null default 0,
  currency_code text not null,
  border_crossings jsonb not null default '[]'::jsonb,
  route_payload jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint route_estimates_currency_format check (currency_code ~ '^[A-Z]{3}$')
);

create index if not exists route_estimates_freight_idx
  on public.route_estimates (freight_id, calculated_at desc);

-- Quote snapshot: values never depend on a later edit to pricing rules.
create table if not exists public.freight_quotes (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  capacity_availability_id uuid references public.capacity_availability(id) on delete set null,
  route_estimate_id uuid references public.route_estimates(id) on delete restrict,
  pricing_rule_id uuid references public.pricing_rules(id) on delete restrict,
  carrier_id uuid references public.carriers(id) on delete set null,
  currency_code text not null,
  base_freight_amount numeric(16,2) not null default 0,
  empty_km_amount numeric(16,2) not null default 0,
  toll_amount numeric(16,2) not null default 0,
  fuel_surcharge_amount numeric(16,2) not null default 0,
  risk_amount numeric(16,2) not null default 0,
  insurance_amount numeric(16,2) not null default 0,
  waiting_amount numeric(16,2) not null default 0,
  border_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  carrier_payout_amount numeric(16,2) not null default 0,
  platform_fee_amount numeric(16,2) not null default 0,
  shipper_total_amount numeric(16,2) not null default 0,
  driver_payout_amount numeric(16,2),
  margin_amount numeric(16,2),
  calculation_version text not null,
  calculation_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'estimated',
  valid_until timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint freight_quotes_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint freight_quotes_status_valid check (status in ('estimated','offered','accepted','expired','cancelled'))
);

create index if not exists freight_quotes_freight_idx
  on public.freight_quotes (freight_id, created_at desc);
create index if not exists freight_quotes_carrier_idx
  on public.freight_quotes (carrier_id, status, valid_until);

-- Ranked candidates. Driver identity stays internal until an operational link exists.
create table if not exists public.capacity_matches (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  capacity_availability_id uuid not null references public.capacity_availability(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  quote_id uuid references public.freight_quotes(id) on delete set null,
  eligibility_status text not null default 'eligible',
  rank_position integer,
  total_score numeric(8,4),
  proximity_score numeric(8,4),
  equipment_score numeric(8,4),
  availability_score numeric(8,4),
  compliance_score numeric(8,4),
  performance_score numeric(8,4),
  sustainability_score numeric(8,4),
  empty_distance_km numeric(12,3),
  pickup_eta_minutes integer,
  reasons jsonb not null default '[]'::jsonb,
  rejection_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (freight_id, capacity_availability_id),
  constraint capacity_matches_status_valid check (eligibility_status in ('eligible','invited','accepted','rejected','expired'))
);

create index if not exists capacity_matches_rank_idx
  on public.capacity_matches (freight_id, eligibility_status, rank_position, total_score desc);

drop trigger if exists capacity_matches_set_updated_at on public.capacity_matches;
create trigger capacity_matches_set_updated_at
before update on public.capacity_matches
for each row execute function public.set_updated_at();

-- Tenant isolation. Exact available positions are never directly selectable by shippers.
alter table public.capacity_availability enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.route_estimates enable row level security;
alter table public.freight_quotes enable row level security;
alter table public.capacity_matches enable row level security;

drop policy if exists capacity_availability_carrier_select on public.capacity_availability;
create policy capacity_availability_carrier_select on public.capacity_availability
for select to authenticated using (
  exists (
    select 1 from public.carriers ca
    where ca.id = capacity_availability.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists capacity_availability_carrier_manage on public.capacity_availability;
create policy capacity_availability_carrier_manage on public.capacity_availability
for all to authenticated
using (
  exists (
    select 1 from public.carriers ca
    where ca.id = capacity_availability.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
  or driver_id in (select d.id from public.drivers d where d.profile_id = (select auth.uid()))
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
)
with check (
  exists (
    select 1 from public.carriers ca
    where ca.id = capacity_availability.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
  or driver_id in (select d.id from public.drivers d where d.profile_id = (select auth.uid()))
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists pricing_rules_select on public.pricing_rules;
create policy pricing_rules_select on public.pricing_rules
for select to authenticated using (
  carrier_id is null
  or exists (
    select 1 from public.carriers ca
    where ca.id = pricing_rules.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists pricing_rules_manage on public.pricing_rules;
create policy pricing_rules_manage on public.pricing_rules
for all to authenticated
using (
  public.has_role((select auth.uid()), 'admin'::public.app_role)
  or exists (
    select 1 from public.carriers ca
    where ca.id = pricing_rules.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
)
with check (
  public.has_role((select auth.uid()), 'admin'::public.app_role)
  or exists (
    select 1 from public.carriers ca
    where ca.id = pricing_rules.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
);

drop policy if exists route_estimates_select on public.route_estimates;
create policy route_estimates_select on public.route_estimates
for select to authenticated using (
  exists (
    select 1 from public.freights f
    where f.id = route_estimates.freight_id
      and (
        public.is_current_user_company_owner(f.company_id)
        or public.is_current_user_company_member(f.company_id)
      )
  )
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists route_estimates_admin_manage on public.route_estimates;
create policy route_estimates_admin_manage on public.route_estimates
for all to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists freight_quotes_select on public.freight_quotes;
create policy freight_quotes_select on public.freight_quotes
for select to authenticated using (
  exists (
    select 1 from public.freights f
    where f.id = freight_quotes.freight_id
      and (
        public.is_current_user_company_owner(f.company_id)
        or public.is_current_user_company_member(f.company_id)
      )
  )
  or exists (
    select 1 from public.carriers ca
    where ca.id = freight_quotes.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists freight_quotes_admin_manage on public.freight_quotes;
create policy freight_quotes_admin_manage on public.freight_quotes
for all to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists capacity_matches_select on public.capacity_matches;
create policy capacity_matches_select on public.capacity_matches
for select to authenticated using (
  exists (
    select 1 from public.freights f
    where f.id = capacity_matches.freight_id
      and (
        public.is_current_user_company_owner(f.company_id)
        or public.is_current_user_company_member(f.company_id)
      )
  )
  or exists (
    select 1 from public.carriers ca
    where ca.id = capacity_matches.carrier_id
      and public.is_current_user_company_owner(ca.company_id)
  )
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists capacity_matches_admin_manage on public.capacity_matches;
create policy capacity_matches_admin_manage on public.capacity_matches
for all to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

commit;
