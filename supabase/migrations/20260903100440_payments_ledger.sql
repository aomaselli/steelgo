-- =============================================================================
-- REV8.1 4/13 : LEDGER FINANCEIRO
-- =============================================================================
-- public.payments existe desde 20260812140000 e NUNCA recebeu uma linha: as seis
-- referencias no frontend sao SELECT, e nenhuma migration insere nela. Os
-- paineis financeiros de embarcador, transportadora e admin leem, hoje, uma
-- tabela vazia por construcao.
--
-- Esta migration cria o modelo financeiro de verdade, ao lado dela. public.payments
-- NAO e alterada nem removida - fica como estrutura legada, e o hardening
-- (13/13) revoga a escrita direta nela para que ninguem a use por engano.
--
-- ===========================================================================
-- HONESTIDADE SEMANTICA E O PONTO INTEIRO DESTE DESENHO
-- ===========================================================================
-- Nenhum estado aqui AFIRMA que dinheiro se moveu sem que alguem tenha
-- confirmado. A separacao e explicita:
--
--   SOLICITACAO           awaiting_funding, release_requested
--   CONFIRMACAO EXTERNA   funding_confirmed, released_confirmed
--   PROBLEMA              failed, reconciliation_required, cancelled
--
-- E cada confirmacao carrega COMO foi confirmada:
--   provider_webhook  - o provedor avisou, e o aviso esta em
--                       public.provider_webhook_events
--   manual_admin      - nao havia provedor; um administrador SteelGo ATESTOU,
--                       com referencia externa, justificativa e COMPROVANTE
--                       VINCULADO (referencia do artefato e sha-256 dele).
--                       E uma declaracao humana rastreavel - NUNCA se apresenta
--                       como confirmacao automatica bancaria, nem na interface
--                       nem nos dados.
--
-- INTEGRACAO FUTURA (BTG, Adyen). Quando o provedor entrar, o aviso dele NAO
-- sobrescreve a atestacao manual: encontra a transacao ja confirmada por
-- manual_admin e abre RECONCILIACAO, para que alguem case o registro humano com
-- o registro bancario. A atestacao permanece na trilha, com quem a assinou.
--
-- ===========================================================================
-- INTERFACE DE ADAPTADOR - SEM CREDENCIAIS, SEM CHAMADA FICTICIA
-- ===========================================================================
-- public.payment_providers e o catalogo. Um adaptador futuro (BTG, Adyen ou
-- outro) se conecta cumprindo TRES pontos, todos ja existentes aqui:
--   1. registrar-se em payment_providers, com suas capacidades declaradas;
--   2. gravar a conta externa da empresa em payment_accounts, guardando SOMENTE
--      a referencia opaca do provedor - NUNCA chave, token ou credencial;
--   3. entregar cada aviso do provedor a public.record_provider_webhook
--      (11/13), que deduplica, ordena e move a maquina de estados.
-- Nenhuma credencial existe neste schema, e nenhuma chamada externa e simulada.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
create type public.payment_internal_status as enum (
  'pending_provider',
  'awaiting_funding',
  'funding_confirmed',
  'release_requested',
  'released_confirmed',
  'failed',
  'cancelled',
  'reconciliation_required'
);

create type public.payment_transaction_kind as enum (
  'funding', 'release', 'refund', 'adjustment'
);

create type public.payment_transaction_status as enum (
  'requested', 'pending_provider', 'confirmed', 'failed', 'cancelled'
);

create type public.payment_party_kind as enum (
  'platform', 'carrier', 'shipper'
);

create type public.payment_confirmation_method as enum (
  'provider_webhook', 'manual_admin'
);

-- -----------------------------------------------------------------------------
-- CATALOGO DE PROVEDORES
-- -----------------------------------------------------------------------------
create table public.payment_providers (
  code          text        primary key,
  display_name  text        not null,
  adapter_kind  text        not null,
  is_active     boolean     not null default true,
  capabilities  jsonb       not null default '{}'::jsonb,
  notes         text        null,
  created_at    timestamptz not null default now(),

  constraint payment_providers_code_format check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  constraint payment_providers_adapter_kind_valid
    check (adapter_kind in ('manual', 'external_api')),
  constraint payment_providers_display_name_not_blank
    check (length(btrim(display_name)) > 0)
);

comment on table public.payment_providers is
  'Catalogo de meios de pagamento. NAO guarda credencial, chave nem token - '
  'apenas o codigo do provedor e o que ele sabe fazer. Um adaptador externo se '
  'registra aqui e entrega seus avisos a public.record_provider_webhook.';

