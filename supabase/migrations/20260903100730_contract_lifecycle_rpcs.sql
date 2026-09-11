-- =============================================================================
-- REV8.1 10/13 : RPC PUBLICA DE CONCLUSAO DA ENTREGA
-- =============================================================================
-- ORDENACAO (correcao 8.1). Depende de public.contract_party_of, criada em
-- 20260903100500, e de public.try_complete_contract, criada em
-- 20260903100452. As duas ja existem quando este arquivo roda.
--
-- Fato OPERACIONAL puro: nao toca em dinheiro. Se a liberacao ja estiver
-- confirmada, chama try_complete_contract e o contrato fecha na mesma transacao.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- CONCLUSAO DA ENTREGA  -  ato da transportadora
-- -----------------------------------------------------------------------------
create function public.complete_contract_delivery(
  p_contract_id uuid,
  p_request_id  uuid
)
returns table (
  affected_contract_id uuid,
  new_status           public.contract_status,
  new_escrow_status    text,
  delivery_at          timestamptz,
  contract_completed   boolean,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c     public.contracts%rowtype;
  v_party text;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_now   timestamptz := now();
  v_done  boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'complete_contract_delivery: chamador nao autenticado';
  end if;
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'complete_contract_delivery: p_contract_id e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object('contract_id', p_contract_id));
  v_log := public.rpc_idempotency_probe(
    'complete_contract_delivery', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    return query select v_c.id, v_c.status, v_c.escrow_status,
                        v_c.delivery_completed_at,
                        v_c.status = 'completed'::public.contract_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'complete_contract_delivery: contrato inexistente';
  end if;

  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is distinct from 'carrier' then
    raise exception using errcode = '42501',
      message = 'complete_contract_delivery: somente a transportadora do contrato '
                'conclui a entrega';
  end if;

  if v_c.status is distinct from 'active'::public.contract_status then
    raise exception using errcode = '22023',
      message = format('complete_contract_delivery: contrato em %s; somente '
                       'contrato active tem entrega a concluir',
                       coalesce(v_c.status::pg_catalog.text, 'nulo'));
  end if;
  if v_c.delivery_completed_at is not null then
    raise exception using errcode = '23505',
      message = 'complete_contract_delivery: entrega ja concluida; conclusao nao '
                'e substituida';
  end if;

  update public.contracts c
     set delivery_completed_at = v_now,
         delivery_completed_by = v_actor
   where c.id = p_contract_id
     and c.status = 'active'::public.contract_status
     and c.delivery_completed_at is null;
  if not found then
    raise exception using errcode = '40001',
      message = 'complete_contract_delivery: o contrato mudou de estado durante a '
                'operacao; nada foi gravado';
  end if;

  perform public.contract_lifecycle_append(
    p_contract_id, 'delivery_completed'::public.contract_lifecycle_transition,
    'active'::public.contract_status, v_c.escrow_status,
    v_now, null, null, null, null,
    v_actor, 'party',
    'Entrega declarada concluida pela transportadora.',
    'complete_contract_delivery', p_request_id, v_fp);

  -- SEGUNDA CONDICAO? Se o pagamento ja estiver liberado e confirmado, o
  -- contrato fecha AGORA, na mesma transacao.
  v_done := public.try_complete_contract(
    p_contract_id, v_actor, 'party', 'complete_contract_delivery', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('complete_contract_delivery', p_request_id, v_actor, p_contract_id, v_fp,
          'accepted',
          format('entrega concluida; contrato %s',
                 case when v_done then 'CONCLUIDO na mesma transacao'
                      else 'segue active, aguardando liberacao confirmada' end));

  select * into v_c from public.contracts c where c.id = p_contract_id;
  return query select p_contract_id, v_c.status, v_c.escrow_status,
                      v_c.delivery_completed_at, v_done, false;
end;
$fn$;

revoke execute on function public.complete_contract_delivery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_contract_delivery(uuid, uuid) to authenticated;

comment on function public.complete_contract_delivery(uuid, uuid) is
  'Conclusao da ENTREGA pela transportadora. Fato operacional puro: nao toca em '
  'dinheiro. Se a liberacao ja estiver confirmada, chama try_complete_contract e '
  'o contrato fecha na mesma transacao.';

commit;
