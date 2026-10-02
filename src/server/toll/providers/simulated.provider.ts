/**
 * Provedor de pedágio SIMULADO.
 *
 * ======================================================================
 *  ISTO NÃO É INTEGRAÇÃO. Os valores são inventados por uma fórmula fixa
 *  e não têm relação com tarifa oficial de concessionária alguma.
 *  Serve para exercitar o fluxo em ambiente descartável. NÃO comprova
 *  integração e é proibido em produção (ver providers/index.ts).
 * ======================================================================
 *
 * Todo resultado vem marcado: `provider: "simulated"` e
 * `rawPayload.__simulado__ = true`. Quem persistir isto grava a marca junto.
 */

import type {
  ProviderOutcome,
  TollPlaza,
  TollProvider,
  TollProviderMode,
  TollQuote,
  TollQuoteRequest,
} from "../types";

/** Marca que acompanha toda resposta simulada. */
export const SIMULATED_MARKER = "__simulado__" as const;

export interface SimulatedBehaviour {
  /** Força um desfecho, para exercitar os caminhos de erro. */
  outcome?: "ok" | "unavailable" | "rejected" | "incomplete" | "slow";
  /** Atraso artificial, para exercitar o timeout. */
  delayMs?: number;
}

export class SimulatedTollProvider implements TollProvider {
  readonly id = "simulated" as const;
  readonly mode: TollProviderMode = "fake";

  constructor(private readonly behaviour: SimulatedBehaviour = {}) {}

  async quote(request: TollQuoteRequest): Promise<ProviderOutcome<TollQuote>> {
    const { outcome = "ok", delayMs } = this.behaviour;

    if (delayMs && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (outcome === "unavailable") {
      return {
        ok: false,
        failure: { kind: "unavailable", detail: "simulação: provedor fora do ar", provider: this.id },
      };
    }
    if (outcome === "rejected") {
      return {
        ok: false,
        failure: { kind: "rejected", detail: "simulação: requisição recusada", provider: this.id },
      };
    }

    const agora = new Date().toISOString();
    const pontos = [request.origin, ...request.waypoints, request.destination];

    // Distância grosseira em linha reta, só para dar forma ao resultado.
    let km = 0;
    for (let i = 0; i < pontos.length - 1; i++) {
      km += haversineKm(pontos[i], pontos[i + 1]);
    }
    km = Math.round(km);

    if (outcome === "incomplete") {
      // Total ausente de propósito: o serviço tem de recusar, não assumir zero.
      return {
        ok: true,
        value: {
          provider: this.id,
          providerRouteId: "sim-incompleto",
          toll: { known: false, reason: "incomplete" },
          plazas: [],
          plazasComplete: false,
          loadedDistanceKm: km,
          durationMinutes: null,
          borderCrossings: [],
          validUntil: null,
          calculatedAt: agora,
          rawPayload: { [SIMULATED_MARKER]: true, nota: "resposta sem total, de proposito" },
        },
      };
    }

    // Fórmula arbitrária e assumidamente fictícia: uma praça a cada 120 km,
    // tarifa proporcional aos eixos.
    const quantidade = Math.max(0, Math.floor(km / 120));
    const tarifaPorEixo = 3.4;
    const valorPraca = Number((request.vehicle.axleCount * tarifaPorEixo).toFixed(2));
    const plazas: TollPlaza[] = Array.from({ length: quantidade }, (_, i) => ({
      name: `Praca simulada ${i + 1}`,
      concessionaire: "Concessionaria simulada",
      countryCode: request.origin.countryCode,
      amount: valorPraca,
      currency: request.currency,
      freeFlow: i % 3 === 2,
    }));
    const total = Number((valorPraca * quantidade).toFixed(2));

    const fronteiras: TollQuote["borderCrossings"] = [];
    for (let i = 0; i < pontos.length - 1; i++) {
      if (pontos[i].countryCode !== pontos[i + 1].countryCode) {
        fronteiras.push({
          fromCountry: pontos[i].countryCode,
          toCountry: pontos[i + 1].countryCode,
        });
      }
    }

    return {
      ok: true,
      value: {
        provider: this.id,
        providerRouteId: `sim-${km}-${request.vehicle.axleCount}`,
        toll: { known: true, amount: total, currency: request.currency },
        plazas,
        plazasComplete: true,
        loadedDistanceKm: km,
        durationMinutes: Math.round((km / 60) * 60),
        borderCrossings: fronteiras,
        // Validade curta de propósito: cotação simulada não deve parecer durável.
        validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        calculatedAt: agora,
        rawPayload: {
          [SIMULATED_MARKER]: true,
          aviso: "valores ficticios, sem relacao com tarifa oficial",
          km,
          eixos: request.vehicle.axleCount,
        },
      },
    };
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
