import { describe, expect, it } from "vitest";
import {
  blocksContract,
  complianceTitleKey,
  complianceView,
  reasonKey,
  CIOT_ISSUED_SUPPORTED,
  requiresLegalEntity,
  treatmentAllowed,
  type ComplianceResult,
} from "./complianceGate";

const base: ComplianceResult = {
  calculationStatus: "incomputable",
  complianceStatus: null,
  evaluatedAmount: 1000,
  floorAmountRounded: null,
  differenceAmount: null,
  differencePercent: null,
  reasonCodes: [],
  enforcementMode: "observational",
};

describe("nunca afirmar conformidade sem calculo", () => {
  it("sem resultado, a tela nao avalia", () => {
    expect(complianceView(null)).toEqual({ kind: "not_evaluated" });
    expect(complianceView(undefined)).toEqual({ kind: "not_evaluated" });
  });

  it("falta de regra vigente nao vira conformidade", () => {
    const v = complianceView({ ...base, reasonCodes: ["RULE_SET_NOT_ACTIVE"] });
    expect(v.kind).toBe("incomputable");
  });

  it("falta de coeficiente nao vira conformidade", () => {
    expect(complianceView({ ...base, reasonCodes: ["COEFFICIENT_TABLE_MISSING"] }).kind).toBe(
      "incomputable",
    );
  });

  it("arredondamento nao validado nao vira conformidade", () => {
    expect(complianceView({ ...base, reasonCodes: ["ROUNDING_POLICY_UNDEFINED"] }).kind).toBe(
      "incomputable",
    );
  });

  it("composicao ausente nao vira conformidade", () => {
    expect(complianceView({ ...base, reasonCodes: ["VEHICLE_COMPOSITION_MISSING"] }).kind).toBe(
      "incomputable",
    );
  });

  it("transportador efetivo desconhecido nao vira conformidade", () => {
    expect(complianceView({ ...base, reasonCodes: ["EFFECTIVE_CARRIER_UNKNOWN"] }).kind).toBe(
      "incomputable",
    );
  });

  it("calculated incoerente cai para incomputable, nunca para compliant", () => {
    const v = complianceView({
      ...base,
      calculationStatus: "calculated",
      complianceStatus: "compliant",
      floorAmountRounded: null,
      differenceAmount: null,
    });
    expect(v.kind).toBe("incomputable");
  });
});

describe("estados calculados", () => {
  it("valor acima do piso e conforme", () => {
    const v = complianceView({
      ...base,
      calculationStatus: "calculated",
      complianceStatus: "compliant",
      evaluatedAmount: 1200,
      floorAmountRounded: 1000,
      differenceAmount: 200,
    });
    expect(v).toEqual({ kind: "compliant", evaluated: 1200, floor: 1000, difference: 200 });
  });

  it("valor igual ao piso e conforme", () => {
    const v = complianceView({
      ...base,
      calculationStatus: "calculated",
      complianceStatus: "compliant",
      evaluatedAmount: 1000,
      floorAmountRounded: 1000,
      differenceAmount: 0,
    });
    expect(v.kind).toBe("compliant");
  });

  it("valor abaixo do piso nao e conforme", () => {
    const v = complianceView({
      ...base,
      calculationStatus: "calculated",
      complianceStatus: "non_compliant",
      evaluatedAmount: 800,
      floorAmountRounded: 1000,
      differenceAmount: -200,
    });
    expect(v).toEqual({ kind: "non_compliant", evaluated: 800, floor: 1000, difference: -200 });
  });

  it("pendente e cancelado tem estados proprios", () => {
    expect(complianceView({ ...base, calculationStatus: "pending" }).kind).toBe("pending");
    expect(complianceView({ ...base, calculationStatus: "cancelled" }).kind).toBe("cancelled");
  });
});

describe("modo observacional nao bloqueia", () => {
  it("observacional nunca bloqueia, mesmo nao conforme", () => {
    expect(
      blocksContract({
        ...base,
        calculationStatus: "calculated",
        complianceStatus: "non_compliant",
        floorAmountRounded: 1000,
        differenceAmount: -200,
        enforcementMode: "observational",
      }),
    ).toBe(false);
  });

  it("sem resultado nao bloqueia", () => {
    expect(blocksContract(null)).toBe(false);
  });

  it("incomputavel nunca bloqueia, nem em enforcing", () => {
    expect(blocksContract({ ...base, enforcementMode: "enforcing" })).toBe(false);
  });
});

describe("chaves de traducao e limites da fase", () => {
  it("cada estado tem chave propria", () => {
    expect(complianceTitleKey({ kind: "incomputable", reasons: [] })).toBe(
      "compliance.state.incomputable",
    );
    expect(complianceTitleKey({ kind: "not_evaluated" })).toBe("compliance.state.not_evaluated");
  });

  it("motivos sao codigos, nunca texto livre", () => {
    expect(reasonKey("COEFFICIENT_TABLE_MISSING")).toBe(
      "compliance.reason.COEFFICIENT_TABLE_MISSING",
    );
  });

  it("a Fase 1 nao declara CIOT emitido", () => {
    expect(CIOT_ISSUED_SUPPORTED).toBe(false);
  });
});

describe("categoria RNTRC x tratamento regulatorio", () => {
  it("tac exige pessoa fisica; etc e ctc exigem pessoa juridica", () => {
    expect(requiresLegalEntity("tac")).toBe(false);
    expect(requiresLegalEntity("etc")).toBe(true);
    expect(requiresLegalEntity("ctc")).toBe(true);
  });

  it("tac_equivalent vale para etc e ctc, nunca para tac", () => {
    expect(treatmentAllowed("etc", "tac_equivalent")).toBe(true);
    expect(treatmentAllowed("ctc", "tac_equivalent")).toBe(true);
    expect(treatmentAllowed("tac", "tac_equivalent")).toBe(false);
  });

  it("standard vale para qualquer categoria", () => {
    expect(treatmentAllowed("tac", "standard")).toBe(true);
    expect(treatmentAllowed("etc", "standard")).toBe(true);
    expect(treatmentAllowed("ctc", "standard")).toBe(true);
  });

  it("equiparacao nao substitui a identidade do transportador", () => {
    // ETC equiparada a TAC continua exigindo pessoa juridica.
    expect(requiresLegalEntity("etc")).toBe(true);
    expect(treatmentAllowed("etc", "tac_equivalent")).toBe(true);
  });
});

describe("ausencia de regra validada", () => {
  it("sem regra elegivel a tela aguarda validacao, nunca conformidade", () => {
    const v = complianceView({
      ...base,
      reasonCodes: ["NO_ELIGIBLE_VALIDATED_RULE"],
    });
    expect(v.kind).toBe("incomputable");
    expect(v.kind).not.toBe("compliant");
  });
});
