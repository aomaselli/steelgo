-- =============================================================================
-- REV8.1 3/13 : EVENTOS APPEND-ONLY DO CICLO DO CONTRATO
-- =============================================================================
-- Mesmo desenho ja provado em public.freight_publication_events:
--   * tabela append-only, com UPDATE e DELETE bloqueados por trigger;
--   * cadeia por previous_event_id, com raiz unica e sucessor unico por
--     indice parcial - a trilha nao bifurca e nao se reescreve;
--   * FK composta (previous_event_id, contract_id) garantindo que o antecessor
--     pertence ao MESMO contrato;
--   * matriz de transicao em CHECK: evento incoerente nao chega a existir.
--
-- A PECA CENTRAL DESTA MIGRATION e a linha da matriz para 'completed':
-- estruturalmente, nao existe evento de conclusao de contrato sem entrega
-- concluida E liberacao confirmada. Isso vale mesmo que alguem escreva uma RPC
-- nova amanha e esqueca de verificar.
--
-- As FK para payment_intents e dispute_cases sao adicionadas em 4/13 e 6/13,
-- quando aquelas tabelas existirem. Ambas vem DEPOIS deste arquivo e ANTES de
-- 20260903100500 - nao ha referencia para frente em lugar nenhum do lote.
-- =============================================================================

begin;

create type public.contract_lifecycle_transition as enum (
  'shipper_signed',
  'carrier_signed',
  'activated',
  'delivery_completed',
  'escrow_funding_requested',
  'escrow_funding_confirmed',
  'escrow_release_requested',
  'escrow_release_confirmed',
  'payment_failed',
  'reconciliation_required',
  'completed',
  'disputed',
  'dispute_resolved',
  'cancelled'
);

comment on type public.contract_lifecycle_transition is
  'Transicoes governadas do ciclo do contrato. Assinatura, entrega, dinheiro e '
  'disputa sao eixos INDEPENDENTES: uma transicao de um eixo nao presume nada '
  'sobre os outros, exceto onde a matriz exige.';

create table public.contract_lifecycle_events (
  id                    uuid        primary key default gen_random_uuid(),
  contract_id           uuid        not null,
  previous_event_id     uuid        null,
  transition            public.contract_lifecycle_transition not null,

  previous_status       public.contract_status null,
  new_status            public.contract_status not null,
  previous_escrow_status text       null,
  new_escrow_status     text        not null,

  -- Fatos citados pelo evento, congelados no instante em que ocorreu.
  delivery_completed_at timestamptz null,
  escrow_confirmed_at   timestamptz null,
  payment_intent_id     uuid        null,
  dispute_case_id       uuid        null,
  amount_brl            numeric     null,

  actor_id              uuid        null,
  actor_kind            text        not null,
  reason                text        null,
  rpc_name              text        not null,
  request_id            uuid        not null,
  params_fingerprint    text        not null,
  created_at            timestamptz not null default now(),

  constraint contract_lifecycle_events_not_self_superseding
    check (previous_event_id is null or previous_event_id <> id),
  constraint contract_lifecycle_events_rpc_name_not_blank
    check (length(btrim(rpc_name)) > 0),
  constraint contract_lifecycle_events_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint contract_lifecycle_events_reason_not_blank
    check (reason is null or length(btrim(reason)) > 0),
  constraint contract_lifecycle_events_actor_kind_valid
    check (actor_kind in ('party', 'admin', 'provider', 'system')),
  -- Ato de provedor ou do sistema nao tem usuario; ato de parte ou de admin tem.
  constraint contract_lifecycle_events_actor_coherent
    check ((actor_kind in ('provider', 'system')) = (actor_id is null)),

  -- Uma chamada pode produzir mais de um evento neste contrato: a confirmacao
  -- da liberacao gera o evento financeiro E, quando a entrega ja esta
  -- concluida, o evento de conclusao. A unicidade inclui a transicao, de modo
  -- que o replay continue impedido evento a evento.
  constraint contract_lifecycle_events_request_contract_unique
    unique (request_id, contract_id, transition),
  constraint contract_lifecycle_events_id_contract_unique
    unique (id, contract_id),

  -- ===========================================================================
  -- MATRIZ DE TRANSICAO
  -- ===========================================================================
  constraint contract_lifecycle_events_transition_matrix check (
    case transition

      when 'shipper_signed' then
             previous_status = 'awaiting_shipper_signature'::public.contract_status
         and new_status      = 'awaiting_carrier_signature'::public.contract_status

      when 'carrier_signed' then
             previous_status = 'awaiting_carrier_signature'::public.contract_status
         and new_status      = 'active'::public.contract_status

      when 'activated' then
             new_status = 'active'::public.contract_status

      -- ENTREGA. Eixo operacional puro: o status do contrato NAO muda por
      -- causa dela, e o escrow tampouco.
      when 'delivery_completed' then
             previous_status = 'active'::public.contract_status
         and new_status      = 'active'::public.contract_status
         and delivery_completed_at is not null
         and new_escrow_status is not distinct from previous_escrow_status

      -- DINHEIRO. Eixo financeiro puro: o status do contrato NAO muda.
      when 'escrow_funding_requested' then
             new_status = previous_status
         and new_escrow_status = 'awaiting_funding'
         and payment_intent_id is not null
      when 'escrow_funding_confirmed' then
             new_status = previous_status
         and new_escrow_status = 'funding_confirmed'
         and escrow_confirmed_at is not null
         and payment_intent_id is not null
      when 'escrow_release_requested' then
             new_status = previous_status
         and new_escrow_status = 'release_requested'
         and payment_intent_id is not null
      when 'escrow_release_confirmed' then
             new_status = previous_status
         and new_escrow_status = 'released_confirmed'
         and escrow_confirmed_at is not null
         and payment_intent_id is not null
      when 'payment_failed' then
             new_status = previous_status
         and new_escrow_status = 'failed'
         and payment_intent_id is not null
      when 'reconciliation_required' then
             new_status = previous_status
         and new_escrow_status = 'reconciliation_required'
         and payment_intent_id is not null

      -- ===================================================================
      -- CONCLUSAO. A peca central. Um evento de conclusao NAO PODE EXISTIR
      -- sem os dois fatos: entrega concluida e liberacao confirmada. Isso e
      -- estrutural - vale para qualquer RPC, presente ou futura.
      -- ===================================================================
      when 'completed' then
             previous_status = 'active'::public.contract_status
         and new_status      = 'completed'::public.contract_status
         and delivery_completed_at is not null
         and new_escrow_status = 'released_confirmed'
         and escrow_confirmed_at is not null
         and payment_intent_id is not null

      when 'disputed' then
             previous_status in ('active'::public.contract_status,
                                 'completed'::public.contract_status)
         and new_status = 'disputed'::public.contract_status
         and dispute_case_id is not null
      when 'dispute_resolved' then
             previous_status = 'disputed'::public.contract_status
         and new_status in ('completed'::public.contract_status,
                            'cancelled'::public.contract_status,
                            'active'::public.contract_status)
         and dispute_case_id is not null

      when 'cancelled' then
             new_status = 'cancelled'::public.contract_status

      else false
    end
  )
);

