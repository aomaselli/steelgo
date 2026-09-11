-- =============================================================================
-- REV8.1 11/13 : RPCs FINANCEIRAS
-- =============================================================================
-- REGRA QUE ATRAVESSA TODO ESTE ARQUIVO:
--   quem e PARTE pode SOLICITAR. Nenhuma parte CONFIRMA.
--   A confirmacao vem do provedor, por aviso registrado, ou de uma ATESTACAO de
--   administrador SteelGo com referencia externa e nota obrigatorias.
--
-- Nenhuma funcao aqui afirma que dinheiro se moveu. Elas registram pedidos,
-- registram confirmacoes de quem tem competencia para confirmar, e dizem
-- exatamente qual das duas coisas aconteceu.
--
-- ALOCACOES. Toda transacao e integralmente decomposta por parte interessada,
-- e a soma fecha exatamente (constraint trigger diferida em 4/13):
--   funding  -> shipper  = valor integral   (quem aportou)
--   release  -> platform = taxa comercial, carrier = liquido   (quem recebeu)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Helper interno: grava evento financeiro e move estado e ponteiro juntos.
-- -----------------------------------------------------------------------------
create function public.payment_event_append(
  p_intent_id      uuid,
  p_event_type     text,
  p_new_status     public.payment_internal_status,
  p_transaction_id uuid,
  p_webhook_id     uuid,
  p_amount         numeric,
  p_currency       text,
  p_source         text,
  p_actor_id       uuid,
  p_actor_kind     text,
  p_method         public.payment_confirmation_method,
  p_external_ref   text,
  p_failure_code   text,
  p_failure_reason text,
  p_note           text,
  p_rpc_name       text,
  p_request_id     uuid,
  p_fingerprint    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i     public.payment_intents%rowtype;
  v_event uuid;
begin
  select * into v_i from public.payment_intents pi where pi.id = p_intent_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'payment_event_append: intencao de pagamento inexistente';
  end if;

  insert into public.payment_events (
    intent_id, previous_event_id, transaction_id, webhook_event_id,
    event_type, previous_status, new_status, amount, currency_code,
    source, actor_id, actor_kind, confirmation_method, external_reference,
    failure_code, failure_reason, note, rpc_name, request_id, params_fingerprint
  ) values (
    p_intent_id, v_i.last_event_id, p_transaction_id, p_webhook_id,
    p_event_type, v_i.internal_status, p_new_status, p_amount, p_currency,
    p_source, p_actor_id, p_actor_kind, p_method, p_external_ref,
    p_failure_code, p_failure_reason, p_note, p_rpc_name, p_request_id, p_fingerprint
  )
  returning id into v_event;

  update public.payment_intents pi
     set internal_status = p_new_status,
         last_event_id   = v_event,
         external_reference = coalesce(p_external_ref, pi.external_reference),
         failure_code    = case when p_new_status in ('failed','reconciliation_required')
                                then p_failure_code else null end,
         failure_reason  = case when p_new_status in ('failed','reconciliation_required')
                                then p_failure_reason else null end,
         updated_at      = now()
   where pi.id = p_intent_id;

  return v_event;
end;
$fn$;

revoke execute on function public.payment_event_append(uuid, text, public.payment_internal_status, uuid, uuid, numeric, text, text, uuid, text, public.payment_confirmation_method, text, text, text, text, text, uuid, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Helper interno: garante que a intencao de pagamento do contrato existe.
-- -----------------------------------------------------------------------------
-- Os valores vem do CONTRATO, que por sua vez os derivou da proposta aceita e da
-- regra de precificacao. O cliente nunca informa valor, taxa nem liquido.
create function public.ensure_payment_intent(
  p_contract_id uuid,
  p_actor_id    uuid,
  p_rpc_name    text,
  p_request_id  uuid,
  p_fingerprint text
)
returns public.payment_intents
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_c public.contracts%rowtype;
  v_i public.payment_intents%rowtype;
  v_id uuid;
begin
  select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
  if found then
    return v_i;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'ensure_payment_intent: contrato inexistente';
  end if;
  if v_c.total_amount_brl is null or v_c.total_amount_brl <= 0
     or v_c.platform_fee_brl is null or v_c.carrier_payout_brl is null then
    raise exception using errcode = '22023',
      message = 'ensure_payment_intent: contrato sem valores economicos completos';
  end if;
  if v_c.platform_fee_brl + v_c.carrier_payout_brl <> v_c.total_amount_brl then
    raise exception using errcode = '23514',
      message = 'ensure_payment_intent: taxa mais repasse nao fecham o total do '
                'contrato; a intencao de pagamento nao e criada sobre valores '
                'incoerentes';
  end if;

  insert into public.payment_intents (
    contract_id, provider_code, currency_code,
    gross_amount, platform_fee_amount, carrier_net_amount,
    pricing_rule_id, internal_status
  ) values (
    p_contract_id, 'manual', 'BRL',
    v_c.total_amount_brl, v_c.platform_fee_brl, v_c.carrier_payout_brl,
    v_c.pricing_rule_id, 'pending_provider'
  )
  returning id into v_id;

  perform public.payment_event_append(
    v_id, 'intent_created', 'pending_provider'::public.payment_internal_status,
    null, null, v_c.total_amount_brl, 'BRL',
    'internal', p_actor_id, case when p_actor_id is null then 'system' else 'party' end,
    null, null, null, null,
    'Intencao criada a partir dos valores do contrato. Nenhum dinheiro '
    'movimentado: nao existe provedor integrado.',
    p_rpc_name, p_request_id, p_fingerprint);

  update public.contracts c
     set escrow_provider = 'manual'
   where c.id = p_contract_id;

  select * into v_i from public.payment_intents pi where pi.id = v_id;
  return v_i;
end;
$fn$;

revoke execute on function public.ensure_payment_intent(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;

-- =============================================================================
-- 1. SOLICITACAO DE APORTE  -  ato do embarcador
-- =============================================================================
create function public.request_escrow_funding(
  p_contract_id uuid,
  p_request_id  uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  new_escrow_status    text,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_party text;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    uuid;
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
      message = 'request_escrow_funding: somente o embarcador do contrato solicita '
                'o aporte';
  end if;
  if v_c.status is distinct from 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('request_escrow_funding: contrato em %s; o aporte so e '
                       'solicitado com o contrato active',
                       coalesce(v_c.status::pg_catalog.text, 'nulo'));
  end if;

  v_i := public.ensure_payment_intent(
    p_contract_id, v_actor, 'request_escrow_funding', p_request_id, v_fp);

  if v_i.internal_status is distinct from 'pending_provider'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('request_escrow_funding: pagamento em %s; o aporte so parte '
                       'de pending_provider', v_i.internal_status);
  end if;

  insert into public.payment_transactions (
    intent_id, kind, status, currency_code, amount, provider_code,
    requested_by, idempotency_key
  ) values (
    v_i.id, 'funding', 'requested', v_i.currency_code, v_i.gross_amount, v_i.provider_code,
    v_actor, p_request_id
  )
  returning id into v_tx;

  -- Decomposicao da transacao: quem aportou foi o embarcador, integralmente.
  insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
  values (v_tx, 'shipper', v_c.shipper_company_id, v_i.gross_amount,
          'Aporte solicitado ao embarcador.');

  update public.payment_intents pi
     set requested_by = v_actor, requested_at = now()
   where pi.id = v_i.id;

  perform public.payment_event_append(
    v_i.id, 'funding_requested', 'awaiting_funding'::public.payment_internal_status,
    v_tx, null, v_i.gross_amount, v_i.currency_code,
    'internal', v_actor, 'party', null, null, null, null,
    'Aporte SOLICITADO. Nenhuma confirmacao recebida - nada foi retido.',
    'request_escrow_funding', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_funding_requested'::public.contract_lifecycle_transition,
    v_c.status, 'awaiting_funding', null, null, v_i.id, null, v_i.gross_amount,
    v_actor, 'party', 'Aporte solicitado pelo embarcador.',
    'request_escrow_funding', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('request_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('transacao %s de aporte SOLICITADA no valor %s %s; aguardando '
                 'confirmacao', v_tx, v_i.currency_code, v_i.gross_amount));

  return query select p_contract_id, v_i.id,
                      'awaiting_funding'::public.payment_internal_status,
                      'awaiting_funding'::text, false;
end;
$fn$;

-- =============================================================================
-- 2. CONFIRMACAO DE APORTE  -  ATESTACAO de administrador
-- =============================================================================
-- Nao existe provedor integrado. Esta funcao registra que um administrador
-- SteelGo ATESTOU, com referencia externa obrigatoria, que o aporte ocorreu
-- fora da plataforma. O evento sai com confirmation_method = 'manual_admin' e
-- jamais se confunde com confirmacao de provedor.
create function public.confirm_escrow_funding(
  p_contract_id        uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  new_escrow_status    text,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
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
  -- COMPROVANTE VINCULADO. Atestacao sem artefato nao e atestacao.
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

  update public.payment_transactions t
     set status              = 'confirmed',
         confirmed_by        = v_actor,
         confirmed_at        = v_now,
         confirmation_method = 'manual_admin',
         confirmation_note   = p_note,
         confirmation_evidence_ref  = p_evidence_ref,
         confirmation_evidence_hash = p_evidence_hash,
         external_reference  = p_external_reference
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

  perform public.payment_event_append(
    v_i.id, 'funding_confirmed', 'funding_confirmed'::public.payment_internal_status,
    v_tx.id, null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', 'manual_admin', p_external_reference, null, null,
    p_note, 'confirm_escrow_funding', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_funding_confirmed'::public.contract_lifecycle_transition,
    v_c.status, 'funding_confirmed', null, v_now, v_i.id, null, v_i.gross_amount,
    v_actor, 'admin',
    'Aporte ATESTADO por administrador SteelGo, fora de provedor integrado.',
    'confirm_escrow_funding', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('aporte ATESTADO manualmente; referencia externa %s', p_external_reference));

  return query select p_contract_id, v_i.id,
                      'funding_confirmed'::public.payment_internal_status,
                      'funding_confirmed'::text, false;
end;
$fn$;

-- =============================================================================
-- 3. SOLICITACAO DE LIBERACAO  -  ato do embarcador
-- =============================================================================
create function public.request_escrow_release(
  p_contract_id uuid,
  p_request_id  uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  new_escrow_status    text,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_party text;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'request_escrow_release: chamador nao autenticado';
  end if;
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'request_escrow_release: p_contract_id e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object('contract_id', p_contract_id));
  v_log := public.rpc_idempotency_probe(
    'request_escrow_release', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, v_c.escrow_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'request_escrow_release: contrato inexistente';
  end if;
  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is distinct from 'shipper' then
    raise exception using errcode = '42501',
      message = 'request_escrow_release: somente o embarcador do contrato solicita '
                'a liberacao';
  end if;

  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'request_escrow_release: nao existe intencao de pagamento';
  end if;
  if v_i.internal_status is distinct from 'funding_confirmed'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('request_escrow_release: pagamento em %s; a liberacao so '
                       'parte de funding_confirmed. Solicitacao de aporte nao e '
                       'aporte confirmado.', v_i.internal_status);
  end if;
  if v_i.release_blocked_by_dispute then
    raise exception using errcode = '22023',
      message = 'request_escrow_release: existe disputa aberta sobre este contrato '
                'e a liberacao esta suspensa';
  end if;

  insert into public.payment_transactions (
    intent_id, kind, status, currency_code, amount, provider_code,
    requested_by, idempotency_key
  ) values (
    v_i.id, 'release', 'requested', v_i.currency_code, v_i.gross_amount, v_i.provider_code,
    v_actor, p_request_id
  )
  returning id into v_tx;

  -- Decomposicao: a taxa fica com a plataforma, o liquido vai a transportadora.
  insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
  values (v_tx, 'platform', null, v_i.platform_fee_amount,
          'Taxa comercial da plataforma SteelGo.'),
         (v_tx, 'carrier', v_c.carrier_company_id, v_i.carrier_net_amount,
          'Repasse liquido a transportadora.');

  update public.payment_intents pi
     set release_requested_by = v_actor, release_requested_at = now()
   where pi.id = v_i.id;

  perform public.payment_event_append(
    v_i.id, 'release_requested', 'release_requested'::public.payment_internal_status,
    v_tx, null, v_i.gross_amount, v_i.currency_code,
    'internal', v_actor, 'party', null, null, null, null,
    'Liberacao SOLICITADA pelo embarcador. Nenhuma confirmacao recebida - nada '
    'foi transferido.',
    'request_escrow_release', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_release_requested'::public.contract_lifecycle_transition,
    v_c.status, 'release_requested', null, null, v_i.id, null, v_i.gross_amount,
    v_actor, 'party', 'Liberacao solicitada pelo embarcador.',
    'request_escrow_release', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('request_escrow_release', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('transacao %s de liberacao SOLICITADA; taxa %s, repasse %s',
                 v_tx, v_i.platform_fee_amount, v_i.carrier_net_amount));

  return query select p_contract_id, v_i.id,
                      'release_requested'::public.payment_internal_status,
                      'release_requested'::text, false;
end;
$fn$;

-- =============================================================================
-- 4. CONFIRMACAO DE LIBERACAO  -  ATESTACAO de administrador
-- =============================================================================
-- Segunda porta para a conclusao do contrato: se a entrega ja estiver
-- concluida, o contrato fecha AQUI, na mesma transacao.
create function public.confirm_escrow_release(
  p_contract_id        uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  new_contract_status  public.contract_status,
  contract_completed   boolean,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('confirm_escrow_release');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_now   timestamptz := now();
  v_done  boolean := false;
begin
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'confirm_escrow_release: p_contract_id e obrigatorio';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) = 0 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: referencia externa e obrigatoria';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: nota da atestacao e obrigatoria e precisa '
                'de ao menos 10 caracteres';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: comprovante e obrigatorio - referencia do '
                'arquivo e sha-256 hexadecimal de 64 caracteres. Uma atestacao '
                'manual sem documento anexado nao e registrada.';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'external_reference', p_external_reference,
    'evidence_hash', p_evidence_hash));
  v_log := public.rpc_idempotency_probe(
    'confirm_escrow_release', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, v_c.status,
                        v_c.status = 'completed'::public.contract_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_release: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_release: nao existe intencao de pagamento';
  end if;
  if v_i.internal_status is distinct from 'release_requested'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('confirm_escrow_release: pagamento em %s; a confirmacao so '
                       'parte de release_requested', v_i.internal_status);
  end if;
  if v_i.release_blocked_by_dispute then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: liberacao suspensa por disputa aberta';
  end if;

  select * into v_tx from public.payment_transactions t
   where t.intent_id = v_i.id and t.kind = 'release' and t.status = 'requested'
   order by t.requested_at desc limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_release: nao ha transacao de liberacao solicitada';
  end if;

  update public.payment_transactions t
     set status              = 'confirmed',
         confirmed_by        = v_actor,
         confirmed_at        = v_now,
         confirmation_method = 'manual_admin',
         confirmation_note   = p_note,
         confirmation_evidence_ref  = p_evidence_ref,
         confirmation_evidence_hash = p_evidence_hash,
         external_reference  = p_external_reference
   where t.id = v_tx.id and t.status = 'requested';
  if not found then
    raise exception using errcode = '40001',
      message = 'confirm_escrow_release: a transacao mudou de estado durante a operacao';
  end if;

  update public.payment_intents pi
     set released_confirmed_at = v_now
   where pi.id = v_i.id;

  update public.contracts c
     set escrow_external_ref = p_external_reference
   where c.id = p_contract_id;

  perform public.payment_event_append(
    v_i.id, 'release_confirmed', 'released_confirmed'::public.payment_internal_status,
    v_tx.id, null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', 'manual_admin', p_external_reference, null, null,
    p_note, 'confirm_escrow_release', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_release_confirmed'::public.contract_lifecycle_transition,
    v_c.status, 'released_confirmed', null, v_now, v_i.id, null, v_i.gross_amount,
    v_actor, 'admin',
    'Liberacao ATESTADA por administrador SteelGo, fora de provedor integrado.',
    'confirm_escrow_release', p_request_id, v_fp);

  -- SEGUNDA CONDICAO? Se a entrega ja estiver concluida, o contrato fecha AGORA.
  v_done := public.try_complete_contract(
    p_contract_id, v_actor, 'admin', 'confirm_escrow_release', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_escrow_release', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('liberacao ATESTADA manualmente, referencia %s; contrato %s',
                 p_external_reference,
                 case when v_done then 'CONCLUIDO na mesma transacao'
                      else 'segue active, aguardando conclusao da entrega' end));

  select * into v_c from public.contracts c where c.id = p_contract_id;
  return query select p_contract_id, v_i.id,
                      'released_confirmed'::public.payment_internal_status,
                      v_c.status, v_done, false;
end;
$fn$;

-- =============================================================================
-- 5. FALHA DE PAGAMENTO  -  registro honesto de que nao deu certo
-- =============================================================================
create function public.fail_payment_transaction(
  p_contract_id    uuid,
  p_failure_code   text,
  p_failure_reason text,
  p_request_id     uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('fail_payment_transaction');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    public.payment_transactions%rowtype;
begin
  if p_failure_code is null or length(btrim(p_failure_code)) = 0
     or p_failure_reason is null or length(btrim(p_failure_reason)) < 10 then
    raise exception using errcode = '22023',
      message = 'fail_payment_transaction: codigo e motivo da falha sao obrigatorios';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'failure_code', p_failure_code));
  v_log := public.rpc_idempotency_probe(
    'fail_payment_transaction', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'fail_payment_transaction: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'fail_payment_transaction: nao existe intencao de pagamento';
  end if;
  if v_i.internal_status not in ('awaiting_funding'::public.payment_internal_status,
                                 'release_requested'::public.payment_internal_status) then
    raise exception using errcode = '22023',
      message = format('fail_payment_transaction: pagamento em %s; so uma '
                       'solicitacao pendente pode falhar', v_i.internal_status);
  end if;

  select * into v_tx from public.payment_transactions t
   where t.intent_id = v_i.id and t.status = 'requested'
   order by t.requested_at desc limit 1 for update;
  if found then
    update public.payment_transactions t
       set status = 'failed', failure_code = p_failure_code,
           failure_reason = p_failure_reason
     where t.id = v_tx.id;
  end if;

  perform public.payment_event_append(
    v_i.id, 'failed', 'failed'::public.payment_internal_status,
    v_tx.id, null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', null, null, p_failure_code, p_failure_reason,
    'Falha registrada por administrador.',
    'fail_payment_transaction', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'payment_failed'::public.contract_lifecycle_transition,
    v_c.status, 'failed', null, null, v_i.id, null, v_i.gross_amount,
    v_actor, 'admin', format('Falha de pagamento: %s', p_failure_code),
    'fail_payment_transaction', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('fail_payment_transaction', p_request_id, v_actor, p_contract_id, v_fp,
          'accepted', format('falha %s registrada', p_failure_code));

  return query select p_contract_id, v_i.id,
                      'failed'::public.payment_internal_status, false;
end;
$fn$;

-- =============================================================================
-- 6. AVISO DE PROVEDOR  -  porta de entrada do adaptador externo
-- =============================================================================
-- NAO recebe grant para authenticated. Quem entrega aviso de provedor e a
-- funcao de borda que roda com service_role - nunca o navegador. Assinatura e
-- verificada FORA daqui, pelo adaptador, e o resultado dessa verificacao chega
-- em p_signature_verified: um aviso com assinatura invalida e REGISTRADO e
-- recusado, nunca aplicado nem descartado em silencio.
create function public.record_provider_webhook(
  p_provider_code      text,
  p_external_event_id  text,
  p_event_type         text,
  p_external_reference text,
  p_occurred_at        timestamptz,
  p_provider_sequence  bigint,
  p_signature_verified boolean,
  p_signature_algorithm text,
  p_signature_key_id   text,
  p_payload_digest     text,
  p_amount             numeric,
  p_currency_code      text,
  p_request_id         uuid
)
returns table (
  webhook_id  uuid,
  outcome     text,
  intent_id   uuid,
  new_internal_status public.payment_internal_status
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_i        public.payment_intents%rowtype;
  v_prov     public.payment_providers%rowtype;
  v_prev     public.provider_webhook_events%rowtype;
  v_manual   public.payment_transactions%rowtype;
  v_tx       public.payment_transactions%rowtype;
  v_hook     uuid;
  v_outcome  text;
  v_status   public.payment_internal_status;
  v_fp       text;
  v_n        integer;
  v_monetary boolean := false;
  v_reprocess boolean := false;
  v_kind     public.payment_transaction_kind;
  v_req      public.payment_internal_status;
  v_next     public.payment_internal_status;
  v_expected numeric(16,2);
begin
  if p_provider_code is null or p_external_event_id is null
     or p_event_type is null or p_occurred_at is null
     or p_payload_digest is null then
    raise exception using errcode = '22004',
      message = 'record_provider_webhook: provider, id externo, tipo, instante e '
                'digest sao obrigatorios';
  end if;
  if p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'record_provider_webhook: payload_digest deve ser sha-256 hex';
  end if;

  -- ASSINATURA VERIFICADA PRECISA DIZER COMO (reforco 8.1-b).
  -- Aceitar signature_verified = true sem algoritmo e sem identificador de chave
  -- e guardar uma afirmacao que nao se pode auditar depois. No dia de uma
  -- rotacao - ou de uma suspeita de chave vazada - a pergunta e "quais avisos
  -- foram aceitos sob a chave X", e sem estes dois campos nao ha resposta.
  -- Recusar na entrada e melhor que descobrir a lacuna quando ela importa.
  if coalesce(p_signature_verified, false)
     and (p_signature_algorithm is null or length(btrim(p_signature_algorithm)) = 0
          or p_signature_key_id is null or length(btrim(p_signature_key_id)) = 0) then
    raise exception using errcode = '22004',
      message = 'record_provider_webhook: assinatura declarada como verificada exige '
                'signature_algorithm e signature_key_id preenchidos - a trilha '
                'precisa poder dizer COMO a assinatura foi verificada.';
  end if;

  -- ===========================================================================
  -- PROVEDOR COMPATIVEL (correcao 8.1/b3).
  -- ===========================================================================
  -- Um aviso de webhook so e aceito de um provedor que a SteelGo cadastrou, que
  -- esta ativo, cujo adaptador e de fato uma integracao externa, e que declara
  -- EXPLICITAMENTE a capacidade de entregar webhooks. Sem esta porta, o unico
  -- provedor existente hoje - 'manual', que declara webhooks=false - poderia
  -- receber um "aviso de provedor" e produzir uma confirmacao que ninguem
  -- assinou. Um pagamento atestado por pessoa e um pagamento confirmado por
  -- banco sao fatos diferentes; esta verificacao e o que impede que o segundo
  -- seja fabricado a partir da ausencia do primeiro.
  --
  -- A capacidade precisa estar PRESENTE e ser verdadeira. Capacidade ausente
  -- nao e capacidade concedida: o coalesce falharia ABERTO se tratasse a
  -- ausencia da chave como permissao.
  --
  -- O seed 'manual' NAO e alterado para acomodar teste. Ele declara o que e:
  -- atestacao humana, sem webhook. Teste de webhook usa fixture de provedor
  -- external_api criado no proprio teste - nao um seed de producao adulterado
  -- para fingir uma integracao que nao existe.
  select * into v_prov from public.payment_providers p
   where p.code = p_provider_code;
  if not found then
    raise exception using errcode = 'P0002',
      message = format('record_provider_webhook: provedor %L nao esta cadastrado '
                       'em public.payment_providers', p_provider_code);
  end if;
  if not v_prov.is_active then
    raise exception using errcode = '0A000',
      message = format('record_provider_webhook: provedor %L esta inativo e nao '
                       'entrega avisos', p_provider_code);
  end if;
  if v_prov.adapter_kind is distinct from 'external_api' then
    raise exception using errcode = '0A000',
      message = format('record_provider_webhook: provedor %L tem adapter_kind %L; '
                       'aviso de webhook so vem de adaptador external_api',
                       p_provider_code, v_prov.adapter_kind);
  end if;
  if not (pg_catalog.jsonb_exists(v_prov.capabilities, 'webhooks')
          and v_prov.capabilities -> 'webhooks' = 'true'::jsonb) then
    raise exception using errcode = '0A000',
      message = format('record_provider_webhook: provedor %L nao declara a '
                       'capacidade webhooks. Confirmacao por aviso externo exige '
                       'capacidade declarada; a alternativa e a atestacao manual, '
                       'que passa por confirm_escrow_funding ou '
                       'confirm_escrow_release com comprovante.', p_provider_code);
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'provider', p_provider_code, 'external_event_id', p_external_event_id));

  -- ===========================================================================
  -- SERIALIZACAO DA DEDUPLICACAO (correcao 8.1/b2).
  -- ===========================================================================
  -- O bloco abaixo e um SELECT seguido de um INSERT. Duas entregas simultaneas
  -- do MESMO evento - o provedor reentregando por timeout, ou dois workers
  -- consumindo a mesma fila - fazem o SELECT antes de qualquer INSERT ficar
  -- visivel: as duas nao encontram nada, as duas tentam inserir, e a segunda
  -- bate no indice unico (provider_code, external_event_id) com um 23505 CRU.
  -- Um 23505 cru sobe como falha do webhook, o provedor reentrega, e o mesmo
  -- evento fica em retentativa por um motivo que nao e problema nenhum: ele ja
  -- tinha sido registrado.
  --
  -- A trava consultiva por (provedor, id externo) faz a segunda sessao esperar
  -- e so entao consultar - momento em que ela ENXERGA o registro da primeira e
  -- devolve ignored_replay, que e a resposta correta. O indice unico permanece
  -- como rede estrutural: se um caminho futuro escrever sem passar por aqui, a
  -- unicidade continua garantida pelo schema, nao pela disciplina do codigo.
  --
  -- A trava e por evento, nao por provedor: avisos de eventos diferentes do
  -- mesmo provedor seguem em paralelo.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'steelgo.provider_webhook:' || p_provider_code || '|' || p_external_event_id, 0));

  -- ===========================================================================
  -- DEDUPLICACAO, COM REPROCESSAMENTO DO QUE FICOU PENDENTE (8.1 / 8.1-b b4).
  -- O provedor reentrega. Reentrega IDENTICA e replay e nao e erro. Reentrega
  -- com payload CONTRADITORIO sob o MESMO identificador vira ALERTA DE
  -- INTEGRIDADE, sem tocar em estado.
  --
  -- A excecao (8.1-b) e o aviso que ficou em deferred_out_of_order: ele descreve
  -- uma etapa que o pagamento ainda nao tinha alcancado. Devolver replay para ele
  -- para sempre e o que fazia o pagamento ficar preso - a liberacao existia, o
  -- provedor a reentregava, e a SteelGo respondia "ja vi esse" sem nunca
  -- aplica-la. Aqui a reentrega dele e uma NOVA AVALIACAO, sobre a mesma linha:
  -- o recibo continua unico, a dedupe continua valendo, e o fato deixa de se
  -- perder.
  -- ===========================================================================
  select * into v_prev from public.provider_webhook_events w
   where w.provider_code = p_provider_code
     and w.external_event_id = p_external_event_id;
  if found then
    if v_prev.payload_digest is distinct from p_payload_digest then
      insert into public.provider_webhook_conflicts (
        provider_code, external_event_id, existing_event_id, existing_digest,
        incoming_digest, incoming_event_type, incoming_amount,
        incoming_occurred_at, signature_verified
      ) values (
        p_provider_code, p_external_event_id, v_prev.id, v_prev.payload_digest,
        p_payload_digest, p_event_type, p_amount,
        p_occurred_at, coalesce(p_signature_verified, false));

      select pi.internal_status into v_status
        from public.payment_intents pi where pi.id = v_prev.intent_id;
      return query select v_prev.id, 'integrity_conflict'::text, v_prev.intent_id, v_status;
      return;
    end if;

    if v_prev.processing_outcome is distinct from 'deferred_out_of_order' then
      select pi.internal_status into v_status
        from public.payment_intents pi where pi.id = v_prev.intent_id;
      return query select v_prev.id, 'ignored_replay'::text, v_prev.intent_id, v_status;
      return;
    end if;

    -- REAVALIACAO CONTROLADA do aviso que ficou pendente.
    v_reprocess := true;
    v_hook      := v_prev.id;
  end if;

  -- ===========================================================================
  -- QUAL PAGAMENTO ESTE AVISO DESCREVE (correcao 8.1-b/b2).
  -- ===========================================================================
  -- A busca e por (provider_code, external_reference) e NAO usa "limit 1". O
  -- limit escondia a pergunta: se duas intencoes carregassem a mesma referencia,
  -- uma delas seria escolhida pelo plano de execucao - isto e, por acaso - e o
  -- dinheiro iria para o contrato errado sem deixar rastro de que houve escolha.
  -- A unicidade parcial criada em 20260903100440 torna o caso impossivel de
  -- gravar; a contagem aqui e a segunda barreira, para o dia em que alguem
  -- remover o indice: encontrar mais de uma intencao vira erro de integridade,
  -- nunca um sorteio.
  if p_external_reference is not null then
    select count(*) into v_n from public.payment_intents pi
     where pi.provider_code = p_provider_code
       and pi.external_reference = p_external_reference;
    if v_n > 1 then
      raise exception using errcode = '23505',
        message = format('record_provider_webhook: referencia externa %L do provedor '
                         '%L aponta para %s intencoes de pagamento. A referencia e '
                         'ambigua e NENHUM valor sera atribuido: resolva a duplicidade '
                         'antes de reprocessar o aviso.',
                         p_external_reference, p_provider_code, v_n);
    elsif v_n = 1 then
      -- Primeiro SEM trava, so para descobrir de qual contrato se trata.
      select * into v_i from public.payment_intents pi
       where pi.provider_code = p_provider_code
         and pi.external_reference = p_external_reference;

      -- ORDEM DE TRAVAS: contrato -> intencao -> transacao.
      -- E a mesma ordem de confirm_escrow_funding e confirm_escrow_release, e
      -- nao e arbitraria: atualizar a intencao sincroniza escrow_status no
      -- contrato, de modo que quem trava a intencao acaba precisando do
      -- contrato de qualquer jeito. Travar na ordem inversa - intencao antes do
      -- contrato - punha o aviso de provedor e a atestacao manual em rota de
      -- colisao: cada um segurando o que o outro precisava, terminando em
      -- deadlock em vez de uma recusa legivel. Com a ordem alinhada, o segundo
      -- espera e recebe o erro que explica o que aconteceu.
      perform 1 from public.contracts c where c.id = v_i.contract_id for update;
      select * into v_i from public.payment_intents pi where pi.id = v_i.id for update;
    end if;
  end if;

  -- REGISTRA. O aviso entra na trilha antes de qualquer interpretacao. O indice
  -- unico (provider_code, external_event_id) permanece como rede estrutural.
  if not v_reprocess then
    insert into public.provider_webhook_events (
      provider_code, external_event_id, event_type, intent_id, external_reference,
      occurred_at, provider_sequence, signature_verified,
      signature_algorithm, signature_key_id, payload_digest,
      amount, currency_code
    ) values (
      p_provider_code, p_external_event_id, p_event_type, v_i.id, p_external_reference,
      p_occurred_at, p_provider_sequence, coalesce(p_signature_verified, false),
      p_signature_algorithm, p_signature_key_id,
      p_payload_digest, p_amount, p_currency_code
    )
    returning id into v_hook;
  elsif v_prev.intent_id is null and v_i.id is not null then
    -- O aviso pendente passou a casar com uma intencao: o vinculo pode ser
    -- preenchido. O conteudo recebido do provedor continua intocado.
    update public.provider_webhook_events w
       set intent_id = v_i.id where w.id = v_hook;
  end if;

  -- ===========================================================================
  -- CLASSIFICACAO DO EVENTO
  -- ===========================================================================
  -- Evento MONETARIO e aquele que, se aplicado, move dinheiro no livro-razao.
  -- Para ele valem exigencias que nao valem para um aviso informativo: valor,
  -- moeda e referencia obrigatorios, e uma transacao do razao para confirmar.
  v_monetary := p_event_type in ('funding.confirmed', 'payment.captured',
                                 'release.confirmed', 'payout.paid');
  if v_monetary then
    if p_event_type in ('funding.confirmed', 'payment.captured') then
      v_kind := 'funding'::public.payment_transaction_kind;
      v_req  := 'awaiting_funding'::public.payment_internal_status;
      v_next := 'funding_confirmed'::public.payment_internal_status;
    else
      v_kind := 'release'::public.payment_transaction_kind;
      v_req  := 'release_requested'::public.payment_internal_status;
      v_next := 'released_confirmed'::public.payment_internal_status;
    end if;
  end if;

  -- ===========================================================================
  -- A INTEGRACAO FUTURA NAO SOBRESCREVE A ATESTACAO MANUAL (8.1).
  -- ===========================================================================
  select * into v_manual from public.payment_transactions t
   where t.intent_id = v_i.id
     and t.status = 'confirmed'
     and t.confirmation_method = 'manual_admin'
   order by t.confirmed_at desc limit 1;

  if not coalesce(p_signature_verified, false) then
    v_outcome := 'signature_rejected';

  elsif v_i.id is null then
    v_outcome := 'unmatched_intent';

  elsif v_manual.id is not null then
    v_outcome := 'manual_confirmation_reconciled';
    insert into public.external_reconciliation (
      intent_id, transaction_id, source, statement_ref, currency_code,
      expected_amount, observed_amount, status
    ) values (
      v_i.id, v_manual.id, 'provider_statement', p_external_event_id,
      coalesce(p_currency_code, v_i.currency_code),
      v_manual.amount, p_amount, 'pending');
    perform public.payment_event_append(
      v_i.id, 'reconciliation_opened', v_i.internal_status,
      v_manual.id, v_hook, p_amount, coalesce(p_currency_code, v_i.currency_code),
      'provider_webhook', null, 'provider', null, p_external_reference,
      null, null,
      'Aviso de provedor sobre pagamento ja ATESTADO manualmente. A atestacao '
      'nao e sobrescrita: abre-se reconciliacao para casar os dois registros.',
      'record_provider_webhook', p_request_id, v_fp);

  elsif exists (
      select 1 from public.provider_webhook_events w
       where w.intent_id = v_i.id
         and w.processing_outcome = 'applied'
         and (w.occurred_at > p_occurred_at
              or (p_provider_sequence is not null
                  and w.provider_sequence is not null
                  and w.provider_sequence > p_provider_sequence))
         and w.id <> v_hook) then
    -- ATRASADO. Chegou depois, mas descreve um instante anterior a um aviso ja
    -- aplicado. Registrado e ignorado: o estado NAO retrocede.
    v_outcome := 'ignored_stale';

  elsif v_monetary then
    -- =========================================================================
    -- 1. O AVISO PRECISA DIZER QUANTO, EM QUE MOEDA E SOBRE QUAL REFERENCIA
    --    (correcao 8.1-b/b3).
    -- =========================================================================
    -- Antes, valor nulo simplesmente nao entrava na comparacao de divergencia -
    -- e o aviso seguia para confirmar o valor integral POR CONSEQUENCIA, sem que
    -- o provedor tivesse dito valor nenhum. Confirmar dinheiro a partir de uma
    -- omissao e a forma mais silenciosa de errar: nada no registro mostraria que
    -- o numero foi presumido. Agora a omissao e um fato com nome, que abre
    -- reconciliacao e nunca confirma.
    if p_amount is null or p_amount <= 0
       or p_currency_code is null or p_external_reference is null then
      v_outcome := 'reconciliation_required';
      insert into public.external_reconciliation (
        intent_id, source, statement_ref, currency_code,
        expected_amount, observed_amount, status
      ) values (
        v_i.id, 'webhook_incomplete', p_external_event_id,
        coalesce(p_currency_code, v_i.currency_code),
        v_i.gross_amount, p_amount, 'pending');
      -- O estado da intencao NAO muda aqui, e a diferenca e deliberada: uma
      -- mensagem incompleta e defeito da MENSAGEM, nao do dinheiro. Marcar a
      -- intencao como "em reconciliacao" por causa de um payload malformado
      -- congelaria um pagamento sadio por erro do provedor. A reconciliacao
      -- aberta e o artefato visivel; o estado continua sendo o real.
      -- Divergencia de VALOR ou de MOEDA e o caso oposto, e ali o estado muda.
      perform public.payment_event_append(
        v_i.id, 'reconciliation_opened',
        v_i.internal_status,
        null, v_hook, p_amount, coalesce(p_currency_code, v_i.currency_code),
        'provider_webhook', null, 'provider', null, p_external_reference,
        'incomplete_monetary_event',
        format('valor=%s moeda=%s referencia=%s',
               coalesce(p_amount::text, 'ausente'),
               coalesce(p_currency_code, 'ausente'),
               coalesce(p_external_reference, 'ausente')),
        'Aviso monetario sem valor, moeda ou referencia externa. NADA e '
        'confirmado: valor de dinheiro nao se presume a partir de omissao.',
        'record_provider_webhook', p_request_id, v_fp);

    elsif p_currency_code is distinct from v_i.currency_code then
      v_outcome := 'reconciliation_required';
      insert into public.external_reconciliation (
        intent_id, source, statement_ref, currency_code,
        expected_amount, observed_amount, status
      ) values (
        v_i.id, 'webhook_mismatch', p_external_event_id,
        v_i.currency_code, v_i.gross_amount, p_amount, 'pending');
      perform public.payment_event_append(
        v_i.id, 'reconciliation_opened',
        'reconciliation_required'::public.payment_internal_status,
        null, v_hook, p_amount, v_i.currency_code,
        'provider_webhook', null, 'provider', null, p_external_reference,
        'currency_mismatch',
        format('provedor informou %s, a intencao esta em %s',
               p_currency_code, v_i.currency_code),
        'Divergencia de MOEDA em aviso de provedor. Nao se converte nada.',
        'record_provider_webhook', p_request_id, v_fp);

    else
      -- =======================================================================
      -- 2. A TRANSACAO DO RAZAO QUE ESTE AVISO CONFIRMA (correcao 8.1-b/b1).
      -- =======================================================================
      -- Trava a transacao pendente da etapa. Se ela existir, e o valor esperado
      -- vem DELA - nao de gross_amount por atalho.
      select * into v_tx from public.payment_transactions t
       where t.intent_id = v_i.id
         and t.kind = v_kind
         and t.status in ('requested', 'pending_provider')
       order by t.requested_at desc
       limit 1
         for update;
      v_expected := coalesce(v_tx.amount, v_i.gross_amount);

      if p_amount is distinct from v_expected then
        -- Valor divergente do esperado: nao se aplica nada, abre-se
        -- reconciliacao.
        v_outcome := 'reconciliation_required';
        insert into public.external_reconciliation (
          intent_id, transaction_id, source, statement_ref, currency_code,
          expected_amount, observed_amount, status
        ) values (
          v_i.id, v_tx.id, 'webhook_mismatch', p_external_event_id,
          v_i.currency_code, v_expected, p_amount, 'pending');
        perform public.payment_event_append(
          v_i.id, 'reconciliation_opened',
          'reconciliation_required'::public.payment_internal_status,
          v_tx.id, v_hook, p_amount, v_i.currency_code,
          'provider_webhook', null, 'provider', null, p_external_reference,
          'amount_mismatch',
          format('provedor informou %s, esperado %s', p_amount, v_expected),
          'Divergencia de valor em aviso de provedor.',
          'record_provider_webhook', p_request_id, v_fp);

      elsif v_i.internal_status = v_req then
        -- =====================================================================
        -- 3. APLICAR: INTENCAO E RAZAO NA MESMA TRANSACAO (correcao 8.1-b/b1).
        -- =====================================================================
        -- Antes, este ramo movia payment_intents e gravava payment_event com
        -- transaction_id NULL, deixando a transacao do razao em 'requested'. O
        -- resultado era um pagamento "confirmado" para quem olhasse a intencao e
        -- "solicitado" para quem olhasse o razao - duas respostas diferentes
        -- para a mesma pergunta, e nenhuma transacao confirmada de fato.
        --
        -- FALHA FECHADA: se a intencao diz que ha uma solicitacao em aberto e o
        -- razao nao tem a transacao correspondente, isso e inconsistencia
        -- interna, nao um aviso ruim. Levantar excecao desfaz TUDO - inclusive o
        -- registro do aviso - e o provedor reentrega, mantendo o problema
        -- visivel em vez de gravar meia confirmacao.
        if v_tx.id is null then
          raise exception using errcode = 'P0002',
            message = format('record_provider_webhook: intencao %s esta em %s mas nao '
                             'existe transacao %s solicitada no razao. Nada foi '
                             'confirmado.', v_i.id, v_i.internal_status, v_kind);
        end if;

        update public.payment_transactions t
           set status              = 'confirmed',
               confirmed_at        = p_occurred_at,
               confirmation_method = 'provider_webhook'::public.payment_confirmation_method,
               confirmed_by        = null,
               external_reference  = p_external_reference,
               external_status     = p_event_type,
               confirmation_note   = format('Confirmado por aviso do provedor %s, '
                                            'evento externo %s.',
                                            p_provider_code, p_external_event_id)
         where t.id = v_tx.id
           and t.status in ('requested', 'pending_provider');
        if not found then
          raise exception using errcode = '40001',
            message = 'record_provider_webhook: a transacao mudou de estado durante '
                      'a confirmacao';
        end if;

        v_outcome := 'applied';
        if v_kind = 'funding' then
          update public.payment_intents pi set funding_confirmed_at = p_occurred_at
           where pi.id = v_i.id;
        else
          update public.payment_intents pi set released_confirmed_at = p_occurred_at
           where pi.id = v_i.id;
        end if;

        perform public.payment_event_append(
          v_i.id,
          case when v_kind = 'funding' then 'funding_confirmed' else 'release_confirmed' end,
          v_next, v_tx.id, v_hook, p_amount, p_currency_code,
          'provider_webhook', null, 'provider',
          'provider_webhook'::public.payment_confirmation_method, p_external_reference,
          null, null,
          case when v_kind = 'funding'
               then 'Aporte confirmado por aviso de provedor, com a transacao do '
                    'razao confirmada na mesma transacao de banco.'
               else 'Liberacao confirmada por aviso de provedor, com a transacao do '
                    'razao confirmada na mesma transacao de banco.' end,
          'record_provider_webhook', p_request_id, v_fp);

        if v_kind = 'release' then
          perform public.try_complete_contract(
            v_i.contract_id, null, 'system', 'record_provider_webhook', p_request_id, v_fp);
        end if;

      elsif public.payment_status_rank(v_i.internal_status) is not null
            and public.payment_status_rank(v_i.internal_status)
                < public.payment_status_rank(v_req) then
        -- =====================================================================
        -- 4. ETAPA FUTURA: O FATO CHEGOU CEDO (correcao 8.1-b/b4).
        -- =====================================================================
        -- release.confirmed enquanto a intencao ainda esta em awaiting_funding e
        -- um aviso VALIDO, assinado, integro e com o valor certo - so chegou
        -- antes da etapa. Antes ele caia em ignored_duplicate_state, e a partir
        -- dai toda reentrega virava replay: a liberacao existia no provedor e
        -- nunca era aplicada aqui. O pagamento ficava preso e nada no registro
        -- dizia por que.
        --
        -- Agora fica PENDENTE, com reconciliacao aberta e nome proprio. Nao
        -- aplica nada e nao regride nada. A reentrega do provedor o reavalia; se
        -- o provedor nao reentregar, a reconciliacao aberta obriga alguem a
        -- olhar. Nos dois caminhos o fato continua existindo.
        v_outcome := 'deferred_out_of_order';
        insert into public.external_reconciliation (
          intent_id, source, statement_ref, currency_code,
          expected_amount, observed_amount, status
        ) values (
          v_i.id, 'webhook_out_of_order', p_external_event_id,
          v_i.currency_code, v_expected, p_amount, 'pending');
        perform public.payment_event_append(
          v_i.id, 'reconciliation_opened', v_i.internal_status,
          null, v_hook, p_amount, p_currency_code,
          'provider_webhook', null, 'provider', null, p_external_reference,
          'out_of_order',
          format('aviso de %s exige %s; a intencao esta em %s',
                 p_event_type, v_req, v_i.internal_status),
          'Aviso valido de etapa AINDA NAO alcancada. Fica pendente: nao e '
          'aplicado, nao regride o estado e NAO e descartado. A reentrega do '
          'provedor o reavalia.',
          'record_provider_webhook', p_request_id, v_fp);

      elsif exists (select 1 from public.external_reconciliation r
                     where r.intent_id = v_i.id and r.status = 'pending') then
        -- =====================================================================
        -- 5. HA RECONCILIACAO ABERTA: NAO SE APLICA, MAS TAMBEM NAO SE IGNORA.
        -- =====================================================================
        -- Enquanto o dinheiro esta em questao, nenhum aviso confirma nada - essa
        -- e a regra. Mas classificar o aviso como "duplicata de estado" o faria
        -- sumir, que e o mesmo defeito da etapa futura em outra roupa. Ele fica
        -- registrado como prova adicional para quem for resolver a reconciliacao.
        v_outcome := 'reconciliation_required';
        perform public.payment_event_append(
          v_i.id, 'reconciliation_opened', v_i.internal_status,
          v_tx.id, v_hook, p_amount, p_currency_code,
          'provider_webhook', null, 'provider', null, p_external_reference,
          'pending_reconciliation',
          format('aviso %s recebido com reconciliacao em aberto', p_event_type),
          'Aviso recebido enquanto ha reconciliacao pendente nesta intencao. NADA '
          'e aplicado; o aviso entra na trilha como prova para quem resolver.',
          'record_provider_webhook', p_request_id, v_fp);

      else
        -- Etapa ja passada: o pagamento avancou alem do que o aviso descreve.
        v_outcome := 'ignored_duplicate_state';
      end if;
    end if;

  else
    -- Aviso nao monetario, ou de tipo que a SteelGo nao reconhece: registrado,
    -- sem efeito. Nao se inventa significado para evento desconhecido.
    v_outcome := 'ignored_duplicate_state';
  end if;

  update public.provider_webhook_events w
     set processed_at = now(), processing_outcome = v_outcome,
         processing_note = format('%stipo %s; estado do intent %s',
                                  case when v_reprocess then 'REAVALIADO apos pendencia; ' else '' end,
                                  p_event_type,
                                  coalesce(v_i.internal_status::text, 'sem intent'))
   where w.id = v_hook;

  select pi.internal_status into v_status from public.payment_intents pi where pi.id = v_i.id;
  return query select v_hook, v_outcome, v_i.id, v_status;
end;
$fn$;

-- =============================================================================
-- 7. RECONCILIACAO
-- =============================================================================
create function public.resolve_payment_reconciliation(
  p_reconciliation_id uuid,
  p_status            text,
  p_note              text,
  p_request_id        uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('resolve_payment_reconciliation');
  v_r     public.external_reconciliation%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if p_status is null or p_status not in ('matched', 'mismatch', 'written_off') then
    raise exception using errcode = '22023',
      message = 'resolve_payment_reconciliation: status deve ser matched, mismatch '
                'ou written_off';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'resolve_payment_reconciliation: nota de resolucao e obrigatoria';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'reconciliation_id', p_reconciliation_id, 'status', p_status));
  v_log := public.rpc_idempotency_probe(
    'resolve_payment_reconciliation', p_request_id, v_actor, p_reconciliation_id, v_fp);
  if v_log.id is not null then
    return p_reconciliation_id;
  end if;

  select * into v_r from public.external_reconciliation r
   where r.id = p_reconciliation_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'resolve_payment_reconciliation: registro inexistente';
  end if;
  if v_r.status <> 'pending' then
    raise exception using errcode = '23505',
      message = 'resolve_payment_reconciliation: registro ja resolvido';
  end if;

  update public.external_reconciliation r
     set status = p_status, resolution_note = p_note,
         resolved_by = v_actor, resolved_at = now()
   where r.id = p_reconciliation_id and r.status = 'pending';

  perform public.payment_event_append(
    v_r.intent_id, 'reconciliation_resolved',
    case when p_status = 'matched'
         then 'funding_confirmed'::public.payment_internal_status
         else 'reconciliation_required'::public.payment_internal_status end,
    v_r.transaction_id, null, v_r.expected_amount, v_r.currency_code,
    'reconciliation', v_actor, 'admin', null, null, null, null,
    p_note, 'resolve_payment_reconciliation', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('resolve_payment_reconciliation', p_request_id, v_actor, p_reconciliation_id,
          v_fp, 'accepted', format('reconciliacao resolvida como %s', p_status));

  return p_reconciliation_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
revoke execute on function public.request_escrow_funding(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.confirm_escrow_funding(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.request_escrow_release(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.confirm_escrow_release(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.fail_payment_transaction(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_payment_reconciliation(uuid, text, text, uuid) from public, anon, authenticated;
-- ---------------------------------------------------------------------------
-- PORTA DE WEBHOOK: REVOGADA PARA CLIENTE, CONCEDIDA AO PAPEL DE SERVIDOR
-- (correcao 8.1/b1).
-- ---------------------------------------------------------------------------
-- A revisao anterior revogava de public, anon e authenticated e parava ai. O
-- comentario dizia "so service_role a alcanca", mas isso NAO estava escrito no
-- banco: era uma afirmacao sobre como o Supabase costuma se comportar, nao um
-- privilegio concedido. Um privilegio que nao foi concedido nao existe - e
-- funcao sem grant nenhum e funcao que ninguem chama.
--
-- Agora o privilegio e explicito e minimo: service_role e o papel tecnico do
-- backend hospedado, o unico que a funcao de borda assume ao entregar o aviso
-- do provedor. anon e authenticated continuam SEM acesso, por revoke que vem
-- antes do grant.
--
-- ESCOPO DECLARADO: service_role e alcancado por SET ROLE a partir de
-- authenticator, com a chave de servico, no servidor. Trocar o claim "role" de
-- um JWT NAO e SET ROLE e nao concede este privilegio: o claim e lido por
-- auth.jwt() dentro das funcoes, enquanto has_function_privilege responde sobre
-- o papel de banco efetivo. Os dois nao se confundem, e o teste do lote
-- verifica o segundo, que e o que o PostgreSQL de fato aplica. O limite ja
-- declarado do modelo permanece: quem tem a chave de servico esta fora do
-- adversario contido.
revoke execute on function public.record_provider_webhook(text, text, text, text, timestamptz, bigint, boolean, text, text, text, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_provider_webhook(text, text, text, text, timestamptz, bigint, boolean, text, text, text, numeric, text, uuid)
  to service_role;

grant execute on function public.request_escrow_funding(uuid, uuid) to authenticated;
grant execute on function public.confirm_escrow_funding(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.request_escrow_release(uuid, uuid) to authenticated;
grant execute on function public.confirm_escrow_release(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.fail_payment_transaction(uuid, text, text, uuid) to authenticated;
grant execute on function public.resolve_payment_reconciliation(uuid, text, text, uuid) to authenticated;

commit;
