-- =============================================================================
-- MODULO 2 (4/9) : ESQUEMA DE DISPUTAS v2
-- =============================================================================
-- Aditiva sobre 20260903100451. Nada das 58 migrations homologadas e editado.
--
-- CONTEUDO
--   1. rpc_idempotency_probe: helper UNICO, mesma assinatura, com a distincao
--      request_id de outro ator -> 42501 (privilegio) e conflito de parametros
--      do mesmo ator -> 22023 (argumento). Nenhum "probe2".
--   2. dispute_settlement_math: a formula da liquidacao, IMMUTABLE, em um so
--      lugar, com todos os invariantes verificados.
--   3. dispute_cases: previous_contract_status (backfill FAIL-CLOSED pelo
--      evento de lifecycle), settlement_state, settlement_due_at, UMA disputa
--      por contrato (permanente), motorista fora, imutabilidade estrutural.
--   4. dispute_parties: requerido registrado desde a abertura; uma empresa por
--      lado; company_id obrigatorio para claimant/respondent.
--   5. dispute_claims / dispute_evidence: vinculo claim<->evidencia do MESMO
--      caso por FK composta; fatos do artefato (size/etag/mime); vinculo com o
--      pedido de evidencia atendido (um por pedido).
--   6. dispute_evidence_requests: pedidos de evidencia com ciclo de vida
--      governado (open -> fulfilled | waived | expired), campos estruturais
--      imutaveis.
--   7. dispute_decisions: snapshot de gross_amount e original_platform_fee,
--      valores derivados gravados, CHECKs LITERAIS e trigger DIFERIDO que
--      confere decided_amount = disputed_amount e o snapshot contra a fonte.
--   8. dispute_events: colunas de citacao (pedido, transacao, recuperacao),
--      tipos novos, unicidade por (request_id, case_id, tipo, pedido).
--
-- ESCALA MONETARIA (estrategia final):
--   numeric(16,2) ARREDONDA silenciosamente antes de qualquer CHECK - um CHECK
--   scale(x) <= 2 sobre numeric(16,2) e inutil. Por isso:
--   * colunas NOVAS que precisam recusar 3 casas usam numeric SEM typmod +
--     CHECK scale(x) <= 2 + CHECK abs(x) < 1e14;
--   * parametros que alimentam colunas numeric(16,2) EXISTENTES sao validados
--     nas RPCs com scale(p) <= 2 -> 22023, antes de qualquer escrita.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. helper unico de idempotencia (mesma assinatura e retorno)
-- -----------------------------------------------------------------------------
create or replace function public.rpc_idempotency_probe(
  p_rpc_name         text,
  p_request_id       uuid,
  p_actor_id         uuid,
  p_target_id        uuid,
  p_fingerprint      text,
  p_target_is_output boolean default false
)
returns public.rpc_call_log
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v     public.rpc_call_log%rowtype;
  v_nil public.rpc_call_log%rowtype;
begin
  if p_request_id is null then
    raise exception using errcode = '22004',
      message = p_rpc_name || ': request_id e obrigatorio';
  end if;

  -- Serializacao do espaco de request_id (ver 20260903100100): o lock
  -- transacional fecha a janela entre "nao encontrado" e o insert 'accepted'.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('steelgo.rpc_idempotency:' || p_request_id::pg_catalog.text, 0));

  select * into v
    from public.rpc_call_log l
   where l.request_id = p_request_id
     and l.outcome = 'accepted';

  if not found then
    return v_nil;
  end if;

  -- SEMANTICA DOS ERROS (2026-09-16):
  --   * request_id de OUTRO ator -> 42501: e privilegio, nao argumento;
  --   * mesmo ator reapresentando o request_id com outra operacao, outro alvo
  --     ou outros parametros -> 22023: conflito de argumento;
  --   * mesmo ator, mesma impressao -> replay normal.
  if v.actor_id <> p_actor_id then
    raise exception using errcode = '42501',
      message = format('%s: request_id pertence a outro ator', p_rpc_name);
  end if;
  if v.rpc_name <> p_rpc_name then
    raise exception using errcode = '22023',
      message = format('%s: request_id ja consumido pela operacao %s',
                       p_rpc_name, v.rpc_name);
  end if;
  if not p_target_is_output and v.target_id is distinct from p_target_id then
    raise exception using errcode = '22023',
      message = format('%s: request_id ja consumido para outro alvo', p_rpc_name);
  end if;
  if v.params_fingerprint <> p_fingerprint then
    raise exception using errcode = '22023',
      message = format('%s: request_id reapresentado com parametros diferentes',
                       p_rpc_name);
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values
    (p_rpc_name, p_request_id, p_actor_id, v.target_id, p_fingerprint, 'replayed');

  return v;
