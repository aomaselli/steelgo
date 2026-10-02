-- Fechamento de acesso das cinco tabelas da Fase 1A.
--
-- POR QUE ESTE TESTE EXISTE: cada migration e sua propria transacao, logo uma
-- que falha nao desfaz a anterior. Os privilegios padrao deste projeto concedem
-- ALL em TABLES e FUNCTIONS de public a anon e authenticated, e tabela nova
-- nasce com RLS desabilitada. Se a 1/3 nao fechasse o que cria, o estado
-- "1/3 aplicada, 2/3 falhou" deixaria as cinco tabelas gravaveis por papel
-- anonimo e sem RLS.
--
-- REUTILIZAVEL EM QUALQUER FASE: as assercoes separam o que e INVARIANTE (anon
-- nunca tem nada; RLS nunca esta desligada) do que depende da fase (a leitura
-- de authenticated, concedida pela 2/3). A fase e detectada em
-- supabase_migrations.schema_migrations, nao presumida.
--
-- Nao cria fixture de dados. As tentativas reais sao todas recusadas, portanto
-- nada e escrito; os objetos de controle de P1 sao desfeitos pelo rollback.
\set ON_ERROR_STOP off

begin;

-- ---------------------------------------------------------------------------
-- P1. O ambiente reproduz os privilegios padrao relevantes?
-- ---------------------------------------------------------------------------
-- Sem esta assercao as demais nao significam nada: as cinco tabelas poderiam
-- estar fechadas apenas porque o ambiente nao concede ALL por padrao. Os dois
-- objetos de controle sao criados FORA do escopo da Fase 1A e removidos aqui.
create table public.zzz_fcg_controle_acesso (id integer primary key);
create function public.zzz_fcg_controle_acesso_fn() returns integer
  language sql immutable as 'select 1';

do $p1$
declare
  v_rls boolean;
  v_anon_tab integer := 0;
  v_auth_tab integer := 0;
  v_anon_fn boolean;
  v_public_fn boolean;
  o text;
begin
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.zzz_fcg_controle_acesso'::regclass;

  for o in select unnest(array['SELECT','INSERT','UPDATE','DELETE',
                               'TRUNCATE','REFERENCES','TRIGGER']) loop
    if has_table_privilege('anon', 'public.zzz_fcg_controle_acesso', o) then
      v_anon_tab := v_anon_tab + 1;
    end if;
    if has_table_privilege('authenticated', 'public.zzz_fcg_controle_acesso', o) then
      v_auth_tab := v_auth_tab + 1;
    end if;
  end loop;

  v_anon_fn   := has_function_privilege('anon', 'public.zzz_fcg_controle_acesso_fn()', 'EXECUTE');
  v_public_fn := coalesce((select proacl::text from pg_proc
                            where oid = 'public.zzz_fcg_controle_acesso_fn()'::regprocedure)
                            ~ '[{,]=X', true);

  raise notice 'P1. ambiente reproduz privilegios padrao ....... % (tabela nova: rls=% anon=%/7 auth=%/7; funcao nova: anon=% public=%)',
    case when v_rls = false and v_anon_tab = 7 and v_auth_tab = 7
              and v_anon_fn and v_public_fn
         then 'OK' else 'FALHOU' end,
    v_rls, v_anon_tab, v_auth_tab, v_anon_fn, v_public_fn;
end
$p1$;

drop function public.zzz_fcg_controle_acesso_fn();
drop table public.zzz_fcg_controle_acesso;


-- ---------------------------------------------------------------------------
-- P2 a P9. As cinco tabelas da Fase 1A
-- ---------------------------------------------------------------------------
do $p2$
declare
  c_tabelas text[] := array['transport_operation_vehicle_compositions',
                            'transport_operation_vehicle_units',
                            'regulatory_compliance_results',
                            'regulatory_compliance_review_events',
                            'fcg_observational_log'];
  -- tabelas que a 2/3 abre para leitura de authenticated
  c_legiveis text[] := array['transport_operation_vehicle_compositions',
                             'transport_operation_vehicle_units',
                             'regulatory_compliance_results'];
  v_seguranca_aplicada boolean;
  v_fase text;
  t text; p text; o text;
  v_col text;
  v_sql text;
  v_sqlstate text;
  v_msg text;

  v_rls_ligada integer := 0;
  v_public_com_acl integer := 0;
  v_anon_catalogo integer := 0;
  v_anon_checagens integer := 0;
  v_anon_recusas integer := 0;
  v_anon_vazou integer := 0;
  v_anon_outro_erro text := '';
  v_auth_escrita_recusas integer := 0;
  v_auth_escrita_vazou integer := 0;
  v_auth_leitura_ok integer := 0;
  v_auth_leitura_esperado integer := 0;
  v_fn_aberta integer := 0;
  v_seq integer;
  v_view integer;
  v_esperado_leitura boolean;
