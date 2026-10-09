-- =============================================================================
-- Bateria: documentos de validação — acesso, consentimento, trilha, expurgo
-- =============================================================================
-- Confere que as policies do banco concordam com `src/server/documents/`, que é
-- a referência da matriz e já está testada em função pura. As duas precisam
-- concordar: o banco é a segunda barreira, não a única.
--
-- Só dados sintéticos. Nenhum documento real, nenhum byte de imagem: os testes
-- usam caminhos de objeto, não arquivos.
--
-- USO
--   bash scripts/banco/destino-autorizado.sh simulacao -1 \
--        --sql-arquivo supabase/tests/validation_documents_matriz.sql
--
-- POR QUE RODA COM -1 E NÃO COM --permitir-parada-desligada
--
-- Uma versão anterior desta bateria desligava ON_ERROR_STOP e relatava por
-- linha de texto, o que exige registro em `suites-permitidas.txt` e deixa o
-- veredito para quem lê. Aqui não é preciso: toda asserção que provoca erro de
-- SQL o provoca DENTRO de bloco plpgsql com `exception`, então nenhum erro
-- legítimo escapa para o psql. Com isso vale a configuração estrita —
-- ON_ERROR_STOP=1 e transação única — e o veredito é do próprio SQL: ao final,
-- se houver qualquer FALHOU, a bateria levanta exceção e o psql termina em
-- código não zero.
--
-- A última instrução é um `rollback`, de propósito: a bateria escreve para
-- exercitar barreiras de verdade (aceite, trilha, objeto, prazo) e não deve
-- deixar nada atrás. Inclusive as linhas da trilha, que o trigger append-only
-- não permitiria apagar depois.
--
-- O QUE ESTA BATERIA NÃO MEDE
--
-- A validade da URL assinada. URL assinada é emitida pelo Storage, não pelo
-- banco; o teto de 120 s vive em `src/server/documents/access.ts` e se mede
-- contra o endpoint, não aqui. O que o banco pode provar — e prova na seção E —
-- é a condição que torna a URL temporária necessária: não existe caminho de
-- leitura anônima para o bucket.
-- =============================================================================
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create temporary table resultado (ordem serial, linha text);

create or replace function pg_temp.reg(p_ok boolean, p_texto text)
returns void language sql as $f$
  insert into resultado (linha)
  values (case when p_ok then 'OK     | ' else 'FALHOU | ' end || p_texto);
$f$;

-- Atores sintéticos já existentes na instância, com os papéis conferidos em
-- public.user_roles antes da execução.
\set TITULAR    '''efa78aef-cfae-4263-a6fc-3a802e65cdbd'''
\set OUTRO      '''3b017ae9-b74a-4c1a-87d7-e796ad2a7feb'''
\set TRANSPORTA '''bea14780-db1e-4dc0-9847-693f8076ba14'''
\set EMBARCADOR '''5ef1a0ba-670b-4217-97d2-b1814970203e'''
\set ADMIN      '''5340d6e8-fadb-479d-8421-dc29ca44c606'''

create temporary table atores (ordem serial, papel text, sujeito uuid, espera text);
insert into atores (papel, sujeito, espera) values
  ('titular',        :TITULAR,    'permite'),
  ('outro motorista', :OUTRO,     'recusa'),
  ('transportadora', :TRANSPORTA, 'recusa'),
  ('embarcador',     :EMBARCADOR, 'recusa'),
  ('admin',          :ADMIN,      'permite');

-- Executa como `authenticated` com o `sub` do ator, que é o que `auth.uid()`
-- lê. Sem trocar de papel a RLS não se aplica: a conexão é `postgres`.
create or replace function pg_temp.como(p_sujeito uuid) returns void
language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', p_sujeito::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sujeito, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

