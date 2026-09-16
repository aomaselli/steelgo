-- =============================================================================
-- MODULO 2 (6/9) : LEITURA SANITIZADA  -  nenhum UUID pessoal chega ao cliente
-- =============================================================================
-- As telas (partes e administrador) leem disputas EXCLUSIVAMENTE por estas
-- RPCs. Atores aparecem como {role, label, is_you}: para as partes, o
-- administrador e sempre "Equipe SteelGo"; nunca opened_by, assigned_to,
-- dispute_parties.user_id, claimed_by, submitted_by, author_id, decided_by,
-- confirmed_by.
--
-- Depois de criadas as RPCs, o SELECT direto das oito tabelas de disputa e
-- revogado de anon/authenticated e as policies *_select_party sao removidas.
-- Nada quebra: as RPCs sao SECURITY DEFINER (owner postgres); as policies do
-- bucket usam dispute_case_visible (SECURITY DEFINER, boolean); service_role
-- mantem SELECT (e perde DML direto, pela politica do modulo).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. helpers (EXECUTE so postgres)
-- -----------------------------------------------------------------------------
-- Papel de um usuario num caso, derivado da PROPRIEDADE ATUAL das empresas
-- registradas em dispute_parties (robusto a troca de proprietario).
create function public.dispute_party_role_of(p_case_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.role::text
    from public.dispute_parties p
    join public.companies co on co.id = p.company_id
   where p.case_id = p_case_id
     and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)
     and co.owner_id = p_user_id
   order by case p.role when 'claimant' then 0 else 1 end
   limit 1
$fn$;

-- Representacao sanitizada de um ator.
create function public.dispute_actor_json(
  p_case_id      uuid,
  p_user_id      uuid,
  p_viewer       uuid,
  p_viewer_admin boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_role  text;
  v_label text;
begin
  if p_user_id is null then
    return jsonb_build_object('role', 'system', 'label', 'Sistema', 'is_you', false);
  end if;
  if public.has_role(p_user_id, 'admin'::public.app_role) then
    if p_viewer_admin then
      select coalesce(nullif(btrim(pr.full_name), ''), 'Administrador') into v_label
        from public.profiles pr where pr.id = p_user_id;
      return jsonb_build_object('role', 'steelgo', 'label', coalesce(v_label, 'Administrador'),
                                'is_you', p_user_id = p_viewer);
    end if;
    return jsonb_build_object('role', 'steelgo', 'label', 'Equipe SteelGo', 'is_you', false);
  end if;
  select p.role::text, coalesce(nullif(btrim(co.trade_name), ''), co.name)
    into v_role, v_label
    from public.dispute_parties p
    join public.companies co on co.id = p.company_id
   where p.case_id = p_case_id and p.user_id = p_user_id
     and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)
   limit 1;
  if v_role is null then
    v_role := coalesce(public.dispute_party_role_of(p_case_id, p_user_id), 'party');
    select coalesce(nullif(btrim(co.trade_name), ''), co.name) into v_label
      from public.dispute_parties p join public.companies co on co.id = p.company_id
     where p.case_id = p_case_id and p.role::text = v_role limit 1;
  end if;
  return jsonb_build_object('role', v_role, 'label', coalesce(v_label, 'Parte'),
                            'is_you', p_user_id = p_viewer);
end;
$fn$;

