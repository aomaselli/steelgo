-- =============================================================================
-- REV8.1 5/13 : EVENTOS FINANCEIROS E AVISOS DE PROVEDOR
-- =============================================================================
-- Duas tabelas append-only, com papeis distintos:
--
--   payment_events          - o que a SteelGo DECIDIU e REGISTROU, encadeado.
--                             Fonte de auditoria interna.
--   provider_webhook_events - o que CHEGOU DE FORA, exatamente como chegou (em
--                             digest), antes de qualquer interpretacao.
--
-- Separar as duas e o que permite responder, depois de um incidente, a pergunta
-- certa: "o provedor avisou e nos processamos errado" e diferente de "o provedor
-- nunca avisou".
--
-- OCCURRED_AT NAO E ORDEM DE PROCESSAMENTO. Ele e o horario DECLARADO PELO
-- PROVEDOR: chega no corpo do aviso, pode vir com relogio dessincronizado,
-- pode vir repetido e nao e verificavel por nos. A ordem em que a SteelGo de
-- fato recebeu e processou os avisos e outra coisa, e fica registrada
-- separadamente:
--   received_at   - quando o aviso entrou aqui, pelo relogio do banco;
--   internal_seq  - sequencia interna monotonica, atribuida na chegada.
-- Os tres convivem sem se confundir. Auditar "o provedor demorou" e diferente
-- de auditar "nos demoramos", e so da para separar as duas coisas guardando as
-- duas ordens.
--
-- WEBHOOK DUPLICADO. Indice unico em (provider_code, external_event_id). A RPC
-- consulta ANTES de inserir: reentrega identica devolve replay idempotente;
-- reentrega com payload CONTRADITORIO nao e tratada como duplicata inocente -
-- gera ALERTA DE INTEGRIDADE em public.provider_webhook_conflicts, porque o
-- mesmo identificador externo descrevendo dois fatos diferentes e um problema
-- do provedor ou um ataque, e nos dois casos alguem precisa olhar.
--
-- WEBHOOK FORA DE ORDEM. A maquina de estados e monotonica: um aviso cujo
-- occurred_at e anterior ao de um aviso ja aplicado e registrado e marcado como
-- 'ignored_stale' - nunca faz o estado retroceder.
--
-- VERIFICACAO DE ASSINATURA. O schema ja carrega signature_verified,
-- signature_algorithm e signature_key_id. A verificacao acontece no adaptador,
-- fora do banco; aqui se registra o RESULTADO dela e qual chave foi usada, para
-- que uma rotacao de chave seja auditavel depois.
--
-- NENHUM PAYLOAD BRUTO E ARMAZENADO. Guarda-se o digest sha-256 do payload e os
-- campos ja normalizados. Isso evita persistir dado pessoal, bancario ou
-- credencial que venha no corpo do aviso.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- TRILHA FINANCEIRA INTERNA
-- -----------------------------------------------------------------------------
create table public.payment_events (
  id                  uuid        primary key default gen_random_uuid(),
  intent_id           uuid        not null,
  previous_event_id   uuid        null,
  transaction_id      uuid        null,
  webhook_event_id    uuid        null,

  event_type          text        not null,
  previous_status     public.payment_internal_status null,
  new_status          public.payment_internal_status not null,
  amount              numeric(16,2) null,
  currency_code       text        null,

  source              text        not null,
  actor_id            uuid        null,
  actor_kind          text        not null,
  confirmation_method public.payment_confirmation_method null,
  external_reference  text        null,
  failure_code        text        null,
  failure_reason      text        null,
  note                text        null,

  rpc_name            text        not null,
  request_id          uuid        not null,
  params_fingerprint  text        not null,
  created_at          timestamptz not null default now(),

  constraint payment_events_not_self_superseding
    check (previous_event_id is null or previous_event_id <> id),
  constraint payment_events_type_valid check (event_type in (
    'intent_created', 'funding_requested', 'funding_confirmed',
    'release_requested', 'release_confirmed', 'failed', 'cancelled',
    'reconciliation_opened', 'reconciliation_resolved',
    'release_blocked_by_dispute', 'release_unblocked')),
  constraint payment_events_source_valid
    check (source in ('internal', 'admin', 'provider_webhook', 'reconciliation')),
  constraint payment_events_actor_kind_valid
    check (actor_kind in ('party', 'admin', 'provider', 'system')),
  constraint payment_events_actor_coherent
    check ((actor_kind in ('provider', 'system')) = (actor_id is null)),
  constraint payment_events_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint payment_events_failure_coherent
    check ((failure_code is null) = (failure_reason is null)),
  -- Confirmacao SEMPRE diz como foi confirmada. Sem excecao.
  constraint payment_events_confirmation_method_required
    check (event_type not in ('funding_confirmed', 'release_confirmed')
           or confirmation_method is not null),
  -- Aviso de provedor cita o aviso que o originou.
  constraint payment_events_webhook_source_coherent
    check (source <> 'provider_webhook' or webhook_event_id is not null),
  constraint payment_events_request_intent_unique
    unique (request_id, intent_id, event_type),
  constraint payment_events_id_intent_unique unique (id, intent_id)
);

