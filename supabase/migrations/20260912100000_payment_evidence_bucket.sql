-- =============================================================================
-- MODULO 1 (1/6) : bucket privado payment-evidence  -  comprovantes de atestacao
-- =============================================================================
-- Toda confirmacao manual de aporte ou de liberacao (confirm_escrow_funding /
-- confirm_escrow_release) exige um comprovante anexado. Ate aqui nao existia
-- lugar para ele: contract-pdfs so aceita INSERT das partes e os buckets de
-- documentos cadastrais tem outra finalidade. Este bucket e exclusivo.
--
-- REGRAS IMPOSTAS PELO PROPRIO STORAGE-API (nivel de bucket, antes de gravar):
--   * privado (public = false): nenhum URL publico;
--   * file_size_limit = 10 MB;
--   * allowed_mime_types = application/pdf, image/jpeg, image/png.
--
-- REGRAS IMPOSTAS POR RLS EM storage.objects (papel authenticated):
--   * INSERT e SELECT somente para administrador SteelGo (has_role admin), e
--     somente em caminho no padrao
--       <contract_id>/<transaction_id>/<kind>-<UTC ms>-<random uuid>-<sha256_16>.<ext>
--   * NENHUMA policy de UPDATE nem de DELETE: o cliente nao sobrescreve
--     (upsert e UPDATE) nem apaga. A unicidade vem de (bucket_id, name) e do
--     uuid aleatorio no nome.
--
-- ARQUIVOS ORFAOS (enviados e nunca vinculados a uma transacao confirmada):
--   ficam RETIDOS para revisao administrativa e sao listados na tela de
--   operacao financeira. Uma policy de DELETE condicionada a "nao referenciado
--   por payment_transactions" foi analisada e RECUSADA: o storage-api avalia a
--   policy com o snapshot do proprio DELETE e nao enxerga uma confirmacao em
--   andamento que ja leu o objeto e vai referencia-lo - o resultado possivel
--   seria uma transacao confirmada apontando para objeto apagado. A limpeza,
--   quando existir, sera por servico com service_role, pela Storage API, apenas
--   para objetos com mais de 7 dias e sem referencia, e nunca por DELETE direto
--   em storage.objects.
--
-- SOBRE O QUE O BANCO CONSEGUE E NAO CONSEGUE VERIFICAR (ver 4/6):
--   o PostgreSQL nao le os bytes do objeto. O SHA-256 e calculado e declarado
--   pelo navegador do administrador; tamanho e MIME sao registrados pelo
--   Storage a partir do upload; o eTag e um identificador opaco do Storage.
--   Nada disso e verificacao bancaria nem criptografica independente.
-- =============================================================================

-- Sem ON CONFLICT: se o bucket ja existir com outra configuracao, a migration
-- FALHA e alguem decide, em vez de herdar limites desconhecidos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-evidence', 'payment-evidence', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png']);

create policy payment_evidence_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-evidence'
    and public.has_role((select auth.uid()), 'admin'::public.app_role)
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(funding|release)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$'
  );

create policy payment_evidence_select_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-evidence'
    and public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

-- Assertiva fail-closed: bucket com os limites esperados e exatamente as duas
-- policies acima, nenhuma de UPDATE ou DELETE para este bucket.
do $$
declare
  v_limit bigint;
  v_mimes text[];
  v_n     int;
begin
  select file_size_limit, allowed_mime_types into v_limit, v_mimes
    from storage.buckets where id = 'payment-evidence' and public = false;
  if v_limit is distinct from 10485760
     or v_mimes is distinct from array['application/pdf', 'image/jpeg', 'image/png'] then
    raise exception 'payment-evidence: bucket sem os limites esperados';
  end if;
  select count(*) into v_n from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'
     and p.polname in ('payment_evidence_insert_admin', 'payment_evidence_select_admin');
  if v_n <> 2 then
    raise exception 'payment-evidence: policies esperadas ausentes (%)', v_n;
  end if;
  select count(*) into v_n from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'
     and p.polcmd in ('w', 'd')
     and (pg_get_expr(p.polqual, p.polrelid) ilike '%payment-evidence%'
          or pg_get_expr(p.polwithcheck, p.polrelid) ilike '%payment-evidence%');
  if v_n <> 0 then
    raise exception 'payment-evidence: existe policy de UPDATE/DELETE para o bucket';
  end if;
end $$;
