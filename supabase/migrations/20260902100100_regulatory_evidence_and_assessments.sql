-- =============================================================================
-- SteelGo | L1 - Fundacao Regulatoria (2/2): evidencias e avaliacoes
-- =============================================================================
-- Depende de 20260902100000_regulatory_foundation_tables.sql, que ja criou a
-- funcao public.regulatory_block_mutation().
--
-- ESCOPO: somente L1. NAO cria offer_version_id nem FK para tabela futura.
-- NAO cria tabelas de coeficientes nem insere coeficiente algum.
-- NAO cria identificador de CIOT. Sem CREATE ... IF NOT EXISTS.
--
-- PRINCIPIOS APLICADOS NESTA REVISAO:
--   * jsonb nullable e sem default: null = nao informado / nao avaliado;
--     '{}' e '[]' = declaracao afirmativa de vazio.
--   * Nenhum estado que exija mutacao proibida em tabela append-only.
--     Supersessao de evidencia e DERIVADA, nao gravada na linha superada.
--   * Nenhum ON DELETE SET NULL em tabela append-only: a atualizacao em cascata
--     bateria no trigger e levantaria 42501. Autoria e sempre RESTRICT.
--
-- INTEGRIDADE ESTRUTURAL DA TRILHA (sem trigger e sem RPC):
--   transport_operations --(assessment_id, id)--> assessments (id, operation_id)
--   assessments          <--(assessment_id, operation_id)-- findings
--   findings + evidence  <--(id, operation_id)-- finding_evidence
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 8. regulatory_requirement_evidence  -  FATOS observados (R1..R11)
-- -----------------------------------------------------------------------------
-- Append-only. Correcao por nova linha com supersedes_evidence_id.
--
-- NAO existe status 'superseded': a linha superada e imutavel e nao poderia
-- receber UPDATE. A supersessao e DERIVADA - existe outra linha apontando para
-- esta em supersedes_evidence_id.
-- -----------------------------------------------------------------------------
create table public.regulatory_requirement_evidence (
  id                        uuid        primary key default gen_random_uuid(),
  transport_operation_id    uuid        not null,
  requirement_code          text        not null,
  evidence_type             text        not null,
  evidence_strength         text        not null,
  source                    text        not null,
  observed_value            jsonb       null,
  document_ref              text        null,
  document_hash             text        null,
  valid_from                timestamptz null,
  valid_to                  timestamptz null,
  collected_at              timestamptz not null default now(),
  collected_by              uuid        null,
  resolves_divergence_of_id uuid        null,
  divergence_flag           boolean     not null default false,
  divergence_note           text        null,
  supersedes_evidence_id    uuid        null,
  contains_personal_data    boolean     not null default false,
  retention_policy          text        not null default 'pending_legal_definition',
  created_at                timestamptz not null default now(),

  constraint regulatory_requirement_evidence_requirement_valid
    check (requirement_code in ('R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11')),
  constraint regulatory_requirement_evidence_type_valid
    check (evidence_type in ('contract_clause','document_key','document_count',
                             'field_declaration','lookup_result',
                             'computed_observation','human_statement')),
  -- Exatamente as 4 classes de forca da matriz. NAO existe classe
  -- "prova suficiente": o conjunto minimo que produz true segue indefinido (P25).
  constraint regulatory_requirement_evidence_strength_valid
    check (evidence_strength in ('declaratory','documentary_strong',
                                 'internal_indication','composite')),
  constraint regulatory_requirement_evidence_source_valid
    check (source in ('shipper_declaration','carrier_declaration','contract',
                      'fiscal_document','mdfe','cte','rntrc_lookup',
                      'platform_internal','external_provider','human_review')),
  -- null = nao informado; '{}' = declaracao afirmativa de que nao ha valor observado.
  constraint regulatory_requirement_evidence_observed_is_object
    check (observed_value is null or jsonb_typeof(observed_value) = 'object'),
  constraint regulatory_requirement_evidence_hash_lowercase_sha256
    check (document_hash is null or document_hash ~ '^[a-f0-9]{64}$'),
  constraint regulatory_requirement_evidence_period_valid
    check (valid_to is null or valid_from is null or valid_to > valid_from),
  constraint regulatory_requirement_evidence_reconciliation_is_human_review
    check (resolves_divergence_of_id is null
           or (source = 'human_review' and evidence_type = 'human_statement')),
  constraint regulatory_requirement_evidence_not_self_superseding
    check (supersedes_evidence_id is null or supersedes_evidence_id <> id),
  constraint regulatory_requirement_evidence_not_self_resolving
    check (resolves_divergence_of_id is null or resolves_divergence_of_id <> id),
  constraint regulatory_requirement_evidence_divergence_note_requires_flag
    check (divergence_note is null or divergence_flag),
  constraint regulatory_requirement_evidence_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  constraint regulatory_requirement_evidence_id_operation_unique
    unique (id, transport_operation_id)
);

alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_operation_fk
  foreign key (transport_operation_id) references public.transport_operations(id)
  on delete restrict;

-- RESTRICT em toda autoria: a tabela e append-only e um SET NULL em cascata
-- bateria no trigger (42501). A autoria da coleta e proveniencia da evidencia e
-- nao pode ser apagada.
alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_collected_by_fk
  foreign key (collected_by) references auth.users(id) on delete restrict;


alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_supersedes_same_operation_fk
  foreign key (supersedes_evidence_id, transport_operation_id)
  references public.regulatory_requirement_evidence (id, transport_operation_id)
  on delete restrict;

alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_resolves_same_operation_fk
  foreign key (resolves_divergence_of_id, transport_operation_id)
  references public.regulatory_requirement_evidence (id, transport_operation_id)
  on delete restrict;

create index regulatory_requirement_evidence_operation_idx
  on public.regulatory_requirement_evidence (transport_operation_id);
create index regulatory_requirement_evidence_requirement_idx
  on public.regulatory_requirement_evidence (transport_operation_id, requirement_code);
create index regulatory_requirement_evidence_collected_idx
  on public.regulatory_requirement_evidence (collected_at);
create index regulatory_requirement_evidence_collected_by_idx
  on public.regulatory_requirement_evidence (collected_by);
create index regulatory_requirement_evidence_divergence_idx
  on public.regulatory_requirement_evidence (transport_operation_id)
  where divergence_flag;
-- Indice que sustenta a derivacao da supersessao.
create index regulatory_requirement_evidence_supersedes_idx
  on public.regulatory_requirement_evidence (supersedes_evidence_id);
create index regulatory_requirement_evidence_resolves_idx
  on public.regulatory_requirement_evidence (resolves_divergence_of_id);

create trigger regulatory_requirement_evidence_no_mutation
  before update or delete on public.regulatory_requirement_evidence
  for each row execute function public.regulatory_block_mutation();

-- -----------------------------------------------------------------------------
-- 9. regulatory_requirement_evidence_verifications  -  EVENTOS de verificacao
-- -----------------------------------------------------------------------------
-- Append-only, em CADEIA EXPLICITA. Existe porque verification_status dentro da
-- linha imutavel era estado mutavel em tabela append-only: uma evidencia coletada
-- como unverified nunca poderia virar verified sem duplicar todo o fato e fingir
-- que o fato mudou.
--
-- VERIFICAR o fato e evento DIFERENTE de CORRIGIR o fato:
--   supersedes_evidence_id      -> corrige/substitui o FATO OBSERVADO
--   supersedes_verification_id  -> corrige/substitui a CONCLUSAO sobre a
--                                  verificacao daquele fato
--
-- Evidencia sem evento = unverified, por ausencia. Status corrente = evento
-- TERMINAL, o unico sem sucessora. Nao depende de comparar verified_at.
-- -----------------------------------------------------------------------------
create table public.regulatory_requirement_evidence_verifications (
  id                          uuid        primary key default gen_random_uuid(),
  evidence_id                 uuid        not null,
  supersedes_verification_id  uuid        null,
  status                      text        not null,
  method                      text        not null,
  verified_at                 timestamptz not null default now(),
  verified_by                 uuid        null,
  verified_by_process         text        null,
  notes                       text        null,
  retention_policy            text        not null default 'pending_legal_definition',
  created_at                  timestamptz not null default now(),

  constraint regulatory_requirement_evidence_verifications_status_valid
    check (status in ('verified','failed','inconclusive')),
  constraint regulatory_requirement_evidence_verifications_method_valid
    check (method in ('document_check','provider_lookup','cross_reference',
                      'system_rule','human_review')),
  -- Exatamente um autor: pessoa OU processo/sistema identificado.
  constraint regulatory_requirement_evidence_verifications_single_actor
    check (num_nonnulls(verified_by, verified_by_process) = 1),
  constraint regulatory_requirement_evidence_verifications_process_not_blank
    check (verified_by_process is null or length(btrim(verified_by_process)) > 0),
  -- Revisao humana exige pessoa, nao processo.
  constraint regulatory_requirement_evidence_verifications_human_needs_person
    check (method <> 'human_review' or verified_by is not null),
  constraint regulatory_requirement_evidence_verifications_not_self_superseding
    check (supersedes_verification_id is null or supersedes_verification_id <> id),
  constraint regulatory_requirement_evidence_verifications_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  -- Alvo da FK composta da cadeia.
  constraint regulatory_requirement_evidence_verifications_id_evidence_unique
    unique (id, evidence_id)
);