end;
$fn$;

-- helper interno: nem service_role executa diretamente (politica do modulo)
revoke all on function public.rpc_idempotency_probe(text, uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. a formula da liquidacao, em um so lugar
-- -----------------------------------------------------------------------------
-- G bruto, F taxa original, D valor em disputa, S devolvido ao embarcador.
--   U = G - D            parte nao disputada
--   R = G - S            valor liberado
--   F_final = round(F * R / G, 2)   taxa proporcional ao que NAO volta ao embarcador
--   C_final = R - F_final
--   F_U = round(F * U / G, 2);  C_U = U - F_U
--   P = F_final - F_U;  C = C_final - C_U
--   carrier_recovery  = (G - F) - C_final
--   platform_recovery = F - F_final
-- Invariantes (verificados aqui, e de novo por CHECK/trigger nas tabelas):
--   S + C + P = D;  S + C_final + F_final = G;  C >= 0;  P >= 0;
--   carrier_recovery + platform_recovery = S.
create function public.dispute_settlement_math(
  p_gross    numeric,
  p_fee      numeric,
  p_disputed numeric,
  p_shipper  numeric
)
returns table (
  u                 numeric,
  r                 numeric,
  fee_final         numeric,
  carrier_final     numeric,
  fee_u             numeric,
  carrier_u         numeric,
  platform_delta    numeric,
  carrier_delta     numeric,
  carrier_recovery  numeric,
  platform_recovery numeric
)
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_u  numeric; v_r  numeric; v_ff numeric; v_cf numeric; v_fu numeric; v_cu numeric;
  v_pd numeric; v_cd numeric; v_cr numeric; v_pr numeric;
begin
  if p_gross is null or p_gross <= 0 then
    raise exception using errcode = '22023',
      message = 'liquidacao: valor bruto (G) deve ser positivo';
  end if;
  if p_fee is null or p_fee < 0 or p_fee > p_gross then
    raise exception using errcode = '22023',
      message = 'liquidacao: taxa (F) deve satisfazer 0 <= F <= G';
  end if;
  if p_disputed is null or p_disputed <= 0 or p_disputed > p_gross then
    raise exception using errcode = '22023',
      message = 'liquidacao: valor em disputa (D) deve satisfazer 0 < D <= G';
  end if;
  if p_shipper is null or p_shipper < 0 or p_shipper > p_disputed then
    raise exception using errcode = '22023',
      message = 'liquidacao: devolucao ao embarcador (S) deve satisfazer 0 <= S <= D';
  end if;
  if scale(p_gross) > 2 or scale(p_fee) > 2 or scale(p_disputed) > 2 or scale(p_shipper) > 2 then
    raise exception using errcode = '22023',
      message = 'liquidacao: valores monetarios com mais de duas casas decimais';
  end if;

  v_u  := p_gross - p_disputed;
  v_r  := p_gross - p_shipper;
  v_ff := round(p_fee * v_r / p_gross, 2);
  v_cf := v_r - v_ff;
  v_fu := round(p_fee * v_u / p_gross, 2);
  v_cu := v_u - v_fu;
  v_pd := v_ff - v_fu;
  v_cd := v_cf - v_cu;
  v_cr := (p_gross - p_fee) - v_cf;
  v_pr := p_fee - v_ff;

  if p_shipper + v_cd + v_pd <> p_disputed
     or p_shipper + v_cf + v_ff <> p_gross
     or v_cd < 0 or v_pd < 0
     or v_cr + v_pr <> p_shipper
     or v_cr < 0 or v_pr < 0 then
    raise exception using errcode = '22023',
      message = format('liquidacao: invariantes violados para G=%s F=%s D=%s S=%s',
                       p_gross, p_fee, p_disputed, p_shipper);
  end if;

  return query select v_u, v_r, v_ff, v_cf, v_fu, v_cu, v_pd, v_cd, v_cr, v_pr;
end;
$fn$;

revoke all on function public.dispute_settlement_math(numeric, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. dispute_cases
-- -----------------------------------------------------------------------------
alter table public.dispute_cases
  add column previous_contract_status public.contract_status null,
  add column settlement_state         text        not null default 'undecided',
  add column settlement_due_at        timestamptz null;

-- BACKFILL FAIL-CLOSED: o estado anterior vem do evento 'disputed' do ciclo do
-- contrato que cita o caso. Sem evento, nao ha prova - e a migration aborta com
-- diagnostico, em vez de afirmar 'active' sem fundamento.
update public.dispute_cases d
   set previous_contract_status = e.previous_status
  from (
    select distinct on (l.dispute_case_id) l.dispute_case_id, l.previous_status
      from public.contract_lifecycle_events l
     where l.transition = 'disputed'::public.contract_lifecycle_transition
       and l.dispute_case_id is not null
     order by l.dispute_case_id, l.created_at asc, l.id asc
  ) e
 where e.dispute_case_id = d.id
   and d.previous_contract_status is null;

do $$
declare v_list text;
begin
  select string_agg(d.case_number, ', ' order by d.case_number) into v_list
    from public.dispute_cases d where d.previous_contract_status is null;
  if v_list is not null then
    raise exception 'dispute_cases: casos sem evento de lifecycle ''disputed'' que prove o '
                    'status anterior: %. Migration abortada; decisao humana necessaria.', v_list;
  end if;
end $$;

alter table public.dispute_cases
  alter column previous_contract_status set not null;

-- motorista fora nesta fase: quem abre e sempre claimant (empresa)
do $$
declare v_list text;
begin
  select string_agg(d.case_number, ', ') into v_list
    from public.dispute_cases d where d.opened_by_role <> 'claimant'::public.dispute_party_role;
  if v_list is not null then
    raise exception 'dispute_cases: casos abertos por papel diferente de claimant: %. '
                    'Migration abortada.', v_list;
  end if;
end $$;
alter table public.dispute_cases drop constraint dispute_cases_opener_is_party;
alter table public.dispute_cases
  add constraint dispute_cases_opener_is_claimant
  check (opened_by_role = 'claimant'::public.dispute_party_role);

-- UMA DISPUTA POR CONTRATO, PERMANENTE (regra de produto). Dados existentes com
-- mais de um caso por contrato abortam a migration com diagnostico.
do $$
declare v_list text;
begin
  select string_agg(contract_id::text, ', ') into v_list
    from (select contract_id from public.dispute_cases group by contract_id having count(*) > 1) x;
  if v_list is not null then
    raise exception 'dispute_cases: contratos com mais de um caso: %. Migration abortada.', v_list;
  end if;
end $$;
drop index public.dispute_cases_one_open_per_contract;
alter table public.dispute_cases
  add constraint dispute_cases_contract_unique unique (contract_id);

alter table public.dispute_cases
  add constraint dispute_cases_settlement_state_valid check (settlement_state in (
    'undecided', 'not_required', 'pending_funding', 'settlement_pending', 'requested',
    'settled', 'recovery_open', 'recovery_closed', 'not_applicable'));
alter table public.dispute_cases
  add constraint dispute_cases_settlement_due_coherent
  check ((settlement_due_at is not null) = (settlement_state = 'pending_funding'));
alter table public.dispute_cases
  add constraint dispute_cases_not_applicable_only_closed
  check (settlement_state <> 'not_applicable' or status = 'closed'::public.dispute_status);
alter table public.dispute_cases
  add constraint dispute_cases_settlement_needs_decision
  check (settlement_state = 'undecided'
         or status in ('decided'::public.dispute_status, 'closed'::public.dispute_status));
alter table public.dispute_cases
  add constraint dispute_cases_amount_scale check (scale(disputed_amount) <= 2);

-- imutabilidade estrutural do caso: o que define a disputa nao muda
create function public.dispute_cases_enforce_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'public.dispute_cases: caso nao e apagado.';
  end if;
  if NEW.contract_id is distinct from OLD.contract_id
     or NEW.freight_id is distinct from OLD.freight_id
     or NEW.opened_by is distinct from OLD.opened_by
     or NEW.opened_by_role is distinct from OLD.opened_by_role
     or NEW.opened_at is distinct from OLD.opened_at
     or NEW.reason_code is distinct from OLD.reason_code
     or NEW.description is distinct from OLD.description
     or NEW.disputed_amount is distinct from OLD.disputed_amount
     or NEW.currency_code is distinct from OLD.currency_code
     or NEW.case_number is distinct from OLD.case_number
     or NEW.previous_contract_status is distinct from OLD.previous_contract_status then
    raise exception using errcode = '42501',
      message = 'public.dispute_cases: campos estruturais do caso sao imutaveis.';
  end if;
  return NEW;
end;
$fn$;
create trigger dispute_cases_enforce_immutable_trg
  before update or delete on public.dispute_cases
  for each row execute function public.dispute_cases_enforce_immutable();

-- valor em disputa nunca excede o contrato (relacao entre tabelas)
create function public.dispute_cases_amount_within_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_total numeric;
begin
  select c.total_amount_brl into v_total from public.contracts c where c.id = NEW.contract_id;
  if v_total is null or NEW.disputed_amount > v_total then
    raise exception using errcode = '23514',
      message = format('public.dispute_cases: valor em disputa (%s) excede o valor do '
                       'contrato (%s)', NEW.disputed_amount, coalesce(v_total::text, 'nulo'));
  end if;
  return NEW;
end;
$fn$;
create trigger dispute_cases_amount_within_contract_trg
  before insert on public.dispute_cases
  for each row execute function public.dispute_cases_amount_within_contract();

-- -----------------------------------------------------------------------------
-- 4. dispute_parties
-- -----------------------------------------------------------------------------
-- Linhas antigas de respondent nasciam sem company_id (add_dispute_claim v1).
-- Backfill pela propriedade da empresa no contrato; o que nao se prova, aborta.
update public.dispute_parties p
   set company_id = case
         when co_s.owner_id = p.user_id then c.shipper_company_id
         when co_c.owner_id = p.user_id then c.carrier_company_id
         else null end
  from public.dispute_cases d
  join public.contracts c on c.id = d.contract_id
  join public.companies co_s on co_s.id = c.shipper_company_id
  join public.companies co_c on co_c.id = c.carrier_company_id
 where d.id = p.case_id
   and p.company_id is null
   and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role);

do $$
declare v_n int;
begin
  select count(*) into v_n from public.dispute_parties p
   where p.company_id is null
     and p.role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role);
  if v_n > 0 then
    raise exception 'dispute_parties: % linha(s) claimant/respondent sem empresa comprovavel. '
                    'Migration abortada.', v_n;
  end if;
  select count(*) into v_n from (
    select case_id, role from public.dispute_parties
     where role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)
     group by case_id, role having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'dispute_parties: % caso(s) com mais de uma parte no mesmo lado. '
                    'Migration abortada.', v_n;
  end if;
