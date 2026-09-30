-- =============================================================================
-- SteelGo | Freight Compliance Gate - Fase 1 (2/3): RLS, grants, triggers, RPC
-- =============================================================================
-- ESCOPO: seguranca e funcao interna. NAO faz wiring em
-- accept_bid_and_create_contract (isso e a 3/3) e NAO semeia flag.
--
-- PRINCIPIOS:
--   * anon nao le nada.
--   * authenticated nao escreve nada direto: somente SELECT. Escrita so por RPC.
--   * Motorista NAO le preco, piso, diferenca, margem nem evidencia
--     administrativa. As tabelas de conformidade e revisao nao concedem leitura
--     a motorista em nenhuma hipotese.
--   * Imutabilidade por TRIGGER, que vale inclusive para service_role. Grant
--     amplo sem trigger nao protege snapshot.
--   * Avaliacao de publicacao passa a ser autorizada tambem por offer_version_id.
--
-- PROVA EXIGIDA ANTES DO TRIGGER DE VALORES CONTRATUAIS:
--   As nove funcoes que escrevem em public.contracts sao
--   accept_bid_and_create_contract (INSERT), sign_contract,
--   contract_lifecycle_append, complete_contract_delivery_core,
--   confirm_escrow_funding, confirm_escrow_release, ensure_payment_intent,
--   respond_trip_assignment e trip_assign_core.
--   Nenhuma delas atribui total_amount_brl, platform_fee_brl ou
--   carrier_payout_brl em UPDATE (verificado em pg_get_functiondef: zero
--   ocorrencias de "<coluna> =" nas nove). As unicas que fazem UPDATE alteram
--   completed_at, escrow_status, last_lifecycle_event_id, activated_at e os
--   campos de assinatura. O trigger abaixo e BEFORE UPDATE e so recusa
--   alteracao das tres colunas monetarias, portanto nao afeta o INSERT nem
--   qualquer UPDATE existente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RLS e grants
-- -----------------------------------------------------------------------------
alter table public.transport_operation_vehicle_compositions enable row level security;
alter table public.transport_operation_vehicle_units        enable row level security;
alter table public.regulatory_compliance_results            enable row level security;
alter table public.regulatory_compliance_review_events      enable row level security;

revoke all on public.transport_operation_vehicle_compositions from anon, authenticated;
revoke all on public.transport_operation_vehicle_units        from anon, authenticated;
revoke all on public.regulatory_compliance_results            from anon, authenticated;
revoke all on public.regulatory_compliance_review_events      from anon, authenticated;

grant select on public.transport_operation_vehicle_compositions to authenticated;
grant select on public.transport_operation_vehicle_units        to authenticated;
grant select on public.regulatory_compliance_results            to authenticated;
-- revisao administrativa: nem SELECT para authenticated. Somente RPC de admin.

grant select, insert, update, delete on public.transport_operation_vehicle_compositions to service_role;
grant select, insert, update, delete on public.transport_operation_vehicle_units        to service_role;
grant select, insert, update, delete on public.regulatory_compliance_results            to service_role;
grant select, insert, update, delete on public.regulatory_compliance_review_events      to service_role;


-- Partes legitimas da operacao: embarcador e transportadores da cadeia.
-- Motorista NAO entra: a funcao e usada por tabelas com preco e piso.
create or replace function public.is_transport_operation_commercial_party(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.transport_operations o
     where o.id = p_operation_id
       and (
         public.has_role((select auth.uid()), 'admin'::public.app_role)
         or public.is_current_user_company_member(o.shipper_company_id)
         or public.is_current_user_company_owner(o.shipper_company_id)
         or (o.carrier_company_id is not null and (
               public.is_current_user_company_member(o.carrier_company_id)
            or public.is_current_user_company_owner(o.carrier_company_id)))
         or (o.subcontractor_company_id is not null and (
               public.is_current_user_company_member(o.subcontractor_company_id)
            or public.is_current_user_company_owner(o.subcontractor_company_id)))
         or (o.effective_carrier_company_id is not null and (
               public.is_current_user_company_member(o.effective_carrier_company_id)
            or public.is_current_user_company_owner(o.effective_carrier_company_id)))
       )
  );
$$;

revoke all on function public.is_transport_operation_commercial_party(uuid) from public, anon;
grant execute on function public.is_transport_operation_commercial_party(uuid) to authenticated, service_role;


