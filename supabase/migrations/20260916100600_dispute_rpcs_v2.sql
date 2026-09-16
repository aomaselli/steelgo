-- =============================================================================
-- MODULO 2 (7/9) : RPCs DE DISPUTA v2
-- =============================================================================
-- REGRAS (todas testadas):
--   * partes: SOMENTE proprietarios (companies.owner_id) das empresas
--     embarcadora e transportadora do contrato; motorista e recusado no
--     servidor (42501); administrador nao abre nem alega;
--   * abertura: contrato active, ou completed ate 7 dias apos completed_at e
--     com pagamento em released_confirmed|settled; uma disputa por contrato,
--     permanente; o status anterior do contrato e gravado na abertura;
--   * requerido registrado na abertura; papeis (claimant/respondent) derivados
--     da propriedade das empresas, nunca constantes;
--   * instrucao (claims, evidencias, pedidos) somente em open | under_review |
--     awaiting_evidence; comentarios tambem em decided; nada apos encerrado;
--   * pedidos de evidencia com ciclo de vida; 'both' e atomico;
--   * atribuicao obrigatoria: somente o administrador atribuido decide,
--     pede/dispensa evidencia e encerra;
--   * decisao: decided_amount = disputed_amount; S/C/P validados contra a
--     formula; recusada com pedido aberto vigente ou intent em
--     reconciliation_required; correcao por supersedes so antes de qualquer
--     transacao/obrigacao;
--   * retirada: so o requerente, antes da decisao, nota >= 20;
--   * encerramento: so com liquidacao concluida (ver settlement_state);
--     restaura EXATAMENTE o status anterior do contrato;
--   * notificacoes internas em cada evento relevante;
--   * ordem global de locks: contracts -> payment_intents ->
--     payment_transactions -> dispute_cases -> (decisoes/pedidos/obrigacoes).
--     RPCs que nao tocam dinheiro travam somente dispute_cases;
--   * escala monetaria: parametros validados com scale(p) <= 2 antes de
--     qualquer escrita (colunas numeric(16,2) arredondariam em silencio).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. helpers internos (EXECUTE so postgres)
-- -----------------------------------------------------------------------------
-- Papel do ator no CONTRATO para fins de disputa: 'claimant' para o
-- proprietario de uma das empresas; NULL para todo o resto. Motorista: NULL,
-- de proposito (identidade contracts.driver_id x drivers ainda inconsistente).
create or replace function public.contract_dispute_role(p_contract_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_c     public.contracts%rowtype;
begin
  if v_actor is null then
    return null;
  end if;
  select * into v_c from public.contracts c where c.id = p_contract_id;
  if not found then
    return null;
  end if;
  if public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id) is not null then
    return 'claimant';
  end if;
  return null;
end;
$fn$;

-- evento do caso: assinatura ampliada (cita pedido, transacao e obrigacao)
drop function public.dispute_event_append(uuid, text, public.dispute_status, uuid, uuid, uuid, uuid, text, text, text, uuid, text);
create function public.dispute_event_append(
  p_case_id             uuid,
  p_event_type          text,
  p_new_status          public.dispute_status,
  p_decision_id         uuid,
  p_evidence_id         uuid,
  p_claim_id            uuid,
  p_actor_id            uuid,
  p_actor_kind          text,
  p_note                text,
  p_rpc_name            text,
  p_request_id          uuid,
  p_fingerprint         text,
  p_evidence_request_id uuid default null,
  p_transaction_id      uuid default null,
  p_recovery_id         uuid default null
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
    rpc_name, request_id, params_fingerprint,
    evidence_request_id, transaction_id, recovery_id
  ) values (
    p_case_id, v_case.last_event_id, p_event_type, v_case.status, p_new_status,
    p_decision_id, p_evidence_id, p_claim_id, p_actor_id, p_actor_kind, p_note,
    p_rpc_name, p_request_id, p_fingerprint,
    p_evidence_request_id, p_transaction_id, p_recovery_id
  )
  returning id into v_event;
  update public.dispute_cases d
     set status = p_new_status, last_event_id = v_event, updated_at = now()
   where d.id = p_case_id;
  return v_event;
end;
$fn$;

-- notificacoes do caso: proprietarios ATUAIS das duas empresas, o admin
-- atribuido (ou todos os admins, se pedido e sem atribuido); nunca o ator.
create function public.notify_dispute_case(
  p_case_id        uuid,
  p_type           text,
  p_title          text,
  p_body           text,
  p_exclude_user   uuid,
  p_include_admins boolean,
  p_only_role      text default null   -- 'claimant' | 'respondent' | null (ambas)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_d   public.dispute_cases%rowtype;
  v_c   public.contracts%rowtype;
  v_n   integer := 0;
  r     record;
begin
  select * into v_d from public.dispute_cases d where d.id = p_case_id;
  if not found then return 0; end if;
  select * into v_c from public.contracts c where c.id = v_d.contract_id;

  for r in
    select co.owner_id as user_id, p.role::text as role,
           case when co.id = v_c.shipper_company_id then '/shipper/disputes/' else '/carrier/disputes/' end as prefix
      from public.dispute_parties p
      join public.companies co on co.id = p.company_id
     where p.case_id = p_case_id
       and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)
       and (p_only_role is null or p.role::text = p_only_role)
  loop
    if r.user_id is distinct from p_exclude_user then
      if public.notify_user(r.user_id, p_type, p_title, p_body, r.prefix || p_case_id::text,
                            p_case_id, v_d.contract_id) is not null then
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  if p_include_admins then
    if v_d.assigned_to is not null then
      if v_d.assigned_to is distinct from p_exclude_user then
        if public.notify_user(v_d.assigned_to, p_type, p_title, p_body,
                              '/admin/disputes/' || p_case_id::text, p_case_id, v_d.contract_id) is not null then
          v_n := v_n + 1;
        end if;
      end if;
    else
      for r in select ur.user_id from public.user_roles ur where ur.role = 'admin'::public.app_role loop
        if r.user_id is distinct from p_exclude_user then
          if public.notify_user(r.user_id, p_type, p_title, p_body,
                                '/admin/disputes/' || p_case_id::text, p_case_id, v_d.contract_id) is not null then
            v_n := v_n + 1;
          end if;
        end if;
      end loop;
    end if;
  end if;
  return v_n;
end;
$fn$;

