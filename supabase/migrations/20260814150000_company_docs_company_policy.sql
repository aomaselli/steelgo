begin;

drop policy if exists "company_docs_select_company_owner_or_member" on storage.objects;
drop policy if exists "company_docs_insert_company_owner_or_member" on storage.objects;
drop policy if exists "company_docs_update_company_owner_or_member" on storage.objects;

drop policy if exists "company_docs_insert_company_owner_only" on storage.objects;
drop policy if exists "company_docs_update_company_owner_only" on storage.objects;

drop policy if exists "company_docs_insert_owner_or_admin" on storage.objects;
drop policy if exists "company_docs_update_owner_or_admin" on storage.objects;

create policy "company_docs_select_company_owner_or_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'company-docs'
  and coalesce((storage.foldername(name))[1], '') <> ''
  and (
    exists (
      select 1
      from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.company_members cm
      where cm.company_id::text = (storage.foldername(name))[1]
        and cm.user_id = auth.uid()
        and cm.member_role in ('owner', 'member')
    )
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

create policy "company_docs_insert_owner_or_admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-docs'
  and coalesce((storage.foldername(name))[1], '') <> ''
  and (
    exists (
      select 1
      from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.company_members cm
      where cm.company_id::text = (storage.foldername(name))[1]
        and cm.user_id = auth.uid()
        and cm.member_role = 'owner'
    )
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

create policy "company_docs_update_owner_or_admin"
on storage.objects for update to authenticated
using (
  bucket_id = 'company-docs'
  and coalesce((storage.foldername(name))[1], '') <> ''
  and (
    exists (
      select 1
      from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.company_members cm
      where cm.company_id::text = (storage.foldername(name))[1]
        and cm.user_id = auth.uid()
        and cm.member_role = 'owner'
    )
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
with check (
  bucket_id = 'company-docs'
  and coalesce((storage.foldername(name))[1], '') <> ''
  and (
    exists (
      select 1
      from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.company_members cm
      where cm.company_id::text = (storage.foldername(name))[1]
        and cm.user_id = auth.uid()
        and cm.member_role = 'owner'
    )
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

commit;