-- Dentro de bloco dollar-quoted o psql NAO interpola `:VAR`. Quem resolve o
-- ator ali e esta funcao, lendo a mesma tabela `atores`.
--
-- CUIDADO: `atores` e tabela de apoio do teste, nao do assunto sob teste, e
-- `authenticated` nao tem privilegio nela. Chamar isto DEPOIS de trocar de
-- papel levanta 'permission denied for table atores' -- que um bloco com
-- `exception when others` registraria como se fosse a barreira recusando.
-- Tres assercoes passaram por esse motivo errado antes desta correcao. Por
-- isso cada bloco resolve o ator em variavel ANTES de trocar de papel.
create or replace function pg_temp.ator(p_papel text) returns uuid
language sql as $f$ select sujeito from atores where papel = p_papel $f$;

create or replace function pg_temp.tentar_leitura(p_sujeito uuid, p_caminho text)
returns text language plpgsql as $f$
declare v int;
begin
  perform pg_temp.como(p_sujeito);
  select count(*) into v from storage.objects
   where bucket_id = 'validation-documents' and name = p_caminho;
  reset role;
  return case when v > 0 then 'permite' else 'recusa' end;
exception when others then
  reset role;
  return 'recusa';
end $f$;

-- ───────────────────────────────────────────────────────────────────────────
select '== A. O BUCKET É PRIVADO';

select pg_temp.reg(
  not (select public from storage.buckets where id = 'validation-documents'),
  'A1. validation-documents e privado');

select pg_temp.reg(
  (select file_size_limit from storage.buckets where id = 'validation-documents') <= 5242880,
  'A2. limite de tamanho dentro do previsto (5 MB)');

select pg_temp.reg(
  (select allowed_mime_types from storage.buckets where id = 'validation-documents')
    <@ array['image/jpeg','image/png'],
  'A3. so imagem jpeg ou png aceita');

-- ───────────────────────────────────────────────────────────────────────────
select '== B. MATRIZ DE ACESSO — titular e admin leem; demais, nao';

-- Objeto sintético do titular. Sem bytes: a policy decide pelo caminho.
insert into storage.objects (bucket_id, name, owner, metadata)
values ('validation-documents',
        'identity_validation/' || :TITULAR || '/selfie-sintetica.jpg',
        :TITULAR::uuid, '{"size": 1}'::jsonb)
on conflict do nothing;

do $$
declare a record; obtido text; caminho text;
begin
  caminho := 'identity_validation/'
             || (select sujeito from atores where papel = 'titular')::text
             || '/selfie-sintetica.jpg';
  for a in select * from atores order by ordem loop
    obtido := pg_temp.tentar_leitura(a.sujeito, caminho);
    perform pg_temp.reg(obtido = a.espera,
      'B. ' || rpad(a.papel, 16) || ' -> ' || obtido || '  (esperado ' || a.espera || ')');
  end loop;
end $$;

-- anon nunca chega a revelar se o documento existe (access.ts, barreira 1).
do $$
declare v int; r text;
begin
  begin
    execute 'set local role anon';
    select count(*) into v from storage.objects
     where bucket_id = 'validation-documents';
    reset role;
    r := case when v = 0 then 'OK' else 'VISTO' end;
  exception when others then
    reset role; r := 'OK';
  end;
  perform pg_temp.reg(r = 'OK', 'B. anon            -> recusa  (esperado recusa)');
end $$;

-- Gravar na pasta de outro titular é recusado pela with-check da policy.
do $$
declare caminho text; v_titular uuid; v_outro uuid;
begin
  -- Resolvidos como `postgres`, antes de qualquer troca de papel.
  v_titular := pg_temp.ator('titular');
  v_outro   := pg_temp.ator('outro motorista');
  caminho := 'identity_validation/' || v_outro::text || '/selfie-intrusa.jpg';
  begin
    perform pg_temp.como(v_titular);
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('validation-documents', caminho, v_titular, '{"size": 1}'::jsonb);
    reset role;
    perform pg_temp.reg(false, 'B. gravar na pasta de outro titular foi ACEITO');
  exception when others then
    reset role;
    perform pg_temp.reg(true, 'B. gravar na pasta de outro titular recusado');
  end;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
select '== C. A TRILHA';

