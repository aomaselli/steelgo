-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Revisão documental: leitura auditada e eventos de revisão               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Duas funções definidoras e uma tabela. As três existem pelo mesmo motivo das
-- anteriores: `document_audit` está revogada do cliente e
-- `validation_documents` não tem policy de insert, de propósito -- e a
-- alternativa seria service role no caminho dos documentos, que anularia toda
-- a matriz de permissões.
--
-- ───────────────────────────────────────────────────────────────────────────
-- O QUE A REVISÃO PODE E O QUE ELA NÃO PODE
--
-- Pode: registrar observação, divergência ou pedido de novo envio.
--
-- Não pode: aprovar. Não existe tipo "aprovado" na lista fechada, e a ausência
-- é a decisão — não uma lacuna a ser preenchida depois. Aprovar identidade,
-- habilitação ou biometria por decisão manual substituiria a consulta à fonte
-- por opinião, que é exatamente o que o motor de regras recusa fazer.
--
-- A coluna `contexto` separa o que foi revisado contra DEMONSTRAÇÃO do que um
-- dia será revisado contra serviço real. Sem ela, revisões desta fase
-- passariam a parecer revisões de validação real no dia em que a real
-- existisse — e ninguém reabriria o histórico para distinguir.

create table if not exists public.document_review_events (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid        not null references public.validation_documents(id) on delete restrict,
  reviewer_id uuid        not null references auth.users(id),
  tipo        text        not null,
  contexto    text        not null,
  nota        text,
  created_at  timestamptz not null default now(),
  constraint document_review_tipo_valido
    check (tipo in ('observacao', 'divergencia', 'novo_envio_solicitado')),
  constraint document_review_contexto_valido
    check (contexto in ('demonstracao', 'real')),
  -- Nota curta. Campo de texto livre numa tabela de documentos é o lugar onde
  -- dado pessoal entra sem ninguém decidir; o limite não impede, mas tira o
  -- espaço para colar um despejo inteiro.
  constraint document_review_nota_curta check (nota is null or length(nota) <= 1000)
);

create index if not exists document_review_por_documento_idx
  on public.document_review_events (document_id, created_at desc);

comment on table public.document_review_events is
  'Revisao documental, append-only. Nao existe tipo "aprovado": revisao '
  'registra observacao, divergencia ou pedido de novo envio, e nunca '
  'substitui a consulta a fonte por decisao manual.';

create or replace function public.document_review_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'document_review_events e append-only: % recusado', tg_op;
end $$;

drop trigger if exists document_review_no_update on public.document_review_events;
create trigger document_review_no_update
  before update or delete on public.document_review_events
  for each row execute function public.document_review_block_mutation();

alter table public.document_review_events enable row level security;

-- O titular lê as revisões do PRÓPRIO documento: ele precisa saber que lhe
-- pediram novo envio. O revisor lê todas.
create policy document_review_own_read on public.document_review_events
  for select to authenticated using (
    exists (
      select 1 from public.validation_documents d
       where d.id = document_id and d.subject_id = (select auth.uid())
    )
  );

create policy document_review_admin_read on public.document_review_events
  for select to authenticated using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

-- Escrita só pela função definidora.
revoke insert, update, delete on public.document_review_events from anon, authenticated;

-- ─────────────── consentimento vigente, em um lugar só ─────────────────────
--
-- A mesma regra de `consentStatus` e da função de envio. Extraída para função
-- porque agora são três chamadores, e três cópias divergem.

