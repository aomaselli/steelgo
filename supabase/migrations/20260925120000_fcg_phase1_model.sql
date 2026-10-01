-- =============================================================================
-- SteelGo | Freight Compliance Gate - Fase 1 (1/3): modelo e constraints
-- =============================================================================
-- ESCOPO: estrutura e FECHAMENTO DE ACESSO das tabelas que ela cria. NAO cria
-- policy, nao concede privilegio a papel algum, nao cria trigger de
-- imutabilidade nem RPC (isso e a 2/3). NAO faz wiring em
-- accept_bid_and_create_contract (isso e a 3/3). NAO semeia ato, coeficiente,
-- rule set nem status validated.
--
-- POR QUE O FECHAMENTO DE ACESSO ESTA AQUI E NAO SO NA 2/3:
--   Cada migration e sua propria transacao -- verificado em banco descartavel:
--   uma migration que falha nao desfaz a anterior, que fica aplicada e
--   registrada em schema_migrations. Os privilegios padrao deste projeto
--   concedem ALL em TABLES e FUNCTIONS de public a anon e authenticated, e
--   tabela nova nasce com RLS desabilitada. Sem o bloco do fim deste arquivo,
--   o estado "1/3 aplicada, 2/3 falhou" deixaria as cinco tabelas novas com
--   DML completo para papel ANONIMO e sem RLS, por tempo indeterminado.
--   O bloco final apenas NEGA acesso; as permissoes finais continuam sendo
--   concedidas pela 2/3.
--
-- PRINCIPIOS HERDADOS DA FUNDACAO L1 (20260902100000):
--   * Aplicabilidade do piso (regulatory_assessments.result / floor_applicability)
--     e CONFORMIDADE sao conceitos distintos. Esta migration NAO altera o
--     vocabulario existente de result nem de floor_applicability.
--   * Ausencia de informacao NAO vira objeto/lista vazia. jsonb nullable.
--   * Tabela append-only nao tem estado corrente mutavel; correcao gera nova
--     versao/linha, nunca UPDATE.
--   * retention_policy permanece 'pending_legal_definition' ate parecer juridico.
--   * rounding_policy permanece 'undefined' ate validacao interna documentada.
--
-- Migration aditiva. Sem CREATE ... IF NOT EXISTS: conflito deve falhar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. transport_operations: partes da cadeia de transporte
-- -----------------------------------------------------------------------------
-- shipper_company_id ja representa o CONTRATANTE ORIGINAL.
-- carrier_company_id ja representa a TRANSPORTADORA CONTRATADA.
-- As colunas abaixo acrescentam a cadeia de subcontratacao e o transportador
-- efetivo, que sao exigidos pelo roteamento regulatorio.
--
-- registered_by NAO pode ser reaproveitado para autoria: o CHECK
-- transport_operations_origin_matrix exige registered_by IS NULL quando
-- origin_kind = 'marketplace'. Por isso created_by_user_id e coluna propria.

alter table public.transport_operations
  add column subcontractor_company_id uuid,
  add column effective_carrier_company_id uuid,
  add column effective_driver_id uuid,
  add column effective_carrier_rntrc_category text,
  add column effective_carrier_regulatory_treatment text,
  add column effective_carrier_rntrc_snapshot jsonb,
  add column has_subcontracting boolean not null default false,
  add column vehicle_composition_version integer,
  add column request_id uuid,
  add column params_fingerprint text,
  add column created_by_user_id uuid;

comment on column public.transport_operations.subcontractor_company_id is
  'Empresa que subcontratou o transporte. NULL quando nao ha subcontratacao.';
comment on column public.transport_operations.effective_carrier_company_id is
  'Transportador efetivo pessoa juridica (ETC). Exclusivo com effective_driver_id.';
comment on column public.transport_operations.effective_driver_id is
  'Transportador efetivo pessoa fisica (TAC / TAC equiparado).';
