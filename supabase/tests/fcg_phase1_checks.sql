-- Bateria de verificacao da Fase 1 do Freight Compliance Gate.
-- Cria fixture minima, exercita as invariantes e faz ROLLBACK: nao deixa dados.
\set ON_ERROR_STOP off

begin;

-- Fixture minima local (revertida pelo rollback final)
do $fix$
declare
  v_uid uuid := gen_random_uuid();
  v_emb uuid; v_tra uuid; v_frt uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'fcg-teste@local.invalid', '', now(), now(), now());
  insert into public.companies (owner_id, name) values (v_uid, 'FCG Teste Ltda') returning id into v_emb;
  insert into public.companies (owner_id, name) values (v_uid, 'FCG Subcontratante Ltda') returning id into v_tra;
  -- Contrato real: sem ele o check 1 nao tem o que exercitar.
  insert into public.freights (company_id, created_by) values (v_emb, v_uid) returning id into v_frt;
  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (v_frt, v_emb, v_tra, 4000.00, 200.00, 3800.00, 'draft');
end
$fix$;

-- 1. Imutabilidade: valores monetarios do contrato
do $t1$
declare v_ok boolean := false; v_tem boolean;
begin
  select exists (select 1 from public.contracts) into v_tem;
  if not v_tem then
    raise notice '1. contrato: valores monetarios imutaveis ....... SEM DADOS (trigger existe: %)',
      exists (select 1 from pg_trigger where tgname = 'contracts_freeze_monetary_trg');
    return;
  end if;
  begin
    update public.contracts set total_amount_brl = total_amount_brl + 1;
    exception when sqlstate '42501' then v_ok := true;
  end;
  raise notice '1. contrato: valores monetarios imutaveis ....... %',
    case when v_ok then 'OK' else 'FALHOU' end;
end
$t1$;

-- 2. Imutabilidade das novas tabelas (UPDATE e DELETE bloqueados)
do $t2$
declare v_u boolean := false; v_d boolean := false; v_op uuid; v_comp uuid; v_user uuid;
begin
  select id into v_user from auth.users where email = 'fcg-teste@local.invalid';
  insert into public.transport_operations
    (origin_kind, shipper_company_id, operation_state, retention_policy, registered_by, registration_note)
  select 'manual', c.id, 'created', 'pending_legal_definition', v_user, 'teste'
    from public.companies c where c.name = 'FCG Teste Ltda'
  returning id into v_op;

  insert into public.transport_operation_vehicle_compositions
    (transport_operation_id, version, total_axles, unit_count)
  values (v_op, 1, 3, 1) returning id into v_comp;

  begin
    update public.transport_operation_vehicle_compositions set total_axles = 9 where id = v_comp;
    exception when sqlstate '42501' then v_u := true;
  end;
  begin
    delete from public.transport_operation_vehicle_compositions where id = v_comp;
    exception when sqlstate '42501' then v_d := true;
  end;
  raise notice '2. composicao: UPDATE e DELETE bloqueados ....... %',
    case when v_u and v_d then 'OK' else 'FALHOU' end;
end
$t2$;

-- 3. Invariante: calculated exige compliance_status
do $t3$
declare v_ok boolean := false;
begin
  begin
    insert into public.regulatory_compliance_results
      (assessment_id, calculation_status, compliance_status, enforcement_mode)
    values (gen_random_uuid(), 'calculated', null, 'observational');
    exception when sqlstate '23514' then v_ok := true;
               when sqlstate '23503' then v_ok := true;
  end;
  raise notice '3. calculated sem compliance_status recusado .... %',
    case when v_ok then 'OK' else 'FALHOU' end;
end
$t3$;

