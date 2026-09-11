-- =============================================================================
-- L2a - migration 3/7 : freight_publication_events + freights.last_publication_event_id
-- =============================================================================
-- NUCLEO DO INVARIANTE EVENTO <-> ESTADO.
--
-- O vinculo NAO e EXISTS reutilizavel, nao e timestamp, nao e GUC e nao e
-- current_user. E PONTEIRO ESTRUTURAL + CADEIA DE SUCESSOR UNICO:
--
--   freights.last_publication_event_id            --> evento que produziu o estado atual
--   freight_publication_events.previous_event_id  --> evento anterior da cadeia
--
-- Regra do trigger (migration 7/7), em uma linha:
--     E.previous_event_id = OLD.last_publication_event_id
--
-- PROVA DE NAO REUTILIZACAO. Seja P o ponteiro antes do UPDATE.
--  (1) O indice unico parcial freight_publication_events_single_successor
--      garante NO MAXIMO UMA linha em toda a tabela com previous_event_id = P.
--  (2) A tabela e append-only: nenhuma linha existente tem previous_event_id
--      alterado depois.
--  (3) Ciclos sao impossiveis: a FK composta exige que a antecessora ja exista
--      no INSERT e nada e alterado depois; logo a relacao e ordem estrita por
--      sequencia de insercao. O check nao-autociclo fecha o caso trivial.
--  (4) Consumado o UPDATE o ponteiro vale E. A transicao seguinte exige E' com
--      E'.previous_event_id = E; por (3) nenhum ancestral de E satisfaz isso.
--  Conclusao: cada evento autoriza EXATAMENTE UMA transicao, UMA vez. Nao ha
--  UPDATE de "consumo": o evento se torna inelegivel por consequencia do avanco
--  do ponteiro.
--
-- ORDEM EXATA DENTRO DE TODA RPC:
--   1. SELECT ... FROM public.freights WHERE id = ... FOR UPDATE
--   2. INSERT do evento com previous_event_id := <valor lido em 1>
--   3. UPDATE do frete com last_publication_event_id := <id do evento de 2>
--   O trigger BEFORE UPDATE de (3) le OLD.last_publication_event_id, ainda o
--   valor de (1).
--
-- CONCORRENCIA: duas transacoes que leiam o mesmo P competem pelo indice unico
-- parcial; a segunda falha. O FOR UPDATE e a segunda barreira. Nenhuma depende
-- de ordem de execucao de triggers.
--
-- POR QUE TRIGGER COMUM E NAO CONSTRAINT TRIGGER DEFERRED: a verificacao e
-- sobre a TRANSICAO (par OLD -> NEW). Um constraint trigger deferred verifica no
-- COMMIT, quando OLD ja nao existe. BEFORE UPDATE FOR EACH ROW e o unico ponto
-- em que OLD e NEW coexistem.
--
-- COBERTURA TOTAL DO CICLO DE VIDA. Ao contrario da versao anterior deste
-- lote, TODA mudanca de status e governada - nao existe transicao livre. As
-- seis transicoes abaixo esgotam o que o codigo em HEAD 9635404 escreve em
-- public.freights.status (verificado: seis pontos no frontend, zero funcoes de
-- banco). Os demais valores do enum (bidding, matched, in_transit, delivered,
-- completed, disputed) nao sao escritos por nenhum caminho existente e
-- permanecem inalcancaveis ate ganharem RPC propria - fail-closed deliberado.
-- =============================================================================

begin;

create type public.freight_lifecycle_transition as enum (
  'publish',
  'withdraw',
  'reprice',
  'cancel',
  'contract_pending',
  'contracted'
);

comment on type public.freight_lifecycle_transition is
  'Transicoes governadas do ciclo de vida do frete. Esgotam o que o codigo '
  'existente escreve em freights.status. Os demais valores do enum '
  'freight_status permanecem inalcancaveis ate ganharem RPC propria.';

