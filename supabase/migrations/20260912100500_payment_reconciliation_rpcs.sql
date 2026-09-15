-- =============================================================================
-- MODULO 1 (6/6) : reconciliacao  -  abertura manual e resolucao sem adivinhar
-- =============================================================================
-- DEFEITO CORRIGIDO. resolve_payment_reconciliation (20260903100740) levava a
-- intent para funding_confirmed em qualquer 'matched', sem olhar de onde ela
-- veio: (a) regrediria released_confirmed (reconciliacao aberta por disputa)
-- para funding_confirmed; (b) para uma intent que nunca teve aporte confirmado,
-- violaria o CHECK payment_intents_funding_stamp (funding_confirmed sem
-- funding_confirmed_at). Ou seja: errada e quebrada.
--
-- PRINCIPIO NOVO: RESOLUCAO NUNCA CONFIRMA DINHEIRO. Confirmar continua sendo
-- exclusivamente confirm_escrow_* (atestacao com comprovante) ou aviso de
-- provedor. A resolucao (1) fecha o registro; (2) se a abertura pausou a intent
-- (reconciliation_required), RESTAURA o estado anterior, derivado de FATOS;
-- (3) em 'mismatch' com solicitacao pendente, marca essa solicitacao como
-- failed (codigo reconciliation_mismatch) e a intent como failed, abrindo o
-- caminho para retry_failed_payment_transaction.
--
-- ESTADO ANTERIOR (v_prev), derivado de fatos, nesta ordem:
--   1. released_confirmed_at is not null              -> released_confirmed
--   2. existe transacao release em requested          -> release_requested
--   3. funding_confirmed_at is not null               -> funding_confirmed
--   4. existe transacao funding em requested          -> awaiting_funding
--   5. nada disso                                     -> 22023 (fail-closed)
-- e cruzado com previous_status do evento reconciliation_opened mais recente:
-- divergencia -> 22023, estado preservado. Regressao released_confirmed ->
-- funding_confirmed e impossivel por construcao (regra 1 vem primeiro).
--
-- Fontes que NAO pausaram a intent (webhook_incomplete, webhook_out_of_order,
-- provider_statement) resolvem sem mudar estado. Se houver OUTRA reconciliacao
-- pendente para a mesma intent, a intent permanece reconciliation_required.
--
-- ABERTURA MANUAL: open_payment_reconciliation, administrativa e idempotente,
-- para intents em awaiting_funding, funding_confirmed, release_requested ou
-- released_confirmed; uma pendente por vez; pausa a intent registrando o
-- previous_status no evento.
--
-- ACL: default privileges revogados antes dos grants explicitos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ABRIR RECONCILIACAO MANUAL
-- -----------------------------------------------------------------------------
create function public.open_payment_reconciliation(
  p_contract_id     uuid,
  p_source          text,
  p_note            text,
  p_expected_amount numeric,
  p_request_id      uuid,
  p_transaction_id  uuid    default null,
  p_observed_amount numeric default null,
  p_statement_ref   text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('open_payment_reconciliation');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_id    uuid;
begin
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'open_payment_reconciliation: p_contract_id e obrigatorio';
  end if;
  if p_source is null or p_source not in ('manual_review', 'bank_statement') then
    raise exception using errcode = '22023',
      message = 'open_payment_reconciliation: source deve ser manual_review ou bank_statement';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'open_payment_reconciliation: motivo e obrigatorio e precisa de ao menos '
                '10 caracteres';
  end if;
  if p_expected_amount is null or p_expected_amount <= 0 then
    raise exception using errcode = '22023',
      message = 'open_payment_reconciliation: valor esperado deve ser positivo';
  end if;
  if p_observed_amount is not null and p_observed_amount < 0 then
    raise exception using errcode = '22023',
      message = 'open_payment_reconciliation: valor observado nao pode ser negativo';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'source', p_source,
    'expected_amount', p_expected_amount::text,
    'transaction_id', p_transaction_id, 'statement_ref', p_statement_ref));
  v_log := public.rpc_idempotency_probe(
    'open_payment_reconciliation', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select r.id into v_id from public.external_reconciliation r
     where r.intent_id = (select pi.id from public.payment_intents pi where pi.contract_id = p_contract_id)
       and r.opened_by = v_actor
     order by r.opened_at desc limit 1;
    return v_id;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'open_payment_reconciliation: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'open_payment_reconciliation: nao existe intencao de pagamento';
  end if;
  if v_i.internal_status not in ('awaiting_funding'::public.payment_internal_status,
                                 'funding_confirmed'::public.payment_internal_status,
                                 'release_requested'::public.payment_internal_status,
                                 'released_confirmed'::public.payment_internal_status) then
    raise exception using errcode = '22023',
      message = format('open_payment_reconciliation: pagamento em %s; nao ha o que '
                       'reconciliar neste estado', v_i.internal_status);
  end if;
  if exists (select 1 from public.external_reconciliation r
              where r.intent_id = v_i.id and r.status = 'pending') then
    raise exception using errcode = '22023',
      message = 'open_payment_reconciliation: ja existe reconciliacao pendente para este '
                'pagamento; resolva-a antes de abrir outra';
  end if;
  if p_transaction_id is not null then
    select * into v_tx from public.payment_transactions t
     where t.id = p_transaction_id and t.intent_id = v_i.id for update;
    if not found then
      raise exception using errcode = '22023',
        message = 'open_payment_reconciliation: a transacao informada nao pertence a este '
                  'pagamento';
    end if;
  end if;

  insert into public.external_reconciliation (
    intent_id, transaction_id, source, statement_ref, currency_code,
    expected_amount, observed_amount, status, opened_by
  ) values (
    v_i.id, p_transaction_id, p_source, p_statement_ref, v_i.currency_code,
    p_expected_amount, p_observed_amount, 'pending', v_actor)
  returning id into v_id;

  -- pausa a intent; previous_status fica no evento e e a ancora da restauracao
  perform public.payment_event_append(
    v_i.id, 'reconciliation_opened',
    'reconciliation_required'::public.payment_internal_status,
    p_transaction_id, null, p_expected_amount, v_i.currency_code,
    'reconciliation', v_actor, 'admin', null, p_statement_ref, null, null,
    format('Reconciliacao %s aberta por administrador. %s', p_source, p_note),
    'open_payment_reconciliation', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'reconciliation_required'::public.contract_lifecycle_transition,
    v_c.status, 'reconciliation_required', null, null, v_i.id, null, p_expected_amount,
    v_actor, 'admin', format('Reconciliacao %s aberta por administrador.', p_source),
    'open_payment_reconciliation', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('open_payment_reconciliation', p_request_id, v_actor, p_contract_id, v_fp,
          'accepted', format('reconciliacao %s aberta: %s', p_source, v_id));

  return v_id;
end;
$fn$;

comment on function public.open_payment_reconciliation(uuid, text, text, numeric, uuid, uuid, numeric, text) is
  'Administrativa. Abre reconciliacao manual_review ou bank_statement para a intent '
  'do contrato, pausando-a em reconciliation_required e gravando o estado anterior '
  'no evento. Uma pendente por vez. Idempotente por request_id.';

-- -----------------------------------------------------------------------------
-- 2. RESOLVER RECONCILIACAO  (mesma assinatura de 20260903100740)
-- -----------------------------------------------------------------------------
create or replace function public.resolve_payment_reconciliation(
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
  v_actor  uuid := public.require_steelgo_admin('resolve_payment_reconciliation');
  v_r      public.external_reconciliation%rowtype;
  v_i      public.payment_intents%rowtype;
  v_c      public.contracts%rowtype;
  v_fp     text;
  v_log    public.rpc_call_log%rowtype;
  v_prev   public.payment_internal_status;
  v_evprev public.payment_internal_status;
  v_pend_tx public.payment_transactions%rowtype;
  v_others int;
  v_new    public.payment_internal_status;
  v_escrow text;
  v_now    timestamptz := now();
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

  -- locks na ordem homologada: contrato -> intent -> registro -> transacao
  select * into v_r from public.external_reconciliation r
   where r.id = p_reconciliation_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'resolve_payment_reconciliation: registro inexistente';
  end if;
  select * into v_i from public.payment_intents pi where pi.id = v_r.intent_id;
  select * into v_c from public.contracts c where c.id = v_i.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.id = v_r.intent_id for update;
  select * into v_r from public.external_reconciliation r
   where r.id = p_reconciliation_id for update;
  if v_r.status <> 'pending' then
    raise exception using errcode = '23505',
      message = 'resolve_payment_reconciliation: registro ja resolvido';
  end if;

  -- a transacao pendente da intent, se houver (no maximo uma por desenho)
  select * into v_pend_tx from public.payment_transactions t
   where t.intent_id = v_i.id
     and t.status = 'requested'::public.payment_transaction_status
   order by t.requested_at desc limit 1 for update;

  -- registro resolvido: sem UPDATE em nada alem do proprio registro
  update public.external_reconciliation r
     set status = p_status, resolution_note = p_note,
         resolved_by = v_actor, resolved_at = v_now
   where r.id = p_reconciliation_id and r.status = 'pending';

  select count(*) into v_others from public.external_reconciliation r
   where r.intent_id = v_i.id and r.status = 'pending';

  if v_i.internal_status <> 'reconciliation_required'::public.payment_internal_status then
    -- A abertura nao pausou a intent (webhook_incomplete, out_of_order,
    -- provider_statement): resolver nao muda estado algum.
    v_new := v_i.internal_status;
  elsif v_others > 0 then
    -- Outra reconciliacao pendente mantem a pausa.
    v_new := v_i.internal_status;
  else
    -- ESTADO ANTERIOR derivado de FATOS, cruzado com o evento de abertura.
    if v_i.released_confirmed_at is not null then
      v_prev := 'released_confirmed';
    elsif v_pend_tx.id is not null and v_pend_tx.kind = 'release'::public.payment_transaction_kind then
      v_prev := 'release_requested';
    elsif v_i.funding_confirmed_at is not null then
      v_prev := 'funding_confirmed';
    elsif v_pend_tx.id is not null and v_pend_tx.kind = 'funding'::public.payment_transaction_kind then
      v_prev := 'awaiting_funding';
    else
      raise exception using errcode = '22023',
        message = 'resolve_payment_reconciliation: o estado anterior a reconciliacao nao '
                  'pode ser determinado pelos fatos; estado preservado. Nada foi alterado.';
    end if;
    select e.previous_status into v_evprev from public.payment_events e
     where e.intent_id = v_i.id and e.event_type = 'reconciliation_opened'
     order by e.created_at desc, e.id desc limit 1;
    -- Um evento de abertura com previous_status = reconciliation_required e uma
    -- segunda abertura sobre intent ja pausada: nao informa o estado original,
    -- e os fatos acima decidem sozinhos.
    if v_evprev is not null
       and v_evprev <> 'reconciliation_required'::public.payment_internal_status
       and v_evprev is distinct from v_prev then
      raise exception using errcode = '22023',
        message = format('resolve_payment_reconciliation: o evento de abertura registra %s, '
                         'mas os fatos indicam %s; estado preservado. Nada foi alterado.',
                         v_evprev, v_prev);
    end if;

    if p_status = 'mismatch'
       and v_prev in ('awaiting_funding'::public.payment_internal_status,
                      'release_requested'::public.payment_internal_status)
       and v_pend_tx.id is not null then
      -- Divergencia real sobre solicitacao pendente: a solicitacao falha,
      -- integralmente preservada como registro, e o retry fica disponivel.
      update public.payment_transactions t
         set status = 'failed', failure_code = 'reconciliation_mismatch',
             failure_reason = p_note
       where t.id = v_pend_tx.id and t.status = 'requested';
      if not found then
        raise exception using errcode = '40001',
          message = 'resolve_payment_reconciliation: a transacao mudou de estado durante '
                    'a operacao';
      end if;
      v_new := 'failed';
    else
      -- matched / written_off, ou mismatch sobre pagamento ja confirmado:
      -- restaura o estado anterior. Nada e confirmado aqui.
      v_new := v_prev;
    end if;
  end if;

  -- evento: sempre registrado; move a intent para v_new (pode ser o mesmo estado)
  -- Quando a resolucao FALHA a solicitacao pendente, o evento cita ESSA
  -- transacao: e ela que retry_failed_payment_transaction encontra na trilha.
  perform public.payment_event_append(
    v_i.id, 'reconciliation_resolved', v_new,
    case when v_new = 'failed' then v_pend_tx.id else v_r.transaction_id end,
    null, v_r.expected_amount, v_r.currency_code,
    'reconciliation', v_actor, 'admin', null, v_r.statement_ref,
    case when v_new = 'failed' then 'reconciliation_mismatch' else null end,
    case when v_new = 'failed' then p_note else null end,
    format('Reconciliacao %s resolvida como %s. %s', v_r.source, p_status, p_note),
    'resolve_payment_reconciliation', p_request_id, v_fp);

  -- ciclo do contrato: so quando o escrow espelhado muda
  if v_new is distinct from v_i.internal_status then
    v_escrow := v_new::text;
    if v_new = 'failed' then
      perform public.contract_lifecycle_append(
        v_c.id, 'payment_failed'::public.contract_lifecycle_transition,
        v_c.status, 'failed', null, null, v_i.id, null, v_r.expected_amount,
        v_actor, 'admin', 'Reconciliacao resolvida como mismatch: solicitacao falhou.',
        'resolve_payment_reconciliation', p_request_id, v_fp);
    else
      perform public.contract_lifecycle_append(
        v_c.id,
        case v_new
          when 'awaiting_funding'   then 'escrow_funding_requested'
          when 'funding_confirmed'  then 'escrow_funding_confirmed'
          when 'release_requested'  then 'escrow_release_requested'
          when 'released_confirmed' then 'escrow_release_confirmed'
        end::public.contract_lifecycle_transition,
        v_c.status, v_escrow, null,
        case when v_new in ('funding_confirmed', 'released_confirmed')
             then coalesce(v_i.released_confirmed_at, v_i.funding_confirmed_at) else null end,
        v_i.id, null, v_r.expected_amount,
        v_actor, 'admin',
        format('Reconciliacao resolvida como %s: estado anterior (%s) restaurado. '
               'Nenhum valor foi confirmado por esta operacao.', p_status, v_new),
        'resolve_payment_reconciliation', p_request_id, v_fp);
    end if;
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('resolve_payment_reconciliation', p_request_id, v_actor, p_reconciliation_id,
          v_fp, 'accepted', format('reconciliacao resolvida como %s; intent %s -> %s',
                                   p_status, v_i.internal_status, v_new));
  return p_reconciliation_id;
end;
$fn$;

comment on function public.resolve_payment_reconciliation(uuid, text, text, uuid) is
  'Administrativa. Fecha a reconciliacao e restaura o estado anterior da intent '
  'derivado de fatos (nunca confirma dinheiro; nunca regride released_confirmed). '
  'mismatch sobre solicitacao pendente marca a transacao como failed. Idempotente.';

-- -----------------------------------------------------------------------------
-- ACL
-- -----------------------------------------------------------------------------
revoke all on function public.open_payment_reconciliation(uuid, text, text, numeric, uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_payment_reconciliation(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.open_payment_reconciliation(uuid, text, text, numeric, uuid, uuid, numeric, text)
  to authenticated, service_role;
grant execute on function public.resolve_payment_reconciliation(uuid, text, text, uuid)
  to authenticated, service_role;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.open_payment_reconciliation(uuid, text, text, numeric, uuid, uuid, numeric, text)',
    'public.resolve_payment_reconciliation(uuid, text, text, uuid)'] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute')
       or not has_function_privilege('postgres', v_fn, 'execute')
       or exists (select 1 from pg_proc p
                   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception '%: ACL inesperada', v_fn;
    end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('open_payment_reconciliation', 'resolve_payment_reconciliation')) <> 2 then
    raise exception 'reconciliacao: quantidade de overloads inesperada';
  end if;
end $$;