create or replace function public.consentimento_vigente(p_subject uuid, p_purpose text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_versao text;
  v_sha    text;
  v_aceite record;
begin
  select t.version, t.body_sha256 into v_versao, v_sha
    from public.document_consent_texts t
   where t.purpose = p_purpose
   order by t.effective_from desc
   limit 1;
  if v_versao is null then return false; end if;

  select c.version, c.text_sha256, c.withdrawn_at into v_aceite
    from public.document_consents c
   where c.subject_id = p_subject and c.purpose = p_purpose
   order by c.accepted_at desc
   limit 1;

  if v_aceite is null or v_aceite.withdrawn_at is not null then return false; end if;
  return v_aceite.version = v_versao and v_aceite.text_sha256 = v_sha;
end $$;

revoke all on function public.consentimento_vigente(uuid, text) from public, anon;
grant execute on function public.consentimento_vigente(uuid, text) to authenticated;

-- ──────────────────── leitura auditada do documento ────────────────────────
--
-- Uma chamada = um evento de acesso. A autorização é conferida AQUI, a cada
-- leitura, e não uma vez por sessão: é a diferença entre decidir quem obtém
-- acesso e decidir quem continua tendo.

create or replace function public.registrar_acesso_a_documento(p_document_id uuid)
returns table (object_path text, kind text, subject_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator  uuid := (select auth.uid());
  v_doc   record;
  v_papel text;
begin
  if v_ator is null then
    raise exception 'leitura recusada: sem sessao' using errcode = 'DV020';
  end if;

  select d.id, d.subject_id, d.purpose, d.kind, d.object_path, d.purged_at
    into v_doc
    from public.validation_documents d
   where d.id = p_document_id;

  if v_doc is null then
    raise exception 'leitura recusada: documento inexistente' using errcode = 'DV021';
  end if;
  if v_doc.purged_at is not null then
    raise exception 'leitura recusada: documento expurgado' using errcode = 'DV021';
  end if;

  -- Titular ou revisor. Transportadora e embarcador caem aqui, e a ausência
  -- deles é a decisão: eles precisam do RESULTADO da validacao, nao do rosto
  -- e do documento do motorista.
  if v_doc.subject_id = v_ator then
    v_papel := 'driver';
  elsif public.has_role(v_ator, 'admin'::public.app_role) then
    v_papel := 'admin';
  else
    raise exception 'leitura recusada: papel sem acesso a esta finalidade'
      using errcode = 'DV022';
  end if;

  -- Consentimento vigente vale inclusive para o titular: sem ele o documento
  -- nao deveria ter sido coletado, e continuar servindo-o prolongaria a
  -- coleta sem base.
  if not public.consentimento_vigente(v_doc.subject_id, v_doc.purpose) then
    raise exception 'leitura recusada: consentimento nao vigente' using errcode = 'DV023';
  end if;

  insert into public.document_audit
    (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
  values
    ('access', v_doc.subject_id, v_ator, v_papel, v_doc.purpose, v_doc.kind, v_doc.object_path);

  return query select v_doc.object_path, v_doc.kind, v_doc.subject_id;
end $$;

comment on function public.registrar_acesso_a_documento(uuid) is
  'Autoriza e audita UMA leitura. A autorizacao e conferida a cada chamada, '
  'nao uma vez por sessao. Nao emite URL assinada: devolve o caminho para '
  'quem ja tem sessao de servidor, e os bytes nunca saem por credencial.';

revoke all on function public.registrar_acesso_a_documento(uuid) from public, anon;
grant execute on function public.registrar_acesso_a_documento(uuid) to authenticated;

-- ───────────────────────── registro da revisão ─────────────────────────────

create or replace function public.registrar_revisao_de_documento(
  p_document_id uuid,
  p_tipo        text,
  p_contexto    text,
  p_nota        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_doc  record;
  v_id   uuid;
begin
  if v_ator is null then
    raise exception 'revisao recusada: sem sessao' using errcode = 'DV020';
  end if;

  -- Só revisor. O titular lê as revisões do próprio documento, mas não as
  -- escreve: revisão é ato de quem confere, não de quem é conferido.
  if not public.has_role(v_ator, 'admin'::public.app_role) then
    raise exception 'revisao recusada: papel sem permissao' using errcode = 'DV022';
  end if;

  select d.id, d.purged_at into v_doc
    from public.validation_documents d where d.id = p_document_id;
  if v_doc is null or v_doc.purged_at is not null then
    raise exception 'revisao recusada: documento inexistente ou expurgado'
      using errcode = 'DV021';
  end if;

  if p_tipo not in ('observacao', 'divergencia', 'novo_envio_solicitado') then
    raise exception 'revisao recusada: tipo nao previsto' using errcode = 'DV024';
  end if;
  if p_contexto not in ('demonstracao', 'real') then
    raise exception 'revisao recusada: contexto nao previsto' using errcode = 'DV024';
  end if;

  -- A nota não carrega credencial nem identificador de pessoa. Mesma lista da
  -- barreira da trilha, porque a nota é lida por quem lê a trilha.
  if p_nota is not null and p_nota ~* '(https?://|[?&](token|signature|sig)=|eyJ[A-Za-z0-9_-]{8,}\.|\m\d{3}\.?\d{3}\.?\d{3}-?\d{2}\M)' then
    raise exception 'revisao recusada: a nota contem URL, credencial ou CPF'
      using errcode = 'DV025';
  end if;

  insert into public.document_review_events (document_id, reviewer_id, tipo, contexto, nota)
  values (p_document_id, v_ator, p_tipo, p_contexto, nullif(btrim(p_nota), ''))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.registrar_revisao_de_documento(uuid, text, text, text)
  from public, anon;
grant execute on function public.registrar_revisao_de_documento(uuid, text, text, text)
  to authenticated;

-- ──────────────────── fail-closed: pressupostos desta migration ────────────

do $$
begin
  if (select public from storage.buckets where id = 'validation-documents') then
    raise exception 'bucket validation-documents esta publico';
  end if;

  -- Sem sessão, as duas funções recusam.
  begin
    perform public.registrar_acesso_a_documento(gen_random_uuid());
    raise exception 'registrar_acesso_a_documento aceitou chamada sem sessao';
  exception when sqlstate 'DV020' then null;
  end;

  begin
    perform public.registrar_revisao_de_documento(
      gen_random_uuid(), 'observacao', 'demonstracao', null);
    raise exception 'registrar_revisao_de_documento aceitou chamada sem sessao';
  exception when sqlstate 'DV020' then null;
  end;

  -- E não existe tipo de revisão que aprove.
  if exists (
    select 1 from pg_constraint
     where conname = 'document_review_tipo_valido'
       and pg_get_constraintdef(oid) ilike '%aprov%'
  ) then
    raise exception 'a lista de tipos de revisao ganhou um tipo de aprovacao';
  end if;
end $$;