alter table public.payment_events
  add constraint payment_events_intent_fk
  foreign key (intent_id) references public.payment_intents(id) on delete restrict;
alter table public.payment_events
  add constraint payment_events_transaction_fk
  foreign key (transaction_id) references public.payment_transactions(id) on delete restrict;
alter table public.payment_events
  add constraint payment_events_actor_fk
  foreign key (actor_id) references auth.users(id) on delete restrict;
-- FK COMPOSTA: o antecessor pertence a MESMA intencao.
alter table public.payment_events
  add constraint payment_events_previous_fk
  foreign key (previous_event_id, intent_id)
  references public.payment_events (id, intent_id) on delete restrict;

create unique index payment_events_single_root
  on public.payment_events (intent_id) where previous_event_id is null;
create unique index payment_events_single_successor
  on public.payment_events (previous_event_id) where previous_event_id is not null;

create index payment_events_intent_idx on public.payment_events (intent_id, created_at desc);
create index payment_events_type_idx on public.payment_events (event_type, created_at desc);

create trigger payment_events_block_update
  before update on public.payment_events
  for each row execute function public.publication_block_mutation();
create trigger payment_events_block_delete
  before delete on public.payment_events
  for each row execute function public.publication_block_mutation();

-- Ponteiro estado <-> evento, mesmo desenho de freights e contracts.
alter table public.payment_intents
  add column last_event_id uuid null;
alter table public.payment_intents
  add constraint payment_intents_last_event_fk
  foreign key (last_event_id, id)
  references public.payment_events (id, intent_id) on delete restrict;

comment on table public.payment_events is
  'Trilha append-only do que a SteelGo decidiu sobre cada pagamento. Toda '
  'confirmacao declara COMO foi confirmada: provider_webhook ou manual_admin.';

-- -----------------------------------------------------------------------------
-- AVISOS DE PROVEDOR
-- -----------------------------------------------------------------------------
create table public.provider_webhook_events (
  id                 uuid        primary key default gen_random_uuid(),
  provider_code      text        not null,
  external_event_id  text        not null,
  event_type         text        not null,
  intent_id          uuid        null,
  external_reference text        null,

  -- HORARIO DECLARADO PELO PROVEDOR. Nao e ordem de processamento.
  occurred_at        timestamptz not null,
  provider_sequence  bigint      null,
  -- ORDEM REAL DE CHEGADA NA SteelGo, preservada em separado.
  received_at        timestamptz not null default now(),
  internal_seq       bigint      not null generated always as identity,

  signature_verified boolean     not null,
  signature_algorithm text       null,
  signature_key_id   text        null,
  payload_digest     text        not null,
  amount             numeric(16,2) null,
  currency_code      text        null,

  processed_at       timestamptz null,
  processing_outcome text        null,
  processing_note    text        null,

  constraint provider_webhook_events_dedupe unique (provider_code, external_event_id),
  constraint provider_webhook_events_external_id_not_blank
    check (length(btrim(external_event_id)) > 0),
  constraint provider_webhook_events_digest_format
    check (payload_digest ~ '^[0-9a-f]{64}$'),
  -- deferred_out_of_order entra na correcao 8.1-b/b4: aviso valido, assinado e
  -- integro, que descreve uma etapa AINDA NAO alcancada pelo pagamento. Nao e
  -- duplicata de estado e nao pode virar uma: o desfecho fica pendente, e a
  -- reentrega do mesmo aviso o reprocessa em vez de devolver replay eterno.
  constraint provider_webhook_events_outcome_valid
    check (processing_outcome is null or processing_outcome in
      ('applied', 'ignored_stale', 'ignored_duplicate_state', 'unmatched_intent',
       'signature_rejected', 'reconciliation_required',
       'ignored_replay', 'manual_confirmation_reconciled',
       'deferred_out_of_order')),
  -- ASSINATURA VERIFICADA PRECISA DIZER COMO (reforco 8.1-b).
  -- "signature_verified = true" sozinho e uma afirmacao sem lastro: nao diz com
  -- qual algoritmo nem com qual chave. Numa rotacao de chave, ou na suspeita de
  -- chave vazada, e exatamente essa informacao que permite dizer quais avisos
  -- foram aceitos sob a chave comprometida. Sem ela, a unica resposta possivel
  -- seria "nao da para saber".
  constraint provider_webhook_events_signature_fields
    check (signature_algorithm is null or length(btrim(signature_algorithm)) > 0),
  constraint provider_webhook_events_key_id_not_blank
    check (signature_key_id is null or length(btrim(signature_key_id)) > 0),
  constraint provider_webhook_events_verified_signature_identified
    check (signature_verified = false
           or (signature_algorithm is not null and signature_key_id is not null)),
  constraint provider_webhook_events_processed_coherent
    check ((processed_at is null) = (processing_outcome is null))
);