create table public.freight_publication_events (
  id                    uuid        primary key default gen_random_uuid(),
  freight_id            uuid        not null,
  offer_version_id      uuid        null,
  previous_event_id     uuid        null,
  transition            public.freight_lifecycle_transition not null,

  previous_status            public.freight_status null,
  new_status                 public.freight_status not null,
  previous_published_at      timestamptz null,
  new_published_at           timestamptz null,
  previous_budget_brl        numeric     null,
  new_budget_brl             numeric     null,
  previous_budget_amount     numeric     null,
  new_budget_amount          numeric     null,
  previous_final_price_brl    numeric    null,
  new_final_price_brl         numeric    null,
  previous_final_price_amount numeric    null,
  new_final_price_amount      numeric    null,
  previous_matched_carrier_id uuid       null,
  new_matched_carrier_id      uuid       null,
  previous_matched_driver_id  uuid       null,
  new_matched_driver_id       uuid       null,
  previous_matched_truck_id   uuid       null,
  new_matched_truck_id        uuid       null,

  source_bid_id         uuid        null,

  actor_id              uuid        not null,
  actor_was_admin       boolean     not null,
  actor_company_id      uuid        not null,
  reason                text        null,
  rpc_name              text        not null,
  request_id            uuid        not null,
  params_fingerprint    text        not null,
  created_at            timestamptz not null default now(),

  constraint freight_publication_events_not_self_superseding
    check (previous_event_id is null or previous_event_id <> id),

  constraint freight_publication_events_rpc_name_not_blank
    check (length(btrim(rpc_name)) > 0),
  constraint freight_publication_events_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint freight_publication_events_reason_not_blank
    check (reason is null or length(btrim(reason)) > 0),

  -- Idempotencia estrutural por frete. O livro-razao rpc_call_log garante a
  -- unicidade GLOBAL do request_id; este indice garante que, mesmo em corrida,
  -- uma chamada nao produz dois eventos para o mesmo frete.
  constraint freight_publication_events_request_freight_unique
    unique (request_id, freight_id),

  constraint freight_publication_events_id_freight_unique
    unique (id, freight_id),

  -- Cancelamento de rascunho nunca publicado nao tem versao de oferta: o frete
  -- nunca foi anunciado. Toda outra transicao exige a versao anunciada.
  constraint freight_publication_events_offer_version_required
    check (transition = 'cancel' or offer_version_id is not null),

  -- A proposta e a FONTE do preco e dos vinculos de reserva. Toda transicao
  -- para contract_pending cita a proposta que a originou, e nenhuma outra
  -- transicao cita proposta alguma. Rastreabilidade estrutural: dado um evento
  -- de reserva, a linha de public.bids que o justifica e recuperavel.
  constraint freight_publication_events_bid_only_on_reserve
    check ((source_bid_id is not null)
           = (transition = 'contract_pending'::public.freight_lifecycle_transition)),

  -- MATRIZ DE TRANSICAO. Cada transicao declara o par (anterior, novo) de TODAS
  -- as colunas governadas. Evento incoerente nao chega a existir.
  constraint freight_publication_events_transition_matrix check (
    case transition

      when 'publish' then
             (previous_status is null
              or previous_status in ('draft'::public.freight_status,
                                     'withdrawn'::public.freight_status))
         and new_status = 'published'::public.freight_status
         and new_published_at is not null
         and new_budget_brl is not null and new_budget_brl > 0
         and new_budget_amount is not null and new_budget_amount = new_budget_brl
         and new_final_price_brl    is not distinct from previous_final_price_brl
         and new_final_price_amount is not distinct from previous_final_price_amount
         and new_matched_carrier_id is not distinct from previous_matched_carrier_id
         and new_matched_driver_id  is not distinct from previous_matched_driver_id
         and new_matched_truck_id   is not distinct from previous_matched_truck_id

      -- Retirada preserva published_at: o frete DE FATO esteve publicado
      -- naquele instante e o registro historico nao e destruido.
      when 'withdraw' then
             previous_status = 'published'::public.freight_status
         and new_status = 'withdrawn'::public.freight_status
         and new_published_at       is not distinct from previous_published_at
         and new_budget_brl         is not distinct from previous_budget_brl
         and new_budget_amount      is not distinct from previous_budget_amount
         and new_final_price_brl    is not distinct from previous_final_price_brl
         and new_final_price_amount is not distinct from previous_final_price_amount
         and new_matched_carrier_id is not distinct from previous_matched_carrier_id
         and new_matched_driver_id  is not distinct from previous_matched_driver_id
         and new_matched_truck_id   is not distinct from previous_matched_truck_id

      when 'reprice' then
             previous_status = 'published'::public.freight_status
         and new_status = 'published'::public.freight_status
         and new_published_at is not distinct from previous_published_at
         and new_budget_brl is not null and new_budget_brl > 0
         and new_budget_brl is distinct from previous_budget_brl
         and new_budget_amount is not null and new_budget_amount = new_budget_brl
         and new_final_price_brl    is not distinct from previous_final_price_brl
         and new_final_price_amount is not distinct from previous_final_price_amount
         and new_matched_carrier_id is not distinct from previous_matched_carrier_id
         and new_matched_driver_id  is not distinct from previous_matched_driver_id
         and new_matched_truck_id   is not distinct from previous_matched_truck_id

      -- ALLOWLIST EXPLICITA de estados de origem. Nao e "qualquer estado menos
      -- cancelled": estados de execucao e de contrato exigem rescisao propria,
      -- nao cancelamento comum, e sao recusados aqui - estruturalmente, no
      -- CHECK, nao apenas por verificacao procedural na RPC.
      --   permitidos : null, draft, published, withdrawn, bidding, matched
      --   recusados  : contract_pending, contracted  -> exigem rescisao (L2b)
      --                in_transit, delivered, completed, disputed -> execucao
      --                iniciada ou concluida; cancelar apagaria o fato
      --                cancelled -> ja cancelado
      when 'cancel' then
             new_status = 'cancelled'::public.freight_status
         and (previous_status is null
              or previous_status in ('draft'::public.freight_status,
                                     'published'::public.freight_status,
                                     'withdrawn'::public.freight_status,
                                     'bidding'::public.freight_status,
                                     'matched'::public.freight_status))
         and new_published_at       is not distinct from previous_published_at
         and new_budget_brl         is not distinct from previous_budget_brl
         and new_budget_amount      is not distinct from previous_budget_amount
         and new_final_price_brl    is not distinct from previous_final_price_brl
         and new_final_price_amount is not distinct from previous_final_price_amount
         and new_matched_carrier_id is not distinct from previous_matched_carrier_id
         and new_matched_driver_id  is not distinct from previous_matched_driver_id
         and new_matched_truck_id   is not distinct from previous_matched_truck_id

      when 'contract_pending' then
             previous_status = 'published'::public.freight_status
         and new_status = 'contract_pending'::public.freight_status
         and new_published_at   is not distinct from previous_published_at
         and new_budget_brl     is not distinct from previous_budget_brl
         and new_budget_amount  is not distinct from previous_budget_amount
         and new_final_price_brl is not null and new_final_price_brl > 0
         and new_final_price_amount is not null
         and new_final_price_amount = new_final_price_brl
         and new_matched_carrier_id is not null

      when 'contracted' then
             previous_status = 'contract_pending'::public.freight_status
         and new_status = 'contracted'::public.freight_status
         and new_published_at       is not distinct from previous_published_at
         and new_budget_brl         is not distinct from previous_budget_brl
         and new_budget_amount      is not distinct from previous_budget_amount
         and new_final_price_brl    is not distinct from previous_final_price_brl
         and new_final_price_amount is not distinct from previous_final_price_amount
         and new_matched_carrier_id is not distinct from previous_matched_carrier_id
         and new_matched_driver_id  is not distinct from previous_matched_driver_id
         and new_matched_truck_id   is not distinct from previous_matched_truck_id

      else false
    end
  )

  -- NOTA: nao existe check ligando previous_event_id a previous_status. A raiz
  -- da cadeia PODE ter previous_status nao nulo - e exatamente o caso do
  -- anuncio legado, ja 'published' sem nunca ter passado por RPC. Amarrar
  -- previous_status a raiz tornaria os legados inalcancaveis.
);