insert into public.payment_providers (code, display_name, adapter_kind, capabilities, notes)
values (
  'manual', 'Atestacao manual SteelGo', 'manual',
  jsonb_build_object(
    'funding_confirmation', 'manual_admin',
    'release_confirmation', 'manual_admin',
    'webhooks', false,
    'refunds', false),
  'Nao ha provedor integrado. A confirmacao e uma ATESTACAO de administrador '
  'SteelGo, com referencia externa obrigatoria - o dinheiro se move fora da '
  'plataforma e alguem assina que se moveu. Nao e confirmacao de provedor.'
);

-- -----------------------------------------------------------------------------
-- CONTAS
-- -----------------------------------------------------------------------------
create table public.payment_accounts (
  id                  uuid        primary key default gen_random_uuid(),
  company_id          uuid        not null,
  provider_code       text        not null,
  account_kind        text        not null,
  external_account_ref text       null,
  status              text        not null default 'pending_verification',
  verified_at         timestamptz null,
  verified_by         uuid        null,
  created_by          uuid        null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payment_accounts_kind_valid check (account_kind in ('payer', 'payee')),
  constraint payment_accounts_status_valid
    check (status in ('pending_verification', 'verified', 'rejected', 'disabled')),
  constraint payment_accounts_verified_coherent
    check ((verified_at is null) = (verified_by is null)),
  constraint payment_accounts_verified_status
    check (status <> 'verified' or verified_at is not null),
  constraint payment_accounts_ref_not_blank
    check (external_account_ref is null or length(btrim(external_account_ref)) > 0),
  constraint payment_accounts_unique_per_provider
    unique (company_id, provider_code, account_kind)
);

alter table public.payment_accounts
  add constraint payment_accounts_company_fk
  foreign key (company_id) references public.companies(id) on delete restrict;
alter table public.payment_accounts
  add constraint payment_accounts_provider_fk
  foreign key (provider_code) references public.payment_providers(code) on delete restrict;
alter table public.payment_accounts
  add constraint payment_accounts_verified_by_fk
  foreign key (verified_by) references auth.users(id) on delete restrict;
alter table public.payment_accounts
  add constraint payment_accounts_created_by_fk
  foreign key (created_by) references auth.users(id) on delete restrict;

comment on column public.payment_accounts.external_account_ref is
  'Referencia OPACA da conta no provedor. NUNCA chave de API, token, senha, '
  'numero de cartao ou dado bancario completo. Guardar credencial aqui e '
  'violacao do desenho.';

-- -----------------------------------------------------------------------------
-- INTENCAO DE PAGAMENTO  -  uma por contrato
-- -----------------------------------------------------------------------------
create table public.payment_intents (
  id                    uuid        primary key default gen_random_uuid(),
  contract_id           uuid        not null,
  provider_code         text        not null,
  currency_code         text        not null,

  gross_amount          numeric(16,2) not null,
  platform_fee_amount   numeric(16,2) not null,
  carrier_net_amount    numeric(16,2) not null,
  pricing_rule_id       uuid        null,

  internal_status       public.payment_internal_status not null default 'pending_provider',
  external_status       text        null,
  external_reference    text        null,
  failure_code          text        null,
  failure_reason        text        null,

  release_blocked_by_dispute boolean not null default false,

  requested_by          uuid        null,
  requested_at          timestamptz null,
  funding_confirmed_at  timestamptz null,
  release_requested_by  uuid        null,
  release_requested_at  timestamptz null,
  released_confirmed_at timestamptz null,
  reconciled_by         uuid        null,
  reconciled_at         timestamptz null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payment_intents_contract_unique unique (contract_id),
  constraint payment_intents_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint payment_intents_amounts_positive
    check (gross_amount > 0 and platform_fee_amount >= 0 and carrier_net_amount >= 0),
  -- Sem centavo perdido: taxa + liquido = bruto, exatamente.
  constraint payment_intents_amounts_close
    check (platform_fee_amount + carrier_net_amount = gross_amount),
  constraint payment_intents_failure_coherent
    check ((failure_code is null) = (failure_reason is null)),
  constraint payment_intents_failure_only_when_failed
    check (failure_code is null or internal_status in ('failed', 'reconciliation_required')),
  constraint payment_intents_external_ref_not_blank
    check (external_reference is null or length(btrim(external_reference)) > 0),
  -- Confirmacao implica carimbo, e carimbo implica ter passado pela confirmacao.
  constraint payment_intents_funding_stamp
    check (internal_status not in ('funding_confirmed','release_requested','released_confirmed')
           or funding_confirmed_at is not null),
  constraint payment_intents_release_stamp
    check (internal_status <> 'released_confirmed' or released_confirmed_at is not null),
  constraint payment_intents_reconciled_coherent
    check ((reconciled_at is null) = (reconciled_by is null))
);

