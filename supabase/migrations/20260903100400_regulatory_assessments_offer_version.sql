-- =============================================================================
-- L2a - migration 5/7 : sujeito duplo em TODA a cadeia regulatoria
-- =============================================================================
-- As migrations L1 ja aplicadas (20260902100000 e 20260902100100) NAO sao
-- alteradas. Esta migration apenas acrescenta.
--
-- DECISAO ESTRUTURAL: extensao aditiva COMPLETA, nas quatro tabelas necessarias.
--
-- Nao basta regulatory_assessments aceitar offer_version_id: um sujeito aceito
-- pela avaliacao e inutilizavel nas tabelas filhas e pior que nenhum sujeito,
-- porque anuncia uma capacidade que o schema nega. E NAO se sustenta a tese de
-- que pending_items e blocking_reasons substituem findings: sao jsonb livres da
-- propria avaliacao, sem codigo de requisito tipado, sem estado tipado
-- true/false/unknown, sem insufficient_reason e - decisivo - sem qualquer
-- ligacao a evidencia. Nao preservam a evidencia exigida. Por isso a extensao
-- vai ate o fim da cadeia:
--
--   regulatory_assessments             sujeito exclusivo  (ja previsto no L1)
--   regulatory_assessment_findings     sujeito exclusivo  + FK composta a avaliacao
--   regulatory_requirement_evidence    sujeito exclusivo  + FKs compostas das cadeias
--   regulatory_finding_evidence        sujeito exclusivo  + FKs compostas dos dois lados
--
-- O padrao repetido em cada uma e o mesmo do L1 para operacao:
--   num_nonnulls(transport_operation_id, offer_version_id) = 1   -> exclusividade
--   unique (id, <sujeito>)                                       -> alvo de FK composta
--   FK composta (filho, <sujeito>) -> (pai.id, pai.<sujeito>)    -> pertencimento
-- Resultado: continua estruturalmente impossivel ligar finding de um sujeito a
-- evidencia de outro, exatamente como o L1 ja garantia entre operacoes - agora
-- tambem entre ofertas, e entre oferta e operacao.
--
-- NENHUMA linha existente e alterada: todas ja possuem transport_operation_id
-- preenchido e offer_version_id nulo, o que satisfaz todos os novos checks.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. regulatory_assessments
-- -----------------------------------------------------------------------------

alter table public.regulatory_assessments
  alter column transport_operation_id drop not null;

alter table public.regulatory_assessments
  add column offer_version_id uuid null;

alter table public.regulatory_assessments
  add constraint regulatory_assessments_offer_version_fk
  foreign key (offer_version_id)
  references public.freight_offer_versions(id) on delete restrict;

alter table public.regulatory_assessments
  add constraint regulatory_assessments_subject_exclusive
  check (num_nonnulls(transport_operation_id, offer_version_id) = 1);

-- Sujeito oferta so existe antes da operacao de transporte. O estagio 'ciot'
-- pressupoe operacao e fica vedado a ele.
alter table public.regulatory_assessments
  add constraint regulatory_assessments_offer_stage_coherent
  check (offer_version_id is null or stage in ('preliminary', 'publication'));

alter table public.regulatory_assessments
  add constraint regulatory_assessments_id_offer_version_unique
  unique (id, offer_version_id);

create index regulatory_assessments_offer_version_idx
  on public.regulatory_assessments (offer_version_id);

comment on column public.regulatory_assessments.offer_version_id is
  'Sujeito alternativo: a versao anunciada da oferta, avaliada na publicacao, '
  'quando ainda nao existe transport_operation. Exclusivo com '
  'transport_operation_id por num_nonnulls(...) = 1. Restrito aos estagios '
  'preliminary e publication.';

comment on column public.regulatory_assessments.transport_operation_id is
  'Sujeito quando ja existe operacao de transporte. Deixou de ser NOT NULL na '
  'migration 20260903100400 (L2a). Exclusivo com offer_version_id.';

-- -----------------------------------------------------------------------------
-- 2. regulatory_assessment_findings
-- -----------------------------------------------------------------------------

alter table public.regulatory_assessment_findings
  alter column transport_operation_id drop not null;

alter table public.regulatory_assessment_findings
  add column offer_version_id uuid null;

alter table public.regulatory_assessment_findings
  add constraint regulatory_assessment_findings_subject_exclusive
  check (num_nonnulls(transport_operation_id, offer_version_id) = 1);

-- FK COMPOSTA espelhando a de operacao: finding de oferta pertence a uma
-- avaliacao DA MESMA oferta.
alter table public.regulatory_assessment_findings
  add constraint regulatory_assessment_findings_assessment_same_offer_fk
  foreign key (assessment_id, offer_version_id)
  references public.regulatory_assessments (id, offer_version_id) on delete restrict;

alter table public.regulatory_assessment_findings
  add constraint regulatory_assessment_findings_id_offer_version_unique
  unique (id, offer_version_id);

create index regulatory_assessment_findings_offer_version_idx
  on public.regulatory_assessment_findings (offer_version_id);

comment on column public.regulatory_assessment_findings.offer_version_id is
  'Sujeito alternativo, espelhando regulatory_assessments. Denormalizado da '
  'avaliacao com FK composta que garante a coerencia, e existe para viabilizar a '
  'FK composta de regulatory_finding_evidence do lado da oferta - mesma razao '
  'pela qual transport_operation_id existe aqui.';