alter table public.regulatory_requirement_evidence_verifications
  add constraint regulatory_requirement_evidence_verifications_evidence_fk
  foreign key (evidence_id) references public.regulatory_requirement_evidence(id)
  on delete restrict;

alter table public.regulatory_requirement_evidence_verifications
  add constraint regulatory_requirement_evidence_verifications_verified_by_fk
  foreign key (verified_by) references auth.users(id) on delete restrict;

-- CADEIA: a verificacao superada pertence a MESMA evidencia (FK composta).
alter table public.regulatory_requirement_evidence_verifications
  add constraint regulatory_requirement_evidence_verifications_supersedes_same_evidence_fk
  foreign key (supersedes_verification_id, evidence_id)
  references public.regulatory_requirement_evidence_verifications (id, evidence_id)
  on delete restrict;

create index regulatory_requirement_evidence_verifications_evidence_idx
  on public.regulatory_requirement_evidence_verifications (evidence_id);
create index regulatory_requirement_evidence_verifications_status_idx
  on public.regulatory_requirement_evidence_verifications (status);
create index regulatory_requirement_evidence_verifications_verified_by_idx
  on public.regulatory_requirement_evidence_verifications (verified_by);

-- UMA UNICA RAIZ por evidencia.
create unique index regulatory_requirement_evidence_verifications_single_root
  on public.regulatory_requirement_evidence_verifications (evidence_id)
  where supersedes_verification_id is null;

-- UMA UNICA SUCESSORA DIRETA: sem ramificacao.
create unique index regulatory_requirement_evidence_verifications_single_successor
  on public.regulatory_requirement_evidence_verifications (supersedes_verification_id)
  where supersedes_verification_id is not null;

create trigger regulatory_requirement_evidence_verifications_no_mutation
  before update or delete on public.regulatory_requirement_evidence_verifications
  for each row execute function public.regulatory_block_mutation();

comment on table public.regulatory_requirement_evidence_verifications is
  'Eventos de verificacao de uma evidencia. Append-only, em CADEIA EXPLICITA. '
  'Existe porque status de verificacao dentro da linha imutavel era estado mutavel em '
  'tabela append-only - a evidencia nunca sairia de unverified sem duplicar o fato. '
  'VERIFICAR o fato e evento DIFERENTE de CORRIGIR o fato: supersedes_evidence_id '
  'substitui o FATO; supersedes_verification_id substitui a CONCLUSAO sobre a '
  'verificacao. Evidencia sem evento = unverified, por ausencia. Status corrente = '
  'evento TERMINAL, o unico sem sucessora - nao depende de comparar verified_at. '
  'Tres garantias estruturais, sem UPDATE: FK composta (antecessora da mesma evidencia), '
  'raiz unica por evidencia e sucessora unica (sem ramificacao).';
comment on column public.regulatory_requirement_evidence_verifications.verified_at is
  'Quando a verificacao ocorreu. NAO define ordem de correcao - pode ser data historica. '
  'A ordem e dada exclusivamente pela cadeia supersedes_verification_id.';
comment on column public.regulatory_requirement_evidence_verifications.verified_by_process is
  'Identificacao do processo ou sistema quando nao houver pessoa. CHECK exige exatamente '
  'um autor: verified_by OU verified_by_process.';

