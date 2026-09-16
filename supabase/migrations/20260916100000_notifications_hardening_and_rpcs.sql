-- =============================================================================
-- MODULO 2 (1/9) : NOTIFICACOES INTERNAS  -  higiene de privilegios e RPCs
-- =============================================================================
-- O QUE EXISTIA, apurado por leitura de catalogo e codigo (2026-09-16):
--   * public.notifications (20260521014520) com RLS e tres policies, mas
--     INSERT/UPDATE/DELETE/TRUNCATE concedidos a anon e authenticated pelo
--     default privilege do schema. TRUNCATE nao e filtrado por RLS;
--   * nenhum produtor: nem trigger, nem RPC, nem tela inseria linhas;
--   * o Topbar renderizava apenas o icone.
--
-- O QUE MUDA:
--   * escrita direta revogada de TODOS os papeis de cliente, inclusive
--     service_role (escrita exclusivamente por RPC, politica do modulo);
--   * leitura direta revogada de anon e authenticated: o cliente le por RPC;
--   * colunas read_at, case_id, contract_id;
--   * helper notify_user (EXECUTE so postgres) usado pelas RPCs de disputa;
--   * RPCs list_my_notifications, count_my_unread_notifications e
--     mark_notifications_read, todas derivando o ator de auth.uid().
--
-- LIMITE HONESTO: notificacao INTERNA (in-app). Nao existe e-mail nem push.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. privilegios e policies
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.notifications
  from public, anon, authenticated, service_role;
revoke select on public.notifications from public, anon, authenticated;

drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_select_own on public.notifications;

-- -----------------------------------------------------------------------------
-- 2. colunas
-- -----------------------------------------------------------------------------
alter table public.notifications
  add column read_at     timestamptz null,
  add column case_id     uuid        null,
  add column contract_id uuid        null;

alter table public.notifications
  add constraint notifications_read_coherent
  check (read_at is null or is_read is true);
alter table public.notifications
  add constraint notifications_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.notifications
  add constraint notifications_contract_fk
  foreign key (contract_id) references public.contracts(id) on delete restrict;

create index notifications_profile_unread_idx
  on public.notifications (profile_id, is_read, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. helper interno de producao
-- -----------------------------------------------------------------------------
-- Insere uma notificacao para um usuario. Usuario sem perfil (FK) e ignorado
-- em silencio: notificar nunca pode derrubar a operacao que a originou.
create function public.notify_user(
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_link        text,
  p_case_id     uuid,
  p_contract_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return null;
  end if;
  insert into public.notifications (profile_id, title, body, type, link, is_read, case_id, contract_id)
  values (p_user_id, p_title, p_body, p_type, p_link, false, p_case_id, p_contract_id)
  returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.notify_user(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPCs de leitura e de marcacao (ator = auth.uid())
-- -----------------------------------------------------------------------------
create function public.list_my_notifications(
  p_limit       integer default 50,
  p_unread_only boolean default false
)
returns table (
  id          uuid,
  type        text,
  title       text,
  body        text,
  link        text,
  is_read     boolean,
  read_at     timestamptz,
  created_at  timestamptz,
  case_id     uuid,
  contract_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'list_my_notifications: chamador nao autenticado';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023',
      message = 'list_my_notifications: p_limit deve estar entre 1 e 200';
  end if;
  return query
    select n.id, n.type, n.title, n.body, n.link, coalesce(n.is_read, false), n.read_at,
           n.created_at, n.case_id, n.contract_id
      from public.notifications n
     where n.profile_id = v_actor
       and (not coalesce(p_unread_only, false) or coalesce(n.is_read, false) = false)
     order by n.created_at desc, n.id desc
     limit p_limit;
end;
$fn$;

create function public.count_my_unread_notifications()
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::integer
    from public.notifications n
   where n.profile_id = (select auth.uid())
     and coalesce(n.is_read, false) = false
$fn$;

-- Marca como lidas SOMENTE notificacoes do proprio ator. Idempotente por
-- natureza (marcar lida o que ja esta lido nao altera nada): sem request_id.
create function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_n     integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'mark_notifications_read: chamador nao autenticado';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200
     or exists (select 1 from unnest(p_ids) x where x is null) then
    raise exception using errcode = '22023',
      message = 'mark_notifications_read: informe de 1 a 200 identificadores, nenhum nulo';
  end if;
  update public.notifications n
     set is_read = true, read_at = now()
   where n.profile_id = v_actor
     and n.id = any(p_ids)
     and coalesce(n.is_read, false) = false;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.list_my_notifications(integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.count_my_unread_notifications()
  from public, anon, authenticated, service_role;
revoke all on function public.mark_notifications_read(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_notifications(integer, boolean) to authenticated, service_role;
grant execute on function public.count_my_unread_notifications() to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated, service_role;

comment on table public.notifications is
  'Notificacoes INTERNAS (in-app). Escrita exclusivamente por RPC/helper; '
  'leitura por list_my_notifications. Nao existe e-mail nem push.';

-- -----------------------------------------------------------------------------
-- 5. assertivas fail-closed
-- -----------------------------------------------------------------------------
do $$
declare
  v_priv text;
  v_r    text;
  v_n    int;
begin
  foreach v_r in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(v_r, 'public.notifications', v_priv) then
        raise exception 'notifications: % ainda tem % direto', v_r, v_priv;
      end if;
    end loop;
  end loop;
  if has_table_privilege('anon', 'public.notifications', 'SELECT')
     or has_table_privilege('authenticated', 'public.notifications', 'SELECT') then
    raise exception 'notifications: SELECT direto ainda concedido a cliente';
  end if;
  select count(*) into v_n from pg_policies where tablename = 'notifications';
  if v_n <> 0 then
    raise exception 'notifications: % policies remanescentes', v_n;
  end if;
  -- helper: so postgres
  if exists (select 1 from pg_proc p
               cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = 'public.notify_user(uuid,text,text,text,text,uuid,uuid)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or a.grantee::regrole::text <> 'postgres')) then
    raise exception 'notify_user: EXECUTE concedido a papel alem de postgres';
  end if;
  -- RPCs: authenticated e service_role, nunca PUBLIC/anon
  if exists (select 1 from pg_proc p
               cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.pronamespace = 'public'::regnamespace
                and p.proname in ('list_my_notifications', 'count_my_unread_notifications',
                                  'mark_notifications_read')
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or a.grantee::regrole::text = 'anon')) then
    raise exception 'notifications: RPC executavel por PUBLIC ou anon';
  end if;
end $$;

commit;