revoke all on function public.dispute_party_role_of(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.dispute_actor_json(uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. lista de casos visiveis
-- -----------------------------------------------------------------------------
create function public.list_dispute_cases(
  p_scope  text default 'mine',
  p_status public.dispute_status[] default null,
  p_limit  integer default 100
)
returns table (
  case_id                  uuid,
  case_number              text,
  contract_id              uuid,
  contract_number          text,
  status                   public.dispute_status,
  settlement_state         text,
  reason_code              public.dispute_reason_code,
  disputed_amount          numeric,
  currency_code            text,
  opened_at                timestamptz,
  due_at                   timestamptz,
  overdue                  boolean,
  settlement_due_at        timestamptz,
  my_role                  text,
  claimant_company_name    text,
  respondent_company_name  text,
  assignee_label           text,
  is_assigned              boolean,
  previous_contract_status public.contract_status,
  updated_at               timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'list_dispute_cases: chamador nao autenticado';
  end if;
  v_admin := coalesce(public.has_role(v_actor, 'admin'::public.app_role), false);
  if p_scope is null or p_scope not in ('mine', 'all', 'unassigned') then
    raise exception using errcode = '22023',
      message = 'list_dispute_cases: p_scope deve ser mine, all ou unassigned';
  end if;
  if p_scope <> 'mine' and not v_admin then
    raise exception using errcode = '42501',
      message = 'list_dispute_cases: escopo restrito a administradores';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023',
      message = 'list_dispute_cases: p_limit deve estar entre 1 e 200';
  end if;

  return query
    select d.id, d.case_number, d.contract_id, c.contract_number, d.status, d.settlement_state,
           d.reason_code, d.disputed_amount, d.currency_code, d.opened_at, d.due_at,
           (d.status not in ('closed'::public.dispute_status, 'withdrawn'::public.dispute_status)
            and now() > d.due_at) as overdue,
           d.settlement_due_at,
           case when v_admin then 'admin' else public.dispute_party_role_of(d.id, v_actor) end,
           (select coalesce(nullif(btrim(co.trade_name), ''), co.name)
              from public.dispute_parties p join public.companies co on co.id = p.company_id
             where p.case_id = d.id and p.role = 'claimant'::public.dispute_party_role limit 1),
           (select coalesce(nullif(btrim(co.trade_name), ''), co.name)
              from public.dispute_parties p join public.companies co on co.id = p.company_id
             where p.case_id = d.id and p.role = 'respondent'::public.dispute_party_role limit 1),
           case when d.assigned_to is null then null
                when v_admin then (public.dispute_actor_json(d.id, d.assigned_to, v_actor, true) ->> 'label')
                else 'Equipe SteelGo' end,
           d.assigned_to is not null,
           d.previous_contract_status, d.updated_at
      from public.dispute_cases d
      join public.contracts c on c.id = d.contract_id
     where (p_status is null or d.status = any(p_status))
       and case
             when not v_admin then
               exists (select 1 from public.dispute_parties p join public.companies co on co.id = p.company_id
                        where p.case_id = d.id and co.owner_id = v_actor
                          and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role))
             when p_scope = 'mine' then d.assigned_to = v_actor
             when p_scope = 'unassigned' then d.assigned_to is null
             else true
           end
     order by d.opened_at desc, d.id desc
     limit p_limit;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. detalhe completo de um caso visivel
-- -----------------------------------------------------------------------------
create function public.get_dispute_case(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor  uuid := (select auth.uid());
  v_admin  boolean;
  v_d      public.dispute_cases%rowtype;
  v_c      public.contracts%rowtype;
  v_i      public.payment_intents%rowtype;
  v_role   text;
  v_out    jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'get_dispute_case: chamador nao autenticado';
  end if;
  if p_case_id is null then
    raise exception using errcode = '22023',
      message = 'get_dispute_case: p_case_id e obrigatorio';
  end if;
  v_admin := coalesce(public.has_role(v_actor, 'admin'::public.app_role), false);

  select * into v_d from public.dispute_cases d where d.id = p_case_id;
  if not found or not public.dispute_case_visible(p_case_id) then
    raise exception using errcode = 'P0002',
      message = 'get_dispute_case: caso inexistente ou invisivel para este usuario';
  end if;
  v_role := case when v_admin then 'admin' else public.dispute_party_role_of(p_case_id, v_actor) end;
  select * into v_c from public.contracts c where c.id = v_d.contract_id;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_d.contract_id;

  v_out := jsonb_build_object(
    'case', jsonb_build_object(
      'id', v_d.id, 'case_number', v_d.case_number, 'contract_id', v_d.contract_id,
      'status', v_d.status, 'settlement_state', v_d.settlement_state,
      'reason_code', v_d.reason_code, 'description', v_d.description,
      'disputed_amount', v_d.disputed_amount, 'currency_code', v_d.currency_code,
      'priority', v_d.priority, 'opened_at', v_d.opened_at, 'due_at', v_d.due_at,
      'overdue', (v_d.status not in ('closed'::public.dispute_status, 'withdrawn'::public.dispute_status)
                  and now() > v_d.due_at),
      'settlement_due_at', v_d.settlement_due_at,
      'settlement_overdue', (v_d.settlement_due_at is not null and now() > v_d.settlement_due_at),
      'previous_contract_status', v_d.previous_contract_status,
      'closed_at', v_d.closed_at,
      'assigned', v_d.assigned_to is not null,
      'assignee', case when v_d.assigned_to is null then null
                       else public.dispute_actor_json(v_d.id, v_d.assigned_to, v_actor, v_admin) end,
      'assigned_at', v_d.assigned_at,
      'opened_by', public.dispute_actor_json(v_d.id, v_d.opened_by, v_actor, v_admin)),
    'viewer', jsonb_build_object(
      'role', v_role, 'is_admin', v_admin,
      'is_assignee', v_admin and v_d.assigned_to = v_actor),
    'contract', jsonb_build_object(
      'id', v_c.id, 'contract_number', v_c.contract_number, 'status', v_c.status,
      'escrow_status', v_c.escrow_status, 'total_amount_brl', v_c.total_amount_brl,
      'platform_fee_brl', v_c.platform_fee_brl, 'completed_at', v_c.completed_at,
      'delivery_completed_at', v_c.delivery_completed_at),
    'parties', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'role', p.role, 'company_name', coalesce(nullif(btrim(co.trade_name), ''), co.name),
               'company_kind', case when co.id = v_c.shipper_company_id then 'shipper' else 'carrier' end,
               'is_you', co.owner_id = v_actor) order by case p.role when 'claimant' then 0 else 1 end), '[]'::jsonb)
        from public.dispute_parties p join public.companies co on co.id = p.company_id
       where p.case_id = v_d.id
         and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)),
    'claims', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', cl.id, 'actor', public.dispute_actor_json(v_d.id, cl.claimed_by, v_actor, v_admin),
               'role', cl.claimed_by_role, 'reason_code', cl.reason_code, 'statement', cl.statement,
               'claimed_amount', cl.claimed_amount, 'currency_code', cl.currency_code,
               'created_at', cl.created_at) order by cl.created_at, cl.id), '[]'::jsonb)
        from public.dispute_claims cl where cl.case_id = v_d.id),
    'evidence', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'claim_id', e.claim_id, 'evidence_request_id', e.evidence_request_id,
               'actor', public.dispute_actor_json(v_d.id, e.submitted_by, v_actor, v_admin),
               'role', e.submitted_by_role, 'kind', e.kind, 'description', e.description,
               'artifact_ref', e.artifact_ref, 'content_hash', e.content_hash,
               'artifact_size_bytes', e.artifact_size_bytes, 'artifact_mime', e.artifact_mime,
               'submitted_at', e.submitted_at) order by e.submitted_at, e.id), '[]'::jsonb)
        from public.dispute_evidence e where e.case_id = v_d.id),
    'evidence_requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'target_role', r.target_role, 'description', r.description,
               'due_at', r.due_at, 'created_at', r.created_at,
               'status', case when r.status = 'open' and now() > r.due_at then 'expired' else r.status end,
               'fulfilled_at', r.fulfilled_at, 'evidence_id', r.evidence_id,
               'waived_at', r.waived_at, 'waive_note', r.waive_note,
               'addressed_to_you', (v_role = r.target_role::text)) order by r.created_at, r.id), '[]'::jsonb)
        from public.dispute_evidence_requests r where r.case_id = v_d.id),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', cm.id, 'actor', public.dispute_actor_json(v_d.id, cm.author_id, v_actor, v_admin),
               'role', cm.author_role, 'body', cm.body, 'visibility', cm.visibility,
               'created_at', cm.created_at) order by cm.created_at, cm.id), '[]'::jsonb)
        from public.dispute_comments cm
       where cm.case_id = v_d.id and (v_admin or cm.visibility = 'all_parties')),
    'decisions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', dd.id, 'outcome', dd.outcome, 'decided_amount', dd.decided_amount,
               'gross_amount', dd.gross_amount, 'original_platform_fee', dd.original_platform_fee,
               'shipper_amount', dd.shipper_amount, 'carrier_delta', dd.carrier_delta,
               'platform_delta', dd.platform_delta, 'release_amount', dd.release_amount,
               'carrier_final', dd.carrier_final, 'platform_fee_final', dd.platform_fee_final,
               'currency_code', dd.currency_code, 'rationale', dd.rationale,
               'decided_at', dd.decided_at, 'is_current', dd.is_current,
               'supersedes_decision_id', dd.supersedes_decision_id,
               'decided_by', public.dispute_actor_json(v_d.id, dd.decided_by, v_actor, v_admin),
               'allocations', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'party_kind', a.party_kind, 'amount', a.amount, 'percentage', a.percentage)
                                 order by a.party_kind), '[]'::jsonb)
                                 from public.dispute_allocations a where a.decision_id = dd.id))
               order by dd.decided_at desc, dd.id desc), '[]'::jsonb)
        from public.dispute_decisions dd where dd.case_id = v_d.id),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ev.id, 'event_type', ev.event_type, 'previous_status', ev.previous_status,
               'new_status', ev.new_status, 'actor', public.dispute_actor_json(v_d.id, ev.actor_id, v_actor, v_admin),
               'actor_kind', ev.actor_kind,
               -- evento de comentario guarda em note o id do comentario (o corpo
               -- esta em comments); notas de atribuicao sao internas
               'note', case when ev.event_type = 'comment_added' then null
                            when v_admin or ev.event_type not in ('assigned', 'reassigned') then ev.note
                            else null end,
               'comment_id', case when ev.event_type = 'comment_added' then ev.note else null end,
               'decision_id', ev.decision_id, 'evidence_id', ev.evidence_id, 'claim_id', ev.claim_id,
               'evidence_request_id', ev.evidence_request_id, 'transaction_id', ev.transaction_id,
               'recovery_id', ev.recovery_id, 'created_at', ev.created_at)
               order by ev.created_at, ev.id), '[]'::jsonb)
        from public.dispute_events ev
       where ev.case_id = v_d.id
         and (v_admin or ev.event_type <> 'comment_added'
              or exists (select 1 from public.dispute_comments cmy
                          where cmy.case_id = v_d.id and cmy.id::text = ev.note and cmy.visibility = 'all_parties'))),
    'settlement', jsonb_build_object(
      'state', v_d.settlement_state,
      'due_at', v_d.settlement_due_at,
      'intent', case when v_i.id is null then null else jsonb_build_object(
        'id', v_i.id, 'internal_status', v_i.internal_status, 'gross_amount', v_i.gross_amount,
        'platform_fee_amount', v_i.platform_fee_amount, 'carrier_net_amount', v_i.carrier_net_amount,
        'currency_code', v_i.currency_code, 'release_blocked_by_dispute', v_i.release_blocked_by_dispute,
        'funding_confirmed_at', v_i.funding_confirmed_at, 'released_confirmed_at', v_i.released_confirmed_at,
        'settled_at', v_i.settled_at, 'settlement_refund_amount', v_i.settlement_refund_amount,
        'settlement_release_amount', v_i.settlement_release_amount,
        'settlement_funding_amount', v_i.settlement_funding_amount) end,
      'transactions', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', t.id, 'kind', t.kind, 'status', t.status, 'amount', t.amount,
                 'currency_code', t.currency_code, 'requested_at', t.requested_at,
                 'confirmed_at', t.confirmed_at, 'failure_code', t.failure_code,
                 'dispute_decision_id', t.dispute_decision_id,
                 'allocations', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'party_kind', pa.party_kind, 'amount', pa.amount) order by pa.party_kind), '[]'::jsonb)
                                   from public.payment_allocations pa where pa.transaction_id = t.id))
                 order by t.requested_at, t.id), '[]'::jsonb)
          from public.payment_transactions t
         where v_i.id is not null and t.intent_id = v_i.id
           and (t.dispute_decision_id is not null
                or (v_i.settlement_funding_amount is not null and t.kind = 'funding'::public.payment_transaction_kind))),
      'recoveries', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', rv.id, 'debtor_kind', rv.debtor_kind,
                 'debtor_label', case rv.debtor_kind when 'platform' then 'SteelGo'
                                   else (select coalesce(nullif(btrim(co.trade_name), ''), co.name)
                                           from public.companies co where co.id = rv.debtor_company_id) end,
                 'creditor_label', (select coalesce(nullif(btrim(co.trade_name), ''), co.name)
                                      from public.companies co where co.id = rv.creditor_company_id),
                 'expected_amount', rv.expected_amount, 'currency_code', rv.currency_code,
                 'status', rv.status, 'external_reference', rv.external_reference,
                 'confirmed_at', rv.confirmed_at, 'written_off_at', rv.written_off_at,
                 'write_off_note', rv.write_off_note, 'registered_at', rv.registered_at,
                 'evidence_ref', case when v_admin then rv.evidence_ref else null end)
                 order by rv.debtor_kind), '[]'::jsonb)
          from public.payment_recoveries rv where rv.case_id = v_d.id)));

  return v_out;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 4. diretorio de administradores (para atribuicao)