alter table public.provider_webhook_events
  add constraint provider_webhook_events_provider_fk
  foreign key (provider_code) references public.payment_providers(code) on delete restrict;
alter table public.provider_webhook_events
  add constraint provider_webhook_events_intent_fk
  foreign key (intent_id) references public.payment_intents(id) on delete restrict;

create index provider_webhook_events_intent_idx
  on public.provider_webhook_events (intent_id, occurred_at desc);
create index provider_webhook_events_unprocessed_idx
  on public.provider_webhook_events (received_at) where processed_at is null;
-- Ordem REAL de chegada, para reconstituir o processamento como ele aconteceu.
create index provider_webhook_events_internal_seq_idx
  on public.provider_webhook_events (internal_seq);

-- -----------------------------------------------------------------------------
-- ORDEM DAS ETAPAS DO PAGAMENTO (correcao 8.1-b/b4)
-- -----------------------------------------------------------------------------
-- Para decidir se um aviso descreve uma etapa JA passada ou uma etapa AINDA NAO
-- alcancada, e preciso ordenar os estados. A distincao importa: um aviso sobre
-- etapa passada e ruido - o pagamento ja avancou - e pode ser ignorado; um aviso
-- sobre etapa FUTURA nao e ruido, e um fato que chegou cedo. Tratar os dois como
-- "duplicata de estado" faz o segundo desaparecer, e o pagamento fica preso.
--
-- Estados terminais e de excecao ficam FORA da escala (null): sobre eles nao se
-- diz "antes" nem "depois", e a comparacao com null nao classifica nada como
-- adiantado por acidente.
create function public.payment_status_rank(p_status public.payment_internal_status)
returns int
language sql
immutable
set search_path = ''
as $fn$
  select case p_status
           when 'pending_provider'   then 0
           when 'awaiting_funding'   then 1
           when 'funding_confirmed'  then 2
           when 'release_requested'  then 3
           when 'released_confirmed' then 4
           else null
         end;
$fn$;

revoke execute on function public.payment_status_rank(public.payment_internal_status)
  from public, anon, authenticated;

comment on function public.payment_status_rank(public.payment_internal_status) is
  'Posicao do estado na linha do tempo do pagamento. Serve para distinguir aviso '
  'de etapa JA passada (ruido) de aviso de etapa AINDA NAO alcancada (fato que '
  'chegou cedo). Estados terminais ficam fora da escala, como null.';

-- O aviso e IMUTAVEL no que veio de fora. So o resultado do processamento pode
-- ser preenchido, e uma unica vez.
create function public.provider_webhook_events_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'public.provider_webhook_events e append-only: aviso de provedor '
                'nao e apagado.';
  end if;

  if NEW.provider_code      is distinct from OLD.provider_code
     or NEW.external_event_id is distinct from OLD.external_event_id
     or NEW.event_type      is distinct from OLD.event_type
     or NEW.occurred_at     is distinct from OLD.occurred_at
     or NEW.provider_sequence is distinct from OLD.provider_sequence
     or NEW.received_at     is distinct from OLD.received_at
     or NEW.signature_verified is distinct from OLD.signature_verified
     or NEW.signature_algorithm is distinct from OLD.signature_algorithm
     or NEW.signature_key_id is distinct from OLD.signature_key_id
     or NEW.internal_seq    is distinct from OLD.internal_seq
     or NEW.payload_digest  is distinct from OLD.payload_digest
     or NEW.amount          is distinct from OLD.amount
     or NEW.currency_code   is distinct from OLD.currency_code
  then
    raise exception using errcode = '42501',
      message = 'public.provider_webhook_events: o conteudo recebido do provedor '
                'e imutavel. Apenas o resultado do processamento pode ser gravado.';
  end if;

  -- UMA UNICA TRANSICAO DE DESFECHO E ADMITIDA (correcao 8.1-b/b4):
  -- deferred_out_of_order -> desfecho terminal. Um aviso que descrevia uma etapa
  -- futura fica pendente e e reavaliado quando o provedor o reentrega; ao ser
  -- reavaliado, o desfecho pendente da lugar ao definitivo, uma vez so. Qualquer
  -- outra reescrita de desfecho continua recusada, e nada volta a ser pendente.
  --
  -- A trilha do que foi feito com o aviso nao vive aqui: vive em
  -- public.payment_events, que e append-only e ganha uma linha a CADA avaliacao.
  -- Esta tabela guarda o recibo do que o provedor entregou, e o recibo continua
  -- imutavel em tudo o que veio de fora.
  if OLD.processed_at is not null then
    if OLD.processing_outcome is distinct from 'deferred_out_of_order'
       or NEW.processing_outcome is not distinct from OLD.processing_outcome
       or NEW.processing_outcome = 'deferred_out_of_order'
    then
      raise exception using errcode = '42501',
        message = 'public.provider_webhook_events: este aviso ja foi processado e o '
                  'resultado nao e reescrito. A unica transicao admitida e '
                  'deferred_out_of_order para um desfecho definitivo.';
    end if;
  end if;

  return NEW;