begin
  select exists (select 1 from supabase_migrations.schema_migrations
                  where version = '20260925120100')
    into v_seguranca_aplicada;
  v_fase := case when v_seguranca_aplicada
                 then 'com a 2/3 aplicada' else 'somente a 1/3 aplicada' end;

  -- P2. RLS habilitada nas cinco
  foreach t in array c_tabelas loop
    if (select relrowsecurity from pg_class
         where oid = ('public.' || quote_ident(t))::regclass) then
      v_rls_ligada := v_rls_ligada + 1;
    end if;
  end loop;
  raise notice 'P2. RLS habilitada nas cinco tabelas ........... % (%/5, fase: %)',
    case when v_rls_ligada = 5 then 'OK' else 'FALHOU' end, v_rls_ligada, v_fase;

  -- P3. PUBLIC sem privilegio. Entrada de PUBLIC em ACL vem sem nome de
  -- concedido antes do '=', por isso o padrao '[{,]='.
  foreach t in array c_tabelas loop
    if coalesce((select relacl::text from pg_class
                  where oid = ('public.' || quote_ident(t))::regclass), '') ~ '[{,]=' then
      v_public_com_acl := v_public_com_acl + 1;
    end if;
  end loop;
  raise notice 'P3. PUBLIC sem privilegio nas cinco ........... % (tabelas com entrada para PUBLIC=%)',
    case when v_public_com_acl = 0 then 'OK' else 'FALHOU' end, v_public_com_acl;

  -- P4. anon sem privilegio no catalogo. has_table_privilege ja considera
  -- privilegio herdado por participacao em papel.
  foreach t in array c_tabelas loop
    for o in select unnest(array['SELECT','INSERT','UPDATE','DELETE',
                                 'TRUNCATE','REFERENCES','TRIGGER']) loop
      v_anon_checagens := v_anon_checagens + 1;
      if has_table_privilege('anon', 'public.' || quote_ident(t), o) then
        v_anon_catalogo := v_anon_catalogo + 1;
      end if;
    end loop;
  end loop;
  raise notice 'P4. anon sem privilegio no catalogo ........... % (% checagens, % concessao(oes))',
    case when v_anon_catalogo = 0 and v_anon_checagens = 35 then 'OK' else 'FALHOU' end,
    v_anon_checagens, v_anon_catalogo;

  -- P5. anon recusado em tentativa real, inclusive TRUNCATE.
  -- Cada recusa e classificada pelo SQLSTATE: so 42501 (insufficient_privilege)
  -- conta. "Deu erro" nao e prova de acesso fechado -- erro de fixture, de
  -- constraint ou de sintaxe tem outro codigo e aqui reprova.
  foreach t in array c_tabelas loop
    select column_name into v_col from information_schema.columns
     where table_schema = 'public' and table_name = t
     order by ordinal_position limit 1;
    for o in select unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) loop
      v_sql := case o
        when 'SELECT'   then format('select count(*) from public.%I', t)
        when 'INSERT'   then format('insert into public.%I default values', t)
        when 'UPDATE'   then format('update public.%I set %I = %I where false', t, v_col, v_col)
        when 'DELETE'   then format('delete from public.%I where false', t)
        when 'TRUNCATE' then format('truncate table public.%I', t)
      end;
      begin
        execute 'set local role anon';
        execute v_sql;
        execute 'reset role';
        v_anon_vazou := v_anon_vazou + 1;
      exception
        when insufficient_privilege then
          v_anon_recusas := v_anon_recusas + 1;
        when others then
          get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
          v_anon_outro_erro := v_anon_outro_erro || format(' [%s %s %s]', t, o, v_sqlstate);
      end;
      begin execute 'reset role'; exception when others then null; end;
    end loop;
  end loop;
  raise notice 'P5. anon recusado por permissao em 25 tentativas % (recusas 42501=%/25 sem recusa=% outros codigos=%)',
    case when v_anon_recusas = 25 and v_anon_vazou = 0 and v_anon_outro_erro = ''
         then 'OK' else 'FALHOU' end,
    v_anon_recusas, v_anon_vazou,
    case when v_anon_outro_erro = '' then 'nenhum' else v_anon_outro_erro end;

  -- P6. authenticated nao escreve em nenhuma das cinco, em nenhuma fase.
  foreach t in array c_tabelas loop
    select column_name into v_col from information_schema.columns
     where table_schema = 'public' and table_name = t
     order by ordinal_position limit 1;
    for o in select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) loop
      v_sql := case o
        when 'INSERT'   then format('insert into public.%I default values', t)
        when 'UPDATE'   then format('update public.%I set %I = %I where false', t, v_col, v_col)
        when 'DELETE'   then format('delete from public.%I where false', t)
        when 'TRUNCATE' then format('truncate table public.%I', t)
      end;
      begin
        execute 'set local role authenticated';
        execute v_sql;
        execute 'reset role';
        v_auth_escrita_vazou := v_auth_escrita_vazou + 1;
      exception
        when insufficient_privilege then
          v_auth_escrita_recusas := v_auth_escrita_recusas + 1;
        when others then null;
      end;
      begin execute 'reset role'; exception when others then null; end;
    end loop;
  end loop;
  raise notice 'P6. authenticated nao escreve nas cinco ....... % (recusas 42501=%/20 sem recusa=%)',
    case when v_auth_escrita_recusas = 20 and v_auth_escrita_vazou = 0
         then 'OK' else 'FALHOU' end,
    v_auth_escrita_recusas, v_auth_escrita_vazou;

  -- P7. leitura de authenticated CONFORME A FASE. Antes da 2/3, nenhuma.
  -- Depois da 2/3, exatamente as tres que ela abre.
  v_auth_leitura_esperado := case when v_seguranca_aplicada then 3 else 0 end;
  foreach t in array c_tabelas loop
    v_esperado_leitura := v_seguranca_aplicada and (t = any (c_legiveis));
    if has_table_privilege('authenticated', 'public.' || quote_ident(t), 'SELECT') then
      v_auth_leitura_ok := v_auth_leitura_ok + 1;
      if not v_esperado_leitura then
        raise warning 'leitura inesperada de authenticated em % (fase: %)', t, v_fase;
      end if;
    elsif v_esperado_leitura then
      raise warning 'leitura ausente de authenticated em % (fase: %)', t, v_fase;
    end if;
  end loop;
  raise notice 'P7. leitura de authenticated conforme a fase ... % (concedidas=% esperadas=% fase: %)',
    case when v_auth_leitura_ok = v_auth_leitura_esperado then 'OK' else 'FALHOU' end,
    v_auth_leitura_ok, v_auth_leitura_esperado, v_fase;

  -- P8. Acesso indireto pela unica funcao que a 1/3 cria.
  -- tovc_enforce_axle_sum() e SECURITY DEFINER. PostgreSQL concede EXECUTE a
  -- PUBLIC em funcao nova por padrao e os privilegios padrao do projeto
  -- concedem ALL em FUNCTIONS a anon e authenticated.
  --
  -- O que o revoke impede, com precisao: que o privilegio exista. NAO e o
  -- unico obstaculo -- sendo funcao de trigger, o PostgreSQL tambem recusa a
  -- chamada direta, com SQLSTATE 0A000 ("trigger functions can only be called
  -- as triggers"), mesmo para quem tenha EXECUTE. O revoke vale como
  -- fechamento explicito e porque a protecao do 0A000 depende do tipo de
  -- retorno, que uma alteracao futura pode mudar.
  foreach p in array array['public','anon','authenticated'] loop
    if p = 'public' then
      if coalesce((select proacl::text from pg_proc
                    where oid = 'public.tovc_enforce_axle_sum()'::regprocedure), '') ~ '[{,]=X' then
        v_fn_aberta := v_fn_aberta + 1;
      end if;
    elsif has_function_privilege(p, 'public.tovc_enforce_axle_sum()', 'EXECUTE') then
      v_fn_aberta := v_fn_aberta + 1;
    end if;
  end loop;
  raise notice 'P8. funcao da 1/3 fechada a PUBLIC/anon/auth .. % (papeis com EXECUTE=%)',
    case when v_fn_aberta = 0 then 'OK' else 'FALHOU' end, v_fn_aberta;

  -- P9. A 1/3 nao cria sequencia nem view: nao ha outro objeto a fechar.
  select count(*) into v_seq from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'S'
     and c.relname ~ '(transport_operation_vehicle|regulatory_compliance|fcg_obs)';
  select count(*) into v_view from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v','m')
     and c.relname ~ '(transport_operation_vehicle|regulatory_compliance|fcg_obs)';
  raise notice 'P9. a 1/3 nao cria sequencia nem view ......... % (sequencias=% views=%)',
    case when v_seq = 0 and v_view = 0 then 'OK' else 'FALHOU' end, v_seq, v_view;
end
$p2$;

rollback;
