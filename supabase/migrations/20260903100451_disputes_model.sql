-- =============================================================================
-- REV8.1 6/13 : MODULO DE DISPUTAS
-- =============================================================================
-- O QUE EXISTIA ANTES, apurado por leitura do codigo:
--   * nao havia tabela de disputas - a tela consultava contracts com
--     status = 'disputed';
--   * nenhum ponto do codigo escrevia status = 'disputed': o fluxo nao tinha
--     porta de entrada e a aba "Abertas" era sempre vazia;
--   * o campo `reason`, exigido com 20 caracteres, nunca era persistido;
--   * o campo `split`, com slider proprio, era coletado e nunca usado;
--   * as decisoes A e C gravavam exatamente o mesmo resultado;
--   * as alegacoes das partes exibidas no card eram texto fixo no codigo.
--
-- Esta migration cria o modelo estrutural inteiro, de forma ADITIVA. Nada do
-- que existia e alterado ou removido.
--
-- INVARIANTES ESTRUTURAIS, nao apenas procedimentais:
--   * evidencia e append-only e imutavel - quem apresentou nao reescreve nem
--     apaga, e a outra parte tampouco;
--   * decisao e append-only - correcao se faz por NOVA decisao que cita a
--     anterior, nunca por sobrescrita;
--   * a soma das alocacoes de uma decisao fecha EXATAMENTE o valor decidido,
--     verificado por constraint trigger diferida;
--   * uma unica decisao vigente por caso, por indice unico parcial;
--   * motivo e fundamentacao sao obrigatorios e nao podem ser em branco.
-- =============================================================================

begin;

create type public.dispute_status as enum (
  'open', 'under_review', 'awaiting_evidence', 'decided', 'closed', 'withdrawn'
);

create type public.dispute_party_role as enum (
  'claimant', 'respondent', 'driver', 'admin_reviewer'
);

create type public.dispute_reason_code as enum (
  'cargo_damage', 'delivery_delay', 'quantity_mismatch',
  'documentation_issue', 'payment_amount', 'service_not_rendered',
  'route_deviation', 'other'
);

create type public.dispute_decision_outcome as enum (
  'release_to_carrier', 'refund_to_shipper', 'split', 'dismissed'
);

create type public.dispute_priority as enum ('low', 'normal', 'high', 'critical');

-- -----------------------------------------------------------------------------
-- CASO
-- -----------------------------------------------------------------------------
create table public.dispute_cases (
  id                 uuid        primary key default gen_random_uuid(),
  case_number        text        not null,
  contract_id        uuid        not null,
  freight_id         uuid        not null,
  payment_intent_id  uuid        null,

  opened_by          uuid        not null,
  opened_by_role     public.dispute_party_role not null,
  opened_at          timestamptz not null default now(),

  reason_code        public.dispute_reason_code not null,
  description        text        not null,
  disputed_amount    numeric(16,2) not null,
  currency_code      text        not null,

  status             public.dispute_status not null default 'open',
  priority           public.dispute_priority not null default 'normal',
  due_at             timestamptz null,
  assigned_to        uuid        null,
  assigned_at        timestamptz null,

  closed_at          timestamptz null,
  closed_by          uuid        null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint dispute_cases_case_number_unique unique (case_number),
  constraint dispute_cases_description_not_blank
    check (length(btrim(description)) >= 20),
  constraint dispute_cases_amount_positive check (disputed_amount > 0),
  constraint dispute_cases_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint dispute_cases_assigned_coherent
    check ((assigned_at is null) = (assigned_to is null)),
  constraint dispute_cases_closed_coherent
    check ((closed_at is null) = (closed_by is null)),
  constraint dispute_cases_closed_status
    check (closed_at is null or status in ('closed', 'withdrawn')),
  -- Quem abre e parte ou motorista. Administrador NAO fabrica alegacao em nome
  -- de ninguem - a restricao esta aqui, no schema, alem de estar na RPC.
  constraint dispute_cases_opener_is_party
    check (opened_by_role in ('claimant', 'driver'))
);

alter table public.dispute_cases
  add constraint dispute_cases_contract_fk
  foreign key (contract_id) references public.contracts(id) on delete restrict;
alter table public.dispute_cases
  add constraint dispute_cases_freight_fk
  foreign key (freight_id) references public.freights(id) on delete restrict;
alter table public.dispute_cases
  add constraint dispute_cases_intent_fk
  foreign key (payment_intent_id) references public.payment_intents(id) on delete restrict;