create policy tovc_select_parties
  on public.transport_operation_vehicle_compositions
  for select to authenticated
  using (public.is_transport_operation_commercial_party(transport_operation_id));

create policy tovu_select_parties
  on public.transport_operation_vehicle_units
  for select to authenticated
  using (exists (
    select 1 from public.transport_operation_vehicle_compositions c
     where c.id = transport_operation_vehicle_units.composition_id
       and public.is_transport_operation_commercial_party(c.transport_operation_id)
  ));

create policy rcr_select_parties
  on public.regulatory_compliance_results
  for select to authenticated
  using (exists (
    select 1 from public.regulatory_assessments a
     where a.id = regulatory_compliance_results.assessment_id
       and (
         (a.transport_operation_id is not null
            and public.is_transport_operation_commercial_party(a.transport_operation_id))
         or (a.offer_version_id is not null and exists (
              select 1 from public.freight_offer_versions v
                join public.freights f on f.id = v.freight_id
               where v.id = a.offer_version_id
                 and (public.has_role((select auth.uid()), 'admin'::public.app_role)
                      or public.is_current_user_company_owner(f.company_id)
                      or public.is_current_user_company_member(f.company_id))))
       )
  ));

-- Avaliacoes de publicacao: autorizacao adicional por offer_version_id.
-- Policy PERMISSIVA adicional; nao altera a policy existente.
create policy regulatory_assessments_select_offer_parties
  on public.regulatory_assessments
  for select to authenticated
  using (
    offer_version_id is not null
    and exists (
      select 1 from public.freight_offer_versions v
        join public.freights f on f.id = v.freight_id
       where v.id = regulatory_assessments.offer_version_id
         and (public.has_role((select auth.uid()), 'admin'::public.app_role)
              or public.is_current_user_company_owner(f.company_id)
              or public.is_current_user_company_member(f.company_id))
    )
  );


-- -----------------------------------------------------------------------------
-- 2. Imutabilidade (vale inclusive para service_role)
-- -----------------------------------------------------------------------------
create or replace function public.fcg_block_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501',
    message = 'registro imutavel: ' || tg_table_name || ' nao aceita ' || tg_op
            || '. Correcao gera nova versao/avaliacao.';
end;
$$;

create trigger tovc_block_update before update on public.transport_operation_vehicle_compositions
  for each row execute function public.fcg_block_mutation();
create trigger tovc_block_delete before delete on public.transport_operation_vehicle_compositions
  for each row execute function public.fcg_block_mutation();

create trigger tovu_block_update before update on public.transport_operation_vehicle_units
  for each row execute function public.fcg_block_mutation();
create trigger tovu_block_delete before delete on public.transport_operation_vehicle_units
  for each row execute function public.fcg_block_mutation();

create trigger rcr_block_update before update on public.regulatory_compliance_results
  for each row execute function public.fcg_block_mutation();
create trigger rcr_block_delete before delete on public.regulatory_compliance_results
  for each row execute function public.fcg_block_mutation();

create trigger rcre_block_update before update on public.regulatory_compliance_review_events
  for each row execute function public.fcg_block_mutation();
create trigger rcre_block_delete before delete on public.regulatory_compliance_review_events
  for each row execute function public.fcg_block_mutation();

create trigger fcg_obs_log_block_update before update on public.fcg_observational_log
  for each row execute function public.fcg_block_mutation();
create trigger fcg_obs_log_block_delete before delete on public.fcg_observational_log
  for each row execute function public.fcg_block_mutation();

-- Fechado a anon e authenticated: e trilha interna, nao dado de produto.
alter table public.fcg_observational_log enable row level security;
revoke all on table public.fcg_observational_log from public, anon, authenticated;
grant select, insert on table public.fcg_observational_log to service_role;


