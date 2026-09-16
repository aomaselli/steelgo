-- =============================================================================
-- MODULO 2 (8/9) : LIQUIDACAO, APORTE DA DECISAO, RECUPERACAO E CANCELAMENTO
-- =============================================================================
-- Toda a matematica vem da DECISAO (gross_amount, original_platform_fee,
-- shipper_amount, release_amount, carrier_final, platform_fee_final): nada e
-- recalculado a partir de um contrato que possa ter mudado depois.
--
--   settle_dispute_decision      cria refund S e/ou release R (requested);
--                                cancela liberacao pendente incompativel;
--                                intent -> settlement_requested;
--   confirm_dispute_settlement   atesta UMA transacao com comprovante; quando
--                                todas as necessarias estao confirmadas,
--                                intent -> settled (settled_at), contrato
--                                escrow 'settled', caso 'settled';
--   fail_/retry_dispute_settlement_transaction  falha e refazimento por
--                                transacao (o intent permanece
--                                settlement_requested);
--   confirm_/write_off_dispute_recovery  obrigacoes apos repasse;
--   cancel_contract_for_unpaid_settlement  inadimplencia apos o prazo, SO com
--                                previous_contract_status = active;
--   request_escrow_funding       (mesma assinatura) aceita contrato 'disputed'
--                                SOMENTE com caso decidido em pending_funding,
--                                e solicita o valor R;
--   confirm_escrow_funding       (mesma assinatura) carimba eventos com o valor
--                                da transacao, nao com o bruto;
--   try_complete_contract        (mesma assinatura) aceita 'settled'.
-- Ordem global de locks: contracts -> payment_intents -> payment_transactions
-- -> dispute_cases -> obrigacoes.
-- =============================================================================

begin;

