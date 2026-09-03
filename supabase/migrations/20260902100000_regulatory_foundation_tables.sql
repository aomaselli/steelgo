-- =============================================================================
-- SteelGo | L1 - Fundacao Regulatoria (1/2)
--   atos, artefatos documentais, validacoes, conjuntos de regras e
--   operacoes de transporte
-- =============================================================================
-- Base: claude/matriz-evidencias-piso.md (congelada) + erratas M.1, M.2, M.2.1
--       + claude/f4-2-desenho-l1-l2.md (v2) + revisoes independentes F4.3.
--
-- ESCOPO: somente L1. NAO cria L2a, L2b, L3, CIOT, IPEF nem Valid/Datavalid.
-- NAO altera nenhuma tabela existente. NAO toca em freights, contracts,
-- contract_status, has_role, pricing_rules, freight_quotes, route_estimates,
-- capacity_matches nem no frontend.
--
-- PRINCIPIOS APLICADOS NESTA REVISAO:
--   * Ausencia de informacao NAO vira objeto/lista vazia. jsonb nullable, sem
--     default. '{}' e '[]' significam declaracao afirmativa de vazio.
--   * Tabela append-only NAO tem estado corrente mutavel. Estado evolutivo vira
--     EVENTO append-only e o corrente e derivado do ultimo evento.
--   * Tabela append-only NAO aceita ON DELETE SET NULL: a atualizacao em cascata
--     bateria no trigger e levantaria 42501. Autoria e sempre RESTRICT.
--
-- Migration aditiva. Sem CREATE ... IF NOT EXISTS nos objetos novos: se algum
-- objeto conflitante ja existir, esta migration DEVE falhar explicitamente.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Guarda append-only compartilhada
-- -----------------------------------------------------------------------------
create function public.regulatory_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'tabela regulatoria append-only: UPDATE e DELETE nao sao permitidos';
end;
$$;

revoke execute on function public.regulatory_block_mutation() from public, anon, authenticated;

comment on function public.regulatory_block_mutation() is
  'Guarda append-only das tabelas regulatorias imutaveis. Levanta 42501 em UPDATE e '
  'DELETE. Nao e executavel por public, anon ou authenticated. NAO substitui RLS nem '
  'privilegio: e camada adicional. Consequencia de projeto: nenhuma FK de tabela '
  'protegida por este trigger pode usar ON DELETE SET NULL.';

-- -----------------------------------------------------------------------------
-- 1. regulatory_acts  -  IDENTIDADE e VIGENCIA do ato normativo
-- -----------------------------------------------------------------------------
-- MUTAVEL por caminho controlado: superseded_by_act_id e effective_to so se
-- conhecem DEPOIS da insercao. Escrita fechada: sem policy e sem grant.
-- Ato SEM artefato = identificado, ainda nao coletado.
-- -----------------------------------------------------------------------------
create table public.regulatory_acts (
  id                    uuid        primary key default gen_random_uuid(),
  act_type              text        not null,
  act_number            text        not null,
  act_year              integer     not null,
  act_date              date        null,
  issuer                text        not null,
  title                 text        null,
  summary               text        null,
  effective_from        date        null,
  effective_to          date        null,
  superseded_by_act_id  uuid        null,
  retention_policy      text        not null default 'pending_legal_definition',
  created_at            timestamptz not null default now(),
  created_by            uuid        null,

  constraint regulatory_acts_act_type_valid
    check (act_type in ('lei','resolucao','portaria','instrucao_normativa',
                        'decreto','deliberacao','outro')),
  constraint regulatory_acts_act_number_not_blank check (length(btrim(act_number)) > 0),
  constraint regulatory_acts_issuer_not_blank check (length(btrim(issuer)) > 0),
  constraint regulatory_acts_year_range check (act_year between 1900 and 2200),
  constraint regulatory_acts_period_valid
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint regulatory_acts_not_self_superseded
    check (superseded_by_act_id is null or superseded_by_act_id <> id),
  constraint regulatory_acts_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  constraint regulatory_acts_identity_unique
    unique (act_type, act_number, act_year, issuer)
);

