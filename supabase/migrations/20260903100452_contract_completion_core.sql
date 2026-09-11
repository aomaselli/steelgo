-- =============================================================================
-- REV8.1 7/13 : NUCLEO DA CONCLUSAO DO CONTRATO
-- =============================================================================
-- ORDENACAO (correcao 8.1). Este arquivo vem ANTES de 20260903100500 porque
-- sign_contract, la dentro, chama public.contract_lifecycle_append. Na ordem
-- anterior essa era uma referencia PARA FRENTE: funcionava so por resolucao
-- tardia do plpgsql, e qualquer chamada feita entre as duas migrations teria
-- falhado. Agora nao existe nenhuma referencia para frente em todo o lote.
--
-- Aqui ficam apenas as pecas que dependem SOMENTE de schema:
--   * contracts_enforce_completion  - o gatilho estrutural da conclusao;
--   * contract_lifecycle_append     - grava evento e move estado e ponteiro;
--   * try_complete_contract         - a UNICA porta para 'completed'.
--
-- A RPC publica complete_contract_delivery fica em 20260903100730, depois de
-- 20260903100500, porque depende de public.contract_party_of.
--
-- ENTREGA E PAGAMENTO SAO FATOS INDEPENDENTES, e a ordem entre eles pode variar.
-- Quem satisfaz a SEGUNDA condicao fecha o contrato, na mesma transacao.
--
-- Tres camadas de garantia, deliberadamente redundantes:
--   1. a matriz de transicao de contract_lifecycle_events impede que EXISTA um
--      evento 'completed' sem entrega concluida e liberacao confirmada;
--   2. o gatilho contracts_enforce_completion impede que contracts.status vire
--      'completed' sem os dois fatos - qualquer que seja a funcao que tente;
--   3. as proprias RPCs verificam antes de tentar, para dar erro legivel.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- GARANTIA 2 - o trigger. Le a fonte AUTORITATIVA do estado financeiro
-- (payment_intents), nao o espelho contracts.escrow_status.
-- -----------------------------------------------------------------------------
create function public.contracts_enforce_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_released boolean;
begin
  if NEW.status = 'completed'::public.contract_status
     and OLD.status is distinct from 'completed'::public.contract_status then

    if NEW.delivery_completed_at is null then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido sem entrega '
                  'concluida. Entrega e pagamento sao fatos independentes e os '
                  'DOIS sao necessarios.';
    end if;

    select (pi.internal_status = 'released_confirmed'::public.payment_internal_status)
      into v_released
      from public.payment_intents pi
     where pi.contract_id = NEW.id;

    if not coalesce(v_released, false) then
      raise exception using errcode = '23514',
        message = 'public.contracts: contrato nao pode ser concluido sem '
                  'liberacao de pagamento CONFIRMADA. Solicitacao registrada nao '
                  'e confirmacao.';
    end if;
  end if;

  return NEW;
end;
$fn$;

create trigger contracts_enforce_completion_trg
  before update on public.contracts
  for each row execute function public.contracts_enforce_completion();

comment on function public.contracts_enforce_completion() is
  'Impede contracts.status = completed sem entrega concluida E sem '
  'payment_intents.internal_status = released_confirmed. Vale para QUALQUER '
  'funcao, inclusive as que ainda nao existem. coalesce(..., false) e '
  'obrigatorio: intent ausente produziria NULL e a guarda falharia ABERTA.';

-- -----------------------------------------------------------------------------
-- Helper interno: grava o evento e move estado e ponteiro juntos.
-- -----------------------------------------------------------------------------
create function public.contract_lifecycle_append(
  p_contract_id      uuid,
  p_transition       public.contract_lifecycle_transition,
  p_new_status       public.contract_status,
  p_new_escrow       text,
  p_delivery_at      timestamptz,
  p_escrow_confirmed_at timestamptz,
  p_intent_id        uuid,
  p_dispute_case_id  uuid,
  p_amount           numeric,
  p_actor_id         uuid,
  p_actor_kind       text,
  p_reason           text,
  p_rpc_name         text,
  p_request_id       uuid,
  p_fingerprint      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_c     public.contracts%rowtype;
  v_event uuid;
begin
  -- O chamador ja travou a linha. Aqui apenas se le o estado corrente.
  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'contract_lifecycle_append: contrato inexistente';
  end if;

  insert into public.contract_lifecycle_events (
    contract_id, previous_event_id, transition,
    previous_status, new_status, previous_escrow_status, new_escrow_status,
    delivery_completed_at, escrow_confirmed_at, payment_intent_id,
    dispute_case_id, amount_brl,
    actor_id, actor_kind, reason, rpc_name, request_id, params_fingerprint
  ) values (
    p_contract_id, v_c.last_lifecycle_event_id, p_transition,
    v_c.status, p_new_status, v_c.escrow_status, p_new_escrow,
    p_delivery_at, p_escrow_confirmed_at, p_intent_id,
    p_dispute_case_id, p_amount,
    p_actor_id, p_actor_kind, p_reason, p_rpc_name, p_request_id, p_fingerprint
  )
  returning id into v_event;

  update public.contracts c
     set status                  = p_new_status,
         escrow_status           = p_new_escrow,
         last_lifecycle_event_id = v_event,
         completed_at            = case
             when p_transition = 'completed'::public.contract_lifecycle_transition
               then coalesce(c.completed_at, now())
             else c.completed_at end
   where c.id = p_contract_id;

  return v_event;
end;
$fn$;

revoke execute on function public.contract_lifecycle_append(uuid, public.contract_lifecycle_transition, public.contract_status, text, timestamptz, timestamptz, uuid, uuid, numeric, uuid, text, text, text, uuid, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A UNICA porta para 'completed'.
-- -----------------------------------------------------------------------------
-- Chamada pelas DUAS pontas - pela conclusao da entrega e pela confirmacao da
-- liberacao. Devolve true quando de fato concluiu. Nao levanta quando as
-- condicoes ainda nao estao dadas: nesse caso simplesmente nao ha o que fazer.
create function public.try_complete_contract(
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
  if v_intent.internal_status is distinct from 'released_confirmed'::public.payment_internal_status then
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
    'completed'::public.contract_status, 'released_confirmed',
    v_c.delivery_completed_at, v_intent.released_confirmed_at, v_intent.id,
    null, v_intent.gross_amount,
    p_actor_id, p_actor_kind,
    'Entrega concluida e liberacao confirmada: as duas condicoes satisfeitas.',
    p_rpc_name, p_request_id, p_fingerprint);

  return true;
end;
$fn$;

revoke execute on function public.try_complete_contract(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;

comment on function public.try_complete_contract(uuid, uuid, text, text, uuid, text) is
  'UNICA porta para contracts.status = completed. Chamada tanto pela conclusao '
  'da entrega quanto pela confirmacao da liberacao: a ordem pode variar, e quem '
  'satisfaz a segunda condicao fecha o contrato na mesma transacao.';

commit;