comment on table public.regulatory_requirement_evidence is
  'Fatos observados para R1..R11. Grava evidencia, NUNCA conclusao. Append-only. '
  'SUPERSESSAO E DERIVADA, nao gravada: uma evidencia esta superada quando EXISTE outra '
  'linha com supersedes_evidence_id apontando para ela. Nao ha status superseded, porque '
  'grava-lo exigiria UPDATE na linha superada - proibido. A linha anterior permanece '
  'imutavel e integra. '
  'A VERIFICACAO tambem nao vive aqui: verificar um fato e evento distinto de corrigir o '
  'fato, e fica em regulatory_requirement_evidence_verifications. Evidencia sem evento '
  'de verificacao = unverified, por ausencia. '
  'observed_value guarda dado MASCARADO ou TOKENIZADO: nunca CPF, CNH, CNPJ ou placa em '
  'claro, nunca payload bruto de provedor, nunca segredo. Documentos por referencia e '
  'hash, nunca por conteudo. Retencao pendente (P24).';
comment on column public.regulatory_requirement_evidence.observed_value is
  'Nullable e sem default. null = nao informado; ''{}'' = declaracao afirmativa de que '
  'nao ha valor observado. Um default ''{}'' apagaria essa distincao.';
comment on column public.regulatory_requirement_evidence.supersedes_evidence_id is
  'Corrige/substitui o FATO OBSERVADO. NAO confundir com supersedes_verification_id de '
  'regulatory_requirement_evidence_verifications, que corrige/substitui a CONCLUSAO '
  'sobre a verificacao daquele fato. Sao eventos diferentes e cadeias diferentes. '
  'Consulta do fato vigente: not exists (select 1 from '
  'regulatory_requirement_evidence s where s.supersedes_evidence_id = e.id).';
comment on column public.regulatory_requirement_evidence.resolves_divergence_of_id is
  'Reconciliacao e um ATO de revisao humana: a linha que reconcilia e ela propria '
  'evidencia com source=human_review e evidence_type=human_statement (CHECK), e aponta '
  'para a evidencia divergente que resolve. A FK composta impede reconciliar evidencia '
  'de outra operacao.';
comment on column public.regulatory_requirement_evidence.transport_operation_id is
  'NOT NULL em L1 por ser o unico sujeito possivel. L2a acrescenta offer_version_id, '
  'relaxa este NOT NULL e adiciona CHECK num_nonnulls(...) = 1 na mesma migration.';

-- -----------------------------------------------------------------------------
-- 10. regulatory_assessments  -  a DECISAO, datada e reproduzivel
-- -----------------------------------------------------------------------------
create table public.regulatory_assessments (
  id                           uuid        primary key default gen_random_uuid(),
  transport_operation_id       uuid        not null,
  stage                        text        not null,
  result                       text        not null,
  floor_applicability          text        null,
  operation_type_at_assessment text        null,
  rule_id                      uuid        not null,
  rule_version                 text        not null,
  inputs_snapshot              jsonb       null,
  pending_items                jsonb       null,
  blocking_reasons             jsonb       null,
  computed_floor_amount_raw    numeric     null,
  floor_currency               text        null,
  rounding_policy              text        not null default 'undefined',
  coefficient_table_version    text        null,
  assessment_snapshot          jsonb       null,
  decided_at                   timestamptz not null default now(),
  decided_by                   uuid        null,
  decision_mode                text        not null default 'system',
  retention_policy             text        not null default 'pending_legal_definition',
  created_at                   timestamptz not null default now(),

  constraint regulatory_assessments_stage_valid
    check (stage in ('preliminary','publication','ciot')),
  -- NENHUM valor significa compliant, approved ou valid.
  constraint regulatory_assessments_result_valid
    check (result in ('applicable','not_applicable','pending_evaluation',
                      'blocked_incomputable','legacy_unassessed')),
  constraint regulatory_assessments_floor_applicability_valid
    check (floor_applicability is null
           or floor_applicability in ('applicable','not_applicable','pending_evaluation')),
  constraint regulatory_assessments_operation_type_valid
    check (operation_type_at_assessment is null
           or operation_type_at_assessment in ('lotacao','fracionada','tac_agregado')),
  constraint regulatory_assessments_rule_version_not_blank
    check (length(btrim(rule_version)) > 0),
  -- jsonb nullable e sem default. null = nao informado / nao avaliado;
  -- '{}' e '[]' = declaracao afirmativa de vazio.
  constraint regulatory_assessments_inputs_is_object
    check (inputs_snapshot is null or jsonb_typeof(inputs_snapshot) = 'object'),
  constraint regulatory_assessments_snapshot_is_object
    check (assessment_snapshot is null or jsonb_typeof(assessment_snapshot) = 'object'),
  constraint regulatory_assessments_pending_is_array
    check (pending_items is null or jsonb_typeof(pending_items) = 'array'),
  constraint regulatory_assessments_blocking_is_array
    check (blocking_reasons is null or jsonb_typeof(blocking_reasons) = 'array'),
  constraint regulatory_assessments_currency_format
    check (floor_currency is null or floor_currency ~ '^[A-Z]{3}$'),
  constraint regulatory_assessments_floor_amount_non_negative
    check (computed_floor_amount_raw is null or computed_floor_amount_raw >= 0),
  -- P22/Q5: regra oficial de arredondamento DESCONHECIDA, nenhuma alternativa aprovada.
  constraint regulatory_assessments_rounding_undefined
    check (rounding_policy = 'undefined'),
  constraint regulatory_assessments_decision_mode_valid
    check (decision_mode in ('system','human','system_then_human')),
  constraint regulatory_assessments_retention_pending
    check (retention_policy = 'pending_legal_definition'),
  constraint regulatory_assessments_id_operation_unique
    unique (id, transport_operation_id)
);

