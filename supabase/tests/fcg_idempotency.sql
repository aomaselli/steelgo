-- =============================================================================
-- F1 - idempotencia de create_transport_operation_from_contract_core.
-- Casos sequenciais. A concorrencia real fica em fcg_idempotency_concurrency.ps1,
-- que abre duas conexoes de verdade.
-- Transacional, revertido por rollback.
-- =============================================================================
\set ON_ERROR_STOP off

begin;

do $fx$
declare
  u_emb uuid := gen_random_uuid();
  u_tra uuid := gen_random_uuid();
  u_alheio uuid := gen_random_uuid();
  c_emb uuid; c_tra uuid; c_sub uuid; frt uuid; ctr1 uuid; ctr2 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select x.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         x.em,'',now(),now(),now()
    from (values (u_emb,'idem-emb@fcg.invalid'),(u_tra,'idem-tra@fcg.invalid'),
                 (u_alheio,'idem-alheio@fcg.invalid')) as x(id, em);

  insert into public.companies (owner_id, name) values (u_emb,'Idem Embarcadora') returning id into c_emb;
  insert into public.companies (owner_id, name) values (u_tra,'Idem Transportadora') returning id into c_tra;
  insert into public.companies (owner_id, name) values (u_tra,'Idem Subcontratada') returning id into c_sub;
  insert into public.freights (company_id, created_by) values (c_emb, u_emb) returning id into frt;

  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (frt, c_emb, c_tra, 3000.00, 150.00, 2850.00, 'draft') returning id into ctr1;
  insert into public.contracts (freight_id, shipper_company_id, carrier_company_id,
                                total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
  values (frt, c_emb, c_tra, 4000.00, 200.00, 3800.00, 'draft') returning id into ctr2;

  create temp table ix(k text primary key, v uuid) on commit drop;
  insert into ix values ('u_emb',u_emb),('u_tra',u_tra),('u_alheio',u_alheio),
                        ('c_emb',c_emb),('c_tra',c_tra),('c_sub',c_sub),
                        ('frt',frt),('ctr1',ctr1),('ctr2',ctr2);
end
$fx$;

do $i$
declare
  ctr1 uuid := (select v from ix where k='ctr1');
  ctr2 uuid := (select v from ix where k='ctr2');
  emb  uuid := (select v from ix where k='u_emb');
  alheio uuid := (select v from ix where k='u_alheio');
  tra  uuid := (select v from ix where k='c_tra');
  sub  uuid := (select v from ix where k='c_sub');
  evA jsonb := '{"rntrc":"11111111","fonte":"A"}'::jsonb;
  evB jsonb := '{"rntrc":"22222222","fonte":"B"}'::jsonb;
  req uuid := gen_random_uuid();
  req2 uuid := gen_random_uuid();
  req3 uuid := gen_random_uuid();
  op1 uuid; op2 uuid; op3 uuid; ret uuid;
  st text; antes int; depois int; fp1 text; fp2 text;
begin
  -- I1. primeira criacao
  op1 := public.create_transport_operation_from_contract_core(
    ctr1, req, emb, 'etc','standard', evA, tra, null, null);
  select params_fingerprint into fp1 from public.transport_operations where id = op1;
  raise notice 'I1. criacao inicial grava a impressao ......... % (fp=%...)',
    case when op1 is not null and fp1 ~ '^[0-9a-f]{64}$' then 'OK' else 'FALHOU' end, left(fp1,12);

  -- I2. MESMO request_id, MESMO payload -> replay legitimo
  st := null;
  begin
    op2 := public.create_transport_operation_from_contract_core(
      ctr1, req, emb, 'etc','standard', evA, tra, null, null);
    exception when others then st := sqlstate;
  end;
  raise notice 'I2. mesmo request_id e mesmo payload ......... % (mesma operacao=% erro=%)',
    case when st is null and op2 = op1 then 'OK' else 'FALHOU' end,
    case when op2 = op1 then 'sim' else 'nao' end, coalesce(st,'nenhum');

  -- I3. MESMO request_id, payload DIFERENTE -> conflito, sem escrita parcial
  select count(*) into antes from public.transport_operations;
  st := null;
  begin
    ret := public.create_transport_operation_from_contract_core(
      ctr1, req, emb, 'ctc','tac_equivalent', evB, tra, null, sub);
    exception when others then st := sqlstate;
  end;
  select count(*) into depois from public.transport_operations;
  select params_fingerprint into fp2 from public.transport_operations where id = op1;
  raise notice 'I3. mesmo request_id e payload diferente ..... % (sqlstate=%)',
    case when st = '22023' then 'OK' else 'FALHOU' end, coalesce(st,'nenhum erro');
  raise notice 'I4. conflito nao deixou escrita parcial ...... % (linhas antes=% depois=% impressao intacta=%)',
    case when antes = depois and fp1 = fp2 then 'OK' else 'FALHOU' end,
    antes, depois, case when fp1 = fp2 then 'sim' else 'nao' end;

  -- I5. OUTRO request_id, MESMO contrato, payload IGUAL -> mesma operacao
  st := null;
  begin
    op3 := public.create_transport_operation_from_contract_core(
      ctr1, req2, emb, 'etc','standard', evA, tra, null, null);
    exception when others then st := sqlstate;
  end;
  raise notice 'I5. outro request_id, mesmo contrato, igual .. % (mesma operacao=% erro=%)',
    case when st is null and op3 = op1 then 'OK' else 'FALHOU' end,
    case when op3 = op1 then 'sim' else 'nao' end, coalesce(st,'nenhum');

  -- I6. OUTRO request_id, MESMO contrato, payload DIFERENTE -> conflito
  --     (era exatamente o caminho que passava em silencio)
  select count(*) into antes from public.transport_operations;
  st := null;
  begin
    ret := public.create_transport_operation_from_contract_core(
      ctr1, req3, emb, 'ctc','tac_equivalent', evB, tra, null, sub);
    exception when others then st := sqlstate;
  end;
  select count(*) into depois from public.transport_operations;
  raise notice 'I6. outro request_id, mesmo contrato, difere . % (sqlstate=% linhas antes=% depois=%)',
    case when st = '22023' and antes = depois then 'OK' else 'FALHOU' end,
    coalesce(st,'nenhum erro'), antes, depois;

  -- I7. request_id migrando para OUTRO contrato -> conflito de escopo
  st := null;
  begin
    ret := public.create_transport_operation_from_contract_core(
      ctr2, req, emb, 'etc','standard', evA, tra, null, null);
    exception when others then st := sqlstate;
  end;
  raise notice 'I7. request_id nao migra de contrato ......... % (sqlstate=%)',
    case when st = '22023' then 'OK' else 'FALHOU' end, coalesce(st,'nenhum erro');

  -- I8. ISOLAMENTO DE AUTORIZACAO NO REPLAY: ator alheio reapresenta o
  --     request_id valido. Antes da correcao ele recebia o id sem passar por
  --     autorizacao nenhuma, porque o replay vinha antes da checagem.
  st := null; ret := null;
  begin
    ret := public.create_transport_operation_from_contract_core(
      ctr1, req, alheio, 'etc','standard', evA, tra, null, null);
    exception when others then st := sqlstate;
  end;
  raise notice 'I8. replay de ator alheio recusado ........... % (sqlstate=% id devolvido=%)',
    case when st = '42501' and ret is null then 'OK' else 'FALHOU' end,
    coalesce(st,'nenhum erro'), coalesce(ret::text,'nenhum');

  -- I10. impressao e estavel: reordenar nao muda nada (mesma chamada duas vezes)
  raise notice 'I10. impressao canonica e estavel ............ % (fp=%)',
    case when public.fcg_operation_fingerprint(ctr1,null,null,null,null,null,emb,'etc','standard',evA,tra,null,null)
            = public.fcg_operation_fingerprint(ctr1,null,null,null,null,null,emb,'etc','standard',evA,tra,null,null)
         then 'OK' else 'FALHOU' end,
    left(public.fcg_operation_fingerprint(ctr1,null,null,null,null,null,emb,'etc','standard',evA,tra,null,null),12);

  -- I11. ausente e nulo colapsam; nulo e preenchido NAO colapsam
  raise notice 'I11. nulo != preenchido na impressao ......... %',
    case when public.fcg_operation_fingerprint(ctr1,null,null,null,null,null,emb,null,null,null,null,null,null)
            <> public.fcg_operation_fingerprint(ctr1,null,null,null,null,null,emb,'etc','standard',evA,tra,null,null)
         then 'OK' else 'FALHOU' end;
end
$i$;

rollback;
