-- Break the companies <-> company_members RLS recursion without weakening tenant isolation.
begin;

create or replace function public.is_current_user_company_member(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = _company_id
      and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_current_user_company_owner(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = _company_id
      and c.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.is_current_user_company_member(uuid) from public;
revoke all on function public.is_current_user_company_member(uuid) from anon;
grant execute on function public.is_current_user_company_member(uuid) to authenticated;

revoke all on function public.is_current_user_company_owner(uuid) from public;
revoke all on function public.is_current_user_company_owner(uuid) from anon;
grant execute on function public.is_current_user_company_owner(uuid) to authenticated;

drop policy if exists companies_select on public.companies;
create policy companies_select
on public.companies
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_current_user_company_member(id)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

drop policy if exists company_members_insert_owner on public.company_members;
create policy company_members_insert_owner
on public.company_members
for insert
to authenticated
with check (
  public.is_current_user_company_owner(company_id)
);

drop policy if exists company_members_select on public.company_members;
create policy company_members_select
on public.company_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_current_user_company_owner(company_id)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

commit;
