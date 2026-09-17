-- =============================================================================
-- MODULO 3 - 80/81: seguranca legada (corrigida nesta entrega)
--   * trucks: SELECT deixa de ser "qualquer autenticado"; passa a owner/membros
--     operacionais da transportadora, motorista vinculado a transportadora, partes
--     de contrato visivel e admin;
--   * checkpoints, driver_positions, security_alerts, security_alerts_tracking:
--     CONGELADAS - DML revogado para anon/authenticated/service_role, policies
--     legadas removidas, leitura historica somente administrativa por RPC;
--   * bids: INSERT/UPDATE/DELETE direto revogados (place_bid);
--   * esg_logs: DML direto revogado;
--   * payments (legado Stripe): SELECT revogado de anon/authenticated (0 chamadores).
-- =============================================================================
begin;

-- trucks ----------------------------------------------------------------------
drop policy if exists trucks_select_auth on public.trucks;
create policy trucks_select_scoped on public.trucks
  for select to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or exists (select 1 from public.carriers ca where ca.id = trucks.carrier_id and public.is_company_viewer(ca.company_id))
    or exists (select 1 from public.drivers d join public.carriers ca on ca.id = d.carrier_id
                where d.profile_id = (select auth.uid()) and ca.id = trucks.carrier_id)
    or exists (select 1 from public.contracts c where c.truck_id = trucks.id and public.is_contract_visible(c.id))
  );
revoke all on public.trucks from anon;

-- tabelas legadas congeladas --------------------------------------------------
revoke insert, update, delete, truncate, select on public.checkpoints from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, select on public.driver_positions from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, select on public.security_alerts from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, select on public.security_alerts_tracking from public, anon, authenticated, service_role;
grant select on public.checkpoints, public.driver_positions, public.security_alerts, public.security_alerts_tracking to service_role;
drop policy if exists checkpoints_insert_driver on public.checkpoints;
drop policy if exists checkpoints_select_party on public.checkpoints;
drop policy if exists driver_positions_insert_own on public.driver_positions;
drop policy if exists driver_positions_select_party on public.driver_positions;
drop policy if exists driver_positions_update_own on public.driver_positions;
drop policy if exists security_alerts_admin_manage on public.security_alerts;
drop policy if exists security_alerts_select_party on public.security_alerts;
drop policy if exists alerts_tracking_insert_driver on public.security_alerts_tracking;
drop policy if exists alerts_tracking_select_party on public.security_alerts_tracking;
comment on table public.checkpoints is 'LEGADO (congelado em 2026-09-17, Modulo 3): substituido por trip_checkpoints. Leitura historica so por RPC administrativa.';
comment on table public.driver_positions is 'LEGADO (congelado em 2026-09-17, Modulo 3): substituido por trip_locations. Leitura historica so por RPC administrativa.';
comment on table public.security_alerts is 'LEGADO (congelado em 2026-09-17, Modulo 3): substituido por trip_exceptions/operational_alerts. Leitura historica so por RPC administrativa.';
comment on table public.security_alerts_tracking is 'LEGADO (congelado em 2026-09-17, Modulo 3): substituido por trip_locations. Leitura historica so por RPC administrativa.';

create function public.list_legacy_operational_records(p_kind text, p_limit integer default 200)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_actor uuid := public.require_steelgo_admin('list_legacy_operational_records');
begin
  if p_kind = 'checkpoints' then
    return query select to_jsonb(c) - 'driver_id' || jsonb_build_object('driver_ref', left(md5(coalesce(c.driver_id::text, '')), 8)) from public.checkpoints c order by c.recorded_at desc nulls last limit least(coalesce(p_limit, 200), 1000);
  elsif p_kind = 'driver_positions' then
    return query select to_jsonb(p) - 'driver_id' || jsonb_build_object('driver_ref', left(md5(p.driver_id::text), 8)) from public.driver_positions p order by p.updated_at desc limit least(coalesce(p_limit, 200), 1000);
  elsif p_kind = 'security_alerts' then
    return query select to_jsonb(a) from public.security_alerts a order by a.created_at desc nulls last limit least(coalesce(p_limit, 200), 1000);
  elsif p_kind = 'security_alerts_tracking' then
    return query select to_jsonb(t) - 'driver_id' || jsonb_build_object('driver_ref', left(md5(t.driver_id::text), 8)) from public.security_alerts_tracking t order by t.recorded_at desc limit least(coalesce(p_limit, 200), 1000);
  else
    raise exception using errcode = '22023', message = 'list_legacy_operational_records: kind invalido';
  end if;
end $fn$;
revoke all on function public.list_legacy_operational_records(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_legacy_operational_records(text, integer) to authenticated, service_role;

-- bids ------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.bids from public, anon, authenticated, service_role;
revoke select on public.bids from anon;
drop policy if exists bids_insert_carrier on public.bids;
drop policy if exists bids_update_party on public.bids;

-- esg_logs (leitura por policy permanece; escrita so por processo governado) --
revoke insert, update, delete, truncate on public.esg_logs from public, anon, authenticated, service_role;
revoke select on public.esg_logs from anon;
drop policy if exists esg_logs_admin_insert on public.esg_logs;

-- payments (legado Stripe): zero chamadores reais no frontend --------------------
revoke all on public.payments from anon, authenticated;

-- capacity_availability / capacity_matches / route_estimates: anon nunca --------
revoke all on public.capacity_availability, public.capacity_matches, public.route_estimates from anon;

-- is_current_user_company_member: membros revogados deixam de contar (tightening)
create or replace function public.is_current_user_company_member(_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.company_members cm
     where cm.company_id = _company_id and cm.user_id = (select auth.uid()) and cm.status = 'active');
$function$;

commit;
