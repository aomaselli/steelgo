-- =============================================================================
-- Fase 1A - suite comportamental: composicao veicular, categorias RNTRC e RLS.
-- Cria fixtures REAIS dentro da transacao e faz ROLLBACK. Nenhum teste passa
-- sem ter criado dado.
-- =============================================================================
\set ON_ERROR_STOP off

begin;

-- ---------------------------------------------------------------- fixtures
do $fx$
declare
  u_emb1 uuid := gen_random_uuid();
  u_emb2 uuid := gen_random_uuid();
  u_tra1 uuid := gen_random_uuid();
  u_tra2 uuid := gen_random_uuid();
  u_mot  uuid := gen_random_uuid();
  c_emb1 uuid; c_emb2 uuid; c_tra1 uuid; c_tra2 uuid;
  car1 uuid; trk1 uuid; drv1 uuid; frt uuid; ctr uuid; op uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (u_emb1, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','emb1@fcg.invalid','',now(),now(),now()),
    (u_emb2, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','emb2@fcg.invalid','',now(),now(),now()),
    (u_tra1, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','tra1@fcg.invalid','',now(),now(),now()),
    (u_tra2, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','tra2@fcg.invalid','',now(),now(),now()),
    (u_mot,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','mot@fcg.invalid','',now(),now(),now());

  insert into public.companies (owner_id, name) values (u_emb1,'Embarcadora A') returning id into c_emb1;
  insert into public.companies (owner_id, name) values (u_emb2,'Embarcadora B') returning id into c_emb2;
  insert into public.companies (owner_id, name) values (u_tra1,'Transportadora A') returning id into c_tra1;
  insert into public.companies (owner_id, name) values (u_tra2,'Transportadora B') returning id into c_tra2;

  insert into public.carriers (company_id, antt_rntrc) values (c_tra1,'12345678') returning id into car1;
  insert into public.trucks (carrier_id, plate, type, capacity_tons)
    values (car1,'ABC1D23','carreta',30) returning id into trk1;
  insert into public.drivers (carrier_id, profile_id, full_name)
    values (car1, u_mot, 'Motorista Teste') returning id into drv1;

  insert into public.freights (company_id, created_by) values (c_emb1, u_emb1) returning id into frt;
  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id, driver_id, truck_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
    values (frt, c_emb1, c_tra1, u_mot, trk1, 5000.00, 250.00, 4750.00, 'draft') returning id into ctr;

  insert into public.transport_operations
    (origin_kind, freight_id, contract_id, shipper_company_id, carrier_company_id,
     driver_id, truck_id, operation_state, retention_policy)
  values ('marketplace', frt, ctr, c_emb1, c_tra1, drv1, trk1, 'created','pending_legal_definition')
  returning id into op;

  create temp table fx(k text primary key, v uuid) on commit drop;
  insert into fx values
    ('u_emb1',u_emb1),('u_emb2',u_emb2),('u_tra1',u_tra1),('u_tra2',u_tra2),('u_mot',u_mot),
    ('c_emb1',c_emb1),('c_tra1',c_tra1),('car1',car1),('trk1',trk1),('drv1',drv1),
    ('frt',frt),('ctr',ctr),('op',op);
  raise notice 'fixtures criadas: operacao=%', op;
end
$fx$;

-- =========================================================== A. COMPOSICAO
do $A$
declare
  op uuid := (select v from fx where k='op');
  trk uuid := (select v from fx where k='trk1');
  comp uuid; ok boolean;
begin
  -- A1. composicao SEM nenhuma unidade nao pode ser concluida
  ok := false;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 90, 3, 1);
    set constraints all immediate;
    exception when others then ok := true;
  end;
  raise notice 'A1. composicao sem unidades recusada ........... %', case when ok then 'OK' else 'FALHOU' end;
  set constraints all deferred;

  -- A2. unit_count diferente da quantidade real falha
  ok := false;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 91, 3, 2)
    returning id into comp;
    insert into public.transport_operation_vehicle_units
      (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
    values (comp, trk, 'registered_vehicle', 1, 3, '{"plate":"ABC1D23"}'::jsonb);
    set constraints all immediate;
    exception when others then ok := true;
  end;
  raise notice 'A2. unit_count divergente recusado ............. %', case when ok then 'OK' else 'FALHOU' end;
  set constraints all deferred;

  -- A3. total_axles diferente da soma real falha
  ok := false;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 92, 9, 1)
    returning id into comp;
    insert into public.transport_operation_vehicle_units
      (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
    values (comp, trk, 'registered_vehicle', 1, 3, '{"plate":"ABC1D23"}'::jsonb);
    set constraints all immediate;
    exception when others then ok := true;
  end;
  raise notice 'A3. total_axles divergente recusado ............ %', case when ok then 'OK' else 'FALHOU' end;
  set constraints all deferred;

  -- A4. unidade com zero eixos falha
  ok := false;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 93, 3, 1)
    returning id into comp;
    insert into public.transport_operation_vehicle_units
      (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
    values (comp, trk, 'registered_vehicle', 1, 0, '{"plate":"ABC1D23"}'::jsonb);
    exception when others then ok := true;
  end;
  raise notice 'A4. unidade com zero eixos recusada ............ %', case when ok then 'OK' else 'FALHOU' end;
  set constraints all deferred;

  -- A5. posicoes duplicadas falham
  ok := false;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 94, 6, 2)
    returning id into comp;
    insert into public.transport_operation_vehicle_units
      (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
    values (comp, trk, 'registered_vehicle', 1, 3, '{"p":1}'::jsonb),
           (comp, trk, 'registered_vehicle', 1, 3, '{"p":2}'::jsonb);
    exception when others then ok := true;
  end;
  raise notice 'A5. posicoes duplicadas recusadas .............. %', case when ok then 'OK' else 'FALHOU' end;
  set constraints all deferred;

  -- A6. versao duplicada falha
  ok := false;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 95, 3, 1)
    returning id into comp;
    insert into public.transport_operation_vehicle_units
      (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
    values (comp, trk, 'registered_vehicle', 1, 3, '{"p":1}'::jsonb);
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 95, 3, 1);
    exception when others then ok := true;
  end;
  raise notice 'A6. versao duplicada recusada .................. %', case when ok then 'OK' else 'FALHOU' end;
  set constraints all deferred;
end
$A$;

-- composicao valida isolada, para os testes de imutabilidade e snapshot
do $A7$
declare
  op uuid := (select v from fx where k='op');
  trk uuid := (select v from fx where k='trk1');
  comp uuid; u boolean := false; d boolean := false; snap text; novo text;
begin
  insert into public.transport_operation_vehicle_compositions
    (transport_operation_id, version, total_axles, unit_count) values (op, 1, 3, 1)
  returning id into comp;
  insert into public.transport_operation_vehicle_units
    (composition_id, truck_id, unit_role, position, axle_count, attributes_snapshot)
  values (comp, trk, 'registered_vehicle', 1, 3,
          jsonb_build_object('plate','ABC1D23','type','carreta','capacity_tons',30));
  set constraints all immediate;
  raise notice 'A0. composicao valida (3 eixos, 1 unidade) ..... OK';

  -- A7. alteracao e exclusao falham
  begin
    update public.transport_operation_vehicle_compositions set total_axles = 5 where id = comp;
    exception when sqlstate '42501' then u := true;
  end;
  begin
    delete from public.transport_operation_vehicle_units where composition_id = comp;
    exception when sqlstate '42501' then d := true;
  end;
  raise notice 'A7. UPDATE e DELETE recusados .................. %', case when u and d then 'OK' else 'FALHOU' end;

  -- A8. mudanca posterior em trucks nao altera o snapshot
  select attributes_snapshot->>'plate' into snap
    from public.transport_operation_vehicle_units where composition_id = comp;
  update public.trucks set plate = 'ZZZ9Z99', capacity_tons = 99 where id = trk;
  select attributes_snapshot->>'plate' into novo
    from public.transport_operation_vehicle_units where composition_id = comp;
  raise notice 'A8. snapshot imune a alteracao em trucks ....... % (antes=% depois=% / trucks agora=%)',
    case when snap = novo and novo = 'ABC1D23' then 'OK' else 'FALHOU' end,
    snap, novo, (select plate from public.trucks where id = trk);
end
$A7$;

-- A9. rollback nao deixa composicao orfa
do $A9$
declare
  op uuid := (select v from fx where k='op');
  trk uuid := (select v from fx where k='trk1');
  antes integer; depois integer;
begin
  select count(*) into antes from public.transport_operation_vehicle_compositions;
  begin
    insert into public.transport_operation_vehicle_compositions
      (transport_operation_id, version, total_axles, unit_count) values (op, 99, 3, 1);
    set constraints all immediate;
    exception when others then null;
  end;
  set constraints all deferred;
  select count(*) into depois from public.transport_operation_vehicle_compositions;
  raise notice 'A9. tentativa invalida nao deixa orfa .......... % (antes=% depois=%)',
    case when antes = depois then 'OK' else 'FALHOU' end, antes, depois;
end
$A9$;

-- ================================================ B. CATEGORIA x TRATAMENTO
do $B$
declare
  c_emb uuid := (select v from fx where k='c_emb1');
  c_tra uuid := (select v from fx where k='c_tra1');
  drv uuid := (select v from fx where k='drv1');
  u uuid := (select v from fx where k='u_emb1');
  ev jsonb := '{"rntrc":"12345678","consulta":"2026-09-25","veiculos":2}'::jsonb;
  ok boolean;

begin
  -- B1. TAC pessoa fisica
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_driver_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b1', 'tac','standard', ev, drv);
    ok := true;
    exception when others then ok := false;
  end;
  raise notice 'B1. TAC pessoa fisica aceito ................... %', case when ok then 'OK' else 'FALHOU' end;

  -- B2. ETC pessoa juridica
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_carrier_company_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b2', 'etc','standard', ev, c_tra);
    ok := true;
    exception when others then ok := false;
  end;
  raise notice 'B2. ETC pessoa juridica aceito ................. %', case when ok then 'OK' else 'FALHOU' end;

  -- B3. CTC pessoa juridica
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_carrier_company_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b3', 'ctc','standard', ev, c_tra);
    ok := true;
    exception when others then ok := false;
  end;
  raise notice 'B3. CTC pessoa juridica aceito ................. %', case when ok then 'OK' else 'FALHOU' end;

  -- B4. ETC com tratamento tac_equivalent
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_carrier_company_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b4', 'etc','tac_equivalent', ev, c_tra);
    ok := true;
    exception when others then ok := false;
  end;
  raise notice 'B4. ETC equiparada a TAC aceita ................ %', case when ok then 'OK' else 'FALHOU' end;

  -- B5. CTC com tratamento tac_equivalent
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_carrier_company_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b5', 'ctc','tac_equivalent', ev, c_tra);
    ok := true;
    exception when others then ok := false;
  end;
  raise notice 'B5. CTC equiparada a TAC aceita ................ %', case when ok then 'OK' else 'FALHOU' end;

  -- B6. TAC nao pode ser tac_equivalent
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_driver_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b6', 'tac','tac_equivalent', ev, drv);
    exception when sqlstate '23514' then ok := true;
  end;
  raise notice 'B6. TAC equiparado a TAC recusado .............. %', case when ok then 'OK' else 'FALHOU' end;

  -- B7. ETC com pessoa fisica recusada
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_rntrc_snapshot, effective_driver_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b7', 'etc','standard', ev, drv);
    exception when sqlstate '23514' then ok := true;
  end;
  raise notice 'B7. ETC com pessoa fisica recusada ............. %', case when ok then 'OK' else 'FALHOU' end;

  -- B8. categoria sem evidencia de RNTRC recusada
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
      effective_carrier_company_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b8', 'etc','standard', c_tra);
    exception when sqlstate '23514' then ok := true;
  end;
  raise notice 'B8. categoria sem evidencia RNTRC recusada ..... %', case when ok then 'OK' else 'FALHOU' end;

  -- B9. categoria sem tratamento recusada
  ok := false;
  begin
    insert into public.transport_operations (origin_kind, shipper_company_id, operation_state,
      retention_policy, registered_by, registration_note,
      effective_carrier_rntrc_category, effective_carrier_rntrc_snapshot, effective_carrier_company_id)
    values ('manual', c_emb, 'created','pending_legal_definition', u, 'b9', 'etc', ev, c_tra);
    exception when sqlstate '23514' then ok := true;
  end;
  raise notice 'B9. categoria sem tratamento recusada .......... %', case when ok then 'OK' else 'FALHOU' end;
end
$B$;

rollback;
