-- =============================================================================
-- Bateria: matriz de permissões dos documentos de validação
-- =============================================================================
-- AINDA NÃO EXECUTADA. O destino descartável `simulacao` está sem porta
-- publicada e o validador recusa na barreira 4. Esta bateria existe para
-- exercitar `20261009090000_validation_documents.sql` assim que o destino
-- voltar — a migration não deve ser aplicada em lugar nenhum antes disso.
--
-- Confere que as policies do banco concordam com `src/server/documents/access.ts`,
-- que é a referência da matriz e já está testada em função pura.
--
-- Só dados sintéticos. Nenhum documento real, nenhum byte de imagem: os testes
-- usam caminhos de objeto, não arquivos.
--
-- USO
--   bash scripts/banco/destino-autorizado.sh simulacao \
--        --sql-arquivo supabase/tests/validation_documents_matriz.sql \
--        --permitir-parada-desligada
-- =============================================================================
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

create temporary table resultado (ordem serial, linha text);

-- Atores sintéticos já existentes na instância.
\set TITULAR    '''efa78aef-cfae-4263-a6fc-3a802e65cdbd'''
\set OUTRO      '''3b017ae9-b74a-4c1a-87d7-e796ad2a7feb'''
\set TRANSPORTA '''bea14780-db1e-4dc0-9847-693f8076ba14'''
\set ADMIN      '''5340d6e8-fadb-479d-8421-dc29ca44c606'''

create temporary table atores (papel text, sujeito uuid, espera text);
insert into atores values
  ('titular',        :TITULAR,    'permite'),
  ('outro motorista', :OUTRO,     'recusa'),
  ('transportadora', :TRANSPORTA, 'recusa'),
  ('admin',          :ADMIN,      'permite');

create or replace function pg_temp.tentar_leitura(p_sujeito uuid, p_caminho text)
returns text language plpgsql as $f$
declare v int;
begin
  perform set_config('request.jwt.claim.sub', p_sujeito::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sujeito, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from storage.objects
   where bucket_id = 'validation-documents' and name = p_caminho;
  reset role;
  return case when v > 0 then 'permite' else 'recusa' end;
exception when others then
  reset role;
  return 'recusa';
end $f$;

select '== A. O BUCKET É PRIVADO';
insert into resultado (linha)
select case when (select public from storage.buckets where id='validation-documents')
            then 'FALHOU | validation-documents esta PUBLICO'
            else 'OK     | validation-documents e privado' end;

insert into resultado (linha)
select case when (select file_size_limit from storage.buckets where id='validation-documents') > 5242880
            then 'FALHOU | limite de tamanho acima do previsto'
            else 'OK     | limite de tamanho dentro do previsto' end;

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
  select 'identity_validation/' || (select sujeito from atores where papel='titular')::text
         || '/selfie-sintetica.jpg' into caminho;
  for a in select * from atores loop
    obtido := pg_temp.tentar_leitura(a.sujeito, caminho);
    insert into resultado (linha) values (
      case when obtido = a.espera then 'OK     | ' else 'FALHOU | ' end
      || rpad(a.papel, 16) || ' -> ' || obtido || '  (esperado ' || a.espera || ')');
  end loop;
end $$;

select '== C. A TRILHA NAO E LEGIVEL PELO CLIENTE';
insert into resultado (linha)
select case when has_table_privilege('authenticated','public.document_audit','select')
          or has_table_privilege('anon','public.document_audit','select')
            then 'FALHOU | document_audit legivel direto pelo cliente'
            else 'OK     | document_audit fora do alcance do cliente' end;

select '== D. A TRILHA E APPEND-ONLY';
do $$
declare v text;
begin
  begin
    update public.document_audit set reason_code = 'x' where true;
    v := 'FALHOU | UPDATE na trilha foi aceito';
  exception when others then
    v := 'OK     | UPDATE na trilha recusado: ' || left(sqlerrm, 40);
  end;
  insert into resultado (linha) values (v);
end $$;

select '== E. RETENCAO NASCE SEM PRAZO';
insert into resultado (linha)
select case when exists (select 1 from public.document_retention_policy
                          where biometric_days is not null
                             or document_image_days is not null
                             or abandoned_upload_hours is not null)
            then 'FALHOU | politica nasceu com prazo preenchido'
            else 'OK     | nenhum prazo inventado' end;

insert into resultado (linha)
select case when (select count(*) from public.document_retention_policy) <> 1
            then 'FALHOU | politica deveria ter exatamente uma linha'
            else 'OK     | politica unica' end;

select '== F. PRAZO SEM APROVADOR E RECUSADO';
do $$
declare v text;
begin
  begin
    update public.document_retention_policy set biometric_days = 30 where id;
    v := 'FALHOU | prazo aceito sem aprovador registrado';
    rollback;
  exception when others then
    v := 'OK     | prazo sem aprovador recusado: ' || left(sqlerrm, 40);
  end;
  insert into resultado (linha) values (v);
end $$;

-- limpeza do objeto sintético
delete from storage.objects
 where bucket_id='validation-documents' and name like '%selfie-sintetica.jpg';

select '== RESULTADO';
select '  ' || linha from resultado order by ordem;
select '  TOTAL OK=' || (select count(*) from resultado where linha like 'OK%')
    || '  FALHOU=' || (select count(*) from resultado where linha like 'FALHOU%');
select '== FIM DA BATERIA';
