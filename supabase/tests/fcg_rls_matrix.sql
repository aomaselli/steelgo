-- =============================================================================
-- Fase 1A - matriz RLS comportamental.
-- Cria fixtures REAIS, troca de papel com set_config('role', ...) + claims JWT,
-- conta linhas efetivamente visiveis e faz ROLLBACK.
-- Nenhum teste passa por existencia de policy no catalogo: todos contam linhas.
-- =============================================================================
\set ON_ERROR_STOP off

begin;

do $fx$
declare
  u_emb1 uuid := gen_random_uuid();  -- dono da embarcadora A
  u_emb2 uuid := gen_random_uuid();  -- dono da embarcadora B (outro tenant)
  u_tra1 uuid := gen_random_uuid();  -- dono da transportadora contratada
  u_tra2 uuid := gen_random_uuid();  -- dono da transportadora efetiva
  u_tra3 uuid := gen_random_uuid();  -- dono de transportadora sem relacao
  u_mot  uuid := gen_random_uuid();  -- motorista
  u_adm  uuid := gen_random_uuid();  -- admin
  c_emb1 uuid; c_emb2 uuid; c_tra1 uuid; c_tra2 uuid; c_tra3 uuid;
  car1 uuid; trk1 uuid; drv1 uuid;
  frt1 uuid; frt2 uuid; ctr uuid; op uuid; comp uuid;
  rule uuid; ofv1 uuid; ofv2 uuid; asm1 uuid; asm2 uuid; res uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         x.em, '', now(), now(), now()
    from (values (u_emb1,'rls-emb1@fcg.invalid'),(u_emb2,'rls-emb2@fcg.invalid'),
                 (u_tra1,'rls-tra1@fcg.invalid'),(u_tra2,'rls-tra2@fcg.invalid'),
                 (u_tra3,'rls-tra3@fcg.invalid'),(u_mot,'rls-mot@fcg.invalid'),
                 (u_adm,'rls-adm@fcg.invalid')) as x(id, em);

  insert into public.companies (owner_id, name) values (u_emb1,'RLS Embarcadora A') returning id into c_emb1;
  insert into public.companies (owner_id, name) values (u_emb2,'RLS Embarcadora B') returning id into c_emb2;
  insert into public.companies (owner_id, name) values (u_tra1,'RLS Transportadora Contratada') returning id into c_tra1;
  insert into public.companies (owner_id, name) values (u_tra2,'RLS Transportadora Efetiva') returning id into c_tra2;
  insert into public.companies (owner_id, name) values (u_tra3,'RLS Transportadora Alheia') returning id into c_tra3;

  insert into public.user_roles (user_id, role) values (u_adm, 'admin');

  insert into public.carriers (company_id, antt_rntrc) values (c_tra1,'11111111') returning id into car1;
  insert into public.trucks (carrier_id, plate, type, capacity_tons) values (car1,'RLS1A11','carreta',30) returning id into trk1;
  insert into public.drivers (carrier_id, profile_id, full_name) values (car1, u_mot, 'Motorista RLS') returning id into drv1;

  insert into public.freights (company_id, created_by) values (c_emb1, u_emb1) returning id into frt1;
  insert into public.freights (company_id, created_by) values (c_emb2, u_emb2) returning id into frt2;

  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id, driver_id, truck_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (frt1, c_emb1, c_tra1, u_mot, trk1, 7000.00, 350.00, 6650.00, 'draft') returning id into ctr;

  -- Operacao: embarcadora A, transportadora contratada 1, transportadora EFETIVA 2.
  insert into public.transport_operations
    (origin_kind, freight_id, contract_id, shipper_company_id, carrier_company_id,
     driver_id, truck_id, operation_state, retention_policy,
     effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
     effective_carrier_rntrc_snapshot, effective_carrier_company_id)
  values ('marketplace', frt1, ctr, c_emb1, c_tra1, drv1, trk1, 'created','pending_legal_definition',
          'etc','standard','{"rntrc":"22222222"}'::jsonb, c_tra2)
  returning id into op;

  insert into public.transport_operation_vehicle_compositions
    (transport_operation_id, version, total_axles, unit_count) values (op, 1, 3, 1) returning id into comp;
  insert into public.transport_operation_vehicle_units
    (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
  values (comp, trk1, 'registered_vehicle', 1, 3, '{"plate":"RLS1A11"}'::jsonb);
  set constraints all immediate;
  set constraints all deferred;

  -- Conjunto de regras FICTICIO, status 'draft' (NUNCA elegivel: o avaliador
  -- exige status='active'). Existe apenas para satisfazer o NOT NULL de
  -- regulatory_assessments.rule_id dentro desta transacao revertida.
  insert into public.regulatory_rule_sets (rule_version, scope, status, description)
  values ('FIXTURE-TESTE-NAO-OFICIAL','publication_gate','draft',
          'Fixture de teste. Nao e regra oficial. Revertida por rollback.')
  returning id into rule;

  insert into public.freight_offer_versions
    (freight_id, provenance, value_basis, snapshot_basis, currency_code,
     budget_brl, budget_amount, offer_snapshot, created_by, rpc_name, request_id, params_fingerprint)
  values (frt1,'rpc_declared','declared_positive','declared_at_publication','BRL',
          1000, 1000,'{}'::jsonb, u_emb1,'fixture', gen_random_uuid(), repeat('a',64))
  returning id into ofv1;
  insert into public.freight_offer_versions
    (freight_id, provenance, value_basis, snapshot_basis, currency_code,
     budget_brl, budget_amount, offer_snapshot, created_by, rpc_name, request_id, params_fingerprint)
  values (frt2,'rpc_declared','declared_positive','declared_at_publication','BRL',
          1000, 1000,'{}'::jsonb, u_emb2,'fixture', gen_random_uuid(), repeat('b',64))
  returning id into ofv2;

  insert into public.regulatory_assessments
    (transport_operation_id, stage, result, rule_id, rule_version, rounding_policy, decision_mode, retention_policy)
  values (op,'preliminary','pending_evaluation', rule,'FIXTURE-TESTE-NAO-OFICIAL','undefined','system','pending_legal_definition')
  returning id into asm1;
  insert into public.regulatory_assessments
    (offer_version_id, stage, result, rule_id, rule_version, rounding_policy, decision_mode, retention_policy)
  values (ofv2,'preliminary','pending_evaluation', rule,'FIXTURE-TESTE-NAO-OFICIAL','undefined','system','pending_legal_definition')
  returning id into asm2;

  insert into public.regulatory_compliance_results
    (assessment_id, calculation_status, compliance_status, evaluated_amount, rounding_policy,
     rule_id, rule_version, reason_codes, inputs_fingerprint, enforcement_mode, retention_policy, request_id)
  values (asm1,'incomputable', null, 7000.00,'undefined', rule,'FIXTURE-TESTE-NAO-OFICIAL',
          '["COEFFICIENT_TABLE_MISSING"]'::jsonb,repeat('c',64),'observational','pending_legal_definition', gen_random_uuid())
  returning id into res;

  insert into public.regulatory_compliance_review_events
    (compliance_result_id, action, reason_code, evidence, created_by_user_id, request_id)
  values (res,'review_requested','FIXTURE','{"nota":"fixture"}'::jsonb, u_adm, gen_random_uuid());

  create temp table fx(k text primary key, v uuid) on commit drop;
  insert into fx values
    ('u_emb1',u_emb1),('u_emb2',u_emb2),('u_tra1',u_tra1),('u_tra2',u_tra2),('u_tra3',u_tra3),
    ('u_mot',u_mot),('u_adm',u_adm),('op',op),('comp',comp),('res',res),('asm2',asm2),('ctr',ctr);
  raise notice 'fixtures RLS criadas. operacao=% composicao=% resultado=%', op, comp, res;
end
$fx$;

-- Conta linhas visiveis para um usuario autenticado. -1 = sem privilegio (grant ausente).
create or replace function pg_temp.conta_como(p_uid uuid, p_role text, p_sql text)
returns integer
language plpgsql
as $$
declare n integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
  begin
    execute p_sql into n;
  exception
    when insufficient_privilege then n := -1;
    when others then n := -2;
  end;
  perform set_config('role', 'none', true);
  return n;
end
$$;

do $rls$
declare
  op uuid := (select v from fx where k='op');
  comp uuid := (select v from fx where k='comp');
  res uuid := (select v from fx where k='res');
  asm2 uuid := (select v from fx where k='asm2');
  q_comp text; q_unit text; q_res text; q_rev text; q_asm text;
  n integer; m integer;
begin
  q_comp := format('select count(*) from public.transport_operation_vehicle_compositions where transport_operation_id = %L', op);
  q_unit := format('select count(*) from public.transport_operation_vehicle_units where composition_id = %L', comp);
  q_res  := format('select count(*) from public.regulatory_compliance_results where id = %L', res);
  q_rev  := format('select count(*) from public.regulatory_compliance_review_events where compliance_result_id = %L', res);
  q_asm  := format('select count(*) from public.regulatory_assessments where id = %L', asm2);

  -- R1. embarcadora contratante le composicao e unidades
  n := pg_temp.conta_como((select v from fx where k='u_emb1'),'authenticated', q_comp);
  m := pg_temp.conta_como((select v from fx where k='u_emb1'),'authenticated', q_unit);
  raise notice 'R1.  embarcadora le composicao e unidades ........ % (comp=% unid=%)',
    case when n=1 and m=1 then 'OK' else 'FALHOU' end, n, m;

  -- R2. transportadora CONTRATADA le
  n := pg_temp.conta_como((select v from fx where k='u_tra1'),'authenticated', q_comp);
  raise notice 'R2.  transportadora contratada le composicao ..... % (linhas=%)',
    case when n=1 then 'OK' else 'FALHOU' end, n;

  -- R3. transportadora EFETIVA le
  n := pg_temp.conta_como((select v from fx where k='u_tra2'),'authenticated', q_comp);
  raise notice 'R3.  transportadora efetiva le composicao ........ % (linhas=%)',
    case when n=1 then 'OK' else 'FALHOU' end, n;

  -- R4. outra embarcadora NAO le
  n := pg_temp.conta_como((select v from fx where k='u_emb2'),'authenticated', q_comp);
  raise notice 'R4.  outra embarcadora nao le ................... % (linhas=%)',
    case when n=0 then 'OK' else 'FALHOU' end, n;

  -- R5. transportadora sem relacao NAO le
  n := pg_temp.conta_como((select v from fx where k='u_tra3'),'authenticated', q_comp);
  m := pg_temp.conta_como((select v from fx where k='u_tra3'),'authenticated', q_unit);
  raise notice 'R5.  transportadora alheia nao le ............... % (comp=% unid=%)',
    case when n=0 and m=0 then 'OK' else 'FALHOU' end, n, m;

  -- R6. motorista NAO le valores de conformidade
  n := pg_temp.conta_como((select v from fx where k='u_mot'),'authenticated', q_res);
  raise notice 'R6.  motorista nao le resultado de conformidade .. % (linhas=%)',
    case when n=0 then 'OK' else 'FALHOU' end, n;

  -- R7. anon nao le nada (sem grant)
  n := pg_temp.conta_como(null,'anon', q_comp);
  m := pg_temp.conta_como(null,'anon', q_res);
  raise notice 'R7.  anon sem acesso ............................ % (comp=% res=%  -1=sem grant)',
    case when n<=0 and m<=0 then 'OK' else 'FALHOU' end, n, m;

  -- R8. admin le
  n := pg_temp.conta_como((select v from fx where k='u_adm'),'authenticated', q_comp);
  m := pg_temp.conta_como((select v from fx where k='u_adm'),'authenticated', q_res);
  raise notice 'R8.  admin le composicao e resultado ............ % (comp=% res=%)',
    case when n=1 and m=1 then 'OK' else 'FALHOU' end, n, m;

  -- R9. parte comercial LE o resultado (nao basta bloquear: a parte tem de enxergar)
  n := pg_temp.conta_como((select v from fx where k='u_emb1'),'authenticated', q_res);
  raise notice 'R9.  embarcadora le proprio resultado ........... % (linhas=%)',
    case when n=1 then 'OK' else 'FALHOU' end, n;

  -- R10. eventos de revisao nao vazam para authenticated (sem grant e sem policy)
  n := pg_temp.conta_como((select v from fx where k='u_emb1'),'authenticated', q_rev);
  m := pg_temp.conta_como((select v from fx where k='u_adm'),'authenticated', q_rev);
  raise notice 'R10. eventos de revisao fechados a authenticated . % (embarc=% admin=%  -1=sem grant)',
    case when n<=0 and m<=0 then 'OK' else 'FALHOU' end, n, m;

  -- R11. assessment por offer_version_id respeita o tenant
  n := pg_temp.conta_como((select v from fx where k='u_emb2'),'authenticated', q_asm);
  m := pg_temp.conta_como((select v from fx where k='u_emb1'),'authenticated', q_asm);
  raise notice 'R11. assessment por offer_version respeita tenant % (dono=% alheio=%)',
    case when n=1 and m=0 then 'OK' else 'FALHOU' end, n, m;
end
$rls$;

-- R12. usuario comum nao escreve nas tabelas novas
do $w$
declare
  comp uuid := (select v from fx where k='comp');
  op uuid := (select v from fx where k='op');
  uid uuid := (select v from fx where k='u_emb1');
  ins boolean := false; upd boolean := false; del boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    execute format('insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (%L, 50, 3, 1)', op);
    exception when insufficient_privilege then ins := true; when others then ins := true;
  end;
  begin
    execute format('update public.transport_operation_vehicle_compositions set total_axles = 9 where id = %L', comp);
    exception when insufficient_privilege then upd := true; when others then upd := true;
  end;
  begin
    execute format('delete from public.transport_operation_vehicle_compositions where id = %L', comp);
    exception when insufficient_privilege then del := true; when others then del := true;
  end;
  perform set_config('role','none', true);
  raise notice 'R12. authenticated nao escreve (I/U/D) .......... %',
    case when ins and upd and del then 'OK' else 'FALHOU' end;
end
$w$;

-- R13. service_role NAO altera nem apaga linha protegida (trigger e agnostico a papel)
do $s$
declare
  comp uuid := (select v from fx where k='comp');
  res uuid := (select v from fx where k='res');
  ctr uuid := (select v from fx where k='ctr');
  le integer; upd boolean := false; del boolean := false; upd_res boolean := false; upd_ctr boolean := false;
begin
  perform set_config('role','service_role', true);
  begin
    execute format('select count(*) from public.transport_operation_vehicle_compositions where id = %L', comp) into le;
    exception when others then le := -1;
  end;
  begin
    execute format('update public.transport_operation_vehicle_compositions set total_axles = 9 where id = %L', comp);
    exception when others then upd := true;
  end;
  begin
    execute format('delete from public.transport_operation_vehicle_compositions where id = %L', comp);
    exception when others then del := true;
  end;
  begin
    execute format('update public.regulatory_compliance_results set compliance_status = ''compliant'' where id = %L', res);
    exception when others then upd_res := true;
  end;
  begin
    execute format('update public.contracts set total_amount_brl = 1 where id = %L', ctr);
    exception when others then upd_ctr := true;
  end;
  perform set_config('role','none', true);
  raise notice 'R13. service_role le (%) mas nao altera .......... % (comp U=% D=% result U=% contrato U=%)',
    le, case when le=1 and upd and del and upd_res and upd_ctr then 'OK' else 'FALHOU' end,
    upd, del, upd_res, upd_ctr;
end
$s$;

rollback;