alter table public.regulatory_acts
  add constraint regulatory_acts_superseded_by_fk
  foreign key (superseded_by_act_id) references public.regulatory_acts(id) on delete restrict;

alter table public.regulatory_acts
  add constraint regulatory_acts_created_by_fk
  foreign key (created_by) references auth.users(id) on delete restrict;

create index regulatory_acts_issuer_idx on public.regulatory_acts (issuer);
create index regulatory_acts_effective_idx on public.regulatory_acts (effective_from, effective_to);
create index regulatory_acts_superseded_idx on public.regulatory_acts (superseded_by_act_id);
create index regulatory_acts_created_by_idx on public.regulatory_acts (created_by);

comment on table public.regulatory_acts is
  'Identidade e vigencia do ato normativo. NAO guarda arquivo: os documentos coletados '
  'ficam em regulatory_source_artifacts, um por procedencia. Ato SEM artefato = '
  'identificado, ainda nao coletado. Escrita fechada (sem policy, sem grant). NAO e '
  'append-only: superseded_by_act_id e effective_to sao preenchidos depois. '
  'Retencao pendente de definicao juridica (P24).';

-- -----------------------------------------------------------------------------
-- 2. regulatory_source_artifacts  -  ARQUIVO IMUTAVEL
-- -----------------------------------------------------------------------------
-- Append-only e SEM estado de validacao. O ciclo de validacao vive em
-- regulatory_source_artifact_validations, como eventos.
--
-- Motivo: com trigger append-only e unique (act_id, document_hash), um artefato
-- que nascesse 'unvalidated' NUNCA poderia virar 'validated' - UPDATE bloqueado e
-- reinsercao impedida pela unique. Estado corrente mutavel dentro de tabela
-- imutavel e contradicao.
--
-- HASH CANONICO: SHA-256 em MINUSCULAS. [a-f0-9] rejeita maiusculas.
-- Normalize com lower() ANTES do insert.
-- -----------------------------------------------------------------------------
create table public.regulatory_source_artifacts (
  id                uuid        primary key default gen_random_uuid(),
  act_id            uuid        not null,
  origin_type       text        not null,
  document_ref      text        not null,
  document_hash     text        not null,
  size_bytes        bigint      null,
  accessed_at       timestamptz null,
  notes             text        null,
  retention_policy  text        not null default 'pending_legal_definition',
  created_at        timestamptz not null default now(),
  created_by        uuid        null,

  constraint regulatory_source_artifacts_origin_type_valid
    check (origin_type in ('captura_pdf','page_html','official_binary','dou')),
  constraint regulatory_source_artifacts_ref_not_blank
    check (length(btrim(document_ref)) > 0),
  constraint regulatory_source_artifacts_hash_lowercase_sha256
    check (document_hash ~ '^[a-f0-9]{64}$'),
  constraint regulatory_source_artifacts_size_positive
    check (size_bytes is null or size_bytes > 0),
  constraint regulatory_source_artifacts_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  constraint regulatory_source_artifacts_act_hash_unique unique (act_id, document_hash),
  constraint regulatory_source_artifacts_id_act_unique   unique (id, act_id)
);

alter table public.regulatory_source_artifacts
  add constraint regulatory_source_artifacts_act_fk
  foreign key (act_id) references public.regulatory_acts(id) on delete restrict;

alter table public.regulatory_source_artifacts
  add constraint regulatory_source_artifacts_created_by_fk
  foreign key (created_by) references auth.users(id) on delete restrict;

create index regulatory_source_artifacts_act_idx on public.regulatory_source_artifacts (act_id);
create index regulatory_source_artifacts_origin_idx on public.regulatory_source_artifacts (origin_type);
create index regulatory_source_artifacts_created_by_idx on public.regulatory_source_artifacts (created_by);

create trigger regulatory_source_artifacts_no_mutation
  before update or delete on public.regulatory_source_artifacts
  for each row execute function public.regulatory_block_mutation();

