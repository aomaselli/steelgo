-- =============================================================================
-- Prova do modo observacional, ponta a ponta, com a flag LIGADA.
--
-- Dois cenarios, porque o desfecho correto depende de existir regra elegivel:
--   CENARIO 1 - sem nenhum conjunto de regras ativo (estado real do produto):
--       o contrato e criado, a operacao e criada, NENHUMA avaliacao e NENHUM
--       resultado sao inventados, e a tentativa vira 'not_evaluated' no log.
--   CENARIO 2 - com um conjunto de regras ativo (fixture NAO oficial):
--       ha avaliacao e resultado, sempre 'incomputable' e NUNCA 'compliant',
--       porque coeficiente e arredondamento continuam pendentes.
--
-- Em nenhum dos dois o contrato pode ser bloqueado. Tudo revertido por rollback.
-- =============================================================================
\set ON_ERROR_STOP off

begin;

-- ------------------------------------------------- CENARIO 1: sem regra ativa
do $c1$
declare
  v_uid uuid := gen_random_uuid();
  v_emb uuid; v_tra uuid; v_freight uuid; v_contract uuid;
  v_ops integer; v_asm integer; v_res integer; v_log integer; v_regras integer;
  v_bloqueou boolean := false;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'fcg-obs1@local.invalid', '', now(), now(), now());
  insert into public.companies (owner_id, name) values (v_uid, 'Embarcadora Obs 1') returning id into v_emb;
  insert into public.companies (owner_id, name) values (v_uid, 'Transportadora Obs 1') returning id into v_tra;
  insert into public.freights (company_id, created_by) values (v_emb, v_uid) returning id into v_freight;

  select count(*) into v_regras from public.regulatory_rule_sets
   where status = 'active' and scope = 'publication_gate';
  raise notice '1.0 nenhuma regra ativa no produto ............. % (regras=%)',
    case when v_regras = 0 then 'OK' else 'FALHOU' end, v_regras;

  update public.operational_flags set value = true
   where key = 'freight_compliance_gate_enabled';

  begin
    insert into public.contracts
      (freight_id, shipper_company_id, carrier_company_id, total_amount_brl,
       platform_fee_brl, carrier_payout_brl, status)
    values (v_freight, v_emb, v_tra, 5000.00, 250.00, 4750.00, 'draft')
    returning id into v_contract;
  exception when others then
    v_bloqueou := true;
    raise notice '   erro ao inserir contrato: % / %', sqlstate, left(sqlerrm, 90);
  end;

  raise notice '1.1 contrato criado com o gate LIGADO ......... %',
    case when not v_bloqueou and v_contract is not null then 'OK (nao bloqueou)' else 'FALHOU' end;

  select count(*) into v_ops from public.transport_operations where contract_id = v_contract;
  raise notice '1.2 operacao de transporte criada ............. % (linhas=%)',
    case when v_ops = 1 then 'OK' else 'FALHOU' end, v_ops;

  select count(*) into v_asm from public.regulatory_assessments a
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_contract);
  select count(*) into v_res from public.regulatory_compliance_results r
    join public.regulatory_assessments a on a.id = r.assessment_id
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_contract);
  raise notice '1.3 NENHUMA avaliacao ou resultado inventado .. % (avaliacoes=% resultados=%)',
    case when v_asm = 0 and v_res = 0 then 'OK' else 'FALHOU' end, v_asm, v_res;

  select count(*) into v_log from public.fcg_observational_log
   where event = 'not_evaluated' and detail = 'no_eligible_validated_rule'
     and contract_id = v_contract;
  raise notice '1.4 tentativa registrada como not_evaluated ... % (registros=%)',
    case when v_log >= 1 then 'OK' else 'FALHOU' end, v_log;

  select count(*) into v_log from public.fcg_observational_log
   where event = 'infrastructure_error' and contract_id = v_contract;
  raise notice '1.5 nenhuma falha de infraestrutura no hook ... % (erros=%)',
    case when v_log = 0 then 'OK' else 'FALHOU' end, v_log;
end
$c1$;