end;
$fn$;

create trigger provider_webhook_events_enforce_immutability_trg
  before update or delete on public.provider_webhook_events
  for each row execute function public.provider_webhook_events_enforce_immutability();

-- -----------------------------------------------------------------------------
-- ALERTA DE INTEGRIDADE  -  mesmo id externo, payload contraditorio
-- -----------------------------------------------------------------------------
-- Reentrega identica e replay e nao produz linha aqui. O que produz linha e o
-- MESMO (provider_code, external_event_id) chegando com payload_digest
-- DIFERENTE: o provedor esta descrevendo dois fatos distintos sob o mesmo
-- identificador, ou alguem esta forjando. Nos dois casos nada e aplicado e
-- alguem precisa olhar.
create table public.provider_webhook_conflicts (
  id                 uuid        primary key default gen_random_uuid(),
  provider_code      text        not null,
  external_event_id  text        not null,
  existing_event_id  uuid        not null,
  existing_digest    text        not null,
  incoming_digest    text        not null,
  incoming_event_type text       null,
  incoming_amount    numeric(16,2) null,
  incoming_occurred_at timestamptz null,
  signature_verified boolean     not null,
  detected_at        timestamptz not null default now(),
  reviewed_by        uuid        null,
  reviewed_at        timestamptz null,
  review_note        text        null,

  constraint provider_webhook_conflicts_digest_format
    check (existing_digest ~ '^[0-9a-f]{64}$' and incoming_digest ~ '^[0-9a-f]{64}$'),
  constraint provider_webhook_conflicts_are_different
    check (existing_digest <> incoming_digest),
  constraint provider_webhook_conflicts_review_coherent
    check ((reviewed_at is null) = (reviewed_by is null))
);

alter table public.provider_webhook_conflicts
  add constraint provider_webhook_conflicts_provider_fk
  foreign key (provider_code) references public.payment_providers(code) on delete restrict;
alter table public.provider_webhook_conflicts
  add constraint provider_webhook_conflicts_existing_fk
  foreign key (existing_event_id) references public.provider_webhook_events(id) on delete restrict;
alter table public.provider_webhook_conflicts
  add constraint provider_webhook_conflicts_reviewer_fk
  foreign key (reviewed_by) references auth.users(id) on delete restrict;

create index provider_webhook_conflicts_open_idx
  on public.provider_webhook_conflicts (detected_at desc) where reviewed_at is null;

create trigger provider_webhook_conflicts_block_delete
  before delete on public.provider_webhook_conflicts
  for each row execute function public.publication_block_mutation();

comment on table public.provider_webhook_conflicts is
  'Alerta de integridade: o mesmo (provider_code, external_event_id) chegou com '
  'payload diferente do ja registrado. Nada e aplicado; o conflito fica aberto '
  'ate revisao humana. Reentrega IDENTICA nao aparece aqui - e replay.';

comment on table public.provider_webhook_events is
  'Avisos recebidos de provedores de pagamento, como chegaram. Deduplicados por '
  '(provider_code, external_event_id). Guarda o DIGEST do payload, nunca o '
  'payload bruto - o corpo pode conter dado pessoal ou bancario. Aviso mais '
  'antigo que o estado ja alcancado e registrado como ignored_stale e nunca faz '
  'o estado retroceder.';

commit;
