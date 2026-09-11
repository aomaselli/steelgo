-- =============================================================================
-- REV8.1 13/13 : HARDENING, RLS E GRANTS
-- =============================================================================
-- PRINCIPIO: privilegio primeiro, policy depois.
--   * privilegio de escrita e revogado de public, anon e authenticated em TODAS
--     as tabelas financeiras e de disputa. Privilegio revogado nao depende de
--     RLS estar habilitada nem de a policy estar correta;
--   * RLS entra como segunda barreira, e cada tabela ganha SOMENTE policy de
--     SELECT. Nao existe policy de INSERT, UPDATE ou DELETE para cliente algum:
--     toda escrita passa por RPC SECURITY DEFINER, cujo dono e o dono das
--     tabelas;
--   * RLS habilitada SEM policy de escrita e fail-closed por definicao - o
--     default do PostgreSQL e negar.
--
-- LIMITE DECLARADO, como em todo o lote: service_role, postgres e
-- supabase_admin ignoram RLS e mantem escrita direta. NAO sao adversarios
-- contidos por este desenho. O modelo protege contra o cliente authenticated e
-- contra erro em caminhos normais da aplicacao, e garante DETECTABILIDADE.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. HELPERS DE VISIBILIDADE
-- -----------------------------------------------------------------------------
create function public.is_contract_visible(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract_id
       and (public.is_current_user_company_owner(c.shipper_company_id)
            or public.is_current_user_company_owner(c.carrier_company_id)
            or c.driver_id = (select auth.uid())))
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
$fn$;

create function public.is_dispute_visible(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.dispute_cases d
     where d.id = p_case_id
       and public.is_contract_visible(d.contract_id))
$fn$;

