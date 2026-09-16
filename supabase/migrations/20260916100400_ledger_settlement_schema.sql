-- =============================================================================
-- MODULO 2 (5/9) : ESQUEMA DE LIQUIDACAO NO LEDGER
-- =============================================================================
-- Aditiva sobre 20260903100440/100450/100430 e 20260912100000/100300.
--
--   1. contracts.escrow_status aceita settlement_requested e settled;
--   2. matriz de contract_lifecycle_events recriada com escrow_settlement_*,
--      dispute_withdrawn, 'completed' aceitando 'settled', e
--      'dispute_resolved'/'dispute_withdrawn' exigindo o retorno ao status
--      anterior (active | completed) - 'cancelled' por disputa so via a
--      transicao 'cancelled' (cancelamento administrativo auditado);
--   3. payment_intents: colunas da liquidacao (decisao, valores, settled_at);
--   4. payment_transactions.dispute_decision_id: no maximo uma transacao viva
--      por (decisao, kind);
--   5. payment_events: tipos novos;
--   6. payment_recoveries: obrigacoes de recuperacao (transportadora e
--      plataforma) com transicao governada open -> confirmed | written_off;
--   7. bucket payment-evidence: caminho aceita refund e recovery;
--   8. assert_financial_evidence (helper unico) e assert_payment_evidence
--      (mesma assinatura) delegando a ele.
--
-- Todas as constraints recriadas sao validadas contra as linhas EXISTENTES:
-- nenhuma assercao exige tabela vazia.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. escrow_status
-- -----------------------------------------------------------------------------
alter table public.contracts drop constraint contracts_escrow_status_check;
alter table public.contracts
  add constraint contracts_escrow_status_check
  check (escrow_status in (
    'pending', 'pending_provider', 'awaiting_funding', 'funding_confirmed',
    'release_requested', 'released_confirmed', 'failed', 'cancelled',
    'reconciliation_required', 'disputed',
    'settlement_requested', 'settled',
    'escrow_held', 'released', 'refunded'));

-- -----------------------------------------------------------------------------
-- 2. matriz de transicao
-- -----------------------------------------------------------------------------
alter table public.contract_lifecycle_events
  drop constraint contract_lifecycle_events_transition_matrix;

alter table public.contract_lifecycle_events
  add constraint contract_lifecycle_events_transition_matrix check (
    case transition

      when 'shipper_signed' then
             previous_status = 'awaiting_shipper_signature'::public.contract_status
         and new_status      = 'awaiting_carrier_signature'::public.contract_status

      when 'carrier_signed' then
             previous_status = 'awaiting_carrier_signature'::public.contract_status
         and new_status      = 'active'::public.contract_status

      when 'activated' then
             new_status = 'active'::public.contract_status

      when 'delivery_completed' then
             previous_status = 'active'::public.contract_status
         and new_status      = 'active'::public.contract_status
         and delivery_completed_at is not null
         and new_escrow_status is not distinct from previous_escrow_status

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

      -- LIQUIDACAO DE DISPUTA: eixo financeiro, o status do contrato nao muda.
      when 'escrow_settlement_requested' then
             new_status = previous_status
         and new_escrow_status = 'settlement_requested'
         and payment_intent_id is not null
         and dispute_case_id is not null
      when 'escrow_settlement_confirmed' then
             new_status = previous_status
         and new_escrow_status = 'settled'
         and escrow_confirmed_at is not null
         and payment_intent_id is not null
         and dispute_case_id is not null

      -- CONCLUSAO: entrega concluida E dinheiro liberado (released_confirmed)
      -- ou liquidado por decisao de disputa (settled).
      when 'completed' then
             previous_status = 'active'::public.contract_status
         and new_status      = 'completed'::public.contract_status
         and delivery_completed_at is not null
         and new_escrow_status in ('released_confirmed', 'settled')
         and escrow_confirmed_at is not null
         and payment_intent_id is not null

      when 'disputed' then
             previous_status in ('active'::public.contract_status,
                                 'completed'::public.contract_status)
         and new_status = 'disputed'::public.contract_status
         and dispute_case_id is not null
      -- RETORNO EXATO ao status anterior. Nunca 'cancelled' por aqui: o
      -- cancelamento por falta de aporte usa a transicao 'cancelled', auditada.
      when 'dispute_resolved' then
             previous_status = 'disputed'::public.contract_status
         and new_status in ('completed'::public.contract_status,
                            'active'::public.contract_status)
         and dispute_case_id is not null
      when 'dispute_withdrawn' then
             previous_status = 'disputed'::public.contract_status
         and new_status in ('completed'::public.contract_status,
                            'active'::public.contract_status)
         and dispute_case_id is not null

      when 'cancelled' then
             new_status = 'cancelled'::public.contract_status

      else false
    end
  );

