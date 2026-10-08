-- =============================================================================
-- 20261008120000 — RECUPERACAO
-- =============================================================================
-- QUANDO NAO E PRECISO USAR ISTO. Se 02-aplicar.sh falhar, nao ha o que
-- reverter: a aplicacao inteira roda em UMA transacao com ON_ERROR_STOP=1, e um
-- erro no meio desfaz tambem o registro no historico. Confirme com
-- 01-precondicoes.sql e reaplique.
--
-- QUANDO E PRECISO. Quando a aplicacao concluiu mas 03-verificar.sql reprovou,
-- ou quando se decide retirar a funcao antes de publicar a aplicacao.
--
-- O QUE ESTA REVERSAO PRESERVA. Toda a informacao. A migration 20261008120000 e
-- ADITIVA: cria uma funcao, comenta, ajusta a ACL dessa mesma funcao e confere
-- invariantes. Ela nao escreve, altera nem apaga uma unica linha de dados, nao
-- cria nem altera tabela, coluna, indice, policy ou tipo, e nao mexe em
-- privilegio de nenhum objeto preexistente. Retirar a funcao devolve o banco ao
-- estado anterior exatamente -- o maximo que se perde e a capacidade da tela de
-- listar convites, que volta a ser o 403 conhecido.
--
-- ORDEM. Reverta a aplicacao ANTES do banco se o #4 ja estiver publicado: uma
-- aplicacao nova contra um banco sem a funcao mostra "Nao foi possivel carregar
-- os convites" (estado de erro honesto, nao lista vazia), mas e uma regressao
-- visivel para a transportadora.
--
-- USO
--   psql "$SUPABASE_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f 04-reverter.sql
-- =============================================================================
\pset format unaligned
\pset tuples_only on

select '== estado antes da reversao';
select '  funcao existe   = ' || exists (
  select 1 from pg_proc p where p.proname = 'list_carrier_driver_invitations'
    and p.pronamespace = 'public'::regnamespace)::text;
select '  historico tem   = ' || exists (
  select 1 from supabase_migrations.schema_migrations where version = '20261008120000')::text;

-- Barreira: nao deixar cair outra coisa por engano. So removemos a assinatura
-- exata, e so se ela for a unica com esse nome.
do $$
begin
  if (select count(*) from pg_proc p
       where p.proname = 'list_carrier_driver_invitations'
         and p.pronamespace = 'public'::regnamespace) > 1 then
    raise exception 'ha mais de uma funcao com esse nome: pare e inspecione antes de remover';
  end if;
end $$;

drop function if exists public.list_carrier_driver_invitations(uuid);

delete from supabase_migrations.schema_migrations where version = '20261008120000';

-- Fail-closed: a reversao so vale se devolveu o banco ao estado anterior, e sem
-- ter afrouxado a tabela no caminho.
do $$
begin
  if exists (select 1 from pg_proc p where p.proname = 'list_carrier_driver_invitations'
               and p.pronamespace = 'public'::regnamespace) then
    raise exception 'a funcao continua existindo apos o drop';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261008120000') then
    raise exception 'a linha de historico continua existindo apos o delete';
  end if;
  if has_table_privilege('authenticated', 'public.driver_carrier_invitations', 'select')
     or has_table_privilege('anon', 'public.driver_carrier_invitations', 'select') then
    raise exception 'a tabela ficou legivel direto: a reversao nao pode terminar expondo token_hash';
  end if;
  if to_regclass('public.driver_carrier_invitations') is null then
    raise exception 'a tabela de convites sumiu: isto nao deveria ser possivel, pare tudo';
  end if;
end $$;

select '== revertida. Banco no estado anterior a 20261008120000; nenhum dado tocado.';
select '  convites preservados = ' || count(*)::text from public.driver_carrier_invitations;
