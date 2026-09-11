-- =============================================================================
-- CORRETIVA REV8.1 : decide_dispute_case  -  p_supersedes_decision_id opcional
-- =============================================================================
-- POR QUE ESTA MIGRATION EXISTE
--
-- Em 20260903100750 a funcao foi criada com p_supersedes_decision_id uuid como
-- 8o parametro, SEM default, seguido de p_request_id uuid como 9o. O corpo ja
-- tratava NULL como "primeira decisao" (nao ha decisao a corrigir), mas o
-- contrato SQL nao declarava o parametro como opcional. O gerador de tipos do
-- Supabase tipa entao o argumento como `string` obrigatorio, e o cliente em
-- src/routes/admin.disputes.tsx nao consegue expressar "sem decisao anterior"
-- sem cast - erro TS2322 em `p_supersedes_decision_id: current?.id ?? null`.
--
-- POR QUE NAO BASTA `create or replace ... default null` NA POSICAO ATUAL
--
-- Fato verificado por execucao no banco local (transacao com ROLLBACK):
--     ERROR:  input parameters after one with a default value must also have defaults
-- Dar default a p_request_id enfraqueceria a chave de idempotencia. E
-- `create or replace` com os mesmos tipos e nomes em outra ordem falha com
-- "cannot change name of input parameter". Logo: DROP e CREATE.
--
-- O QUE MUDA E O QUE NAO MUDA
--   * p_request_id sobe para 8o e CONTINUA obrigatorio;
--   * p_supersedes_decision_id vai para 9o (ultimo) com DEFAULT NULL;
--   * tipos, retorno, corpo, SECURITY DEFINER, search_path = '' e regras de
--     autorizacao (require_steelgo_admin) permanecem IDENTICOS ao de 100750;
--   * a lista de tipos (uuid, dispute_decision_outcome, numeric x4, text,
--     uuid, uuid) e a mesma; o DROP remove o unico overload existente e o
--     CREATE cria o unico - nao ha ambiguidade para o PostgREST.
--
-- CHAMADORES, apurados antes do DROP (2026-09-10):
--   * PostgREST, src/routes/admin.disputes.tsx  - argumentos NOMEADOS (JSON);
--     a ordem nao importa. Omitir a chave ativa o default;
--   * nenhuma funcao, trigger, view ou policy do banco chama esta funcao
--     (pg_depend e varredura de pg_proc/pg_views/pg_policy vazios);
--   * a suite externa l2a_tests.sql tinha 7 chamadas POSICIONAIS. Como os
--     parametros 8 e 9 sao ambos uuid, uma chamada posicional continuaria
--     compilando trocando silenciosamente request_id e supersedes. Essas
--     chamadas foram convertidas para notacao nomeada (p_nome => valor) ANTES
--     desta migration ser homologada.
--
-- sem CASCADE, de proposito: se algum dia algo depender da funcao, esta
-- migration deve FALHAR e nao derrubar o dependente em silencio.
-- =============================================================================

drop function public.decide_dispute_case(
  uuid, public.dispute_decision_outcome, numeric, numeric, numeric, numeric,
  text, uuid, uuid);

create function public.decide_dispute_case(
  p_case_id        uuid,
  p_outcome        public.dispute_decision_outcome,
  p_decided_amount numeric,
  p_carrier_amount numeric,
  p_shipper_amount numeric,
  p_platform_amount numeric,
  p_rationale      text,
  p_request_id     uuid,
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

-- Privilegio primeiro, como em 100750: revoga de PUBLIC, anon e authenticated
-- (o default privilege do schema teria concedido a anon) e concede
-- EXPLICITAMENTE a authenticated e service_role, sem depender de default
-- privileges. A autorizacao real continua sendo require_steelgo_admin, dentro
-- da funcao.
revoke execute on function public.decide_dispute_case(
  uuid, public.dispute_decision_outcome, numeric, numeric, numeric, numeric,
  text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.decide_dispute_case(
  uuid, public.dispute_decision_outcome, numeric, numeric, numeric, numeric,
  text, uuid, uuid) to authenticated, service_role;