-- Guarda estrutural da conclusao (20260903100452): passa a aceitar a liquidacao
-- de disputa confirmada ('settled') alem da liberacao confirmada. Mesma
-- assinatura de trigger; a exigencia de entrega concluida permanece.
create or replace function public.contracts_enforce_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_paid boolean;
begin
  if NEW.status = 'completed'::public.contract_status
     and OLD.status is distinct from 'completed'::public.contract_status then
    if NEW.delivery_completed_at is null then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido sem entrega '
                  'concluida. Entrega e pagamento sao fatos independentes e os '
                  'DOIS sao necessarios.';
    end if;
    select (pi.internal_status in ('released_confirmed'::public.payment_internal_status,
                                   'settled'::public.payment_internal_status))
      into v_paid
      from public.payment_intents pi
     where pi.contract_id = NEW.id;
    if not coalesce(v_paid, false) then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido sem '
                  'liberacao de pagamento CONFIRMADA ou liquidacao de disputa '
                  'CONFIRMADA. Solicitacao registrada nao e confirmacao.';
    end if;
  end if;
  return NEW;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. payment_intents
-- -----------------------------------------------------------------------------
alter table public.payment_intents
  add column settlement_decision_id    uuid        null,
  add column settlement_refund_amount  numeric     null,
  add column settlement_release_amount numeric     null,
  add column settlement_funding_amount numeric     null,
  add column settled_at                timestamptz null;

alter table public.payment_intents
  add constraint payment_intents_settlement_decision_fk
  foreign key (settlement_decision_id) references public.dispute_decisions(id) on delete restrict;
create unique index payment_intents_settlement_decision_unique
  on public.payment_intents (settlement_decision_id) where settlement_decision_id is not null;

alter table public.payment_intents
  add constraint payment_intents_settlement_coherent check (
    (settlement_decision_id is null) = (settlement_refund_amount is null)
    and (settlement_decision_id is null) = (settlement_release_amount is null)
    and (settlement_decision_id is not null or settlement_funding_amount is null)),
  add constraint payment_intents_settlement_amounts check (
    settlement_decision_id is null
    or (settlement_refund_amount >= 0 and settlement_release_amount >= 0
        and settlement_refund_amount + settlement_release_amount = gross_amount
        and scale(settlement_refund_amount) <= 2 and scale(settlement_release_amount) <= 2
        and (settlement_funding_amount is null
             or (settlement_funding_amount = settlement_release_amount
                 and scale(settlement_funding_amount) <= 2)))),
  add constraint payment_intents_settled_stamp check (
    internal_status <> 'settled'::public.payment_internal_status or settled_at is not null),
  add constraint payment_intents_settlement_status_needs_decision check (
    internal_status not in ('settlement_requested'::public.payment_internal_status,
                            'settled'::public.payment_internal_status)
    or settlement_decision_id is not null);

comment on column public.payment_intents.settled_at is
  'Liquidacao por decisao de disputa CONFIRMADA (todas as transacoes da decisao '
  'atestadas). Distinto de released_confirmed_at, que nao e carimbado aqui.';
