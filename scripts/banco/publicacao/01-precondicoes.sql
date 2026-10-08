-- =============================================================================
-- 20261008120000 — PRE-CONDICOES (somente leitura)
-- =============================================================================
-- Nao escreve nada. Levanta excecao quando alguma condicao nao se sustenta,
-- para que o codigo de saida seja diferente de zero e o passo seguinte nao rode.
--
-- Recebe de quem chama, por -v:
--   ref_esperado          ref do projeto de producao
--   identidade_esperada   system_identifier pinado, ou a string vazia
--   datid_esperado        OID do banco pinado, ou a string vazia
--
-- IDENTIDADE INSUFICIENTE BLOQUEIA. Se nenhuma das duas identidades foi pinada,
-- este script recusa. Se foi pinada e nao confere, recusa. Se foi pinada e o
-- banco nao deixa ler nenhuma delas, recusa. Nao ha caminho em que a aplicacao
-- siga sem identidade conferida de dentro do banco.
-- =============================================================================
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select '== A. IDENTIDADE DO DESTINO';
select '  banco           = ' || current_database();
select '  usuario         = ' || current_user;
select '  versao          = ' || current_setting('server_version');
select '  em recuperacao? = ' || pg_is_in_recovery()::text;
select '  datid           = ' || (select oid::text from pg_database where datname = current_database());

-- O psql NAO interpola variaveis dentro de blocos delimitados por $$. Por isso
-- os valores entram antes, por uma tabela temporaria, e o bloco le dali. Passar
-- `:'variavel'` direto no corpo do DO rende `syntax error at or near ":"`.
create temporary table esperado as
select nullif(btrim(:'identidade_esperada'), '') as sysid,
       nullif(btrim(:'datid_esperado'), '')      as datid,
       nullif(btrim(:'ref_esperado'), '')        as ref;

do $$
declare
  v_esperado_sysid text := (select sysid from esperado);
  v_esperado_datid text := (select datid from esperado);
  v_sysid          text;
  v_datid          text;
  v_conferidas     int := 0;
begin
  if pg_is_in_recovery() then
    raise exception 'destino em recuperacao (replica): nao aplique migration aqui';
  end if;

  if v_esperado_sysid is null and v_esperado_datid is null then
    raise exception 'identidade insuficiente: nenhum system_identifier nem datid foi pinado em destino-producao.local. Rode 02-aplicar.sh --capturar-identidade, confira no painel e preencha.';
  end if;

  select oid::text into v_datid from pg_database where datname = current_database();

  begin
    select system_identifier::text into v_sysid from pg_control_system();
  exception when others then
    v_sysid := null;
    raise notice '  system_identifier nao e legivel por este papel (%)', sqlstate;
  end;

  if v_esperado_sysid is not null then
    if v_sysid is null then
      raise notice '  system_identifier pinado mas ilegivel: esta conferencia nao conta';
    elsif v_sysid <> v_esperado_sysid then
      raise exception 'system_identifier do destino (%) difere do pinado (%): PARE, voce nao esta onde pensa', v_sysid, v_esperado_sysid;
    else
      v_conferidas := v_conferidas + 1;
      raise notice '  system_identifier confere';
    end if;
  end if;

  if v_esperado_datid is not null then
    if v_datid <> v_esperado_datid then
      raise exception 'datid do destino (%) difere do pinado (%): PARE, voce nao esta onde pensa', v_datid, v_esperado_datid;
    else
      v_conferidas := v_conferidas + 1;
      raise notice '  datid confere';
    end if;
  end if;

  if v_conferidas = 0 then
    raise exception 'identidade insuficiente: nenhuma das identidades pinadas pode ser conferida neste destino. Nao aplique.';
  end if;

  raise notice '  identidade conferida por % sinal(is) lido(s) de dentro do banco', v_conferidas;
end $$;

select '== B. A MIGRATION JA FOI APLICADA?';
do $$
declare v_fn boolean; v_hist boolean;
begin
  v_fn := exists (select 1 from pg_proc p
                   where p.proname = 'list_carrier_driver_invitations'
                     and p.pronamespace = 'public'::regnamespace);
  v_hist := exists (select 1 from supabase_migrations.schema_migrations
                     where version = '20261008120000');
  raise notice '  funcao existe  = %', v_fn;
  raise notice '  historico tem  = %', v_hist;
  if v_fn and v_hist then
    raise exception 'ja aplicada e registrada: nada a fazer (pare aqui)';
  end if;
  if v_fn and not v_hist then
    raise exception 'funcao existe mas o historico nao a registra: estado inconsistente, ver README secao 5';
  end if;
  if v_hist and not v_fn then
    raise exception 'historico registra a versao mas a funcao nao existe: estado inconsistente, ver README secao 5';
  end if;
end $$;

select '== C. DEPENDENCIAS';
do $$
declare v_falta text := '';
begin
  if to_regclass('public.driver_carrier_invitations') is null then
    v_falta := v_falta || ' public.driver_carrier_invitations';
  end if;
  if not exists (select 1 from pg_proc p where p.proname = 'is_current_user_company_owner'
                   and p.pronamespace = 'public'::regnamespace) then
    v_falta := v_falta || ' public.is_current_user_company_owner';
  end if;
  if not exists (select 1 from pg_proc p where p.proname = 'is_current_user_company_member'
                   and p.pronamespace = 'public'::regnamespace) then
    v_falta := v_falta || ' public.is_current_user_company_member';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'auth' and p.proname = 'uid') then
    v_falta := v_falta || ' auth.uid';
  end if;
  if v_falta <> '' then
    raise exception 'dependencias ausentes:%', v_falta;
  end if;
  raise notice '  todas presentes';
end $$;

select '== D. PREMISSA DE SEGURANCA (o revoke da tabela tem de estar de pe)';
do $$
begin
  raise notice '  authenticated select na tabela = %',
    has_table_privilege('authenticated', 'public.driver_carrier_invitations', 'select');
  raise notice '  anon select na tabela          = %',
    has_table_privilege('anon', 'public.driver_carrier_invitations', 'select');
  if has_table_privilege('authenticated', 'public.driver_carrier_invitations', 'select')
     or has_table_privilege('anon', 'public.driver_carrier_invitations', 'select') then
    raise exception 'a tabela esta legivel direto por anon/authenticated: token_hash e os hashes de CPF/CNH ja estariam expostos. Isso muda a premissa da migration -- pare e reavalie';
  end if;
end $$;

select '== E. HISTORICO (informativo: confira contra a arvore do repositorio)';
select '  versoes registradas = ' || count(*)::text from supabase_migrations.schema_migrations;
select '  ultima registrada   = ' || coalesce(max(version), '(nenhuma)') from supabase_migrations.schema_migrations;

select '== PRE-CONDICOES OK — pode seguir para 02-aplicar.sh --aplicar';
