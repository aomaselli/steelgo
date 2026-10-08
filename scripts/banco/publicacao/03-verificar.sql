-- =============================================================================
-- 20261008120000 — VERIFICACAO POSTERIOR (somente leitura)
-- =============================================================================
-- Nao escreve nada. Os testes de papel rodam dentro de transacoes que terminam
-- em rollback. Cada conferencia imprime OK ou FALHOU; a ultima secao levanta
-- excecao se qualquer uma tiver falhado, para que o codigo de saida sirva de
-- porta.
-- =============================================================================
\pset format unaligned
\pset tuples_only on

create temporary table resultado (ordem serial, linha text);

-- --------------------------------------------------------------- 1. a funcao
insert into resultado (linha)
select case
  when (select count(*) from pg_proc p
         where p.proname = 'list_carrier_driver_invitations'
           and p.pronamespace = 'public'::regnamespace) <> 1
    then 'FALHOU | deveria existir exatamente uma funcao, ha outra contagem'
  when not (select p.prosecdef from pg_proc p
             where p.oid = 'public.list_carrier_driver_invitations(uuid)'::regprocedure)
    then 'FALHOU | a funcao nao e security definer'
  -- `set search_path = ''` e guardado em proconfig como `search_path=""`, com
  -- as aspas. Comparar com 'search_path=' reprova uma migration correta -- foi
  -- o que esta conferencia fez no ensaio, antes de ser corrigida. Exigimos um
  -- unico ajuste, e que o valor seja vazio depois de tirar as aspas.
  when coalesce((select array_length(p.proconfig, 1) from pg_proc p
                  where p.oid = 'public.list_carrier_driver_invitations(uuid)'::regprocedure), 0) <> 1
    then 'FALHOU | proconfig deveria ter exatamente um ajuste (search_path)'
  when replace(replace(coalesce((select p.proconfig[1] from pg_proc p
                  where p.oid = 'public.list_carrier_driver_invitations(uuid)'::regprocedure), ''),
               '"', ''), '''', '')
       <> 'search_path='
    then 'FALHOU | search_path nao esta fixado em vazio'
  when (select p.provolatile from pg_proc p
         where p.oid = 'public.list_carrier_driver_invitations(uuid)'::regprocedure) <> 's'
    then 'FALHOU | a funcao nao e stable'
  else 'OK     | funcao unica, security definer, search_path fixo em vazio, stable'
end;

-- ------------------------------------------------------- 2. colunas devolvidas
-- Nenhum segredo pode sair por aqui: sem token_hash, sem hash de CPF/CNH.
insert into resultado (linha)
select case
  when (select string_agg(n.name, ',' order by n.i)
          from pg_proc p cross join lateral unnest(p.proargnames) with ordinality n(name, i)
         where p.oid = 'public.list_carrier_driver_invitations(uuid)'::regprocedure and n.i > 1)
       <> 'id,driver_id,invited_email,invited_phone,status,expires_at,accepted_at,revoked_at,created_at'
    then 'FALHOU | o conjunto de colunas devolvidas nao e o esperado'
  else 'OK     | devolve as 9 colunas previstas; nenhum token nem hash'
end;

-- ------------------------------------------------------------------- 3. ACL
insert into resultado (linha)
select case
  when has_function_privilege('anon', 'public.list_carrier_driver_invitations(uuid)', 'execute')
    then 'FALHOU | anon tem EXECUTE'
  when not has_function_privilege('authenticated', 'public.list_carrier_driver_invitations(uuid)', 'execute')
    then 'FALHOU | authenticated nao tem EXECUTE'
  when not has_function_privilege('service_role', 'public.list_carrier_driver_invitations(uuid)', 'execute')
    then 'FALHOU | service_role nao tem EXECUTE'
  when exists (select 1 from pg_proc p
                cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'public.list_carrier_driver_invitations(uuid)'::regprocedure
                 and a.grantee = 0 and a.privilege_type = 'EXECUTE')
    then 'FALHOU | ha EXECUTE concedido a PUBLIC'
  else 'OK     | EXECUTE so para authenticated e service_role; nada para anon nem PUBLIC'
end;

-- ------------------------------------------------------------- 4. isolamento
-- A tabela continua ilegivel direto. Se isto falhar, a migration deixou de ser
-- a alternativa ao grant e passou a conviver com ele.
insert into resultado (linha)
select case
  when has_table_privilege('authenticated', 'public.driver_carrier_invitations', 'select')
    then 'FALHOU | authenticated voltou a ler a tabela direto'
  when has_table_privilege('anon', 'public.driver_carrier_invitations', 'select')
    then 'FALHOU | anon voltou a ler a tabela direto'
  else 'OK     | driver_carrier_invitations continua sem SELECT para anon e authenticated'
end;

-- --------------------------------------------------------------- 5. historico
insert into resultado (linha)
select case
  when (select count(*) from supabase_migrations.schema_migrations
         where version = '20261008120000') <> 1
    then 'FALHOU | o historico nao tem exatamente uma linha para 20261008120000'
  when (select statements is null or array_length(statements, 1) is null
          from supabase_migrations.schema_migrations where version = '20261008120000')
    then 'FALHOU | a linha de historico nao guarda o texto aplicado'
  else 'OK     | historico registra 20261008120000 com o texto aplicado'
end;

-- ------------------------------------------- 6. recusa efetiva, sem autenticado
-- Executa de fato, como anon, e espera 42501. Em transacao propria; nao escreve.
do $$
declare v_res text;
begin
  begin
    set local role anon;
    perform public.list_carrier_driver_invitations('00000000-0000-0000-0000-000000000000');
    v_res := 'FALHOU | anon conseguiu executar a funcao';
  exception
    when insufficient_privilege then v_res := 'OK     | anon recusado (42501): ' || sqlerrm;
    when others then v_res := 'FALHOU | anon parou por outro motivo (' || sqlstate || '): ' || sqlerrm;
  end;
  reset role;
  insert into resultado (linha) values (v_res);
end $$;

-- ---------------------------------------- 7. recusa de chamador sem sujeito
do $$
declare v_res text;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    perform public.list_carrier_driver_invitations('00000000-0000-0000-0000-000000000000');
    v_res := 'FALHOU | chamador sem sujeito foi atendido';
  exception
    when insufficient_privilege then v_res := 'OK     | sem sujeito recusado (42501)';
    when others then v_res := 'FALHOU | parou por outro motivo (' || sqlstate || '): ' || sqlerrm;
  end;
  reset role;
  insert into resultado (linha) values (v_res);
end $$;

-- ------------------------------------------------------------------ veredito
select '== VERIFICACAO 20261008120000';
select '  ' || linha from resultado order by ordem;

do $$
declare v_falhas int;
begin
  select count(*) into v_falhas from resultado where linha like 'FALHOU%';
  if v_falhas > 0 then
    raise exception '% conferencia(s) falharam: NAO publique a aplicacao; ver 04-reverter.sql', v_falhas;
  end if;
  raise notice '  todas as conferencias passaram';
end $$;

select '== OK — a migration esta publicada e isolada. Pode seguir para o merge do #4.';
