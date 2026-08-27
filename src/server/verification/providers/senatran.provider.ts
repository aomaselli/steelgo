/**
 * SenatranProvider — Consulta Online SENATRAN.
 *
 * Integração DISTINTA do Datavalid. Poderá futuramente consultar RENACH,
 * RENAVAM e RENAINF conforme contratação e autorização.
 *
 * Provavelmente exige mTLS com certificado ICP-Brasil e-CNPJ. Por isso esta
 * camada roda em server function no runtime Node do Nitro, e não em Edge
 * Function Deno.
 */

import type { DriverStatusResult, ProviderOutcome } from "../types";

export interface SenatranDriverRequest {
  /** Identificador interno do motorista. Nunca CPF. */
  subjectRef: string;
}

export interface SenatranProvider {
  readonly name: "senatran";
  validateDriver(
    input: SenatranDriverRequest,
  ): Promise<ProviderOutcome<DriverStatusResult>>;
}

export type FakeSenatranScenario =
  | "valid"
  | "invalid_license"
  | "expired_at_source"
  | "unavailable"
  | "skip";

export class FakeSenatranProvider implements SenatranProvider {
  readonly name = "senatran" as const;

  private readonly scenario: FakeSenatranScenario;

  constructor(scenario: FakeSenatranScenario = "valid") {
    this.scenario = scenario;
  }

  async validateDriver(
    input: SenatranDriverRequest,
  ): Promise<ProviderOutcome<DriverStatusResult>> {
    if (this.scenario === "unavailable") {
      return { ok: false, failure: { kind: "unavailable", resultCode: "SENATRAN_UNAVAILABLE", retryable: true } };
    }

    const base = {
      providerReference: `fake-senatran-${input.subjectRef.slice(0, 8)}`,
      category: "E",
      restrictions: [] as string[],
    };

    if (this.scenario === "invalid_license") {
      return { ok: true, value: { ...base, licenseValid: false, licenseExpiresAt: null, resultCode: "SENATRAN_LICENSE_INVALID" } };
    }
    if (this.scenario === "expired_at_source") {
      return { ok: true, value: { ...base, licenseValid: true, licenseExpiresAt: "2020-01-01", resultCode: "SENATRAN_LICENSE_EXPIRED" } };
    }
    return { ok: true, value: { ...base, licenseValid: true, licenseExpiresAt: null, resultCode: "SENATRAN_OK" } };
  }
}

/**
 * TODO(SENATRAN-REAL): implementar quando a Consulta Online estiver contratada.
 * Precisa de: SENATRAN_BASE_URL, SENATRAN_CLIENT_ID, SENATRAN_CLIENT_SECRET,
 * SENATRAN_CLIENT_CERT_P12_BASE64, SENATRAN_CLIENT_CERT_PASSWORD.
 * O .pfx e reconstruido em memoria a cada invocacao; nunca vai para o repo.
 */