select pg_temp.reg(
  not (has_table_privilege('authenticated', 'public.document_audit', 'select')
       or has_table_privilege('anon', 'public.document_audit', 'select')),
  'C1. document_audit fora do alcance do cliente');

-- A linha existe ANTES de tentar alterar. O trigger e FOR EACH ROW: numa
-- tabela vazia o UPDATE nao dispara nada e a assercao nao prova nada. Era o
-- defeito da versao anterior desta bateria.
insert into public.document_audit
  (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
values
  ('upload', :TITULAR::uuid, :TITULAR::uuid, 'driver', 'identity_validation',
   'selfie', 'identity_validation/' || :TITULAR || '/selfie-sintetica.jpg');

-- Contagem POR CAMINHO, nao absoluta. A trilha e append-only: numa instancia
-- que ja rodou qualquer coisa ela tem linhas, e `count(*) = 1` reprovava por
-- isso -- nao por defeito algum. Foi o que aconteceu depois da homologacao
-- integrada do expurgo, que deixa trilha de proposito.
select pg_temp.reg(
  (select count(*) from public.document_audit
    where object_path like '%selfie-sintetica.jpg') = 1,
  'C2. a linha de trilha existe, logo o trigger tem o que recusar');

do $$
begin
  begin
    update public.document_audit set reason_code = 'x'
     where object_path like '%selfie-sintetica.jpg';
    perform pg_temp.reg(false, 'C3. UPDATE na trilha foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'C3. UPDATE na trilha recusado: ' || left(sqlerrm, 44));
  end;
end $$;

do $$
begin
  begin
    delete from public.document_audit
     where object_path like '%selfie-sintetica.jpg';
    perform pg_temp.reg(false, 'C4. DELETE na trilha foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'C4. DELETE na trilha recusado: ' || left(sqlerrm, 44));
  end;
end $$;

-- O ator que NAO e pessoa. O expurgo automatico nao tem usuario, e
-- `actor_id` e `uuid not null`: a convencao e um UUID reservado de zeros com
-- `actor_role = 'system'`. O check amarra as duas pontas -- e o que impede a
-- convencao de virar comentario que alguem contraria sem perceber.
do $$
declare v_titular uuid;
begin
  v_titular := pg_temp.ator('titular');
  begin
    insert into public.document_audit
      (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
    values ('purge', v_titular, v_titular, 'system', 'identity_validation',
            'selfie', 'identity_validation/x/ator-de-sistema-com-pessoa.jpg');
    perform pg_temp.reg(false, 'C5. papel de sistema com ator de PESSOA foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'C5. papel de sistema com ator de pessoa recusado');
  end;
end $$;

do $$
declare v_titular uuid;
begin
  v_titular := pg_temp.ator('titular');
  begin
    insert into public.document_audit
      (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
    values ('access', v_titular, '00000000-0000-0000-0000-000000000000', 'driver',
            'identity_validation', 'selfie',
            'identity_validation/x/pessoa-com-ator-reservado.jpg');
    perform pg_temp.reg(false, 'C6. papel de pessoa com o UUID reservado foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'C6. papel de pessoa com o UUID reservado recusado');
  end;
end $$;

-- Caso positivo: sem ele, C5 e C6 poderiam passar por a tabela recusar tudo.
do $$
declare v_titular uuid; n int;
begin
  v_titular := pg_temp.ator('titular');
  insert into public.document_audit
    (action, subject_id, actor_id, actor_role, purpose, kind, object_path, reason_code)
  values ('purge', v_titular, '00000000-0000-0000-0000-000000000000', 'system',
          'identity_validation', 'selfie',
          'identity_validation/x/expurgo-de-sistema.jpg', 'BIOMETRIC_EXPIRED');
  select count(*) into n from public.document_audit
   where object_path = 'identity_validation/x/expurgo-de-sistema.jpg';
  perform pg_temp.reg(n = 1, 'C7. expurgo de sistema com o UUID reservado e aceito');
exception when others then
  perform pg_temp.reg(false, 'C7. expurgo de sistema foi recusado: ' || left(sqlerrm, 40));
end $$;

-- ───────────────────────────────────────────────────────────────────────────
select '== D. CONSENTIMENTO';

insert into public.document_consent_texts
  (purpose, version, body_md, body_sha256, published_by)
values ('identity_validation', 'v-sintetica-1', 'corpo sintetico',
        repeat('a', 64), :ADMIN::uuid);

do $$
begin
  begin
    insert into public.document_consent_texts
      (purpose, version, body_md, body_sha256, published_by)
    values ('identity_validation', 'v-sintetica-1', 'corpo DIFERENTE',
            repeat('b', 64), pg_temp.ator('admin'));
    perform pg_temp.reg(false, 'D1. republicar a MESMA versao com corpo diferente foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'D1. mesma versao com corpo diferente recusada');
  end;
end $$;

do $$
begin
  begin
    insert into public.document_consents (subject_id, purpose, version, text_sha256)
    values (pg_temp.ator('titular'), 'marketing', 'v-sintetica-1', repeat('a', 64));
    perform pg_temp.reg(false, 'D2. aceite de outra finalidade foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'D2. aceite de finalidade nao prevista recusado');
  end;
end $$;

do $$
declare v_titular uuid; v_outro uuid;
begin
  v_titular := pg_temp.ator('titular');
  v_outro   := pg_temp.ator('outro motorista');
  begin
    perform pg_temp.como(v_titular);
    insert into public.document_consents (subject_id, purpose, version, text_sha256)
    values (v_outro, 'identity_validation', 'v-sintetica-1', repeat('a', 64));
    reset role;
    perform pg_temp.reg(false, 'D3. aceitar PELO outro titular foi ACEITO');
  exception when others then
    reset role;
    perform pg_temp.reg(true, 'D3. aceitar pelo outro titular recusado');
  end;
end $$;

-- Caso positivo: sem ele, D3 poderia passar por a tabela estar inacessivel.
do $$
declare v int; v_titular uuid;
begin
  v_titular := pg_temp.ator('titular');
  perform pg_temp.como(v_titular);
  insert into public.document_consents (subject_id, purpose, version, text_sha256)
  values (v_titular, 'identity_validation', 'v-sintetica-1', repeat('a', 64));
  select count(*) into v from public.document_consents;
  reset role;
  perform pg_temp.reg(v = 1, 'D4. o titular grava e le o PROPRIO aceite (leu ' || v || ')');
exception when others then
  reset role;
  perform pg_temp.reg(false, 'D4. o titular nao conseguiu gravar o proprio aceite: ' || left(sqlerrm, 40));
end $$;

do $$
declare v int; v_outro uuid;
begin
  v_outro := pg_temp.ator('outro motorista');
  perform pg_temp.como(v_outro);
  select count(*) into v from public.document_consents;
  reset role;
  perform pg_temp.reg(v = 0, 'D5. outro motorista nao le o aceite alheio (leu ' || v || ')');
exception when others then
  reset role;
  perform pg_temp.reg(false, 'D5. erro ao conferir leitura alheia');
end $$;

-- ───────────────────────────────────────────────────────────────────────────
select '== E. NAO HA LEITURA ANONIMA (e o que torna a URL temporaria necessaria)';

select pg_temp.reg(
  not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and 'anon' = any (roles)
       and coalesce(qual, '') like '%validation-documents%'),
  'E1. nenhuma policy do bucket concede acesso a anon');

select pg_temp.reg(
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'validation_docs_%') = 4,
  'E2. as quatro policies do bucket estao no lugar');

-- ───────────────────────────────────────────────────────────────────────────
select '== F. RETENCAO E EXPURGO';

select pg_temp.reg(
  not exists (select 1 from public.document_retention_policy
               where biometric_days is not null
                  or document_image_days is not null
                  or abandoned_upload_hours is not null),
  'F1. nenhum prazo inventado: os tres nascem nulos');

select pg_temp.reg(
  (select count(*) from public.document_retention_policy) = 1,
  'F2. politica unica');

-- Sem `rollback` dentro do bloco. A versao anterior tinha um, no caminho de
-- sucesso do UPDATE: se a constraint tivesse falhado, o `rollback` invalido em
-- plpgsql levantaria erro, o handler sobrescreveria o veredito e a falha
-- apareceria como OK. Aqui o veredito sai do estado conferido depois.
do $$
declare aceitou boolean := false; valor int;
begin
  begin
    update public.document_retention_policy set biometric_days = 30;
    aceitou := true;
  exception when others then
    aceitou := false;
  end;
  select biometric_days into valor from public.document_retention_policy;
  perform pg_temp.reg(not aceitou and valor is null,
    'F3. prazo sem aprovador recusado (aceitou=' || aceitou
    || ', valor=' || coalesce(valor::text, 'nulo') || ')');
end $$;

-- Caso positivo: com aprovador registrado o prazo entra. Sem ele, F3 poderia
-- passar por a tabela simplesmente nao aceitar escrita nenhuma.
do $$
declare valor int;
begin
  update public.document_retention_policy
     set biometric_days = 30, approved_by = pg_temp.ator('admin'), approved_at = now();
  select biometric_days into valor from public.document_retention_policy;
  perform pg_temp.reg(valor = 30,
    'F4. prazo COM aprovador registrado e aceito (valor=' || coalesce(valor::text,'nulo') || ')');
exception when others then
  perform pg_temp.reg(false, 'F4. prazo com aprovador foi recusado: ' || left(sqlerrm, 40));
end $$;

-- Expurgo do documento. A trilha sobrevive — e por nao guardar o documento que
-- ela pode sobreviver a ele.
insert into public.validation_documents
  (subject_id, purpose, kind, object_path, validation_started_at)
values (:TITULAR::uuid, 'identity_validation', 'selfie',
        'identity_validation/' || :TITULAR || '/selfie-sintetica.jpg', now());

-- O Storage protege `storage.objects` contra DELETE direto, por trigger
-- propria (`storage.protect_delete`). Nao e defeito da migration: e o que
-- obriga o expurgo do ARQUIVO a passar pela Storage API, em vez de sumir com
-- o objeto por SQL e deixar o arquivo orfao. A policy
-- `validation_docs_delete_own` continua valendo -- ela e avaliada quando a
-- Storage API apaga em nome do usuario -- e por isso NAO se exercita daqui.
do $$
declare recusou boolean := false;
begin
  begin
    delete from storage.objects
     where bucket_id = 'validation-documents' and name like '%selfie-sintetica.jpg';
  exception when others then
    recusou := true;
  end;
  perform pg_temp.reg(recusou,
    'F5. storage.objects recusa DELETE direto; expurgo do arquivo passa pela Storage API');
end $$;

do $$
declare docs int; trilha int;
begin
  delete from public.validation_documents
   where object_path like '%selfie-sintetica.jpg';
  select count(*) into docs from public.validation_documents
   where object_path like '%selfie-sintetica.jpg';
  select count(*) into trilha from public.document_audit
   where object_path like '%selfie-sintetica.jpg';
  perform pg_temp.reg(docs = 0,
    'F6. registro do documento expurgado (restaram ' || docs || ')');
  perform pg_temp.reg(trilha = 1,
    'F7. a trilha sobreviveu ao documento (linhas=' || trilha || ')');
end $$;

-- ───────────────────────────────────────────────────────────────────────────
select '== G. FALHA DE EXPURGO DISTINGUIVEL DE TAREFA NAO EXECUTADA';

-- `purged_at is null` permite nova tentativa, e e isso que o torna seguro.
-- Sozinho, ele nao diz se o expurgo falhou ou se a tarefa nunca rodou: os
-- dois estados sao o mesmo nulo.
insert into public.validation_documents
  (subject_id, purpose, kind, object_path, validation_started_at)
values (:TITULAR::uuid, 'identity_validation', 'selfie',
        'identity_validation/' || :TITULAR || '/estado-de-expurgo.jpg', now());

select pg_temp.reg(
  (select last_purge_attempt_at is null and last_purge_failure is null
     from public.validation_documents
    where object_path like '%estado-de-expurgo.jpg'),
  'G1. documento novo nasce sem tentativa e sem falha (nunca tentado)');

do $$
declare estado text;
begin
  update public.validation_documents
     set last_purge_attempt_at = now(), last_purge_failure = 'ARQUIVO_PERSISTE'
   where object_path like '%estado-de-expurgo.jpg';
  select case
           when purged_at is not null then 'concluido'
           when last_purge_attempt_at is not null then 'tentado_e_falhou'
           else 'nunca_tentado' end
    into estado
    from public.validation_documents where object_path like '%estado-de-expurgo.jpg';
  perform pg_temp.reg(estado = 'tentado_e_falhou',
    'G2. com a tentativa gravada o estado e distinguivel (' || estado || ')');
end $$;

-- Motivo fora da lista fechada e recusado. Texto livre aqui viraria mensagem
-- de fornecedor numa coluna que ninguem revisa.
do $$
begin
  begin
    update public.validation_documents
       set last_purge_failure = 'o storage devolveu 500 com a mensagem X'
     where object_path like '%estado-de-expurgo.jpg';
    perform pg_temp.reg(false, 'G3. motivo fora da lista fechada foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'G3. motivo fora da lista fechada recusado');
  end;
end $$;

-- Falha sem a hora da tentativa nao existe.
do $$
begin
  begin
    update public.validation_documents
       set last_purge_attempt_at = null, last_purge_failure = 'REMOCAO_FALHOU'
     where object_path like '%estado-de-expurgo.jpg';
    perform pg_temp.reg(false, 'G4. falha SEM hora de tentativa foi ACEITA');
  exception when others then
    perform pg_temp.reg(true, 'G4. falha sem hora de tentativa recusada');
  end;
end $$;

-- E expurgo concluido nao carrega falha pendurada. Foi este check que
-- apanhou a porta `marcarExpurgado` incompleta na homologacao integrada.
do $$
begin
  begin
    update public.validation_documents
       set purged_at = now()
     where object_path like '%estado-de-expurgo.jpg';
    perform pg_temp.reg(false, 'G5. concluido COM falha pendurada foi ACEITO');
  exception when others then
    perform pg_temp.reg(true, 'G5. concluido com falha pendurada recusado');
  end;
end $$;

-- Caso positivo: concluir limpando a falha e aceito.
do $$
declare estado text;
begin
  update public.validation_documents
     set purged_at = now(), last_purge_failure = null
   where object_path like '%estado-de-expurgo.jpg';
  select case when purged_at is not null then 'concluido' else 'outro' end
    into estado
    from public.validation_documents where object_path like '%estado-de-expurgo.jpg';
  perform pg_temp.reg(estado = 'concluido',
    'G6. concluir limpando a falha e aceito (' || estado || ')');
exception when others then
  perform pg_temp.reg(false, 'G6. concluir limpando a falha foi recusado: ' || left(sqlerrm, 40));
end $$;

-- ───────────────────────────────────────────────────────────────────────────
select '== RESULTADO';
select '  ' || linha from resultado order by ordem;
select '  TOTAL OK=' || (select count(*) from resultado where linha like 'OK%')
    || '  FALHOU=' || (select count(*) from resultado where linha like 'FALHOU%');

-- O veredito e do SQL, nao de quem le: qualquer FALHOU termina em codigo nao
-- zero por ON_ERROR_STOP=1.
do $$
declare n int;
begin
  select count(*) into n from resultado where linha like 'FALHOU%';
  if n > 0 then
    raise exception 'bateria de documentos de validacao REPROVOU: % assercao(oes) falharam', n;
  end if;
end $$;

select '== FIM DA BATERIA';

-- Nada fica atras: a bateria escreveu aceite, trilha, objeto, documento e prazo
-- para exercitar barreiras de verdade. Desfaz tudo.
rollback;