-- Campos regulatorios congelados em transport_operations: uma vez classificada
-- a operacao, as partes e a composicao nao mudam. Correcao cria nova avaliacao.
create or replace function public.transport_operations_freeze_regulatory_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.vehicle_composition_version is not null
     and new.vehicle_composition_version is distinct from old.vehicle_composition_version
     and new.vehicle_composition_version <= old.vehicle_composition_version then
    raise exception using errcode = '42501',
      message = 'vehicle_composition_version so avanca; correcao cria nova versao';
  end if;

  if old.contract_id is not null and new.contract_id is distinct from old.contract_id then
    raise exception using errcode = '42501', message = 'contract_id da operacao e imutavel';
  end if;

  if old.effective_carrier_rntrc_category is not null
     and new.effective_carrier_rntrc_category is distinct from old.effective_carrier_rntrc_category then
    raise exception using errcode = '42501',
      message = 'categoria RNTRC do transportador efetivo e congelada; correcao gera nova avaliacao';
  end if;

  if old.effective_carrier_regulatory_treatment is not null
     and new.effective_carrier_regulatory_treatment is distinct from old.effective_carrier_regulatory_treatment then
    raise exception using errcode = '42501',
      message = 'tratamento regulatorio e congelado; correcao gera nova avaliacao';
  end if;

  -- A evidencia do RNTRC sustenta categoria e tratamento: se ela pudesse mudar,
  -- o congelamento dos dois campos acima seria apenas aparente.
  if old.effective_carrier_rntrc_snapshot is not null
     and new.effective_carrier_rntrc_snapshot is distinct from old.effective_carrier_rntrc_snapshot then
    raise exception using errcode = '42501',
      message = 'evidencia do RNTRC e congelada; correcao gera nova avaliacao';
  end if;

  if old.shipper_company_id is distinct from new.shipper_company_id
     or (old.carrier_company_id is not null
         and new.carrier_company_id is distinct from old.carrier_company_id) then
    raise exception using errcode = '42501', message = 'partes da operacao sao congeladas';
  end if;

  return new;
end;
$$;

create trigger transport_operations_freeze_regulatory_trg
  before update on public.transport_operations
  for each row execute function public.transport_operations_freeze_regulatory_fields();


-- Valores monetarios do contrato: imutaveis apos a criacao.
-- Ver PROVA no cabecalho: nenhuma das nove funcoes altera estas colunas.
create or replace function public.contracts_freeze_monetary_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.total_amount_brl is distinct from old.total_amount_brl
     or new.platform_fee_brl is distinct from old.platform_fee_brl
     or new.carrier_payout_brl is distinct from old.carrier_payout_brl then
    raise exception using errcode = '42501',
      message = 'valores monetarios do contrato sao imutaveis apos a criacao';
  end if;
  return new;
end;
$$;

create trigger contracts_freeze_monetary_trg
  before update on public.contracts
  for each row execute function public.contracts_freeze_monetary_values();


-- -----------------------------------------------------------------------------
-- 3. Impressao canonica dos parametros da operacao
-- -----------------------------------------------------------------------------
-- Delega a public.rpc_params_fingerprint (20260903100100), que e o canonicalizador
-- da casa: sha256 do texto de um jsonb. O jsonb ja normaliza chaves (ordenadas,
-- sem duplicatas) e espacos, portanto a impressao nao depende da ordem em que os
-- campos foram escritos.
--
-- TRATAMENTO DE AUSENTES: jsonb_build_object com valor SQL NULL produz JSON null.
-- A chave existe sempre, com null explicito -- nunca some. Assim "campo ausente"
-- e "campo nulo" colapsam no MESMO valor de proposito: os dois descrevem a mesma
-- operacao. O que NAO colapsa e null contra qualquer valor preenchido.
--
-- DEFAULTS: os parametros com default sao resolvidos pelo servidor antes desta
-- chamada, portanto a impressao e calculada sobre os valores efetivos.
--
-- JSON: a evidencia do RNTRC entra como jsonb aninhado e e comparada como esta.
-- Duas evidencias com o mesmo conteudo logico mas numeros escritos de forma
-- diferente (1.0 vs 1.00) produzem impressoes diferentes. Isso e deliberado:
-- evidencia regulatoria divergente no byte NAO deve passar por replay.
--
-- ENTRADAS DERIVADAS DO CONTRATO tambem entram. Se o contrato mudar entre duas
-- chamadas, a repeticao deixa de ser legitima e vira conflito.
create or replace function public.fcg_operation_fingerprint(
  p_contract_id uuid,
  p_freight_id uuid,
  p_shipper_company_id uuid,
  p_carrier_company_id uuid,
  p_contract_driver_id uuid,
  p_truck_id uuid,
  p_actor uuid,
  p_effective_carrier_rntrc_category text,
  p_effective_carrier_regulatory_treatment text,
  p_effective_carrier_rntrc_snapshot jsonb,
  p_effective_carrier_company_id uuid,
  p_effective_driver_id uuid,
  p_subcontractor_company_id uuid
)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.rpc_params_fingerprint(pg_catalog.jsonb_build_object(
    'v',                       1,
    'contract_id',             p_contract_id,
    'freight_id',              p_freight_id,
    'shipper_company_id',      p_shipper_company_id,
    'carrier_company_id',      p_carrier_company_id,
    'contract_driver_id',      p_contract_driver_id,
    'truck_id',                p_truck_id,
    'actor',                   p_actor,
    'rntrc_category',          p_effective_carrier_rntrc_category,
    'regulatory_treatment',    p_effective_carrier_regulatory_treatment,
    'rntrc_snapshot',          p_effective_carrier_rntrc_snapshot,
    'effective_carrier_company_id', p_effective_carrier_company_id,
    'effective_driver_id',     p_effective_driver_id,
    'subcontractor_company_id', p_subcontractor_company_id
  ))