-- ------------------------------------------------- CENARIO 2: com regra ativa
do $c2$
declare
  v_uid uuid := gen_random_uuid();
  v_emb uuid; v_tra uuid; v_freight uuid; v_contract uuid; v_rule uuid;
  v_ops integer; v_asm integer; v_res integer; v_compl integer;
  v_estado text; v_modo text; v_aplic text; v_motivos jsonb;
  v_bloqueou boolean := false;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'fcg-obs2@local.invalid', '', now(), now(), now());
  insert into public.companies (owner_id, name) values (v_uid, 'Embarcadora Obs 2') returning id into v_emb;
  insert into public.companies (owner_id, name) values (v_uid, 'Transportadora Obs 2') returning id into v_tra;
  insert into public.freights (company_id, created_by) values (v_emb, v_uid) returning id into v_freight;

  -- Conjunto de regras FICTICIO, criado apenas dentro desta transacao revertida.
  -- Nao contem coeficiente oficial nem status 'validated'.
  insert into public.regulatory_rule_sets (rule_version, scope, status, effective_from, description)
  values ('FIXTURE-TESTE-NAO-OFICIAL', 'publication_gate', 'active', now() - interval '1 day',
          'Fixture de teste. Nao e regra oficial. Revertida por rollback.')
  returning id into v_rule;

  update public.operational_flags set value = true
   where key = 'freight_compliance_gate_enabled';

  begin
    insert into public.contracts
      (freight_id, shipper_company_id, carrier_company_id, total_amount_brl,
       platform_fee_brl, carrier_payout_brl, status)
    values (v_freight, v_emb, v_tra, 5000.00, 250.00, 4750.00, 'draft')
    returning id into v_contract;
  exception when others then
    v_bloqueou := true;
    raise notice '   erro ao inserir contrato: % / %', sqlstate, left(sqlerrm, 90);
  end;

  raise notice '2.1 contrato criado com regra ativa ........... %',
    case when not v_bloqueou and v_contract is not null then 'OK (nao bloqueou)' else 'FALHOU' end;

  select count(*) into v_ops from public.transport_operations where contract_id = v_contract;
  select count(*) into v_asm from public.regulatory_assessments a
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_contract);
  select count(*) into v_res from public.regulatory_compliance_results r
    join public.regulatory_assessments a on a.id = r.assessment_id
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_contract);
  raise notice '2.2 operacao, avaliacao e resultado criados ... % (op=% aval=% res=%)',
    case when v_ops = 1 and v_asm = 1 and v_res = 1 then 'OK' else 'FALHOU' end, v_ops, v_asm, v_res;

  select r.calculation_status, r.compliance_status is not distinct from null, r.enforcement_mode, r.reason_codes
    into v_estado, v_bloqueou, v_modo, v_motivos
    from public.regulatory_compliance_results r
    join public.regulatory_assessments a on a.id = r.assessment_id
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_contract)
   limit 1;
  raise notice '2.3 incomputable e compliance_status nulo ..... % (estado=% nulo=%)',
    case when v_estado = 'incomputable' and v_bloqueou then 'OK' else 'FALHOU' end, v_estado, v_bloqueou;

  raise notice '2.4 modo observacional registrado ............. % (modo=%)',
    case when v_modo = 'observational' then 'OK' else 'FALHOU' end, v_modo;

  raise notice '2.5 motivos sao codigos, nao texto livre ...... % (motivos=%)',
    case when v_motivos ? 'COEFFICIENT_TABLE_MISSING'
           and v_motivos ? 'ROUNDING_POLICY_UNDEFINED' then 'OK' else 'FALHOU' end, v_motivos;

  select a.result || ' / ' || coalesce(a.floor_applicability, 'NULL') into v_aplic
    from public.regulatory_assessments a
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_contract)
   limit 1;
  raise notice '2.6 aplicabilidade preservada como pendente ... % (%)',
    case when v_aplic = 'pending_evaluation / pending_evaluation' then 'OK' else 'FALHOU' end, v_aplic;

  -- Invariante central: nenhuma linha 'compliant' em todo o banco.
  select count(*) into v_compl from public.regulatory_compliance_results
   where compliance_status = 'compliant';
  raise notice '2.7 zero resultados compliant no banco ........ % (linhas=%)',
    case when v_compl = 0 then 'OK' else 'FALHOU' end, v_compl;

  select count(*) into v_compl from public.fcg_observational_log
   where event = 'evaluated' and contract_id = v_contract;
  raise notice '2.8 avaliacao registrada na trilha propria .... % (registros=%)',
    case when v_compl = 1 then 'OK' else 'FALHOU' end, v_compl;

  select count(*) into v_compl from public.fcg_observational_log
   where event = 'infrastructure_error' and contract_id = v_contract;
  raise notice '2.9 nenhuma falha de infraestrutura ........... % (erros=%)',
    case when v_compl = 0 then 'OK' else 'FALHOU' end, v_compl;
end
$c2$;

rollback;
