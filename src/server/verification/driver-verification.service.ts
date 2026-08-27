/**
 * DriverVerificationService — orquestra providers, decide e persiste.
 *
 * Depende apenas de PORTAS (interfaces). Não conhece Supabase nem HTTP.
 * É por isso que o motor de decisão é testável sem banco e sem rede.
 */

import { decideDriverVerification, decisionToDriverState, isLicenseExpired } from "./rules";
import { verificationLog } from "./masking";
import {
  VERIFICATION_RULE_VERSION,
  systemClock,
  type Clock,
  type DriverStatusResult,
  type DriverVerificationResult,
  type DriverVerificationRepositoryPort,
  type IdentityValidationResult,
  type ProviderFailure,
  type VerificationAttemptStatus,
  type VerificationProvider,
} from "./types";
import type { GCCProvider } from "./providers/gcc.provider";
import type { DatavalidProvider } from "./providers/datavalid.provider";
import type { SenatranProvider } from "./providers/senatran.provider";

export type ActorRole = "driver" | "admin";

/**
 * Portão de papel, isolado como função pura para ser testável sem HTTP.
 * Shipper e carrier não têm acesso a este fluxo.
 */
export function resolveActorRole(roles: readonly string[]): ActorRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("driver")) return "driver";
  return null;
}

export interface VerifyDriverInput {
  driverId: string;
  /** auth.uid() do solicitante. */
  actorId: string;
  actorRole: ActorRole;
}

export class VerificationAuthorizationError extends Error {
  readonly code = "FORBIDDEN";
}
export class VerificationNotFoundError extends Error {
  readonly code = "NOT_FOUND";
}

export interface DriverVerificationServiceDeps {
  repository: DriverVerificationRepositoryPort;
  gcc: GCCProvider;
  datavalid: DatavalidProvider;
  senatran?: SenatranProvider | null;
  clock?: Clock;
}

export class DriverVerificationService {
  private readonly repo: DriverVerificationRepositoryPort;
  private readonly gcc: GCCProvider;
  private readonly datavalid: DatavalidProvider;
  private readonly senatran: SenatranProvider | null;
  private readonly clock: Clock;

  constructor(deps: DriverVerificationServiceDeps) {
    this.repo = deps.repository;
    this.gcc = deps.gcc;
    this.datavalid = deps.datavalid;
    this.senatran = deps.senatran ?? null;
    this.clock = deps.clock ?? systemClock;
  }