comment on column public.transport_operations.effective_carrier_rntrc_category is
  'Categoria CADASTRAL no RNTRC: tac | etc | ctc. Nao e tratamento regulatorio.';
comment on column public.transport_operations.effective_carrier_regulatory_treatment is
  'Tratamento para fins de CIOT/pagamento: standard | tac_equivalent. '
  'Lei 11.442/2007 art. 5-A: ETC com ate 3 veiculos no RNTRC e TODAS as CTC equiparam-se a TAC.';
comment on column public.transport_operations.effective_carrier_rntrc_snapshot is
  'Evidencia do RNTRC congelada. Sem ela, categoria e tratamento NAO podem ser inferidos.';
comment on column public.transport_operations.vehicle_composition_version is
  'Versao corrente da composicao veicular. Derivada; correcao cria nova versao.';

alter table public.transport_operations
  add constraint transport_operations_subcontractor_fk
    foreign key (subcontractor_company_id) references public.companies(id) on delete restrict,
  add constraint transport_operations_effective_carrier_fk
    foreign key (effective_carrier_company_id) references public.companies(id) on delete restrict,
  add constraint transport_operations_effective_driver_fk
    foreign key (effective_driver_id) references public.drivers(id) on delete restrict,
  add constraint transport_operations_created_by_fk
    foreign key (created_by_user_id) references auth.users(id) on delete restrict;

-- Categoria cadastral do RNTRC.
alter table public.transport_operations
  add constraint transport_operations_rntrc_category_valid
    check (
      effective_carrier_rntrc_category is null
      or effective_carrier_rntrc_category = any (array['tac', 'etc', 'ctc'])
    );

-- Tratamento regulatorio para CIOT/pagamento.
alter table public.transport_operations
  add constraint transport_operations_regulatory_treatment_valid
    check (
      effective_carrier_regulatory_treatment is null
      or effective_carrier_regulatory_treatment = any (array['standard', 'tac_equivalent'])
    );

-- tac_equivalent so existe para etc ou ctc. Um TAC ja E TAC: nao se "equipara".
alter table public.transport_operations
  add constraint transport_operations_tac_equivalent_scope
    check (
      effective_carrier_regulatory_treatment is distinct from 'tac_equivalent'
      or effective_carrier_rntrc_category = any (array['etc', 'ctc'])
    );

-- Categoria e tratamento andam juntos: um sem o outro e estado indeterminado.
alter table public.transport_operations
  add constraint transport_operations_category_treatment_paired
    check (
      (effective_carrier_rntrc_category is null
         and effective_carrier_regulatory_treatment is null)
      or (effective_carrier_rntrc_category is not null
         and effective_carrier_regulatory_treatment is not null)
    );

-- Nada pode ser inferido sem evidencia do RNTRC congelada.
alter table public.transport_operations
  add constraint transport_operations_rntrc_evidence_required
    check (
      effective_carrier_rntrc_category is null
      or effective_carrier_rntrc_snapshot is not null
    );

alter table public.transport_operations
  add constraint transport_operations_rntrc_snapshot_is_object
    check (
      effective_carrier_rntrc_snapshot is null
      or jsonb_typeof(effective_carrier_rntrc_snapshot) = 'object'
    );

-- Coerencia entre CATEGORIA e sujeito efetivo. O tratamento regulatorio NAO
-- determina a identidade do transportador: uma ETC equiparada a TAC continua
-- sendo pessoa juridica.
--   tac           -> pessoa fisica (motorista/registro correspondente)
--   etc           -> pessoa juridica
--   ctc           -> pessoa juridica (cooperativa)
--   sem categoria -> nenhum sujeito efetivo declarado
alter table public.transport_operations
  add constraint transport_operations_effective_subject_coherent
    check (
      case effective_carrier_rntrc_category
        when 'tac' then
          effective_driver_id is not null and effective_carrier_company_id is null
        when 'etc' then
          effective_carrier_company_id is not null and effective_driver_id is null
        when 'ctc' then
          effective_carrier_company_id is not null and effective_driver_id is null
        else
          effective_carrier_company_id is null and effective_driver_id is null
      end
    );

