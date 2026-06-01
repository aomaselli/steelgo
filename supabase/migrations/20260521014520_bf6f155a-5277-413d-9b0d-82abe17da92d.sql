
-- ENUMS
create type public.app_role as enum ('shipper', 'carrier', 'driver', 'admin');
create type public.freight_status as enum ('draft','published','bidding','matched','contract_pending','contracted','in_transit','delivered','completed','cancelled','disputed');
create type public.freight_category as enum ('traditional','green_low_carbon','green_ev');
create type public.steel_type as enum ('bobina_laminada_frio','bobina_laminada_quente','chapa_grossa','perfil_estrutural','cano_sem_costura','barra_redonda','vergalhao','tubo_galvanizado','blank_estampagem','outro');
create type public.truck_type as enum ('truck_simples','toco','truck','bitruck','carreta','carreta_extendida','rodotrem','bitrem','ev_carreta','ev_truck');
create type public.bid_status as enum ('pending','accepted','rejected','expired','withdrawn');
create type public.contract_status as enum ('draft','awaiting_shipper_signature','awaiting_carrier_signature','active','completed','disputed','cancelled');
create type public.payment_status as enum ('pending','escrow_held','released','refunded','disputed','failed');
create type public.company_tier as enum ('free','pro','enterprise');
create type public.badge_tier as enum ('standard','silver','gold','platinum');
create type public.checkpoint_type as enum ('origin_loading','waypoint','security_checkpoint','destination_unloading','incident');
create type public.security_alert_type as enum ('route_deviation','panic_button','checkpoint_missed','cargo_tamper','driver_id_mismatch');
create type public.security_severity as enum ('low','medium','high','critical');

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  cpf text,
  avatar_url text,
  language text default 'pt',
  is_verified boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- USER_ROLES (canonical role store, separate from profile to prevent privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz default now(),
  unique(user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.get_user_role(_user_id uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = _user_id order by created_at asc limit 1
$$;

-- COMPANIES
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trade_name text,
  cnpj text unique,
  type text,
  address_city text,
  address_state text,
  logo_url text,
  is_verified boolean default false,
  tier public.company_tier default 'free',
  stripe_customer_id text,
  created_at timestamptz default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text default 'member',
  created_at timestamptz default now(),
  unique(company_id, user_id)
);

-- CARRIERS
create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  antt_rntrc text,
  fleet_size integer default 0,
  truck_types public.truck_type[],
  has_ev_trucks boolean default false,
  ev_truck_count integer default 0,
  insurance_expiry date,
  rctr_c_active boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- TRUCKS
create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carriers(id) on delete cascade,
  plate text,
  type public.truck_type,
  is_ev boolean default false,
  created_at timestamptz default now()
);

-- FREIGHTS
create table public.freights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  steel_type public.steel_type,
  weight_tons numeric,
  cargo_value_brl numeric,
  origin_name text, origin_city text, origin_state text, origin_lat numeric, origin_lng numeric,
  dest_name text, dest_city text, dest_state text, dest_lat numeric, dest_lng numeric,
  distance_km numeric,
  category public.freight_category default 'traditional',
  required_truck public.truck_type[],
  pickup_date date,
  budget_brl numeric,
  final_price_brl numeric,
  status public.freight_status default 'draft',
  published_at timestamptz,
  bid_deadline timestamptz,
  matched_carrier_id uuid references public.carriers(id),
  notes text,
  created_at timestamptz default now()
);

-- BIDS
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id),
  driver_id uuid references auth.users(id),
  truck_id uuid references public.trucks(id),
  amount_brl numeric not null,
  toll_brl numeric default 0,
  estimated_hours numeric,
  ev_certified boolean default false,
  status public.bid_status default 'pending',
  submitted_at timestamptz default now(),
  expires_at timestamptz
);

-- CONTRACTS
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references public.bids(id),
  freight_id uuid not null references public.freights(id),
  shipper_company_id uuid not null references public.companies(id),
  carrier_company_id uuid not null references public.companies(id),
  driver_id uuid references auth.users(id),
  truck_id uuid references public.trucks(id),
  total_amount_brl numeric,
  platform_fee_brl numeric,
  carrier_payout_brl numeric,
  status public.contract_status default 'draft',
  shipper_signed_at timestamptz,
  carrier_signed_at timestamptz,
  pdf_url text,
  contract_number text unique,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- CARRIER_SCORES