alter table public.dispute_cases
  add constraint dispute_cases_opened_by_fk
  foreign key (opened_by) references auth.users(id) on delete restrict;
alter table public.dispute_cases
  add constraint dispute_cases_assigned_to_fk
  foreign key (assigned_to) references auth.users(id) on delete restrict;
alter table public.dispute_cases
  add constraint dispute_cases_closed_by_fk
  foreign key (closed_by) references auth.users(id) on delete restrict;

-- UM caso aberto por contrato de cada vez. Dois casos vivos sobre o mesmo
-- contrato tornariam ambigua a suspensao da liberacao.
create unique index dispute_cases_one_open_per_contract
  on public.dispute_cases (contract_id)
  where status in ('open', 'under_review', 'awaiting_evidence', 'decided');

create index dispute_cases_status_idx on public.dispute_cases (status, opened_at desc);
create index dispute_cases_assigned_idx on public.dispute_cases (assigned_to, status);
create index dispute_cases_contract_idx on public.dispute_cases (contract_id);

-- Agora que dispute_cases existe, o evento do contrato pode cita-la.
alter table public.contract_lifecycle_events
  add constraint contract_lifecycle_events_dispute_fk
  foreign key (dispute_case_id) references public.dispute_cases(id) on delete restrict;

-- -----------------------------------------------------------------------------
-- PARTES DO CASO
-- -----------------------------------------------------------------------------
create table public.dispute_parties (
  id           uuid        primary key default gen_random_uuid(),
  case_id      uuid        not null,
  user_id      uuid        not null,
  company_id   uuid        null,
  role         public.dispute_party_role not null,
  added_at     timestamptz not null default now(),
  added_by     uuid        not null,

  constraint dispute_parties_unique unique (case_id, user_id, role)
);

alter table public.dispute_parties
  add constraint dispute_parties_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_parties
  add constraint dispute_parties_user_fk
  foreign key (user_id) references auth.users(id) on delete restrict;
alter table public.dispute_parties
  add constraint dispute_parties_company_fk
  foreign key (company_id) references public.companies(id) on delete restrict;
alter table public.dispute_parties
  add constraint dispute_parties_added_by_fk
  foreign key (added_by) references auth.users(id) on delete restrict;

create index dispute_parties_case_idx on public.dispute_parties (case_id);
create index dispute_parties_user_idx on public.dispute_parties (user_id);

-- -----------------------------------------------------------------------------
-- ALEGACOES
-- -----------------------------------------------------------------------------
create table public.dispute_claims (
  id             uuid        primary key default gen_random_uuid(),
  case_id        uuid        not null,
  claimed_by     uuid        not null,
  claimed_by_role public.dispute_party_role not null,
  reason_code    public.dispute_reason_code not null,
  statement      text        not null,
  claimed_amount numeric(16,2) null,
  currency_code  text        null,
  created_at     timestamptz not null default now(),

  constraint dispute_claims_statement_not_blank
    check (length(btrim(statement)) >= 20),
  constraint dispute_claims_amount_positive
    check (claimed_amount is null or claimed_amount > 0),
  constraint dispute_claims_currency_coherent
    check ((claimed_amount is null) = (currency_code is null)),
  -- ADMINISTRADOR NAO FABRICA ALEGACAO EM NOME DA PARTE.
  constraint dispute_claims_author_is_party
    check (claimed_by_role in ('claimant', 'respondent', 'driver'))
);

alter table public.dispute_claims
  add constraint dispute_claims_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_claims
  add constraint dispute_claims_author_fk
  foreign key (claimed_by) references auth.users(id) on delete restrict;

create index dispute_claims_case_idx on public.dispute_claims (case_id, created_at);

create trigger dispute_claims_block_update
  before update on public.dispute_claims
  for each row execute function public.publication_block_mutation();
create trigger dispute_claims_block_delete
  before delete on public.dispute_claims
  for each row execute function public.publication_block_mutation();