-- Subcontratacao e declaracao afirmativa, nao inferencia.
alter table public.transport_operations
  add constraint transport_operations_subcontracting_coherent
    check (
      (has_subcontracting = true and subcontractor_company_id is not null)
      or (has_subcontracting = false and subcontractor_company_id is null)
    );

-- Impressao canonica dos parametros que produziram a operacao. Sem ela, um
-- request_id reapresentado com payload divergente seria aceito em silencio.
alter table public.transport_operations
  add constraint transport_operations_fingerprint_format
    check (params_fingerprint is null or params_fingerprint ~ '^[0-9a-f]{64}$');

comment on column public.transport_operations.params_fingerprint is
  'sha256 hex da forma canonica dos parametros de criacao (public.rpc_params_fingerprint). '
  'Replay so e legitimo quando esta impressao coincide.';

-- -----------------------------------------------------------------------------
-- GUARDA: operacoes preexistentes vinculadas a contrato, sem impressao
-- -----------------------------------------------------------------------------
-- public.transport_operations NAO nasce aqui: existe desde
-- 20260902100000_regulatory_foundation_tables.sql. Esta migration apenas
-- acrescenta params_fingerprint, que nasce NULA nas linhas ja existentes.
--
-- POR QUE ISSO IMPORTA. A partir daqui,
-- public.create_transport_operation_from_contract_core compara a impressao com
-- "is distinct from". NULL e distinto de qualquer impressao, entao uma linha
-- legada vinculada a contrato faz TODA chamada futura para aquele contrato
-- falhar com 22023, de forma permanente e silenciosa quanto a causa.
--
-- POR QUE NAO PREENCHEMOS. A impressao cobre os parametros da CHAMADA que criou
-- a operacao -- inclusive o ator e a evidencia do RNTRC. Nada disso e
-- reconstruivel a partir da linha gravada. Qualquer valor calculado aqui seria
-- inventado, e passaria a autorizar replays que ninguem verificou.
--
-- O QUE ESTA GUARDA FAZ. Interrompe a migration. Nao atualiza, nao apaga e nao
-- desativa nada. O tratamento e explicito e humano: decidir, caso a caso, se a
-- operacao legada deve ser mantida como esta (e o contrato marcado para nao
-- receber novas chamadas), migrada com uma impressao acordada, ou removida por
-- decisao de negocio registrada.
--
-- Roda dentro da transacao da propria migration: a excecao aborta a aplicacao
-- inteira e o banco fica exatamente como estava.
do $guarda_fingerprint$
declare
  v_total integer;
  v_contratos integer;
  v_amostra text;
begin
  select count(*), count(distinct contract_id)
    into v_total, v_contratos
    from public.transport_operations
   where contract_id is not null
     and params_fingerprint is null;

  if v_total > 0 then
    select string_agg(x.id::text, ', ')
      into v_amostra
      from (select id from public.transport_operations
             where contract_id is not null and params_fingerprint is null
             order by created_at limit 5) x;

    raise exception using
      errcode = '22023',
      message = format(
        'FCG Fase 1A: %s operacao(oes) de transporte vinculada(s) a contrato '
        'estao sem params_fingerprint, atingindo %s contrato(s) distinto(s). '
        'A migration foi interrompida e NADA foi alterado.',
        v_total, v_contratos),
      detail = format(
        'Primeiros ids: %s. A impressao cobre os parametros da chamada de '
        'criacao (inclusive ator e evidencia do RNTRC) e NAO pode ser '
        'reconstruida a partir da linha; preenche-la seria inventar dado.',
        coalesce(v_amostra, '(nenhum)')),
      hint =
        'Trate cada linha explicitamente antes de reaplicar: decida entre '
        'manter, migrar com impressao acordada ou remover por decisao de '
        'negocio registrada. Nao remova esta guarda para contornar o caso.';
  end if;