create table public.carrier_scores (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null unique references public.carriers(id) on delete cascade,
  safety_score numeric default 0,
  delivery_score numeric default 0,
  esg_score numeric default 0,
  security_score numeric default 0,
  client_score numeric default 0,
  overall_score numeric default 0,
  total_freights integer default 0,
  on_time_count integer default 0,
  is_verified boolean default false,
  esg_certified boolean default false,
  badge_tier public.badge_tier default 'standard',
  updated_at timestamptz default now()
);

-- CHECKPOINTS
create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  driver_id uuid references auth.users(id),
  type public.checkpoint_type,
  lat numeric, lng numeric,
  photo_url text,
  qr_seal_code text,
  qr_verified boolean default false,
  expected_at timestamptz,
  recorded_at timestamptz
);

-- ESG_LOGS
create table public.esg_logs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  carrier_id uuid references public.carriers(id),
  truck_id uuid references public.trucks(id),
  freight_id uuid references public.freights(id),
  company_id uuid references public.companies(id),
  distance_km numeric,
  weight_tons numeric,
  is_green boolean default false,
  co2_emitted_kg numeric,
  co2_baseline_kg numeric,
  co2_saved_kg numeric,
  category public.freight_category,
  esg_rating text,
  logged_at timestamptz default now()
);

-- NOTIFICATIONS
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  body text,
  type text,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- SECURITY_ALERTS
create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  freight_id uuid references public.freights(id),
  type public.security_alert_type,
  severity public.security_severity,
  title text,
  description text,
  lat numeric, lng numeric,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- TRIGGER: auto-create profile + role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone, cpf, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'cpf',
    coalesce(new.raw_user_meta_data->>'language', 'pt')
  );

  if new.raw_user_meta_data->>'role' is not null
     and (new.raw_user_meta_data->>'role') in ('shipper','carrier','driver') then
    insert into public.user_roles (user_id, role)
    values (new.id, (new.raw_user_meta_data->>'role')::public.app_role)
    on conflict do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ENABLE RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.carriers enable row level security;
alter table public.trucks enable row level security;
alter table public.freights enable row level security;
alter table public.bids enable row level security;
alter table public.contracts enable row level security;
alter table public.carrier_scores enable row level security;
alter table public.checkpoints enable row level security;
alter table public.esg_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.security_alerts enable row level security;

