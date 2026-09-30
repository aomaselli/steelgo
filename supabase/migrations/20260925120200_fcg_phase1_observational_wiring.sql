-- =============================================================================
-- SteelGo | Freight Compliance Gate - Fase 1A (3/3): wiring observacional
-- =============================================================================
--
--            OBSERVATIONAL ONLY - MUST NOT BE USED FOR ENFORCEMENT
--
-- O trigger criado nesta migration existe exclusivamente para OBSERVAR. Ele
-- nao bloqueia, nao recusa e nao condiciona a contratacao. O enforcement
-- futuro NAO sera feito aqui: ele devera ser executado DENTRO de
-- public.accept_bid_and_create_contract, apos os quatro FOR UPDATE e ANTES do
-- INSERT em public.contracts, que e o unico ponto onde frete, proposta e
-- partes estao simultaneamente travados.
--
-- LIMITE DE ALCANCE, DECLARADO SEM EXAGERO
-- ----------------------------------------
-- O trigger dispara na mesma transacao de quem inseriu o contrato. Quando o
-- caminho e accept_bid_and_create_contract, os locks dessa RPC ja estao em
-- vigor. Isso NAO vale automaticamente para qualquer INSERT futuro em
-- contracts: um caminho novo que nao tome os mesmos locks NAO herda essa
-- garantia. Por isso o enforcement precisa migrar para dentro da RPC.
--
-- SEM REGRA FICTICIA
-- ------------------
-- Nao existe rule set placeholder. regulatory_assessments.rule_id permanece
-- NOT NULL e a fundacao regulatoria nao foi enfraquecida. Quando nao ha
-- conjunto de regras elegivel, vigente e validado internamente:
--   * a transport_operation E criada normalmente;
--   * NENHUM regulatory_assessment e criado;
--   * NENHUM regulatory_compliance_result e criado;
--   * a tentativa e registrada em fcg_observational_log com o evento
--     'not_evaluated' e o detalhe 'no_eligible_validated_rule';
--   * o contrato segue;
--   * a avaliacao e reportada como 'not_evaluated'.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Avaliacao observacional
-- -----------------------------------------------------------------------------
-- Retorna o texto do desfecho: 'not_evaluated' quando nao ha regra elegivel,
-- ou o id do resultado de conformidade quando houver.
create or replace function public.fcg_evaluate_contract_compliance_core(
  p_operation_id uuid,
  p_contract_id uuid,
  p_request_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_rule public.regulatory_rule_sets%rowtype;
  v_assessment_id uuid;
  v_result_id uuid;
  v_pending jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_existing uuid;
begin
  select r.id into v_existing
    from public.regulatory_compliance_results r
   where r.request_id = p_request_id;
  if v_existing is not null then
    return v_existing::text;
  end if;

  select * into v_contract from public.contracts c where c.id = p_contract_id;
  if not found then
    raise exception using errcode = '23503', message = 'contrato inexistente';
  end if;

  -- Conjunto de regras elegivel, vigente e validado internamente.
  select * into v_rule
    from public.regulatory_rule_sets s
   where s.status = 'active'
     and s.scope = 'publication_gate'
     and (s.effective_from is null or s.effective_from <= now())
     and (s.effective_to is null or s.effective_to > now())
   order by s.effective_from desc nulls last
   limit 1;

  if not found then
    -- NAO cria avaliacao nem resultado. Apenas registra a tentativa.
    -- A falha da propria auditoria nao pode bloquear a contratacao, por isso o
    -- bloco protegido. Que ele nunca dispare e verificado por teste (1.4/1.5).
    begin
      insert into public.fcg_observational_log
        (event, contract_id, transport_operation_id, request_id, detail)
      values ('not_evaluated', p_contract_id, p_operation_id, p_request_id,
              'no_eligible_validated_rule');
    exception when others then
      null;
    end;
    return 'not_evaluated';
  end if;

  -- A partir daqui existe regra vigente e validada.
  v_pending := v_pending || jsonb_build_array(
    jsonb_build_object('code', 'COEFFICIENT_TABLE_MISSING',
      'detail', 'tabela de coeficientes do PNPM nao carregada'),
    jsonb_build_object('code', 'ROUNDING_POLICY_UNDEFINED',
      'detail', 'politica de arredondamento pendente de validacao interna')
  );

  if not exists (
    select 1 from public.transport_operation_vehicle_compositions c
     where c.transport_operation_id = p_operation_id
  ) then
    v_pending := v_pending || jsonb_build_array(
      jsonb_build_object('code', 'VEHICLE_COMPOSITION_MISSING',
        'detail', 'composicao veicular e quantidade de eixos nao declaradas'));
  end if;

  if not exists (
    select 1 from public.transport_operations o
     where o.id = p_operation_id
       and o.effective_carrier_rntrc_category is not null
       and o.effective_carrier_rntrc_snapshot is not null
  ) then
    v_pending := v_pending || jsonb_build_array(
      jsonb_build_object('code', 'EFFECTIVE_CARRIER_UNKNOWN',
        'detail', 'categoria RNTRC do transportador efetivo sem evidencia congelada'));
  end if;

  v_fingerprint := encode(extensions.digest(
    coalesce(v_contract.total_amount_brl::text, '') || '|' ||
    coalesce(v_contract.freight_id::text, '')      || '|' ||
    coalesce(p_operation_id::text, '')             || '|' ||
    coalesce(v_rule.rule_version, ''), 'sha256'), 'hex');

  insert into public.regulatory_assessments (
    transport_operation_id, stage, result, floor_applicability,
    rule_id, rule_version, inputs_snapshot, pending_items,
    rounding_policy, decision_mode, retention_policy
  ) values (
    p_operation_id, 'preliminary', 'pending_evaluation', 'pending_evaluation',
    v_rule.id, v_rule.rule_version,
    jsonb_build_object(
      'contract_id', p_contract_id,
      'evaluated_amount', v_contract.total_amount_brl,
      'currency', 'BRL',
      'captured_at', now()
    ),
    v_pending, 'undefined', 'system', 'pending_legal_definition'
  )
  returning id into v_assessment_id;

  insert into public.regulatory_compliance_results (
    assessment_id, calculation_status, compliance_status,
    evaluated_amount, rounding_policy, rule_id, rule_version,
    reason_codes, inputs_fingerprint, enforcement_mode,
    retention_policy, request_id
  ) values (
    v_assessment_id, 'incomputable', null,
    v_contract.total_amount_brl, 'undefined', v_rule.id, v_rule.rule_version,
    (select jsonb_agg(x->'code') from jsonb_array_elements(v_pending) x),
    v_fingerprint,
    case when public.operational_flag('freight_compliance_gate_enforcing')
         then 'enforcing' else 'observational' end,
    'pending_legal_definition', p_request_id
  )
  returning id into v_result_id;

  begin
    insert into public.fcg_observational_log
      (event, contract_id, transport_operation_id, request_id, detail)
    values ('evaluated', p_contract_id, p_operation_id, p_request_id,
            'rule_version=' || v_rule.rule_version);
  exception when others then
    null;
  end;

  return v_result_id::text;
end;
$$;

revoke all on function public.fcg_evaluate_contract_compliance_core(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fcg_evaluate_contract_compliance_core(uuid, uuid, uuid)
  to service_role;


-- -----------------------------------------------------------------------------
-- 2. Trigger observacional
-- -----------------------------------------------------------------------------
--            OBSERVATIONAL ONLY - MUST NOT BE USED FOR ENFORCEMENT
--
-- Ordem deliberada: a flag e consultada ANTES de qualquer trabalho regulatorio.
-- Sem a flag, o trigger retorna imediatamente e nao toca em tabela alguma.
-- Nao ha integracao externa: nenhuma chamada de rede, nenhum adapter.
create or replace function public.fcg_contract_observational_hook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation_id uuid;
  v_request_id uuid := gen_random_uuid();
  v_outcome text;
begin
  -- 1. flag primeiro: sem ela, zero trabalho regulatorio.
  if not public.operational_flag('freight_compliance_gate_enabled') then
    return null;
  end if;

  begin
    -- Categoria, tratamento e evidencia do RNTRC ficam NULOS de proposito: a
    -- Fase 1A nao infere nada sobre o transportador efetivo sem evidencia.
    v_operation_id := public.create_transport_operation_from_contract_core(
      new.id, v_request_id, null, null, null, null, null, null, null);

    v_outcome := public.fcg_evaluate_contract_compliance_core(
      v_operation_id, new.id, v_request_id);

  exception when others then
    declare
      v_estado text := sqlstate;
      v_msg text := left(sqlerrm, 200);
    begin
      -- Falha inesperada NUNCA vira resultado regulatorio e NUNCA bloqueia.
      raise warning 'fcg observacional falhou (contrato %): % %', new.id, v_estado, v_msg;
      begin
        insert into public.fcg_observational_log
          (event, contract_id, request_id, detail)
        values ('infrastructure_error', new.id, v_request_id,
                'sqlstate=' || v_estado || ' ' || v_msg);
      exception when others then
        null; -- auditoria indisponivel tambem nao pode bloquear contratacao
      end;
    end;
  end;

  return null;
end;
$$;

comment on function public.fcg_contract_observational_hook() is
  'OBSERVATIONAL ONLY - MUST NOT BE USED FOR ENFORCEMENT. '
  'O enforcement futuro roda dentro de accept_bid_and_create_contract, apos os locks e antes do INSERT.';

create trigger fcg_contract_observational_trg
  after insert on public.contracts
  for each row execute function public.fcg_contract_observational_hook();


-- -----------------------------------------------------------------------------
-- 3. Flags: modo observacional, ambas desligadas
-- -----------------------------------------------------------------------------
insert into public.operational_flags (key, value, reason, request_id)
values
  ('freight_compliance_gate_enabled', false,
   'Fase 1A observacional. Desligada ate homologacao juridica e operacional.',
   gen_random_uuid()),
  ('freight_compliance_gate_enforcing', false,
   'Enforcement NUNCA ligado nesta fase. Nenhum contrato pode ser bloqueado.',
   gen_random_uuid());