end
$guarda_fingerprint$;

-- Uma operacao por contrato de marketplace.
create unique index transport_operations_one_per_contract_uidx
  on public.transport_operations (contract_id)
  where contract_id is not null;

-- Idempotencia por request_id.
create unique index transport_operations_request_uidx
  on public.transport_operations (request_id)
  where request_id is not null;

create index transport_operations_effective_carrier_idx
  on public.transport_operations (effective_carrier_company_id)
  where effective_carrier_company_id is not null;

create index transport_operations_subcontractor_idx
  on public.transport_operations (subcontractor_company_id)
  where subcontractor_company_id is not null;


-- -----------------------------------------------------------------------------
-- 2. Composicao veicular versionada
-- -----------------------------------------------------------------------------
-- A quantidade de eixos pertence a OPERACAO, nao ao veiculo: o mesmo cavalo
-- pode compor arranjos diferentes. trucks e diretamente editavel pelo dono da
-- transportadora (policy trucks_manage_owner), portanto o valor usado na
-- avaliacao precisa ser congelado aqui.

create table public.transport_operation_vehicle_compositions (
  id uuid primary key default gen_random_uuid(),
  transport_operation_id uuid not null
    references public.transport_operations(id) on delete restrict,
  version integer not null,
  supersedes_composition_id uuid
    references public.transport_operation_vehicle_compositions(id) on delete restrict,
  total_axles integer not null,
  unit_count integer not null,
  composition_snapshot jsonb,
  change_reason text,
  request_id uuid,
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint tovc_version_positive check (version > 0),
  constraint tovc_total_axles_positive check (total_axles > 0),
  constraint tovc_unit_count_positive check (unit_count > 0),
  constraint tovc_snapshot_is_object
    check (composition_snapshot is null or jsonb_typeof(composition_snapshot) = 'object'),
  constraint tovc_not_self_superseding
    check (supersedes_composition_id is null or supersedes_composition_id <> id)
);

create unique index tovc_operation_version_uidx
  on public.transport_operation_vehicle_compositions (transport_operation_id, version);

create unique index tovc_request_uidx
  on public.transport_operation_vehicle_compositions (request_id)
  where request_id is not null;

comment on table public.transport_operation_vehicle_compositions is
  'Composicao veicular versionada da operacao. Append-only: correcao cria nova versao.';


create table public.transport_operation_vehicle_units (
  id uuid primary key default gen_random_uuid(),
  composition_id uuid not null
    references public.transport_operation_vehicle_compositions(id) on delete restrict,
  truck_id uuid not null references public.trucks(id) on delete restrict,
  unit_role text not null,
  position integer not null,
  axle_count integer not null,
  attributes_snapshot jsonb not null,
  created_at timestamptz not null default now(),

  -- LIMITE DO CADASTRO ATUAL: public.trucks representa o VEICULO/COMBINACAO
  -- registrado como uma unidade, com UMA placa e type do enum truck_type
  -- (truck_simples, toco, truck, bitruck, carreta, carreta_extendida, rodotrem,
  -- bitrem, ev_carreta, ev_truck). NAO existe cadastro de semirreboque, reboque
  -- ou dolly como implemento proprio, e a jornada de frota (FleetPage) grava um
  -- unico registro por veiculo. Por isso semi_trailer/trailer/dolly foram
  -- REMOVIDOS: representa-los seria fingir um cadastro que nao existe.
  -- Composicao nao representavel => dado insuficiente => incomputable.
  constraint tovu_role_valid
    check (unit_role = any (array['registered_vehicle'])),
  constraint tovu_position_positive check (position > 0),
  constraint tovu_axle_count_positive check (axle_count > 0),
  constraint tovu_snapshot_is_object
    check (jsonb_typeof(attributes_snapshot) = 'object')
);

create unique index tovu_composition_position_uidx
  on public.transport_operation_vehicle_units (composition_id, position);

