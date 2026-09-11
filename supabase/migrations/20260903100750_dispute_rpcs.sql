-- =============================================================================
-- REV8.1 12/13 : RPCs DE DISPUTA
-- =============================================================================
-- REGRAS APLICADAS, todas exigidas e todas testadas:
--   * embarcador e transportadora abrem disputa SOMENTE em contrato do qual
--     participem; motorista abre quando estiver vinculado ao contrato;
--   * administrador NAO fabrica alegacao em nome da parte - nao existe caminho
--     nesta migration em que um admin insira dispute_claims, e o CHECK
--     dispute_claims_author_is_party recusa o papel admin_reviewer;
--   * nenhuma parte altera ou apaga evidencia ja apresentada - as tabelas sao
--     append-only por trigger, e nao ha RPC de edicao;
--   * decisao somente por administrador autorizado;
--   * a soma das alocacoes fecha EXATAMENTE o valor decidido, por constraint
--     trigger diferida;
--   * motivo e fundamentacao obrigatorios;
--   * decisoes append-only: correcao por NOVA decisao que cita a anterior;
--   * a abertura da disputa SUSPENDE liberacao ainda nao confirmada;
--   * pagamento JA CONFIRMADO nao e desfeito por mudanca de status - gera
--     reconciliacao;
--   * o contrato so vai para 'disputed' por esta RPC, vinculada a um caso real;
--   * o encerramento atualiza o contrato de forma coerente.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Helper interno: papel do ator no caso, derivado do CONTRATO.
-- -----------------------------------------------------------------------------
-- Devolve 'claimant' para embarcador ou transportadora participante, 'driver'
-- para o motorista vinculado, e nulo para qualquer outra pessoa. Administrador
-- NAO recebe papel de parte aqui - de proposito.
create function public.contract_dispute_role(p_contract_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c     public.contracts%rowtype;
  v_party text;
begin
  if v_actor is null then
    return null;
  end if;
  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then
    return null;
  end if;

  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is not null then
    return 'claimant';
  end if;
  if v_c.driver_id is not null and v_c.driver_id = v_actor then
    return 'driver';
  end if;
  return null;
end;
$fn$;

revoke execute on function public.contract_dispute_role(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Helper interno: grava evento do caso e move estado e ponteiro juntos.
-- -----------------------------------------------------------------------------
create function public.dispute_event_append(
  p_case_id     uuid,
  p_event_type  text,
  p_new_status  public.dispute_status,
  p_decision_id uuid,
  p_evidence_id uuid,
  p_claim_id    uuid,
  p_actor_id    uuid,
  p_actor_kind  text,
  p_note        text,
  p_rpc_name    text,
  p_request_id  uuid,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_case  public.dispute_cases%rowtype;
  v_event uuid;
begin
  select * into v_case from public.dispute_cases d where d.id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'dispute_event_append: caso inexistente';
  end if;

  insert into public.dispute_events (
    case_id, previous_event_id, event_type, previous_status, new_status,
    decision_id, evidence_id, claim_id, actor_id, actor_kind, note,
    rpc_name, request_id, params_fingerprint
  ) values (
    p_case_id, v_case.last_event_id, p_event_type, v_case.status, p_new_status,
    p_decision_id, p_evidence_id, p_claim_id, p_actor_id, p_actor_kind, p_note,
    p_rpc_name, p_request_id, p_fingerprint
  )
  returning id into v_event;

  update public.dispute_cases d
     set status = p_new_status, last_event_id = v_event, updated_at = now()
   where d.id = p_case_id;

  return v_event;
end;
$fn$;

revoke execute on function public.dispute_event_append(uuid, text, public.dispute_status, uuid, uuid, uuid, uuid, text, text, text, uuid, text)
  from public, anon, authenticated;

-- =============================================================================
-- 1. ABERTURA DE CASO
-- =============================================================================
create function public.open_dispute_case(
  p_contract_id     uuid,
  p_reason_code     public.dispute_reason_code,
  p_description     text,
  p_disputed_amount numeric,
  p_statement       text,
  p_request_id      uuid
)
returns table (
  case_id       uuid,
  case_number   text,
  dispute_state public.dispute_status,
  release_suspended boolean,
  was_replayed  boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_role  text;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_case  uuid;
  v_num   text;
  v_claim uuid;
  v_susp  boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'open_dispute_case: chamador nao autenticado';
  end if;
  if p_contract_id is null or p_reason_code is null then
    raise exception using errcode = '22004',
      message = 'open_dispute_case: contrato e motivo sao obrigatorios';
  end if;
  if p_description is null or length(btrim(p_description)) < 20 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: descricao e obrigatoria e precisa de ao menos '
                '20 caracteres';
  end if;
  if p_statement is null or length(btrim(p_statement)) < 20 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: a alegacao de quem abre e obrigatoria e '
                'precisa de ao menos 20 caracteres';
  end if;
  if p_disputed_amount is null or p_disputed_amount <= 0 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado tem de ser positivo';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'reason_code', p_reason_code::text,
    'disputed_amount', p_disputed_amount::text));
  v_log := public.rpc_idempotency_probe(
    'open_dispute_case', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select d.id, d.case_number, d.status into v_case, v_num, v_role
      from public.dispute_cases d
     where d.contract_id = p_contract_id
     order by d.opened_at desc limit 1;
    return query select v_case, v_num, v_role::public.dispute_status, true, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'open_dispute_case: contrato inexistente';
  end if;

  -- SOMENTE QUEM PARTICIPA. Administrador nao abre caso: nao ha papel de parte
  -- para ele, e fabricar alegacao em nome de outrem esta fora do desenho.
  v_role := public.contract_dispute_role(p_contract_id);
  if v_role is null then
    raise exception using errcode = '42501',
      message = 'open_dispute_case: somente embarcador, transportadora ou '
                'motorista vinculado ao contrato abrem disputa';
  end if;

  if v_c.status not in ('active'::public.contract_status,
                        'completed'::public.contract_status) then
    raise exception using errcode = '22023',
      message = format('open_dispute_case: contrato em %s; disputa so se abre '
                       'sobre contrato active ou completed',
                       coalesce(v_c.status::pg_catalog.text, 'nulo'));
  end if;
  if p_disputed_amount > coalesce(v_c.total_amount_brl, 0) then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado maior que o valor do contrato';
  end if;

  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;

  -- Sufixo, nao prefixo: uuids gerados por sistemas diferentes costumam
  -- compartilhar prefixo, e o numero do caso e unico por constraint.
  v_num := 'SG-D-' || to_char(now(), 'YYYYMMDD') || '-'
           || upper(right(replace(p_contract_id::text, '-', ''), 8));

  insert into public.dispute_cases (
    case_number, contract_id, freight_id, payment_intent_id,
    opened_by, opened_by_role, reason_code, description,
    disputed_amount, currency_code, status, priority, due_at
  ) values (
    v_num, p_contract_id, v_c.freight_id, v_i.id,
    v_actor, v_role::public.dispute_party_role, p_reason_code, p_description,
    p_disputed_amount, 'BRL', 'open', 'normal', now() + interval '7 days'
  )
  returning id into v_case;

  insert into public.dispute_parties (case_id, user_id, company_id, role, added_by)
  values (v_case, v_actor,
          case when v_role = 'claimant'
               then case when public.is_current_user_company_owner(v_c.shipper_company_id)
                         then v_c.shipper_company_id else v_c.carrier_company_id end
               else null end,
          v_role::public.dispute_party_role, v_actor);

  insert into public.dispute_claims (
    case_id, claimed_by, claimed_by_role, reason_code, statement,
    claimed_amount, currency_code
  ) values (
    v_case, v_actor, v_role::public.dispute_party_role, p_reason_code, p_statement,
    p_disputed_amount, 'BRL')
  returning id into v_claim;

  -- SUSPENSAO DA LIBERACAO AINDA NAO CONFIRMADA.
  if v_i.id is not null then
    if v_i.internal_status = 'released_confirmed'::public.payment_internal_status then
      -- PAGAMENTO JA CONFIRMADO NAO E DESFEITO POR MUDANCA DE STATUS. Abre-se
      -- reconciliacao: a recuperacao de valor ja transferido e processo proprio,
      -- fora do alcance de um UPDATE.
      insert into public.external_reconciliation (
        intent_id, source, statement_ref, currency_code,
        expected_amount, observed_amount, status, opened_by
      ) values (
        v_i.id, 'manual_review', v_num, v_i.currency_code,
        p_disputed_amount, null, 'pending', v_actor);
      perform public.payment_event_append(
        v_i.id, 'reconciliation_opened',
        'reconciliation_required'::public.payment_internal_status,
        null, null, p_disputed_amount, v_i.currency_code,
        'reconciliation', v_actor, 'party', null, null, null, null,
        'Disputa aberta sobre pagamento JA CONFIRMADO. O valor nao e desfeito '
        'por status: a recuperacao segue por reconciliacao.',
        'open_dispute_case', p_request_id, v_fp);
    else
      update public.payment_intents pi
         set release_blocked_by_dispute = true
       where pi.id = v_i.id;
      v_susp := true;
      perform public.payment_event_append(
        v_i.id, 'release_blocked_by_dispute', v_i.internal_status,
        null, null, null, null,
        'internal', v_actor, 'party', null, null, null, null,
        format('Liberacao suspensa pela abertura do caso %s.', v_num),
        'open_dispute_case', p_request_id, v_fp);
    end if;
  end if;

  perform public.dispute_event_append(
    v_case, 'opened', 'open'::public.dispute_status, null, null, v_claim,
    v_actor, 'party', p_description, 'open_dispute_case', p_request_id, v_fp);

  -- O CONTRATO SO VAI PARA 'disputed' AQUI, vinculado a um caso real.
  perform public.contract_lifecycle_append(
    p_contract_id, 'disputed'::public.contract_lifecycle_transition,
    'disputed'::public.contract_status, v_c.escrow_status,
    null, null, v_i.id, v_case, p_disputed_amount,
    v_actor, 'party', format('Disputa %s aberta.', v_num),
    'open_dispute_case', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('open_dispute_case', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('caso %s aberto por %s; liberacao %s', v_num, v_role,
                 case when v_susp then 'SUSPENSA'
                      else 'nao suspensa (nada pendente ou ja confirmada)' end));

  return query select v_case, v_num, 'open'::public.dispute_status, v_susp, false;
end;
$fn$;

-- =============================================================================
-- 2. ALEGACAO ADICIONAL  -  somente parte, nunca administrador
-- =============================================================================
create function public.add_dispute_claim(
  p_case_id     uuid,
  p_reason_code public.dispute_reason_code,
  p_statement   text,
  p_claimed_amount numeric,
  p_request_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_case  public.dispute_cases%rowtype;
  v_role  text;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_claim uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_claim: chamador nao autenticado';
  end if;
  if p_statement is null or length(btrim(p_statement)) < 20 then
    raise exception using errcode = '22023',
      message = 'add_dispute_claim: alegacao e obrigatoria e precisa de ao menos '
                '20 caracteres';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'statement_digest', public.rpc_params_fingerprint(
      jsonb_build_object('s', p_statement))));
  v_log := public.rpc_idempotency_probe(
    'add_dispute_claim', p_request_id, v_actor, p_case_id, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'add_dispute_claim: caso inexistente';
  end if;
  if v_case.status in ('closed'::public.dispute_status,
                       'withdrawn'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = 'add_dispute_claim: caso encerrado nao recebe nova alegacao';
  end if;

  -- SOMENTE PARTE. Administrador que nao seja parte do contrato nao alega.
  v_role := public.contract_dispute_role(v_case.contract_id);
  if v_role is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_claim: somente quem participa do contrato alega. '
                'Administrador nao fabrica alegacao em nome da parte.';
  end if;

  insert into public.dispute_claims (
    case_id, claimed_by, claimed_by_role, reason_code, statement,
    claimed_amount, currency_code
  ) values (
    p_case_id, v_actor,
    case when v_role = 'driver' then 'driver'::public.dispute_party_role
         else 'respondent'::public.dispute_party_role end,
    p_reason_code, p_statement,
    p_claimed_amount, case when p_claimed_amount is null then null else 'BRL' end)
  returning id into v_claim;

  insert into public.dispute_parties (case_id, user_id, role, added_by)
  values (p_case_id, v_actor,
          case when v_role = 'driver' then 'driver'::public.dispute_party_role
               else 'respondent'::public.dispute_party_role end, v_actor)
  on conflict do nothing;

  perform public.dispute_event_append(
    p_case_id, 'claim_added',
    case when v_case.status = 'open'::public.dispute_status
         then 'under_review'::public.dispute_status else v_case.status end,
    null, null, v_claim, v_actor, 'party', p_statement,
    'add_dispute_claim', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('add_dispute_claim', p_request_id, v_actor, v_claim, v_fp, 'accepted',
          format('alegacao %s adicionada ao caso %s', v_claim, p_case_id));

  return v_claim;
end;
$fn$;

-- =============================================================================
-- 3. EVIDENCIA  -  imutavel depois de apresentada
-- =============================================================================
create function public.add_dispute_evidence(
  p_case_id      uuid,
  p_kind         text,
  p_description  text,
  p_artifact_ref text,
  p_content_hash text,
  p_request_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_case  public.dispute_cases%rowtype;
  v_role  text;
  v_admin boolean;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_ev    uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_evidence: chamador nao autenticado';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'add_dispute_evidence: content_hash deve ser sha-256 hexadecimal '
                'de 64 caracteres';
  end if;
  if p_description is null or length(btrim(p_description)) = 0 then
    raise exception using errcode = '22023',
      message = 'add_dispute_evidence: descricao da evidencia e obrigatoria';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'content_hash', p_content_hash));
  v_log := public.rpc_idempotency_probe(
    'add_dispute_evidence', p_request_id, v_actor, p_case_id, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'add_dispute_evidence: caso inexistente';
  end if;
  if v_case.status in ('closed'::public.dispute_status,
                       'withdrawn'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = 'add_dispute_evidence: caso encerrado nao recebe nova evidencia';
  end if;

  v_role  := public.contract_dispute_role(v_case.contract_id);
  v_admin := coalesce(public.has_role(v_actor, 'admin'::public.app_role), false);
  if v_role is null and not v_admin then
    raise exception using errcode = '42501',
      message = 'add_dispute_evidence: somente parte do contrato ou administrador '
                'apresentam evidencia';
  end if;

  -- A MESMA evidencia nao entra duas vezes: o par (case_id, content_hash) e
  -- unico, e a violacao vira 23505 - deliberadamente visivel.
  insert into public.dispute_evidence (
    case_id, submitted_by, submitted_by_role, kind, description,
    artifact_ref, content_hash
  ) values (
    p_case_id, v_actor,
    case when v_role is null then 'admin_reviewer'::public.dispute_party_role
         when v_role = 'driver' then 'driver'::public.dispute_party_role
         else 'claimant'::public.dispute_party_role end,
    coalesce(p_kind, 'other'), p_description, p_artifact_ref, p_content_hash)
  returning id into v_ev;

  perform public.dispute_event_append(
    p_case_id, 'evidence_added',
    case when v_case.status = 'open'::public.dispute_status
         then 'under_review'::public.dispute_status else v_case.status end,
    null, v_ev, null, v_actor,
    case when v_role is null then 'admin' else 'party' end,
    p_description, 'add_dispute_evidence', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('add_dispute_evidence', p_request_id, v_actor, v_ev, v_fp, 'accepted',
          format('evidencia %s apresentada no caso %s', v_ev, p_case_id));

  return v_ev;
end;
$fn$;

-- =============================================================================
-- 4. DECISAO  -  somente administrador; alocacoes fecham exatamente
-- =============================================================================
create function public.decide_dispute_case(
  p_case_id        uuid,
  p_outcome        public.dispute_decision_outcome,
  p_decided_amount numeric,
  p_carrier_amount numeric,
  p_shipper_amount numeric,
  p_platform_amount numeric,
  p_rationale      text,
  p_supersedes_decision_id uuid,
  p_request_id     uuid
)
returns table (
  decision_id   uuid,
  case_id       uuid,
  dispute_state public.dispute_status,
  was_replayed  boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('decide_dispute_case');
  v_case  public.dispute_cases%rowtype;
  v_c     public.contracts%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_dec   uuid;
  v_sum   numeric;
begin
  if p_case_id is null or p_outcome is null then
    raise exception using errcode = '22004',
      message = 'decide_dispute_case: caso e desfecho sao obrigatorios';
  end if;
  if p_rationale is null or length(btrim(p_rationale)) < 20 then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: fundamentacao e obrigatoria e precisa de ao '
                'menos 20 caracteres';
  end if;
  if p_decided_amount is null or p_decided_amount < 0 then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: valor decidido nao pode ser negativo';
  end if;

  v_sum := coalesce(p_carrier_amount,0) + coalesce(p_shipper_amount,0)
         + coalesce(p_platform_amount,0);
  if v_sum <> p_decided_amount then
    raise exception using errcode = '23514',
      message = format('decide_dispute_case: a divisao (%s) nao fecha o valor '
                       'decidido (%s). A soma das alocacoes tem de ser exata.',
                       v_sum, p_decided_amount);
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'outcome', p_outcome::text,
    'decided_amount', p_decided_amount::text,
    'carrier', coalesce(p_carrier_amount,0)::text,
    'shipper', coalesce(p_shipper_amount,0)::text,
    'platform', coalesce(p_platform_amount,0)::text));
  v_log := public.rpc_idempotency_probe(
    'decide_dispute_case', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select d.id into v_dec from public.dispute_decisions d
     where d.case_id = p_case_id and d.is_current;
    select dc.status into v_case.status from public.dispute_cases dc where dc.id = p_case_id;
    return query select v_dec, p_case_id, v_case.status, true;
    return;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'decide_dispute_case: caso inexistente';
  end if;
  if v_case.status in ('closed'::public.dispute_status,
                       'withdrawn'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: caso encerrado nao recebe decisao';
  end if;
  if p_decided_amount > v_case.disputed_amount then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: valor decidido maior que o valor contestado';
  end if;

  -- CORRECAO POR NOVA DECISAO, NUNCA SOBRESCRITA.
  if p_supersedes_decision_id is not null then
    if not exists (select 1 from public.dispute_decisions d
                    where d.id = p_supersedes_decision_id
                      and d.case_id = p_case_id and d.is_current) then
      raise exception using errcode = '22023',
        message = 'decide_dispute_case: a decisao a ser corrigida nao e a decisao '
                  'vigente deste caso';
    end if;
    update public.dispute_decisions d set is_current = false
     where d.id = p_supersedes_decision_id;
  elsif exists (select 1 from public.dispute_decisions d
                 where d.case_id = p_case_id and d.is_current) then
    raise exception using errcode = '23505',
      message = 'decide_dispute_case: ja existe decisao vigente neste caso. Para '
                'corrigi-la, informe p_supersedes_decision_id - a decisao '
                'anterior NAO e sobrescrita.';
  end if;

  insert into public.dispute_decisions (
    case_id, supersedes_decision_id, outcome, decided_amount, currency_code,
    rationale, decided_by
  ) values (
    p_case_id, p_supersedes_decision_id, p_outcome, p_decided_amount,
    v_case.currency_code, p_rationale, v_actor)
  returning id into v_dec;

  select * into v_c from public.contracts c where c.id = v_case.contract_id;

  if coalesce(p_carrier_amount, 0) > 0 then
    insert into public.dispute_allocations (decision_id, party_kind, company_id, amount, percentage)
    values (v_dec, 'carrier', v_c.carrier_company_id, p_carrier_amount,
            round(p_carrier_amount * 100 / nullif(p_decided_amount, 0), 4));
  end if;
  if coalesce(p_shipper_amount, 0) > 0 then
    insert into public.dispute_allocations (decision_id, party_kind, company_id, amount, percentage)
    values (v_dec, 'shipper', v_c.shipper_company_id, p_shipper_amount,
            round(p_shipper_amount * 100 / nullif(p_decided_amount, 0), 4));
  end if;
  if coalesce(p_platform_amount, 0) > 0 then
    insert into public.dispute_allocations (decision_id, party_kind, company_id, amount, percentage)
    values (v_dec, 'platform', null, p_platform_amount,
            round(p_platform_amount * 100 / nullif(p_decided_amount, 0), 4));
  end if;

  perform public.dispute_event_append(
    p_case_id,
    case when p_supersedes_decision_id is null then 'decided' else 'decision_superseded' end,
    'decided'::public.dispute_status, v_dec, null, null,
    v_actor, 'admin', p_rationale, 'decide_dispute_case', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('decide_dispute_case', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('decisao %s: %s, valor %s (transportadora %s, embarcador %s, '
                 'plataforma %s)%s', v_dec, p_outcome, p_decided_amount,
                 coalesce(p_carrier_amount,0), coalesce(p_shipper_amount,0),
                 coalesce(p_platform_amount,0),
                 case when p_supersedes_decision_id is null then ''
                      else format('; corrige a decisao %s', p_supersedes_decision_id) end));

  return query select v_dec, p_case_id, 'decided'::public.dispute_status, false;
end;
$fn$;

-- =============================================================================
-- 5. ENCERRAMENTO  -  atualiza o contrato de forma coerente
-- =============================================================================
create function public.close_dispute_case(
  p_case_id    uuid,
  p_note       text,
  p_request_id uuid
)
returns table (
  case_id             uuid,
  dispute_state       public.dispute_status,
  new_contract_status public.contract_status,
  was_replayed        boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('close_dispute_case');
  v_case  public.dispute_cases%rowtype;
  v_c     public.contracts%rowtype;
  v_dec   public.dispute_decisions%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_new   public.contract_status;
begin
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'close_dispute_case: nota de encerramento e obrigatoria';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object('case_id', p_case_id));
  v_log := public.rpc_idempotency_probe(
    'close_dispute_case', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    select * into v_c from public.contracts c where c.id = v_case.contract_id;
    return query select p_case_id, v_case.status, v_c.status, true;
    return;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'close_dispute_case: caso inexistente';
  end if;
  if v_case.status <> 'decided'::public.dispute_status then
    raise exception using errcode = '22023',
      message = format('close_dispute_case: caso em %s; so se encerra caso ja '
                       'decidido', v_case.status);
  end if;

  select * into v_dec from public.dispute_decisions d
   where d.case_id = p_case_id and d.is_current;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'close_dispute_case: caso decidido sem decisao vigente';
  end if;

  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id for update;

  -- COERENCIA COM O CONTRATO. 'dismissed' e 'release_to_carrier' devolvem o
  -- contrato ao curso normal; 'refund_to_shipper' cancela. 'split' devolve ao
  -- curso normal e a diferenca de valor e tratada na reconciliacao.
  v_new := case v_dec.outcome
             when 'refund_to_shipper'::public.dispute_decision_outcome
               then 'cancelled'::public.contract_status
             else 'active'::public.contract_status end;

  perform public.contract_lifecycle_append(
    v_c.id, 'dispute_resolved'::public.contract_lifecycle_transition,
    v_new, v_c.escrow_status, null, null, v_i.id, p_case_id, v_dec.decided_amount,
    v_actor, 'admin',
    format('Caso %s encerrado: %s. %s', v_case.case_number, v_dec.outcome, p_note),
    'close_dispute_case', p_request_id, v_fp);

  -- Liberacao volta a andar se ainda nao houver confirmacao e o desfecho nao
  -- for reembolso ao embarcador.
  if v_i.id is not null and v_i.release_blocked_by_dispute
     and v_dec.outcome <> 'refund_to_shipper'::public.dispute_decision_outcome then
    update public.payment_intents pi set release_blocked_by_dispute = false
     where pi.id = v_i.id;
    perform public.payment_event_append(
      v_i.id, 'release_unblocked', v_i.internal_status, null, null, null, null,
      'internal', v_actor, 'admin', null, null, null, null,
      format('Caso %s encerrado; liberacao liberada.', v_case.case_number),
      'close_dispute_case', p_request_id, v_fp);
  end if;

  -- ORDEM IMPORTA. O CHECK dispute_cases_closed_status exige que uma linha com
  -- closed_at ja esteja em 'closed' ou 'withdrawn'. Primeiro o evento move o
  -- status, so entao se carimba o encerramento.
  perform public.dispute_event_append(
    p_case_id, 'closed', 'closed'::public.dispute_status, v_dec.id, null, null,
    v_actor, 'admin', p_note, 'close_dispute_case', p_request_id, v_fp);

  update public.dispute_cases d
     set closed_at = now(), closed_by = v_actor
   where d.id = p_case_id;

  -- Se as duas condicoes de conclusao ja existirem, o contrato fecha agora.
  perform public.try_complete_contract(
    v_c.id, v_actor, 'admin', 'close_dispute_case', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('close_dispute_case', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('caso %s encerrado com desfecho %s', v_case.case_number, v_dec.outcome));

  select * into v_c from public.contracts c where c.id = v_case.contract_id;
  return query select p_case_id, 'closed'::public.dispute_status, v_c.status, false;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
revoke execute on function public.open_dispute_case(uuid, public.dispute_reason_code, text, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.add_dispute_claim(uuid, public.dispute_reason_code, text, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.add_dispute_evidence(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.decide_dispute_case(uuid, public.dispute_decision_outcome, numeric, numeric, numeric, numeric, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.close_dispute_case(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.open_dispute_case(uuid, public.dispute_reason_code, text, numeric, text, uuid) to authenticated;
grant execute on function public.add_dispute_claim(uuid, public.dispute_reason_code, text, numeric, uuid) to authenticated;
grant execute on function public.add_dispute_evidence(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.decide_dispute_case(uuid, public.dispute_decision_outcome, numeric, numeric, numeric, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.close_dispute_case(uuid, text, uuid) to authenticated;

commit;