end $$;

alter table public.dispute_parties
  add constraint dispute_parties_company_required
  check (role not in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)
         or company_id is not null);
create unique index dispute_parties_one_per_side
  on public.dispute_parties (case_id, role)
  where role in ('claimant', 'respondent');

-- -----------------------------------------------------------------------------
-- 5. dispute_claims / dispute_evidence
-- -----------------------------------------------------------------------------
alter table public.dispute_claims
  add constraint dispute_claims_id_case_unique unique (id, case_id);
alter table public.dispute_claims
  add constraint dispute_claims_amount_scale
  check (claimed_amount is null or scale(claimed_amount) <= 2);

alter table public.dispute_evidence
  add constraint dispute_evidence_id_case_unique unique (id, case_id);
-- evidencia vinculada a alegacao do MESMO caso: FK composta, estrutural
alter table public.dispute_evidence drop constraint dispute_evidence_claim_fk;
alter table public.dispute_evidence
  add constraint dispute_evidence_claim_same_case_fk
  foreign key (claim_id, case_id) references public.dispute_claims (id, case_id) on delete restrict;

alter table public.dispute_evidence
  add column artifact_size_bytes bigint null,
  add column artifact_etag       text   null,
  add column artifact_mime       text   null,
  add column evidence_request_id uuid   null;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.dispute_evidence e
   where e.artifact_ref is not null
     and (e.artifact_size_bytes is null or e.artifact_etag is null or e.artifact_mime is null);
  if v_n > 0 then
    raise exception 'dispute_evidence: % evidencia(s) com artifact_ref sem fatos do Storage. '
                    'Migration abortada; os fatos nao podem ser inventados.', v_n;
  end if;