alter table public.contract_lifecycle_events
  add constraint contract_lifecycle_events_contract_fk
  foreign key (contract_id) references public.contracts(id) on delete restrict;

alter table public.contract_lifecycle_events
  add constraint contract_lifecycle_events_actor_fk
  foreign key (actor_id) references auth.users(id) on delete restrict;

-- FK COMPOSTA: o evento antecessor pertence ao MESMO contrato.
alter table public.contract_lifecycle_events
  add constraint contract_lifecycle_events_previous_fk
  foreign key (previous_event_id, contract_id)
  references public.contract_lifecycle_events (id, contract_id) on delete restrict;

create unique index contract_lifecycle_events_single_root
  on public.contract_lifecycle_events (contract_id) where previous_event_id is null;

create unique index contract_lifecycle_events_single_successor
  on public.contract_lifecycle_events (previous_event_id) where previous_event_id is not null;

create index contract_lifecycle_events_contract_idx
  on public.contract_lifecycle_events (contract_id, created_at desc);
create index contract_lifecycle_events_transition_idx
  on public.contract_lifecycle_events (transition, created_at desc);
create index contract_lifecycle_events_request_idx
  on public.contract_lifecycle_events (request_id);
create index contract_lifecycle_events_intent_idx
  on public.contract_lifecycle_events (payment_intent_id);
create index contract_lifecycle_events_dispute_idx
  on public.contract_lifecycle_events (dispute_case_id);

create trigger contract_lifecycle_events_block_update
  before update on public.contract_lifecycle_events
  for each row execute function public.publication_block_mutation();
create trigger contract_lifecycle_events_block_delete
  before delete on public.contract_lifecycle_events
  for each row execute function public.publication_block_mutation();

comment on table public.contract_lifecycle_events is
  'Trilha append-only do ciclo do contrato. A matriz de transicao torna '
  'ESTRUTURAL a regra de conclusao: nao existe evento completed sem entrega '
  'concluida e liberacao confirmada.';

-- -----------------------------------------------------------------------------
-- Ponteiro estado <-> evento, no mesmo desenho de freights.
-- -----------------------------------------------------------------------------
alter table public.contracts
  add column last_lifecycle_event_id uuid null;

alter table public.contracts
  add constraint contracts_last_lifecycle_event_fk
  foreign key (last_lifecycle_event_id, id)
  references public.contract_lifecycle_events (id, contract_id) on delete restrict;

comment on column public.contracts.last_lifecycle_event_id is
  'Ultimo evento do ciclo deste contrato. A FK composta garante que o evento '
  'apontado pertence a ESTE contrato, e nao a outro.';

commit;