$$;

revoke all on function public.fcg_operation_fingerprint(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;

comment on function public.fcg_operation_fingerprint(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid, uuid) is
  'Impressao canonica dos parametros de criacao da operacao. Campo v = versao do esquema '
  'de impressao: mudar o conjunto de entradas exige incrementar v.';


-- -----------------------------------------------------------------------------
-- 4. RPC interna: cria a operacao de transporte a partir do contrato
-- -----------------------------------------------------------------------------
create or replace function public.create_transport_operation_from_contract_core(
  p_contract_id uuid,
  p_request_id uuid,
  p_actor uuid,
  p_effective_carrier_rntrc_category text default null,
  p_effective_carrier_regulatory_treatment text default null,
  p_effective_carrier_rntrc_snapshot jsonb default null,
  p_effective_carrier_company_id uuid default null,
  p_effective_driver_id uuid default null,
  p_subcontractor_company_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_existing public.transport_operations%rowtype;
  v_operation_id uuid;
  v_driver_id uuid;
  v_fp text;
begin
  if p_contract_id is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'contract_id e request_id sao obrigatorios';
  end if;

  -- ORDEM DELIBERADA. A versao anterior devolvia a operacao existente ANTES de
  -- carregar o contrato e ANTES de validar o ator: quem possuisse um request_id
  -- alheio recebia o id da operacao sem passar por autorizacao alguma.
  --   1. carregar o contrato
  --   2. autorizar o ator e conferir o escopo
  --   3. calcular a impressao dos parametros
  --   4. serializar no mesmo espaco de lock da casa
  --   5. so entao decidir entre replay, conflito ou criacao

  -- 1. contrato
  select * into v_contract from public.contracts c where c.id = p_contract_id;
  if not found then
    raise exception using errcode = '23503', message = 'contrato inexistente';
  end if;

  -- 2. tenant e papel: o ator precisa ser parte do contrato ou admin.
  if p_actor is not null
     and not public.has_role(p_actor, 'admin'::public.app_role)
     and not exists (
       select 1 from public.companies co
        where co.id in (v_contract.shipper_company_id, v_contract.carrier_company_id)
          and co.owner_id = p_actor
     ) then
    raise exception using errcode = '42501', message = 'ator nao e parte do contrato';
  end if;

  -- 3. impressao canonica das entradas que definem a operacao
  v_fp := public.fcg_operation_fingerprint(
    p_contract_id, v_contract.freight_id, v_contract.shipper_company_id,
    v_contract.carrier_company_id, v_contract.driver_id, v_contract.truck_id,
    p_actor,
    p_effective_carrier_rntrc_category, p_effective_carrier_regulatory_treatment,
    p_effective_carrier_rntrc_snapshot, p_effective_carrier_company_id,
    p_effective_driver_id, p_subcontractor_company_id);

  -- 4. mesma chave de lock de public.rpc_idempotency_probe (20260903100100):
  -- o gate serializa no MESMO espaco de request_id do resto do sistema, o que
  -- fecha a janela entre "nao encontrei" e o insert. O lock do contrato vem
  -- depois, sempre nesta ordem, para nao criar ciclo de espera.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('steelgo.rpc_idempotency:' || p_request_id::pg_catalog.text, 0));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('steelgo.fcg_operation_contract:' || p_contract_id::pg_catalog.text, 0));

  -- 5a. mesmo request_id
  select * into v_existing
    from public.transport_operations o
   where o.request_id = p_request_id;
  if found then
    -- escopo: o request_id nao pode migrar de contrato
    if v_existing.contract_id is distinct from p_contract_id then
      raise exception using errcode = '22023',
        message = 'create_transport_operation_from_contract_core: request_id ja consumido para outro contrato';
    end if;
    if v_existing.params_fingerprint is distinct from v_fp then
      raise exception using errcode = '22023',
        message = 'create_transport_operation_from_contract_core: request_id reapresentado com parametros diferentes';
    end if;
    return v_existing.id;
  end if;

  -- 5b. outro request_id para o MESMO contrato. Antes isto devolvia a operacao
  -- em silencio, descartando um payload divergente sem aviso.
  select * into v_existing
    from public.transport_operations o
   where o.contract_id = p_contract_id;
  if found then
    if v_existing.params_fingerprint is distinct from v_fp then
      raise exception using errcode = '22023',
        message = 'create_transport_operation_from_contract_core: contrato ja possui operacao com parametros diferentes';
    end if;
    return v_existing.id;
  end if;

  -- IMPORTANTE: os dois driver_id NAO sao a mesma coisa.
  --   public.contracts.driver_id            -> auth.users(id)   (conta do motorista)
  --   public.transport_operations.driver_id -> public.drivers(id) (cadastro do motorista)
  -- Copiar um no outro quebra a FK. Resolvemos o cadastro a partir do perfil.
  -- Sem cadastro correspondente, fica nulo: dado insuficiente vira incomputable,
  -- nunca um vinculo inventado.
  if v_contract.driver_id is not null then
    select d.id into v_driver_id
      from public.drivers d
     where d.profile_id = v_contract.driver_id
     order by d.created_at
     limit 1;
  end if;

  insert into public.transport_operations (
    origin_kind, freight_id, contract_id,
    shipper_company_id, carrier_company_id, driver_id, truck_id,
    operation_state, retention_policy,
    subcontractor_company_id, effective_carrier_company_id, effective_driver_id,
    effective_carrier_rntrc_category, effective_carrier_regulatory_treatment,
    effective_carrier_rntrc_snapshot, has_subcontracting,
    request_id, params_fingerprint, created_by_user_id
  ) values (
    'marketplace', v_contract.freight_id, v_contract.id,
    v_contract.shipper_company_id, v_contract.carrier_company_id,
    v_driver_id, v_contract.truck_id,
    'created', 'pending_legal_definition',
    p_subcontractor_company_id, p_effective_carrier_company_id, p_effective_driver_id,
    p_effective_carrier_rntrc_category, p_effective_carrier_regulatory_treatment,
    p_effective_carrier_rntrc_snapshot, (p_subcontractor_company_id is not null),
    p_request_id, v_fp, p_actor
  )
  returning id into v_operation_id;

  return v_operation_id;

