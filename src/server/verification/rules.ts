/**
 * Motor de regras da verificação de motorista.
 *
 * Toda decisão nasce AQUI, em função pura. Providers relatam; não decidem.
 * Nada de `similaridade === 1.0` espalhado pelo código.
 */

import {
  VERIFICATION_RULE_VERSION,
  type DriverLicenseState,
  type DriverStatusResult,
  type DriverVerificationDecision,
  type IdentityValidationResult,
  type InternalReasonCode,
  type ProviderFailure,
} from "./types";

export interface RuleInput {
  now: Date;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  consentGranted: boolean;
  consentFailure?: ProviderFailure | null;
  identity?: IdentityValidationResult | null;
  identityFailure?: ProviderFailure | null;
  driverStatus?: DriverStatusResult | null;
  driverStatusFailure?: ProviderFailure | null;
}

export interface RuleOutput {
  decision: DriverVerificationDecision;
  reasonCode: InternalReasonCode;
  ruleVersion: string;
}

function failureToReason(failure: ProviderFailure): InternalReasonCode {
  switch (failure.kind) {
    case "timeout":
      return "PROVIDER_TIMEOUT";
    case "unauthorized":
    case "forbidden":
      return "PROVIDER_UNAUTHORIZED";
    case "rate_limited":
      return "PROVIDER_RATE_LIMITED";
    case "invalid_request":
      return "PROVIDER_INVALID_REQUEST";
    default:
      return "PROVIDER_UNAVAILABLE";
  }
}

export function isLicenseExpired(expiry: string | null, now: Date): boolean {
  return isExpired(expiry, now);
}

function isExpired(expiry: string | null, now: Date): boolean {
  if (!expiry) return false;
  const d = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return d.getTime() < today.getTime();
}

export function decideDriverVerification(input: RuleInput): RuleOutput {
  const v = VERIFICATION_RULE_VERSION;

  // 1. Dados mínimos. Espelha a exigência que review_driver_license já faz.
  if (!input.licenseNumber || input.licenseNumber.trim() === "") {
    return { decision: "manual_review", reasonCode: "MISSING_LICENSE_NUMBER", ruleVersion: v };
  }
  if (!input.licenseExpiry) {
    return { decision: "manual_review", reasonCode: "MISSING_LICENSE_EXPIRY", ruleVersion: v };
  }

  // 2. Vencimento é veredito local e definitivo — não depende de provedor.
  if (isExpired(input.licenseExpiry, input.now)) {
    return { decision: "expired", reasonCode: "LICENSE_EXPIRED", ruleVersion: v };
  }

  // 3. Indisponibilidade externa NUNCA reprova o motorista.
  if (input.consentFailure) {
    return { decision: "provider_error", reasonCode: failureToReason(input.consentFailure), ruleVersion: v };
  }
  if (!input.consentGranted) {
    return { decision: "manual_review", reasonCode: "CONSENT_NOT_GRANTED", ruleVersion: v };
  }
  if (input.identityFailure) {
    return { decision: "provider_error", reasonCode: failureToReason(input.identityFailure), ruleVersion: v };
  }

  // 4. Identidade.
  const identity = input.identity;
  if (!identity) {
    return { decision: "manual_review", reasonCode: "MANUAL_REVIEW_REQUIRED", ruleVersion: v };
  }
  if (!identity.matched) {
    return { decision: "rejected", reasonCode: "IDENTITY_MISMATCH", ruleVersion: v };
  }
  if (identity.confidence === "low") {
    return { decision: "manual_review", reasonCode: "IDENTITY_LOW_CONFIDENCE", ruleVersion: v };
  }
  if (Object.values(identity.fields).some((f) => f === "mismatch")) {
    return { decision: "rejected", reasonCode: "IDENTITY_MISMATCH", ruleVersion: v };
  }
  if (identity.confidence === "medium") {
    return { decision: "manual_review", reasonCode: "IDENTITY_PARTIAL_MATCH", ruleVersion: v };
  }

  // 5. SENATRAN é opcional hoje: ausente não bloqueia; indisponível não reprova.
  if (input.driverStatusFailure) {
    return { decision: "provider_error", reasonCode: failureToReason(input.driverStatusFailure), ruleVersion: v };
  }
  const status = input.driverStatus;
  if (status) {
    if (!status.licenseValid) {
      return { decision: "rejected", reasonCode: "LICENSE_INVALID_AT_SOURCE", ruleVersion: v };
    }
    if (isExpired(status.licenseExpiresAt, input.now)) {
      return { decision: "expired", reasonCode: "LICENSE_EXPIRED", ruleVersion: v };
    }
  }

  return { decision: "approved", reasonCode: "OK_ALL_CHECKS_PASSED", ruleVersion: v };
}

/** Tradução decisão -> estado persistido. Preserva a máquina existente. */
export function decisionToDriverState(
  decision: DriverVerificationDecision,
): { status: DriverLicenseState; isVerified: boolean } {
  switch (decision) {
    case "approved":
      return { status: "approved", isVerified: true };
    case "rejected":
      return { status: "rejected", isVerified: false };
    case "expired":
      return { status: "expired", isVerified: false };
    case "manual_review":
    case "provider_error":
      // provider_error mantém under_review de propósito: indisponibilidade
      // externa não pode reprovar ninguém.
      return { status: "under_review", isVerified: false };
  }
}