create index tovu_truck_idx on public.transport_operation_vehicle_units (truck_id);

comment on column public.transport_operation_vehicle_units.axle_count is
  'Eixos desta unidade NA COMPOSICAO. Congelado: nao acompanha alteracao em trucks.';
comment on column public.transport_operation_vehicle_units.attributes_snapshot is
  'Copia imutavel dos atributos de trucks usados na avaliacao (placa, tipo, carroceria, capacidade).';


-- Soma dos eixos das unidades deve coincidir com o total da composicao.
-- Constraint trigger DEFERRABLE: as unidades sao inseridas depois da composicao,
-- dentro da mesma transacao.
create or replace function public.tovc_enforce_axle_sum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_soma integer;
  v_unidades integer;
begin
  select coalesce(sum(u.axle_count), 0), count(*)
    into v_soma, v_unidades
    from public.transport_operation_vehicle_units u
   where u.composition_id = new.id;

  if v_soma <> new.total_axles then
    raise exception using errcode = '23514',
      message = 'soma dos eixos das unidades (' || v_soma || ') difere do total declarado (' || new.total_axles || ')';
  end if;

  if v_unidades <> new.unit_count then
    raise exception using errcode = '23514',
      message = 'quantidade de unidades (' || v_unidades || ') difere de unit_count (' || new.unit_count || ')';
  end if;

  return null;
end;
$$;

create constraint trigger tovc_axle_sum_trg
  after insert on public.transport_operation_vehicle_compositions
  deferrable initially deferred
  for each row execute function public.tovc_enforce_axle_sum();


-- -----------------------------------------------------------------------------
-- 3. Resultado de conformidade (1:1 com regulatory_assessments)
-- -----------------------------------------------------------------------------
-- NAO duplica atos, artefatos, rule sets, snapshots nem evidencias: referencia
-- a avaliacao existente, que ja carrega inputs_snapshot, assessment_snapshot,
-- rule_id, rule_version e coefficient_table_version.
--
-- CONFORMIDADE nao cabe em regulatory_assessments.result, que responde
-- "o piso incide?". Aqui responde-se "o valor esta acima do piso?".

create table public.regulatory_compliance_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique
    references public.regulatory_assessments(id) on delete restrict,

  calculation_status text not null,
  compliance_status text,

  evaluated_amount numeric(14,2),
  floor_amount_raw numeric(14,2),
  floor_amount_rounded numeric(14,2),
  difference_amount numeric(14,2),
  difference_percent numeric(9,4),

  rounding_policy text not null default 'undefined',
  rule_id uuid references public.regulatory_rule_sets(id) on delete restrict,
  rule_version text,
  coefficient_table_version text,

  reason_codes jsonb,
  inputs_fingerprint text,
  enforcement_mode text not null,

  supersedes_result_id uuid
    references public.regulatory_compliance_results(id) on delete restrict,

  retention_policy text not null default 'pending_legal_definition',
  request_id uuid,
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint rcr_calculation_status_valid
    check (calculation_status = any (array['pending', 'calculated', 'incomputable', 'cancelled'])),
  constraint rcr_compliance_status_valid
    check (compliance_status is null or compliance_status = any (array['compliant', 'non_compliant'])),

  -- Invariante central: so 'calculated' tem conformidade e valores.
  constraint rcr_calculated_requires_values
    check (
      case calculation_status
        when 'calculated' then
          compliance_status is not null
          and evaluated_amount is not null
          and floor_amount_raw is not null
          and floor_amount_rounded is not null
          and difference_amount is not null
        else
          compliance_status is null
      end
    ),

  constraint rcr_enforcement_mode_valid
    check (enforcement_mode = any (array['observational', 'enforcing'])),
  constraint rcr_rounding_policy_pending
    check (rounding_policy = 'undefined'),
  constraint rcr_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  constraint rcr_reason_codes_is_array
    check (reason_codes is null or jsonb_typeof(reason_codes) = 'array'),
  constraint rcr_fingerprint_format
    check (inputs_fingerprint is null or inputs_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rcr_not_self_superseding
    check (supersedes_result_id is null or supersedes_result_id <> id),
  constraint rcr_rule_version_not_blank
    check (rule_version is null or length(btrim(rule_version)) > 0),
  constraint rcr_amounts_non_negative
    check (
      (evaluated_amount is null or evaluated_amount >= 0)
      and (floor_amount_raw is null or floor_amount_raw >= 0)
      and (floor_amount_rounded is null or floor_amount_rounded >= 0)
    )
);

