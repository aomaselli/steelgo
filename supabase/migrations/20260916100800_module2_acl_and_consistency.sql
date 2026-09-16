-- =============================================================================
-- MODULO 2 (9/9) : AUDITORIA FINAL DE PRIVILEGIOS E CONSISTENCIA
-- =============================================================================
-- Nao cria objeto algum (apenas revoga EXECUTE de funcoes de trigger). Verifica,
-- e ABORTA se algo estiver fora do desenho:
--   * tabelas governadas (disputa, pedidos, obrigacoes, notificacoes): nenhum
--     DML direto (INSERT/UPDATE/DELETE/TRUNCATE) para anon, authenticated e
--     service_role; nenhum SELECT para anon/authenticated; nenhum privilegio
--     para PUBLIC; nenhuma policy remanescente;
--   * funcoes do modulo: PUBLIC e anon sem EXECUTE; helpers so postgres; RPCs
--     publicas exatamente {postgres, authenticated, service_role}; um unico
--     overload por nome; SECURITY DEFINER com search_path vazio;
--   * helper de idempotencia unico (nenhum probe2);
--   * consistencia dos DADOS EXISTENTES - sem exigir tabela vazia.
-- =============================================================================

-- Funcoes de TRIGGER do modulo: o Postgres nao permite chama-las diretamente,
-- mas o default privilege do schema concede EXECUTE a PUBLIC/anon. Higiene:
-- nenhum papel de cliente executa nada do modulo.
revoke all on function public.dispute_decisions_enforce_append_only() from public, anon, authenticated, service_role;
revoke all on function public.dispute_allocations_must_close() from public, anon, authenticated, service_role;
revoke all on function public.dispute_cases_enforce_immutable() from public, anon, authenticated, service_role;
revoke all on function public.dispute_cases_amount_within_contract() from public, anon, authenticated, service_role;
revoke all on function public.dispute_evidence_requests_governed_update() from public, anon, authenticated, service_role;
revoke all on function public.dispute_decisions_match_source() from public, anon, authenticated, service_role;
revoke all on function public.payment_recoveries_governed_update() from public, anon, authenticated, service_role;

do $$
declare
  v_t     text;
  v_r     text;
  v_p     text;
  v_f     text;
  v_n     int;
  v_gr    text;
  v_tables text[] := array['dispute_cases', 'dispute_parties', 'dispute_claims', 'dispute_evidence',
                           'dispute_evidence_requests', 'dispute_decisions', 'dispute_allocations',
                           'dispute_comments', 'dispute_events', 'payment_recoveries', 'notifications'];
  v_helpers text[] := array['notify_user', 'notify_dispute_case', 'dispute_settlement_math',
                            'dispute_party_role_of', 'dispute_actor_json', 'assert_dispute_evidence',
                            'assert_financial_evidence', 'assert_payment_evidence', 'dispute_event_append',
                            'dispute_evidence_insert', 'dispute_expire_open_requests',
                            'contract_dispute_role', 'rpc_idempotency_probe'];
  v_rpcs text[] := array['list_my_notifications', 'count_my_unread_notifications', 'mark_notifications_read',
                         'list_dispute_cases', 'get_dispute_case', 'list_dispute_admins', 'list_settled_release_amounts',
                         'open_dispute_case', 'add_dispute_claim', 'add_dispute_evidence',
                         'add_dispute_evidence_for_claim', 'add_dispute_evidence_for_request',
                         'add_dispute_comment', 'assign_dispute_case', 'request_dispute_evidence',
                         'waive_dispute_evidence_request', 'withdraw_dispute_case', 'decide_dispute_case',
                         'close_dispute_case', 'settle_dispute_decision', 'confirm_dispute_settlement',
                         'fail_dispute_settlement_transaction', 'retry_dispute_settlement_transaction',
                         'confirm_dispute_recovery', 'write_off_dispute_recovery',
                         'cancel_contract_for_unpaid_settlement', 'list_recovery_evidence_refs', 'request_escrow_funding',
                         'confirm_escrow_funding', 'dispute_case_visible', 'dispute_object_visible',
                         'dispute_upload_allowed'];
