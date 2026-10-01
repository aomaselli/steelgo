-- Granularidade transacional das migrations da Fase 1A.
--
-- Executar DEPOIS de aplicar a fixture de falha deliberada
-- (fixtures/fcg_failure_fixture.sql) por `supabase migration up` no projeto
-- descartavel. O executor fcg_run_privilege_closure.ps1 faz essa orquestracao.
--
-- O QUE ESTE TESTE PROVA: cada migration e sua propria transacao. A anterior
-- fica aplicada e registrada; a que falha nao entra e nao deixa residuo. Logo
-- um lote parcialmente aplicado E possivel, e por isso a 1/3 fecha o acesso
-- das tabelas que cria em vez de deixar isso para a 2/3.
--
-- Nao presume a versao da fixture: afirma que NENHUMA versao entre a 1/3 e a
-- 2/3 ficou registrada.
\set ON_ERROR_STOP off

begin;

do $a$
declare
  c_tabelas text[] := array['transport_operation_vehicle_compositions',
                            'transport_operation_vehicle_units',
                            'regulatory_compliance_results',
                            'regulatory_compliance_review_events',
                            'fcg_observational_log'];
  v_m1 boolean;
  v_entre integer;
  v_marcador boolean;
  v_presentes integer;
  v_total integer;
begin
  select exists (select 1 from supabase_migrations.schema_migrations
                  where version = '20260925120000')
    into v_m1;
  select count(*) into v_total from supabase_migrations.schema_migrations;

  raise notice 'A1. a 1/3 permanece aplicada .................. % (registrada=% total de migrations=%)',
    case when v_m1 then 'OK' else 'FALHOU' end, v_m1, v_total;

  select count(*) into v_entre
    from supabase_migrations.schema_migrations
   where version > '20260925120000' and version < '20260925120100';
  raise notice 'A2. a migration que falhou nao foi registrada .. % (versoes entre a 1/3 e a 2/3=%)',
    case when v_entre = 0 then 'OK' else 'FALHOU' end, v_entre;

  select exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'zzz_fcg_falha_marcador')
    into v_marcador;
  raise notice 'A3. a migration que falhou nao deixou residuo .. % (marcador presente=%)',
    case when not v_marcador then 'OK' else 'FALHOU' end, v_marcador;

  select count(*) into v_presentes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (c_tabelas);
  raise notice 'A4. as cinco tabelas da 1/3 seguem presentes ... % (%/5)',
    case when v_presentes = 5 then 'OK' else 'FALHOU' end, v_presentes;
end
$a$;

rollback;