revoke execute on function public.is_contract_visible(uuid) from public, anon;
revoke execute on function public.is_dispute_visible(uuid) from public, anon;
grant execute on function public.is_contract_visible(uuid) to authenticated;
grant execute on function public.is_dispute_visible(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. PRIVILEGIOS  -  escrita direta revogada em tudo que e financeiro ou de disputa
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate on
  public.pricing_rule_events,
  public.contract_lifecycle_events,
  public.payment_providers,
  public.payment_accounts,
  public.payment_intents,
  public.payment_transactions,
  public.payment_allocations,
  public.payment_events,
  public.provider_webhook_events,
  public.provider_webhook_conflicts,
  public.external_reconciliation,
  public.dispute_cases,
  public.dispute_parties,
  public.dispute_claims,
  public.dispute_evidence,
  public.dispute_decisions,
  public.dispute_allocations,
  public.dispute_comments,
  public.dispute_events
  from public, anon, authenticated;

-- public.payments e estrutura LEGADA: nunca recebeu uma linha e foi substituida
-- pelo ledger desta revisao. Escrita direta revogada para que ninguem a use por
-- engano. A tabela nao e removida - remover estrutura com historico potencial no
-- remoto seria decisao propria.
revoke insert, update, delete, truncate on public.payments
  from public, anon, authenticated;

-- Fecha o privilegio excedente registrado na revisao 7: TRUNCATE nao e filtrado
-- por RLS, e DELETE dependia apenas da ausencia de policy.
-- INSERT tambem sai: o contrato nasce EXCLUSIVAMENTE por
-- accept_bid_and_create_contract, que e SECURITY DEFINER. A policy
-- contracts_insert_admin ja barrava o cliente comum, mas policy e a segunda
-- barreira - o privilegio e a primeira.
revoke insert, delete, truncate on public.contracts from public, anon, authenticated;
revoke delete, truncate on public.freights  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. RLS FAIL-CLOSED  -  somente SELECT, e so para quem tem interesse legitimo
-- -----------------------------------------------------------------------------
alter table public.pricing_rule_events        enable row level security;
alter table public.contract_lifecycle_events  enable row level security;
alter table public.payment_providers          enable row level security;
alter table public.payment_accounts           enable row level security;
alter table public.payment_intents            enable row level security;
alter table public.payment_transactions       enable row level security;
alter table public.payment_allocations        enable row level security;
alter table public.payment_events             enable row level security;
alter table public.provider_webhook_events    enable row level security;
alter table public.provider_webhook_conflicts enable row level security;
alter table public.external_reconciliation    enable row level security;
alter table public.dispute_cases              enable row level security;
alter table public.dispute_parties            enable row level security;
alter table public.dispute_claims             enable row level security;
alter table public.dispute_evidence           enable row level security;
alter table public.dispute_decisions          enable row level security;
alter table public.dispute_allocations        enable row level security;
alter table public.dispute_comments           enable row level security;
alter table public.dispute_events             enable row level security;

-- Precificacao: a trilha de decisao comercial e interna.
create policy pricing_rule_events_select_admin on public.pricing_rule_events
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- Ciclo do contrato: partes do contrato e administrador.
create policy contract_lifecycle_events_select_party on public.contract_lifecycle_events
  for select to authenticated
  using (public.is_contract_visible(contract_id));

-- Catalogo de provedores: leitura livre para autenticado. Nao ha segredo aqui -
-- e o codigo do provedor e o que ele sabe fazer.
create policy payment_providers_select on public.payment_providers
  for select to authenticated using (true);

create policy payment_accounts_select_own on public.payment_accounts
  for select to authenticated
  using (public.is_current_user_company_owner(company_id)
         or public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy payment_intents_select_party on public.payment_intents
  for select to authenticated
  using (public.is_contract_visible(contract_id));

create policy payment_transactions_select_party on public.payment_transactions
  for select to authenticated
  using (exists (select 1 from public.payment_intents pi
                  where pi.id = payment_transactions.intent_id
                    and public.is_contract_visible(pi.contract_id)));

create policy payment_allocations_select_party on public.payment_allocations
  for select to authenticated
  using (exists (select 1 from public.payment_transactions t
                   join public.payment_intents pi on pi.id = t.intent_id
                  where t.id = payment_allocations.transaction_id
                    and public.is_contract_visible(pi.contract_id)));

create policy payment_events_select_party on public.payment_events
  for select to authenticated
  using (exists (select 1 from public.payment_intents pi
                  where pi.id = payment_events.intent_id
                    and public.is_contract_visible(pi.contract_id)));

-- Aviso de provedor e reconciliacao: internos. As partes veem o EFEITO pelos
-- eventos, nao o aviso cru.
create policy provider_webhook_events_select_admin on public.provider_webhook_events
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy provider_webhook_conflicts_select_admin on public.provider_webhook_conflicts
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy external_reconciliation_select_admin on public.external_reconciliation
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- Disputas: quem participa do contrato ve o caso inteiro; administrador tambem.
create policy dispute_cases_select_party on public.dispute_cases
  for select to authenticated using (public.is_contract_visible(contract_id));
create policy dispute_parties_select_party on public.dispute_parties
  for select to authenticated using (public.is_dispute_visible(case_id));
create policy dispute_claims_select_party on public.dispute_claims
  for select to authenticated using (public.is_dispute_visible(case_id));
create policy dispute_evidence_select_party on public.dispute_evidence
  for select to authenticated using (public.is_dispute_visible(case_id));
create policy dispute_decisions_select_party on public.dispute_decisions
  for select to authenticated using (public.is_dispute_visible(case_id));
create policy dispute_allocations_select_party on public.dispute_allocations
  for select to authenticated
  using (exists (select 1 from public.dispute_decisions d
                  where d.id = dispute_allocations.decision_id
                    and public.is_dispute_visible(d.case_id)));
create policy dispute_events_select_party on public.dispute_events
  for select to authenticated using (public.is_dispute_visible(case_id));

-- Comentario marcado como interno NAO aparece para as partes.
create policy dispute_comments_select_party on public.dispute_comments
  for select to authenticated
  using (public.is_dispute_visible(case_id)
         and (visibility = 'all_parties'
              or public.has_role((select auth.uid()), 'admin'::public.app_role)));

-- -----------------------------------------------------------------------------
-- 4. NENHUM SEGREDO NESTE LOTE
-- -----------------------------------------------------------------------------
-- Nenhuma migration desta revisao contem chave, token, senha, certificado,
-- credencial de provedor, CPF, CNPJ, dado bancario ou placa. payment_accounts
-- guarda apenas referencia OPACA de conta; provider_webhook_events guarda
-- apenas o DIGEST do payload, nunca o corpo. As unicas constantes gravadas sao
-- o codigo do provedor 'manual', o identificador estavel da regra comercial e
-- a taxa de 3,5% aprovada.
--
-- E nenhuma chave de servico existe no frontend: record_provider_webhook, unica
-- porta de entrada de aviso externo, NAO recebe grant para authenticated - so
-- service_role a alcanca, a partir de uma funcao de borda.
-- -----------------------------------------------------------------------------

comment on table public.payments is
  'LEGADO. Nunca recebeu uma linha: as referencias no frontend sempre foram '
  'SELECT e nenhuma migration insere nela. Substituida pelo ledger de '
  '20260903100440. Escrita direta revogada em 20260903100800. Mantida para nao '
  'destruir estrutura com historico potencial no ambiente remoto.';

commit;