end $$;

alter table public.dispute_evidence
  add constraint dispute_evidence_artifact_facts check (
    case when artifact_ref is null
         then artifact_size_bytes is null and artifact_etag is null and artifact_mime is null
         else artifact_size_bytes is not null
              and artifact_size_bytes >= 1 and artifact_size_bytes <= 10485760
              and artifact_etag is not null and length(btrim(artifact_etag)) > 0
              and artifact_mime in ('application/pdf', 'image/jpeg', 'image/png')
    end);
create unique index dispute_evidence_one_per_request
  on public.dispute_evidence (evidence_request_id)
  where evidence_request_id is not null;

comment on column public.dispute_evidence.content_hash is
  'SHA-256 DECLARADO por quem apresentou (calculado no navegador). Nao e '
  'verificacao independente: a outra parte e o administrador podem recalcular '
  'ao baixar o arquivo.';
comment on column public.dispute_evidence.artifact_etag is
  'Identificador OPACO registrado pelo Storage. Nao e hash nem prova de conteudo.';

-- -----------------------------------------------------------------------------
-- 6. dispute_evidence_requests  -  ciclo de vida governado
-- -----------------------------------------------------------------------------
create table public.dispute_evidence_requests (
  id             uuid        primary key default gen_random_uuid(),
  case_id        uuid        not null,
  requested_by   uuid        not null,
  target_role    public.dispute_party_role not null,
  description    text        not null,
  due_at         timestamptz not null,
  created_at     timestamptz not null default now(),
  rpc_request_id uuid        not null,
  status         text        not null default 'open',
  fulfilled_by   uuid        null,
  fulfilled_at   timestamptz null,
  evidence_id    uuid        null,
  waived_by      uuid        null,
  waived_at      timestamptz null,
  waive_note     text        null,

  constraint dispute_evidence_requests_target_valid
    check (target_role in ('claimant'::public.dispute_party_role, 'respondent'::public.dispute_party_role)),
  constraint dispute_evidence_requests_description_len check (length(btrim(description)) >= 20),
  constraint dispute_evidence_requests_due_future check (due_at > created_at),
  constraint dispute_evidence_requests_status_valid
    check (status in ('open', 'fulfilled', 'waived', 'expired')),
  constraint dispute_evidence_requests_status_coherent check (
    case status
      when 'open'      then fulfilled_by is null and fulfilled_at is null and evidence_id is null
                            and waived_by is null and waived_at is null and waive_note is null
      when 'expired'   then fulfilled_by is null and fulfilled_at is null and evidence_id is null
                            and waived_by is null and waived_at is null and waive_note is null
      when 'fulfilled' then fulfilled_by is not null and fulfilled_at is not null and evidence_id is not null
                            and waived_by is null and waived_at is null and waive_note is null
      when 'waived'    then waived_by is not null and waived_at is not null
                            and waive_note is not null and length(btrim(waive_note)) >= 20
                            and fulfilled_by is null and fulfilled_at is null and evidence_id is null
      else false end),
  constraint dispute_evidence_requests_id_case_unique unique (id, case_id)
);

