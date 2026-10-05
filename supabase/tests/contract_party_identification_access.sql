-- Alcance de public.list_contract_party_identification: quem recebe e quem não.
--
-- POR QUE ESTE TESTE EXISTE: a função devolve identificação EMPRESARIAL (CNPJ
-- das duas empresas e RNTRC/ANTT da transportadora) sem ampliar
-- `companies_select` nem conceder SELECT novo em `companies`/`carriers`. Toda a
-- contenção está no predicado — ser dono de UMA das duas empresas do contrato.
-- Se esse predicado afrouxar, o vazamento é de documento de empresa, e nada na
-- aplicação denunciaria. Daí a asserção negativa valer tanto quanto a positiva.
--
-- O ALCANCE É DE PROPÓSITO MAIS ESTREITO QUE `is_contract_visible`, que também
-- reconhece motorista vinculado e administrador. O teste prova a diferença
-- comparando as duas funções sobre O MESMO contrato: a de nomes responde ao
-- motorista, esta não.
--
-- Fixture própria, com documentos sintéticos improváveis de colidir com dado
-- existente, em transação revertida no fim: não depende de dado
-- preexistente e não deixa resíduo. Os gatilhos ficam desligados apenas para
-- inserir a fixture (chave estrangeira de `freight_id` não interessa aqui).
\set ON_ERROR_STOP on

begin;

set local session_replication_role = replica;

create temporary table t_ator(papel text primary key, uid uuid) on commit drop;
insert into t_ator values
  ('embarcador',     '11111111-1111-4111-8111-aaaaaaaaaaaa'),
  ('transportadora', '22222222-2222-4222-8222-bbbbbbbbbbbb'),
  ('motorista',      '33333333-3333-4333-8333-cccccccccccc'),
  ('terceiro',       '44444444-4444-4444-8444-dddddddddddd');

create temporary table t_id(chave text primary key, valor uuid) on commit drop;
insert into t_id values
  ('empresa_embarcador',     '55555555-5555-4555-8555-eeeeeeeeeeee'),
  ('empresa_transportadora', '66666666-6666-4666-8666-ffffffffffff'),
  ('contrato',               '77777777-7777-4777-8777-000000000000'),
  ('frete',                  '88888888-8888-4888-8888-111111111111');

insert into public.companies (id, owner_id, name, cnpj)
values
  ((select valor from t_id where chave='empresa_embarcador'),
   (select uid from t_ator where papel='embarcador'),
   'Embarcador de Teste', '09900011000199'),
  ((select valor from t_id where chave='empresa_transportadora'),
   (select uid from t_ator where papel='transportadora'),
   'Transportadora de Teste', '09900022000188');

insert into public.carriers (company_id, antt_rntrc)
values ((select valor from t_id where chave='empresa_transportadora'), 'BR-TESTE-0001');

insert into public.contracts (id, freight_id, shipper_company_id, carrier_company_id, driver_id)
values ((select valor from t_id where chave='contrato'),
        (select valor from t_id where chave='frete'),
        (select valor from t_id where chave='empresa_embarcador'),
        (select valor from t_id where chave='empresa_transportadora'),
        (select uid from t_ator where papel='motorista'));

set local session_replication_role = default;

-- ---------------------------------------------------------------------------
-- Execução por ator
-- ---------------------------------------------------------------------------
create temporary table t_res(
  papel text, linhas int, carrier_cnpj text, shipper_cnpj text, antt text,
  linhas_rpc_de_nomes int, erro text
) on commit drop;

do $x$
declare
  r record;
  v_contrato uuid := (select valor from t_id where chave='contrato');
  v_n int; v_cc text; v_sc text; v_antt text; v_nomes int; v_err text;
begin
  for r in select papel, uid from t_ator order by papel loop
    v_n := null; v_cc := null; v_sc := null; v_antt := null; v_nomes := null; v_err := null;
    perform set_config('request.jwt.claim.sub', r.uid::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.uid::text, 'role', 'authenticated')::text, true);
    begin
      execute 'set local role authenticated';
      select count(*), max(x.carrier_cnpj), max(x.shipper_cnpj), max(x.carrier_antt_rntrc)
        into v_n, v_cc, v_sc, v_antt
        from public.list_contract_party_identification(array[v_contrato]) x;
      select count(*) into v_nomes
        from public.list_visible_contract_counterparties(array[v_contrato]) y;
      execute 'reset role';
    exception when others then
      get stacked diagnostics v_err = message_text;
      begin execute 'reset role'; exception when others then null; end;
    end;
    insert into t_res values (r.papel, v_n, v_cc, v_sc, v_antt, v_nomes, v_err);
  end loop;

  -- Sem sessão: a função tem de recusar, não devolver vazio.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    execute 'set local role authenticated';
    perform public.list_contract_party_identification(array[v_contrato]);
    execute 'reset role';
    insert into t_res values ('sem sessao', -1, null, null, null, null, 'NAO RECUSOU');
  exception when others then
    get stacked diagnostics v_err = message_text;
    begin execute 'reset role'; exception when others then null; end;
    insert into t_res values ('sem sessao', null, null, null, null, null, v_err);
  end;
end
$x$;

select * from t_res order by papel;

-- ---------------------------------------------------------------------------
-- Asserções
-- ---------------------------------------------------------------------------
do $a$
declare v record;
begin
  -- ACESSO AUTORIZADO: as duas partes recebem a identificação completa.
  for v in select * from t_res where papel in ('embarcador','transportadora') loop
    if v.linhas is distinct from 1 then
      raise exception 'ACESSO AUTORIZADO FALHOU: % recebeu % linha(s)', v.papel, v.linhas;
    end if;
    if v.carrier_cnpj is distinct from '09900022000188'
       or v.shipper_cnpj is distinct from '09900011000199'
       or v.antt is distinct from 'BR-TESTE-0001' then
      raise exception 'ACESSO AUTORIZADO FALHOU: % recebeu dado errado (% / % / %)',
        v.papel, v.shipper_cnpj, v.carrier_cnpj, v.antt;
    end if;
  end loop;

  -- ACESSO NEGADO: motorista vinculado e terceiro não recebem nada.
  for v in select * from t_res where papel in ('motorista','terceiro') loop
    if v.linhas is distinct from 0 then
      raise exception 'ACESSO NEGADO FALHOU: % recebeu % linha(s) de identificacao',
        v.papel, v.linhas;
    end if;
    if v.erro is not null then
      raise exception 'ACESSO NEGADO deve ser lista vazia, nao erro (%): %', v.papel, v.erro;
    end if;
  end loop;

  -- A diferença de alcance é real: o motorista VÊ a função de nomes e NÃO vê
  -- a de identificação. Sem esta asserção, zero linhas poderia ser só fixture
  -- inválida.
  select * into v from t_res where papel = 'motorista';
  if v.linhas_rpc_de_nomes is distinct from 1 then
    raise exception 'FIXTURE INVALIDA: motorista deveria enxergar a RPC de nomes, recebeu %',
      v.linhas_rpc_de_nomes;
  end if;

  -- SEM SESSÃO: recusa explícita, nunca lista vazia.
  select * into v from t_res where papel = 'sem sessao';
  if v.erro is null or v.erro not like '%nao autenticado%' then
    raise exception 'SEM SESSAO deveria recusar com 42501, resultado: % / %', v.linhas, v.erro;
  end if;

  raise notice 'contract_party_identification_access: TODAS AS ASSERCOES PASSARAM';
end
$a$;

rollback;