comment on table public.regulatory_source_artifacts is
  'Arquivo coletado de um ato normativo, um por procedencia. IMUTAVEL (append-only) e '
  'sem estado de validacao: o ciclo de validacao vive em '
  'regulatory_source_artifact_validations, como eventos. document_ref e document_hash '
  'sao obrigatorios. captura_pdf NAO se equipara a binario oficial publicado pelo orgao '
  '(Errata M.2.1). Retencao pendente (P24).';
comment on column public.regulatory_source_artifacts.document_hash is
  'SHA-256 canonico em MINUSCULAS. O CHECK usa [a-f0-9] e rejeita maiusculas. '
  'Normalize com lower(...) ANTES do insert.';

-- -----------------------------------------------------------------------------
-- 3. regulatory_source_artifact_validations  -  EVENTOS de validacao
-- -----------------------------------------------------------------------------
-- Append-only. O status corrente e o evento TERMINAL da cadeia explicita: o
-- evento para o qual nao existe sucessora apontando para seu id. validated_at
-- registra quando a validacao ocorreu e NAO determina a ordem de correcao.
-- Nao ha coluna de status corrente em lugar nenhum.
--
-- Um artefato sem nenhum evento esta "nao validado" - por ausencia, nao por
-- valor gravado. Validar depois e apenas INSERIR um evento: nao ha UPDATE
-- destrutivo e nao ha colisao com unique (act_id, document_hash), que continua
-- valendo apenas para o ARQUIVO.
-- -----------------------------------------------------------------------------
create table public.regulatory_source_artifact_validations (
  id                        uuid        primary key default gen_random_uuid(),
  artifact_id               uuid        not null,
  supersedes_validation_id  uuid        null,
  status                    text        not null,
  method                    text        not null,
  validated_at              timestamptz not null default now(),
  validated_by              uuid        null,
  validated_by_process      text        null,
  notes                     text        null,
  retention_policy          text        not null default 'pending_legal_definition',
  created_at                timestamptz not null default now(),

  constraint regulatory_source_artifact_validations_status_valid
    check (status in ('validated','rejected','inconclusive')),
  constraint regulatory_source_artifact_validations_method_valid
    check (method in ('marker_check','manual_review','checksum_compare',
                      'official_publication')),
  -- Exatamente um autor: pessoa OU processo/sistema identificado.
  constraint regulatory_source_artifact_validations_single_actor
    check (num_nonnulls(validated_by, validated_by_process) = 1),
  constraint regulatory_source_artifact_validations_process_not_blank
    check (validated_by_process is null or length(btrim(validated_by_process)) > 0),
  -- Revisao manual exige pessoa, nao processo.
  constraint regulatory_source_artifact_validations_manual_needs_person
    check (method <> 'manual_review' or validated_by is not null),
  constraint regulatory_source_artifact_validations_not_self_superseding
    check (supersedes_validation_id is null or supersedes_validation_id <> id),
  constraint regulatory_source_artifact_validations_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  -- Alvo da FK composta da cadeia.
  constraint regulatory_source_artifact_validations_id_artifact_unique
    unique (id, artifact_id)
);

alter table public.regulatory_source_artifact_validations
  add constraint regulatory_source_artifact_validations_artifact_fk
  foreign key (artifact_id) references public.regulatory_source_artifacts(id) on delete restrict;

alter table public.regulatory_source_artifact_validations
  add constraint regulatory_source_artifact_validations_validated_by_fk
  foreign key (validated_by) references auth.users(id) on delete restrict;

-- CADEIA: a validacao superada pertence ao MESMO artefato (FK composta).
alter table public.regulatory_source_artifact_validations
  add constraint regulatory_source_artifact_validations_supersedes_same_artifact_fk
  foreign key (supersedes_validation_id, artifact_id)
  references public.regulatory_source_artifact_validations (id, artifact_id)
  on delete restrict;

create index regulatory_source_artifact_validations_artifact_idx
  on public.regulatory_source_artifact_validations (artifact_id);
create index regulatory_source_artifact_validations_status_idx
  on public.regulatory_source_artifact_validations (status);
create index regulatory_source_artifact_validations_validated_by_idx
  on public.regulatory_source_artifact_validations (validated_by);

