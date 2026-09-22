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
--
-- ROLLOUT SEM INDISPONIBILIDADE (ajuste feito antes de qualquer publicacao):
--   Esta migration ainda NAO foi aplicada em nenhum banco remoto. A retirada do
--   acesso legado de `authenticated` (grants + policies) foi ADIADA para uma
--   migration posterior, porque ela e aplicada em transacao propria: entre esta
--   migration e a proxima o frontend M2 ficaria quebrado, e uma falha no meio do
--   `db push` deixaria producao presa nesse estado.
--     * frontend M2 servido hoje em producao: commit aaa9751c60e74bbe8a887ee016032aa655a89193
--     * frontend M3 alvo do rollout:          commit b5075949986be9be86d818b24dc604ab6d3085a6
--   Continuam vigentes aqui, sem alteracao, TODOS os demais hardenings (trucks,
--   esg_logs, payments, capacity/matches/route_estimates, ACL de funcoes,
--   is_current_user_company_member e a RPC administrativa de leitura historica).
--   O acesso legado preservado e exatamente o que ja existe em producao hoje:
--   nada novo e concedido e nenhuma policy e recriada ou reescrita.
--   A REVOGACAO DEFINITIVA e OBRIGATORIA e deve vir em migration posterior,
--   aplicada somente apos o frontend M3 estar em Production e o smoke (publico e
--   autenticado) ser aprovado. A publicacao do Modulo 3 NAO estara encerrada
--   enquanto essa revogacao nao for aplicada.
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
-- anon, PUBLIC e service_role perdem o acesso agora (nao sao usados pelo M2).
-- ADIADO (rollout): o revoke de `authenticated` e os 9 `drop policy` destas
-- quatro tabelas saem na migration de revogacao definitiva, pos-deploy do M3.
revoke insert, update, delete, truncate, select on public.checkpoints from public, anon, service_role;
revoke insert, update, delete, truncate, select on public.driver_positions from public, anon, service_role;
revoke insert, update, delete, truncate, select on public.security_alerts from public, anon, service_role;
revoke insert, update, delete, truncate, select on public.security_alerts_tracking from public, anon, service_role;
grant select on public.checkpoints, public.driver_positions, public.security_alerts, public.security_alerts_tracking to service_role;
-- policies legadas preservadas TEMPORARIAMENTE (literalmente como chegam das
-- migrations anteriores; nenhuma e recriada aqui):
--   checkpoints_insert_driver, checkpoints_select_party,
--   driver_positions_insert_own, driver_positions_select_party, driver_positions_update_own,
--   security_alerts_admin_manage, security_alerts_select_party,
--   alerts_tracking_insert_driver, alerts_tracking_select_party
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
-- ADIADO (rollout): o revoke de `authenticated` e os 2 `drop policy` de bids
-- saem na migration de revogacao definitiva (o M2 ainda envia proposta por INSERT
-- direto; o M3 ja usa public.place_bid).
revoke insert, update, delete, truncate on public.bids from public, anon, service_role;
revoke select on public.bids from anon;
-- policies preservadas TEMPORARIAMENTE: bids_insert_carrier, bids_update_party

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

-- -----------------------------------------------------------------------------
-- Auditoria fail-closed do estado TRANSITORIO desta entrega
-- -----------------------------------------------------------------------------
do $audit$
declare
  r       record;
  v_tab   text;
  v_pol   text;
  v_cmd   "char";
  v_roles name[];
  v_qual  text;
  v_chk   text;
  v_n     integer;