-- =============================================================================
-- 1. settle_dispute_decision
-- =============================================================================
create function public.settle_dispute_decision(
  p_case_id    uuid,
  p_request_id uuid
)
returns table (
  case_id                  uuid,
  intent_id                uuid,
  refund_transaction_id    uuid,
  release_transaction_id   uuid,
  refund_amount            numeric,
  release_amount           numeric,
  carrier_amount           numeric,
  platform_amount          numeric,
  cancelled_transaction_id uuid,
  new_internal_status      public.payment_internal_status,
  was_replayed             boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor  uuid := public.require_steelgo_admin('settle_dispute_decision');
  v_case   public.dispute_cases%rowtype;
  v_c      public.contracts%rowtype;
  v_i      public.payment_intents%rowtype;
  v_dec    public.dispute_decisions%rowtype;
  v_fp     text;
  v_log    public.rpc_call_log%rowtype;
  v_pend   public.payment_transactions%rowtype;
  v_refund uuid := null;
  v_rel    uuid := null;
  v_cancel uuid := null;
  v_funded_r boolean;
  v_note   text;
begin
  if p_case_id is null then
    raise exception using errcode = '22004',
      message = 'settle_dispute_decision: p_case_id e obrigatorio';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('case_id', p_case_id));
  v_log := public.rpc_idempotency_probe('settle_dispute_decision', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    select * into v_dec from public.dispute_decisions d where d.case_id = p_case_id and d.is_current;
    select * into v_i from public.payment_intents pi where pi.contract_id = v_case.contract_id;
    select t.id into v_refund from public.payment_transactions t
     where t.dispute_decision_id = v_dec.id and t.kind = 'refund' and t.status <> 'cancelled' order by t.requested_at desc limit 1;
    select t.id into v_rel from public.payment_transactions t
     where t.dispute_decision_id = v_dec.id and t.kind = 'release' and t.status <> 'cancelled' order by t.requested_at desc limit 1;
    return query select p_case_id, v_i.id, v_refund, v_rel,
                        case when v_i.settlement_funding_amount is null then v_dec.shipper_amount else 0 end,
                        v_dec.release_amount, v_dec.carrier_final, v_dec.platform_fee_final,
                        null::uuid, v_i.internal_status, true;
    return;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'settle_dispute_decision: caso inexistente';
  end if;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id for update;
  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;

  if v_case.status <> 'decided'::public.dispute_status then
    raise exception using errcode = '22023',
      message = format('settle_dispute_decision: caso em %s; so caso decidido e liquidado', v_case.status);
  end if;
  if v_case.assigned_to is distinct from v_actor then
    raise exception using errcode = '42501',
      message = 'settle_dispute_decision: somente o administrador atribuido liquida a decisao';
  end if;
  if v_case.settlement_state not in ('settlement_pending', 'pending_funding') then
    raise exception using errcode = '22023',
      message = format('settle_dispute_decision: liquidacao em %s; nada a solicitar', v_case.settlement_state);
  end if;
  select * into v_dec from public.dispute_decisions d where d.case_id = p_case_id and d.is_current;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'settle_dispute_decision: caso decidido sem decisao vigente';
  end if;
  if v_i.id is null then
    raise exception using errcode = 'P0002',
      message = 'settle_dispute_decision: nao existe intencao de pagamento';
  end if;
  if v_i.internal_status = 'reconciliation_required'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = 'settle_dispute_decision: pagamento em reconciliacao; resolva-a antes';
  end if;
  if v_i.funding_confirmed_at is null
     or v_i.internal_status not in ('funding_confirmed'::public.payment_internal_status,
                                    'release_requested'::public.payment_internal_status,
                                    'failed'::public.payment_internal_status) then
    raise exception using errcode = '22023',
      message = format('settle_dispute_decision: pagamento em %s sem aporte confirmado; aguardando '
                       'aporte%s', v_i.internal_status,
                       case when v_case.settlement_state = 'pending_funding'
                            then format(' de R$ %s ate %s', v_dec.release_amount, v_case.settlement_due_at) else '' end);
  end if;
  -- aporte da decisao (R) ja confirmado? entao S nunca saiu do embarcador
  v_funded_r := v_i.settlement_funding_amount is not null;
  if v_case.settlement_state = 'pending_funding' and not v_funded_r then
    raise exception using errcode = '22023',
      message = 'settle_dispute_decision: estado incoerente - pending_funding sem aporte da decisao';
  end if;

  -- liberacao pendente incompativel: cancelada de forma auditavel
  select * into v_pend from public.payment_transactions t
   where t.intent_id = v_i.id
     and t.status in ('requested'::public.payment_transaction_status,
                      'pending_provider'::public.payment_transaction_status)
   order by t.requested_at desc limit 1 for update;
  if v_pend.id is not null then
    if v_pend.kind <> 'release'::public.payment_transaction_kind then
      raise exception using errcode = '22023',
        message = format('settle_dispute_decision: transacao pendente de %s; estado ambiguo', v_pend.kind);
    end if;
    update public.payment_transactions t
       set status = 'cancelled',
           external_status = format('cancelled_by_settlement: liberacao integral substituida pela liquidacao da decisao %s', v_dec.id)
     where t.id = v_pend.id;
    v_cancel := v_pend.id;
    perform public.payment_event_append(
      v_i.id, 'release_cancelled_by_settlement', v_i.internal_status, v_pend.id, null,
      v_pend.amount, v_i.currency_code, 'admin', v_actor, 'admin', null, null, null, null,
      format('Liberacao %s cancelada: a decisao %s do caso %s liquida o pagamento por refund/release.',
             v_pend.id, v_dec.id, v_case.case_number),
      'settle_dispute_decision', p_request_id, v_fp);
  end if;

  -- refund S (so se o aporte foi integral) e release R
  if v_dec.shipper_amount > 0 and not v_funded_r then
    insert into public.payment_transactions (
      intent_id, kind, status, currency_code, amount, provider_code, requested_by, idempotency_key,
      dispute_decision_id)
    values (v_i.id, 'refund', 'requested', v_i.currency_code, v_dec.shipper_amount, v_i.provider_code,
            v_actor, p_request_id, v_dec.id)
    returning id into v_refund;
    insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
    values (v_refund, 'shipper', v_c.shipper_company_id, v_dec.shipper_amount,
            format('Devolucao ao embarcador decidida no caso %s.', v_case.case_number));
  end if;
  if v_dec.release_amount > 0 then
    insert into public.payment_transactions (
      intent_id, kind, status, currency_code, amount, provider_code, requested_by, idempotency_key,
      dispute_decision_id)
    values (v_i.id, 'release', 'requested', v_i.currency_code, v_dec.release_amount, v_i.provider_code,
            v_actor, gen_random_uuid(), v_dec.id)
    returning id into v_rel;
    if v_dec.platform_fee_final > 0 then
      insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
      values (v_rel, 'platform', null, v_dec.platform_fee_final,
              'Taxa proporcional ao valor liberado (decisao de disputa).');
    end if;
    if v_dec.carrier_final > 0 then
      insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
      values (v_rel, 'carrier', v_c.carrier_company_id, v_dec.carrier_final,
              format('Repasse a transportadora decidido no caso %s.', v_case.case_number));
    end if;
  end if;
  if v_refund is null and v_rel is null then
    raise exception using errcode = '22023',
      message = 'settle_dispute_decision: nenhuma transacao a criar; estado incoerente';
  end if;

  update public.payment_intents pi
     set settlement_decision_id = v_dec.id,
         settlement_refund_amount = v_dec.shipper_amount,
         settlement_release_amount = v_dec.release_amount,
         release_blocked_by_dispute = false,
         release_requested_by = case when v_rel is null then pi.release_requested_by else v_actor end,
         release_requested_at = case when v_rel is null then pi.release_requested_at else now() end
   where pi.id = v_i.id;

  v_note := format('Liquidacao da decisao %s (caso %s): refund R$ %s%s, release R$ %s (transportadora %s, '
                   'plataforma %s). Nenhum valor confirmado ainda.',
                   v_dec.id, v_case.case_number, v_dec.shipper_amount,
                   case when v_funded_r then ' (nao movimentado: nunca saiu do embarcador)' else '' end,
                   v_dec.release_amount, v_dec.carrier_final, v_dec.platform_fee_final);
  perform public.payment_event_append(
    v_i.id, 'settlement_requested', 'settlement_requested'::public.payment_internal_status,
    coalesce(v_rel, v_refund), null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', null, null, null, null, v_note,
    'settle_dispute_decision', p_request_id, v_fp);
  perform public.contract_lifecycle_append(
    v_c.id, 'escrow_settlement_requested'::public.contract_lifecycle_transition,
    v_c.status, 'settlement_requested', null, null, v_i.id, p_case_id, v_dec.decided_amount,
    v_actor, 'admin', 'Liquidacao da decisao de disputa solicitada.',
    'settle_dispute_decision', p_request_id, v_fp);

  update public.dispute_cases d
     set settlement_state = 'requested', settlement_due_at = null, updated_at = now()
   where d.id = p_case_id;
  perform public.dispute_event_append(
    p_case_id, 'settlement_requested', v_case.status, v_dec.id, null, null, v_actor, 'admin', v_note,
    'settle_dispute_decision', p_request_id, v_fp, null, coalesce(v_rel, v_refund), null);

  perform public.notify_dispute_case(
    p_case_id, 'dispute_settlement', format('Liquidacao solicitada no caso %s', v_case.case_number),
    format('A Equipe SteelGo solicitou a liquidacao da decisao: devolucao R$ %s, liberacao R$ %s. '
           'Nada foi confirmado ainda.', v_dec.shipper_amount, v_dec.release_amount),
    v_actor, false);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('settle_dispute_decision', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('refund %s, release %s, cancelada %s', v_refund, v_rel, v_cancel));

  return query select p_case_id, v_i.id, v_refund, v_rel,
                      case when v_funded_r then 0 else v_dec.shipper_amount end,
                      v_dec.release_amount, v_dec.carrier_final, v_dec.platform_fee_final,
                      v_cancel, 'settlement_requested'::public.payment_internal_status, false;
end;
$fn$;

-- =============================================================================
-- 2. confirm_dispute_settlement  -  atesta UMA transacao da liquidacao
-- =============================================================================
create function public.confirm_dispute_settlement(
  p_contract_id        uuid,
  p_transaction_id     uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (
  contract_id         uuid,
  transaction_id      uuid,
  transaction_kind    public.payment_transaction_kind,
  new_internal_status public.payment_internal_status,
  settlement_complete boolean,
  was_replayed        boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('confirm_dispute_settlement');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_case  public.dispute_cases%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_etag  text; v_size bigint; v_mime text;
  v_now   timestamptz := now();
  v_open  integer;
  v_done  boolean := false;
begin
  if p_contract_id is null or p_transaction_id is null then
    raise exception using errcode = '22004',
      message = 'confirm_dispute_settlement: contrato e transacao sao obrigatorios';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) = 0 then
    raise exception using errcode = '22023',
      message = 'confirm_dispute_settlement: referencia externa e obrigatoria';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'confirm_dispute_settlement: nota da atestacao precisa de ao menos 10 caracteres';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'confirm_dispute_settlement: comprovante e obrigatorio (referencia e sha-256 de 64 hex)';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'transaction_id', p_transaction_id,
    'external_reference', p_external_reference, 'evidence_hash', p_evidence_hash));
  v_log := public.rpc_idempotency_probe('confirm_dispute_settlement', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    select * into v_tx from public.payment_transactions t where t.id = p_transaction_id;
    return query select p_contract_id, p_transaction_id, v_tx.kind, v_i.internal_status,
                        v_i.internal_status = 'settled'::public.payment_internal_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_dispute_settlement: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_dispute_settlement: nao existe intencao de pagamento';
  end if;
  select * into v_tx from public.payment_transactions t where t.id = p_transaction_id for update;
  if not found or v_tx.intent_id <> v_i.id then
    raise exception using errcode = 'P0002',
      message = 'confirm_dispute_settlement: transacao inexistente neste contrato';
  end if;
  select * into v_case from public.dispute_cases d where d.contract_id = p_contract_id for update;

  if v_i.internal_status <> 'settlement_requested'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('confirm_dispute_settlement: pagamento em %s; a atestacao so parte de '
                       'settlement_requested', v_i.internal_status);
  end if;
  if v_tx.dispute_decision_id is null or v_tx.dispute_decision_id <> v_i.settlement_decision_id then
    raise exception using errcode = '22023',
      message = 'confirm_dispute_settlement: a transacao nao pertence a liquidacao vigente';
  end if;
  if v_tx.status <> 'requested'::public.payment_transaction_status then
    raise exception using errcode = '22023',
      message = format('confirm_dispute_settlement: transacao em %s; so solicitada e atestada', v_tx.status);
  end if;

  select f.etag, f.size_bytes, f.mime into v_etag, v_size, v_mime
    from public.assert_financial_evidence(p_contract_id, v_tx.id, v_tx.kind::text, p_evidence_ref, p_evidence_hash) f;

  update public.payment_transactions t
     set status = 'confirmed', confirmed_by = v_actor, confirmed_at = v_now,
         confirmation_method = 'manual_admin', confirmation_note = p_note,
         confirmation_evidence_ref = p_evidence_ref, confirmation_evidence_hash = p_evidence_hash,
         external_reference = p_external_reference,
         confirmation_evidence_size_bytes = v_size, confirmation_evidence_etag = v_etag,
         confirmation_evidence_mime = v_mime
   where t.id = v_tx.id and t.status = 'requested';
  if not found then
    raise exception using errcode = '40001',
      message = 'confirm_dispute_settlement: a transacao mudou de estado durante a operacao';
  end if;

  perform public.payment_event_append(
    v_i.id, 'settlement_transaction_confirmed', v_i.internal_status, v_tx.id, null,
    v_tx.amount, v_i.currency_code, 'admin', v_actor, 'admin', 'manual_admin', p_external_reference,
    null, null, format('%s de R$ %s ATESTADO por administrador. %s', v_tx.kind, v_tx.amount, p_note),
    'confirm_dispute_settlement', p_request_id, v_fp);
  perform public.dispute_event_append(
    v_case.id, 'settlement_transaction_confirmed', v_case.status, v_tx.dispute_decision_id, null, null,
    v_actor, 'admin', format('%s de R$ %s atestado.', v_tx.kind, v_tx.amount),
    'confirm_dispute_settlement', p_request_id, v_fp, null, v_tx.id, null);

  -- COMPLETA quando cada transacao NECESSARIA (refund se S>0 e aporte integral;
  -- release se R>0) tem uma confirmacao. Uma tentativa falhada e substituida
  -- por retry nao impede a conclusao; uma falhada sem retry impede.
  select count(*) into v_open from (
    select 'refund' as k where v_i.settlement_refund_amount > 0 and v_i.settlement_funding_amount is null
    union all
    select 'release' where v_i.settlement_release_amount > 0) need
   where not exists (select 1 from public.payment_transactions t
                      where t.dispute_decision_id = v_i.settlement_decision_id
                        and t.kind::text = need.k
                        and t.status = 'confirmed'::public.payment_transaction_status);
  if v_open = 0 then
    v_done := true;
    update public.payment_intents pi set settled_at = v_now where pi.id = v_i.id;
    perform public.payment_event_append(
      v_i.id, 'settlement_confirmed', 'settled'::public.payment_internal_status, v_tx.id, null,
      v_i.gross_amount, v_i.currency_code, 'admin', v_actor, 'admin', null, null, null, null,
      format('Liquidacao da decisao %s confirmada integralmente (refund %s, release %s).',
             v_i.settlement_decision_id, v_i.settlement_refund_amount, v_i.settlement_release_amount),
      'confirm_dispute_settlement', p_request_id, v_fp);
    perform public.contract_lifecycle_append(
      p_contract_id, 'escrow_settlement_confirmed'::public.contract_lifecycle_transition,
      v_c.status, 'settled', null, v_now, v_i.id, v_case.id, v_i.gross_amount,
      v_actor, 'admin', 'Liquidacao da decisao de disputa confirmada.',
      'confirm_dispute_settlement', p_request_id, v_fp);
    update public.dispute_cases d set settlement_state = 'settled', updated_at = now() where d.id = v_case.id;
    perform public.dispute_event_append(
      v_case.id, 'settlement_confirmed', v_case.status, v_tx.dispute_decision_id, null, null,
      v_actor, 'admin', 'Liquidacao confirmada integralmente.',
      'confirm_dispute_settlement', p_request_id, v_fp);
    perform public.notify_dispute_case(
      v_case.id, 'dispute_settlement', format('Liquidacao confirmada no caso %s', v_case.case_number),
      'Todas as transacoes da liquidacao foram atestadas com comprovante.', v_actor, false);
  else
    perform public.notify_dispute_case(
      v_case.id, 'dispute_settlement', format('Transacao atestada no caso %s', v_case.case_number),
      format('%s de R$ %s atestado. Restam %s transacao(oes) da liquidacao.', v_tx.kind, v_tx.amount, v_open),
      v_actor, false);
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_dispute_settlement', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('%s %s atestado; liquidacao %s', v_tx.kind, v_tx.id,
                 case when v_done then 'COMPLETA' else 'parcial' end));

  return query select p_contract_id, v_tx.id, v_tx.kind,
                      case when v_done then 'settled'::public.payment_internal_status
                           else 'settlement_requested'::public.payment_internal_status end,
                      v_done, false;
