import { describe, expect, it } from "vitest";
import {
  documentText,
  resolveContractParties,
  type ContractPartiesInput,
} from "./contractParties";

/**
 * Cenario que reproduz o defeito: embarcador abrindo o contrato.
 * A RLS esconde dele a linha de `companies` da transportadora e a linha de
 * `drivers`, entao as leituras diretas voltam NULAS — exatamente o que o
 * PostgREST devolve em producao. Antes da correcao a tela escrevia
 * "Transportadora — • CNPJ — • ANTT —" e "Motorista —".
 */
const comoEmbarcador: ContractPartiesInput = {
  direct: {
    shipper: { name: "Siderurgica Simulacao Ltda", cnpj: "11122233000183" },
    carrier: null, // RLS
    driver: null, // RLS
  },
  counterparty: {
    shipper_company_name: "Siderurgica Simulacao Ltda",
    carrier_company_name: "Transportes Simulacao Ltda",
  },
  tripDriverLabel: "Motorista C.",
  carrierAntt: null, // RLS
  refs: { shipperCompany: true, carrierCompany: true, driver: true },
};

describe("identificacao das partes do contrato", () => {
  it("embarcador ve o NOME da transportadora mesmo sem ler companies", () => {
    const p = resolveContractParties(comoEmbarcador);
    expect(p.carrier.name).toBe("Transportes Simulacao Ltda");
    expect(p.carrier.fromCounterpartyRpc).toBe(true);
  });

  it("embarcador ve o motorista pelo rotulo sanitizado da viagem", () => {
    const p = resolveContractParties(comoEmbarcador);
    expect(p.driver.name).toBe("Motorista C.");
    expect(p.driver.fromTripLabel).toBe(true);
  });

  it("documento invisivel NAO vira dado inexistente", () => {
    const p = resolveContractParties(comoEmbarcador);
    expect(p.carrier.document).toEqual({ known: false, reason: "nao_visivel" });
    expect(p.carrier.antt).toEqual({ known: false, reason: "nao_visivel" });
    expect(p.driver.cpf).toEqual({ known: false, reason: "nao_visivel" });
    expect(p.driver.license).toEqual({ known: false, reason: "nao_visivel" });
  });

  it("a propria parte continua com documento legivel", () => {
    const p = resolveContractParties(comoEmbarcador);
    expect(p.shipper.name).toBe("Siderurgica Simulacao Ltda");
    expect(p.shipper.document).toEqual({ known: true, value: "11122233000183" });
    expect(p.shipper.fromCounterpartyRpc).toBe(false);
  });

  it("nenhuma parte fica sem nome quando a RPC responde", () => {
    const p = resolveContractParties(comoEmbarcador);
    expect(p.shipper.name).not.toBeNull();
    expect(p.carrier.name).not.toBeNull();
    expect(p.driver.name).not.toBeNull();
  });
});

describe("ausencia real de registro", () => {
  const semMotorista: ContractPartiesInput = {
    direct: { shipper: null, carrier: null, driver: null },
    counterparty: null,
    tripDriverLabel: null,
    carrierAntt: null,
    refs: { shipperCompany: true, carrierCompany: true, driver: false },
  };

  it("contrato sem motorista designado diz 'sem_registro', nao 'nao_visivel'", () => {
    const p = resolveContractParties(semMotorista);
    expect(p.driver.name).toBeNull();
    expect(p.driver.cpf).toEqual({ known: false, reason: "sem_registro" });
  });

  it("empresa referenciada e invisivel continua sendo 'nao_visivel'", () => {
    const p = resolveContractParties(semMotorista);
    expect(p.carrier.document).toEqual({ known: false, reason: "nao_visivel" });
  });

  it("sem RPC e sem leitura direta, o nome e nulo — nada e inventado", () => {
    const p = resolveContractParties(semMotorista);
    expect(p.carrier.name).toBeNull();
    expect(p.carrier.fromCounterpartyRpc).toBe(false);
  });
});

describe("RPC indisponivel nao apaga o que ja era legivel", () => {
  it("falha da RPC mantem a propria parte intacta", () => {
    const p = resolveContractParties({ ...comoEmbarcador, counterparty: null });
    expect(p.shipper.name).toBe("Siderurgica Simulacao Ltda");
    expect(p.carrier.name).toBeNull();
    expect(p.carrier.document).toEqual({ known: false, reason: "nao_visivel" });
  });
});

describe("documentText", () => {
  it("distingue invisivel de inexistente", () => {
    expect(documentText({ known: true, value: "123" })).toBe("123");
    expect(documentText({ known: false, reason: "nao_visivel" })).toBe("não visível para você");
    expect(documentText({ known: false, reason: "sem_registro" })).toBe("não informado");
  });

  it("espaco em branco nao conta como documento", () => {
    const p = resolveContractParties({
      ...comoEmbarcador,
      direct: { ...comoEmbarcador.direct, shipper: { name: "X", cnpj: "   " } },
    });
    expect(p.shipper.document).toEqual({ known: false, reason: "nao_visivel" });
  });
});
