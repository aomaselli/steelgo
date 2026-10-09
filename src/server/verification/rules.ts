/**
 * Motor de regras da verificação de motorista.
 *
 * Toda decisão nasce AQUI, em função pura. Providers relatam; não decidem.
 * Nada de `similaridade === 1.0` espalhado pelo código.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BLOCOS SEPARADOS
 *
 * Cada bloco responde a UMA pergunta e tem resultado próprio:
 *
 *   identity         a pessoa é quem diz ser?
 *   driving_license  esta pessoa está habilitada a dirigir?
 *
 * Aprovar identidade NÃO torna ninguém habilitado, e habilitado não significa
 * apto a uma viagem — aptidão é a composição de mais blocos, na etapa 5.
 * O composto nunca é mais permissivo que o bloco mais fraco.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FONTES OBRIGATÓRIAS
 *
 *   identity         autorização de consulta  +  validação de identidade
 *   driving_license  dado local  +  conferência na fonte
 *
 * Fonte obrigatória ausente ou indisponível produz `inconclusive`. Nunca
 * `approved`.
 *
 * Antes, `senatran === null` fazia o passo de habilitação ser pulado em
 * silêncio e a decisão chegava a `approved` sem conferência alguma na fonte. O
 * comentário que estava aqui — "SENATRAN é opcional hoje: ausente não bloqueia"
 * — descrevia o defeito com precisão.
 */

import {
  VERIFICATION_RULE_VERSION,
  type BlockOutcome,
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
  /**
   * A fonte de habilitação existe nesta instalação?
   *
   * Separa duas coisas que antes se confundiam no mesmo `null`: provedor
   * contratado que falhou (indisponibilidade) e provedor que nem existe (não
   * configurado). As duas dão inconclusivo, por motivos diferentes — e o
   * motivo precisa aparecer para quem for destravar.
   */
  drivingLicenseSourceConfigured: boolean;
}

