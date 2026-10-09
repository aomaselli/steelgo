-- =============================================================================
-- Etapa 1 — documentos de validação: bucket privado, consentimento, trilha,
-- retenção
-- =============================================================================
--
-- ATENÇÃO: esta migration AINDA NÃO FOI EXERCITADA contra banco nenhum. O
-- destino descartável `simulacao` está sem porta publicada e o validador recusa,
-- corretamente, na barreira 4. A bateria
-- `supabase/tests/validation_documents_matriz.sql` existe para exercitá-la, e
-- esta migration não deve ser aplicada em lugar nenhum antes de a bateria passar.
--
-- POR QUE NÃO HERDA AS PERMISSÕES DO COMPROVANTE DE VIAGEM
--
-- `trip-media` libera as PARTES da viagem — motorista, transportadora e
-- embarcador. É certo para foto de carga e assinatura: são prova de um negócio
-- entre eles.
--
-- CNH e selfie não são prova de negócio. São documento de identidade e
-- biometria, coletados para UMA finalidade. A transportadora precisa do
-- RESULTADO da validação, não do rosto e do documento do motorista. Por isso o
-- acesso aqui é só do titular e do revisor administrativo, e `carrier` e
-- `shipper` ficam de fora — ausência deliberada, não esquecimento a corrigir
-- depois copiando de `trip-media`.
--
-- A referência da matriz é `src/server/documents/access.ts`, que tem a mesma
-- decisão em função pura e testada. As duas precisam concordar.
-- =============================================================================

-- ─────────────────────────────── bucket ────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'validation-documents',
  'validation-documents',
  false,                      -- privado. Nunca público, em hipótese alguma.
  5242880,                    -- 5 MB: documento e selfie não precisam de mais
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- ──────────────────────── texto de consentimento ───────────────────────────

create table if not exists public.document_consent_texts (
  id             uuid primary key default gen_random_uuid(),
  purpose        text        not null,
  version        text        not null,
  body_md        text        not null,
  body_sha256    text        not null,
  effective_from timestamptz not null default now(),
  published_by   uuid        not null references auth.users(id),
  published_at   timestamptz not null default now(),
  constraint document_consent_texts_purpose_valid
    check (purpose in ('identity_validation')),
  constraint document_consent_texts_unico unique (purpose, version)
);

comment on table public.document_consent_texts is
  'Texto de consentimento publicado, por finalidade e versao. O corpo e o '
  'sha256 ficam juntos: versao igual com corpo diferente nao vale como o '
  'mesmo aceite.';

-- ───────────────────────── aceite do titular ───────────────────────────────

create table if not exists public.document_consents (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid        not null references auth.users(id) on delete restrict,
  purpose      text        not null,
  version      text        not null,
  text_sha256  text        not null,
  accepted_at  timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint document_consents_purpose_valid
    check (purpose in ('identity_validation'))
);

create index if not exists document_consents_subject_idx
  on public.document_consents (subject_id, purpose, accepted_at desc);

comment on table public.document_consents is
  'Aceite de UMA finalidade, com versao, sha256 do corpo e data. Consentir em '
  'validar identidade nao e consentir em outro uso do mesmo arquivo.';

-- ───────────────────── registro dos documentos ─────────────────────────────

create table if not exists public.validation_documents (
  id                    uuid primary key default gen_random_uuid(),
  subject_id            uuid        not null references auth.users(id) on delete restrict,
  purpose               text        not null,
  kind                  text        not null,
  object_path           text        not null unique,
  uploaded_at           timestamptz not null default now(),
  validation_started_at timestamptz,
  purged_at             timestamptz,
  constraint validation_documents_purpose_valid check (purpose in ('identity_validation')),
  constraint validation_documents_kind_valid   check (kind in ('cnh_front', 'cnh_back', 'selfie'))
);

create index if not exists validation_documents_expurgo_idx
  on public.validation_documents (purged_at, validation_started_at, uploaded_at);

-- ──────────────────────────── trilha ───────────────────────────────────────

create table if not exists public.document_audit (
  id           uuid primary key default gen_random_uuid(),
  action       text        not null,
  subject_id   uuid        not null,
  actor_id     uuid        not null,
  actor_role   text        not null,
  purpose      text        not null,
  kind         text        not null,
  object_path  text        not null,
  reason_code  text,
  occurred_at  timestamptz not null default now(),
  constraint document_audit_action_valid
    check (action in ('upload', 'access', 'delete', 'validation_started', 'purge'))
);