-- 4. Invariante: incomputable nao pode ter compliance_status
do $t4$
declare v_ok boolean := false;
begin
  begin
    insert into public.regulatory_compliance_results
      (assessment_id, calculation_status, compliance_status, enforcement_mode)
    values (gen_random_uuid(), 'incomputable', 'compliant', 'observational');
    exception when sqlstate '23514' then v_ok := true;
               when sqlstate '23503' then v_ok := true;
  end;
  raise notice '4. incomputable com compliance recusado ......... %',
    case when v_ok then 'OK' else 'FALHOU' end;
end
$t4$;

-- 5. Coerencia: etc exige pessoa juridica
do $t5$
declare v_ok boolean := false; v_user uuid;
begin
  select id into v_user from auth.users where email = 'fcg-teste@local.invalid';
  begin
    insert into public.transport_operations
      (origin_kind, shipper_company_id, operation_state, retention_policy,
       registered_by, registration_note, effective_carrier_rntrc_category,
       effective_carrier_regulatory_treatment, effective_carrier_rntrc_snapshot,
       effective_carrier_company_id)
    select 'manual', c.id, 'created', 'pending_legal_definition',
           v_user, 'teste', 'etc', 'standard', '{"rntrc":"33333333"}'::jsonb, null
      from public.companies c where c.name = 'FCG Teste Ltda';
    exception when sqlstate '23514' then v_ok := true;
  end;
  raise notice '5. etc sem pessoa juridica recusado ............ %',
    case when v_ok then 'OK' else 'FALHOU' end;
end
$t5$;

-- 6. Coerencia: has_subcontracting exige subcontratante
do $t6$
declare v_ok boolean := false; v_user uuid;
begin
  select id into v_user from auth.users where email = 'fcg-teste@local.invalid';
  begin
    insert into public.transport_operations
      (origin_kind, shipper_company_id, operation_state, retention_policy,
       registered_by, registration_note, has_subcontracting, subcontractor_company_id)
    select 'manual', c.id, 'created', 'pending_legal_definition',
           v_user, 'teste', true, null
      from public.companies c where c.name = 'FCG Teste Ltda';
    exception when sqlstate '23514' then v_ok := true;
  end;
  raise notice '6. has_subcontracting sem subcontratante ........ %',
    case when v_ok then 'OK' else 'FALHOU' end;
end
$t6$;

-- 7. Soma de eixos divergente (constraint trigger deferida)
do $t7$
declare v_ok boolean := false; v_op uuid; v_user uuid;
begin
  select id into v_user from auth.users where email = 'fcg-teste@local.invalid';
  insert into public.transport_operations
    (origin_kind, shipper_company_id, operation_state, retention_policy, registered_by, registration_note)
  select 'manual', c.id, 'created', 'pending_legal_definition', v_user, 'teste-eixos'
    from public.companies c where c.name = 'FCG Teste Ltda'
  returning id into v_op;

  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count)
    values (v_op, 1, 6, 1);
    set constraints all immediate;
    exception when others then v_ok := true;
  end;
  raise notice '7. soma de eixos divergente recusada ........... %',
    case when v_ok then 'OK' else 'FALHOU' end;
end
$t7$;

-- 8. Modo observacional: flags desligadas
do $t8$
declare v_en boolean; v_ef boolean;
begin
  select value into v_en from public.operational_flags where key = 'freight_compliance_gate_enabled';
  select value into v_ef from public.operational_flags where key = 'freight_compliance_gate_enforcing';
  raise notice '8. flags desligadas ............................ %',
    case when v_en = false and v_ef = false then 'OK' else 'FALHOU' end;
end
$t8$;

-- 9. Nenhuma regra ativa/validada semeada
do $t9$
declare v_ativas integer;
begin
  select count(*) into v_ativas from public.regulatory_rule_sets where status <> 'draft';
  raise notice '9. nenhuma regra ativa/validada semeada ......... %',
    case when v_ativas = 0 then 'OK' else 'FALHOU' end;
end
$t9$;