-- -----------------------------------------------------------------------------
-- EVIDENCIAS  -  imutaveis por construcao
-- -----------------------------------------------------------------------------
create table public.dispute_evidence (
  id             uuid        primary key default gen_random_uuid(),
  case_id        uuid        not null,
  claim_id       uuid        null,
  submitted_by   uuid        not null,
  submitted_by_role public.dispute_party_role not null,
  kind           text        not null,
  description    text        not null,
  artifact_ref   text        null,
  content_hash   text        not null,
  submitted_at   timestamptz not null default now(),

  constraint dispute_evidence_kind_valid
    check (kind in ('photo', 'document', 'checkpoint', 'message', 'invoice', 'other')),
  constraint dispute_evidence_description_not_blank
    check (length(btrim(description)) > 0),
  constraint dispute_evidence_hash_format
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint dispute_evidence_ref_not_blank
    check (artifact_ref is null or length(btrim(artifact_ref)) > 0),
  -- A MESMA evidencia nao e apresentada duas vezes no mesmo caso.
  constraint dispute_evidence_unique_per_case unique (case_id, content_hash)
);

alter table public.dispute_evidence
  add constraint dispute_evidence_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_evidence
  add constraint dispute_evidence_claim_fk
  foreign key (claim_id) references public.dispute_claims(id) on delete restrict;
alter table public.dispute_evidence
  add constraint dispute_evidence_submitter_fk
  foreign key (submitted_by) references auth.users(id) on delete restrict;

create index dispute_evidence_case_idx on public.dispute_evidence (case_id, submitted_at);

-- NENHUMA PARTE ALTERA OU APAGA EVIDENCIA JA APRESENTADA. Nem a parte que a
-- apresentou, nem a outra, nem o administrador. Evidencia contestada se
-- responde com nova evidencia e com fundamentacao na decisao.
create trigger dispute_evidence_block_update
  before update on public.dispute_evidence
  for each row execute function public.publication_block_mutation();
create trigger dispute_evidence_block_delete
  before delete on public.dispute_evidence
  for each row execute function public.publication_block_mutation();

comment on table public.dispute_evidence is
  'Evidencias apresentadas no caso. APPEND-ONLY e imutaveis: content_hash '
  'identifica o artefato e o par (case_id, content_hash) impede reapresentacao. '
  'artifact_ref e referencia de Storage, nunca o conteudo.';

-- -----------------------------------------------------------------------------
-- DECISOES  -  append-only, correcao por nova decisao
-- -----------------------------------------------------------------------------
create table public.dispute_decisions (
  id                    uuid        primary key default gen_random_uuid(),
  case_id               uuid        not null,
  supersedes_decision_id uuid       null,
  outcome               public.dispute_decision_outcome not null,
  decided_amount        numeric(16,2) not null,
  currency_code         text        not null,
  rationale             text        not null,
  decided_by            uuid        not null,
  decided_at            timestamptz not null default now(),
  is_current            boolean     not null default true,

  constraint dispute_decisions_rationale_not_blank
    check (length(btrim(rationale)) >= 20),
  constraint dispute_decisions_amount_non_negative check (decided_amount >= 0),
  constraint dispute_decisions_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint dispute_decisions_not_self_superseding
    check (supersedes_decision_id is null or supersedes_decision_id <> id),
  -- 'dismissed' nao distribui valor; os demais desfechos distribuem.
  constraint dispute_decisions_dismissed_has_no_amount
    check ((outcome = 'dismissed') = (decided_amount = 0))
);

alter table public.dispute_decisions
  add constraint dispute_decisions_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_decisions
  add constraint dispute_decisions_supersedes_fk
  foreign key (supersedes_decision_id) references public.dispute_decisions(id) on delete restrict;
alter table public.dispute_decisions
  add constraint dispute_decisions_decided_by_fk
  foreign key (decided_by) references auth.users(id) on delete restrict;

-- UMA decisao vigente por caso. As anteriores continuam existindo, marcadas
-- como nao vigentes - a correcao nao apaga o que foi decidido antes.
create unique index dispute_decisions_one_current_per_case
  on public.dispute_decisions (case_id) where is_current;
create unique index dispute_decisions_single_successor
  on public.dispute_decisions (supersedes_decision_id)
  where supersedes_decision_id is not null;

create index dispute_decisions_case_idx on public.dispute_decisions (case_id, decided_at desc);