-- PROFILES
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid());
create policy "profiles_insert_self" on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- USER_ROLES
create policy "user_roles_select_own_or_admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "user_roles_admin_manage" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- COMPANIES
create policy "companies_select" on public.companies for select to authenticated using (
  owner_id = auth.uid()
  or exists(select 1 from public.company_members cm where cm.company_id = id and cm.user_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);
create policy "companies_insert_owner" on public.companies for insert to authenticated with check (owner_id = auth.uid());
create policy "companies_update_owner" on public.companies for update to authenticated using (
  owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')
);

-- COMPANY_MEMBERS
create policy "company_members_select" on public.company_members for select to authenticated using (
  user_id = auth.uid()
  or exists(select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);
create policy "company_members_insert_owner" on public.company_members for insert to authenticated with check (
  exists(select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
);

-- CARRIERS
create policy "carriers_select_all_auth" on public.carriers for select to authenticated using (true);
create policy "carriers_insert_owner" on public.carriers for insert to authenticated with check (
  exists(select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
);
create policy "carriers_update_owner" on public.carriers for update to authenticated using (
  exists(select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);

-- TRUCKS
create policy "trucks_select_auth" on public.trucks for select to authenticated using (true);
create policy "trucks_manage_owner" on public.trucks for all to authenticated
  using (exists(
    select 1 from public.carriers ca join public.companies co on co.id = ca.company_id
    where ca.id = carrier_id and co.owner_id = auth.uid()
  ))
  with check (exists(
    select 1 from public.carriers ca join public.companies co on co.id = ca.company_id
    where ca.id = carrier_id and co.owner_id = auth.uid()
  ));

-- FREIGHTS
create policy "freights_select" on public.freights for select to authenticated using (
  status in ('published','bidding','matched','contract_pending','contracted','in_transit','delivered','completed')
  or created_by = auth.uid()
  or exists(select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);
create policy "freights_insert_owner" on public.freights for insert to authenticated with check (created_by = auth.uid());
create policy "freights_update_owner" on public.freights for update to authenticated using (
  created_by = auth.uid()
  or exists(select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);

-- BIDS
create policy "bids_select_party" on public.bids for select to authenticated using (
  exists(
    select 1 from public.carriers ca join public.companies co on co.id = ca.company_id
    where ca.id = carrier_id and co.owner_id = auth.uid()
  )
  or exists(
    select 1 from public.freights f left join public.companies co on co.id = f.company_id
    where f.id = freight_id and (co.owner_id = auth.uid() or f.created_by = auth.uid())
  )
  or public.has_role(auth.uid(), 'admin')
);
create policy "bids_insert_carrier" on public.bids for insert to authenticated with check (
  exists(
    select 1 from public.carriers ca join public.companies co on co.id = ca.company_id
    where ca.id = carrier_id and co.owner_id = auth.uid()
  )
);
create policy "bids_update_party" on public.bids for update to authenticated using (
  exists(
    select 1 from public.carriers ca join public.companies co on co.id = ca.company_id
    where ca.id = carrier_id and co.owner_id = auth.uid()
  )
  or exists(
    select 1 from public.freights f join public.companies co on co.id = f.company_id
    where f.id = freight_id and co.owner_id = auth.uid()
  )
);

-- CONTRACTS
create policy "contracts_select_party" on public.contracts for select to authenticated using (
  exists(select 1 from public.companies co where co.id = shipper_company_id and co.owner_id = auth.uid())
  or exists(select 1 from public.companies co where co.id = carrier_company_id and co.owner_id = auth.uid())
  or driver_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
);
create policy "contracts_insert_admin" on public.contracts for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy "contracts_update_party" on public.contracts for update to authenticated using (
  exists(select 1 from public.companies co where co.id = shipper_company_id and co.owner_id = auth.uid())
  or exists(select 1 from public.companies co where co.id = carrier_company_id and co.owner_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);

-- CARRIER_SCORES
create policy "carrier_scores_select_all" on public.carrier_scores for select to authenticated using (true);
create policy "carrier_scores_admin_manage" on public.carrier_scores for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- CHECKPOINTS
create policy "checkpoints_select_party" on public.checkpoints for select to authenticated using (
  driver_id = auth.uid()
  or exists(
    select 1 from public.contracts c
    left join public.companies co1 on co1.id = c.shipper_company_id
    left join public.companies co2 on co2.id = c.carrier_company_id
    where c.id = contract_id and (co1.owner_id = auth.uid() or co2.owner_id = auth.uid())
  )
  or public.has_role(auth.uid(), 'admin')
);
create policy "checkpoints_insert_driver" on public.checkpoints for insert to authenticated
  with check (driver_id = auth.uid());

-- ESG_LOGS
create policy "esg_logs_select_party" on public.esg_logs for select to authenticated using (
  exists(select 1 from public.companies co where co.id = company_id and co.owner_id = auth.uid())
  or public.has_role(auth.uid(),'admin')
);
create policy "esg_logs_admin_insert" on public.esg_logs for insert to authenticated
  with check (public.has_role(auth.uid(),'admin'));

-- NOTIFICATIONS
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (profile_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (profile_id = auth.uid());
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or profile_id = auth.uid());

-- SECURITY_ALERTS
create policy "security_alerts_select_party" on public.security_alerts for select to authenticated using (
  exists(
    select 1 from public.contracts c
    left join public.companies co1 on co1.id = c.shipper_company_id
    left join public.companies co2 on co2.id = c.carrier_company_id
    where c.id = contract_id and (co1.owner_id = auth.uid() or co2.owner_id = auth.uid())
  )
  or public.has_role(auth.uid(),'admin')
);
create policy "security_alerts_admin_manage" on public.security_alerts for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