comment on column public.regulatory_assessment_findings.transport_operation_id is
  'Sujeito quando a avaliacao e de operacao. Deixou de ser NOT NULL na migration '
  '20260903100400 (L2a). Exclusivo com offer_version_id.';

-- -----------------------------------------------------------------------------
-- 3. regulatory_requirement_evidence
-- -----------------------------------------------------------------------------
-- Evidencia de oferta e fato observado SOBRE O ANUNCIO: o proprio
-- offer_snapshot, a clausula contratual anexada na publicacao, a consulta de
-- RNTRC feita antes de anunciar. Nao e evidencia operacional - essa continua
-- exigindo transport_operation_id. As duas cadeias internas da tabela
-- (supersessao e reconciliacao de divergencia) ganham FKs compostas espelhadas,
-- de modo que uma evidencia de oferta so pode suceder ou reconciliar outra
-- evidencia DA MESMA oferta.
-- -----------------------------------------------------------------------------

alter table public.regulatory_requirement_evidence
  alter column transport_operation_id drop not null;

alter table public.regulatory_requirement_evidence
  add column offer_version_id uuid null;

alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_subject_exclusive
  check (num_nonnulls(transport_operation_id, offer_version_id) = 1);

alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_offer_version_fk
  foreign key (offer_version_id)
  references public.freight_offer_versions(id) on delete restrict;

alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_id_offer_version_unique
  unique (id, offer_version_id);

-- Cadeia de supersessao, lado oferta.
alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_supersedes_same_offer_fk
  foreign key (supersedes_evidence_id, offer_version_id)
  references public.regulatory_requirement_evidence (id, offer_version_id)
  on delete restrict;

-- Cadeia de reconciliacao de divergencia, lado oferta.
alter table public.regulatory_requirement_evidence
  add constraint regulatory_requirement_evidence_resolves_same_offer_fk
  foreign key (resolves_divergence_of_id, offer_version_id)
  references public.regulatory_requirement_evidence (id, offer_version_id)
  on delete restrict;

create index regulatory_requirement_evidence_offer_version_idx
  on public.regulatory_requirement_evidence (offer_version_id);
create index regulatory_requirement_evidence_offer_requirement_idx
  on public.regulatory_requirement_evidence (offer_version_id, requirement_code);

comment on column public.regulatory_requirement_evidence.offer_version_id is
  'Sujeito alternativo: fato observado sobre o ANUNCIO - o proprio '
  'offer_snapshot, clausula anexada na publicacao, consulta feita antes de '
  'anunciar. Exclusivo com transport_operation_id. As duas cadeias internas da '
  'tabela ganharam FKs compostas espelhadas, de modo que evidencia de oferta so '
  'sucede ou reconcilia evidencia da MESMA oferta.';

comment on column public.regulatory_requirement_evidence.transport_operation_id is
  'Sujeito quando a evidencia e operacional. Deixou de ser NOT NULL na migration '
  '20260903100400 (L2a). Exclusivo com offer_version_id.';

-- -----------------------------------------------------------------------------
-- 4. regulatory_finding_evidence
-- -----------------------------------------------------------------------------
-- A ligacao N:N passa a existir nos dois sujeitos, com as MESMAS duas FKs
-- compostas de cada lado. Cruzar sujeitos continua estruturalmente impossivel:
-- nao existe valor da coluna de sujeito que satisfaca simultaneamente uma FK
-- para finding de oferta e outra para evidencia de operacao.
-- -----------------------------------------------------------------------------

alter table public.regulatory_finding_evidence
  alter column transport_operation_id drop not null;

alter table public.regulatory_finding_evidence
  add column offer_version_id uuid null;

alter table public.regulatory_finding_evidence
  add constraint regulatory_finding_evidence_subject_exclusive
  check (num_nonnulls(transport_operation_id, offer_version_id) = 1);

alter table public.regulatory_finding_evidence
  add constraint regulatory_finding_evidence_finding_same_offer_fk
  foreign key (finding_id, offer_version_id)
  references public.regulatory_assessment_findings (id, offer_version_id)
  on delete restrict;

alter table public.regulatory_finding_evidence
  add constraint regulatory_finding_evidence_evidence_same_offer_fk
  foreign key (evidence_id, offer_version_id)
  references public.regulatory_requirement_evidence (id, offer_version_id)
  on delete restrict;

create index regulatory_finding_evidence_offer_version_idx
  on public.regulatory_finding_evidence (offer_version_id);

comment on column public.regulatory_finding_evidence.offer_version_id is
  'Sujeito da ligacao quando finding e evidencia sao de oferta. Exclusivo com '
  'transport_operation_id. As duas FKs compostas deste lado amarram finding e '
  'evidence a MESMA offer_version_id da linha - espelho exato do que o L1 ja '
  'fazia para transport_operation_id. Ligar finding de oferta a evidencia de '
  'operacao e impossivel: nenhuma combinacao satisfaz as duas FKs ao mesmo tempo.';

comment on table public.regulatory_finding_evidence is
  'Ligacao N:N conclusao <-> evidencia, agora nos dois sujeitos. A coluna de '
  'sujeito e denormalizada e as FKs compostas garantem que os dois lados '
  'pertencem ao mesmo sujeito. Append-only.';

commit;
