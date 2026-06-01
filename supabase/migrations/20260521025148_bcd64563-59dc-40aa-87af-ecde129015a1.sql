
-- cargo-photos bucket for checkpoint photos
insert into storage.buckets (id, name, public) values ('cargo-photos', 'cargo-photos', false)
on conflict (id) do nothing;

-- Drivers can upload their own checkpoint photos
create policy "cargo_photos_driver_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'cargo-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cargo_photos_driver_read" on storage.objects for select to authenticated
using (bucket_id = 'cargo-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tracking pings while panic alert is active
create table public.security_alerts_tracking (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null,
  driver_id uuid not null,
  lat numeric,
  lng numeric,
  recorded_at timestamptz not null default now()
);

alter table public.security_alerts_tracking enable row level security;

create policy "alerts_tracking_insert_driver" on public.security_alerts_tracking
for insert to authenticated with check (driver_id = auth.uid());

create policy "alerts_tracking_select_party" on public.security_alerts_tracking
for select to authenticated using (
  driver_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role)
);

create index idx_alerts_tracking_alert on public.security_alerts_tracking(alert_id, recorded_at desc);