-- Rede de seguranca. Os dois advisory locks acima ja serializam este caminho,
-- mas um INSERT direto por fora da RPC continua possivel; neste caso o indice
-- unico e a ultima linha de defesa e a corrida perdida NAO pode virar sucesso
-- silencioso nem erro cru de chave duplicada.
exception when unique_violation then
  select * into v_existing
    from public.transport_operations o
   where o.request_id = p_request_id or o.contract_id = p_contract_id
   order by (o.request_id = p_request_id) desc
   limit 1;
  if not found then
    raise;
  end if;
  if v_existing.params_fingerprint is distinct from v_fp then
    raise exception using errcode = '22023',
      message = 'create_transport_operation_from_contract_core: operacao concorrente criada com parametros diferentes';
  end if;
  return v_existing.id;
end;
$$;

revoke all on function public.create_transport_operation_from_contract_core(uuid, uuid, uuid, text, text, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_transport_operation_from_contract_core(uuid, uuid, uuid, text, text, jsonb, uuid, uuid, uuid)
  to service_role;

comment on function public.create_transport_operation_from_contract_core(uuid, uuid, uuid, text, text, jsonb, uuid, uuid, uuid) is
  'Interna. Cria a operacao de transporte a partir do contrato, idempotente por request_id. Sem EXECUTE para anon/authenticated.';