end;
$fn$;

-- =============================================================================
-- 3. falha e refazimento de transacao da liquidacao
-- =============================================================================
create function public.fail_dispute_settlement_transaction(
  p_contract_id    uuid,
  p_transaction_id uuid,
  p_failure_code   text,
  p_failure_reason text,
  p_request_id     uuid
)
returns table (contract_id uuid, transaction_id uuid, new_status public.payment_transaction_status, was_replayed boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('fail_dispute_settlement_transaction');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_case  public.dispute_cases%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if p_failure_code is null or length(btrim(p_failure_code)) = 0
     or p_failure_reason is null or length(btrim(p_failure_reason)) < 10 then
    raise exception using errcode = '22023',
      message = 'fail_dispute_settlement_transaction: codigo e motivo da falha sao obrigatorios';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'transaction_id', p_transaction_id, 'failure_code', p_failure_code));
  v_log := public.rpc_idempotency_probe('fail_dispute_settlement_transaction', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_tx from public.payment_transactions t where t.id = p_transaction_id;
    return query select p_contract_id, p_transaction_id, v_tx.status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'fail_dispute_settlement_transaction: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id for update;
  select * into v_tx from public.payment_transactions t where t.id = p_transaction_id for update;
  if not found or v_tx.intent_id is distinct from v_i.id then
    raise exception using errcode = 'P0002', message = 'fail_dispute_settlement_transaction: transacao inexistente neste contrato';
  end if;
  select * into v_case from public.dispute_cases d where d.contract_id = p_contract_id for update;
  if v_i.internal_status <> 'settlement_requested'::public.payment_internal_status
     or v_tx.dispute_decision_id is distinct from v_i.settlement_decision_id then
    raise exception using errcode = '22023',
      message = 'fail_dispute_settlement_transaction: a transacao nao e uma solicitacao de liquidacao vigente';
  end if;
  if v_tx.status <> 'requested'::public.payment_transaction_status then
    raise exception using errcode = '22023',
      message = format('fail_dispute_settlement_transaction: transacao em %s', v_tx.status);
  end if;

  update public.payment_transactions t
     set status = 'failed', failure_code = p_failure_code, failure_reason = p_failure_reason
   where t.id = v_tx.id;
  perform public.payment_event_append(
    v_i.id, 'settlement_transaction_failed', v_i.internal_status, v_tx.id, null, v_tx.amount, v_i.currency_code,
    'admin', v_actor, 'admin', null, null, null, null,
    format('%s de R$ %s FALHOU: %s - %s. O intent permanece em settlement_requested; refazer.',
           v_tx.kind, v_tx.amount, p_failure_code, p_failure_reason),
    'fail_dispute_settlement_transaction', p_request_id, v_fp);
  perform public.dispute_event_append(
    v_case.id, 'settlement_transaction_failed', v_case.status, v_tx.dispute_decision_id, null, null,
    v_actor, 'admin', format('%s de R$ %s falhou: %s', v_tx.kind, v_tx.amount, p_failure_code),
    'fail_dispute_settlement_transaction', p_request_id, v_fp, null, v_tx.id, null);
  perform public.notify_dispute_case(
    v_case.id, 'dispute_settlement', format('Falha na liquidacao do caso %s', v_case.case_number),
    format('%s de R$ %s falhou (%s). A Equipe SteelGo vai refazer a solicitacao.', v_tx.kind, v_tx.amount, p_failure_code),
    v_actor, false);
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('fail_dispute_settlement_transaction', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('%s %s falhou: %s', v_tx.kind, v_tx.id, p_failure_code));
  return query select p_contract_id, v_tx.id, 'failed'::public.payment_transaction_status, false;
end;
$fn$;

create function public.retry_dispute_settlement_transaction(
  p_contract_id           uuid,
  p_failed_transaction_id uuid,
  p_note                  text,
  p_request_id            uuid
)
returns table (contract_id uuid, failed_transaction_id uuid, new_transaction_id uuid,
               transaction_kind public.payment_transaction_kind, was_replayed boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('retry_dispute_settlement_transaction');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_case  public.dispute_cases%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_new   uuid;
begin
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'retry_dispute_settlement_transaction: nota precisa de ao menos 10 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'failed_transaction_id', p_failed_transaction_id));
  v_log := public.rpc_idempotency_probe('retry_dispute_settlement_transaction', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_tx from public.payment_transactions t where t.id = p_failed_transaction_id;
    select t.id into v_new from public.payment_transactions t where t.idempotency_key = p_request_id;
    return query select p_contract_id, p_failed_transaction_id, v_new, v_tx.kind, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'retry_dispute_settlement_transaction: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id for update;
  select * into v_tx from public.payment_transactions t where t.id = p_failed_transaction_id for update;
  if not found or v_tx.intent_id is distinct from v_i.id then
    raise exception using errcode = 'P0002', message = 'retry_dispute_settlement_transaction: transacao inexistente neste contrato';
  end if;
  select * into v_case from public.dispute_cases d where d.contract_id = p_contract_id for update;
  if v_i.internal_status <> 'settlement_requested'::public.payment_internal_status
     or v_tx.dispute_decision_id is distinct from v_i.settlement_decision_id then
    raise exception using errcode = '22023',
      message = 'retry_dispute_settlement_transaction: a transacao nao pertence a liquidacao vigente';
  end if;
  if v_tx.status <> 'failed'::public.payment_transaction_status then
    raise exception using errcode = '22023',
      message = format('retry_dispute_settlement_transaction: transacao em %s, nao em failed', v_tx.status);
  end if;
  if exists (select 1 from public.payment_transactions t
              where t.dispute_decision_id = v_tx.dispute_decision_id and t.kind = v_tx.kind
                and t.status in ('requested', 'pending_provider', 'confirmed')) then
    raise exception using errcode = '22023',
      message = 'retry_dispute_settlement_transaction: ja existe transacao viva desse tipo para a decisao';
  end if;

  insert into public.payment_transactions (
    intent_id, kind, status, currency_code, amount, provider_code, requested_by, idempotency_key,
    dispute_decision_id)
  values (v_i.id, v_tx.kind, 'requested', v_tx.currency_code, v_tx.amount, v_tx.provider_code,
          v_actor, p_request_id, v_tx.dispute_decision_id)
  returning id into v_new;
  insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
  select v_new, a.party_kind, a.company_id, a.amount, coalesce(a.note, '') || ' (refeita apos falha)'
    from public.payment_allocations a where a.transaction_id = v_tx.id;

  perform public.payment_event_append(
    v_i.id, 'retry_requested', v_i.internal_status, v_new, null, v_tx.amount, v_i.currency_code,
    'admin', v_actor, 'admin', null, null, null, null,
    format('Nova solicitacao de %s (liquidacao) apos falha da transacao %s. %s', v_tx.kind, v_tx.id, p_note),
    'retry_dispute_settlement_transaction', p_request_id, v_fp);
  perform public.dispute_event_append(
    v_case.id, 'settlement_requested', v_case.status, v_tx.dispute_decision_id, null, null,
    v_actor, 'admin', format('%s de R$ %s solicitado novamente apos falha.', v_tx.kind, v_tx.amount),
    'retry_dispute_settlement_transaction', p_request_id, v_fp, null, v_new, null);
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('retry_dispute_settlement_transaction', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('%s refeito: falhada %s preservada, nova %s', v_tx.kind, v_tx.id, v_new));
  return query select p_contract_id, v_tx.id, v_new, v_tx.kind, false;
end;
$fn$;

-- =============================================================================
-- 4. recuperacoes: confirmar com comprovante ou baixar com justificativa
-- =============================================================================
create function public.confirm_dispute_recovery(
  p_recovery_id        uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (recovery_id uuid, new_status text, all_recoveries_closed boolean, was_replayed boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('confirm_dispute_recovery');
  v_r     public.payment_recoveries%rowtype;
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_case  public.dispute_cases%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_etag  text; v_size bigint; v_mime text;
  v_open  integer;
begin
  if p_recovery_id is null then
    raise exception using errcode = '22004', message = 'confirm_dispute_recovery: p_recovery_id e obrigatorio';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) = 0 then
    raise exception using errcode = '22023', message = 'confirm_dispute_recovery: referencia externa e obrigatoria';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023', message = 'confirm_dispute_recovery: nota precisa de ao menos 10 caracteres';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'confirm_dispute_recovery: comprovante e obrigatorio (referencia e sha-256 de 64 hex)';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'recovery_id', p_recovery_id, 'external_reference', p_external_reference, 'evidence_hash', p_evidence_hash));
  v_log := public.rpc_idempotency_probe('confirm_dispute_recovery', p_request_id, v_actor, p_recovery_id, v_fp);
  if v_log.id is not null then
    select * into v_r from public.payment_recoveries r where r.id = p_recovery_id;
    select count(*) into v_open from public.payment_recoveries r where r.case_id = v_r.case_id and r.status = 'open';
    return query select p_recovery_id, v_r.status, v_open = 0, true;
    return;
  end if;

  select * into v_r from public.payment_recoveries r where r.id = p_recovery_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'confirm_dispute_recovery: obrigacao inexistente';
  end if;
  select * into v_case from public.dispute_cases d where d.id = v_r.case_id;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.id = v_r.intent_id for update;
  select * into v_case from public.dispute_cases d where d.id = v_r.case_id for update;
  select * into v_r from public.payment_recoveries r where r.id = p_recovery_id for update;
  if v_r.status <> 'open' then
    raise exception using errcode = '22023',
      message = format('confirm_dispute_recovery: obrigacao em %s', v_r.status);
  end if;

  select f.etag, f.size_bytes, f.mime into v_etag, v_size, v_mime
    from public.assert_financial_evidence(v_c.id, v_r.id, 'recovery', p_evidence_ref, p_evidence_hash) f;

  update public.payment_recoveries r
     set status = 'confirmed', external_reference = p_external_reference,
         evidence_ref = p_evidence_ref, evidence_hash = p_evidence_hash,
         evidence_size_bytes = v_size, evidence_etag = v_etag, evidence_mime = v_mime,
         confirmed_by = v_actor, confirmed_at = now(), note = p_note
   where r.id = v_r.id;

  perform public.payment_event_append(
    v_i.id, 'recovery_confirmed', v_i.internal_status, null, null, v_r.expected_amount, v_r.currency_code,
    'admin', v_actor, 'admin', 'manual_admin', p_external_reference, null, null,
    format('Recuperacao de R$ %s (devedor %s) CONFIRMADA com comprovante. %s', v_r.expected_amount, v_r.debtor_kind, p_note),
    'confirm_dispute_recovery', p_request_id, v_fp);
  perform public.dispute_event_append(
    v_case.id, 'recovery_confirmed', v_case.status, v_r.dispute_decision_id, null, null,
    v_actor, 'admin', format('Recuperacao de R$ %s (%s) confirmada.', v_r.expected_amount, v_r.debtor_kind),
    'confirm_dispute_recovery', p_request_id, v_fp, null, null, v_r.id);

  select count(*) into v_open from public.payment_recoveries r where r.case_id = v_case.id and r.status = 'open';
  if v_open = 0 then
    update public.dispute_cases d set settlement_state = 'recovery_closed', updated_at = now() where d.id = v_case.id;
  end if;
  perform public.notify_dispute_case(
    v_case.id, 'dispute_settlement', format('Recuperacao confirmada no caso %s', v_case.case_number),
    format('Recuperacao de R$ %s (devedor: %s) confirmada com comprovante.%s', v_r.expected_amount,
           case v_r.debtor_kind when 'platform' then 'SteelGo' else 'transportadora' end,
           case when v_open = 0 then ' Todas as obrigacoes estao encerradas.' else '' end),
    v_actor, false);
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_dispute_recovery', p_request_id, v_actor, p_recovery_id, v_fp, 'accepted',
          format('recuperacao %s confirmada; abertas restantes %s', p_recovery_id, v_open));
  return query select p_recovery_id, 'confirmed'::text, v_open = 0, false;
end;
$fn$;

create function public.write_off_dispute_recovery(
  p_recovery_id uuid,
  p_note        text,
  p_request_id  uuid
)
returns table (recovery_id uuid, new_status text, all_recoveries_closed boolean, was_replayed boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('write_off_dispute_recovery');
  v_r     public.payment_recoveries%rowtype;
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_case  public.dispute_cases%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_open  integer;
begin
  if p_recovery_id is null then
    raise exception using errcode = '22004', message = 'write_off_dispute_recovery: p_recovery_id e obrigatorio';
  end if;
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023',
      message = 'write_off_dispute_recovery: justificativa da baixa precisa de ao menos 20 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('recovery_id', p_recovery_id));
  v_log := public.rpc_idempotency_probe('write_off_dispute_recovery', p_request_id, v_actor, p_recovery_id, v_fp);
  if v_log.id is not null then
    select * into v_r from public.payment_recoveries r where r.id = p_recovery_id;
    select count(*) into v_open from public.payment_recoveries r where r.case_id = v_r.case_id and r.status = 'open';
    return query select p_recovery_id, v_r.status, v_open = 0, true;
    return;
  end if;

  select * into v_r from public.payment_recoveries r where r.id = p_recovery_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'write_off_dispute_recovery: obrigacao inexistente';
  end if;
  select * into v_case from public.dispute_cases d where d.id = v_r.case_id;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.id = v_r.intent_id for update;
  select * into v_case from public.dispute_cases d where d.id = v_r.case_id for update;
  select * into v_r from public.payment_recoveries r where r.id = p_recovery_id for update;
  if v_r.status <> 'open' then
    raise exception using errcode = '22023',
      message = format('write_off_dispute_recovery: obrigacao em %s', v_r.status);
  end if;

  update public.payment_recoveries r
     set status = 'written_off', write_off_note = p_note, written_off_by = v_actor, written_off_at = now()
   where r.id = v_r.id;

  perform public.payment_event_append(
    v_i.id, 'recovery_written_off', v_i.internal_status, null, null, v_r.expected_amount, v_r.currency_code,
    'admin', v_actor, 'admin', null, null, null, null,
    format('Recuperacao de R$ %s (devedor %s) BAIXADA SEM DEVOLUCAO: %s', v_r.expected_amount, v_r.debtor_kind, p_note),
    'write_off_dispute_recovery', p_request_id, v_fp);
  perform public.dispute_event_append(
    v_case.id, 'recovery_written_off', v_case.status, v_r.dispute_decision_id, null, null,
    v_actor, 'admin', format('Recuperacao de R$ %s (%s) baixada sem devolucao: %s', v_r.expected_amount, v_r.debtor_kind, p_note),
    'write_off_dispute_recovery', p_request_id, v_fp, null, null, v_r.id);

  select count(*) into v_open from public.payment_recoveries r where r.case_id = v_case.id and r.status = 'open';
  if v_open = 0 then
    update public.dispute_cases d set settlement_state = 'recovery_closed', updated_at = now() where d.id = v_case.id;
  end if;
  perform public.notify_dispute_case(
    v_case.id, 'dispute_settlement', format('Recuperacao baixada no caso %s', v_case.case_number),
    format('A obrigacao de R$ %s (devedor: %s) foi BAIXADA sem devolucao do valor.', v_r.expected_amount,
           case v_r.debtor_kind when 'platform' then 'SteelGo' else 'transportadora' end),
    v_actor, false);
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('write_off_dispute_recovery', p_request_id, v_actor, p_recovery_id, v_fp, 'accepted',
          format('recuperacao %s baixada; abertas restantes %s', p_recovery_id, v_open));
  return query select p_recovery_id, 'written_off'::text, v_open = 0, false;
end;
$fn$;

-- =============================================================================
-- 5. cancelamento por falta de aporte apos o prazo
-- =============================================================================
create function public.cancel_contract_for_unpaid_settlement(
  p_case_id    uuid,
  p_note       text,
  p_request_id uuid
)
returns table (
  case_id             uuid,
  contract_id         uuid,
  new_contract_status public.contract_status,
  new_internal_status public.payment_internal_status,
  was_replayed        boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('cancel_contract_for_unpaid_settlement');
  v_case  public.dispute_cases%rowtype;
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  r       record;
  v_ids   text := '';
  v_first uuid := null;
begin
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023',
      message = 'cancel_contract_for_unpaid_settlement: nota obrigatoria com ao menos 20 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('case_id', p_case_id));
  v_log := public.rpc_idempotency_probe('cancel_contract_for_unpaid_settlement', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    select * into v_c from public.contracts c where c.id = v_case.contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id;
    return query select p_case_id, v_c.id, v_c.status, v_i.internal_status, true;
    return;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'cancel_contract_for_unpaid_settlement: caso inexistente';
  end if;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id for update;
  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;

  if v_case.status <> 'decided'::public.dispute_status or v_case.settlement_state <> 'pending_funding' then
    raise exception using errcode = '22023',
      message = format('cancel_contract_for_unpaid_settlement: caso em %s/%s; so caso decidido aguardando '
                       'aporte e cancelado', v_case.status, v_case.settlement_state);
  end if;
  if v_case.assigned_to is distinct from v_actor then
    raise exception using errcode = '42501',
      message = 'cancel_contract_for_unpaid_settlement: somente o administrador atribuido cancela';
  end if;
  if v_case.settlement_due_at is null or now() <= v_case.settlement_due_at then
    raise exception using errcode = '22023',
      message = format('cancel_contract_for_unpaid_settlement: o prazo de aporte so vence em %s', v_case.settlement_due_at);
  end if;
  if v_case.previous_contract_status <> 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('cancel_contract_for_unpaid_settlement: contrato era %s antes da disputa; um contrato '
                       'concluido nunca retrocede a cancelado', v_case.previous_contract_status);
  end if;
  if v_i.id is null then
    raise exception using errcode = 'P0002', message = 'cancel_contract_for_unpaid_settlement: nao existe intencao de pagamento';
  end if;
  if v_i.funding_confirmed_at is not null then
    raise exception using errcode = '22023',
      message = 'cancel_contract_for_unpaid_settlement: ha aporte confirmado; nao e inadimplencia';
  end if;

  -- toda solicitacao de aporte ainda ativa e cancelada, com os ids no evento
  for r in select t.* from public.payment_transactions t
            where t.intent_id = v_i.id and t.kind = 'funding'::public.payment_transaction_kind
              and t.status in ('requested'::public.payment_transaction_status,
                               'pending_provider'::public.payment_transaction_status)
            order by t.requested_at for update loop
    update public.payment_transactions t
       set status = 'cancelled', external_status = 'cancelled_unpaid_settlement: ' || left(p_note, 200)
     where t.id = r.id;
    v_ids := v_ids || case when v_ids = '' then '' else ', ' end || r.id::text;
    if v_first is null then v_first := r.id; end if;
  end loop;

  perform public.payment_event_append(
    v_i.id, 'cancelled_unpaid_settlement', 'cancelled'::public.payment_internal_status, v_first, null,
    coalesce(v_i.settlement_funding_amount, v_i.gross_amount), v_i.currency_code,
    'admin', v_actor, 'admin', null, null, null, null,
    format('Contrato cancelado por falta de aporte da decisao ate %s. Aportes cancelados: %s. %s',
           v_case.settlement_due_at, coalesce(nullif(v_ids, ''), 'nenhum'), p_note),
    'cancel_contract_for_unpaid_settlement', p_request_id, v_fp);
  perform public.contract_lifecycle_append(
    v_c.id, 'cancelled'::public.contract_lifecycle_transition,
    'cancelled'::public.contract_status, 'cancelled', null, null, v_i.id, p_case_id,
    coalesce(v_i.settlement_funding_amount, v_i.gross_amount), v_actor, 'admin',
    format('Cancelado por inadimplencia do aporte da decisao (caso %s). %s', v_case.case_number, p_note),
    'cancel_contract_for_unpaid_settlement', p_request_id, v_fp);

  perform public.dispute_expire_open_requests(p_case_id, false, 'cancel_contract_for_unpaid_settlement', p_request_id, v_fp);
  perform public.dispute_event_append(
    p_case_id, 'cancelled_unpaid_settlement', 'closed'::public.dispute_status,
    (select d.id from public.dispute_decisions d where d.case_id = p_case_id and d.is_current), null, null,
    v_actor, 'admin', p_note, 'cancel_contract_for_unpaid_settlement', p_request_id, v_fp, null, v_first, null);
  update public.dispute_cases d
     set settlement_state = 'not_applicable', settlement_due_at = null,
         closed_at = now(), closed_by = v_actor, updated_at = now()
   where d.id = p_case_id;

  perform public.notify_dispute_case(
    p_case_id, 'dispute_closed', format('Contrato cancelado - caso %s', v_case.case_number),
    'O aporte exigido pela decisao nao foi feito no prazo. O contrato foi cancelado e o caso encerrado '
    'sem liquidacao.', v_actor, false);
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('cancel_contract_for_unpaid_settlement', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('contrato %s cancelado; aportes cancelados: %s', v_c.id, coalesce(nullif(v_ids, ''), 'nenhum')));
  return query select p_case_id, v_c.id, 'cancelled'::public.contract_status,
                      'cancelled'::public.payment_internal_status, false;
end;
$fn$;

-- =============================================================================
-- 6. request_escrow_funding  -  mesma assinatura; aporte da decisao (R)
-- =============================================================================
create or replace function public.request_escrow_funding(p_contract_id uuid, p_request_id uuid)
returns table (affected_contract_id uuid, intent_id uuid, new_internal_status public.payment_internal_status,
               new_escrow_status text, was_replayed boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor  uuid := (select auth.uid());
  v_c      public.contracts%rowtype;
  v_i      public.payment_intents%rowtype;
  v_party  text;
  v_fp     text;
  v_log    public.rpc_call_log%rowtype;
  v_tx     uuid;
  v_amount numeric;
  v_settle boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'request_escrow_funding: chamador nao autenticado';
  end if;
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'request_escrow_funding: p_contract_id e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object('contract_id', p_contract_id));
  v_log := public.rpc_idempotency_probe(
    'request_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, v_c.escrow_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'request_escrow_funding: contrato inexistente';
  end if;

  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is distinct from 'shipper' then
    raise exception using errcode = '42501',
      message = 'request_escrow_funding: somente o embarcador do contrato solicita o aporte';
  end if;

  -- contrato 'disputed' SOMENTE para cumprir decisao pendente de aporte
  if v_c.status = 'disputed'::public.contract_status then
    if exists (select 1 from public.dispute_cases d
                where d.contract_id = p_contract_id
                  and d.status = 'decided'::public.dispute_status
                  and d.settlement_state = 'pending_funding') then
      v_settle := true;
    else
      raise exception using errcode = '22023',
        message = 'request_escrow_funding: contrato em disputa sem decisao aguardando aporte';
    end if;
  elsif v_c.status is distinct from 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('request_escrow_funding: contrato em %s; o aporte so e solicitado com o '
                       'contrato active', coalesce(v_c.status::pg_catalog.text, 'nulo'));
  end if;

  v_i := public.ensure_payment_intent(
    p_contract_id, v_actor, 'request_escrow_funding', p_request_id, v_fp);
  select * into v_i from public.payment_intents pi where pi.id = v_i.id for update;

  if v_i.internal_status is distinct from 'pending_provider'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('request_escrow_funding: pagamento em %s; o aporte so parte de '
                       'pending_provider', v_i.internal_status);
  end if;
  if v_settle and v_i.settlement_funding_amount is null then
    raise exception using errcode = '22023',
      message = 'request_escrow_funding: decisao aguardando aporte sem valor de aporte registrado; '
                'estado incoerente';
  end if;
  v_amount := coalesce(v_i.settlement_funding_amount, v_i.gross_amount);

  insert into public.payment_transactions (
    intent_id, kind, status, currency_code, amount, provider_code, requested_by, idempotency_key
  ) values (
    v_i.id, 'funding', 'requested', v_i.currency_code, v_amount, v_i.provider_code, v_actor, p_request_id
  )
  returning id into v_tx;

  insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
  values (v_tx, 'shipper', v_c.shipper_company_id, v_amount,
          case when v_settle then 'Aporte da decisao de disputa (somente o valor a liberar) solicitado ao embarcador.'
               else 'Aporte solicitado ao embarcador.' end);

  update public.payment_intents pi
     set requested_by = v_actor, requested_at = now()
   where pi.id = v_i.id;

  perform public.payment_event_append(
    v_i.id, 'funding_requested', 'awaiting_funding'::public.payment_internal_status,
    v_tx, null, v_amount, v_i.currency_code,
    'internal', v_actor, 'party', null, null, null, null,
    case when v_settle
         then format('Aporte da decisao de disputa SOLICITADO (R$ %s = valor a liberar; a parcela do '
                     'embarcador nunca saiu dele). Nenhuma confirmacao recebida.', v_amount)
         else 'Aporte SOLICITADO. Nenhuma confirmacao recebida - nada foi retido.' end,
    'request_escrow_funding', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_funding_requested'::public.contract_lifecycle_transition,
    v_c.status, 'awaiting_funding', null, null, v_i.id, null, v_amount,
    v_actor, 'party',
    case when v_settle then 'Aporte da decisao de disputa solicitado pelo embarcador.'
         else 'Aporte solicitado pelo embarcador.' end,
    'request_escrow_funding', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('request_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('transacao %s de aporte SOLICITADA no valor %s %s%s; aguardando confirmacao',
                 v_tx, v_i.currency_code, v_amount, case when v_settle then ' (decisao de disputa)' else '' end));

  return query select p_contract_id, v_i.id,
                      'awaiting_funding'::public.payment_internal_status,
                      'awaiting_funding'::text, false;
end;
$fn$;

-- =============================================================================
-- 7. confirm_escrow_funding  -  mesma assinatura; eventos com o valor da transacao
-- =============================================================================
create or replace function public.confirm_escrow_funding(
  p_contract_id        uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (affected_contract_id uuid, intent_id uuid, new_internal_status public.payment_internal_status,
               new_escrow_status text, was_replayed boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ev    record;
  v_actor uuid := public.require_steelgo_admin('confirm_escrow_funding');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_now   timestamptz := now();
begin
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'confirm_escrow_funding: p_contract_id e obrigatorio';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) = 0 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: referencia externa e obrigatoria. Uma '
                'atestacao sem prova documental nao e registrada.';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: nota da atestacao e obrigatoria e precisa '
                'de ao menos 10 caracteres';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: comprovante e obrigatorio - referencia do '
                'arquivo e sha-256 hexadecimal de 64 caracteres. Uma atestacao '
                'manual sem documento anexado nao e registrada.';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'external_reference', p_external_reference,
    'evidence_hash', p_evidence_hash));
  v_log := public.rpc_idempotency_probe(
    'confirm_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, v_c.escrow_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_funding: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_funding: nao existe intencao de pagamento para '
                'este contrato';
  end if;
  if v_i.internal_status is distinct from 'awaiting_funding'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('confirm_escrow_funding: pagamento em %s; a confirmacao so '
                       'parte de awaiting_funding', v_i.internal_status);
  end if;

  select * into v_tx from public.payment_transactions t
   where t.intent_id = v_i.id and t.kind = 'funding' and t.status = 'requested'
   order by t.requested_at desc limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_funding: nao ha transacao de aporte solicitada';
  end if;

  select * into v_ev from public.assert_payment_evidence(
    p_contract_id, v_tx.id, 'funding'::public.payment_transaction_kind,
    p_evidence_ref, p_evidence_hash);
  if v_ev.size_bytes is null then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: comprovante nao pode ser verificado';
  end if;

  update public.payment_transactions t
     set status              = 'confirmed',
         confirmed_by        = v_actor,
         confirmed_at        = v_now,
         confirmation_method = 'manual_admin',
         confirmation_note   = p_note,
         confirmation_evidence_ref  = p_evidence_ref,
         confirmation_evidence_hash = p_evidence_hash,
         external_reference  = p_external_reference,
         confirmation_evidence_size_bytes = v_ev.size_bytes,
         confirmation_evidence_etag       = v_ev.etag,
         confirmation_evidence_mime       = v_ev.mime
   where t.id = v_tx.id and t.status = 'requested';
  if not found then
    raise exception using errcode = '40001',
      message = 'confirm_escrow_funding: a transacao mudou de estado durante a operacao';
  end if;

  update public.payment_intents pi
     set funding_confirmed_at = v_now
   where pi.id = v_i.id;

  update public.contracts c
     set escrow_external_ref = p_external_reference
   where c.id = p_contract_id;

  -- VALOR DA TRANSACAO, nao o bruto: o aporte de uma decisao de disputa e R
  perform public.payment_event_append(
    v_i.id, 'funding_confirmed', 'funding_confirmed'::public.payment_internal_status,
    v_tx.id, null, v_tx.amount, v_i.currency_code,
    'admin', v_actor, 'admin', 'manual_admin', p_external_reference, null, null,
    p_note, 'confirm_escrow_funding', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_funding_confirmed'::public.contract_lifecycle_transition,
    v_c.status, 'funding_confirmed', null, v_now, v_i.id, null, v_tx.amount,
    v_actor, 'admin',
    'Aporte ATESTADO por administrador SteelGo, fora de provedor integrado.',
    'confirm_escrow_funding', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('aporte de %s %s ATESTADO manualmente; referencia externa %s',
                 v_i.currency_code, v_tx.amount, p_external_reference));

  return query select p_contract_id, v_i.id,
                      'funding_confirmed'::public.payment_internal_status,
                      'funding_confirmed'::text, false;
end;
$fn$;

-- =============================================================================
-- 8. try_complete_contract  -  mesma assinatura; aceita 'settled'
-- =============================================================================
create or replace function public.try_complete_contract(
  p_contract_id uuid,
  p_actor_id    uuid,
  p_actor_kind  text,
  p_rpc_name    text,
  p_request_id  uuid,
  p_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_c      public.contracts%rowtype;
  v_intent public.payment_intents%rowtype;
begin
  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then
    return false;
  end if;
  if v_c.status is distinct from 'active'::public.contract_status then
    return false;
  end if;
  if v_c.delivery_completed_at is null then
    return false;
  end if;

  select * into v_intent from public.payment_intents pi where pi.contract_id = p_contract_id;
  if not found then
    return false;
  end if;
  if v_intent.internal_status not in ('released_confirmed'::public.payment_internal_status,
                                      'settled'::public.payment_internal_status) then
    return false;
  end if;

  -- Disputa viva suspende a conclusao. O caso precisa ser encerrado antes.
  if exists (select 1 from public.dispute_cases d
              where d.contract_id = p_contract_id
                and d.status in ('open'::public.dispute_status,
                                 'under_review'::public.dispute_status,
                                 'awaiting_evidence'::public.dispute_status,
                                 'decided'::public.dispute_status)) then
    return false;
  end if;

  perform public.contract_lifecycle_append(
    p_contract_id, 'completed'::public.contract_lifecycle_transition,
    'completed'::public.contract_status, v_intent.internal_status::text,
    v_c.delivery_completed_at, coalesce(v_intent.released_confirmed_at, v_intent.settled_at),
    v_intent.id, null, v_intent.gross_amount,
    p_actor_id, p_actor_kind,
    case when v_intent.internal_status = 'settled'::public.payment_internal_status
         then 'Entrega concluida e liquidacao de disputa confirmada: as duas condicoes satisfeitas.'
         else 'Entrega concluida e liberacao confirmada: as duas condicoes satisfeitas.' end,
    p_rpc_name, p_request_id, p_fingerprint);

  return true;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- list_recovery_evidence_refs: caminhos (payment-evidence) referenciados por
-- recuperacoes CONFIRMADAS. Somente admin. Serve a triagem de comprovantes
-- "retidos": sem isto a UI marcaria como orfao um comprovante que uma
-- recuperacao confirmada referencia (admins nao tem SELECT direto na tabela).
-- -----------------------------------------------------------------------------
create function public.list_recovery_evidence_refs()
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  perform public.require_steelgo_admin('list_recovery_evidence_refs');
  return query
    select r.evidence_ref
      from public.payment_recoveries r
     where r.status = 'confirmed' and r.evidence_ref is not null;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.settle_dispute_decision(uuid, uuid)',
    'public.confirm_dispute_settlement(uuid, uuid, text, text, text, text, uuid)',
    'public.fail_dispute_settlement_transaction(uuid, uuid, text, text, uuid)',
    'public.retry_dispute_settlement_transaction(uuid, uuid, text, uuid)',
    'public.confirm_dispute_recovery(uuid, text, text, text, text, uuid)',
    'public.write_off_dispute_recovery(uuid, text, uuid)',
    'public.cancel_contract_for_unpaid_settlement(uuid, text, uuid)',
    'public.list_recovery_evidence_refs()',
    'public.request_escrow_funding(uuid, uuid)',
    'public.confirm_escrow_funding(uuid, text, text, text, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
  execute 'revoke all on function public.try_complete_contract(uuid, uuid, text, text, uuid, text) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.try_complete_contract(uuid, uuid, text, text, uuid, text) to service_role';
end $$;

commit;