alter table public.dispute_evidence_requests
  add constraint dispute_evidence_requests_case_fk
  foreign key (case_id) references public.dispute_cases(id) on delete restrict;
alter table public.dispute_evidence_requests
  add constraint dispute_evidence_requests_requested_by_fk
  foreign key (requested_by) references auth.users(id) on delete restrict;
alter table public.dispute_evidence_requests
  add constraint dispute_evidence_requests_fulfilled_by_fk
  foreign key (fulfilled_by) references auth.users(id) on delete restrict;
alter table public.dispute_evidence_requests
  add constraint dispute_evidence_requests_waived_by_fk
  foreign key (waived_by) references auth.users(id) on delete restrict;
alter table public.dispute_evidence_requests
  add constraint dispute_evidence_requests_evidence_same_case_fk
  foreign key (evidence_id, case_id) references public.dispute_evidence (id, case_id) on delete restrict;

-- um pedido ABERTO por lado
create unique index dispute_evidence_requests_one_open_per_side
  on public.dispute_evidence_requests (case_id, target_role) where status = 'open';
create index dispute_evidence_requests_case_idx
  on public.dispute_evidence_requests (case_id, created_at);

-- a evidencia cita o pedido que atende (mesmo caso)
alter table public.dispute_evidence
  add constraint dispute_evidence_request_same_case_fk
  foreign key (evidence_request_id, case_id)
  references public.dispute_evidence_requests (id, case_id) on delete restrict;