  async verifyDriver(input: VerifyDriverInput): Promise<DriverVerificationResult> {
    const driver = await this.repo.getDriverById(input.driverId);
    if (!driver) throw new VerificationNotFoundError("Driver not found");

    // Autorização em profundidade: a server function já checa, o service
    // checa de novo. Motorista só verifica a si mesmo.
    if (input.actorRole === "driver" && driver.profileId !== input.actorId) {
      throw new VerificationAuthorizationError("Driver can only verify their own record");
    }

    // Idempotência: já aprovado não reconsulta provedor (cada chamada custa).
    if (driver.licenseVerificationStatus === "approved" && driver.isVerified) {
      return {
        driverId: driver.id,
        status: "approved",
        decision: "approved",
        reasonCode: "ALREADY_APPROVED",
        ruleVersion: VERIFICATION_RULE_VERSION,
      };
    }

    const startedAt = this.clock.now();
    await this.repo.updateDriverVerificationState({
      driverId: driver.id,
      status: "under_review",
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
    });

    let lastProvider: VerificationProvider = "manual";
    let consentGranted = false;
    let consentFailure: ProviderFailure | null = null;
    let identity: IdentityValidationResult | null = null;
    let identityFailure: ProviderFailure | null = null;
    let driverStatus: DriverStatusResult | null = null;
    let driverStatusFailure: ProviderFailure | null = null;

    // Pré-checagem local antes de gastar requisição paga. Só chamamos GCC e
    // Datavalid quando existe dado mínimo E a CNH não está vencida — os dois
    // casos são decididos localmente e consultar provedor seria dinheiro fora.
    const hasMinimumData =
      !!driver.licenseNumber && driver.licenseNumber.trim() !== "" && !!driver.licenseExpiry;
    const expiredLocally = isLicenseExpired(driver.licenseExpiry, this.clock.now());

    if (hasMinimumData && !expiredLocally) {
      lastProvider = "gcc";
      const consent = await this.recordStep(driver.id, "gcc", "consent", startedAt, () =>
        this.gcc.createAuthorization({ subjectRef: driver.id, purpose: "driver_license" }),
      );
      if (consent.ok) {
        consentGranted = true;

        lastProvider = "datavalid";
        const identityOutcome = await this.recordStep(driver.id, "datavalid", "identity", startedAt, () =>
          this.datavalid.validateIdentity({
            subjectRef: driver.id,
            authorizationRef: consent.value.authorizationRef,
          }),
        );
        if (identityOutcome.ok) {
          identity = identityOutcome.value;

          if (this.senatran) {
            lastProvider = "senatran";
            const statusOutcome = await this.recordStep(driver.id, "senatran", "driver_license", startedAt, () =>
              this.senatran!.validateDriver({ subjectRef: driver.id }),
            );
            if (statusOutcome.ok) driverStatus = statusOutcome.value;
            else driverStatusFailure = statusOutcome.failure;
          }
        } else {
          identityFailure = identityOutcome.failure;
        }
      } else {
        consentFailure = consent.failure;
      }
    }

    const ruled = decideDriverVerification({
      now: this.clock.now(),
      licenseNumber: driver.licenseNumber,
      licenseExpiry: driver.licenseExpiry,
      consentGranted,
      consentFailure,
      identity,
      identityFailure,
      driverStatus,
      driverStatusFailure,
    });

    const state = decisionToDriverState(ruled.decision);
    const completedAt = this.clock.now();

    // Evento final de decisão. Um INSERT, escrito com o desfecho já definido.
    await this.repo.recordVerificationEvent({
      driverId: driver.id,
      provider: lastProvider,
      verificationType: "driver_license",
      status: ruled.decision === "provider_error" ? "failed" : "completed",
      decision: ruled.decision,
      providerReference: identity?.providerReference ?? null,
      resultCode: identity?.resultCode ?? null,
      internalReasonCode: ruled.reasonCode,
      ruleVersion: ruled.ruleVersion,
      decidedBy: "system",
      requestedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      expiresAt: ruled.decision === "approved" ? driver.licenseExpiry : null,
    });

    await this.repo.updateDriverVerificationState({
      driverId: driver.id,
      status: state.status,
      isVerified: state.isVerified,
      verifiedAt: state.isVerified ? completedAt.toISOString() : null,
      verifiedBy: state.isVerified ? input.actorId : null,
    });

    verificationLog("decision", {
      driverId: driver.id,
      decision: ruled.decision,
      reasonCode: ruled.reasonCode,
      ruleVersion: ruled.ruleVersion,
      provider: lastProvider,
    });

    return {
      driverId: driver.id,
      status: state.status,
      decision: ruled.decision,
      reasonCode: ruled.reasonCode,
      ruleVersion: ruled.ruleVersion,
    };
  }

  /**
   * Executa a chamada ao provedor e grava UM evento com o desfecho.
   *
   * O evento é escrito depois da chamada, nunca antes. Isso é o que torna a
   * tabela append-only de verdade — não existe linha "em aberto" para
   * atualizar depois. O preço: se o processo morrer no meio da chamada, não
   * fica registro da tentativa. Aceitável aqui, porque a reconciliação de
   * cobrança com o provedor se faz pela fatura dele, não pela nossa trilha.
   */
  private async recordStep<T>(
    driverId: string,
    provider: VerificationProvider,
    verificationType: "consent" | "identity" | "driver_license",
    requestedAt: Date,
    call: () => Promise<{ ok: true; value: T } | { ok: false; failure: ProviderFailure }>,
  ): Promise<{ ok: true; value: T } | { ok: false; failure: ProviderFailure }> {
    const outcome = await call();
    const status: VerificationAttemptStatus = outcome.ok ? "completed" : "failed";

    await this.repo.recordVerificationEvent({
      driverId,
      provider,
      verificationType,
      status,
      decision: null,
      providerReference:
        outcome.ok && typeof outcome.value === "object" && outcome.value !== null
          ? ((outcome.value as { providerReference?: string }).providerReference ?? null)
          : null,
      resultCode: outcome.ok
        ? ((outcome.value as { resultCode?: string }).resultCode ?? null)
        : outcome.failure.resultCode,
      internalReasonCode: null,
      ruleVersion: VERIFICATION_RULE_VERSION,
      decidedBy: "system",
      requestedAt: requestedAt.toISOString(),
      completedAt: this.clock.now().toISOString(),
      expiresAt: null,
    });

    return outcome;
  }
}