comment on column public.payment_intents.settlement_funding_amount is
  'Quando a decisao chegou sem custodia: o aporte solicitado e SOMENTE o valor '
  'liberado (R); a parcela do embarcador (S) nunca saiu dele e nao gera refund.';

-- -----------------------------------------------------------------------------
-- 4. payment_transactions
-- -----------------------------------------------------------------------------
alter table public.payment_transactions
  add column dispute_decision_id uuid null;
alter table public.payment_transactions
  add constraint payment_transactions_dispute_decision_fk
  foreign key (dispute_decision_id) references public.dispute_decisions(id) on delete restrict;
-- uma transacao VIVA por (decisao, kind): refund e release da liquidacao
create unique index payment_transactions_one_live_per_decision_kind
  on public.payment_transactions (dispute_decision_id, kind)
  where dispute_decision_id is not null
    and status in ('requested', 'pending_provider', 'confirmed');
alter table public.payment_transactions
  add constraint payment_transactions_settlement_kind check (
    dispute_decision_id is null
    or kind in ('refund'::public.payment_transaction_kind, 'release'::public.payment_transaction_kind));

-- -----------------------------------------------------------------------------
-- 5. payment_events
-- -----------------------------------------------------------------------------
alter table public.payment_events drop constraint payment_events_type_valid;
alter table public.payment_events
  add constraint payment_events_type_valid check (event_type in (
    'intent_created', 'funding_requested', 'funding_confirmed',
    'release_requested', 'release_confirmed', 'failed', 'cancelled',
    'reconciliation_opened', 'reconciliation_resolved',
    'release_blocked_by_dispute', 'release_unblocked',
    'retry_requested',
    'settlement_requested', 'settlement_transaction_confirmed',
    'settlement_transaction_failed', 'settlement_confirmed',
    'release_cancelled_by_settlement', 'funding_cancelled_by_decision',
    'recovery_registered', 'recovery_confirmed', 'recovery_written_off',
    'cancelled_unpaid_settlement'));

-- -----------------------------------------------------------------------------
-- 6. payment_recoveries  -  obrigacao registrada, NAO dinheiro devolvido
-- -----------------------------------------------------------------------------
create table public.payment_recoveries (
  id                   uuid        primary key default gen_random_uuid(),
  intent_id            uuid        not null,
  dispute_decision_id  uuid        not null,
  case_id              uuid        not null,
  debtor_kind          text        not null,
  debtor_company_id    uuid        null,
  creditor_company_id  uuid        not null,
  currency_code        text        not null,
  expected_amount      numeric     not null,
  status               text        not null default 'open',
  external_reference   text        null,
  evidence_ref         text        null,
  evidence_hash        text        null,
  evidence_size_bytes  bigint      null,
  evidence_etag        text        null,
  evidence_mime        text        null,
  confirmed_by         uuid        null,
  confirmed_at         timestamptz null,
  write_off_note       text        null,
  written_off_by       uuid        null,
  written_off_at       timestamptz null,
  registered_by        uuid        not null,
  registered_at        timestamptz not null default now(),
  note                 text        null,

  constraint payment_recoveries_debtor_valid check (debtor_kind in ('carrier', 'platform')),
  constraint payment_recoveries_debtor_company_coherent
    check ((debtor_kind = 'platform') = (debtor_company_id is null)),
  constraint payment_recoveries_amount_positive check (expected_amount > 0),
  constraint payment_recoveries_amount_scale check (scale(expected_amount) <= 2),
  constraint payment_recoveries_amount_magnitude check (abs(expected_amount) < 100000000000000),
  constraint payment_recoveries_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint payment_recoveries_status_valid check (status in ('open', 'confirmed', 'written_off')),
  constraint payment_recoveries_status_coherent check (
    case status
      when 'open' then external_reference is null and evidence_ref is null and evidence_hash is null
                      and evidence_size_bytes is null and evidence_etag is null and evidence_mime is null
                      and confirmed_by is null and confirmed_at is null
                      and write_off_note is null and written_off_by is null and written_off_at is null
      when 'confirmed' then external_reference is not null and length(btrim(external_reference)) > 0
                      and evidence_ref is not null and evidence_hash ~ '^[0-9a-f]{64}$'
                      and evidence_size_bytes between 1 and 10485760
                      and evidence_etag is not null and length(btrim(evidence_etag)) > 0
                      and evidence_mime in ('application/pdf', 'image/jpeg', 'image/png')
                      and confirmed_by is not null and confirmed_at is not null
                      and write_off_note is null and written_off_by is null and written_off_at is null
      when 'written_off' then write_off_note is not null and length(btrim(write_off_note)) >= 20
                      and written_off_by is not null and written_off_at is not null
                      and external_reference is null and evidence_ref is null and evidence_hash is null
                      and evidence_size_bytes is null and evidence_etag is null and evidence_mime is null
                      and confirmed_by is null and confirmed_at is null
      else false end),
  constraint payment_recoveries_one_per_decision_debtor unique (dispute_decision_id, debtor_kind)
);

