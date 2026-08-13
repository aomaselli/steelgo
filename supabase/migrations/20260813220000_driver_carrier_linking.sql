-- SteelGo | Driver-carrier invitations and join requests
-- Supports carrier invitation and driver-requested affiliation.
begin;

create or replace function public.normalize_identity_document(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(upper(coalesce(p_value, '')), '[^0-9A-Z]', '', 'g'), '');
$$;

-- Formalize relationships already used throughout the application.
alter table public.drivers
  add column if not exists license_issuer_country text not null default 'BR',
  add column if not exists license_verification_status text not null default 'pending',
  add column if not exists license_verified_at timestamptz,
  add column if not exists license_verified_by uuid references public.profiles(id) on delete set null;

update public.drivers
set license_number = coalesce(license_number, cnh_number),
    license_category = coalesce(license_category, cnh_category),
    license_expiry = coalesce(license_expiry, cnh_expiry),
    license_issuer_country = coalesce(nullif(country_code, ''), 'BR')
where license_number is null
   or license_category is null
   or license_expiry is null;

alter table public.drivers
  drop constraint if exists drivers_license_country_format,
  add constraint drivers_license_country_format
    check (license_issuer_country ~ '^[A-Z]{2}$') not valid,
  drop constraint if exists drivers_license_verification_status_valid,
  add constraint drivers_license_verification_status_valid
    check (license_verification_status in ('pending', 'under_review', 'approved', 'rejected', 'expired')) not valid;

create unique index if not exists drivers_license_identity_uidx
  on public.drivers (
    license_issuer_country,
    public.normalize_identity_document(license_number)
  )
  where public.normalize_identity_document(license_number) is not null;

alter table public.drivers
  drop constraint if exists drivers_carrier_id_fkey,
  add constraint drivers_carrier_id_fkey
    foreign key (carrier_id) references public.carriers(id) on delete cascade
    not valid;

alter table public.drivers
  drop constraint if exists drivers_profile_id_fkey,
  add constraint drivers_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete set null
    not valid;

create table if not exists public.driver_carrier_invitations (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  token_hash text not null unique,
  invited_email text,
  invited_phone text,
  expected_cpf_hash text,
  expected_license_hash text,
  expected_license_country text not null default 'BR',
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_carrier_invitations_status_valid
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint driver_carrier_invitations_expiry_valid
    check (expires_at > created_at),
  constraint driver_carrier_invitations_contact_present
    check (invited_email is not null or invited_phone is not null),
  constraint driver_carrier_invitations_license_country_format
    check (expected_license_country ~ '^[A-Z]{2}$')
);

create unique index if not exists driver_carrier_invitations_pending_driver_uidx
  on public.driver_carrier_invitations (driver_id)
  where status = 'pending';

create index if not exists driver_carrier_invitations_carrier_idx
  on public.driver_carrier_invitations (carrier_id, status, created_at desc);

create table if not exists public.driver_carrier_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  proposed_driver_id uuid references public.drivers(id) on delete set null,
  submitted_cpf text,
  submitted_license_number text not null,
  submitted_license_country text not null,
  submitted_license_category text,
  submitted_license_expiry date,
  status text not null default 'pending',
  message text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_carrier_requests_status_valid
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint driver_carrier_requests_message_length
    check (message is null or char_length(message) <= 500),
  constraint driver_carrier_requests_rejection_length
    check (rejection_reason is null or char_length(rejection_reason) <= 500),
  constraint driver_carrier_requests_license_country_format
    check (submitted_license_country ~ '^[A-Z]{2}$')
);

create unique index if not exists driver_carrier_requests_pending_uidx
  on public.driver_carrier_requests (profile_id, carrier_id)
  where status = 'pending';

create index if not exists driver_carrier_requests_carrier_idx
  on public.driver_carrier_requests (carrier_id, status, created_at desc);

drop trigger if exists driver_carrier_invitations_set_updated_at
  on public.driver_carrier_invitations;
create trigger driver_carrier_invitations_set_updated_at
before update on public.driver_carrier_invitations
for each row execute function public.set_updated_at();

drop trigger if exists driver_carrier_requests_set_updated_at
  on public.driver_carrier_requests;
create trigger driver_carrier_requests_set_updated_at
before update on public.driver_carrier_requests
for each row execute function public.set_updated_at();

alter table public.driver_carrier_invitations enable row level security;
alter table public.driver_carrier_requests enable row level security;

