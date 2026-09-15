-- =============================================================================
-- MODULO 1 (5/6) : retry_failed_payment_transaction  -  falha nao e terminal
-- =============================================================================
-- Ate aqui, payment_intents.internal_status = 'failed' era um beco sem saida:
-- request_escrow_funding exige pending_provider, ensure_payment_intent devolve a
-- intent existente em failed e nenhuma RPC a reabria. Esta RPC, administrativa
-- e idempotente, cria uma NOVA solicitacao para a etapa que falhou.
--
-- REGRAS:
--   * a etapa (funding ou release) e DERIVADA NO SERVIDOR da transacao mais
--     recente da intent - "mais recente" segundo a cadeia append-only de
--     payment_events, nunca por timestamp -, que precisa estar 'failed'.
--     Nenhum parametro de etapa e aceito;
--   * a transacao fracassada e PRESERVADA integralmente (status, failure_code,
--     failure_reason). Nao ha UPDATE que "apague" a falha;
--   * uma nova transacao 'requested' e inserida, com alocacoes iguais as da
--     solicitacao original (funding: shipper integral; release: platform +
--     carrier);
--   * a intent volta a awaiting_funding ou release_requested; o contrato
--     recebe o evento de ciclo correspondente (a matriz de
--     contract_lifecycle_events aceita escrow_*_requested a partir de failed);
--   * liberacao continua bloqueada por disputa (release_blocked_by_dispute);
--   * estados ambiguos ou incoerentes sao RECUSADOS (22023), nunca adivinhados;
--   * ordem de locks homologada: contracts -> payment_intents ->
--     payment_transactions;
--   * idempotencia por rpc_idempotency_probe com fingerprint
--     {contract_id, failed_transaction_id}; replay devolve was_replayed = true
--     sem escrever.
-- =============================================================================