alter table public.payment_intents
  add constraint payment_intents_contract_fk
  foreign key (contract_id) references public.contracts(id) on delete restrict;
alter table public.payment_intents
  add constraint payment_intents_provider_fk
  foreign key (provider_code) references public.payment_providers(code) on delete restrict;
alter table public.payment_intents
  add constraint payment_intents_pricing_rule_fk
  foreign key (pricing_rule_id) references public.pricing_rules(id) on delete restrict;
alter table public.payment_intents
  add constraint payment_intents_requested_by_fk
  foreign key (requested_by) references auth.users(id) on delete restrict;
alter table public.payment_intents
  add constraint payment_intents_release_requested_by_fk
  foreign key (release_requested_by) references auth.users(id) on delete restrict;
alter table public.payment_intents
  add constraint payment_intents_reconciled_by_fk
  foreign key (reconciled_by) references auth.users(id) on delete restrict;

create index payment_intents_status_idx on public.payment_intents (internal_status, created_at desc);
-- REFERENCIA EXTERNA E UNICA POR PROVEDOR (correcao 8.1-b/b2).
-- O aviso do provedor encontra o pagamento por (provider_code,
-- external_reference). Se duas intencoes puderem carregar a mesma referencia, a
-- busca fica ambigua e um "limit 1" atribuiria o dinheiro ao contrato errado -
-- silenciosamente, e de forma nao reproduzivel, porque a linha escolhida
-- dependeria do plano. A unicidade fecha isso na estrutura: a ambiguidade deixa
-- de ser representavel, e a segunda intencao que tentar usar a referencia falha
-- na hora de gravar, nao na hora de pagar.
-- Parcial porque referencia NULA e o estado normal enquanto o provedor ainda
-- nao devolveu identificador: varias intencoes convivem sem referencia.
create unique index payment_intents_provider_ref_unique
  on public.payment_intents (provider_code, external_reference)
  where external_reference is not null;

comment on table public.payment_intents is
  'Uma intencao de pagamento por contrato. internal_status e a fonte '
  'autoritativa do estado financeiro; contracts.escrow_status e apenas espelho '
  'de leitura. Nenhum estado afirma movimentacao sem confirmacao registrada.';

-- Agora que payment_intents existe, os eventos do contrato podem cita-la.
alter table public.contract_lifecycle_events
  add constraint contract_lifecycle_events_intent_fk
  foreign key (payment_intent_id) references public.payment_intents(id) on delete restrict;