-- Invitation tokens are never selectable. Carrier users see only metadata.
drop policy if exists driver_carrier_invitations_carrier_select
  on public.driver_carrier_invitations;
create policy driver_carrier_invitations_carrier_select
on public.driver_carrier_invitations
for select to authenticated
using (
  public.can_manage_capacity(carrier_id, driver_id)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists driver_carrier_requests_driver_select
  on public.driver_carrier_requests;
create policy driver_carrier_requests_driver_select
on public.driver_carrier_requests
for select to authenticated
using (
  profile_id = (select auth.uid())
  or public.can_manage_capacity(carrier_id, null)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

-- Safe carrier directory: no documents, owner identity, email, phone or fleet details.
create or replace function public.search_carriers_for_driver(
  p_query text default null,
  p_country_code text default null,
  p_limit integer default 20
)
returns table (
  carrier_id uuid,
  company_name text,
  trade_name text,
  country_code text,
  city text,
  subdivision text,
  verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    co.name,
    co.trade_name,
    co.country_code,
    co.address_city,
    co.address_state,
    coalesce(co.is_verified, false)
  from public.carriers c
  join public.companies co on co.id = c.company_id
  where public.has_role((select auth.uid()), 'driver'::public.app_role)
    and c.is_active is true
    and (p_country_code is null or co.country_code = upper(p_country_code))
    and (
      nullif(btrim(p_query), '') is null
      or co.name ilike '%' || btrim(p_query) || '%'
      or co.trade_name ilike '%' || btrim(p_query) || '%'
      or c.antt_rntrc = regexp_replace(p_query, '[^0-9A-Za-z]', '', 'g')
    )
  order by co.is_verified desc, co.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.create_driver_invitation(
  p_driver_id uuid,
  p_email text default null,
  p_phone text default null,
  p_expires_in_hours integer default 168
)
returns table (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_driver public.drivers%rowtype;
  v_token text;
  v_id uuid;
  v_expires_at timestamptz;
begin
  select * into v_driver from public.drivers where id = p_driver_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Driver not found';
  end if;

  if not public.can_manage_capacity(v_driver.carrier_id, null) then
    raise exception using errcode = '42501', message = 'Not authorized to invite for this carrier';
  end if;

  if v_driver.profile_id is not null then
    raise exception using errcode = '22023', message = 'Driver is already linked to an account';
  end if;

  if public.normalize_identity_document(v_driver.license_number) is null then
    raise exception using errcode = '22023', message = 'Driver license is required before invitation';
  end if;

  if v_driver.license_expiry is null or v_driver.license_expiry < current_date then
    raise exception using errcode = '22023', message = 'A valid, unexpired driver license is required before invitation';
  end if;

  if nullif(lower(btrim(p_email)), '') is null
     and nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '') is null then
    raise exception using errcode = '22023', message = 'Email or phone is required';
  end if;

  if p_expires_in_hours not between 1 and 720 then
    raise exception using errcode = '22023', message = 'Invitation validity must be between 1 and 720 hours';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_driver_id::text, 10));

  update public.driver_carrier_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where driver_id = p_driver_id and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + make_interval(hours => p_expires_in_hours);

  insert into public.driver_carrier_invitations (
    carrier_id, driver_id, token_hash, invited_email, invited_phone,
    expected_cpf_hash, expected_license_hash, expected_license_country,
    expires_at, created_by
  ) values (
    v_driver.carrier_id,
    v_driver.id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    nullif(lower(btrim(p_email)), ''),
    nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''),
    case when public.normalize_identity_document(v_driver.cpf) is null then null
      else encode(extensions.digest(public.normalize_identity_document(v_driver.cpf), 'sha256'), 'hex') end,
    case when public.normalize_identity_document(v_driver.license_number) is null then null
      else encode(extensions.digest(public.normalize_identity_document(v_driver.license_number), 'sha256'), 'hex') end,
    v_driver.license_issuer_country,
    v_expires_at,
    (select auth.uid())
  ) returning id into v_id;

  return query select v_id, v_token, v_expires_at;
end;
$$;