-- Atualizacao GOVERNADA: so open -> fulfilled | waived | expired, cada transicao
-- preenchendo exclusivamente os seus campos; estruturais imutaveis; terminais
-- imutaveis; DELETE proibido.
create function public.dispute_evidence_requests_governed_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'public.dispute_evidence_requests: pedido nao e apagado.';
  end if;
  if NEW.case_id is distinct from OLD.case_id
     or NEW.requested_by is distinct from OLD.requested_by
     or NEW.target_role is distinct from OLD.target_role
     or NEW.description is distinct from OLD.description
     or NEW.due_at is distinct from OLD.due_at
     or NEW.created_at is distinct from OLD.created_at
     or NEW.rpc_request_id is distinct from OLD.rpc_request_id then
    raise exception using errcode = '42501',
      message = 'public.dispute_evidence_requests: campos estruturais sao imutaveis.';
  end if;
  if OLD.status <> 'open' then
    raise exception using errcode = '42501',
      message = format('public.dispute_evidence_requests: pedido em %s e imutavel.', OLD.status);
  end if;
  if NEW.status not in ('fulfilled', 'waived', 'expired') then
    raise exception using errcode = '42501',
      message = 'public.dispute_evidence_requests: transicao invalida a partir de open.';
  end if;
  -- os CHECKs de coerencia garantem que so os campos da transicao estao
  -- preenchidos; aqui garante-se que nenhum campo da OUTRA transicao mudou
  if NEW.status = 'fulfilled' and (NEW.waived_by is not null or NEW.waived_at is not null or NEW.waive_note is not null) then
    raise exception using errcode = '42501',
      message = 'public.dispute_evidence_requests: atendimento nao preenche campos de dispensa.';
  end if;
  if NEW.status = 'waived' and (NEW.fulfilled_by is not null or NEW.fulfilled_at is not null or NEW.evidence_id is not null) then
    raise exception using errcode = '42501',
      message = 'public.dispute_evidence_requests: dispensa nao preenche campos de atendimento.';
  end if;
  return NEW;
end;
$fn$;
create trigger dispute_evidence_requests_governed_update_trg
  before update or delete on public.dispute_evidence_requests
  for each row execute function public.dispute_evidence_requests_governed_update();

alter table public.dispute_evidence_requests enable row level security;
revoke all on public.dispute_evidence_requests from public, anon, authenticated, service_role;
grant select on public.dispute_evidence_requests to service_role;

comment on table public.dispute_evidence_requests is
  'Pedidos de evidencia feitos pelo administrador atribuido a uma parte. Ciclo '
  'governado open -> fulfilled | waived | expired; campos estruturais imutaveis. '
  'Um pedido aberto por lado; uma evidencia por pedido.';

-- -----------------------------------------------------------------------------
-- 7. dispute_decisions  -  snapshot e valores derivados
-- -----------------------------------------------------------------------------
alter table public.dispute_decisions
  add column gross_amount          numeric null,
  add column original_platform_fee numeric null,
  add column shipper_amount        numeric null,
  add column carrier_delta         numeric null,
  add column platform_delta        numeric null,
  add column release_amount        numeric null,
  add column carrier_final         numeric null,
  add column platform_fee_final    numeric null;

-- BACKFILL FAIL-CLOSED de decisoes existentes: S/C/P vem das alocacoes, G e F
-- do intent (ou do contrato); a matematica e recomputada e tem de bater.
do $$
declare
  r      record;
  m      record;
  v_g    numeric; v_f numeric; v_s numeric; v_c numeric; v_p numeric;
begin
  for r in select d.*, dc.disputed_amount, dc.contract_id, dc.case_number
             from public.dispute_decisions d join public.dispute_cases dc on dc.id = d.case_id loop
    select coalesce(pi.gross_amount, c.total_amount_brl),
           coalesce(pi.platform_fee_amount, c.platform_fee_brl)
      into v_g, v_f
      from public.contracts c
      left join public.payment_intents pi on pi.contract_id = c.id
     where c.id = r.contract_id;
    select coalesce(sum(a.amount) filter (where a.party_kind = 'shipper'), 0),
           coalesce(sum(a.amount) filter (where a.party_kind = 'carrier'), 0),
           coalesce(sum(a.amount) filter (where a.party_kind = 'platform'), 0)
      into v_s, v_c, v_p
      from public.dispute_allocations a where a.decision_id = r.id;
    if r.decided_amount <> r.disputed_amount then
      raise exception 'dispute_decisions: decisao % do caso % com decided_amount (%) '
                      'diferente do valor em disputa (%). Migration abortada.',
                      r.id, r.case_number, r.decided_amount, r.disputed_amount;
    end if;
    select * into m from public.dispute_settlement_math(v_g, v_f, r.disputed_amount, v_s);
    if v_c <> m.carrier_delta or v_p <> m.platform_delta then
      raise exception 'dispute_decisions: decisao % do caso % nao reproduz a formula '
                      '(carrier %/% platform %/%). Migration abortada.',
                      r.id, r.case_number, v_c, m.carrier_delta, v_p, m.platform_delta;
    end if;
    update public.dispute_decisions d
       set gross_amount = v_g, original_platform_fee = v_f, shipper_amount = v_s,
           carrier_delta = m.carrier_delta, platform_delta = m.platform_delta,
           release_amount = m.r, carrier_final = m.carrier_final,
           platform_fee_final = m.fee_final
     where d.id = r.id;
  end loop;