-- -----------------------------------------------------------------------------
-- TRANSACOES
-- -----------------------------------------------------------------------------
create table public.payment_transactions (
  id                   uuid        primary key default gen_random_uuid(),
  intent_id            uuid        not null,
  kind                 public.payment_transaction_kind not null,
  status               public.payment_transaction_status not null default 'requested',
  currency_code        text        not null,
  amount               numeric(16,2) not null,

  provider_code        text        not null,
  external_reference   text        null,
  external_status      text        null,
  failure_code         text        null,
  failure_reason       text        null,

  requested_by         uuid        null,
  requested_at         timestamptz not null default now(),
  confirmed_by         uuid        null,
  confirmed_at         timestamptz null,
  confirmation_method  public.payment_confirmation_method null,
  confirmation_note    text        null,
  -- COMPROVANTE VINCULADO (8.1). A atestacao manual nao se sustenta em texto
  -- livre: exige o artefato. evidence_ref e a referencia de Storage do
  -- comprovante e evidence_hash o sha-256 do arquivo, de modo que trocar o
  -- comprovante depois seja detectavel.
  confirmation_evidence_ref  text  null,
  confirmation_evidence_hash text  null,

  idempotency_key      uuid        not null,
  created_at           timestamptz not null default now(),

  constraint payment_transactions_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint payment_transactions_amount_positive check (amount > 0),
  constraint payment_transactions_idempotency_unique unique (idempotency_key),
  constraint payment_transactions_failure_coherent
    check ((failure_code is null) = (failure_reason is null)),
  constraint payment_transactions_failure_only_when_failed
    check (failure_code is null or status = 'failed'),
  constraint payment_transactions_ref_not_blank
    check (external_reference is null or length(btrim(external_reference)) > 0),
  -- CONFIRMACAO E UM PACOTE: quem, quando e COMO. Nenhum dos tres sozinho.
  constraint payment_transactions_confirmation_coherent
    check ((status = 'confirmed')
           = (confirmed_at is not null and confirmation_method is not null)),
  -- ATESTACAO MANUAL EXIGE, cumulativamente: administrador identificado,
  -- referencia externa, justificativa e COMPROVANTE VINCULADO com hash.
  -- Falta qualquer um dos cinco e a linha nao existe.
  constraint payment_transactions_manual_requires_evidence
    check (confirmation_method is distinct from 'manual_admin'
           or (confirmed_by is not null
               and external_reference is not null
               and confirmation_note is not null
               and length(btrim(confirmation_note)) >= 10
               and confirmation_evidence_ref is not null
               and length(btrim(confirmation_evidence_ref)) > 0
               and confirmation_evidence_hash is not null)),
  constraint payment_transactions_evidence_hash_format
    check (confirmation_evidence_hash is null
           or confirmation_evidence_hash ~ '^[0-9a-f]{64}$'),
  -- Comprovante so faz sentido em atestacao manual: confirmacao de provedor
  -- tem o proprio aviso como prova, em provider_webhook_events.
  constraint payment_transactions_evidence_only_manual
    check (confirmation_evidence_ref is null
           or confirmation_method = 'manual_admin'),
  -- Confirmacao por webhook nao tem usuario: quem confirmou foi o provedor.
  constraint payment_transactions_webhook_has_no_user
    check (confirmation_method is distinct from 'provider_webhook'
           or confirmed_by is null)
);

alter table public.payment_transactions
  add constraint payment_transactions_intent_fk
  foreign key (intent_id) references public.payment_intents(id) on delete restrict;
alter table public.payment_transactions
  add constraint payment_transactions_provider_fk
  foreign key (provider_code) references public.payment_providers(code) on delete restrict;
alter table public.payment_transactions
  add constraint payment_transactions_requested_by_fk
  foreign key (requested_by) references auth.users(id) on delete restrict;
alter table public.payment_transactions
  add constraint payment_transactions_confirmed_by_fk
  foreign key (confirmed_by) references auth.users(id) on delete restrict;

-- Uma transacao CONFIRMADA de cada tipo por intencao. Nao existem dois fundings
-- confirmados nem duas liberacoes confirmadas para o mesmo contrato.
create unique index payment_transactions_one_confirmed_per_kind
  on public.payment_transactions (intent_id, kind)
  where status = 'confirmed';

create index payment_transactions_intent_idx on public.payment_transactions (intent_id, created_at desc);
create index payment_transactions_ref_idx on public.payment_transactions (provider_code, external_reference);

-- -----------------------------------------------------------------------------
-- ALOCACOES  -  para onde cada centavo da transacao vai
-- -----------------------------------------------------------------------------
create table public.payment_allocations (
  id             uuid        primary key default gen_random_uuid(),
  transaction_id uuid        not null,
  party_kind     public.payment_party_kind not null,
  company_id     uuid        null,
  amount         numeric(16,2) not null,
  note           text        null,
  created_at     timestamptz not null default now(),

  constraint payment_allocations_amount_positive check (amount > 0),
  -- A plataforma nao e uma empresa do cadastro; as outras duas pontas sao.
  constraint payment_allocations_company_coherent
    check ((party_kind = 'platform') = (company_id is null)),
  constraint payment_allocations_one_per_party
    unique (transaction_id, party_kind)
);

alter table public.payment_allocations
  add constraint payment_allocations_transaction_fk
  foreign key (transaction_id) references public.payment_transactions(id) on delete restrict;
alter table public.payment_allocations
  add constraint payment_allocations_company_fk
  foreign key (company_id) references public.companies(id) on delete restrict;

create index payment_allocations_transaction_idx on public.payment_allocations (transaction_id);
create index payment_allocations_company_idx on public.payment_allocations (company_id);

-- A SOMA TEM DE FECHAR EXATAMENTE. Constraint trigger DIFERIDA: verificada no
-- COMMIT, quando a transacao e todas as suas alocacoes ja existem. Cobre
-- tambem o caso de transacao SEM alocacao nenhuma, porque sum(vazio) e 0 e 0
-- nunca e igual a um amount positivo.
create function public.payment_allocations_must_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tx     uuid;
  v_amount numeric;
  v_sum    numeric;