begin
  -- 1) RLS continua habilitada nas cinco tabelas legadas
  for v_tab in select unnest(array['checkpoints','driver_positions','security_alerts','security_alerts_tracking','bids']) loop
    if not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_tab and c.relrowsecurity) then
      raise exception 'auditoria 81: RLS desabilitada em public.%', v_tab;
    end if;
  end loop;

  -- 2) as 11 policies legadas continuam presentes, com comando/roles/predicados esperados
  for r in
    select * from (values
      ('checkpoints','checkpoints_select_party','r','driver_id',null::text),
      ('checkpoints','checkpoints_insert_driver','a',null,'driver_id'),
      ('driver_positions','driver_positions_select_party','r','driver_id',null),
      ('driver_positions','driver_positions_insert_own','a',null,'driver_id'),
      ('driver_positions','driver_positions_update_own','w','driver_id','driver_id'),
      ('security_alerts','security_alerts_select_party','r','contracts',null),
      ('security_alerts','security_alerts_admin_manage','*','has_role','has_role'),
      ('security_alerts_tracking','alerts_tracking_select_party','r','driver_id',null),
      ('security_alerts_tracking','alerts_tracking_insert_driver','a',null,'driver_id'),
      ('bids','bids_insert_carrier','a',null,'carriers'),
      ('bids','bids_update_party','w','carriers',null)
    ) t(tab, pol, cmd, qual_frag, chk_frag)
  loop
    v_cmd := null; v_roles := null; v_qual := null; v_chk := null;
    select p.polcmd, p.polroles::regrole[]::name[],
           pg_catalog.pg_get_expr(p.polqual, p.polrelid), pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
      into v_cmd, v_roles, v_qual, v_chk
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = r.tab and p.polname = r.pol;
    if v_cmd is null then
      raise exception 'auditoria 81: policy legada ausente: %.%', r.tab, r.pol;
    end if;
    if v_cmd <> r.cmd::"char" then
      raise exception 'auditoria 81: policy %.% com comando % (esperado %)', r.tab, r.pol, v_cmd, r.cmd;
    end if;
    if v_roles is distinct from array['authenticated']::name[] then
      raise exception 'auditoria 81: policy %.% com roles inesperados: %', r.tab, r.pol, v_roles;
    end if;
    if r.qual_frag is null then
      if v_qual is not null then
        raise exception 'auditoria 81: policy %.% ganhou USING inesperado', r.tab, r.pol;
      end if;
    elsif v_qual is null or pg_catalog.strpos(v_qual, r.qual_frag) = 0 then
      raise exception 'auditoria 81: USING de %.% diferente do esperado', r.tab, r.pol;
    end if;
    if r.chk_frag is null then
      if v_chk is not null then
        raise exception 'auditoria 81: policy %.% ganhou WITH CHECK inesperado', r.tab, r.pol;
      end if;
    elsif v_chk is null or pg_catalog.strpos(v_chk, r.chk_frag) = 0 then
      raise exception 'auditoria 81: WITH CHECK de %.% diferente do esperado', r.tab, r.pol;
    end if;
  end loop;

  -- 3) authenticated mantem os privilegios pre-M3 usados pelo M2 (nada novo concedido)
  if not (pg_catalog.has_table_privilege('authenticated','public.checkpoints','select')
      and pg_catalog.has_table_privilege('authenticated','public.checkpoints','insert')
      and pg_catalog.has_table_privilege('authenticated','public.driver_positions','select')
      and pg_catalog.has_table_privilege('authenticated','public.driver_positions','insert')
      and pg_catalog.has_table_privilege('authenticated','public.driver_positions','update')
      and pg_catalog.has_table_privilege('authenticated','public.security_alerts','select')
      and pg_catalog.has_table_privilege('authenticated','public.security_alerts','update')
      and pg_catalog.has_table_privilege('authenticated','public.security_alerts_tracking','insert')
      and pg_catalog.has_table_privilege('authenticated','public.bids','select')
      and pg_catalog.has_table_privilege('authenticated','public.bids','insert')) then
    raise exception 'auditoria 81: privilegio legado de authenticated foi removido cedo demais';
  end if;

  -- 4) anon e PUBLIC nao tem (nem ganham) acesso a essas tabelas
  for v_tab in select unnest(array['checkpoints','driver_positions','security_alerts','security_alerts_tracking','bids']) loop
    if pg_catalog.has_table_privilege('anon', 'public.' || v_tab, 'select')
       or pg_catalog.has_table_privilege('anon', 'public.' || v_tab, 'insert')
       or pg_catalog.has_table_privilege('anon', 'public.' || v_tab, 'update')
       or pg_catalog.has_table_privilege('anon', 'public.' || v_tab, 'delete') then
      raise exception 'auditoria 81: anon ainda acessa public.%', v_tab;
    end if;
    select count(*) into v_n
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
           lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
     where n.nspname = 'public' and c.relname = v_tab and a.grantee = 0;
    if v_n > 0 then
      raise exception 'auditoria 81: PUBLIC tem privilegio em public.%', v_tab;
    end if;
  end loop;

  -- 5) service_role fica somente com leitura nas quatro tabelas congeladas
  for v_tab in select unnest(array['checkpoints','driver_positions','security_alerts','security_alerts_tracking']) loop
    if not pg_catalog.has_table_privilege('service_role', 'public.' || v_tab, 'select')
       or pg_catalog.has_table_privilege('service_role', 'public.' || v_tab, 'insert')
       or pg_catalog.has_table_privilege('service_role', 'public.' || v_tab, 'update')
       or pg_catalog.has_table_privilege('service_role', 'public.' || v_tab, 'delete') then
      raise exception 'auditoria 81: service_role fora do desenho em public.%', v_tab;
    end if;
  end loop;

  -- 6) hardening que NAO foi adiado continua aplicado
  if pg_catalog.has_table_privilege('anon','public.trucks','select')
     or pg_catalog.has_table_privilege('authenticated','public.payments','select')
     or pg_catalog.has_table_privilege('authenticated','public.esg_logs','insert')
     or pg_catalog.has_table_privilege('anon','public.capacity_availability','select') then
    raise exception 'auditoria 81: hardening de tabela legada nao aplicado';
  end if;
  if not exists (select 1 from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid
                  where c.relname = 'trucks' and p.polname = 'trucks_select_scoped') then
    raise exception 'auditoria 81: trucks_select_scoped ausente';
  end if;
  if exists (select 1 from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid
              where c.relname = 'trucks' and p.polname = 'trucks_select_auth') then
    raise exception 'auditoria 81: policy permissiva antiga de trucks ainda presente';
  end if;

  -- 7) RPCs do M3 continuam sem EXECUTE para anon/PUBLIC
  for v_pol in select unnest(array[
      'public.list_legacy_operational_records(text, integer)',
      'public.ingest_trip_locations(uuid, uuid, uuid, jsonb)',
      'public.place_bid(uuid, numeric, numeric, numeric, boolean, uuid, uuid, uuid)']) loop
    if to_regprocedure(v_pol) is null then
      raise exception 'auditoria 81: funcao esperada ausente: %', v_pol;
    end if;
    if pg_catalog.has_function_privilege('anon', to_regprocedure(v_pol), 'execute') then
      raise exception 'auditoria 81: anon com EXECUTE em %', v_pol;
    end if;
  end loop;

  -- 8) flags operacionais continuam desligadas e o disparo de push continua inativo
  if public.operational_flag('push_dispatch_enabled') or public.operational_flag('sos_operational') then
    raise exception 'auditoria 81: flag operacional ligada';
  end if;
  if exists (select 1 from cron.job j where j.jobname = 'steelgo_push_dispatch' and j.active) then
    raise exception 'auditoria 81: job de push ativo';
  end if;
end
$audit$;

commit;
