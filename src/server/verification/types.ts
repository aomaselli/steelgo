/**
 * Identity & Driver Verification — tipos internos da SteelGo.
 *
 * REGRA CENTRAL: nada aqui espelha formato de SERPRO, GCC ou SENATRAN.
 * Cada provider traduz a resposta externa para estes tipos DENTRO do provider.
 * Nenhuma outra camada — service, repository, server function, browser —
 * enxerga payload externo.
 */

/** Versão da regra de decisão. Toda decisão gravada carrega esta versão. */
export const VERIFICATION_RULE_VERSION = "2026.08.27-r1";

/** Decisão interna do motor de regras. */
export type DriverVerificationDecision =
  | "approved"
  | "manual_review"
  | "rejected"
  | "expired"
  | "provider_error";

export type VerificationProvider = "gcc" | "datavalid" | "senatran" | "manual";

export type VerificationType = "consent" | "identity" | "driver_license";

/**
 * Status do EVENTO gravado. Só existe desfecho: a linha é escrita depois da
 * chamada ao provedor, nunca antes. Não há estado "requested" persistido.
 */
export type VerificationAttemptStatus = "completed" | "failed";

/**
 * Estado persistido em drivers.license_verification_status.
 * Preservado exatamente como já existe no banco — nenhum estado novo.
 */
export type DriverLicenseState =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired";

/** Códigos internos. Nunca expõem código de provedor externo ao browser. */
export type InternalReasonCode =
  | "OK_ALL_CHECKS_PASSED"
  | "MISSING_LICENSE_NUMBER"
  | "MISSING_LICENSE_EXPIRY"
  | "LICENSE_EXPIRED"
  | "IDENTITY_MISMATCH"
  | "IDENTITY_LOW_CONFIDENCE"
  | "IDENTITY_PARTIAL_MATCH"
  | "LICENSE_INVALID_AT_SOURCE"
  | "CONSENT_NOT_GRANTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_INVALID_REQUEST"
  | "ALREADY_APPROVED"
  | "MANUAL_REVIEW_REQUIRED";

export type MatchConfidence = "high" | "medium" | "low";
export type FieldMatch = "match" | "mismatch" | "unavailable";

/**
 * Falha de provedor normalizada. `retryable` distingue indisponibilidade
 * externa (não reprova o motorista) de erro de requisição nossa.
 */
export type ProviderFailureKind =
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "rate_limited"
  | "unavailable"
  | "unknown";

export interface ProviderFailure {
  kind: ProviderFailureKind;
  /** Código interno SteelGo. Nunca o corpo bruto do provedor. */
  resultCode: string;
  retryable: boolean;
}

/** Resultado de provider sem exceções: erro é dado, não fluxo de controle. */
export type ProviderOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ProviderFailure };

/** Autorização/consentimento obtido junto à GCC. NUNCA carrega o token. */
export interface GCCAuthorization {
  /** Referência opaca para auditoria. Não é o hash/token de autorização. */
  authorizationRef: string;
  issuedAt: string;
  expiresAt: string;
}

export interface IdentityValidationResult {
  matched: boolean;
  confidence: MatchConfidence;
  /** Por campo, sem valor: só o veredito. */
  fields: Record<string, FieldMatch>;
  providerReference: string;
  resultCode: string;
}

export interface DriverStatusResult {
  licenseValid: boolean;
  licenseExpiresAt: string | null;
  category: string | null;
  restrictions: string[];
  providerReference: string;
  resultCode: string;
}

/** Único formato que chega ao browser. */
export interface DriverVerificationPublicResult {
  status: DriverLicenseState;
  decision: DriverVerificationDecision;
  reasonCode: InternalReasonCode;
}

export interface DriverVerificationResult extends DriverVerificationPublicResult {
  driverId: string;
  ruleVersion: string;
}

/** Projeção mínima do motorista usada pela camada de verificação. */
export interface DriverRecordForVerification {
  id: string;
  profileId: string | null;
  carrierId: string | null;
  cpf: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  licenseIssuerCountry: string | null;
  licenseVerificationStatus: DriverLicenseState;
  isVerified: boolean;
}

/**
 * Um evento = um INSERT. A linha nasce já com o desfecho, o que torna a
 * tabela verdadeiramente append-only: não existe caminho de UPDATE.
 */
export interface RecordVerificationEventInput {
  driverId: string;
  provider: VerificationProvider;
  verificationType: VerificationType;
  status: VerificationAttemptStatus;
  decision: DriverVerificationDecision | null;
  providerReference: string | null;
  resultCode: string | null;
  internalReasonCode: InternalReasonCode | null;
  ruleVersion: string;
  decidedBy: "system" | "admin";
  requestedAt: string;
  completedAt: string;
  expiresAt: string | null;
}

export interface UpdateDriverVerificationStateInput {
  driverId: string;
  status: DriverLicenseState;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

/**
 * Porta do repositório. O Service depende SÓ desta interface — nunca do
 * Supabase. É o que torna o motor de decisão testável sem banco.
 */
export interface DriverVerificationRepositoryPort {
  getDriverById(driverId: string): Promise<DriverRecordForVerification | null>;
  getDriverByProfileId(profileId: string): Promise<DriverRecordForVerification | null>;
  recordVerificationEvent(input: RecordVerificationEventInput): Promise<{ id: string }>;
  updateDriverVerificationState(input: UpdateDriverVerificationStateInput): Promise<void>;
}

/** Relógio injetável — mantém as regras determinísticas em teste. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