comment on table public.document_audit is
  'Append-only. Uma linha por evento concluido. NUNCA guarda documento, '
  'imagem, biometria, URL assinada, token nem CPF -- e por nao guardar que ela '
  'pode sobreviver ao documento.';

create or replace function public.document_audit_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'document_audit e append-only: % recusado', tg_op;
end $$;

drop trigger if exists document_audit_no_update on public.document_audit;
create trigger document_audit_no_update
  before update or delete on public.document_audit
  for each row execute function public.document_audit_block_mutation();

-- ───────────────────────── retenção, sem prazo inventado ───────────────────

create table if not exists public.document_retention_policy (
  id                      boolean primary key default true,
  biometric_days          integer,
  document_image_days     integer,
  abandoned_upload_hours  integer,
  approved_by             uuid references auth.users(id),
  approved_at             timestamptz,
  updated_at              timestamptz not null default now(),
  constraint document_retention_policy_unica check (id),
  -- Prazo so existe com aprovacao registrada. Numero sem aprovador e numero
  -- inventado.
  constraint document_retention_policy_aprovada check (
    (biometric_days is null and document_image_days is null
       and abandoned_upload_hours is null)
    or (approved_by is not null and approved_at is not null)
  )
);

-- Linha unica, VAZIA: o estado honesto enquanto o juridico nao aprovar.
insert into public.document_retention_policy (id) values (true)
on conflict (id) do nothing;

comment on table public.document_retention_policy is
  'Prazos de retencao. NULL = nao aprovado, e o expurgo RECUSA rodar. Um '
  'padrao plausivel viraria o prazo de fato sem ninguem ter decidido.';

-- ───────────────────────────── RLS ─────────────────────────────────────────

alter table public.document_consent_texts     enable row level security;
alter table public.document_consents          enable row level security;
alter table public.validation_documents       enable row level security;
alter table public.document_audit             enable row level security;
alter table public.document_retention_policy  enable row level security;

-- Texto publicado e legivel por quem precisa aceitar.
create policy document_consent_texts_read on public.document_consent_texts
  for select to authenticated using (true);

-- O titular le e grava o proprio aceite. Ninguem aceita pelo outro.
create policy document_consents_own_read on public.document_consents
  for select to authenticated using (subject_id = (select auth.uid()));
create policy document_consents_own_write on public.document_consents
  for insert to authenticated with check (subject_id = (select auth.uid()));

-- Registro do documento: titular ve o seu; admin ve para revisar.
create policy validation_documents_own on public.validation_documents
  for select to authenticated using (subject_id = (select auth.uid()));
create policy validation_documents_admin on public.validation_documents
  for select to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- A trilha nao se le pelo cliente: sai por RPC, ja filtrada.
revoke all on public.document_audit from anon, authenticated;

-- ───────────────────── policies do bucket privado ──────────────────────────
--
-- O caminho carrega finalidade e titular:
--     <purpose>/<subject_id>/<kind>-<id>.<ext>
-- A policy confere o SEGUNDO segmento contra auth.uid(), de modo que o caminho
-- nao e apenas convencao: e o que a barreira usa.

create policy validation_docs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'validation-documents'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy validation_docs_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'validation-documents'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy validation_docs_select_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'validation-documents'
    and public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

create policy validation_docs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'validation-documents'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ─────────────────── fail-closed: o que nao pode ter mudado ────────────────

do $$
begin
  if (select public from storage.buckets where id = 'validation-documents') then
    raise exception 'validation-documents ficou PUBLICO; documento de identidade nao pode ser publico';
  end if;

  if has_table_privilege('anon', 'public.document_audit', 'select')
     or has_table_privilege('authenticated', 'public.document_audit', 'select') then
    raise exception 'document_audit ficou legivel direto pelo cliente';
  end if;

  -- Nenhum prazo nasce preenchido.
  if exists (
    select 1 from public.document_retention_policy
     where biometric_days is not null
        or document_image_days is not null
        or abandoned_upload_hours is not null
  ) then
    raise exception 'politica de retencao nasceu com prazo preenchido; nenhum valor pode ser inventado';
  end if;
end $$;