create unique index rcr_request_uidx
  on public.regulatory_compliance_results (request_id)
  where request_id is not null;

create index rcr_status_idx
  on public.regulatory_compliance_results (calculation_status, compliance_status);

comment on table public.regulatory_compliance_results is
  'Conformidade valor x piso. Conceito SEPARADO de regulatory_assessments.result (aplicabilidade).';
comment on column public.regulatory_compliance_results.enforcement_mode is
  'Modo vigente quando o resultado foi produzido. Fase 1: sempre observational.';


-- -----------------------------------------------------------------------------
-- 4. Revisao administrativa (append-only)
-- -----------------------------------------------------------------------------
-- NAO cria estado approved_with_exception nesta fase. Uma revisao nunca altera
-- o resultado original: ela solicita correcao, e a correcao gera NOVA avaliacao
-- com NOVO resultado que referencia o anterior por supersedes_result_id.

create table public.regulatory_compliance_review_events (
  id uuid primary key default gen_random_uuid(),
  compliance_result_id uuid not null
    references public.regulatory_compliance_results(id) on delete restrict,
  action text not null,
  reason_code text not null,
  reason_text text,
  evidence jsonb,
  request_id uuid,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint rcre_action_valid
    check (action = any (array[
      'review_requested',
      'data_correction_requested',
      'classification_correction_requested',
      'reassessment_requested',
      'incomputability_confirmed',
      'review_closed'
    ])),
  constraint rcre_reason_code_not_blank check (length(btrim(reason_code)) > 0),
  constraint rcre_evidence_is_object
    check (evidence is null or jsonb_typeof(evidence) = 'object'),
  -- Toda acao exige evidencia, exceto o encerramento da revisao.
  constraint rcre_evidence_required
    check (action = 'review_closed' or evidence is not null)
);

create index rcre_result_idx
  on public.regulatory_compliance_review_events (compliance_result_id, created_at);

create unique index rcre_request_uidx
  on public.regulatory_compliance_review_events (request_id)
  where request_id is not null;

comment on table public.regulatory_compliance_review_events is
  'Trilha append-only de revisao administrativa. NAO converte non_compliant em compliant. '
  'ESCOPO DA FASE 1A: restrita ao backend. Nao ha grant para anon nem authenticated e '
  'nenhuma policy de SELECT, portanto NENHUM papel da aplicacao le esta tabela -- nem admin. '
  'O fluxo de revisao NAO esta disponivel na aplicacao nesta fase; abri-lo exigira grant e '
  'policy explicitos, decididos junto com a tela que o consumir.';


-- -----------------------------------------------------------------------------
-- Log observacional proprio do gate (append-only)
-- -----------------------------------------------------------------------------
-- NAO reutiliza public.rpc_call_log de proposito. Aquela tabela registra
-- desfechos de IDEMPOTENCIA: outcome so aceita 'accepted' | 'replayed' e
-- actor_id e NOT NULL com FK para auth.users. Os eventos do gate observacional
-- sao de SISTEMA: nao tem ator humano e nao sao desfechos de idempotencia.
-- Empurra-los para la exigiria afrouxar uma trilha de auditoria ja existente.
create table public.fcg_observational_log (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  contract_id uuid references public.contracts(id) on delete set null,
  transport_operation_id uuid references public.transport_operations(id) on delete set null,
  request_id uuid,
  actor_id uuid references auth.users(id) on delete restrict,
  detail text,
  created_at timestamptz not null default now(),
  constraint fcg_obs_log_event_valid
    check (event = any (array['not_evaluated', 'evaluated', 'infrastructure_error'])),
  constraint fcg_obs_log_detail_not_blank
    check (detail is null or length(btrim(detail)) > 0)
);

