/**
 * Testes do serviço de cotação de pedágio.
 *
 * Sem rede e sem banco: o provedor é o simulado, e o relógio é injetado para
 * que vencimento de cotação seja determinístico.
 *
 * Runner: vitest, junto com o resto da suíte.
 */

import { describe, expect, it } from "vitest";

import {
  CORRIDOR_COVERAGE,
  InMemoryTollQuoteCache,
  isCorridorCovered,
  quoteKey,
  quoteToll,
  recalculationReasons,
  routeCountries,
  toPublicResult,
  validateQuote,
  type CorridorCoverage,
  type RecalculationReason,
} from "../toll-quote.service";
import { SIMULATED_MARKER, SimulatedTollProvider } from "../providers/simulated.provider";
import { buildTollProviders } from "../providers";
import type { ProviderOutcome, TollQuote, TollQuoteRequest } from "../types";

const BR_LIBERADO: CorridorCoverage[] = [{ from: "BR", to: "BR", verifiedAt: "2026-10-02" }];

const pedido: TollQuoteRequest = {
  origin: { lat: -19.4683, lng: -42.5369, countryCode: "BR", label: "Ipatinga/MG" },
  destination: { lat: -19.9678, lng: -44.1983, countryCode: "BR", label: "Betim/MG" },
  waypoints: [],
  vehicle: { axleCount: 6, truckType: "carreta" },
  referenceDate: "2026-10-06",
  currency: "BRL",
};

/** Provedor que conta chamadas, para provar que não houve consulta duplicada. */
class ContandoProvider extends SimulatedTollProvider {
  chamadas = 0;
  async quote(request: TollQuoteRequest): Promise<ProviderOutcome<TollQuote>> {
    this.chamadas++;
    return super.quote(request);
  }
}

function quoteBase(): TollQuote {
  return {
    provider: "simulated",
    providerRouteId: null,
    toll: { known: true, amount: 0, currency: "BRL" },
    plazas: [],
    plazasComplete: false,
    loadedDistanceKm: null,
    durationMinutes: null,
    borderCrossings: [],
    validUntil: null,
    calculatedAt: new Date().toISOString(),
    rawPayload: null,
  };
}