-- -----------------------------------------------------------------------------
create function public.list_dispute_admins()
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('list_dispute_admins');
begin
  return query
    select ur.user_id, coalesce(nullif(btrim(pr.full_name), ''), 'Administrador')
      from public.user_roles ur
      left join public.profiles pr on pr.id = ur.user_id
     where ur.role = 'admin'::public.app_role
     order by 2, 1;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 5. KPI autoritativo das liquidacoes confirmadas (Operacao financeira / Centro
--    financeiro). Devolve, por intent `settled`, os valores PERSISTIDOS da release
--    confirmada e das suas alocacoes (transportadora, plataforma). O frontend so
--    soma: nenhuma formula financeira e recalculada no cliente.
--    Visibilidade: admin ve tudo; parte ve os contratos que is_contract_visible
--    autoriza; sem sessao -> 42501; anon sem EXECUTE.
-- -----------------------------------------------------------------------------
create function public.list_settled_release_amounts()
returns table (
  intent_id       uuid,
  contract_id     uuid,
  transaction_id  uuid,
  release_amount  numeric,
  carrier_amount  numeric,
  platform_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_admin boolean;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'list_settled_release_amounts: sessao obrigatoria';
  end if;
  v_admin := public.has_role(v_actor, 'admin'::public.app_role);
  return query
    select i.id, i.contract_id, t.id, t.amount,
           coalesce((select sum(a.amount) from public.payment_allocations a
                      where a.transaction_id = t.id and a.party_kind = 'carrier'::public.payment_party_kind), 0::numeric),
           coalesce((select sum(a.amount) from public.payment_allocations a
                      where a.transaction_id = t.id and a.party_kind = 'platform'::public.payment_party_kind), 0::numeric)
      from public.payment_intents i
      join public.payment_transactions t on t.intent_id = i.id
     where i.internal_status = 'settled'::public.payment_internal_status
       and t.kind = 'release'::public.payment_transaction_kind
       and t.status = 'confirmed'::public.payment_transaction_status
       and t.dispute_decision_id is not null
       and (v_admin or public.is_contract_visible(i.contract_id))
     order by i.id;
end;
$fn$;

revoke all on function public.list_settled_release_amounts() from public, anon, authenticated, service_role;
grant execute on function public.list_settled_release_amounts() to authenticated, service_role;

revoke all on function public.list_dispute_cases(text, public.dispute_status[], integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_dispute_case(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_dispute_admins() from public, anon, authenticated, service_role;
grant execute on function public.list_dispute_cases(text, public.dispute_status[], integer) to authenticated, service_role;
grant execute on function public.get_dispute_case(uuid) to authenticated, service_role;
grant execute on function public.list_dispute_admins() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. leitura direta revogada; policies removidas
-- -----------------------------------------------------------------------------
revoke select on
  public.dispute_cases, public.dispute_parties, public.dispute_claims, public.dispute_evidence,
  public.dispute_decisions, public.dispute_allocations, public.dispute_comments, public.dispute_events
  from public, anon, authenticated;
revoke insert, update, delete, truncate on
  public.dispute_cases, public.dispute_parties, public.dispute_claims, public.dispute_evidence,
  public.dispute_decisions, public.dispute_allocations, public.dispute_comments, public.dispute_events
  from service_role;

drop policy dispute_cases_select_party       on public.dispute_cases;
drop policy dispute_parties_select_party     on public.dispute_parties;
drop policy dispute_claims_select_party      on public.dispute_claims;
drop policy dispute_evidence_select_party    on public.dispute_evidence;
drop policy dispute_decisions_select_party   on public.dispute_decisions;
drop policy dispute_allocations_select_party on public.dispute_allocations;
drop policy dispute_events_select_party      on public.dispute_events;
drop policy dispute_comments_select_party    on public.dispute_comments;

do $$
declare v_t text; v_r text;
begin
  foreach v_t in array array['dispute_cases', 'dispute_parties', 'dispute_claims', 'dispute_evidence',
                             'dispute_decisions', 'dispute_allocations', 'dispute_comments',
                             'dispute_events', 'dispute_evidence_requests'] loop
    foreach v_r in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_r, 'public.' || v_t, 'SELECT') then
        raise exception '%: SELECT direto ainda concedido a %', v_t, v_r;
      end if;
    end loop;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_t) then
      raise exception '%: policy remanescente', v_t;
    end if;
  end loop;
end $$;

commit;