begin
  -- ---------------------------------------------------------------- tabelas
  foreach v_t in array v_tables loop
    foreach v_r in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(v_r, 'public.' || v_t, v_p) then
          raise exception 'ACL: % tem % direto em public.%', v_r, v_p, v_t;
        end if;
      end loop;
    end loop;
    foreach v_r in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_r, 'public.' || v_t, 'SELECT') then
        raise exception 'ACL: % tem SELECT direto em public.%', v_r, v_t;
      end if;
    end loop;
    if exists (select 1 from pg_class c
                 cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                where c.oid = ('public.' || v_t)::regclass and a.grantee = 0) then
      raise exception 'ACL: PUBLIC tem privilegio em public.%', v_t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_t) then
      raise exception 'ACL: policy remanescente em public.%', v_t;
    end if;
    if not exists (select 1 from pg_class c where c.oid = ('public.' || v_t)::regclass and c.relrowsecurity) then
      raise exception 'ACL: RLS desabilitado em public.%', v_t;
    end if;
  end loop;

  -- ---------------------------------------------------------------- funcoes
  foreach v_f in array v_helpers || v_rpcs loop
    select count(*) into v_n from pg_proc where pronamespace = 'public'::regnamespace and proname = v_f;
    if v_n <> 1 then
      raise exception 'ACL: funcao % com % overload(s); esperado 1', v_f, v_n;
    end if;
    -- dispute_settlement_math e funcao PURA (IMMUTABLE, sem acesso a tabelas):
    -- exige-se search_path vazio, nao SECURITY DEFINER
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_f
                     and (p.prosecdef or v_f = 'dispute_settlement_math')
                     and coalesce('search_path=""' = any(p.proconfig), false)) then
      raise exception 'ACL: % nao e SECURITY DEFINER com search_path vazio', v_f;
    end if;
    if exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.pronamespace = 'public'::regnamespace and p.proname = v_f
                  and a.privilege_type = 'EXECUTE'
                  and (a.grantee = 0 or a.grantee::regrole::text = 'anon')) then
      raise exception 'ACL: % executavel por PUBLIC ou anon', v_f;
    end if;
  end loop;
  foreach v_f in array v_helpers loop
    select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_gr
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE';
    if v_gr is distinct from 'postgres' then
      raise exception 'ACL: helper % executavel por [%]; esperado so postgres', v_f, v_gr;
    end if;
  end loop;
  foreach v_f in array v_rpcs loop
    select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_gr
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace and p.proname = v_f and a.privilege_type = 'EXECUTE';
    if v_gr is distinct from 'authenticated,postgres,service_role' then
      raise exception 'ACL: RPC % executavel por [%]; esperado authenticated,postgres,service_role', v_f, v_gr;
    end if;
  end loop;
  -- try_complete_contract: interno, so postgres e service_role (como no Modulo 1)
  select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_gr
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.pronamespace = 'public'::regnamespace and p.proname = 'try_complete_contract' and a.privilege_type = 'EXECUTE';
  if v_gr is distinct from 'postgres,service_role' then
    raise exception 'ACL: try_complete_contract executavel por [%]', v_gr;
  end if;
  -- helper de idempotencia unico
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
              and proname like 'rpc_idempotency_probe%' and proname <> 'rpc_idempotency_probe') then
    raise exception 'ACL: helper de idempotencia duplicado';
  end if;

  -- ---------------------------------------------------------------- storage
  select count(*) into v_n from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('dispute_evidence_insert_party', 'dispute_evidence_select_party',
                       'payment_evidence_insert_admin', 'payment_evidence_select_admin');
  if v_n <> 4 then
    raise exception 'Storage: esperadas 4 policies de evidencia, ha %', v_n;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and cmd in ('UPDATE', 'DELETE')
              and ((coalesce(qual, '') || coalesce(with_check, '')) like '%dispute-evidence%'
                   or (coalesce(qual, '') || coalesce(with_check, '')) like '%payment-evidence%')) then
    raise exception 'Storage: policy de UPDATE/DELETE em bucket de evidencia';
  end if;

  -- ---------------------------------------------------------------- dados existentes
  if exists (select 1 from public.dispute_cases where previous_contract_status is null) then
    raise exception 'DADOS: caso sem previous_contract_status';
  end if;
  select count(*) into v_n from (select contract_id from public.dispute_cases group by 1 having count(*) > 1) x;
  if v_n > 0 then raise exception 'DADOS: % contrato(s) com mais de um caso', v_n; end if;
  if exists (select 1 from public.dispute_cases d
              where d.status = 'decided' and not exists (select 1 from public.dispute_decisions x where x.case_id = d.id and x.is_current)) then
    raise exception 'DADOS: caso decidido sem decisao vigente';
  end if;
  if exists (select 1 from public.dispute_cases d
              where d.status in ('open', 'under_review', 'awaiting_evidence', 'withdrawn')
                and d.settlement_state <> 'undecided') then
    raise exception 'DADOS: caso sem decisao com settlement_state diferente de undecided';
  end if;
  if exists (select 1 from public.dispute_cases d
              where d.settlement_state = 'requested'
                and not exists (select 1 from public.payment_transactions t
                                  join public.dispute_decisions x on x.id = t.dispute_decision_id
                                 where x.case_id = d.id and x.is_current)) then
    raise exception 'DADOS: caso em requested sem transacao de liquidacao';
  end if;
  if exists (select 1 from public.dispute_cases d
              where d.settlement_state in ('recovery_open', 'recovery_closed')
                and not exists (select 1 from public.payment_recoveries r where r.case_id = d.id)) then
    raise exception 'DADOS: caso em recovery_* sem obrigacao registrada';
  end if;
  if exists (select 1 from public.payment_intents pi
              where pi.internal_status in ('settlement_requested', 'settled') and pi.settlement_decision_id is null) then
    raise exception 'DADOS: intent em liquidacao sem decisao';
  end if;
  if exists (select 1 from public.payment_recoveries r where r.status = 'confirmed' and r.evidence_ref is null) then
    raise exception 'DADOS: obrigacao confirmada sem comprovante';
  end if;
  if exists (select 1 from public.dispute_decisions d
              where d.shipper_amount + d.carrier_delta + d.platform_delta <> d.decided_amount
                 or d.shipper_amount + d.release_amount <> d.gross_amount
                 or d.carrier_final + d.platform_fee_final <> d.release_amount) then
    raise exception 'DADOS: decisao com somas que nao fecham';
  end if;
  if exists (select 1 from public.dispute_evidence_requests q
              where q.status = 'fulfilled' and not exists (select 1 from public.dispute_evidence e where e.id = q.evidence_id and e.evidence_request_id = q.id)) then
    raise exception 'DADOS: pedido atendido sem evidencia vinculada';
  end if;
  if exists (select 1 from public.dispute_parties p
              where p.role in ('claimant', 'respondent') and p.company_id is null) then
    raise exception 'DADOS: parte sem empresa';
  end if;
end $$;