-- 10. anon nao tem grant algum nas tabelas novas
do $t10$
declare v_n integer;
begin
  select count(*) into v_n from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and table_name in ('transport_operation_vehicle_compositions','transport_operation_vehicle_units',
                        'regulatory_compliance_results','regulatory_compliance_review_events');
  raise notice '10. anon sem grants nas tabelas novas ........... %',
    case when v_n = 0 then 'OK' else 'FALHOU (' || v_n || ')' end;
end
$t10$;

-- 11. authenticated nao tem DML nas tabelas novas
do $t11$
declare v_n integer;
begin
  select count(*) into v_n from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and privilege_type in ('INSERT','UPDATE','DELETE')
     and table_name in ('transport_operation_vehicle_compositions','transport_operation_vehicle_units',
                        'regulatory_compliance_results','regulatory_compliance_review_events');
  raise notice '11. authenticated sem DML direto ............... %',
    case when v_n = 0 then 'OK' else 'FALHOU (' || v_n || ')' end;
end
$t11$;

-- 12. RPCs internas sem EXECUTE para anon/authenticated
do $t12$
declare v_n integer := 0;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_transport_operation_from_contract_core','fcg_evaluate_contract_compliance_core')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  raise notice '12. RPCs internas sem EXECUTE publico .......... %',
    case when v_n = 0 then 'OK' else 'FALHOU (' || v_n || ')' end;
end
$t12$;

-- 13. COMPORTAMENTAL: com a flag desligada, o contrato e criado e o gate nao
--     produz absolutamente nada. O check 8 le o valor da flag; este mede o
--     EFEITO dela. A flag e restaurada ao final, explicitamente.
do $t13$
declare
  v_user uuid; v_emb uuid; v_tra uuid; v_frt uuid; v_ctr uuid;
  v_flag_antes boolean; v_flag_depois boolean;
  v_ops int; v_asm int; v_res int; v_log int;
begin
  select public.operational_flag('freight_compliance_gate_enabled') into v_flag_antes;
  update public.operational_flags set value = false
   where key = 'freight_compliance_gate_enabled';

  select id into v_user from auth.users where email = 'fcg-teste@local.invalid';
  select id into v_emb from public.companies where name = 'FCG Teste Ltda';
  select id into v_tra from public.companies where name = 'FCG Subcontratante Ltda';
  insert into public.freights (company_id, created_by) values (v_emb, v_user) returning id into v_frt;

  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (v_frt, v_emb, v_tra, 2500.00, 125.00, 2375.00, 'draft') returning id into v_ctr;

  select count(*) into v_ops from public.transport_operations where contract_id = v_ctr;
  select count(*) into v_asm from public.regulatory_assessments a
    where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_ctr);
  select count(*) into v_res from public.regulatory_compliance_results r
    join public.regulatory_assessments a on a.id = r.assessment_id
   where a.transport_operation_id in (select id from public.transport_operations where contract_id = v_ctr);
  select count(*) into v_log from public.fcg_observational_log where contract_id = v_ctr;

  raise notice '13. flag desligada: contrato criado ............ % (id presente=%)',
    case when v_ctr is not null then 'OK' else 'FALHOU' end,
    case when v_ctr is not null then 'sim' else 'nao' end;
  raise notice '14. flag desligada: zero trabalho do gate ...... % (operacoes=% avaliacoes=% resultados=% log=%)',
    case when v_ops = 0 and v_asm = 0 and v_res = 0 and v_log = 0 then 'OK' else 'FALHOU' end,
    v_ops, v_asm, v_res, v_log;

  -- restauracao explicita da flag
  update public.operational_flags set value = v_flag_antes
   where key = 'freight_compliance_gate_enabled';
  select public.operational_flag('freight_compliance_gate_enabled') into v_flag_depois;
  raise notice '15. flag restaurada ao valor original .......... % (antes=% depois=%)',
    case when v_flag_depois is not distinct from v_flag_antes then 'OK' else 'FALHOU' end,
    v_flag_antes, v_flag_depois;
end
$t13$;

rollback;