-- comprovacao do artefato de evidencia no bucket dispute-evidence
create function public.assert_dispute_evidence(
  p_case_id      uuid,
  p_uploader     uuid,
  p_kind         text,
  p_artifact_ref text,
  p_content_hash text
)
returns table (etag text, size_bytes bigint, mime text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_o    record;
  v_name text;
  v_pat  text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
              || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
              || '(photo|document|invoice|message|other)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-'
              || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-'
              || '[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$';
  v_size bigint; v_mime text; v_etag text;
begin
  if p_kind not in ('photo', 'document', 'invoice', 'message', 'other') then
    raise exception using errcode = '22023',
      message = format('evidencia: tipo %s nao admite arquivo anexado', p_kind);
  end if;
  if p_artifact_ref !~ v_pat then
    raise exception using errcode = '22023',
      message = 'evidencia: caminho fora do padrao exigido para dispute-evidence';
  end if;
  select o.path_tokens, o.metadata, o.user_metadata, o.owner_id, o.owner into v_o
    from storage.objects o
   where o.bucket_id = 'dispute-evidence' and o.name = p_artifact_ref;
  if not found then
    raise exception using errcode = '22023',
      message = 'evidencia: objeto nao encontrado no bucket dispute-evidence. Nada foi registrado.';
  end if;
  if v_o.path_tokens[1] is distinct from p_case_id::text then
    raise exception using errcode = '22023',
      message = 'evidencia: o caminho nao pertence a este caso';
  end if;
  -- autoria pelo owner registrado pelo Storage no upload, nunca pelo caminho
  if coalesce(v_o.owner_id, v_o.owner::text) is distinct from p_uploader::text then
    raise exception using errcode = '22023',
      message = 'evidencia: o arquivo foi enviado por outro usuario';
  end if;
  v_name := v_o.path_tokens[3];
  if v_name !~ ('^' || p_kind || '-') then
    raise exception using errcode = '22023',
      message = format('evidencia: o arquivo e de %s, mas a evidencia e de %s',
                       split_part(v_name, '-', 1), p_kind);
  end if;
  if position(('-' || substr(p_content_hash, 1, 16) || '.') in v_name) = 0 then
    raise exception using errcode = '22023',
      message = 'evidencia: o nome do arquivo nao carrega o prefixo do hash declarado';
  end if;
  if (v_o.user_metadata ->> 'sha256') is distinct from p_content_hash then
    raise exception using errcode = '22023',
      message = 'evidencia: o sha-256 declarado no upload difere do declarado agora';
  end if;
  v_mime := v_o.metadata ->> 'mimetype';
  if v_mime is null or v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception using errcode = '22023',
      message = format('evidencia: tipo registrado pelo Storage nao permitido (%s)', coalesce(v_mime, 'ausente'));
  end if;
  begin
    v_size := (v_o.metadata ->> 'size')::bigint;
  exception when others then
    v_size := null;
  end;
  if v_size is null or v_size < 1 or v_size > 10485760 then
    raise exception using errcode = '22023',
      message = format('evidencia: tamanho observado pelo Storage invalido (%s)', coalesce(v_size::text, 'ausente'));
  end if;
  v_etag := nullif(btrim(coalesce(v_o.metadata ->> 'eTag', '')), '');
  if v_etag is null then
    raise exception using errcode = '22023',
      message = 'evidencia: o Storage nao registrou identificador (eTag) para o objeto';
  end if;
  return query select v_etag, v_size, v_mime;
end;
$fn$;

-- expira pedidos abertos (todos, ou so os vencidos) com evento por pedido
create function public.dispute_expire_open_requests(
  p_case_id       uuid,
  p_only_past_due boolean,
  p_rpc_name      text,
  p_request_id    uuid,
  p_fingerprint   text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r   record;
  v_n integer := 0;
  v_d public.dispute_cases%rowtype;
begin
  select * into v_d from public.dispute_cases d where d.id = p_case_id;
  for r in select * from public.dispute_evidence_requests q
            where q.case_id = p_case_id and q.status = 'open'
              and (not p_only_past_due or now() > q.due_at)
            order by q.created_at for update loop
    update public.dispute_evidence_requests q set status = 'expired' where q.id = r.id;
    perform public.dispute_event_append(
      p_case_id, 'evidence_request_expired', v_d.status, null, null, null,
      null, 'system',
      format('Pedido de evidencia a %s expirado (prazo %s).', r.target_role, r.due_at),
      p_rpc_name, p_request_id, p_fingerprint, r.id, null, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

revoke all on function public.contract_dispute_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.dispute_event_append(uuid, text, public.dispute_status, uuid, uuid, uuid, uuid, text, text, text, uuid, text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.notify_dispute_case(uuid, text, text, text, uuid, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.assert_dispute_evidence(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.dispute_expire_open_requests(uuid, boolean, text, uuid, text) from public, anon, authenticated, service_role;

-- =============================================================================
-- 1. ABERTURA
-- =============================================================================
create or replace function public.open_dispute_case(
  p_contract_id     uuid,
  p_reason_code     public.dispute_reason_code,
  p_description     text,
  p_disputed_amount numeric,
  p_statement       text,
  p_request_id      uuid
)
returns table (
  case_id           uuid,
  case_number       text,
  dispute_state     public.dispute_status,
  release_suspended boolean,
  was_replayed      boolean
)
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
  v_case   uuid;
  v_num    text;
  v_claim  uuid;
  v_susp   boolean := false;
  v_state  public.dispute_status;
  v_my_co  uuid;
  v_oth_co uuid;
  v_oth_ow uuid;
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
      message = 'open_dispute_case: descricao e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  if p_statement is null or length(btrim(p_statement)) < 20 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: a alegacao de quem abre e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  if p_disputed_amount is null or p_disputed_amount <= 0 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado tem de ser positivo';
  end if;
  if scale(p_disputed_amount) > 2 then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado com mais de duas casas decimais';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'reason_code', p_reason_code::text,
    'disputed_amount', p_disputed_amount::text));
  v_log := public.rpc_idempotency_probe(
    'open_dispute_case', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select d.id, d.case_number, d.status into v_case, v_num, v_state
      from public.dispute_cases d where d.contract_id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select v_case, v_num, v_state, coalesce(v_i.release_blocked_by_dispute, false), true;
    return;
  end if;

  -- locks: contrato -> intent (o caso ainda nao existe)
  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'open_dispute_case: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id for update;

  -- SOMENTE PROPRIETARIOS das empresas do contrato. Motorista e administrador
  -- nao abrem disputa.
  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is null then
    raise exception using errcode = '42501',
      message = 'open_dispute_case: somente o proprietario da empresa embarcadora ou da '
                'transportadora do contrato abre disputa';
  end if;

  -- UMA DISPUTA POR CONTRATO, PERMANENTE: verificado antes do status, para a
  -- mensagem dizer a causa real (o contrato 'disputed' e consequencia do caso)
  if exists (select 1 from public.dispute_cases d where d.contract_id = p_contract_id) then
    raise exception using errcode = '23505',
      message = 'open_dispute_case: este contrato ja possui disputa registrada; e admitida uma '
                'unica disputa por contrato';
  end if;

  if v_c.status = 'active'::public.contract_status then
    null;
  elsif v_c.status = 'completed'::public.contract_status then
    if v_c.completed_at is null or now() > v_c.completed_at + interval '7 days' then
      raise exception using errcode = '22023',
        message = format('open_dispute_case: prazo de disputa encerrado em %s (7 dias apos a '
                         'conclusao do contrato)',
                         coalesce((v_c.completed_at + interval '7 days')::text, 'data desconhecida'));
    end if;
    if v_i.id is null or v_i.internal_status not in ('released_confirmed'::public.payment_internal_status,
                                                      'settled'::public.payment_internal_status) then
      raise exception using errcode = '22023',
        message = format('open_dispute_case: contrato concluido sem estado financeiro governado '
                         '(%s); inconsistencia - a disputa nao pode ser aberta',
                         coalesce(v_i.internal_status::text, 'sem intencao de pagamento'));
    end if;
  else
    raise exception using errcode = '22023',
      message = format('open_dispute_case: contrato em %s; disputa so se abre sobre contrato '
                       'active ou completed (ate 7 dias)', v_c.status);
  end if;
  if p_disputed_amount > coalesce(v_c.total_amount_brl, 0) then
    raise exception using errcode = '22023',
      message = 'open_dispute_case: valor contestado maior que o valor do contrato';
  end if;
  if v_party = 'shipper' then
    v_my_co := v_c.shipper_company_id; v_oth_co := v_c.carrier_company_id;
  else
    v_my_co := v_c.carrier_company_id; v_oth_co := v_c.shipper_company_id;
  end if;
  select co.owner_id into v_oth_ow from public.companies co where co.id = v_oth_co;

  v_num := 'SG-D-' || to_char(now(), 'YYYYMMDD') || '-'
           || upper(right(replace(p_contract_id::text, '-', ''), 8));

  insert into public.dispute_cases (
    case_number, contract_id, freight_id, payment_intent_id,
    opened_by, opened_by_role, reason_code, description,
    disputed_amount, currency_code, status, priority, due_at,
    previous_contract_status, settlement_state
  ) values (
    v_num, p_contract_id, v_c.freight_id, v_i.id,
    v_actor, 'claimant', p_reason_code, p_description,
    p_disputed_amount, 'BRL', 'open', 'normal', now() + interval '7 days',
    v_c.status, 'undecided'
  )
  returning id into v_case;

  -- as DUAS partes, desde a abertura
  insert into public.dispute_parties (case_id, user_id, company_id, role, added_by)
  values (v_case, v_actor, v_my_co, 'claimant', v_actor),
         (v_case, v_oth_ow, v_oth_co, 'respondent', v_actor);

  insert into public.dispute_claims (
    case_id, claimed_by, claimed_by_role, reason_code, statement, claimed_amount, currency_code
  ) values (v_case, v_actor, 'claimant', p_reason_code, p_statement, p_disputed_amount, 'BRL')
  returning id into v_claim;

  -- SUSPENSAO DA LIBERACAO AINDA NAO CONFIRMADA. Pagamento ja repassado ou ja
  -- liquidado nao e tocado: o efeito sera uma obrigacao de recuperacao.
  if v_i.id is not null
     and v_i.internal_status not in ('released_confirmed'::public.payment_internal_status,
                                     'settled'::public.payment_internal_status) then
    update public.payment_intents pi set release_blocked_by_dispute = true where pi.id = v_i.id;
    v_susp := true;
    perform public.payment_event_append(
      v_i.id, 'release_blocked_by_dispute', v_i.internal_status,
      null, null, null, null, 'internal', v_actor, 'party', null, null, null, null,
      format('Liberacao suspensa pela abertura do caso %s.', v_num),
      'open_dispute_case', p_request_id, v_fp);
  end if;

  perform public.dispute_event_append(
    v_case, 'opened', 'open'::public.dispute_status, null, null, v_claim,
    v_actor, 'party', p_description, 'open_dispute_case', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'disputed'::public.contract_lifecycle_transition,
    'disputed'::public.contract_status, v_c.escrow_status,
    null, null, v_i.id, v_case, p_disputed_amount,
    v_actor, 'party', format('Disputa %s aberta.', v_num),
    'open_dispute_case', p_request_id, v_fp);

  perform public.notify_dispute_case(
    v_case, 'dispute_opened', format('Disputa %s aberta', v_num),
    format('Uma disputa foi aberta sobre o contrato %s. Valor contestado: R$ %s.',
           coalesce(v_c.contract_number, left(p_contract_id::text, 8)), p_disputed_amount),
    v_actor, true);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('open_dispute_case', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('caso %s aberto pela empresa %s (%s); liberacao %s', v_num, v_my_co, v_party,
                 case when v_susp then 'SUSPENSA' else 'nao suspensa' end));

  return query select v_case, v_num, 'open'::public.dispute_status, v_susp, false;
end;
$fn$;

-- =============================================================================
-- 2. ALEGACAO ADICIONAL
-- =============================================================================
create or replace function public.add_dispute_claim(
  p_case_id        uuid,
  p_reason_code    public.dispute_reason_code,
  p_statement      text,
  p_claimed_amount numeric,
  p_request_id     uuid
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
      message = 'add_dispute_claim: alegacao e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  if p_claimed_amount is not null and (p_claimed_amount <= 0 or scale(p_claimed_amount) > 2) then
    raise exception using errcode = '22023',
      message = 'add_dispute_claim: valor alegado deve ser positivo com no maximo duas casas decimais';
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
  if v_case.status not in ('open'::public.dispute_status, 'under_review'::public.dispute_status,
                           'awaiting_evidence'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = format('add_dispute_claim: caso em %s; a instrucao esta encerrada e nao '
                       'recebe nova alegacao', v_case.status);
  end if;

  v_role := public.dispute_party_role_of(p_case_id, v_actor);
  if v_role is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_claim: somente as partes alegam. Administrador nao fabrica '
                'alegacao em nome da parte.';
  end if;

  insert into public.dispute_claims (
    case_id, claimed_by, claimed_by_role, reason_code, statement, claimed_amount, currency_code
  ) values (
    p_case_id, v_actor, v_role::public.dispute_party_role, p_reason_code, p_statement,
    p_claimed_amount, case when p_claimed_amount is null then null else 'BRL' end)
  returning id into v_claim;

  perform public.dispute_event_append(
    p_case_id, 'claim_added',
    case when v_case.status = 'open'::public.dispute_status
         then 'under_review'::public.dispute_status else v_case.status end,
    null, null, v_claim, v_actor, 'party', p_statement,
    'add_dispute_claim', p_request_id, v_fp);

  perform public.notify_dispute_case(
    p_case_id, 'dispute_claim', format('Nova alegacao no caso %s', v_case.case_number),
    format('A parte %s registrou uma nova alegacao.',
           case v_role when 'claimant' then 'requerente' else 'requerida' end),
    v_actor, true);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('add_dispute_claim', p_request_id, v_actor, v_claim, v_fp, 'accepted',
          format('alegacao %s (%s) adicionada ao caso %s', v_claim, v_role, p_case_id));
  return v_claim;
end;
$fn$;

-- =============================================================================
-- 3. EVIDENCIA  -  avulsa, por alegacao, ou atendendo pedido
-- =============================================================================
create function public.dispute_evidence_insert(
  p_case_id        uuid,
  p_actor          uuid,
  p_claim_id       uuid,
  p_evidence_req   uuid,
  p_kind           text,
  p_description    text,
  p_artifact_ref   text,
  p_content_hash   text,
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
  v_case  public.dispute_cases%rowtype;
  v_role  text;
  v_admin boolean;
  v_kind  text := coalesce(p_kind, 'other');
  v_ev    uuid;
  v_size  bigint; v_etag text; v_mime text;
  v_req   public.dispute_evidence_requests%rowtype;
  v_new   public.dispute_status;
  v_open  integer;
begin
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = p_rpc_name || ': content_hash deve ser sha-256 hexadecimal de 64 caracteres';
  end if;
  if p_description is null or length(btrim(p_description)) = 0 then
    raise exception using errcode = '22023',
      message = p_rpc_name || ': descricao da evidencia e obrigatoria';
  end if;
  if v_kind not in ('photo', 'document', 'checkpoint', 'message', 'invoice', 'other') then
    raise exception using errcode = '22023',
      message = p_rpc_name || ': tipo de evidencia invalido';
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = p_rpc_name || ': caso inexistente';
  end if;
  if v_case.status not in ('open'::public.dispute_status, 'under_review'::public.dispute_status,
                           'awaiting_evidence'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = format('%s: caso em %s; a instrucao esta encerrada e nao recebe nova evidencia',
                       p_rpc_name, v_case.status);
  end if;

  v_role  := public.dispute_party_role_of(p_case_id, p_actor);
  v_admin := coalesce(public.has_role(p_actor, 'admin'::public.app_role), false);
  if v_role is null and not v_admin then
    raise exception using errcode = '42501',
      message = p_rpc_name || ': somente as partes do caso ou um administrador apresentam evidencia';
  end if;

  if p_claim_id is not null and not exists (
       select 1 from public.dispute_claims cl where cl.id = p_claim_id and cl.case_id = p_case_id) then
    raise exception using errcode = '22023',
      message = p_rpc_name || ': a alegacao citada nao pertence a este caso';
  end if;

  if p_evidence_req is not null then
    select * into v_req from public.dispute_evidence_requests q
     where q.id = p_evidence_req and q.case_id = p_case_id for update;
    if not found then
      raise exception using errcode = '22023',
        message = p_rpc_name || ': o pedido de evidencia citado nao pertence a este caso';
    end if;
    if v_req.status <> 'open' then
      raise exception using errcode = '22023',
        message = format('%s: o pedido de evidencia esta %s e nao aceita atendimento', p_rpc_name, v_req.status);
    end if;
    if now() > v_req.due_at then
      raise exception using errcode = '22023',
        message = format('%s: o prazo do pedido de evidencia venceu em %s', p_rpc_name, v_req.due_at);
    end if;
    if v_role is null or v_req.target_role::text <> v_role then
      raise exception using errcode = '42501',
        message = p_rpc_name || ': o pedido de evidencia e dirigido a outra parte';
    end if;
  end if;

  if p_artifact_ref is not null then
    select f.etag, f.size_bytes, f.mime into v_etag, v_size, v_mime
      from public.assert_dispute_evidence(p_case_id, p_actor, v_kind, p_artifact_ref, p_content_hash) f;
  end if;

  insert into public.dispute_evidence (
    case_id, claim_id, submitted_by, submitted_by_role, kind, description,
    artifact_ref, content_hash, artifact_size_bytes, artifact_etag, artifact_mime,
    evidence_request_id
  ) values (
    p_case_id, p_claim_id, p_actor,
    case when v_role is null then 'admin_reviewer'::public.dispute_party_role
         else v_role::public.dispute_party_role end,
    v_kind, p_description, p_artifact_ref, p_content_hash,
    v_size, v_etag, v_mime,
    p_evidence_req)
  returning id into v_ev;

  if p_evidence_req is not null then
    update public.dispute_evidence_requests q
       set status = 'fulfilled', fulfilled_by = p_actor, fulfilled_at = now(), evidence_id = v_ev
     where q.id = p_evidence_req;
    perform public.dispute_event_append(
      p_case_id, 'evidence_request_fulfilled', v_case.status, null, v_ev, null,
      p_actor, 'party', format('Pedido de evidencia a %s atendido.', v_role),
      p_rpc_name, p_request_id, p_fingerprint, p_evidence_req, null, null);
  end if;

  -- awaiting_evidence -> under_review SOMENTE sem pedido aberto restante
  select count(*) into v_open from public.dispute_evidence_requests q
   where q.case_id = p_case_id and q.status = 'open';
  v_new := case
    when v_case.status = 'open'::public.dispute_status then 'under_review'::public.dispute_status
    when v_case.status = 'awaiting_evidence'::public.dispute_status and v_open = 0
      then 'under_review'::public.dispute_status
    else v_case.status end;

  perform public.dispute_event_append(
    p_case_id, 'evidence_added', v_new, null, v_ev, p_claim_id, p_actor,
    case when v_role is null then 'admin' else 'party' end,
    p_description, p_rpc_name, p_request_id, p_fingerprint);

  perform public.notify_dispute_case(
    p_case_id, 'dispute_evidence', format('Nova evidencia no caso %s', v_case.case_number),
    format('%s apresentou uma evidencia (%s).',
           case when v_role is null then 'A Equipe SteelGo'
                when v_role = 'claimant' then 'A parte requerente' else 'A parte requerida' end,
           v_kind),
    p_actor, true);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values (p_rpc_name, p_request_id, p_actor, v_ev, p_fingerprint, 'accepted',
          format('evidencia %s (%s) apresentada no caso %s%s', v_ev, coalesce(v_role, 'admin'),
                 p_case_id, case when p_evidence_req is null then '' else format('; atende o pedido %s', p_evidence_req) end));
  return v_ev;
end;
$fn$;
revoke all on function public.dispute_evidence_insert(uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.add_dispute_evidence(
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
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_evidence: chamador nao autenticado';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'add_dispute_evidence: content_hash deve ser sha-256 hexadecimal de 64 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'content_hash', p_content_hash));
  v_log := public.rpc_idempotency_probe(
    'add_dispute_evidence', p_request_id, v_actor, p_case_id, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;
  return public.dispute_evidence_insert(
    p_case_id, v_actor, null, null, p_kind, p_description, p_artifact_ref, p_content_hash,
    'add_dispute_evidence', p_request_id, v_fp);
end;
$fn$;

create function public.add_dispute_evidence_for_claim(
  p_case_id      uuid,
  p_claim_id     uuid,
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
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_evidence_for_claim: chamador nao autenticado';
  end if;
  if p_claim_id is null then
    raise exception using errcode = '22004',
      message = 'add_dispute_evidence_for_claim: p_claim_id e obrigatorio';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'add_dispute_evidence_for_claim: content_hash deve ser sha-256 hexadecimal de 64 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'claim_id', p_claim_id, 'content_hash', p_content_hash));
  v_log := public.rpc_idempotency_probe(
    'add_dispute_evidence_for_claim', p_request_id, v_actor, p_case_id, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;
  return public.dispute_evidence_insert(
    p_case_id, v_actor, p_claim_id, null, p_kind, p_description, p_artifact_ref, p_content_hash,
    'add_dispute_evidence_for_claim', p_request_id, v_fp);
end;
$fn$;

create function public.add_dispute_evidence_for_request(
  p_case_id             uuid,
  p_evidence_request_id uuid,
  p_kind                text,
  p_description         text,
  p_artifact_ref        text,
  p_content_hash        text,
  p_request_id          uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_evidence_for_request: chamador nao autenticado';
  end if;
  if p_evidence_request_id is null then
    raise exception using errcode = '22004',
      message = 'add_dispute_evidence_for_request: p_evidence_request_id e obrigatorio';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'add_dispute_evidence_for_request: content_hash deve ser sha-256 hexadecimal de 64 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'evidence_request_id', p_evidence_request_id, 'content_hash', p_content_hash));
  v_log := public.rpc_idempotency_probe(
    'add_dispute_evidence_for_request', p_request_id, v_actor, p_case_id, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;
  return public.dispute_evidence_insert(
    p_case_id, v_actor, null, p_evidence_request_id, p_kind, p_description, p_artifact_ref,
    p_content_hash, 'add_dispute_evidence_for_request', p_request_id, v_fp);
end;
$fn$;

-- =============================================================================
-- 4. COMENTARIO
-- =============================================================================
create function public.add_dispute_comment(
  p_case_id    uuid,
  p_body       text,
  p_internal   boolean,
  p_request_id uuid
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
  v_id    uuid;
  v_vis   text;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'add_dispute_comment: chamador nao autenticado';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 4000 then
    raise exception using errcode = '22023',
      message = 'add_dispute_comment: comentario e obrigatorio (ate 4000 caracteres)';
  end if;
  v_vis := case when coalesce(p_internal, false) then 'internal_admin' else 'all_parties' end;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'visibility', v_vis,
    'body_digest', public.rpc_params_fingerprint(jsonb_build_object('b', p_body))));
  v_log := public.rpc_idempotency_probe(
    'add_dispute_comment', p_request_id, v_actor, p_case_id, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'add_dispute_comment: caso inexistente';
  end if;
  if v_case.status in ('closed'::public.dispute_status, 'withdrawn'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = 'add_dispute_comment: caso encerrado nao recebe comentario';
  end if;

  v_role  := public.dispute_party_role_of(p_case_id, v_actor);
  v_admin := coalesce(public.has_role(v_actor, 'admin'::public.app_role), false);
  if v_role is null and not v_admin then
    raise exception using errcode = '42501',
      message = 'add_dispute_comment: somente as partes do caso ou um administrador comentam';
  end if;
  if v_vis = 'internal_admin' and not v_admin then
    raise exception using errcode = '42501',
      message = 'add_dispute_comment: comentario interno e exclusivo de administrador';
  end if;

  insert into public.dispute_comments (case_id, author_id, author_role, body, visibility)
  values (p_case_id, v_actor,
          case when v_admin then 'admin_reviewer'::public.dispute_party_role
               else v_role::public.dispute_party_role end,
          p_body, v_vis)
  returning id into v_id;

  -- o evento cita o comentario pelo id (o corpo esta em dispute_comments);
  -- o estado do caso nao muda
  perform public.dispute_event_append(
    p_case_id, 'comment_added', v_case.status, null, null, null, v_actor,
    case when v_admin then 'admin' else 'party' end, v_id::text,
    'add_dispute_comment', p_request_id, v_fp);

  if v_vis = 'all_parties' then
    perform public.notify_dispute_case(
      p_case_id, 'dispute_comment', format('Novo comentario no caso %s', v_case.case_number),
      format('%s comentou no caso.',
             case when v_admin then 'A Equipe SteelGo'
                  when v_role = 'claimant' then 'A parte requerente' else 'A parte requerida' end),
      v_actor, true);
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('add_dispute_comment', p_request_id, v_actor, v_id, v_fp, 'accepted',
          format('comentario %s (%s) no caso %s', v_id, v_vis, p_case_id));
  return v_id;
end;
$fn$;

-- =============================================================================
-- 5. ATRIBUICAO / REATRIBUICAO
-- =============================================================================
create function public.assign_dispute_case(
  p_case_id    uuid,
  p_assignee   uuid,
  p_note       text,
  p_request_id uuid
)
returns table (
  case_id        uuid,
  assignee_label text,
  was_reassigned boolean,
  was_replayed   boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('assign_dispute_case');
  v_case  public.dispute_cases%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_prev  uuid;
  v_label text;
begin
  if p_case_id is null or p_assignee is null then
    raise exception using errcode = '22004',
      message = 'assign_dispute_case: caso e administrador destinatario sao obrigatorios';
  end if;
  if not coalesce(public.has_role(p_assignee, 'admin'::public.app_role), false) then
    raise exception using errcode = '22023',
      message = 'assign_dispute_case: o destinatario nao e administrador';
  end if;
  if p_note is not null and length(btrim(p_note)) = 0 then
    raise exception using errcode = '22023',
      message = 'assign_dispute_case: nota, quando informada, nao pode ser em branco';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object('case_id', p_case_id, 'assignee', p_assignee));
  v_log := public.rpc_idempotency_probe('assign_dispute_case', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    return query select p_case_id,
                        (public.dispute_actor_json(p_case_id, v_case.assigned_to, v_actor, true) ->> 'label'),
                        v_log.detail like 'reatribu%', true;
    return;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'assign_dispute_case: caso inexistente';
  end if;
  if v_case.status in ('closed'::public.dispute_status, 'withdrawn'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = 'assign_dispute_case: caso encerrado nao e atribuido';
  end if;
  if v_case.assigned_to = p_assignee then
    raise exception using errcode = '22023',
      message = 'assign_dispute_case: o caso ja esta atribuido a este administrador';
  end if;
  v_prev := v_case.assigned_to;

  update public.dispute_cases d
     set assigned_to = p_assignee, assigned_at = now(), updated_at = now()
   where d.id = p_case_id;

  perform public.dispute_event_append(
    p_case_id, case when v_prev is null then 'assigned' else 'reassigned' end,
    v_case.status, null, null, null, v_actor, 'admin', p_note,
    'assign_dispute_case', p_request_id, v_fp);

  v_label := public.dispute_actor_json(p_case_id, p_assignee, v_actor, true) ->> 'label';

  if p_assignee is distinct from v_actor then
    perform public.notify_user(p_assignee, 'dispute_assigned',
      format('Caso %s atribuido a voce', v_case.case_number),
      case when v_prev is null then 'Voce assumiu a analise deste caso.'
           else 'O caso foi reatribuido a voce.' end,
      '/admin/disputes/' || p_case_id::text, p_case_id, v_case.contract_id);
  end if;
  if v_prev is not null and v_prev is distinct from v_actor and v_prev is distinct from p_assignee then
    perform public.notify_user(v_prev, 'dispute_assigned',
      format('Caso %s reatribuido', v_case.case_number),
      'O caso deixou de estar atribuido a voce.',
      '/admin/disputes/' || p_case_id::text, p_case_id, v_case.contract_id);
  end if;
  perform public.notify_dispute_case(
    p_case_id, 'dispute_assigned',
    format('Caso %s em analise', v_case.case_number),
    'A Equipe SteelGo assumiu a analise do caso.', v_actor, false);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('assign_dispute_case', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          case when v_prev is null then format('atribuido a %s', p_assignee)
               else format('reatribuido de %s para %s', v_prev, p_assignee) end);

  return query select p_case_id, v_label, v_prev is not null, false;
end;
$fn$;

-- =============================================================================
-- 6. PEDIDO DE EVIDENCIA  -  'both' e atomico
-- =============================================================================
create function public.request_dispute_evidence(
  p_case_id     uuid,
  p_target_role text,
  p_description text,
  p_due_at      timestamptz,
  p_request_id  uuid
)
returns table (evidence_request_id uuid, target_role text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor   uuid := public.require_steelgo_admin('request_dispute_evidence');
  v_case    public.dispute_cases%rowtype;
  v_fp      text;
  v_log     public.rpc_call_log%rowtype;
  v_targets text[];
  v_t       text;
  v_id      uuid;
begin
  if p_case_id is null or p_target_role is null then
    raise exception using errcode = '22004',
      message = 'request_dispute_evidence: caso e destinatario sao obrigatorios';
  end if;
  if p_target_role not in ('claimant', 'respondent', 'both') then
    raise exception using errcode = '22023',
      message = 'request_dispute_evidence: destinatario deve ser claimant, respondent ou both';
  end if;
  if p_description is null or length(btrim(p_description)) < 20 then
    raise exception using errcode = '22023',
      message = 'request_dispute_evidence: descricao do pedido precisa de ao menos 20 caracteres';
  end if;
  if p_due_at is null or p_due_at <= now() then
    raise exception using errcode = '22023',
      message = 'request_dispute_evidence: o prazo precisa ser futuro';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'target', p_target_role, 'due_at', p_due_at::text,
    'description_digest', public.rpc_params_fingerprint(jsonb_build_object('d', p_description))));
  v_log := public.rpc_idempotency_probe('request_dispute_evidence', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    return query select q.id, q.target_role::text from public.dispute_evidence_requests q
                  where q.case_id = p_case_id and q.rpc_request_id = p_request_id
                  order by q.target_role;
    return;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'request_dispute_evidence: caso inexistente';
  end if;
  if v_case.status not in ('open'::public.dispute_status, 'under_review'::public.dispute_status,
                           'awaiting_evidence'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = format('request_dispute_evidence: caso em %s nao recebe pedido de evidencia', v_case.status);
  end if;
  if v_case.assigned_to is distinct from v_actor then
    raise exception using errcode = '42501',
      message = 'request_dispute_evidence: somente o administrador atribuido pede evidencia';
  end if;

  v_targets := case p_target_role when 'both' then array['claimant', 'respondent']
                                  else array[p_target_role] end;
  -- verificacao PREVIA dos dois lados: um conflito impede ambos
  foreach v_t in array v_targets loop
    if exists (select 1 from public.dispute_evidence_requests q
                where q.case_id = p_case_id and q.status = 'open' and q.target_role::text = v_t) then
      raise exception using errcode = '23505',
        message = format('request_dispute_evidence: ja existe pedido aberto dirigido a %s', v_t);
    end if;
  end loop;

  foreach v_t in array v_targets loop
    insert into public.dispute_evidence_requests
      (case_id, requested_by, target_role, description, due_at, rpc_request_id)
    values (p_case_id, v_actor, v_t::public.dispute_party_role, p_description, p_due_at, p_request_id)
    returning id into v_id;
    perform public.dispute_event_append(
      p_case_id, 'evidence_requested', 'awaiting_evidence'::public.dispute_status,
      null, null, null, v_actor, 'admin',
      format('Pedido de evidencia a %s, prazo %s: %s', v_t, p_due_at, p_description),
      'request_dispute_evidence', p_request_id, v_fp, v_id, null, null);
    perform public.notify_dispute_case(
      p_case_id, 'dispute_evidence_requested',
      format('Pedido de evidencia no caso %s', v_case.case_number),
      format('A Equipe SteelGo pediu evidencia ate %s: %s', to_char(p_due_at, 'DD/MM/YYYY HH24:MI'), p_description),
      v_actor, false, v_t);
  end loop;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('request_dispute_evidence', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('%s pedido(s) de evidencia (%s) ate %s', cardinality(v_targets), p_target_role, p_due_at));

  return query select q.id, q.target_role::text from public.dispute_evidence_requests q
                where q.case_id = p_case_id and q.rpc_request_id = p_request_id
                order by q.target_role;
end;
$fn$;

create function public.waive_dispute_evidence_request(
  p_case_id             uuid,
  p_evidence_request_id uuid,
  p_note                text,
  p_request_id          uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('waive_dispute_evidence_request');
  v_case  public.dispute_cases%rowtype;
  v_req   public.dispute_evidence_requests%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_open  integer;
begin
  if p_case_id is null or p_evidence_request_id is null then
    raise exception using errcode = '22004',
      message = 'waive_dispute_evidence_request: caso e pedido sao obrigatorios';
  end if;
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023',
      message = 'waive_dispute_evidence_request: justificativa precisa de ao menos 20 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'evidence_request_id', p_evidence_request_id));
  v_log := public.rpc_idempotency_probe('waive_dispute_evidence_request', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    return p_evidence_request_id;
  end if;

  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'waive_dispute_evidence_request: caso inexistente';
  end if;
  if v_case.assigned_to is distinct from v_actor then
    raise exception using errcode = '42501',
      message = 'waive_dispute_evidence_request: somente o administrador atribuido dispensa pedido';
  end if;
  select * into v_req from public.dispute_evidence_requests q
   where q.id = p_evidence_request_id and q.case_id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'waive_dispute_evidence_request: pedido inexistente neste caso';
  end if;
  if v_req.status <> 'open' then
    raise exception using errcode = '22023',
      message = format('waive_dispute_evidence_request: pedido em %s nao pode ser dispensado', v_req.status);
  end if;

  update public.dispute_evidence_requests q
     set status = 'waived', waived_by = v_actor, waived_at = now(), waive_note = p_note
   where q.id = p_evidence_request_id;

  select count(*) into v_open from public.dispute_evidence_requests q
   where q.case_id = p_case_id and q.status = 'open';

  perform public.dispute_event_append(
    p_case_id, 'evidence_request_waived',
    case when v_case.status = 'awaiting_evidence'::public.dispute_status and v_open = 0
         then 'under_review'::public.dispute_status else v_case.status end,
    null, null, null, v_actor, 'admin', p_note,
    'waive_dispute_evidence_request', p_request_id, v_fp, p_evidence_request_id, null, null);

  perform public.notify_dispute_case(
    p_case_id, 'dispute_evidence_requested',
    format('Pedido de evidencia dispensado no caso %s', v_case.case_number),
    'A Equipe SteelGo dispensou o pedido de evidencia dirigido a voce.',
    v_actor, false, v_req.target_role::text);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('waive_dispute_evidence_request', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('pedido %s dispensado', p_evidence_request_id));
  return p_evidence_request_id;
end;
$fn$;

-- =============================================================================
-- 7. RETIRADA PELO REQUERENTE
-- =============================================================================
create function public.withdraw_dispute_case(
  p_case_id    uuid,
  p_note       text,
  p_request_id uuid
)
returns table (
  case_id                  uuid,
  dispute_state            public.dispute_status,
  restored_contract_status public.contract_status,
  was_replayed             boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_case  public.dispute_cases%rowtype;
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'withdraw_dispute_case: chamador nao autenticado';
  end if;
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023',
      message = 'withdraw_dispute_case: justificativa precisa de ao menos 20 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('case_id', p_case_id));
  v_log := public.rpc_idempotency_probe('withdraw_dispute_case', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    select * into v_c from public.contracts c where c.id = v_case.contract_id;
    return query select p_case_id, v_case.status, v_c.status, true;
    return;
  end if;

  -- ordem global: contrato -> intent -> caso
  select * into v_case from public.dispute_cases d where d.id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'withdraw_dispute_case: caso inexistente';
  end if;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id for update;
  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;

  if v_case.status not in ('open'::public.dispute_status, 'under_review'::public.dispute_status,
                           'awaiting_evidence'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = format('withdraw_dispute_case: caso em %s nao pode ser retirado (so antes da decisao)',
                       v_case.status);
  end if;
  if public.dispute_party_role_of(p_case_id, v_actor) is distinct from 'claimant' then
    raise exception using errcode = '42501',
      message = 'withdraw_dispute_case: somente o requerente retira a disputa';
  end if;

  perform public.dispute_expire_open_requests(p_case_id, false, 'withdraw_dispute_case', p_request_id, v_fp);

  if v_i.id is not null and v_i.release_blocked_by_dispute then
    update public.payment_intents pi set release_blocked_by_dispute = false where pi.id = v_i.id;
    perform public.payment_event_append(
      v_i.id, 'release_unblocked', v_i.internal_status, null, null, null, null,
      'internal', v_actor, 'party', null, null, null, null,
      format('Caso %s retirado pelo requerente; liberacao volta a andar.', v_case.case_number),
      'withdraw_dispute_case', p_request_id, v_fp);
  end if;

  -- retorno EXATO ao status anterior
  perform public.contract_lifecycle_append(
    v_c.id, 'dispute_withdrawn'::public.contract_lifecycle_transition,
    v_case.previous_contract_status, v_c.escrow_status, null, null, v_i.id, p_case_id,
    v_case.disputed_amount, v_actor, 'party',
    format('Caso %s retirado pelo requerente. %s', v_case.case_number, p_note),
    'withdraw_dispute_case', p_request_id, v_fp);

  perform public.dispute_event_append(
    p_case_id, 'withdrawn', 'withdrawn'::public.dispute_status, null, null, null,
    v_actor, 'party', p_note, 'withdraw_dispute_case', p_request_id, v_fp);
  update public.dispute_cases d set closed_at = now(), closed_by = v_actor where d.id = p_case_id;

  perform public.notify_dispute_case(
    p_case_id, 'dispute_withdrawn', format('Disputa %s retirada', v_case.case_number),
    'O requerente retirou a disputa. O contrato voltou ao estado anterior.', v_actor, true);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('withdraw_dispute_case', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('caso %s retirado; contrato restaurado a %s', v_case.case_number,
                 v_case.previous_contract_status));

  return query select p_case_id, 'withdrawn'::public.dispute_status, v_case.previous_contract_status, false;
end;
$fn$;

-- =============================================================================
-- 8. DECISAO
-- =============================================================================
create or replace function public.decide_dispute_case(
  p_case_id                uuid,
  p_outcome                public.dispute_decision_outcome,
  p_decided_amount         numeric,
  p_carrier_amount         numeric,
  p_shipper_amount         numeric,
  p_platform_amount        numeric,
  p_rationale              text,
  p_request_id             uuid,
  p_supersedes_decision_id uuid default null
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
  v_actor  uuid := public.require_steelgo_admin('decide_dispute_case');
  v_case   public.dispute_cases%rowtype;
  v_c      public.contracts%rowtype;
  v_i      public.payment_intents%rowtype;
  v_fp     text;
  v_log    public.rpc_call_log%rowtype;
  v_dec    uuid;
  v_g      numeric; v_f numeric; v_d numeric; v_s numeric;
  m        record;
  v_state  text;
  v_due    timestamptz := null;
  v_rec    uuid;
  v_fund_tx public.payment_transactions%rowtype;
begin
  if p_case_id is null or p_outcome is null then
    raise exception using errcode = '22004',
      message = 'decide_dispute_case: caso e desfecho sao obrigatorios';
  end if;
  if p_rationale is null or length(btrim(p_rationale)) < 20 then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: fundamentacao e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  if p_decided_amount is null or p_decided_amount <= 0 then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: valor decidido tem de ser positivo';
  end if;
  if scale(p_decided_amount) > 2 or scale(coalesce(p_carrier_amount, 0)) > 2
     or scale(coalesce(p_shipper_amount, 0)) > 2 or scale(coalesce(p_platform_amount, 0)) > 2 then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: valores com mais de duas casas decimais';
  end if;
  v_s := coalesce(p_shipper_amount, 0);

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'case_id', p_case_id, 'outcome', p_outcome::text,
    'decided_amount', p_decided_amount::text,
    'carrier', coalesce(p_carrier_amount, 0)::text,
    'shipper', v_s::text,
    'platform', coalesce(p_platform_amount, 0)::text));
  v_log := public.rpc_idempotency_probe('decide_dispute_case', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select d.id into v_dec from public.dispute_decisions d where d.case_id = p_case_id and d.is_current;
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    return query select v_dec, p_case_id, v_case.status, true;
    return;
  end if;

  -- ordem global: contrato -> intent -> caso
  select * into v_case from public.dispute_cases d where d.id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'decide_dispute_case: caso inexistente';
  end if;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id for update;
  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;

  if v_case.status in ('closed'::public.dispute_status, 'withdrawn'::public.dispute_status) then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: caso encerrado nao recebe decisao';
  end if;
  if v_case.status = 'decided'::public.dispute_status and p_supersedes_decision_id is null then
    raise exception using errcode = '23505',
      message = 'decide_dispute_case: ja existe decisao vigente neste caso. Para corrigi-la, '
                'informe p_supersedes_decision_id - a decisao anterior NAO e sobrescrita.';
  end if;
  if v_case.assigned_to is distinct from v_actor then
    raise exception using errcode = '42501',
      message = 'decide_dispute_case: somente o administrador atribuido ao caso decide';
  end if;
  if exists (select 1 from public.dispute_evidence_requests q
              where q.case_id = p_case_id and q.status = 'open' and q.due_at >= now()) then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: existe pedido de evidencia aberto e dentro do prazo; '
                'aguarde o atendimento, dispense-o ou espere o vencimento';
  end if;
  if v_i.id is not null and v_i.internal_status = 'reconciliation_required'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = 'decide_dispute_case: pagamento em reconciliation_required; resolva a '
                'reconciliacao antes de decidir';
  end if;

  v_d := v_case.disputed_amount;
  if p_decided_amount <> v_d then
    raise exception using errcode = '22023',
      message = format('decide_dispute_case: a decisao abrange toda a disputa: valor decidido '
                       'tem de ser %s (valor em disputa), recebido %s', v_d, p_decided_amount);
  end if;
  if (p_outcome in ('release_to_carrier'::public.dispute_decision_outcome,
                    'dismissed'::public.dispute_decision_outcome) and v_s <> 0)
     or (p_outcome = 'refund_to_shipper'::public.dispute_decision_outcome and v_s <> v_d)
     or (p_outcome = 'split'::public.dispute_decision_outcome and not (v_s > 0 and v_s < v_d)) then
    raise exception using errcode = '22023',
      message = format('decide_dispute_case: desfecho %s incompativel com a parcela do '
                       'embarcador %s (disputa de %s)', p_outcome, v_s, v_d);
  end if;

  -- SNAPSHOT da fonte: intent, se existir; senao valores contratuais governados
  v_g := coalesce(v_i.gross_amount, v_c.total_amount_brl);
  v_f := coalesce(v_i.platform_fee_amount, v_c.platform_fee_brl);
  select * into m from public.dispute_settlement_math(v_g, v_f, v_d, v_s);
  if coalesce(p_carrier_amount, 0) <> m.carrier_delta or coalesce(p_platform_amount, 0) <> m.platform_delta then
    raise exception using errcode = '22023',
      message = format('decide_dispute_case: parcelas derivadas nao conferem. Para S=%s a formula '
                       'exige transportadora=%s e plataforma=%s (recebido %s e %s)',
                       v_s, m.carrier_delta, m.platform_delta,
                       coalesce(p_carrier_amount, 0), coalesce(p_platform_amount, 0));
  end if;

  -- CORRECAO POR NOVA DECISAO, so com o material existente e antes de qualquer
  -- transacao ou obrigacao da decisao vigente.
  if p_supersedes_decision_id is not null then
    if not exists (select 1 from public.dispute_decisions d
                    where d.id = p_supersedes_decision_id and d.case_id = p_case_id and d.is_current) then
      raise exception using errcode = '22023',
        message = 'decide_dispute_case: a decisao a ser corrigida nao e a decisao vigente deste caso';
    end if;
    if v_case.settlement_state not in ('not_required', 'pending_funding', 'settlement_pending')
       or exists (select 1 from public.payment_transactions t where t.dispute_decision_id = p_supersedes_decision_id)
       or exists (select 1 from public.payment_recoveries r where r.dispute_decision_id = p_supersedes_decision_id) then
      raise exception using errcode = '22023',
        message = 'decide_dispute_case: a decisao vigente ja produziu transacao ou obrigacao; nao '
                  'pode ser corrigida';
    end if;
    update public.dispute_decisions d set is_current = false where d.id = p_supersedes_decision_id;
  elsif exists (select 1 from public.dispute_decisions d where d.case_id = p_case_id and d.is_current) then
    raise exception using errcode = '23505',
      message = 'decide_dispute_case: ja existe decisao vigente neste caso';
  end if;

  -- pedidos abertos ja vencidos: carimbados expirados (o historico nao fica com
  -- pedido aberto em caso decidido)
  perform public.dispute_expire_open_requests(p_case_id, true, 'decide_dispute_case', p_request_id, v_fp);

  insert into public.dispute_decisions (
    case_id, supersedes_decision_id, outcome, decided_amount, currency_code, rationale, decided_by,
    gross_amount, original_platform_fee, shipper_amount, carrier_delta, platform_delta,
    release_amount, carrier_final, platform_fee_final
  ) values (
    p_case_id, p_supersedes_decision_id, p_outcome, v_d, v_case.currency_code, p_rationale, v_actor,
    v_g, v_f, v_s, m.carrier_delta, m.platform_delta, m.r, m.carrier_final, m.fee_final)
  returning id into v_dec;

  insert into public.dispute_allocations (decision_id, party_kind, company_id, amount, percentage)
  values (v_dec, 'shipper',  v_c.shipper_company_id, v_s,             round(v_s * 100 / v_d, 4)),
         (v_dec, 'carrier',  v_c.carrier_company_id, m.carrier_delta, round(m.carrier_delta * 100 / v_d, 4)),
         (v_dec, 'platform', null,                   m.platform_delta, round(m.platform_delta * 100 / v_d, 4));

  -- ESTADO DA LIQUIDACAO, derivado dos fatos do pagamento
  if v_s = 0 then
    v_state := 'not_required';
  elsif v_i.id is not null and v_i.internal_status in ('released_confirmed'::public.payment_internal_status,
                                                       'settled'::public.payment_internal_status) then
    -- DINHEIRO JA REPASSADO: obrigacoes explicitas, nunca "dinheiro voltou"
    if m.carrier_recovery > 0 then
      insert into public.payment_recoveries (
        intent_id, dispute_decision_id, case_id, debtor_kind, debtor_company_id, creditor_company_id,
        currency_code, expected_amount, registered_by)
      values (v_i.id, v_dec, p_case_id, 'carrier', v_c.carrier_company_id, v_c.shipper_company_id,
              v_i.currency_code, m.carrier_recovery, v_actor)
      returning id into v_rec;
      perform public.dispute_event_append(
        p_case_id, 'recovery_registered', 'decided'::public.dispute_status, v_dec, null, null,
        v_actor, 'admin', format('Obrigacao de recuperacao registrada: transportadora deve R$ %s ao embarcador.', m.carrier_recovery),
        'decide_dispute_case', p_request_id, v_fp, null, null, v_rec);
    end if;
    if m.platform_recovery > 0 then
      insert into public.payment_recoveries (
        intent_id, dispute_decision_id, case_id, debtor_kind, debtor_company_id, creditor_company_id,
        currency_code, expected_amount, registered_by)
      values (v_i.id, v_dec, p_case_id, 'platform', null, v_c.shipper_company_id,
              v_i.currency_code, m.platform_recovery, v_actor)
      returning id into v_rec;
      perform public.dispute_event_append(
        p_case_id, 'recovery_registered', 'decided'::public.dispute_status, v_dec, null, null,
        v_actor, 'admin', format('Obrigacao de recuperacao registrada: SteelGo deve R$ %s ao embarcador (taxa reduzida).', m.platform_recovery),
        'decide_dispute_case', p_request_id, v_fp, null, null, v_rec);
    end if;
    perform public.payment_event_append(
      v_i.id, 'recovery_registered', v_i.internal_status, null, null, v_s, v_i.currency_code,
      'admin', v_actor, 'admin', null, null, null, null,
      format('Decisao %s do caso %s: obrigacoes de recuperacao registradas (transportadora %s; SteelGo %s). '
             'Nenhum valor voltou por este registro.', v_dec, v_case.case_number, m.carrier_recovery, m.platform_recovery),
      'decide_dispute_case', p_request_id, v_fp);
    v_state := 'recovery_open';
  elsif v_i.id is not null and v_i.funding_confirmed_at is not null
        and v_i.internal_status in ('funding_confirmed'::public.payment_internal_status,
                                    'release_requested'::public.payment_internal_status,
                                    'failed'::public.payment_internal_status) then
    v_state := 'settlement_pending';
  else
    -- SEM CUSTODIA. R = 0: nada a mover. R > 0: aporte do valor R.
    if m.r = 0 then
      v_state := 'not_required';
    else
      if v_i.id is null then
        v_i := public.ensure_payment_intent(v_c.id, null, 'decide_dispute_case', p_request_id, v_fp);
        select * into v_i from public.payment_intents pi where pi.id = v_i.id for update;
      end if;
      if v_i.internal_status not in ('pending_provider'::public.payment_internal_status,
                                     'awaiting_funding'::public.payment_internal_status,
                                     'failed'::public.payment_internal_status,
                                     'cancelled'::public.payment_internal_status) then
        raise exception using errcode = '22023',
          message = format('decide_dispute_case: pagamento em %s sem aporte confirmado; estado '
                           'incoerente, decisao nao registrada', v_i.internal_status);
      end if;
      -- um aporte de G ja solicitado e cancelado: o aporte devido passa a ser R
      select * into v_fund_tx from public.payment_transactions t
       where t.intent_id = v_i.id and t.kind = 'funding'::public.payment_transaction_kind
         and t.status in ('requested'::public.payment_transaction_status,
                          'pending_provider'::public.payment_transaction_status)
       order by t.requested_at desc limit 1 for update;
      if v_fund_tx.id is not null then
        -- status 'cancelled' nao admite failure_code (CHECK failure_only_when_failed):
        -- o motivo fica em external_status
        update public.payment_transactions t
           set status = 'cancelled',
               external_status = format('funding_cancelled_by_decision: aporte de %s substituido pelo aporte da decisao (%s)', t.amount, m.r)
         where t.id = v_fund_tx.id;
      end if;
      update public.payment_intents pi
         set settlement_decision_id = v_dec,
             settlement_refund_amount = v_s,
             settlement_release_amount = m.r,
             settlement_funding_amount = m.r
       where pi.id = v_i.id;
      perform public.payment_event_append(
        v_i.id, 'funding_cancelled_by_decision', 'pending_provider'::public.payment_internal_status,
        v_fund_tx.id, null, m.r, v_i.currency_code, 'admin', v_actor, 'admin', null, null, null, null,
        format('Decisao %s do caso %s: aporte devido passa a ser R$ %s (parcela do embarcador R$ %s '
               'nunca saiu dele).%s', v_dec, v_case.case_number, m.r, v_s,
               case when v_fund_tx.id is null then '' else format(' Aporte anterior %s cancelado.', v_fund_tx.id) end),
        'decide_dispute_case', p_request_id, v_fp);
      v_state := 'pending_funding';
      v_due := now() + interval '7 days';
    end if;
  end if;

  perform public.dispute_event_append(
    p_case_id,
    case when p_supersedes_decision_id is null then 'decided' else 'decision_superseded' end,
    'decided'::public.dispute_status, v_dec, null, null,
    v_actor, 'admin', p_rationale, 'decide_dispute_case', p_request_id, v_fp);

  -- ORDEM IMPORTA: o CHECK dispute_cases_settlement_needs_decision exige status
  -- 'decided' antes de qualquer settlement_state diferente de 'undecided'.
  update public.dispute_cases d
     set settlement_state = v_state, settlement_due_at = v_due, updated_at = now()
   where d.id = p_case_id;

  perform public.notify_dispute_case(
    p_case_id, 'dispute_decided', format('Decisao no caso %s', v_case.case_number),
    format('A Equipe SteelGo decidiu o caso: %s. Devolucao ao embarcador R$ %s de R$ %s em disputa.%s',
           p_outcome, v_s, v_d,
           case v_state when 'pending_funding' then ' O embarcador precisa aportar R$ ' || m.r || ' para cumprir a decisao.'
                        when 'recovery_open' then ' Ha obrigacoes de recuperacao pendentes.'
                        else '' end),
    v_actor, false);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('decide_dispute_case', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('decisao %s: %s, D=%s S=%s C=%s P=%s (G=%s F=%s); liquidacao %s%s',
                 v_dec, p_outcome, v_d, v_s, m.carrier_delta, m.platform_delta, v_g, v_f, v_state,
                 case when p_supersedes_decision_id is null then '' else format('; corrige %s', p_supersedes_decision_id) end));

  return query select v_dec, p_case_id, 'decided'::public.dispute_status, false;
end;
$fn$;

-- =============================================================================
-- 9. ENCERRAMENTO
-- =============================================================================
create or replace function public.close_dispute_case(
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
begin
  if p_note is null or length(btrim(p_note)) < 20 then
    raise exception using errcode = '22023',
      message = 'close_dispute_case: nota de encerramento e obrigatoria e precisa de ao menos 20 caracteres';
  end if;
  v_fp := public.rpc_params_fingerprint(jsonb_build_object('case_id', p_case_id));
  v_log := public.rpc_idempotency_probe('close_dispute_case', p_request_id, v_actor, p_case_id, v_fp);
  if v_log.id is not null then
    select * into v_case from public.dispute_cases d where d.id = p_case_id;
    select * into v_c from public.contracts c where c.id = v_case.contract_id;
    return query select p_case_id, v_case.status, v_c.status, true;
    return;
  end if;

  -- ordem global: contrato -> intent -> caso
  select * into v_case from public.dispute_cases d where d.id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'close_dispute_case: caso inexistente';
  end if;
  select * into v_c from public.contracts c where c.id = v_case.contract_id for update;
  select * into v_i from public.payment_intents pi where pi.contract_id = v_c.id for update;
  select * into v_case from public.dispute_cases d where d.id = p_case_id for update;

  if v_case.status <> 'decided'::public.dispute_status then
    raise exception using errcode = '22023',
      message = format('close_dispute_case: caso em %s; so se encerra caso ja decidido', v_case.status);
  end if;
  if v_case.assigned_to is distinct from v_actor then
    raise exception using errcode = '42501',
      message = 'close_dispute_case: somente o administrador atribuido encerra o caso';
  end if;
  if v_case.settlement_state not in ('not_required', 'settled', 'recovery_closed') then
    raise exception using errcode = '22023',
      message = format('close_dispute_case: liquidacao em %s; o caso so encerra com liquidacao '
                       'concluida (not_required, settled ou recovery_closed)', v_case.settlement_state);
  end if;
  select * into v_dec from public.dispute_decisions d where d.case_id = p_case_id and d.is_current;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'close_dispute_case: caso decidido sem decisao vigente';
  end if;

  perform public.dispute_expire_open_requests(p_case_id, false, 'close_dispute_case', p_request_id, v_fp);

  if v_i.id is not null and v_i.release_blocked_by_dispute then
    update public.payment_intents pi set release_blocked_by_dispute = false where pi.id = v_i.id;
    perform public.payment_event_append(
      v_i.id, 'release_unblocked', v_i.internal_status, null, null, null, null,
      'internal', v_actor, 'admin', null, null, null, null,
      format('Caso %s encerrado (%s); liberacao volta a andar.', v_case.case_number, v_dec.outcome),
      'close_dispute_case', p_request_id, v_fp);
  end if;

  -- RETORNO EXATO ao status anterior
  perform public.contract_lifecycle_append(
    v_c.id, 'dispute_resolved'::public.contract_lifecycle_transition,
    v_case.previous_contract_status, v_c.escrow_status, null, null, v_i.id, p_case_id,
    v_dec.decided_amount, v_actor, 'admin',
    format('Caso %s encerrado: %s. %s', v_case.case_number, v_dec.outcome, p_note),
    'close_dispute_case', p_request_id, v_fp);

  perform public.dispute_event_append(
    p_case_id, 'closed', 'closed'::public.dispute_status, v_dec.id, null, null,
    v_actor, 'admin', p_note, 'close_dispute_case', p_request_id, v_fp);
  update public.dispute_cases d set closed_at = now(), closed_by = v_actor where d.id = p_case_id;

  if v_case.previous_contract_status = 'active'::public.contract_status then
    perform public.try_complete_contract(v_c.id, v_actor, 'admin', 'close_dispute_case', p_request_id, v_fp);
  end if;

  perform public.notify_dispute_case(
    p_case_id, 'dispute_closed', format('Caso %s encerrado', v_case.case_number),
    format('A Equipe SteelGo encerrou o caso (%s).%s', v_dec.outcome,
           case v_case.settlement_state when 'recovery_closed'
             then case when exists (select 1 from public.payment_recoveries r where r.case_id = p_case_id and r.status = 'written_off')
                       then ' Ha recuperacao BAIXADA sem devolucao.' else ' Recuperacoes confirmadas.' end
             else '' end),
    v_actor, false);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('close_dispute_case', p_request_id, v_actor, p_case_id, v_fp, 'accepted',
          format('caso %s encerrado com desfecho %s; contrato restaurado a %s',
                 v_case.case_number, v_dec.outcome, v_case.previous_contract_status));

  select * into v_c from public.contracts c where c.id = v_case.contract_id;
  return query select p_case_id, 'closed'::public.dispute_status, v_c.status, false;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.open_dispute_case(uuid, public.dispute_reason_code, text, numeric, text, uuid)',
    'public.add_dispute_claim(uuid, public.dispute_reason_code, text, numeric, uuid)',
    'public.add_dispute_evidence(uuid, text, text, text, text, uuid)',
    'public.add_dispute_evidence_for_claim(uuid, uuid, text, text, text, text, uuid)',
    'public.add_dispute_evidence_for_request(uuid, uuid, text, text, text, text, uuid)',
    'public.add_dispute_comment(uuid, text, boolean, uuid)',
    'public.assign_dispute_case(uuid, uuid, text, uuid)',
    'public.request_dispute_evidence(uuid, text, text, timestamptz, uuid)',
    'public.waive_dispute_evidence_request(uuid, uuid, text, uuid)',
    'public.withdraw_dispute_case(uuid, text, uuid)',
    'public.decide_dispute_case(uuid, public.dispute_decision_outcome, numeric, numeric, numeric, numeric, text, uuid, uuid)',
    'public.close_dispute_case(uuid, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

commit;