end $$;

alter table public.dispute_decisions
  alter column gross_amount          set not null,
  alter column original_platform_fee set not null,
  alter column shipper_amount        set not null,
  alter column carrier_delta         set not null,
  alter column platform_delta        set not null,
  alter column release_amount        set not null,
  alter column carrier_final         set not null,
  alter column platform_fee_final    set not null;

alter table public.dispute_decisions drop constraint dispute_decisions_dismissed_has_no_amount;
alter table public.dispute_decisions drop constraint dispute_decisions_amount_non_negative;

alter table public.dispute_decisions
  add constraint dispute_decisions_gross_positive      check (gross_amount > 0),
  add constraint dispute_decisions_fee_range           check (original_platform_fee >= 0 and original_platform_fee <= gross_amount),
  add constraint dispute_decisions_amount_range        check (decided_amount > 0 and decided_amount <= gross_amount),
  add constraint dispute_decisions_shipper_range       check (shipper_amount >= 0 and shipper_amount <= decided_amount),
  add constraint dispute_decisions_deltas_non_negative check (carrier_delta >= 0 and platform_delta >= 0),
  add constraint dispute_decisions_release_closes      check (carrier_final + platform_fee_final = release_amount),
  add constraint dispute_decisions_gross_closes        check (shipper_amount + release_amount = gross_amount),
  add constraint dispute_decisions_disputed_closes     check (shipper_amount + carrier_delta + platform_delta = decided_amount),
  add constraint dispute_decisions_scale check (
    scale(decided_amount) <= 2 and scale(gross_amount) <= 2 and scale(original_platform_fee) <= 2
    and scale(shipper_amount) <= 2 and scale(carrier_delta) <= 2 and scale(platform_delta) <= 2
    and scale(release_amount) <= 2 and scale(carrier_final) <= 2 and scale(platform_fee_final) <= 2),
  add constraint dispute_decisions_magnitude check (
    abs(gross_amount) < 100000000000000 and abs(original_platform_fee) < 100000000000000
    and abs(shipper_amount) < 100000000000000 and abs(release_amount) < 100000000000000),
  add constraint dispute_decisions_outcome_shipper check (
    (outcome in ('release_to_carrier'::public.dispute_decision_outcome, 'dismissed'::public.dispute_decision_outcome)
       and shipper_amount = 0)
    or (outcome = 'refund_to_shipper'::public.dispute_decision_outcome and shipper_amount = decided_amount)
    or (outcome = 'split'::public.dispute_decision_outcome
       and shipper_amount > 0 and shipper_amount < decided_amount));

-- trigger DIFERIDO: decided_amount = disputed_amount; snapshot = fonte no
-- momento; valores derivados = formula.
create function public.dispute_decisions_match_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_d  numeric; v_g numeric; v_f numeric; m record;
begin
  select dc.disputed_amount, coalesce(pi.gross_amount, c.total_amount_brl),
         coalesce(pi.platform_fee_amount, c.platform_fee_brl)
    into v_d, v_g, v_f
    from public.dispute_cases dc
    join public.contracts c on c.id = dc.contract_id
    left join public.payment_intents pi on pi.contract_id = c.id
   where dc.id = NEW.case_id;
  if NEW.decided_amount <> v_d then
    raise exception using errcode = '23514',
      message = format('public.dispute_decisions: decided_amount (%s) tem de ser igual ao '
                       'valor em disputa (%s)', NEW.decided_amount, v_d);
  end if;
  if NEW.gross_amount <> v_g or NEW.original_platform_fee <> v_f then
    raise exception using errcode = '23514',
      message = format('public.dispute_decisions: snapshot (G=%s F=%s) difere da fonte '
                       '(G=%s F=%s) no momento da decisao',
                       NEW.gross_amount, NEW.original_platform_fee, v_g, v_f);
  end if;
  select * into m from public.dispute_settlement_math(
    NEW.gross_amount, NEW.original_platform_fee, NEW.decided_amount, NEW.shipper_amount);
  if NEW.release_amount <> m.r or NEW.carrier_final <> m.carrier_final
     or NEW.platform_fee_final <> m.fee_final
     or NEW.carrier_delta <> m.carrier_delta or NEW.platform_delta <> m.platform_delta then
    raise exception using errcode = '23514',
      message = 'public.dispute_decisions: valores derivados nao reproduzem a formula da '
                'liquidacao';
  end if;
  return null;
