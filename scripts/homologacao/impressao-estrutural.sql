-- Impressão estrutural dos objetos do #13, por DEFINIÇÃO.
--
-- Nome igual não é definição igual: duas instâncias podem ter uma policy
-- `validation_documents_own` em ambas e com `using` diferente, e a comparação
-- por nome passaria. Aqui sai o texto que o Postgres devolve para cada objeto
-- — `pg_get_constraintdef`, `qual`/`with_check` das policies,
-- `pg_get_functiondef`, `pg_get_triggerdef`, `indexdef` — de modo que a
-- comparação entre duas instâncias seja um `diff` linha a linha.
--
-- A saída é ordenada e sem identificadores de instância (OIDs, timestamps),
-- para que o `diff` só acuse diferença de verdade.
--
-- USO
--   bash scripts/banco/destino-autorizado.sh <apelido> \
--        --sql-arquivo scripts/homologacao/impressao-estrutural.sql
\pset format unaligned
\pset tuples_only on

-- Colunas: tipo, nulidade e default.
select 'COLUNA|' || table_name || '|' || column_name || '|' || data_type
       || '|' || coalesce(character_maximum_length::text, '-')
       || '|' || is_nullable || '|' || coalesce(column_default, '-')
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('document_consent_texts','document_consents','validation_documents',
                      'document_audit','document_retention_policy')
 order by table_name, column_name;

-- Constraints: a DEFINIÇÃO, não só o nome.
select 'CONSTRAINT|' || conrelid::regclass::text || '|' || conname
       || '|' || contype::text || '|' || pg_get_constraintdef(oid)
  from pg_constraint
 where connamespace = 'public'::regnamespace
   and conrelid::regclass::text in ('document_consent_texts','document_consents',
       'validation_documents','document_audit','document_retention_policy')
 order by conrelid::regclass::text, conname;

-- Índices: a definição completa, que carrega colunas, unicidade e predicado.
select 'INDICE|' || tablename || '|' || indexname || '|' || indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('document_consent_texts','document_consents','validation_documents',
                     'document_audit','document_retention_policy')
 order by tablename, indexname;

-- Policies: comando, papéis, `using` e `with check`.
select 'POLICY|' || schemaname || '.' || tablename || '|' || policyname
       || '|' || cmd || '|' || array_to_string(roles, ',')
       || '|' || coalesce(qual, '-') || '|' || coalesce(with_check, '-')
  from pg_policies
 where (schemaname = 'public' and tablename in ('document_consent_texts','document_consents',
        'validation_documents','document_audit','document_retention_policy'))
    or (schemaname = 'storage' and policyname like 'validation_docs_%')
 order by schemaname, tablename, policyname;

-- Funções criadas pela migration: o corpo inteiro, numa linha.
select 'FUNCAO|' || p.proname || '|' ||
       replace(replace(pg_get_functiondef(p.oid), chr(10), ' '), chr(13), ' ')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('document_audit_block_mutation', 'concluir_expurgo_de_documento')
 order by p.proname;

-- Privilégios de execução das funções. `concluir_expurgo_de_documento` é
-- `security definer` e escreve na trilha: tem de estar fora do alcance do
-- cliente, e isso é parte da definição tanto quanto o corpo.
select 'FUNCAO_GRANT|' || p.proname || '|' || g.grantee || '|' ||
       has_function_privilege(g.grantee, p.oid, 'execute')::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as g(grantee)
 where n.nspname = 'public'
   and p.proname in ('document_audit_block_mutation', 'concluir_expurgo_de_documento')
 order by p.proname, g.grantee;

-- Triggers: a definição completa.
select 'TRIGGER|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal
   and c.relnamespace = 'public'::regnamespace
   and c.relname in ('document_consent_texts','document_consents','validation_documents',
                     'document_audit','document_retention_policy')
 order by c.relname, t.tgname;

-- RLS ligada?
select 'RLS|' || relname || '|' || relrowsecurity::text || '|' || relforcerowsecurity::text
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('document_consent_texts','document_consents','validation_documents',
                   'document_audit','document_retention_policy')
 order by relname;

-- Privilégios de tabela para os papéis do cliente. `document_audit` tem de
-- estar fora do alcance deles.
select 'GRANT|' || table_name || '|' || grantee || '|' || string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('document_consent_texts','document_consents','validation_documents',
                      'document_audit','document_retention_policy')
   and grantee in ('anon','authenticated')
 group by table_name, grantee
 order by table_name, grantee;

-- O bucket.
select 'BUCKET|' || id || '|' || public::text || '|' || coalesce(file_size_limit::text,'-')
       || '|' || coalesce(array_to_string(allowed_mime_types, ','), '-')
  from storage.buckets where id = 'validation-documents';

-- Comentários de tabela: também são contrato, e também podem divergir.
select 'COMENTARIO|' || c.relname || '|' ||
       replace(coalesce(obj_description(c.oid, 'pg_class'), '-'), chr(10), ' ')
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('document_consent_texts','document_consents','validation_documents',
                     'document_audit','document_retention_policy')
 order by c.relname;