export interface RuleOutput {
  decision: DriverVerificationDecision;
  reasonCode: InternalReasonCode;
  ruleVersion: string;
  blocks: BlockOutcome[];
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

/** Indisponibilidade externa, distinguida de qualquer outro inconclusivo. */
function ehFalhaDeProvedor(reason: InternalReasonCode): boolean {
  return reason.startsWith("PROVIDER_");
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

// ───────────────────────────────── blocos ──────────────────────────────────

/** Bloco IDENTIDADE: autorização de consulta + validação de identidade. */
export function avaliarIdentidade(input: RuleInput): BlockOutcome {
  const bloco = "identity" as const;

  // Indisponibilidade externa nunca reprova.
  if (input.consentFailure) {
    return { block: bloco, status: "inconclusive", reasonCode: failureToReason(input.consentFailure) };
  }
  if (!input.consentGranted) {
    return { block: bloco, status: "inconclusive", reasonCode: "CONSENT_NOT_GRANTED" };
  }
  if (input.identityFailure) {
    return { block: bloco, status: "inconclusive", reasonCode: failureToReason(input.identityFailure) };
  }

  const identity = input.identity;
  if (!identity) {
    return { block: bloco, status: "inconclusive", reasonCode: "MANUAL_REVIEW_REQUIRED" };
  }
  if (!identity.matched) {
    return { block: bloco, status: "rejected", reasonCode: "IDENTITY_MISMATCH" };
  }
  if (identity.confidence === "low") {
    return { block: bloco, status: "inconclusive", reasonCode: "IDENTITY_LOW_CONFIDENCE" };
  }
  if (Object.values(identity.fields).some((f) => f === "mismatch")) {
    return { block: bloco, status: "rejected", reasonCode: "IDENTITY_MISMATCH" };
  }
  if (identity.confidence === "medium") {
    return { block: bloco, status: "inconclusive", reasonCode: "IDENTITY_PARTIAL_MATCH" };
  }
  return { block: bloco, status: "approved", reasonCode: "OK_ALL_CHECKS_PASSED" };
}

/** Bloco HABILITAÇÃO: dado local + conferência na fonte. */
export function avaliarHabilitacao(input: RuleInput): BlockOutcome {
  const bloco = "driving_license" as const;

  // 1. Dado mínimo. Espelha a exigência que review_driver_license já faz.
  if (!input.licenseNumber || input.licenseNumber.trim() === "") {
    return { block: bloco, status: "inconclusive", reasonCode: "MISSING_LICENSE_NUMBER" };
  }
  if (!input.licenseExpiry) {
    return { block: bloco, status: "inconclusive", reasonCode: "MISSING_LICENSE_EXPIRY" };
  }

  // 2. Vencimento é veredito local e definitivo — não depende de provedor.
  if (isExpired(input.licenseExpiry, input.now)) {
    return { block: bloco, status: "expired", reasonCode: "LICENSE_EXPIRED" };
  }

  // 3. Conferência na fonte é OBRIGATÓRIA para aprovar este bloco.
  if (!input.drivingLicenseSourceConfigured) {
    return { block: bloco, status: "inconclusive", reasonCode: "SOURCE_NOT_CONFIGURED" };
  }
  if (input.driverStatusFailure) {
    return { block: bloco, status: "inconclusive", reasonCode: failureToReason(input.driverStatusFailure) };
  }
  const status = input.driverStatus;
  if (!status) {
    // Fonte configurada, sem falha declarada e sem resultado: o fluxo parou
    // antes de chegar aqui, porque a identidade não concluiu. Não se aprova no
    // escuro, e o motivo diz exatamente isso em vez de fingir que alguém
    // precisa revisar a habilitação.
    return { block: bloco, status: "inconclusive", reasonCode: "NOT_EVALUATED" };
  }
  if (!status.licenseValid) {
    return { block: bloco, status: "rejected", reasonCode: "LICENSE_INVALID_AT_SOURCE" };
  }

  // Impedimento confirmado reprova — ANTES de qualquer caminho que aprove.
  //
  // O exemplo oficial do Datavalid envia `possui_impedimento: true` e recebe
  // `true`: a base CONFIRMA que há impedimento. Um motor que lesse booleanos
  // soltos aprovaria esse caso.
  if (status.hasImpediment === true) {
    return { block: bloco, status: "rejected", reasonCode: "LICENSE_IMPEDIMENT" };
  }
  // `null` é inconclusivo: a base não confirmou o valor declarado e não diz
  // qual é o correto. Não se aprova sem saber.
  if (status.hasImpediment === null || status.hasImpediment === undefined) {
    return { block: bloco, status: "inconclusive", reasonCode: "LICENSE_STATUS_UNCONFIRMED" };
  }

  if (isExpired(status.licenseExpiresAt, input.now)) {
    return { block: bloco, status: "expired", reasonCode: "LICENSE_EXPIRED" };
  }
  return { block: bloco, status: "approved", reasonCode: "OK_ALL_CHECKS_PASSED" };
}

// ──────────────────────────────── composição ────────────────────────────────

/** Severidade: o composto segue o bloco mais grave. */
const ORDEM: Record<BlockOutcome["status"], number> = {
  rejected: 3,
  expired: 2,
  inconclusive: 1,
  approved: 0,
};

/**
 * Desempate entre blocos de MESMA gravidade — decide só qual motivo resume o
 * composto. Não altera a decisão, e `blocks` continua trazendo os dois
 * inteiros.
 *
 * A ordem não é estética. Quem lê o resumo quer saber o que fazer a seguir:
 *
 *  1. dado local faltando — a causa raiz, a mais barata de corrigir, e
 *     decidida antes de qualquer provedor;
 *  2. achado sobre a pessoa — o que a consulta de fato encontrou;
 *  3. indisponibilidade externa — passa sozinha;
 *  4. consentimento não concedido — que também é o estado quando nem se
 *     chegou a pedir, porque um passo local anterior interrompeu o fluxo;
 *  5. fonte não configurada — lacuna nossa, não diz nada sobre o motorista.
 */
const PRIORIDADE_DO_MOTIVO: Partial<Record<InternalReasonCode, number>> = {
  MISSING_LICENSE_NUMBER: 50,
  MISSING_LICENSE_EXPIRY: 50,
  IDENTITY_LOW_CONFIDENCE: 40,
  IDENTITY_PARTIAL_MATCH: 40,
  LICENSE_IMPEDIMENT: 45,
  LICENSE_STATUS_UNCONFIRMED: 38,
  MANUAL_REVIEW_REQUIRED: 35,
  PROVIDER_TIMEOUT: 30,
  PROVIDER_UNAVAILABLE: 30,
  PROVIDER_UNAUTHORIZED: 30,
  PROVIDER_RATE_LIMITED: 30,
  PROVIDER_INVALID_REQUEST: 30,
  CONSENT_NOT_GRANTED: 20,
  SOURCE_NOT_CONFIGURED: 10,
  NOT_EVALUATED: 5,
};

function prioridade(reason: InternalReasonCode): number {
  return PRIORIDADE_DO_MOTIVO[reason] ?? 0;
}

/**
 * Compõe os blocos num veredito único.
 *
 * Nunca mais permissivo que o bloco mais fraco. Identidade aprovada com
 * habilitação inconclusiva dá, no máximo, revisão — nunca aprovado.
 */
export function compor(blocks: BlockOutcome[]): {
  decision: DriverVerificationDecision;
  reasonCode: InternalReasonCode;
} {
  const pior = blocks.reduce((a, b) => {
    if (ORDEM[b.status] !== ORDEM[a.status]) return ORDEM[b.status] > ORDEM[a.status] ? b : a;
    return prioridade(b.reasonCode) > prioridade(a.reasonCode) ? b : a;
  });

  switch (pior.status) {
    case "rejected":
      return { decision: "rejected", reasonCode: pior.reasonCode };
    case "expired":
      return { decision: "expired", reasonCode: pior.reasonCode };
    case "inconclusive":
      return {
        // Indisponibilidade externa é `provider_error`; o resto é revisão.
        // Nenhum dos dois libera nada.
        decision: ehFalhaDeProvedor(pior.reasonCode) ? "provider_error" : "manual_review",
        reasonCode: pior.reasonCode,
      };
    case "approved":
      return { decision: "approved", reasonCode: "OK_ALL_CHECKS_PASSED" };
  }
}

export function decideDriverVerification(input: RuleInput): RuleOutput {
  // Identidade primeiro: no empate de gravidade, o  mantem o
  // primeiro, e um achado SOBRE A PESSOA informa mais do que uma lacuna de
  // infraestrutura como SOURCE_NOT_CONFIGURED. Os dois blocos aparecem
  // inteiros em ; isto decide so qual motivo resume o composto.
  const blocks = [avaliarIdentidade(input), avaliarHabilitacao(input)];
  const { decision, reasonCode } = compor(blocks);
  return { decision, reasonCode, ruleVersion: VERIFICATION_RULE_VERSION, blocks };
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
