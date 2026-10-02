-- =============================================================================
-- F2 - contencao de falha no caminho observacional.
--
-- A injecao de falha existe SOMENTE aqui: a funcao e o trigger sao criados
-- dentro desta transacao e desaparecem no rollback. Nenhuma migration do
-- produto contem mecanismo de falha.
--
-- ESCOPO DO QUE ESTE ARQUIVO PROVA: persistencia OBSERVAVEL DENTRO DA
-- TRANSACAO. Ele termina em rollback e por isso NAO prova durabilidade apos
-- COMMIT. Essa prova esta em fcg_failure_containment_commit.ps1, que comita de
-- verdade e le de uma SEGUNDA conexao.
-- =============================================================================
\set ON_ERROR_STOP off

begin;

-- injecao de falha, exclusiva do teste
create or replace function public.fcg_test_only_boom()
returns trigger language plpgsql as $$
begin
  raise exception using errcode = '22000', message = 'falha injetada pelo teste';
end;
$$;

do $fx$
declare
  u uuid := gen_random_uuid(); c_emb uuid; c_tra uuid; frt uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'falha@fcg.invalid','',now(),now(),now());
  insert into public.companies (owner_id, name) values (u,'Falha Embarcadora') returning id into c_emb;
  insert into public.companies (owner_id, name) values (u,'Falha Transportadora') returning id into c_tra;
  insert into public.freights (company_id, created_by) values (c_emb, u) returning id into frt;
  create temp table fz(k text primary key, v uuid) on commit drop;
  insert into fz values ('u',u),('c_emb',c_emb),('c_tra',c_tra),('frt',frt);
end
$fx$;

update public.operational_flags set value = true
 where key = 'freight_compliance_gate_enabled';

-- ===========================================================================
-- CENARIO A: falha na criacao da operacao. O contrato precisa sobreviver e a
-- falha precisa ficar registrada.
-- ===========================================================================
create trigger fcg_test_only_boom_trg
  before insert on public.transport_operations
  for each row execute function public.fcg_test_only_boom();

do $a$
declare
  frt uuid := (select v from fz where k='frt');
  emb uuid := (select v from fz where k='c_emb');
  tra uuid := (select v from fz where k='c_tra');
  ctr uuid; existe int; logn int; ops int; asm int; res int; compl int; det text;
begin
  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (frt, emb, tra, 6000.00, 300.00, 5700.00, 'draft') returning id into ctr;

  select count(*) into existe from public.contracts where id = ctr;
  select count(*) into ops from public.transport_operations where contract_id = ctr;
  select count(*) into logn from public.fcg_observational_log
    where contract_id = ctr and event = 'infrastructure_error';
  select detail into det from public.fcg_observational_log
    where contract_id = ctr and event = 'infrastructure_error' limit 1;
  select count(*) into asm from public.regulatory_assessments a
    where a.transport_operation_id in (select id from public.transport_operations where contract_id = ctr);
  select count(*) into res from public.regulatory_compliance_results;
  select count(*) into compl from public.regulatory_compliance_results where compliance_status = 'compliant';

  raise notice 'A1. contrato preservado apesar da falha ....... % (linhas=%)',
    case when existe = 1 then 'OK' else 'FALHOU' end, existe;
  raise notice 'A2. infrastructure_error registrado .......... % (linhas=%)',
    case when logn = 1 then 'OK' else 'FALHOU' end, logn;
  raise notice 'A3. detalhe carrega o sqlstate de origem ..... % (%)',
    case when det like '%22000%' then 'OK' else 'FALHOU' end, left(coalesce(det,'(nulo)'),60);
  raise notice 'A4. nenhuma operacao parcial ................. % (operacoes=%)',
    case when ops = 0 then 'OK' else 'FALHOU' end, ops;
  raise notice 'A5. nenhuma avaliacao ou resultado parcial ... % (avaliacoes=% resultados=%)',
    case when asm = 0 and res = 0 then 'OK' else 'FALHOU' end, asm, res;
  raise notice 'A6. nenhum compliant produzido ............... % (linhas=%)',
    case when compl = 0 then 'OK' else 'FALHOU' end, compl;
end
$a$;

-- ===========================================================================
-- CENARIO B: falha do PROPRIO mecanismo de auditoria, somada a falha anterior.
-- O contrato ainda precisa sobreviver. O registro, esse, se perde -- e isso e
-- um LIMITE REAL, nao uma garantia.
-- ===========================================================================
create trigger fcg_test_only_boom_log_trg
  before insert on public.fcg_observational_log
  for each row execute function public.fcg_test_only_boom();

do $b$
declare
  frt uuid := (select v from fz where k='frt');
  emb uuid := (select v from fz where k='c_emb');
  tra uuid := (select v from fz where k='c_tra');
  ctr uuid; existe int; logn int; ops int; res int;
begin
  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (frt, emb, tra, 7000.00, 350.00, 6650.00, 'draft') returning id into ctr;

  select count(*) into existe from public.contracts where id = ctr;
  select count(*) into logn from public.fcg_observational_log where contract_id = ctr;
  select count(*) into ops from public.transport_operations where contract_id = ctr;
  select count(*) into res from public.regulatory_compliance_results;

  raise notice 'B1. contrato preservado com auditoria quebrada % (linhas=%)',
    case when existe = 1 then 'OK' else 'FALHOU' end, existe;
  raise notice 'B2. nenhum resultado regulatorio ............. % (operacoes=% resultados=%)',
    case when ops = 0 and res = 0 then 'OK' else 'FALHOU' end, ops, res;
  raise notice 'B3. LIMITE DECLARADO: registro perdido ....... % (linhas de log=%)',
    case when logn = 0 then 'confirmado' else 'inesperado' end, logn;
  raise notice '    Quando a propria auditoria falha, resta apenas o RAISE WARNING no';
  raise notice '    log do servidor. O codigo NAO oferece garantia de registro nesse caso;';
  raise notice '    a prioridade declarada e nao bloquear a contratacao.';
end
$b$;

drop trigger fcg_test_only_boom_log_trg on public.fcg_observational_log;
drop trigger fcg_test_only_boom_trg on public.transport_operations;
drop function public.fcg_test_only_boom();

rollback;