create or replace function public.accept_driver_invitation(
  p_token text,
  p_cpf text,
  p_license_number text,
  p_license_country text default 'BR'
)
returns table (
  driver_id uuid,
  carrier_id uuid,
  linked_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_invitation public.driver_carrier_invitations%rowtype;
  v_profile public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not public.has_role((select auth.uid()), 'driver'::public.app_role) then
    raise exception using errcode = '42501', message = 'Driver role required';
  end if;

  select * into v_invitation
  from public.driver_carrier_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found';
  end if;

  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    if v_invitation.status = 'pending' and v_invitation.expires_at <= now() then
      update public.driver_carrier_invitations
      set status = 'expired', updated_at = now()
      where id = v_invitation.id;
    end if;
    raise exception using errcode = '22023', message = 'Invitation is no longer valid';
  end if;

  select * into v_profile from public.profiles where id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  if v_invitation.invited_email is not null
     and lower(coalesce(v_profile.email, '')) <> v_invitation.invited_email then
    raise exception using errcode = '42501', message = 'Invitation email does not match the signed-in account';
  end if;

  if v_invitation.invited_email is null
     and v_invitation.invited_phone is not null
     and regexp_replace(coalesce(v_profile.phone, ''), '[^0-9+]', '', 'g')
         <> v_invitation.invited_phone then
    raise exception using errcode = '42501', message = 'Invitation phone does not match the signed-in account';
  end if;

  if v_invitation.expected_cpf_hash is not null
     and encode(
       extensions.digest(public.normalize_identity_document(p_cpf), 'sha256'),
       'hex'
     ) <> v_invitation.expected_cpf_hash then
    raise exception using errcode = '42501', message = 'CPF does not match the invited driver';
  end if;

  if v_invitation.expected_license_hash is not null
     and (
       upper(p_license_country) <> v_invitation.expected_license_country
       or encode(
         extensions.digest(public.normalize_identity_document(p_license_number), 'sha256'),
         'hex'
       ) <> v_invitation.expected_license_hash
     ) then
    raise exception using errcode = '42501', message = 'Driver license does not match the invitation';
  end if;

  if exists (
    select 1 from public.drivers d
    where d.profile_id = (select auth.uid()) and d.id <> v_invitation.driver_id
  ) then
    raise exception using errcode = '23505', message = 'Account is already linked to another driver record';
  end if;

  update public.drivers
  set profile_id = (select auth.uid()),
      cpf = coalesce(cpf, nullif(btrim(p_cpf), '')),
      license_number = coalesce(license_number, public.normalize_identity_document(p_license_number)),
      license_issuer_country = upper(p_license_country),
      updated_at = now()
  where id = v_invitation.driver_id and profile_id is null;

  if not found then
    raise exception using errcode = '23505', message = 'Driver was linked by another request';
  end if;

  update public.driver_carrier_invitations
  set status = 'accepted', accepted_by = (select auth.uid()),
      accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  update public.driver_carrier_requests
  set status = 'cancelled', updated_at = now()
  where profile_id = (select auth.uid()) and status = 'pending';

  return query select v_invitation.driver_id, v_invitation.carrier_id, now();
end;
$$;

create or replace function public.request_driver_carrier_link(
  p_carrier_id uuid,
  p_license_number text,
  p_license_country text default 'BR',
  p_license_category text default null,
  p_license_expiry date default null,
  p_cpf text default null,
  p_message text default null
)
returns table (
  request_id uuid,
  request_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_created_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not public.has_role((select auth.uid()), 'driver'::public.app_role) then
    raise exception using errcode = '42501', message = 'Driver role required';
  end if;

  if exists (select 1 from public.drivers where profile_id = (select auth.uid())) then
    raise exception using errcode = '22023', message = 'Account is already linked to a carrier';
  end if;

  if not exists (select 1 from public.carriers where id = p_carrier_id and is_active is true) then
    raise exception using errcode = 'P0002', message = 'Carrier not found';
  end if;

  if char_length(coalesce(p_message, '')) > 500 then
    raise exception using errcode = '22023', message = 'Message is too long';
  end if;

  if public.normalize_identity_document(p_license_number) is null then
    raise exception using errcode = '22023', message = 'Driver license number is required';
  end if;

  if upper(p_license_country) !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Invalid license country';
  end if;

  if p_license_expiry is not null and p_license_expiry < current_date then
    raise exception using errcode = '22023', message = 'Driver license is expired';
  end if;

  insert into public.driver_carrier_requests (
    profile_id, carrier_id, submitted_cpf, submitted_license_number,
    submitted_license_country, submitted_license_category,
    submitted_license_expiry, message
  ) values (
    (select auth.uid()), p_carrier_id, nullif(btrim(p_cpf), ''),
    public.normalize_identity_document(p_license_number), upper(p_license_country),
    nullif(upper(btrim(p_license_category)), ''), p_license_expiry,
    nullif(btrim(p_message), '')
  )
  on conflict (profile_id, carrier_id) where status = 'pending'
  do update set
    submitted_cpf = excluded.submitted_cpf,
    submitted_license_number = excluded.submitted_license_number,
    submitted_license_country = excluded.submitted_license_country,
    submitted_license_category = excluded.submitted_license_category,
    submitted_license_expiry = excluded.submitted_license_expiry,
    message = excluded.message,
    updated_at = now()
  returning id, created_at into v_id, v_created_at;

  return query select v_id, 'pending'::text, v_created_at;
end;
$$;

create or replace function public.review_driver_carrier_request(
  p_request_id uuid,
  p_decision text,
  p_driver_id uuid default null,
  p_rejection_reason text default null
)
returns table (
  request_id uuid,
  request_status text,
  driver_id uuid,
  profile_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request public.driver_carrier_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_driver public.drivers%rowtype;
  v_driver_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Decision must be approved or rejected';
  end if;

  select * into v_request
  from public.driver_carrier_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Request not found';
  end if;

  if not public.can_manage_capacity(v_request.carrier_id, null) then
    raise exception using errcode = '42501', message = 'Not authorized to review this request';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Request was already reviewed';
  end if;

  if p_decision = 'rejected' then
    update public.driver_carrier_requests
    set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now(),
        rejection_reason = nullif(btrim(p_rejection_reason), ''), updated_at = now()
    where id = v_request.id;

    return query select v_request.id, 'rejected'::text, null::uuid, v_request.profile_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request.profile_id::text, 11));

  if exists (select 1 from public.drivers where profile_id = v_request.profile_id) then
    raise exception using errcode = '23505', message = 'Driver account was already linked to a carrier';
  end if;

  select * into v_profile from public.profiles where id = v_request.profile_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  if p_driver_id is null then
    select d.id into p_driver_id
    from public.drivers d
    where d.carrier_id = v_request.carrier_id
      and d.profile_id is null
      and d.license_issuer_country = v_request.submitted_license_country
      and public.normalize_identity_document(d.license_number)
          = public.normalize_identity_document(v_request.submitted_license_number)
    limit 1;
  end if;

  if p_driver_id is not null then
    select * into v_driver from public.drivers where id = p_driver_id for update;
    if not found or v_driver.carrier_id <> v_request.carrier_id then
      raise exception using errcode = '22023', message = 'Driver record does not belong to this carrier';
    end if;
    if v_driver.profile_id is not null then
      raise exception using errcode = '23505', message = 'Driver record is already linked';
    end if;

    update public.drivers
    set profile_id = v_request.profile_id,
        cpf = coalesce(cpf, v_request.submitted_cpf, v_profile.cpf),
        license_number = coalesce(license_number, v_request.submitted_license_number),
        license_issuer_country = v_request.submitted_license_country,
        license_category = coalesce(license_category, v_request.submitted_license_category),
        license_expiry = coalesce(license_expiry, v_request.submitted_license_expiry),
        license_verification_status = 'under_review',
        updated_at = now()
    where id = v_driver.id;
    v_driver_id := v_driver.id;
  else
    insert into public.drivers (
      carrier_id, profile_id, full_name, cpf, country_code,
      license_number, license_issuer_country, license_category, license_expiry,
      license_verification_status, is_active, is_verified
    ) values (
      v_request.carrier_id,
      v_request.profile_id,
      coalesce(nullif(btrim(v_profile.full_name), ''), 'Motorista'),
      coalesce(nullif(btrim(v_request.submitted_cpf), ''), nullif(btrim(v_profile.cpf), '')),
      v_request.submitted_license_country,
      v_request.submitted_license_number,
      v_request.submitted_license_country,
      v_request.submitted_license_category,
      v_request.submitted_license_expiry,
      'under_review',
      true,
      false
    ) returning id into v_driver_id;
  end if;

  update public.driver_carrier_requests
  set status = case when id = v_request.id then 'approved' else 'cancelled' end,
      reviewed_by = case when id = v_request.id then (select auth.uid()) else reviewed_by end,
      reviewed_at = case when id = v_request.id then now() else reviewed_at end,
      proposed_driver_id = case when id = v_request.id then v_driver_id else proposed_driver_id end,
      updated_at = now()
  where profile_id = v_request.profile_id and status = 'pending';

  update public.driver_carrier_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where driver_id = v_driver_id and status = 'pending';

  return query select v_request.id, 'approved'::text, v_driver_id, v_request.profile_id;
end;
$$;

create or replace function public.cancel_driver_carrier_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.driver_carrier_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id
    and profile_id = (select auth.uid())
    and status = 'pending';
  return found;
end;
$$;

create or replace function public.review_driver_license(
  p_driver_id uuid,
  p_status text,
  p_reason text default null
)
returns table (
  driver_id uuid,
  verification_status text,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_driver public.drivers%rowtype;
  v_final_status text;
begin
  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Driver not found';
  end if;

  if not public.can_manage_capacity(v_driver.carrier_id, null)
     and not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'Not authorized to review this license';
  end if;

  if p_status not in ('under_review', 'approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Invalid license review status';
  end if;

  if p_status = 'approved' and (
    public.normalize_identity_document(v_driver.license_number) is null
    or v_driver.license_expiry is null
    or v_driver.license_expiry < current_date
  ) then
    raise exception using errcode = '22023', message = 'A valid, unexpired license is required';
  end if;

  v_final_status := case
    when v_driver.license_expiry is not null and v_driver.license_expiry < current_date
      then 'expired'
    else p_status
  end;

  update public.drivers
  set license_verification_status = v_final_status,
      license_verified_at = case when v_final_status = 'approved' then now() else null end,
      license_verified_by = (select auth.uid()),
      is_verified = (v_final_status = 'approved'),
      regulatory_attributes = jsonb_set(
        coalesce(regulatory_attributes, '{}'::jsonb),
        '{license_review_reason}',
        to_jsonb(coalesce(nullif(btrim(p_reason), ''), '')),
        true
      ),
      updated_at = now()
  where id = p_driver_id;

  return query
  select d.id, d.license_verification_status, d.license_verified_at
  from public.drivers d where d.id = p_driver_id;
end;
$$;

create or replace function public.enforce_capacity_driver_license()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_driver public.drivers%rowtype;
begin
  if new.status not in ('available', 'reserved') then
    return new;
  end if;

  select * into v_driver from public.drivers where id = new.driver_id;
  if not found
     or v_driver.license_verification_status <> 'approved'
     or v_driver.license_expiry is null
     or v_driver.license_expiry < current_date
     or not v_driver.is_verified then
    raise exception using
      errcode = '22023',
      message = 'Approved and unexpired driver license is required for availability';
  end if;

  return new;
end;
$$;

drop trigger if exists capacity_availability_enforce_driver_license
  on public.capacity_availability;
create trigger capacity_availability_enforce_driver_license
before insert or update of driver_id, status
on public.capacity_availability
for each row execute function public.enforce_capacity_driver_license();

-- Mutations are RPC-only; direct table writes remain unavailable.
revoke all on public.driver_carrier_invitations from anon, authenticated;
revoke all on public.driver_carrier_requests from anon, authenticated;
grant select (
  id, carrier_id, driver_id, invited_email, invited_phone, status,
  expires_at, accepted_by, accepted_at, revoked_at, created_by,
  created_at, updated_at
) on public.driver_carrier_invitations to authenticated;
grant select on public.driver_carrier_requests to authenticated;

revoke all on function public.search_carriers_for_driver(text, text, integer) from public, anon;
grant execute on function public.search_carriers_for_driver(text, text, integer) to authenticated;

revoke all on function public.create_driver_invitation(uuid, text, text, integer) from public, anon;
grant execute on function public.create_driver_invitation(uuid, text, text, integer) to authenticated;

revoke all on function public.accept_driver_invitation(text, text, text, text) from public, anon;
grant execute on function public.accept_driver_invitation(text, text, text, text) to authenticated;

revoke all on function public.request_driver_carrier_link(uuid, text, text, text, date, text, text) from public, anon;
grant execute on function public.request_driver_carrier_link(uuid, text, text, text, date, text, text) to authenticated;

revoke all on function public.review_driver_carrier_request(uuid, text, uuid, text) from public, anon;
grant execute on function public.review_driver_carrier_request(uuid, text, uuid, text) to authenticated;

revoke all on function public.cancel_driver_carrier_request(uuid) from public, anon;
grant execute on function public.cancel_driver_carrier_request(uuid) to authenticated;

revoke all on function public.review_driver_license(uuid, text, text) from public, anon;
grant execute on function public.review_driver_license(uuid, text, text) to authenticated;

commit;