-- Append-only com UMA excecao estreita: marcar uma decisao anterior como nao
-- vigente. O conteudo da decisao nunca muda.
create function public.dispute_decisions_enforce_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'public.dispute_decisions e append-only: decisao nao e apagada.';
  end if;
  if NEW.case_id                is distinct from OLD.case_id
     or NEW.outcome             is distinct from OLD.outcome
     or NEW.decided_amount      is distinct from OLD.decided_amount
     or NEW.currency_code       is distinct from OLD.currency_code
     or NEW.rationale           is distinct from OLD.rationale
     or NEW.decided_by          is distinct from OLD.decided_by
     or NEW.decided_at          is distinct from OLD.decided_at
     or NEW.supersedes_decision_id is distinct from OLD.supersedes_decision_id
  then
    raise exception using errcode = '42501',
      message = 'public.dispute_decisions: o conteudo da decisao e imutavel. '
                'Correcao se faz por NOVA decisao que cita a anterior.';
  end if;
  if OLD.is_current = false and NEW.is_current = true then
    raise exception using errcode = '42501',
      message = 'public.dispute_decisions: decisao superada nao volta a vigorar.';
  end if;
  return NEW;
end;
$fn$;

create trigger dispute_decisions_enforce_append_only_trg
  before update or delete on public.dispute_decisions
  for each row execute function public.dispute_decisions_enforce_append_only();

-- -----------------------------------------------------------------------------
-- ALOCACOES DA DECISAO  -  a soma fecha exatamente
-- -----------------------------------------------------------------------------
create table public.dispute_allocations (
  id           uuid        primary key default gen_random_uuid(),
  decision_id  uuid        not null,
  party_kind   public.payment_party_kind not null,
  company_id   uuid        null,
  amount       numeric(16,2) not null,
  percentage   numeric(8,4) null,
  note         text        null,
  created_at   timestamptz not null default now(),

  constraint dispute_allocations_amount_non_negative check (amount >= 0),
  constraint dispute_allocations_percentage_range
    check (percentage is null or (percentage >= 0 and percentage <= 100)),
  constraint dispute_allocations_company_coherent
    check ((party_kind = 'platform') = (company_id is null)),
  constraint dispute_allocations_one_per_party unique (decision_id, party_kind)
);

alter table public.dispute_allocations
  add constraint dispute_allocations_decision_fk
  foreign key (decision_id) references public.dispute_decisions(id) on delete restrict;
alter table public.dispute_allocations
  add constraint dispute_allocations_company_fk
  foreign key (company_id) references public.companies(id) on delete restrict;

create index dispute_allocations_decision_idx on public.dispute_allocations (decision_id);

create trigger dispute_allocations_block_update
  before update on public.dispute_allocations
  for each row execute function public.publication_block_mutation();
create trigger dispute_allocations_block_delete
  before delete on public.dispute_allocations
  for each row execute function public.publication_block_mutation();

-- A SOMA DAS ALOCACOES FECHA EXATAMENTE O VALOR DECIDIDO. Constraint trigger
-- DIFERIDA: verificada no COMMIT, quando decisao e alocacoes ja existem. Cobre
-- tambem decisao SEM alocacao nenhuma, porque sum(vazio) e 0.
create function public.dispute_allocations_must_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_decision uuid;
  v_amount   numeric;
  v_sum      numeric;
begin
  -- IF/ELSE e nao CASE: numa expressao CASE o plpgsql resolve TODAS as arms, e
  -- NEW.decision_id nao existe quando o gatilho roda sobre a outra tabela - o
  -- resultado seria 42703 em vez da verificacao.
  if TG_TABLE_NAME = 'dispute_allocations' then
    v_decision := coalesce(NEW.decision_id, OLD.decision_id);
  else
    v_decision := coalesce(NEW.id, OLD.id);
  end if;

  select d.decided_amount into v_amount
    from public.dispute_decisions d where d.id = v_decision;
  if not found then
    return null;
  end if;

  select coalesce(sum(a.amount), 0) into v_sum
    from public.dispute_allocations a where a.decision_id = v_decision;

  if v_sum <> v_amount then
    raise exception using errcode = '23514',
      message = format('public.dispute_allocations: a soma das alocacoes (%s) nao '
                       'fecha o valor decidido (%s) no caso da decisao %s. '
                       'A divisao tem de fechar exatamente.',
                       v_sum, v_amount, v_decision);
  end if;
  return null;
end;
$fn$;

create constraint trigger dispute_allocations_must_close_trg
  after insert or update or delete on public.dispute_allocations
  deferrable initially deferred
  for each row execute function public.dispute_allocations_must_close();

create constraint trigger dispute_decisions_must_be_allocated_trg
  after insert on public.dispute_decisions
  deferrable initially deferred
  for each row execute function public.dispute_allocations_must_close();