-- UMA UNICA RAIZ por artefato: no maximo uma validacao sem antecessora.
create unique index regulatory_source_artifact_validations_single_root
  on public.regulatory_source_artifact_validations (artifact_id)
  where supersedes_validation_id is null;

-- UMA UNICA SUCESSORA DIRETA: nenhuma validacao pode ser corrigida por duas.
create unique index regulatory_source_artifact_validations_single_successor
  on public.regulatory_source_artifact_validations (supersedes_validation_id)
  where supersedes_validation_id is not null;

create trigger regulatory_source_artifact_validations_no_mutation
  before update or delete on public.regulatory_source_artifact_validations
  for each row execute function public.regulatory_block_mutation();

comment on table public.regulatory_source_artifact_validations is
  'Eventos de validacao de um artefato documental. Append-only, em CADEIA EXPLICITA. '
  'Artefato sem evento = nao validado, por ausencia. O status CORRENTE e o evento '
  'TERMINAL - o unico sem sucessora - e NAO depende de comparar validated_at: '
  'validated_at diz QUANDO a validacao ocorreu, e pode ser historico; nao define '
  'qual evento corrige qual. A ordem vem de supersedes_validation_id. '
  'Tres garantias estruturais, sem UPDATE: FK composta (a antecessora e do mesmo '
  'artefato), indice unico parcial de RAIZ UNICA por artefato, e indice unico parcial '
  'de SUCESSORA UNICA (sem ramificacao). Consulta do corrente: o evento do artefato '
  'para o qual nao exista outro com supersedes_validation_id apontando para ele.';
comment on column public.regulatory_source_artifact_validations.validated_at is
  'Quando a validacao ocorreu. NAO define ordem de correcao - pode ser data historica. '
  'A ordem e dada exclusivamente pela cadeia supersedes_validation_id.';
comment on column public.regulatory_source_artifact_validations.validated_by_process is
  'Identificacao do processo ou sistema quando nao houver pessoa. CHECK exige '
  'exatamente um autor: validated_by OU validated_by_process.';

-- -----------------------------------------------------------------------------
-- 4. regulatory_rule_sets  -  conjuntos de regras versionados
-- -----------------------------------------------------------------------------
create table public.regulatory_rule_sets (
  id                uuid        primary key default gen_random_uuid(),
  rule_version      text        not null,
  scope             text        not null,
  description       text        null,
  status            text        not null default 'draft',
  effective_from    timestamptz null,
  effective_to      timestamptz null,
  parameters        jsonb       null,
  retention_policy  text        not null default 'pending_legal_definition',
  created_at        timestamptz not null default now(),
  created_by        uuid        null,

  constraint regulatory_rule_sets_version_not_blank check (length(btrim(rule_version)) > 0),
  constraint regulatory_rule_sets_scope_valid
    check (scope in ('operation_type','floor_applicability','evidence_composition',
                     'publication_gate','legacy_backfill','other')),
  constraint regulatory_rule_sets_status_valid check (status in ('draft','active','retired')),
  constraint regulatory_rule_sets_parameters_is_object
    check (parameters is null or jsonb_typeof(parameters) = 'object'),
  constraint regulatory_rule_sets_period_valid
    check (effective_to is null or effective_from is null or effective_to > effective_from),
  constraint regulatory_rule_sets_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  constraint regulatory_rule_sets_version_scope_unique unique (scope, rule_version),
  constraint regulatory_rule_sets_id_version_unique    unique (id, rule_version)
);

alter table public.regulatory_rule_sets
  add constraint regulatory_rule_sets_created_by_fk
  foreign key (created_by) references auth.users(id) on delete restrict;

create index regulatory_rule_sets_status_idx on public.regulatory_rule_sets (status);
create index regulatory_rule_sets_effective_idx on public.regulatory_rule_sets (effective_from, effective_to);
create index regulatory_rule_sets_created_by_idx on public.regulatory_rule_sets (created_by);