create index fcg_obs_log_contract_idx
  on public.fcg_observational_log (contract_id, created_at);
create index fcg_obs_log_event_idx
  on public.fcg_observational_log (event, created_at);

comment on table public.fcg_observational_log is
  'Trilha append-only do gate observacional. actor_id e nulo em evento de sistema. '
  'Separada de rpc_call_log, que registra idempotencia (accepted/replayed) e exige ator.';
comment on column public.fcg_observational_log.event is
  'not_evaluated = sem regra elegivel, nada foi criado. evaluated = avaliacao produzida. '
  'infrastructure_error = falha contida que NUNCA bloqueou a contratacao.';


-- -----------------------------------------------------------------------------
-- FECHAMENTO DE ACESSO DAS CINCO TABELAS CRIADAS ACIMA
-- -----------------------------------------------------------------------------
-- Executa na MESMA transacao dos CREATE TABLE deste arquivo, de modo que as
-- tabelas nunca existem em estado aberto -- nem por uma transacao, nem pela
-- janela entre esta migration e a 2/3.
--
-- Este bloco e deliberadamente SO NEGACAO. Nao ha um unico GRANT aqui. As
-- permissoes finais (SELECT para authenticated em tres tabelas, DML para
-- service_role nas cinco) sao concedidas pela 2/3 e nao foram alteradas.
--
-- service_role nao e mencionado: seu acesso vem dos privilegios padrao do
-- projeto e dos grants explicitos da 2/3, e ele contorna RLS por atributo de
-- papel (bypassrls). Revogar dele aqui quebraria a 3/3 e as suites.

alter table public.transport_operation_vehicle_compositions enable row level security;
alter table public.transport_operation_vehicle_units        enable row level security;
alter table public.regulatory_compliance_results            enable row level security;
alter table public.regulatory_compliance_review_events      enable row level security;
alter table public.fcg_observational_log                    enable row level security;

-- REVOKE ALL cobre SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES e
-- TRIGGER. TRUNCATE importa: nao e coberto por policy de RLS, so por
-- privilegio -- RLS habilitada sem revogar TRUNCATE ainda permitiria esvaziar
-- a tabela. REFERENCES e TRIGGER tambem saem: ambos permitem anexar objeto
-- proprio a uma tabela de trilha regulatoria.
-- PUBLIC entra na lista por principio, ainda que tabela nao receba grant a
-- PUBLIC por padrao: se algum privilegio padrao futuro passar a conceder a
-- PUBLIC, este revoke ja o cobre.
revoke all on table public.transport_operation_vehicle_compositions from public, anon, authenticated;
revoke all on table public.transport_operation_vehicle_units        from public, anon, authenticated;
revoke all on table public.regulatory_compliance_results            from public, anon, authenticated;
revoke all on table public.regulatory_compliance_review_events      from public, anon, authenticated;
revoke all on table public.fcg_observational_log                    from public, anon, authenticated;

-- ACESSO INDIRETO: tovc_enforce_axle_sum() e a UNICA funcao criada por esta
-- migration e e SECURITY DEFINER. PostgreSQL concede EXECUTE a PUBLIC em
-- funcao nova por padrao, e os privilegios padrao deste projeto concedem ALL
-- em FUNCTIONS a anon e authenticated. Ficaria, portanto, invocavel por papel
-- anonimo.
-- O trigger continua disparando normalmente sem esse EXECUTE: o privilegio e
-- exigido na criacao do trigger, nao a cada disparo.
revoke all on function public.tovc_enforce_axle_sum() from public, anon, authenticated;