alter table public.regulatory_assessments
  add constraint regulatory_assessments_operation_fk
  foreign key (transport_operation_id) references public.transport_operations(id)
  on delete restrict;

alter table public.regulatory_assessments
  add constraint regulatory_assessments_rule_version_matches_fk
  foreign key (rule_id, rule_version)
  references public.regulatory_rule_sets (id, rule_version) on delete restrict;

-- RESTRICT: tabela append-only; SET NULL bateria no trigger.
alter table public.regulatory_assessments
  add constraint regulatory_assessments_decided_by_fk
  foreign key (decided_by) references auth.users(id) on delete restrict;

create index regulatory_assessments_operation_idx on public.regulatory_assessments (transport_operation_id);
create index regulatory_assessments_stage_idx on public.regulatory_assessments (stage);
create index regulatory_assessments_result_idx on public.regulatory_assessments (result);
create index regulatory_assessments_floor_applicability_idx on public.regulatory_assessments (floor_applicability);
create index regulatory_assessments_decided_idx on public.regulatory_assessments (decided_at);
create index regulatory_assessments_decided_by_idx on public.regulatory_assessments (decided_by);
create index regulatory_assessments_rule_idx on public.regulatory_assessments (rule_id);

create trigger regulatory_assessments_no_mutation
  before update or delete on public.regulatory_assessments
  for each row execute function public.regulatory_block_mutation();

comment on table public.regulatory_assessments is
  'Decisao regulatoria datada e reproduzivel. Append-only. NENHUM valor de result '
  'significa compliant, approved ou valid: applicable diz que o piso incide, nao que o '
  'valor o respeita. rule_id e obrigatorio - avaliacao sem regra nao e reproduzivel; '
  'legacy_unassessed usa rule set explicito de backfill. Retencao pendente (P24).';
comment on column public.regulatory_assessments.rounding_policy is
  'Travado em undefined por CHECK. A regra oficial de arredondamento e DESCONHECIDA '
  '(P22/Q5) e nenhuma alternativa foi aprovada. Adotar politica exige alterar o CHECK.';
comment on column public.regulatory_assessments.computed_floor_amount_raw is
  'numeric SEM escala declarada: resultado em PRECISAO INTEGRAL, sem arredondar na '
  'gravacao. Nao usar numeric(_,2) - a escala 2 seria arredondamento pelo tipo, '
  'incompativel com rounding_policy = undefined e com o bloqueio P22. Nenhum campo em '
  'centavos existe nesta fase.';
comment on column public.regulatory_assessments.inputs_snapshot is
  'Nullable e sem default. null = nao informado; ''{}'' = declaracao afirmativa de que '
  'nao houve entrada. Vale igualmente para assessment_snapshot, pending_items e '
  'blocking_reasons: um default apagaria a distincao entre nao avaliado e vazio.';
comment on column public.regulatory_assessments.rule_version is
  'Redundante em relacao a rule_id por escolha, para snapshot legivel. A FK composta '
  '(rule_id, rule_version) garante que os dois descrevem o mesmo rule set.';
comment on column public.regulatory_assessments.coefficient_table_version is
  'Texto puro, sem FK: as tabelas de coeficientes sao L3 e nao existem neste lote.';