describe("cobertura por corredor", () => {
  it("nenhum corredor vem liberado por padrão", () => {
    // Liberar corredor exige conferência com tarifa oficial; simulação não libera.
    expect(CORRIDOR_COVERAGE.every((c) => c.verifiedAt === null)).toBe(true);
    expect(isCorridorCovered("BR", "BR")).toBe(false);
  });

  it("corredor conferido passa a valer", () => {
    expect(isCorridorCovered("BR", "BR", BR_LIBERADO)).toBe(true);
    expect(isCorridorCovered("BR", "AR", BR_LIBERADO)).toBe(false);
  });

  it("rota multipaís expõe cada travessia", () => {
    const multi: TollQuoteRequest = {
      ...pedido,
      waypoints: [{ lat: -30, lng: -56, countryCode: "UY" }],
    };
    expect(routeCountries(multi)).toEqual(["BR", "UY", "BR"]);
  });

  it("recusa corredor sem cobertura em vez de cotar", async () => {
    const r = await quoteToll(pedido, { provider: new SimulatedTollProvider() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe("unsupported_corridor");
  });
});

describe("eixos são obrigatórios", () => {
  it.each([0, -1, 2.5, Number.NaN])("recusa axleCount = %s", async (axles) => {
    const r = await quoteToll(
      { ...pedido, vehicle: { ...pedido.vehicle, axleCount: axles } },
      { provider: new SimulatedTollProvider(), coverage: BR_LIBERADO },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe("incomplete");
  });
});

describe("valor desconhecido nunca vira zero", () => {
  it("resposta sem total é falha, não zero", async () => {
    const r = await quoteToll(pedido, {
      provider: new SimulatedTollProvider({ outcome: "incomplete" }),
      coverage: BR_LIBERADO,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe("incomplete");
  });

  it("falha exposta ao navegador não carrega valor algum", async () => {
    const r = await quoteToll(pedido, {
      provider: new SimulatedTollProvider({ outcome: "unavailable" }),
      coverage: BR_LIBERADO,
    });
    const publico = toPublicResult(r, new SimulatedTollProvider());
    expect(publico.status).toBe("unavailable");
    expect(publico.toll.known).toBe(false);
    expect(publico.toll).not.toHaveProperty("amount");
  });

  it("zero legítimo é distinguível de desconhecido", () => {
    const base = quoteBase();
    const zero = validateQuote({
      ...base,
      toll: { known: true, amount: 0, currency: "BRL" },
      plazasComplete: true,
    });
    expect(zero.ok).toBe(true);
    const desconhecido = validateQuote({ ...base, toll: { known: false, reason: "unavailable" } });
    expect(desconhecido.ok).toBe(false);
  });
});

describe("resposta incompleta ou inconsistente", () => {
  it("soma das praças divergente do total reprova", () => {
    const r = validateQuote({
      ...quoteBase(),
      toll: { known: true, amount: 100, currency: "BRL" },
      plazasComplete: true,
      plazas: [
        { name: "A", countryCode: "BR", amount: 40, currency: "BRL" },
        { name: "B", countryCode: "BR", amount: 30, currency: "BRL" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("praça em moeda diferente do total reprova", () => {
    const r = validateQuote({
      ...quoteBase(),
      toll: { known: true, amount: 40, currency: "BRL" },
      plazasComplete: true,
      plazas: [{ name: "A", countryCode: "AR", amount: 40, currency: "ARS" }],
    });
    expect(r.ok).toBe(false);
  });

  it("detalhamento incompleto não invalida o total", () => {
    const r = validateQuote({
      ...quoteBase(),
      toll: { known: true, amount: 100, currency: "BRL" },
      plazasComplete: false,
      plazas: [{ name: "A", countryCode: "BR", amount: 40, currency: "BRL" }],
    });
    expect(r.ok).toBe(true);
  });
});

describe("consulta duplicada", () => {
  it("mesma pergunta gera a mesma chave; mudar eixo muda a chave", () => {
    expect(quoteKey(pedido)).toBe(quoteKey({ ...pedido }));
    expect(quoteKey(pedido)).not.toBe(
      quoteKey({ ...pedido, vehicle: { ...pedido.vehicle, axleCount: 9 } }),
    );
  });

  it("segunda chamada idêntica usa o cache e não consulta de novo", async () => {
    const provider = new ContandoProvider();
    const cache = new InMemoryTollQuoteCache();
    await quoteToll(pedido, { provider, cache, coverage: BR_LIBERADO });
    await quoteToll(pedido, { provider, cache, coverage: BR_LIBERADO });
    expect(provider.chamadas).toBe(1);
  });

  it("duas chamadas simultâneas viram uma só consulta", async () => {
    const provider = new ContandoProvider({ delayMs: 30 });
    const inFlight = new Map();
    const [a, b] = await Promise.all([
      quoteToll(pedido, { provider, inFlight, coverage: BR_LIBERADO }),
      quoteToll(pedido, { provider, inFlight, coverage: BR_LIBERADO }),
    ]);
    expect(provider.chamadas).toBe(1);
    expect(a.ok && b.ok).toBe(true);
  });
});

describe("indisponibilidade", () => {
  it("provedor lento estoura o prazo e vira unavailable", async () => {
    const r = await quoteToll(pedido, {
      provider: new SimulatedTollProvider({ delayMs: 80 }),
      coverage: BR_LIBERADO,
      timeoutMs: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe("unavailable");
  });

  it("recusa do provedor é rejected, não unavailable", async () => {
    const r = await quoteToll(pedido, {
      provider: new SimulatedTollProvider({ outcome: "rejected" }),
      coverage: BR_LIBERADO,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe("rejected");
  });
});

describe("quando uma mudança exige novo cálculo", () => {
  const guardada = { validUntil: "2099-01-01T00:00:00.000Z" };

  it("cotação intacta não exige recálculo", () => {
    expect(recalculationReasons(pedido, guardada, pedido)).toEqual([]);
  });

  it.each<[RecalculationReason, TollQuoteRequest]>([
    ["rota_alterada", { ...pedido, destination: { ...pedido.destination, lat: -20.5 } }],
    ["configuracao_veicular_alterada", { ...pedido, vehicle: { ...pedido.vehicle, axleCount: 9 } }],
    ["data_de_referencia_alterada", { ...pedido, referenceDate: "2026-11-01" }],
    ["moeda_alterada", { ...pedido, currency: "USD" }],
  ])("%s", (motivo, atual) => {
    expect(recalculationReasons(pedido, guardada, atual)).toContain(motivo);
  });

  it("cotação vencida exige recálculo mesmo sem mudança", () => {
    const vencida = { validUntil: "2020-01-01T00:00:00.000Z" };
    expect(recalculationReasons(pedido, vencida, pedido)).toContain("cotacao_expirada");
  });

  it("cache não entrega cotação vencida", async () => {
    const provider = new ContandoProvider();
    const cache = new InMemoryTollQuoteCache();
    await quoteToll(pedido, { provider, cache, coverage: BR_LIBERADO });
    const depois = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
    await quoteToll(pedido, { provider, cache, coverage: BR_LIBERADO, now: depois });
    expect(provider.chamadas).toBe(2);
  });
});

describe("simulação é sempre identificável", () => {
  it("resultado simulado traz provider e marca no payload", async () => {
    const r = await quoteToll(pedido, {
      provider: new SimulatedTollProvider(),
      coverage: BR_LIBERADO,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.provider).toBe("simulated");
      expect((r.value.rawPayload as Record<string, unknown>)[SIMULATED_MARKER]).toBe(true);
    }
  });

  it("modo fake é proibido em produção", () => {
    expect(() =>
      buildTollProviders({
        TOLL_PROVIDER_MODE: "fake",
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv),
    ).toThrow(/proibido em produ/);
    expect(() =>
      buildTollProviders({
        TOLL_PROVIDER_MODE: "fake",
        VERCEL_ENV: "production",
      } as NodeJS.ProcessEnv),
    ).toThrow(/proibido em produ/);
  });

  it("modo ausente ou inválido falha na inicialização", () => {
    expect(() => buildTollProviders({} as NodeJS.ProcessEnv)).toThrow(/TOLL_PROVIDER_MODE/);
    expect(() =>
      buildTollProviders({ TOLL_PROVIDER_MODE: "talvez" } as NodeJS.ProcessEnv),
    ).toThrow(/TOLL_PROVIDER_MODE/);
  });

  it("sandbox e production falham enquanto não houver provedor contratado", () => {
    for (const mode of ["sandbox", "production"]) {
      expect(() => buildTollProviders({ TOLL_PROVIDER_MODE: mode } as NodeJS.ProcessEnv)).toThrow(
        /provedor contratado/,
      );
    }
  });
});
