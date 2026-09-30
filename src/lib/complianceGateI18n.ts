// Textos do Freight Compliance Gate em PT/EN/ES.
//
// Ficam em modulo proprio, e nao em src/lib/i18n.tsx, por decisao deliberada:
// o arquivo compartilhado tem ~1.400 linhas com tres objetos de idioma, e a
// insercao programatica de um grupo novo produziu chave duplicada. Isolar aqui
// evita risco de regressao em traducoes ja homologadas. A integracao ao
// provider global fica para quando o modulo sair de observacional.

import type { ComplianceView, ReasonCode } from "./complianceGate";

export type Idioma = "pt" | "en" | "es";

type Textos = {
  sectionTitle: string;
  observationalNotice: string;
  evaluatedAmount: string;
  floorAmount: string;
  difference: string;
  state: Record<ComplianceView["kind"], string>;
  reason: Record<ReasonCode, string>;
};

export const COMPLIANCE_TEXTS: Record<Idioma, Textos> = {
  pt: {
    sectionTitle: "Compliance do frete",
    observationalNotice: "Avaliação em modo observacional: nenhum contrato é bloqueado nesta fase.",
    evaluatedAmount: "Valor contratado",
    floorAmount: "Piso calculado",
    difference: "Diferença",
    state: {
      not_evaluated: "Aguardando validação",
      pending: "Avaliação pendente",
      incomputable: "Não foi possível calcular",
      cancelled: "Avaliação cancelada",
      compliant: "Acima do piso",
      non_compliant: "Abaixo do piso",
    },
    reason: {
      RULE_SET_NOT_ACTIVE: "Nenhuma regra vigente e validada para o piso.",
      COEFFICIENT_TABLE_MISSING: "Tabela de coeficientes do PNPM não carregada.",
      ROUNDING_POLICY_UNDEFINED: "Política de arredondamento pendente de validação.",
      VEHICLE_COMPOSITION_MISSING: "Composição veicular e eixos não declarados.",
      EFFECTIVE_CARRIER_UNKNOWN:
        "Categoria RNTRC do transportador efetivo sem evidência congelada.",
      NO_ELIGIBLE_VALIDATED_RULE:
        "Nenhum conjunto de regras elegível, vigente e validado internamente.",
    },
  },
  en: {
    sectionTitle: "Freight compliance",
    observationalNotice: "Observational assessment: no contract is blocked at this stage.",
    evaluatedAmount: "Contracted amount",
    floorAmount: "Calculated floor",
    difference: "Difference",
    state: {
      not_evaluated: "Awaiting validation",
      pending: "Assessment pending",
      incomputable: "Could not be calculated",
      cancelled: "Assessment cancelled",
      compliant: "Above the floor",
      non_compliant: "Below the floor",
    },
    reason: {
      RULE_SET_NOT_ACTIVE: "No effective, validated rule set for the floor.",
      COEFFICIENT_TABLE_MISSING: "PNPM coefficient table not loaded.",
      ROUNDING_POLICY_UNDEFINED: "Rounding policy pending validation.",
      VEHICLE_COMPOSITION_MISSING: "Vehicle composition and axles not declared.",
      EFFECTIVE_CARRIER_UNKNOWN: "Effective carrier RNTRC category without frozen evidence.",
      NO_ELIGIBLE_VALIDATED_RULE: "No eligible, effective, internally validated rule set.",
    },
  },
  es: {
    sectionTitle: "Cumplimiento del flete",
    observationalNotice:
      "Evaluación en modo observacional: ningún contrato se bloquea en esta fase.",
    evaluatedAmount: "Valor contratado",
    floorAmount: "Piso calculado",
    difference: "Diferencia",
    state: {
      not_evaluated: "Esperando validación",
      pending: "Evaluación pendiente",
      incomputable: "No se pudo calcular",
      cancelled: "Evaluación cancelada",
      compliant: "Por encima del piso",
      non_compliant: "Por debajo del piso",
    },
    reason: {
      RULE_SET_NOT_ACTIVE: "No hay regla vigente y validada para el piso.",
      COEFFICIENT_TABLE_MISSING: "Tabla de coeficientes del PNPM no cargada.",
      ROUNDING_POLICY_UNDEFINED: "Política de redondeo pendiente de validación.",
      VEHICLE_COMPOSITION_MISSING: "Composición vehicular y ejes no declarados.",
      EFFECTIVE_CARRIER_UNKNOWN: "Categoría RNTRC del transportista efectivo sin evidencia.",
      NO_ELIGIBLE_VALIDATED_RULE: "Ningún conjunto de reglas elegible, vigente y validado.",
    },
  },
};

export function complianceTexts(idioma: string | undefined): Textos {
  if (idioma === "en" || idioma === "es") return COMPLIANCE_TEXTS[idioma];
  return COMPLIANCE_TEXTS.pt;
}