-- -----------------------------------------------------------------------------
-- 11. regulatory_assessment_findings  -  conclusao por requisito
-- -----------------------------------------------------------------------------
create table public.regulatory_assessment_findings (
  id                     uuid        primary key default gen_random_uuid(),
  assessment_id          uuid        not null,
  transport_operation_id uuid        not null,
  requirement_code       text        not null,
  state                  text        not null,
  rationale              text        null,
  insufficient_reason    text        null,
  requires_human_review  boolean     not null default false,
  created_at             timestamptz not null default now(),

  constraint regulatory_assessment_findings_requirement_valid
    check (requirement_code in ('R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11')),
  constraint regulatory_assessment_findings_state_valid
    check (state in ('true','false','unknown')),
  constraint regulatory_assessment_findings_insufficient_reason_valid
    check (insufficient_reason is null
           or insufficient_reason in ('no_evidence','contradictory','unreliable',
                                      'not_yet_available')),
  constraint regulatory_assessment_findings_reason_only_when_unknown
    check (insufficient_reason is null or state = 'unknown'),
  constraint regulatory_assessment_findings_unique
    unique (assessment_id, requirement_code),
  constraint regulatory_assessment_findings_id_operation_unique
    unique (id, transport_operation_id)
);

alter table public.regulatory_assessment_findings
  add constraint regulatory_assessment_findings_assessment_same_operation_fk
  foreign key (assessment_id, transport_operation_id)
  references public.regulatory_assessments (id, transport_operation_id) on delete restrict;

create index regulatory_assessment_findings_assessment_idx
  on public.regulatory_assessment_findings (assessment_id);
create index regulatory_assessment_findings_operation_idx
  on public.regulatory_assessment_findings (transport_operation_id);
create index regulatory_assessment_findings_state_idx
  on public.regulatory_assessment_findings (state);
create index regulatory_assessment_findings_review_idx
  on public.regulatory_assessment_findings (assessment_id)
  where requires_human_review;

create trigger regulatory_assessment_findings_no_mutation
  before update or delete on public.regulatory_assessment_findings
  for each row execute function public.regulatory_block_mutation();

comment on table public.regulatory_assessment_findings is
  'Conclusao por requisito, separada do fato observado. Append-only. '
  'Regra de composicao: qualquer false -> not_applicable; nenhum false e ao menos um '
  'unknown -> pending_evaluation; todos true e demais condicoes da PNPM-TRC -> applicable. '
  'Ausencia de evidencia NUNCA vira false. '
  'R11: unknown e preservado como unknown. A politica de selecao de tabela diante de R11 '
  'unknown e DECISAO PENDENTE e NAO esta codificada aqui.';
comment on column public.regulatory_assessment_findings.transport_operation_id is
  'Denormalizado a partir da avaliacao, com FK composta que garante a coerencia. Existe '
  'para viabilizar a FK composta de regulatory_finding_evidence, que impede ligar '
  'evidencia de uma operacao a finding de outra.';

-- -----------------------------------------------------------------------------
-- 12. regulatory_finding_evidence  -  ligacao N:N conclusao <-> evidencia
-- -----------------------------------------------------------------------------
create table public.regulatory_finding_evidence (
  finding_id             uuid        not null,
  evidence_id            uuid        not null,
  transport_operation_id uuid        not null,
  weight                 text        null,
  created_at             timestamptz not null default now(),

  constraint regulatory_finding_evidence_pkey primary key (finding_id, evidence_id),
  constraint regulatory_finding_evidence_weight_valid
    check (weight is null or weight in ('supporting','contradicting','contextual'))
);

alter table public.regulatory_finding_evidence
  add constraint regulatory_finding_evidence_finding_same_operation_fk
  foreign key (finding_id, transport_operation_id)
  references public.regulatory_assessment_findings (id, transport_operation_id)
  on delete restrict;

alter table public.regulatory_finding_evidence
  add constraint regulatory_finding_evidence_evidence_same_operation_fk
  foreign key (evidence_id, transport_operation_id)
  references public.regulatory_requirement_evidence (id, transport_operation_id)
  on delete restrict;

create index regulatory_finding_evidence_evidence_idx
  on public.regulatory_finding_evidence (evidence_id);
create index regulatory_finding_evidence_operation_idx
  on public.regulatory_finding_evidence (transport_operation_id);

create trigger regulatory_finding_evidence_no_mutation
  before update or delete on public.regulatory_finding_evidence
  for each row execute function public.regulatory_block_mutation();