-- -----------------------------------------------------------------------------
-- COMENTARIOS
-- -----------------------------------------------------------------------------
create table public.dispute_comments (
  id          uuid        primary key default gen_random_uuid(),
  case_id     uuid        not null,
  author_id   uuid        not null,
  author_role public.dispute_party_role not null,
  body        text        not null,
  visibility  text        not null default 'all_parties',
  created_at  timestamptz not null default now(),

  constraint dispute_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint dispute_comments_visibility_valid
    check (visibility in ('all_parties', 'internal_admin'))
);

alter table public.dispute_comments
  add constraint dispute_comments_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_comments
  add constraint dispute_comments_author_fk
  foreign key (author_id) references auth.users(id) on delete restrict;

create index dispute_comments_case_idx on public.dispute_comments (case_id, created_at);

create trigger dispute_comments_block_update
  before update on public.dispute_comments
  for each row execute function public.publication_block_mutation();
create trigger dispute_comments_block_delete
  before delete on public.dispute_comments
  for each row execute function public.publication_block_mutation();

-- -----------------------------------------------------------------------------
-- EVENTOS DO CASO  -  historico de status e tudo mais
-- -----------------------------------------------------------------------------
create table public.dispute_events (
  id                 uuid        primary key default gen_random_uuid(),
  case_id            uuid        not null,
  previous_event_id  uuid        null,
  event_type         text        not null,
  previous_status    public.dispute_status null,
  new_status         public.dispute_status not null,
  decision_id        uuid        null,
  evidence_id        uuid        null,
  claim_id           uuid        null,
  actor_id           uuid        null,
  actor_kind         text        not null,
  note               text        null,
  rpc_name           text        not null,
  request_id         uuid        not null,
  params_fingerprint text        not null,
  created_at         timestamptz not null default now(),

  constraint dispute_events_not_self_superseding
    check (previous_event_id is null or previous_event_id <> id),
  constraint dispute_events_type_valid check (event_type in (
    'opened', 'claim_added', 'evidence_added', 'comment_added', 'assigned',
    'status_changed', 'decided', 'decision_superseded', 'closed', 'withdrawn',
    'release_blocked', 'reconciliation_required')),
  constraint dispute_events_actor_kind_valid
    check (actor_kind in ('party', 'admin', 'system')),
  constraint dispute_events_actor_coherent
    check ((actor_kind = 'system') = (actor_id is null)),
  constraint dispute_events_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint dispute_events_decided_cites_decision
    check (event_type not in ('decided', 'decision_superseded') or decision_id is not null),
  constraint dispute_events_request_case_unique unique (request_id, case_id),
  constraint dispute_events_id_case_unique unique (id, case_id)
);

alter table public.dispute_events
  add constraint dispute_events_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_events
  add constraint dispute_events_decision_fk
  foreign key (decision_id) references public.dispute_decisions(id) on delete restrict;
alter table public.dispute_events
  add constraint dispute_events_evidence_fk
  foreign key (evidence_id) references public.dispute_evidence(id) on delete restrict;
alter table public.dispute_events
  add constraint dispute_events_claim_fk
  foreign key (claim_id) references public.dispute_claims(id) on delete restrict;
alter table public.dispute_events
  add constraint dispute_events_actor_fk
  foreign key (actor_id) references auth.users(id) on delete restrict;
alter table public.dispute_events
  add constraint dispute_events_previous_fk
  foreign key (previous_event_id, case_id)
  references public.dispute_events (id, case_id) on delete restrict;

create unique index dispute_events_single_root
  on public.dispute_events (case_id) where previous_event_id is null;
create unique index dispute_events_single_successor
  on public.dispute_events (previous_event_id) where previous_event_id is not null;

create index dispute_events_case_idx on public.dispute_events (case_id, created_at);

create trigger dispute_events_block_update
  before update on public.dispute_events
  for each row execute function public.publication_block_mutation();
create trigger dispute_events_block_delete
  before delete on public.dispute_events
  for each row execute function public.publication_block_mutation();

alter table public.dispute_cases
  add column last_event_id uuid null;
alter table public.dispute_cases
  add constraint dispute_cases_last_event_fk
  foreign key (last_event_id, id)
  references public.dispute_events (id, case_id) on delete restrict;

comment on table public.dispute_events is
  'Historico completo do caso, append-only e encadeado. Substitui a ideia de uma '
  'tabela separada de status_history: a mudanca de status e um evento como '
  'qualquer outro, com ator, motivo e rastro.';

commit;