alter table public.payment_recoveries
  add constraint payment_recoveries_intent_fk
  foreign key (intent_id) references public.payment_intents(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_decision_fk
  foreign key (dispute_decision_id) references public.dispute_decisions(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_debtor_company_fk
  foreign key (debtor_company_id) references public.companies(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_creditor_company_fk
  foreign key (creditor_company_id) references public.companies(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_confirmed_by_fk
  foreign key (confirmed_by) references auth.users(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_written_off_by_fk
  foreign key (written_off_by) references auth.users(id) on delete restrict;
alter table public.payment_recoveries
  add constraint payment_recoveries_registered_by_fk
  foreign key (registered_by) references auth.users(id) on delete restrict;

create index payment_recoveries_case_idx on public.payment_recoveries (case_id);
create index payment_recoveries_status_idx on public.payment_recoveries (status, registered_at desc);

-- Transicao GOVERNADA: estruturais imutaveis; open -> confirmed preenche so os
-- campos de confirmacao; open -> written_off so os de baixa; terminais
-- imutaveis (logo confirmed <-> written_off e impossivel); DELETE proibido.
create function public.payment_recoveries_governed_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'public.payment_recoveries: obrigacao nao e apagada.';
  end if;
  if NEW.intent_id is distinct from OLD.intent_id
     or NEW.dispute_decision_id is distinct from OLD.dispute_decision_id
     or NEW.case_id is distinct from OLD.case_id
     or NEW.debtor_kind is distinct from OLD.debtor_kind
     or NEW.debtor_company_id is distinct from OLD.debtor_company_id
     or NEW.creditor_company_id is distinct from OLD.creditor_company_id
     or NEW.currency_code is distinct from OLD.currency_code
     or NEW.expected_amount is distinct from OLD.expected_amount
     or NEW.registered_by is distinct from OLD.registered_by
     or NEW.registered_at is distinct from OLD.registered_at then
    raise exception using errcode = '42501',
      message = 'public.payment_recoveries: campos estruturais sao imutaveis.';
  end if;
  if OLD.status <> 'open' then
    raise exception using errcode = '42501',
      message = format('public.payment_recoveries: obrigacao em %s e imutavel.', OLD.status);
  end if;
  if NEW.status = 'confirmed' then
    if NEW.write_off_note is not null or NEW.written_off_by is not null or NEW.written_off_at is not null then
      raise exception using errcode = '42501',
        message = 'public.payment_recoveries: confirmacao nao preenche campos de baixa.';
    end if;
  elsif NEW.status = 'written_off' then
    if NEW.external_reference is not null or NEW.evidence_ref is not null or NEW.evidence_hash is not null
       or NEW.evidence_size_bytes is not null or NEW.evidence_etag is not null or NEW.evidence_mime is not null
       or NEW.confirmed_by is not null or NEW.confirmed_at is not null then
      raise exception using errcode = '42501',
        message = 'public.payment_recoveries: baixa nao preenche campos de confirmacao.';
    end if;
  else
    raise exception using errcode = '42501',
      message = 'public.payment_recoveries: transicao invalida a partir de open.';
  end if;
  return NEW;
end;
$fn$;
create trigger payment_recoveries_governed_update_trg
  before update or delete on public.payment_recoveries
  for each row execute function public.payment_recoveries_governed_update();

alter table public.payment_recoveries enable row level security;
revoke all on public.payment_recoveries from public, anon, authenticated, service_role;
grant select on public.payment_recoveries to service_role;

comment on table public.payment_recoveries is
  'Obrigacoes de recuperacao apos decisao de disputa sobre pagamento JA '
  'repassado: a transportadora deve (G-F)-C_final, a SteelGo deve F-F_final. '
  'Registrar a obrigacao NAO significa que o valor voltou: so a confirmacao com '
  'comprovante atestado, ou a baixa justificada, encerra a obrigacao.';

alter table public.dispute_events
  add constraint dispute_events_recovery_fk
  foreign key (recovery_id) references public.payment_recoveries(id) on delete restrict;

-- escrita direta nas tabelas do ledger: tambem service_role fora (politica)
revoke insert, update, delete, truncate on
  public.payment_intents, public.payment_transactions, public.payment_allocations,
  public.payment_events, public.external_reconciliation
  from service_role;

-- -----------------------------------------------------------------------------
-- 7. bucket payment-evidence: refund e recovery
-- -----------------------------------------------------------------------------
drop policy payment_evidence_insert_admin on storage.objects;
create policy payment_evidence_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-evidence'
    and public.has_role((select auth.uid()), 'admin'::public.app_role)
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(funding|release|refund|recovery)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$'
  );

-- -----------------------------------------------------------------------------
-- 8. helper unico de comprovante financeiro
-- -----------------------------------------------------------------------------
-- p_subject_id: id da transacao (funding|release|refund) ou da obrigacao de
-- recuperacao (recovery). O segundo segmento do caminho tem de ser esse id.
create function public.assert_financial_evidence(
  p_contract_id   uuid,
  p_subject_id    uuid,
  p_kind          text,
  p_evidence_ref  text,
  p_evidence_hash text
)
returns table (etag text, size_bytes bigint, mime text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_o      record;
  v_name   text;
  v_pat    text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                || '(funding|release|refund|recovery)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-'
                || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-'
                || '[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$';
  v_size   bigint;
  v_mime   text;
  v_etag   text;
begin
  if p_kind is null or p_kind not in ('funding', 'release', 'refund', 'recovery') then
    raise exception using errcode = '22023',
      message = 'comprovante: tipo de comprovante desconhecido';
  end if;
  if p_contract_id is null or p_subject_id is null then
    raise exception using errcode = '22023',
      message = 'comprovante: contrato e objeto da atestacao sao obrigatorios';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'comprovante: referencia e hash sha-256 (64 hex) sao obrigatorios';
  end if;
  if p_evidence_ref !~ v_pat then
    raise exception using errcode = '22023',
      message = 'comprovante: caminho fora do padrao exigido para payment-evidence';
  end if;

  select o.name, o.path_tokens, o.metadata, o.user_metadata
    into v_o
    from storage.objects o
   where o.bucket_id = 'payment-evidence' and o.name = p_evidence_ref;
  if not found then
    raise exception using errcode = '22023',
      message = 'comprovante: objeto nao encontrado no bucket payment-evidence. '
                'A atestacao NAO foi registrada.';
  end if;

  if v_o.path_tokens[1] is distinct from p_contract_id::text then
    raise exception using errcode = '22023',
      message = 'comprovante: o caminho nao pertence a este contrato';
  end if;
  if v_o.path_tokens[2] is distinct from p_subject_id::text then
    raise exception using errcode = '22023',
      message = 'comprovante: o caminho nao pertence ao objeto que esta sendo confirmado';
  end if;
  v_name := v_o.path_tokens[3];
  if v_name !~ ('^' || p_kind || '-') then
    raise exception using errcode = '22023',
      message = format('comprovante: o arquivo e de %s, mas a atestacao e de %s',
                       split_part(v_name, '-', 1), p_kind);
  end if;
  if position(('-' || substr(p_evidence_hash, 1, 16) || '.') in v_name) = 0 then
    raise exception using errcode = '22023',
      message = 'comprovante: o nome do arquivo nao carrega o prefixo do hash declarado';
  end if;
  if (v_o.user_metadata ->> 'sha256') is distinct from p_evidence_hash then
    raise exception using errcode = '22023',
      message = 'comprovante: o sha-256 declarado no upload difere do declarado na '
                'atestacao. Nada foi registrado.';
  end if;

  v_mime := v_o.metadata ->> 'mimetype';
  if v_mime is null or v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception using errcode = '22023',
      message = format('comprovante: tipo registrado pelo Storage nao permitido (%s)',
                       coalesce(v_mime, 'ausente'));
  end if;
  begin
    v_size := (v_o.metadata ->> 'size')::bigint;
  exception when others then
    v_size := null;
  end;
  if v_size is null or v_size < 1 or v_size > 10485760 then
    raise exception using errcode = '22023',
      message = format('comprovante: tamanho observado pelo Storage invalido (%s)',
                       coalesce(v_size::text, 'ausente'));
  end if;
  v_etag := nullif(btrim(coalesce(v_o.metadata ->> 'eTag', '')), '');
  if v_etag is null then
    raise exception using errcode = '22023',
      message = 'comprovante: o Storage nao registrou identificador (eTag) para o objeto';
  end if;

  return query select v_etag, v_size, v_mime;
end;
$fn$;

-- mesma assinatura e comportamento da 20260912100300; agora delega
create or replace function public.assert_payment_evidence(
  p_contract_id    uuid,
  p_transaction_id uuid,
  p_kind           public.payment_transaction_kind,
  p_evidence_ref   text,
  p_evidence_hash  text
)
returns table (etag text, size_bytes bigint, mime text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select * from public.assert_financial_evidence(
    p_contract_id, p_transaction_id, p_kind::text, p_evidence_ref, p_evidence_hash)
$fn$;

revoke all on function public.assert_financial_evidence(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.assert_payment_evidence(uuid, uuid, public.payment_transaction_kind, text, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. assertivas
-- -----------------------------------------------------------------------------
do $$
declare v_n int; v_def text;
begin
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'payment_evidence_%';
  if v_n <> 2 then raise exception 'payment-evidence: esperadas 2 policies, ha %', v_n; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and cmd in ('UPDATE', 'DELETE')
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%payment-evidence%') then
    raise exception 'payment-evidence: policy de UPDATE/DELETE encontrada';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname = 'contract_lifecycle_events_transition_matrix';
  if v_def not like '%escrow_settlement_confirmed%' or v_def not like '%dispute_withdrawn%' then
    raise exception 'matriz de lifecycle sem as transicoes novas';
  end if;
  foreach v_def in array array['assert_financial_evidence', 'assert_payment_evidence'] loop
    if exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.pronamespace = 'public'::regnamespace and p.proname = v_def
                  and a.privilege_type = 'EXECUTE'
                  and (a.grantee = 0 or a.grantee::regrole::text <> 'postgres')) then
      raise exception '%: EXECUTE alem de postgres', v_def;
    end if;
  end loop;
  foreach v_def in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_def, 'public.payment_recoveries', 'INSERT')
       or has_table_privilege(v_def, 'public.payment_recoveries', 'UPDATE')
       or has_table_privilege(v_def, 'public.payment_recoveries', 'DELETE')
       or has_table_privilege(v_def, 'public.payment_recoveries', 'TRUNCATE') then
      raise exception 'payment_recoveries: % com DML direto', v_def;
    end if;
  end loop;
end $$;

commit;