begin
  -- IF/ELSE e nao CASE: numa expressao CASE o plpgsql resolve TODAS as arms, e
  -- NEW.transaction_id nao existe quando o gatilho roda sobre a outra tabela - o
  -- resultado seria 42703 em vez da verificacao.
  if TG_TABLE_NAME = 'payment_allocations' then
    v_tx := coalesce(NEW.transaction_id, OLD.transaction_id);
  else
    v_tx := coalesce(NEW.id, OLD.id);
  end if;

  select t.amount into v_amount from public.payment_transactions t where t.id = v_tx;
  if not found then
    return null;   -- transacao removida na mesma transacao; nada a fechar
  end if;

  select coalesce(sum(a.amount), 0) into v_sum
    from public.payment_allocations a where a.transaction_id = v_tx;

  if v_sum <> v_amount then
    raise exception using errcode = '23514',
      message = format('public.payment_allocations: a soma das alocacoes (%s) nao '
                       'fecha o valor da transacao %s (%s). Toda transacao e '
                       'integralmente alocada.', v_sum, v_tx, v_amount);
  end if;
  return null;
end;
$fn$;

create constraint trigger payment_allocations_must_close_trg
  after insert or update or delete on public.payment_allocations
  deferrable initially deferred
  for each row execute function public.payment_allocations_must_close();

create constraint trigger payment_transactions_must_be_allocated_trg
  after insert or update on public.payment_transactions
  deferrable initially deferred
  for each row execute function public.payment_allocations_must_close();

-- -----------------------------------------------------------------------------
-- RECONCILIACAO EXTERNA
-- -----------------------------------------------------------------------------
create table public.external_reconciliation (
  id               uuid        primary key default gen_random_uuid(),
  intent_id        uuid        not null,
  transaction_id   uuid        null,
  source           text        not null,
  statement_ref    text        null,
  currency_code    text        not null,
  expected_amount  numeric(16,2) not null,
  observed_amount  numeric(16,2) null,
  status           text        not null default 'pending',
  resolution_note  text        null,
  opened_by        uuid        null,
  opened_at        timestamptz not null default now(),
  resolved_by      uuid        null,
  resolved_at      timestamptz null,

  -- webhook_incomplete e webhook_out_of_order entram na correcao 8.1-b: um
  -- aviso monetario sem valor, sem moeda ou sem referencia, e um aviso valido
  -- que descreve uma etapa que o pagamento ainda nao alcancou, NAO sao
  -- descartados nem aplicados - viram reconciliacao com nome proprio, para que
  -- alguem olhe. O nome da origem e o que permite achar depois cada classe.
  constraint external_reconciliation_source_valid
    check (source in ('provider_statement', 'bank_statement', 'manual_review',
                      'webhook_mismatch', 'webhook_incomplete', 'webhook_out_of_order')),
  constraint external_reconciliation_status_valid
    check (status in ('pending', 'matched', 'mismatch', 'written_off')),
  constraint external_reconciliation_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint external_reconciliation_resolved_coherent
    check ((resolved_at is null) = (resolved_by is null)),
  constraint external_reconciliation_resolution_requires_note
    check (status = 'pending'
           or (resolution_note is not null and length(btrim(resolution_note)) >= 10)),
  constraint external_reconciliation_resolution_requires_resolver
    check (status = 'pending' or resolved_by is not null)
);

alter table public.external_reconciliation
  add constraint external_reconciliation_intent_fk
  foreign key (intent_id) references public.payment_intents(id) on delete restrict;
alter table public.external_reconciliation
  add constraint external_reconciliation_transaction_fk
  foreign key (transaction_id) references public.payment_transactions(id) on delete restrict;
alter table public.external_reconciliation
  add constraint external_reconciliation_opened_by_fk
  foreign key (opened_by) references auth.users(id) on delete restrict;
alter table public.external_reconciliation
  add constraint external_reconciliation_resolved_by_fk
  foreign key (resolved_by) references auth.users(id) on delete restrict;

create index external_reconciliation_intent_idx on public.external_reconciliation (intent_id, opened_at desc);
create index external_reconciliation_status_idx on public.external_reconciliation (status, opened_at desc);

comment on table public.external_reconciliation is
  'Divergencia entre o que a SteelGo registrou e o que o extrato externo mostra. '
  'Toda resolucao exige nota e responsavel. Enquanto pendente, o intent fica em '
  'reconciliation_required e a liberacao nao anda.';

commit;
