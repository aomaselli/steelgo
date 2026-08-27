/**
 * GCCProvider — Gestora de Consentimento Credenciada.
 *
 * Antes de cada requisição ao Datavalid V5 é preciso obter previamente uma
 * autorização junto a uma GCC credenciada pela SENATRAN. A SteelGo NÃO gera
 * esse token por conta própria.
 *
 * O token/hash de autorização NUNCA sai do provider e NUNCA é persistido.
 * Para fora circula apenas `authorizationRef`, uma referência opaca de
 * auditoria.
 */

import type { GCCAuthorization, ProviderOutcome } from "../types";

export interface GCCAuthorizationRequest {
  /** Identificador interno do motorista. Nunca CPF. */
  subjectRef: string;
  purpose: "identity" | "driver_license";
}

export interface GCCProvider {
  readonly name: "gcc";
  createAuthorization(
    input: GCCAuthorizationRequest,
  ): Promise<ProviderOutcome<GCCAuthorization>>;
}

/** Cenários determinísticos para teste. Não dependem de CPF real. */
export type FakeGCCScenario = "granted" | "denied" | "unavailable" | "timeout";

export class FakeGCCProvider implements GCCProvider {
  readonly name = "gcc" as const;

  private readonly scenario: FakeGCCScenario;
  private readonly now: () => Date;

  constructor(scenario: FakeGCCScenario = "granted", now: () => Date = () => new Date()) {
    this.scenario = scenario;
    this.now = now;
  }

  async createAuthorization(
    input: GCCAuthorizationRequest,
  ): Promise<ProviderOutcome<GCCAuthorization>> {
    if (this.scenario === "unavailable") {
      return { ok: false, failure: { kind: "unavailable", resultCode: "GCC_UNAVAILABLE", retryable: true } };
    }
    if (this.scenario === "timeout") {
      return { ok: false, failure: { kind: "timeout", resultCode: "GCC_TIMEOUT", retryable: true } };
    }
    if (this.scenario === "denied") {
      return { ok: false, failure: { kind: "forbidden", resultCode: "GCC_CONSENT_DENIED", retryable: false } };
    }

    const issued = this.now();
    const expires = new Date(issued.getTime() + 15 * 60 * 1000);
    return {
      ok: true,
      value: {
        authorizationRef: `fake-gcc-${input.purpose}-${input.subjectRef.slice(0, 8)}`,
        issuedAt: issued.toISOString(),
        expiresAt: expires.toISOString(),
      },
    };
  }
}

/**
 * TODO(GCC-REAL): implementar quando a GCC estiver contratada.
 * Precisa de: GCC_BASE_URL, GCC_CLIENT_ID, GCC_CLIENT_SECRET.
 * O bearer da GCC é obtido por requisição e descartado — nunca persistido.
 */