comment on table public.regulatory_finding_evidence is
  'Quais evidencias sustentaram cada conclusao. N:N. Append-only. As duas FKs compostas '
  'amarram finding e evidence a mesma transport_operation_id da linha: evidencia da '
  'operacao A NAO pode sustentar finding da operacao B. Garantia estrutural do banco, '
  'sem trigger e sem depender de RPC ou frontend. weight = contradicting registra a '
  'evidencia que CONTRARIA a conclusao.';

-- -----------------------------------------------------------------------------
-- 13. transport_operations.floor_applicability_assessment_id
-- -----------------------------------------------------------------------------
-- Coluna e FK entram JUNTAS, porque o alvo so passa a existir agora.
-- FK COMPOSTA: a avaliacao corrente e obrigatoriamente desta operacao.
-- -----------------------------------------------------------------------------
alter table public.transport_operations
  add column floor_applicability_assessment_id uuid null;

alter table public.transport_operations
  add constraint transport_operations_floor_assessment_same_operation_fk
  foreign key (floor_applicability_assessment_id, id)
  references public.regulatory_assessments (id, transport_operation_id) on delete restrict;

create index transport_operations_floor_assessment_idx
  on public.transport_operations (floor_applicability_assessment_id);

comment on column public.transport_operations.floor_applicability_assessment_id is
  'Qual avaliacao produziu o valor corrente de floor_applicability. A FK COMPOSTA '
  '(floor_applicability_assessment_id, id) -> regulatory_assessments (id, '
  'transport_operation_id) garante que a avaliacao apontada e desta operacao. '
  'A IGUALDADE entre transport_operations.floor_applicability e o floor_applicability '
  'daquela avaliacao NAO e garantida por constraint: dependeria de trigger ou da RPC '
  'futura. Neste lote nao ha escrita direta possivel (sem policy, sem grant).';

-- =============================================================================
-- RLS - leitura somente. Nenhuma policy de INSERT/UPDATE/DELETE.
-- =============================================================================

alter table public.regulatory_requirement_evidence               enable row level security;
alter table public.regulatory_requirement_evidence_verifications enable row level security;
alter table public.regulatory_assessments           enable row level security;
alter table public.regulatory_assessment_findings   enable row level security;
alter table public.regulatory_finding_evidence      enable row level security;

create policy regulatory_requirement_evidence_select_admin
  on public.regulatory_requirement_evidence for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_requirement_evidence_verifications_select_admin
  on public.regulatory_requirement_evidence_verifications for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_finding_evidence_select_admin
  on public.regulatory_finding_evidence for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy regulatory_assessments_select_parties
  on public.regulatory_assessments for select to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or exists (
      select 1
      from public.transport_operations o
      where o.id = regulatory_assessments.transport_operation_id
        and (
          public.is_current_user_company_member(o.shipper_company_id)
          or public.is_current_user_company_owner(o.shipper_company_id)
          or (o.carrier_company_id is not null
              and (public.is_current_user_company_member(o.carrier_company_id)
                   or public.is_current_user_company_owner(o.carrier_company_id)))
        )
    )
  );

create policy regulatory_assessment_findings_select_parties
  on public.regulatory_assessment_findings for select to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or exists (
      select 1
      from public.transport_operations o
      where o.id = regulatory_assessment_findings.transport_operation_id
        and (
          public.is_current_user_company_member(o.shipper_company_id)
          or public.is_current_user_company_owner(o.shipper_company_id)
          or (o.carrier_company_id is not null
              and (public.is_current_user_company_member(o.carrier_company_id)
                   or public.is_current_user_company_owner(o.carrier_company_id)))
        )
    )
  );

-- =============================================================================
-- GRANTS - escrita revogada.
-- =============================================================================

revoke all on public.regulatory_requirement_evidence               from anon, authenticated;
revoke all on public.regulatory_requirement_evidence_verifications from anon, authenticated;
revoke all on public.regulatory_assessments           from anon, authenticated;
revoke all on public.regulatory_assessment_findings   from anon, authenticated;
revoke all on public.regulatory_finding_evidence      from anon, authenticated;

grant select on public.regulatory_requirement_evidence               to authenticated;
grant select on public.regulatory_requirement_evidence_verifications to authenticated;
grant select on public.regulatory_assessments           to authenticated;
grant select on public.regulatory_assessment_findings   to authenticated;
grant select on public.regulatory_finding_evidence      to authenticated;

commit;