end;
$fn$;
create constraint trigger dispute_decisions_match_source_trg
  after insert on public.dispute_decisions
  deferrable initially deferred
  for each row execute function public.dispute_decisions_match_source();

alter table public.dispute_allocations
  add constraint dispute_allocations_amount_scale check (scale(amount) <= 2);

-- -----------------------------------------------------------------------------
-- 8. dispute_events
-- -----------------------------------------------------------------------------
alter table public.dispute_events
  add column evidence_request_id uuid null,
  add column transaction_id      uuid null,
  add column recovery_id         uuid null;
alter table public.dispute_events
  add constraint dispute_events_evidence_request_same_case_fk
  foreign key (evidence_request_id, case_id)
  references public.dispute_evidence_requests (id, case_id) on delete restrict;
alter table public.dispute_events
  add constraint dispute_events_transaction_fk
  foreign key (transaction_id) references public.payment_transactions(id) on delete restrict;
-- recovery_id: FK adicionada na migration do ledger (tabela criada la)

alter table public.dispute_events drop constraint dispute_events_type_valid;
alter table public.dispute_events
  add constraint dispute_events_type_valid check (event_type in (
    'opened', 'claim_added', 'evidence_added', 'comment_added', 'assigned', 'reassigned',
    'status_changed', 'decided', 'decision_superseded', 'closed', 'withdrawn',
    'release_blocked', 'reconciliation_required',
    'evidence_requested', 'evidence_request_fulfilled', 'evidence_request_waived',
    'evidence_request_expired',
    'settlement_requested', 'settlement_transaction_confirmed', 'settlement_transaction_failed',
    'settlement_confirmed', 'recovery_registered', 'recovery_confirmed', 'recovery_written_off',
    'cancelled_unpaid_settlement'));

-- uma chamada pode gerar mais de um evento de tipos distintos; o pedido 'both'
-- gera dois eventos do mesmo tipo citando pedidos distintos, e uma decisao
-- pos-liberacao gera ate dois 'recovery_registered' citando obrigacoes distintas
alter table public.dispute_events drop constraint dispute_events_request_case_unique;
create unique index dispute_events_request_case_unique
  on public.dispute_events (request_id, case_id, event_type,
                            coalesce(evidence_request_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            coalesce(recovery_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            coalesce(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- -----------------------------------------------------------------------------
-- 9. assertivas
-- -----------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc where proname = 'rpc_idempotency_probe' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then raise exception 'rpc_idempotency_probe: esperado 1 overload, ha %', v_n; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'rpc_idempotency_probe%' and proname <> 'rpc_idempotency_probe') then
    raise exception 'helper de idempotencia duplicado encontrado';
  end if;
  if exists (select 1 from pg_proc p
               cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = 'public.dispute_settlement_math(numeric,numeric,numeric,numeric)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or a.grantee::regrole::text <> 'postgres')) then
    raise exception 'dispute_settlement_math: EXECUTE alem de postgres';
  end if;
  if exists (select 1 from public.dispute_cases where previous_contract_status is null) then
    raise exception 'dispute_cases.previous_contract_status nulo';
  end if;
  -- os tres exemplos numericos aprovados
  if not exists (select 1 from public.dispute_settlement_math(10000.00, 350.00, 4000.00, 1500.00)
                  where fee_final = 297.50 and carrier_final = 8202.50 and platform_delta = 87.50
                    and carrier_delta = 2412.50 and carrier_recovery = 1447.50 and platform_recovery = 52.50) then
    raise exception 'dispute_settlement_math: exemplo 1 nao confere';
  end if;
  if not exists (select 1 from public.dispute_settlement_math(1234.57, 43.21, 333.33, 111.11)
                  where fee_final = 39.32 and carrier_final = 1084.14 and platform_delta = 7.78
                    and carrier_delta = 214.44 and carrier_recovery = 107.22 and platform_recovery = 3.89) then
    raise exception 'dispute_settlement_math: exemplo 2 nao confere';
  end if;
  if not exists (select 1 from public.dispute_settlement_math(5000.00, 175.00, 2000.00, 0)
                  where fee_final = 175.00 and carrier_final = 4825.00 and platform_delta = 70.00
                    and carrier_delta = 1930.00 and carrier_recovery = 0 and platform_recovery = 0) then
    raise exception 'dispute_settlement_math: exemplo 3 nao confere';
  end if;
end $$;

commit;