comment on table public.regulatory_rule_sets is
  'Conjuntos de regras versionados. Escrita fechada. NAO e append-only: status percorre '
  'draft -> active -> retired. parameters e nullable e sem default: null = nao informado, '
  '''{}'' = declaracao afirmativa de que nao ha parametros.';

-- -----------------------------------------------------------------------------
-- 5. regulatory_rule_set_acts  -  quais ATOS um rule set cita
-- -----------------------------------------------------------------------------
create table public.regulatory_rule_set_acts (
  rule_set_id       uuid        not null,
  act_id            uuid        not null,
  citation_context  text        null,
  notes             text        null,
  created_at        timestamptz not null default now(),

  constraint regulatory_rule_set_acts_pkey primary key (rule_set_id, act_id)
);

alter table public.regulatory_rule_set_acts
  add constraint regulatory_rule_set_acts_rule_set_fk
  foreign key (rule_set_id) references public.regulatory_rule_sets(id) on delete restrict;

alter table public.regulatory_rule_set_acts
  add constraint regulatory_rule_set_acts_act_fk
  foreign key (act_id) references public.regulatory_acts(id) on delete restrict;

create index regulatory_rule_set_acts_act_idx on public.regulatory_rule_set_acts (act_id);

comment on table public.regulatory_rule_set_acts is
  'Quais atos normativos um conjunto de regras cita. citation_context registra o '
  'dispositivo (ex.: art. 2, XVIII). Citar o ato NAO exige citar arquivo: os arquivos '
  'especificos, quando houver, ficam em regulatory_rule_set_artifacts.';

-- -----------------------------------------------------------------------------
-- 6. regulatory_rule_set_artifacts  -  quais ARQUIVOS daquele ato o rule set cita
-- -----------------------------------------------------------------------------
-- Tabela propria porque um ato pode ter PDF, HTML, DOU e binario ao mesmo tempo,
-- e o rule set precisa poder citar MAIS DE UM deles. A PK anterior
-- (rule_set_id, act_id) permitia apenas um artefato por ato por rule set.
--
-- Duas FKs COMPOSTAS garantem, sem trigger:
--   (rule_set_id, act_id) -> o ato esta de fato citado por este rule set;
--   (artifact_id, act_id) -> o artefato pertence aquele mesmo ato.
-- -----------------------------------------------------------------------------
create table public.regulatory_rule_set_artifacts (
  rule_set_id  uuid        not null,
  act_id       uuid        not null,
  artifact_id  uuid        not null,
  notes        text        null,
  created_at   timestamptz not null default now(),

  constraint regulatory_rule_set_artifacts_pkey primary key (rule_set_id, artifact_id)
);

alter table public.regulatory_rule_set_artifacts
  add constraint regulatory_rule_set_artifacts_act_cited_fk
  foreign key (rule_set_id, act_id)
  references public.regulatory_rule_set_acts (rule_set_id, act_id) on delete restrict;

alter table public.regulatory_rule_set_artifacts
  add constraint regulatory_rule_set_artifacts_belongs_to_act_fk
  foreign key (artifact_id, act_id)
  references public.regulatory_source_artifacts (id, act_id) on delete restrict;

create index regulatory_rule_set_artifacts_artifact_idx on public.regulatory_rule_set_artifacts (artifact_id);
create index regulatory_rule_set_artifacts_act_idx on public.regulatory_rule_set_artifacts (rule_set_id, act_id);

comment on table public.regulatory_rule_set_artifacts is
  'Quais ARQUIVOS de um ato citado um conjunto de regras usa. PK (rule_set_id, '
  'artifact_id) permite citar varios artefatos do mesmo ato - PDF, HTML e DOU '
  'simultaneamente. As duas FKs compostas garantem que o ato esta citado pelo rule set '
  'e que o artefato pertence aquele ato.';

-- -----------------------------------------------------------------------------
-- 7. transport_operations  -  a unidade regulatoria
-- -----------------------------------------------------------------------------
-- MUTAVEL: estado corrente, nao trilha. Escrita fechada neste lote.
--
-- NAO e extensao do marketplace. A proveniencia e EXCLUSIVA: cada origin_kind
-- admite exatamente o seu conjunto de campos, e nenhum outro. Nao ha linha com
-- dois canais de origem.
--
-- Campos geograficos e jsonb sao NULLABLE e SEM default. null = nao informado.
-- -----------------------------------------------------------------------------
create table public.transport_operations (
  id                          uuid        primary key default gen_random_uuid(),

  origin_kind                 text        not null,
  freight_id                  uuid        null,
  external_system             text        null,
  external_reference          text        null,
  registered_by               uuid        null,
  registration_note           text        null,

  contract_id                 uuid        null,
  shipper_company_id          uuid        not null,
  carrier_company_id          uuid        null,
  driver_id                   uuid        null,
  truck_id                    uuid        null,

  operation_state             text        not null default 'created',
  operation_type              text        null,
  floor_applicability         text        null,
  operation_type_rule_version text        null,
  classification_version      integer     null,

  planned_start_at            timestamptz null,
  planned_end_at              timestamptz null,
  actual_start_at             timestamptz null,
  actual_end_at               timestamptz null,

  origin_location             jsonb       null,
  destination_location        jsonb       null,
  location_specificity        jsonb       null,
  intermediate_points         jsonb       null,

  retention_policy            text        not null default 'pending_legal_definition',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint transport_operations_origin_kind_valid
    check (origin_kind in ('marketplace','external_import','partner','manual')),

  -- MATRIZ DE PROVENIENCIA EXCLUSIVA. Cada origem admite exatamente os seus
  -- campos; os demais tem de ser nulos. Nao ha marketplace com external_reference,
  -- nem manual com freight_id, nem external_import com freight_id.
  constraint transport_operations_origin_matrix check (
    case origin_kind
      when 'marketplace' then
             freight_id is not null
         and external_system is null and external_reference is null
         and registered_by is null and registration_note is null
      when 'external_import' then
             freight_id is null
         and external_system is not null and length(btrim(external_system)) > 0
         and external_reference is not null and length(btrim(external_reference)) > 0
         and registered_by is null and registration_note is null
      when 'partner' then
             freight_id is null
         and external_system is not null and length(btrim(external_system)) > 0
         and external_reference is not null and length(btrim(external_reference)) > 0
         and registered_by is null and registration_note is null
      when 'manual' then
             freight_id is null
         and external_system is null and external_reference is null
         and registered_by is not null
         and registration_note is not null and length(btrim(registration_note)) > 0
      else false
    end
  ),

  constraint transport_operations_state_valid
    check (operation_state in (
      'created','classified','ready_for_ciot','blocked','cancelled',
      'in_execution','completed',
      'ciot_pending','ciot_issued','external_rejected'   -- reservados para L5
    )),

  constraint transport_operations_operation_type_valid
    check (operation_type is null
           or operation_type in ('lotacao','fracionada','tac_agregado')),
  constraint transport_operations_floor_applicability_valid
    check (floor_applicability is null
           or floor_applicability in ('applicable','not_applicable','pending_evaluation')),
  constraint transport_operations_classification_version_coherent
    check ((classification_version is null)
           = (operation_type is null and floor_applicability is null)),
  constraint transport_operations_classification_version_positive
    check (classification_version is null or classification_version > 0),

  constraint transport_operations_planned_period_valid
    check (planned_end_at is null or planned_start_at is null
           or planned_end_at >= planned_start_at),
  constraint transport_operations_actual_period_valid
    check (actual_end_at is null or actual_start_at is null
           or actual_end_at >= actual_start_at),

  constraint transport_operations_origin_is_object
    check (origin_location is null or jsonb_typeof(origin_location) = 'object'),
  constraint transport_operations_destination_is_object
    check (destination_location is null or jsonb_typeof(destination_location) = 'object'),
  constraint transport_operations_specificity_is_object
    check (location_specificity is null or jsonb_typeof(location_specificity) = 'object'),
  constraint transport_operations_intermediate_points_is_array
    check (intermediate_points is null or jsonb_typeof(intermediate_points) = 'array'),

  constraint transport_operations_retention_pending
    check (retention_policy = 'pending_legal_definition')
);

-- FKs para tabelas EXISTENTES apenas. Nenhuma FK para tabela futura.
alter table public.transport_operations
  add constraint transport_operations_freight_fk
  foreign key (freight_id) references public.freights(id) on delete restrict;

alter table public.transport_operations
  add constraint transport_operations_contract_fk
  foreign key (contract_id) references public.contracts(id) on delete set null;

alter table public.transport_operations
  add constraint transport_operations_shipper_company_fk
  foreign key (shipper_company_id) references public.companies(id) on delete restrict;

alter table public.transport_operations
  add constraint transport_operations_carrier_company_fk
  foreign key (carrier_company_id) references public.companies(id) on delete restrict;

alter table public.transport_operations
  add constraint transport_operations_driver_fk
  foreign key (driver_id) references public.drivers(id) on delete restrict;

alter table public.transport_operations
  add constraint transport_operations_truck_fk
  foreign key (truck_id) references public.trucks(id) on delete restrict;

-- RESTRICT, nao SET NULL: origin_kind='manual' EXIGE registered_by not null.
-- Um SET NULL tentaria violar o proprio CHECK da matriz de proveniencia.
alter table public.transport_operations
  add constraint transport_operations_registered_by_fk
  foreign key (registered_by) references auth.users(id) on delete restrict;

create index transport_operations_origin_kind_idx on public.transport_operations (origin_kind);
create index transport_operations_freight_idx on public.transport_operations (freight_id);
create index transport_operations_contract_idx on public.transport_operations (contract_id);
create index transport_operations_shipper_idx on public.transport_operations (shipper_company_id);
create index transport_operations_carrier_idx on public.transport_operations (carrier_company_id);
create index transport_operations_driver_idx on public.transport_operations (driver_id);
create index transport_operations_truck_idx on public.transport_operations (truck_id);
create index transport_operations_registered_by_idx on public.transport_operations (registered_by);
create index transport_operations_state_idx on public.transport_operations (operation_state);
create index transport_operations_operation_type_idx on public.transport_operations (operation_type);
create index transport_operations_floor_applicability_idx on public.transport_operations (floor_applicability);
create index transport_operations_planned_start_idx on public.transport_operations (planned_start_at);
create index transport_operations_planned_end_idx on public.transport_operations (planned_end_at);

create unique index transport_operations_external_ref_unique
  on public.transport_operations (external_system, external_reference)
  where external_system is not null and external_reference is not null;

create trigger transport_operations_set_updated_at
  before update on public.transport_operations
  for each row execute function public.set_updated_at();

comment on table public.transport_operations is
  'Unidade regulatoria da operacao de transporte. Estado corrente (mutavel), nao trilha. '
  'NAO e extensao do marketplace: freight_id e nullable e a operacao pode ser importada '
  'de TMS/ERP, recebida de parceiro ou registrada manualmente. Escrita fechada neste '
  'lote: sem policy e sem grant. Retencao pendente (P24).';
comment on constraint transport_operations_origin_matrix on public.transport_operations is
  'Matriz de proveniencia EXCLUSIVA. marketplace: so freight_id. external_import e '
  'partner: so external_system + external_reference. manual: so registered_by + '
  'registration_note. Nenhuma linha mistura dois canais de origem. Havendo necessidade '
  'futura de proveniencia adicional, modelar tabela propria de referencias secundarias '
  '- nao relaxar esta matriz.';
comment on column public.transport_operations.external_reference is
  'Referencia TECNICA do sistema de origem (TMS, ERP, parceiro), para reconciliacao de '
  'importacao. NAO e o identificador oficial da operacao para fins de CIOT: T4 continua '
  'aberta com as IPEFs e nenhum campo de identificacao CIOT e criado aqui.';
comment on column public.transport_operations.operation_type is
  'Classificacao operacional (Portaria SUROC 6/2026, art. 7, red. 16/2026). Sem default: '
  'null = ainda nao classificado. NAO confundir com floor_applicability.';
comment on column public.transport_operations.floor_applicability is
  'Aplicabilidade do piso minimo. Campo SEPARADO de operation_type. Art. 15 da Portaria '
  'SUROC 6/2026 (red. 16/2026): contratante unico, isoladamente, nao caracteriza carga '
  'lotacao para aplicacao da PNPM-TRC. Sem default. A igualdade entre este valor e o '
  'produzido pela avaliacao apontada em floor_applicability_assessment_id NAO e garantida '
  'por constraint: depende da RPC futura. Neste lote nao ha escrita direta possivel.';
comment on column public.transport_operations.driver_id is
  'Aponta para public.drivers(id) - PK propria, cuja coluna profile_id referencia '
  'public.profiles(id), que referencia auth.users(id). Escolha alinhada a tabela '
  'regulatoria mais recente (driver_verifications, 20260827150000) e aos dados de '
  'habilitacao exigidos pelos requisitos. As tabelas de 2026-05 usam auth.users(id) - '
  'divergencia registrada, nao corrigida.';
comment on column public.transport_operations.intermediate_points is
  'null = nao informado. ''[]'' = declaracao AFIRMATIVA de que nao existem pontos '
  'intermediarios. Sem default, para nao transformar ausencia em conclusao.';
comment on column public.transport_operations.classification_version is
  'Nullable enquanto nao houver classificacao. CHECK garante que existe se e somente se '
  'operation_type ou floor_applicability estiver preenchido.';
comment on column public.transport_operations.contract_id is
  'Nullable por decisao de projeto: contracts esta em estado conflitante e NAO pode ser '
  'alterado neste lote. Unico ON DELETE SET NULL do lote: nenhum CHECK depende dele, a '
  'tabela e mutavel, e o vinculo comercial nao e evidencia regulatoria.';

-- =============================================================================
-- RLS - leitura somente. Nenhuma policy de INSERT/UPDATE/DELETE.
-- =============================================================================

alter table public.regulatory_acts                         enable row level security;
alter table public.regulatory_source_artifacts             enable row level security;
alter table public.regulatory_source_artifact_validations  enable row level security;
alter table public.regulatory_rule_sets                    enable row level security;
alter table public.regulatory_rule_set_acts                enable row level security;
alter table public.regulatory_rule_set_artifacts           enable row level security;
alter table public.transport_operations                    enable row level security;

create policy regulatory_acts_select_admin
  on public.regulatory_acts for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_source_artifacts_select_admin
  on public.regulatory_source_artifacts for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_source_artifact_validations_select_admin
  on public.regulatory_source_artifact_validations for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_rule_sets_select_admin
  on public.regulatory_rule_sets for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_rule_set_acts_select_admin
  on public.regulatory_rule_set_acts for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_rule_set_artifacts_select_admin
  on public.regulatory_rule_set_artifacts for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- Operacao: partes (embarcador e transportadora) e admin. Motorista sem policy.
create policy transport_operations_select_parties
  on public.transport_operations for select to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.is_current_user_company_member(shipper_company_id)
    or public.is_current_user_company_owner(shipper_company_id)
    or (carrier_company_id is not null
        and (public.is_current_user_company_member(carrier_company_id)
             or public.is_current_user_company_owner(carrier_company_id)))
  );

-- =============================================================================
-- GRANTS - escrita revogada.
-- =============================================================================

revoke all on public.regulatory_acts                        from anon, authenticated;
revoke all on public.regulatory_source_artifacts            from anon, authenticated;
revoke all on public.regulatory_source_artifact_validations from anon, authenticated;
revoke all on public.regulatory_rule_sets                   from anon, authenticated;
revoke all on public.regulatory_rule_set_acts               from anon, authenticated;
revoke all on public.regulatory_rule_set_artifacts          from anon, authenticated;
revoke all on public.transport_operations                   from anon, authenticated;

grant select on public.regulatory_acts                        to authenticated;
grant select on public.regulatory_source_artifacts            to authenticated;
grant select on public.regulatory_source_artifact_validations to authenticated;
grant select on public.regulatory_rule_sets                   to authenticated;
grant select on public.regulatory_rule_set_acts               to authenticated;
grant select on public.regulatory_rule_set_artifacts          to authenticated;
grant select on public.transport_operations                   to authenticated;

commit;