alter table public.freight_publication_events
  add constraint freight_publication_events_freight_fk
  foreign key (freight_id) references public.freights(id) on delete restrict;

alter table public.freight_publication_events
  add constraint freight_publication_events_actor_fk
  foreign key (actor_id) references auth.users(id) on delete restrict;

alter table public.freight_publication_events
  add constraint freight_publication_events_actor_company_fk
  foreign key (actor_company_id) references public.companies(id) on delete restrict;

alter table public.freight_publication_events
  add constraint freight_publication_events_source_bid_fk
  foreign key (source_bid_id) references public.bids(id) on delete restrict;

-- FK COMPOSTA 1: a versao de oferta citada pertence ao MESMO frete.
alter table public.freight_publication_events
  add constraint freight_publication_events_offer_version_fk
  foreign key (offer_version_id, freight_id)
  references public.freight_offer_versions (id, freight_id) on delete restrict;

-- FK COMPOSTA 2: o evento antecessor pertence ao MESMO frete.
alter table public.freight_publication_events
  add constraint freight_publication_events_previous_fk
  foreign key (previous_event_id, freight_id)
  references public.freight_publication_events (id, freight_id) on delete restrict;

create unique index freight_publication_events_single_root
  on public.freight_publication_events (freight_id)
  where previous_event_id is null;