create function public.retry_failed_payment_transaction(
  p_contract_id uuid,
  p_note        text,
  p_request_id  uuid
)
returns table (
  affected_contract_id  uuid,
  intent_id             uuid,
  failed_transaction_id uuid,
  new_transaction_id    uuid,
  retried_kind          public.payment_transaction_kind,
  new_internal_status   public.payment_internal_status,
  was_replayed          boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor  uuid := public.require_steelgo_admin('retry_failed_payment_transaction');
  v_c      public.contracts%rowtype;
  v_i      public.payment_intents%rowtype;
  v_last   public.payment_transactions%rowtype;
  v_failed public.payment_transactions%rowtype;
  v_fp     text;
  v_log    public.rpc_call_log%rowtype;
  v_new    uuid;
  v_pend   int;
  v_now    timestamptz := now();
begin
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'retry_failed_payment_transaction: p_contract_id e obrigatorio';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'retry_failed_payment_transaction: nota e obrigatoria e precisa de ao '
                'menos 10 caracteres';
  end if;

  -- 1. locks na ordem homologada
  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'retry_failed_payment_transaction: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'retry_failed_payment_transaction: nao existe intencao de pagamento';
  end if;

  -- 2. ORDEM DOS FATOS PELA TRILHA, NAO POR TIMESTAMP. requested_at e created_at
  --    recebem now(), que e o MESMO instante para tudo que acontece dentro de
  --    uma transacao; ordenar por eles empataria e o desempate por id (uuid
  --    aleatorio) seria sorte. A ordem autoritativa e a cadeia append-only de
  --    payment_events: intent.last_event_id -> previous_event_id -> ... Cada
  --    evento cita a transacao sobre a qual agiu.
  --
  --    Intent sem trilha e estado incoerente: fail-closed.
  if v_i.last_event_id is null then
    raise exception using errcode = '22023',
      message = 'retry_failed_payment_transaction: a intencao nao tem trilha de eventos; '
                'estado incoerente, nada foi refeito';
  end if;
  --    v_failed = transacao citada pelo evento mais recente que levou a intent a
  --    'failed' (fail_payment_transaction ou reconciliacao mismatch). Ancora
  --    estavel da idempotencia: depois do retry continua sendo a mesma.
  select t.* into v_failed
    from public.payment_transactions t
   where t.id = (
     with recursive chain as (
       select e.id, e.previous_event_id, e.new_status, e.transaction_id, 0 as depth
         from public.payment_events e
        where e.id = v_i.last_event_id
       union all
       select e.id, e.previous_event_id, e.new_status, e.transaction_id, c.depth + 1
         from public.payment_events e
         join chain c on e.id = c.previous_event_id
        where c.depth < 10000)
     select c.transaction_id from chain c
      where c.new_status = 'failed'::public.payment_internal_status
        and c.transaction_id is not null
      order by c.depth limit 1)
     and t.status = 'failed'::public.payment_transaction_status
   for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'retry_failed_payment_transaction: nao ha transacao falhada nesta intencao';
  end if;

  -- 3. idempotencia: a impressao digital cita a transacao fracassada
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'failed_transaction_id', v_failed.id));
  v_log := public.rpc_idempotency_probe(
    'retry_failed_payment_transaction', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    -- replay: devolve o estado atual, sem escrever. A nova transacao e a de
    -- idempotency_key = request_id, gravada na chamada original.
    select t.id into v_new from public.payment_transactions t
     where t.idempotency_key = p_request_id;
    return query select p_contract_id, v_i.id, v_failed.id, v_new,
                        v_failed.kind, v_i.internal_status, true;
    return;
  end if;

  -- v_last = transacao citada pelo evento MAIS RECENTE da trilha que cite alguma
  -- transacao; precisa ser a propria falhada, senao o estado e ambiguo.
  select t.* into v_last
    from public.payment_transactions t
   where t.id = (
     with recursive chain as (
       select e.id, e.previous_event_id, e.transaction_id, 0 as depth
         from public.payment_events e
        where e.id = v_i.last_event_id
       union all
       select e.id, e.previous_event_id, e.transaction_id, c.depth + 1
         from public.payment_events e
         join chain c on e.id = c.previous_event_id
        where c.depth < 10000)
     select c.transaction_id from chain c
      where c.transaction_id is not null
      order by c.depth limit 1);
  if v_last.id is null or v_last.id is distinct from v_failed.id then
    raise exception using errcode = '22023',
      message = format('retry_failed_payment_transaction: a transacao mais recente (%s) '
                       'nao e a falhada; estado ambiguo, nada foi refeito', v_last.status);
  end if;

  -- 4. estados ambiguos ou incompativeis: recusa, nunca adivinha
  if v_i.internal_status is distinct from 'failed'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('retry_failed_payment_transaction: pagamento em %s; somente '
                       'uma falha pode ser refeita', v_i.internal_status);
  end if;
  if v_last.status is distinct from 'failed'::public.payment_transaction_status then
    raise exception using errcode = '22023',
      message = format('retry_failed_payment_transaction: a transacao mais recente '
                       'esta em %s, nao em failed; estado ambiguo', v_last.status);
  end if;
  select count(*) into v_pend from public.payment_transactions t
   where t.intent_id = v_i.id
     and t.status in ('requested'::public.payment_transaction_status,
                      'pending_provider'::public.payment_transaction_status);
  if v_pend > 0 then
    raise exception using errcode = '22023',
      message = 'retry_failed_payment_transaction: existe transacao pendente; estado '
                'ambiguo, nada foi refeito';
  end if;
  if v_last.kind not in ('funding'::public.payment_transaction_kind,
                         'release'::public.payment_transaction_kind) then
    raise exception using errcode = '22023',
      message = format('retry_failed_payment_transaction: transacao de tipo %s nao e '
                       'refeita por esta RPC', v_last.kind);
  end if;
  if v_last.kind = 'release'::public.payment_transaction_kind then
    if v_i.funding_confirmed_at is null then
      raise exception using errcode = '22023',
        message = 'retry_failed_payment_transaction: liberacao falhada sem aporte '
                  'confirmado; estado incoerente, nada foi refeito';
    end if;
    if v_i.release_blocked_by_dispute then
      raise exception using errcode = '22023',
        message = 'retry_failed_payment_transaction: liberacao suspensa por disputa '
                  'aberta';
    end if;
  end if;
  if v_c.status is distinct from 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('retry_failed_payment_transaction: contrato em %s; so contrato '
                       'ativo recebe nova solicitacao', v_c.status);
  end if;

  -- 5. nova solicitacao, sem tocar na fracassada
  insert into public.payment_transactions (
    intent_id, kind, status, currency_code, amount, provider_code,
    requested_by, idempotency_key
  ) values (
    v_i.id, v_last.kind, 'requested', v_i.currency_code, v_i.gross_amount,
    v_i.provider_code, v_actor, p_request_id
  )
  returning id into v_new;

  if v_last.kind = 'funding'::public.payment_transaction_kind then
    insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
    values (v_new, 'shipper', v_c.shipper_company_id, v_i.gross_amount,
            'Aporte solicitado novamente apos falha.');
    update public.payment_intents pi
       set requested_by = v_actor, requested_at = v_now,
           failure_code = null, failure_reason = null
     where pi.id = v_i.id;
  else
    insert into public.payment_allocations (transaction_id, party_kind, company_id, amount, note)
    values (v_new, 'platform', null, v_i.platform_fee_amount,
            'Taxa comercial da plataforma SteelGo (nova solicitacao apos falha).'),
           (v_new, 'carrier', v_c.carrier_company_id, v_i.carrier_net_amount,
            'Repasse liquido a transportadora (nova solicitacao apos falha).');
    update public.payment_intents pi
       set release_requested_by = v_actor, release_requested_at = v_now,
           failure_code = null, failure_reason = null
     where pi.id = v_i.id;
  end if;

  -- 6. trilha
  perform public.payment_event_append(
    v_i.id, 'retry_requested',
    case when v_last.kind = 'funding'::public.payment_transaction_kind
         then 'awaiting_funding'::public.payment_internal_status
         else 'release_requested'::public.payment_internal_status end,
    v_new, null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', null, null, null, null,
    format('Nova solicitacao de %s apos falha da transacao %s (%s). %s',
           v_last.kind, v_last.id, coalesce(v_last.failure_code, 'sem codigo'), p_note),
    'retry_failed_payment_transaction', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id,
    case when v_last.kind = 'funding'::public.payment_transaction_kind
         then 'escrow_funding_requested'::public.contract_lifecycle_transition
         else 'escrow_release_requested'::public.contract_lifecycle_transition end,
    v_c.status,
    case when v_last.kind = 'funding'::public.payment_transaction_kind
         then 'awaiting_funding' else 'release_requested' end,
    null, null, v_i.id, null, v_i.gross_amount,
    v_actor, 'admin',
    format('Solicitacao de %s refeita por administrador apos falha.', v_last.kind),
    'retry_failed_payment_transaction', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('retry_failed_payment_transaction', p_request_id, v_actor, p_contract_id, v_fp,
          'accepted', format('%s refeito: transacao falhada %s preservada, nova %s',
                             v_last.kind, v_last.id, v_new));

  select * into v_i from public.payment_intents pi where pi.id = v_i.id;
  return query select p_contract_id, v_i.id, v_last.id, v_new, v_last.kind,
                      v_i.internal_status, false;
end;
$fn$;

comment on function public.retry_failed_payment_transaction(uuid, text, uuid) is
  'Administrativa. Cria nova solicitacao (funding ou release, derivada da transacao '
  'mais recente, que precisa estar failed) preservando a fracassada. Idempotente por '
  'request_id. Recusa estados ambiguos.';

revoke all on function public.retry_failed_payment_transaction(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.retry_failed_payment_transaction(uuid, text, uuid)
  to authenticated, service_role;

do $$
declare v_fn text := 'public.retry_failed_payment_transaction(uuid, text, uuid)';
begin
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or not has_function_privilege('postgres', v_fn, 'execute')
     or exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or (select count(*) from pg_proc where proname = 'retry_failed_payment_transaction'
           and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'retry_failed_payment_transaction: ACL ou overload inesperado';
  end if;
end $$;
