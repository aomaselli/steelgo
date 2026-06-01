
create table if not exists public.driver_positions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  accuracy numeric,
  updated_at timestamptz not null default now(),
  unique (driver_id, contract_id)
);

create index if not exists driver_positions_contract_idx on public.driver_positions (contract_id);
create index if not exists driver_positions_driver_idx on public.driver_positions (driver_id);

alter table public.driver_positions enable row level security;

create policy "driver_positions_insert_own"
  on public.driver_positions for insert to authenticated
  with check (driver_id = auth.uid());

create policy "driver_positions_update_own"
  on public.driver_positions for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

create policy "driver_positions_select_party"
  on public.driver_positions for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.contracts c
      left join public.companies co1 on co1.id = c.shipper_company_id
      left join public.companies co2 on co2.id = c.carrier_company_id
      where c.id = driver_positions.contract_id
        and (co1.owner_id = auth.uid() or co2.owner_id = auth.uid())
    )
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  );