-- Peca que torna a NAO REUTILIZACAO estrutural, e nao convencionada.
create unique index freight_publication_events_single_successor
  on public.freight_publication_events (previous_event_id)
  where previous_event_id is not null;

create index freight_publication_events_freight_idx
  on public.freight_publication_events (freight_id, created_at desc);
create index freight_publication_events_offer_version_idx
  on public.freight_publication_events (offer_version_id);
create index freight_publication_events_actor_idx
  on public.freight_publication_events (actor_id, created_at desc);
create index freight_publication_events_transition_idx
  on public.freight_publication_events (transition, created_at desc);
create index freight_publication_events_request_idx
  on public.freight_publication_events (request_id);
create index freight_publication_events_source_bid_idx
  on public.freight_publication_events (source_bid_id)
  where source_bid_id is not null;

create trigger freight_publication_events_block_update
  before update on public.freight_publication_events
  for each row execute function public.publication_block_mutation();

create trigger freight_publication_events_block_delete
  before delete on public.freight_publication_events
  for each row execute function public.publication_block_mutation();

comment on table public.freight_publication_events is
  'Trilha append-only de TODAS as transicoes governadas de public.freights. '
  'Cada linha declara o par (anterior, novo) completo de todas as colunas '
  'governadas. O estado corrente e o evento apontado por '
  'freights.last_publication_event_id; o proximo so pode ser aquele cujo '
  'previous_event_id iguala esse ponteiro. Prova no cabecalho desta migration.';

comment on column public.freight_publication_events.previous_event_id is
  'Evento imediatamente anterior da cadeia deste frete. null apenas na raiz. FK '
  'composta com freight_id garante mesmo frete; indice unico parcial '
  'single_successor garante que um evento autoriza no maximo uma transicao.';

comment on column public.freight_publication_events.offer_version_id is
  'Versao anunciada vigente na transicao. null APENAS em cancel de frete que '
  'nunca foi publicado - nesse caso nao existe oferta a citar.';

comment on column public.freight_publication_events.actor_was_admin is
  'Papel apurado NO SERVIDOR por public.has_role no momento da chamada. Registro '
  'de auditoria; NAO e insumo de autorizacao e nunca vem do cliente.';

comment on column public.freight_publication_events.actor_company_id is
  'Empresa do frete, lida do servidor de public.freights.company_id. Nunca '
  'aceita do cliente.';

comment on column public.freight_publication_events.source_bid_id is
  'Proposta que originou a reserva. NOT NULL exatamente nas transicoes '
  'contract_pending e NULL em todas as outras, por CHECK. Preco final e vinculos '
  'de transportadora, motorista e veiculo sao LIDOS desta linha no servidor - '
  'nunca aceitos do cliente.';

comment on column public.freight_publication_events.params_fingerprint is
  'Impressao digital canonica dos parametros da chamada. Junto com rpc_name, '
  'actor_id e o alvo, define quando um replay e legitimo.';

-- =============================================================================
-- Ponteiro estrutural em public.freights
-- =============================================================================

alter table public.freights
  add column last_publication_event_id uuid null;

-- FK COMPOSTA: o evento apontado pertence a ESTE frete. MATCH SIMPLE: com o
-- ponteiro null a FK nao e exigida - estado correto de rascunho e de legado.
alter table public.freights
  add constraint freights_last_publication_event_fk
  foreign key (last_publication_event_id, id)
  references public.freight_publication_events (id, freight_id) on delete restrict;

create index freights_last_publication_event_idx
  on public.freights (last_publication_event_id);

comment on column public.freights.last_publication_event_id is
  'Ponteiro para o evento que produziu o estado corrente das colunas governadas. '
  'null = frete ainda nao governado (rascunho criado antes do L2a ou anuncio '
  'legado). Coluna NAO gravavel por authenticated, nem em INSERT nem em UPDATE.';

-- =============================================================================
-- RLS e grants
-- =============================================================================

alter table public.freight_publication_events enable row level security;

revoke all on public.freight_publication_events from anon, authenticated;
grant select on public.freight_publication_events to authenticated;

create policy freight_publication_events_select on public.freight_publication_events
  for select to authenticated
  using (
    exists (
      select 1 from public.freights f
      where f.id = freight_id
        and (
          f.created_by = (select auth.uid())
          or public.is_current_user_company_owner(f.company_id)
          or public.is_current_user_company_member(f.company_id)
          or public.has_role((select auth.uid()), 'admin'::public.app_role)
        )
    )
  );

commit;
