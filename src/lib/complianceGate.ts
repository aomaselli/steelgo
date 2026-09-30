// Freight Compliance Gate — camada de dominio (Fase 1, observacional).
//
// A logica REGULATORIA AUTORITATIVA vive no banco (RPC SECURITY DEFINER +
// constraints). Este modulo NAO calcula piso, NAO decide conformidade e NAO
// interpreta norma: ele apenas traduz o resultado ja decidido para exibicao,
// com uma regra dura — nunca afirmar conformidade sem calculo concluido.

/** Estado do CALCULO. Espelha regulatory_compliance_results.calculation_status. */
export type CalculationStatus = "pending" | "calculated" | "incomputable" | "cancelled";

/** Estado da CONFORMIDADE. NULL enquanto o calculo nao concluir. */
export type ComplianceStatus = "compliant" | "non_compliant";

/** Modo vigente quando o resultado foi produzido. */
export type EnforcementMode = "observational" | "enforcing";

/**
 * Categoria CADASTRAL no RNTRC. Nao confundir com tratamento regulatorio:
 * uma ETC equiparada a TAC continua sendo pessoa juridica.
 */
export type RntrcCategory = "tac" | "etc" | "ctc";

/**
 * Tratamento para fins de CIOT/pagamento de frete.
 * Lei 11.442/2007, art. 5-A: ETC com ate 3 veiculos registrados no RNTRC e
 * TODAS as CTC equiparam-se a TAC. A equiparacao NAO pode ser inferida apenas
 * pela quantidade declarada de veiculos: exige evidencia do RNTRC congelada.
 */
export type RegulatoryTreatment = "standard" | "tac_equivalent";

/** Sujeito exigido por categoria. tac -> pessoa fisica; etc/ctc -> pessoa juridica. */
export function requiresLegalEntity(categoria: RntrcCategory): boolean {
  return categoria === "etc" || categoria === "ctc";
}

/** tac_equivalent so existe para etc ou ctc. Um TAC ja e TAC. */
export function treatmentAllowed(
  categoria: RntrcCategory,
  tratamento: RegulatoryTreatment,
): boolean {
  if (tratamento === "standard") return true;
  return categoria === "etc" || categoria === "ctc";
}

/**
 * Codigos de motivo emitidos pelo banco. Sao estaveis e traduziveis; nunca
 * texto livre do usuario.
 */
export const REASON_CODES = [
  "RULE_SET_NOT_ACTIVE",
  "COEFFICIENT_TABLE_MISSING",
  "ROUNDING_POLICY_UNDEFINED",
  "VEHICLE_COMPOSITION_MISSING",
  "EFFECTIVE_CARRIER_UNKNOWN",
  "NO_ELIGIBLE_VALIDATED_RULE",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type ComplianceResult = {
  calculationStatus: CalculationStatus;
  complianceStatus: ComplianceStatus | null;
  evaluatedAmount: number | null;
  floorAmountRounded: number | null;
  differenceAmount: number | null;
  differencePercent: number | null;
  reasonCodes: ReasonCode[];
  enforcementMode: EnforcementMode;
};

/**
 * Estado de apresentacao. Deliberadamente NAO existe um estado "conforme"
 * alcancavel sem calculo concluido.
 */
export type ComplianceView =
  | { kind: "not_evaluated" }
  | { kind: "pending"; reasons: ReasonCode[] }
  | { kind: "incomputable"; reasons: ReasonCode[] }
  | { kind: "cancelled" }
  | { kind: "compliant"; evaluated: number; floor: number; difference: number }
  | { kind: "non_compliant"; evaluated: number; floor: number; difference: number };

/**
 * Traduz o resultado do banco em estado de tela.
 *
 * Invariante de seguranca: "Em conformidade" so aparece quando
 * calculationStatus === "calculated" E complianceStatus === "compliant" E os
 * tres valores existem. Falta de coeficiente, regra nao vigente, arredondamento
 * nao validado, composicao ausente ou transportador efetivo desconhecido
 * resultam em "incomputable" — jamais em conformidade.
 */
export function complianceView(resultado: ComplianceResult | null | undefined): ComplianceView {
  if (!resultado) return { kind: "not_evaluated" };

  const motivos = resultado.reasonCodes ?? [];

  switch (resultado.calculationStatus) {
    case "cancelled":
      return { kind: "cancelled" };
    case "pending":
      return { kind: "pending", reasons: motivos };
    case "incomputable":
      return { kind: "incomputable", reasons: motivos };
    case "calculated":
      break;
  }

  // Defesa em profundidade: o banco ja impede estas combinacoes por CHECK,
  // mas a tela nao pode depender disso para afirmar conformidade.
  const { evaluatedAmount, floorAmountRounded, differenceAmount, complianceStatus } = resultado;
  if (
    complianceStatus === null ||
    evaluatedAmount === null ||
    floorAmountRounded === null ||
    differenceAmount === null
  ) {
    return { kind: "incomputable", reasons: motivos };
  }

  return complianceStatus === "compliant"
    ? {
        kind: "compliant",
        evaluated: evaluatedAmount,
        floor: floorAmountRounded,
        difference: differenceAmount,
      }
    : {
        kind: "non_compliant",
        evaluated: evaluatedAmount,
        floor: floorAmountRounded,
        difference: differenceAmount,
      };
}

/** Chave de i18n do titulo, por estado. */
export function complianceTitleKey(vista: ComplianceView): string {
  return `compliance.state.${vista.kind}`;
}

/** Chave de i18n de um codigo de motivo. */
export function reasonKey(code: ReasonCode): string {
  return `compliance.reason.${code}`;
}

/**
 * Na Fase 1 nada e bloqueado. Esta funcao existe para que a interface nunca
 * precise inferir bloqueio a partir do resultado.
 */
export function blocksContract(resultado: ComplianceResult | null | undefined): boolean {
  if (!resultado) return false;
  return (
    resultado.enforcementMode === "enforcing" && resultado.complianceStatus === "non_compliant"
  );
}

/** Fase 1 nao emite CIOT. A interface nunca deve declarar emissao. */
export const CIOT_ISSUED_SUPPORTED = false as const;
