-- =============================================================================
-- MODULO 3 - 84: encerramento da ponte de rollout (revogacao definitiva)
--   Conclui o que a 20260917101200 adiou deliberadamente para que o frontend M2
--   (commit aaa9751c60e74bbe8a887ee016032aa655a89193) continuasse funcional
--   durante a publicacao do M3. Com o frontend M3
--   (commit dac5b8a00fd6a42dee3b17130b9fc277ff79ee44) em Production e o smoke
--   autenticado aprovado, o acesso legado direto deixa de ser necessario.
--   Esta migration SOMENTE revoga privilegios e derruba policies legadas:
--   nao cria/altera tabelas, colunas, indices, funcoes, buckets, flags ou cron.
--   bids_select_party e PRESERVADA (nunca fez parte do conjunto adiado).
--   RLS continua habilitada em todas as cinco tabelas.
-- =============================================================================
begin;

-- 1) privilegios adiados de `authenticated` --------------------------------------
revoke insert, update, delete, truncate, select on public.checkpoints              from authenticated;
revoke insert, update, delete, truncate, select on public.driver_positions         from authenticated;
revoke insert, update, delete, truncate, select on public.security_alerts          from authenticated;
revoke insert, update, delete, truncate, select on public.security_alerts_tracking from authenticated;
revoke insert, update, delete, truncate         on public.bids                     from authenticated;

-- 2) as 11 policies legadas adiadas ---------------------------------------------
drop policy if exists checkpoints_insert_driver     on public.checkpoints;
drop policy if exists checkpoints_select_party      on public.checkpoints;
drop policy if exists driver_positions_insert_own   on public.driver_positions;
drop policy if exists driver_positions_select_party on public.driver_positions;
drop policy if exists driver_positions_update_own   on public.driver_positions;
drop policy if exists security_alerts_admin_manage  on public.security_alerts;
drop policy if exists security_alerts_select_party  on public.security_alerts;
drop policy if exists alerts_tracking_insert_driver on public.security_alerts_tracking;
drop policy if exists alerts_tracking_select_party  on public.security_alerts_tracking;
drop policy if exists bids_insert_carrier           on public.bids;
drop policy if exists bids_update_party             on public.bids;

-- -----------------------------------------------------------------------------
-- Auditoria fail-closed do estado DEFINITIVO (o mesmo exigido originalmente pela
-- 20260917101300 antes do adiamento)
-- -----------------------------------------------------------------------------
do $final$
declare
  v_t text;
  v_r text;
  v_p text;
  v_n integer;
begin
  -- 2.1 as quatro tabelas congeladas: deny-by-default, sem policy e sem DML/SELECT
  foreach v_t in array array['checkpoints', 'driver_positions', 'security_alerts', 'security_alerts_tracking'] loop
    if not (select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = v_t) then
      raise exception 'FINAL: % sem RLS', v_t;
    end if;
    if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = v_t) then
      raise exception 'FINAL: % ainda tem policy; esperado deny-by-default', v_t;
    end if;
    foreach v_r in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public'
                    and g.table_name = v_t and g.grantee = v_r and g.privilege_type = v_p) then
          raise exception 'FINAL: % concede % a %', v_t, v_p, v_r;
        end if;
      end loop;
    end loop;
    foreach v_r in array array['anon', 'authenticated'] loop
      if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public'
                  and g.table_name = v_t and g.grantee = v_r and g.privilege_type = 'SELECT') then
        raise exception 'FINAL: % concede SELECT a %', v_t, v_r;
      end if;
    end loop;
    -- leitura historica administrativa continua possivel por service_role/RPC
    if not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public'
                    and g.table_name = v_t and g.grantee = 'service_role' and g.privilege_type = 'SELECT') then
      raise exception 'FINAL: service_role perdeu SELECT em %', v_t;
    end if;
  end loop;

  -- 2.2 bids: sem DML direto; SELECT e sua policy permanecem
  foreach v_r in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public'
                  and g.table_name = 'bids' and g.grantee = v_r and g.privilege_type = v_p) then
        raise exception 'FINAL: bids concede % a %', v_p, v_r;
      end if;
    end loop;
  end loop;
  if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public'
              and g.table_name = 'bids' and g.grantee = 'anon' and g.privilege_type = 'SELECT') then
    raise exception 'FINAL: bids legivel por anon';
  end if;
  if not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public'
                  and g.table_name = 'bids' and g.grantee = 'authenticated' and g.privilege_type = 'SELECT') then
    raise exception 'FINAL: bids deixou de ser legivel por authenticated (place_bid depende da leitura)';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'bids') then
    raise exception 'FINAL: bids sem RLS';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'bids'
                  and policyname = 'bids_select_party' and cmd = 'SELECT') then
    raise exception 'FINAL: bids_select_party deveria ter sido preservada';
  end if;
  select count(*) into v_n from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'bids';
  if v_n <> 1 then
    raise exception 'FINAL: bids com % policies; esperado apenas bids_select_party', v_n;
  end if;

  -- 2.3 nenhuma das 11 policies adiadas pode ter sobrevivido
  foreach v_p in array array['checkpoints_insert_driver', 'checkpoints_select_party',
                             'driver_positions_insert_own', 'driver_positions_select_party', 'driver_positions_update_own',
                             'security_alerts_admin_manage', 'security_alerts_select_party',
                             'alerts_tracking_insert_driver', 'alerts_tracking_select_party',
                             'bids_insert_carrier', 'bids_update_party'] loop
    if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and policyname = v_p) then
      raise exception 'FINAL: policy legada % ainda existe', v_p;
    end if;
  end loop;

  -- 2.4 PUBLIC nunca
  foreach v_t in array array['checkpoints', 'driver_positions', 'security_alerts', 'security_alerts_tracking', 'bids'] loop
    if exists (select 1 from pg_catalog.pg_class c cross join lateral
                 pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
                where c.oid = ('public.' || v_t)::regclass and a.grantee = 0) then
      raise exception 'FINAL: PUBLIC com privilegio em %', v_t;
    end if;
  end loop;

  -- 2.5 o restante do desenho M3 permanece intacto
  if to_regprocedure('public.list_legacy_operational_records(text, integer)') is null then
    raise exception 'FINAL: RPC administrativa de leitura historica ausente';
  end if;
  if pg_catalog.has_function_privilege('anon', to_regprocedure('public.list_legacy_operational_records(text, integer)'), 'execute')
     or pg_catalog.has_function_privilege('anon', to_regprocedure('public.ingest_trip_locations(uuid, uuid, uuid, jsonb)'), 'execute')
     or pg_catalog.has_function_privilege('anon', to_regprocedure('public.start_trip_tracking(uuid, uuid, uuid, text, public.tracking_provider, text, bigint, timestamp with time zone, numeric, numeric, numeric, numeric, numeric, numeric)'), 'execute') then
    raise exception 'FINAL: anon com EXECUTE em RPC do M3';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'trucks' and policyname = 'trucks_select_scoped') then
    raise exception 'FINAL: trucks_select_scoped ausente';
  end if;
  if public.operational_flag('push_dispatch_enabled') or public.operational_flag('sos_operational') then
    raise exception 'FINAL: flag operacional ligada';
  end if;
  if exists (select 1 from cron.job j where j.jobname = 'steelgo_push_dispatch' and j.active) then
    raise exception 'FINAL: job de push ativo';
  end if;
  if not exists (select 1 from storage.buckets where id = 'trip-media' and public = false) then
    raise exception 'FINAL: bucket trip-media ausente ou publico';
  end if;
end
$final$;

commit;
