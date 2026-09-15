-- =============================================================================
-- MODULO 1 (2/6) : fatos do Storage sobre o comprovante, gravados na transacao
-- =============================================================================
-- Ao lado de confirmation_evidence_ref (caminho) e confirmation_evidence_hash
-- (SHA-256 DECLARADO pelo navegador do administrador), a transacao passa a
-- guardar o que o Storage registrou sobre o objeto no momento da atestacao.
--
-- CLASSIFICACAO HONESTA DE CADA CAMPO:
--   confirmation_evidence_hash        SHA-256 calculado e declarado pelo
--                                     navegador do administrador. A RPC apenas
--                                     confere que o mesmo valor foi declarado
--                                     no upload (user_metadata) e na chamada.
--                                     E atestacao humana.
--   confirmation_evidence_size_bytes  tamanho observado pelo Storage ao receber
--                                     os bytes; limite de 10 MB imposto pelo
--                                     bucket.
--   confirmation_evidence_etag        identificador opaco gerado pelo backend do
--                                     Storage. NAO e tratado como MD5 nem como
--                                     hash garantido; serve de referencia para
--                                     auditoria futura.
--   confirmation_evidence_mime        tipo registrado pelo Storage, derivado do
--                                     upload. O bucket restringe os tipos
--                                     declarados; isso NAO substitui inspecao
--                                     dos bytes e NAO e assinatura criptografica.
-- Nenhum desses campos e verificacao bancaria nem criptografica independente.
--
-- Colunas ADITIVAS e anulaveis. payment_transactions tem 0 linhas no local e
-- no remoto (verificado em 2026-09-11), logo o CHECK abaixo nao encontra
-- nenhuma linha manual_admin sem os fatos.
-- =============================================================================

alter table public.payment_transactions
  add column confirmation_evidence_size_bytes bigint null,
  add column confirmation_evidence_etag       text   null,
  add column confirmation_evidence_mime       text   null;

comment on column public.payment_transactions.confirmation_evidence_hash is
  'SHA-256 calculado e declarado pelo navegador do administrador que atestou. '
  'A RPC confere apenas a coerencia com user_metadata.sha256 do objeto. '
  'Atestacao humana; nao e verificacao bancaria nem criptografica independente.';
comment on column public.payment_transactions.confirmation_evidence_size_bytes is
  'Tamanho em bytes observado pelo Storage ao receber o comprovante.';
comment on column public.payment_transactions.confirmation_evidence_etag is
  'Identificador opaco gerado pelo backend do Storage para o objeto. '
  'Nao e tratado como MD5 nem como hash garantido.';
comment on column public.payment_transactions.confirmation_evidence_mime is
  'Tipo MIME registrado pelo Storage, derivado do upload. Nao e assinatura '
  'criptografica e nao substitui inspecao dos bytes.';

-- Atestacao manual sem os tres fatos nao e registrada; fora da atestacao manual
-- os fatos nao existem.
alter table public.payment_transactions
  add constraint payment_transactions_manual_evidence_facts
  check (
    case when confirmation_method = 'manual_admin'
         then confirmation_evidence_size_bytes is not null
              and confirmation_evidence_size_bytes between 1 and 10485760
              and confirmation_evidence_etag is not null
              and length(btrim(confirmation_evidence_etag)) > 0
              and confirmation_evidence_mime in ('application/pdf', 'image/jpeg', 'image/png')
         else confirmation_evidence_size_bytes is null
              and confirmation_evidence_etag is null
              and confirmation_evidence_mime is null
    end
  );

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'payment_transactions'
         and column_name in ('confirmation_evidence_size_bytes',
                             'confirmation_evidence_etag',
                             'confirmation_evidence_mime')) <> 3 then
    raise exception 'payment_transactions: colunas de fatos do comprovante ausentes';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'payment_transactions_manual_evidence_facts') then
    raise exception 'payment_transactions: CHECK manual_evidence_facts ausente';
  end if;
end $$;
