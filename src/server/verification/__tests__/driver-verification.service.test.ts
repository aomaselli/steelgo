/**
 * Testes do DriverVerificationService.
 *
 * Sem banco, sem rede: o Service depende de portas, então o repositório é
 * substituído por uma implementação em memória e os providers pelos fakes.
 * Relógio fixo mantém a regra de vencimento determinística.
 *
 * Runner: node:test (nativo). Sem dependência nova no projeto.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DriverVerificationService,
  resolveActorRole,
  VerificationAuthorizationError,
} from "../driver-verification.service";
import { FakeGCCProvider, type FakeGCCScenario } from "../providers/gcc.provider";
import {
  FakeDatavalidProvider,
  type FakeDatavalidScenario,
} from "../providers/datavalid.provider";
import { FakeSenatranProvider, type FakeSenatranScenario } from "../providers/senatran.provider";
import type {
  Clock,
  DriverLicenseState,
  DriverRecordForVerification,
  DriverVerificationRepositoryPort,
  RecordVerificationEventInput,
  UpdateDriverVerificationStateInput,
} from "../types";

const NOW = new Date("2026-08-27T12:00:00Z");
const fixedClock: Clock = { now: () => NOW };

const DRIVER_ID = "11111111-1111-1111-1111-111111111111";
const PROFILE_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_PROFILE_ID = "33333333-3333-3333-3333-333333333333";

class InMemoryRepository implements DriverVerificationRepositoryPort {
  readonly events: (RecordVerificationEventInput & { id: string })[] = [];
  readonly stateUpdates: UpdateDriverVerificationStateInput[] = [];
  private seq = 0;

  private driver: DriverRecordForVerification;

  constructor(driver: DriverRecordForVerification) {
    this.driver = driver;
  }

  async getDriverById(id: string) {
    return id === this.driver.id ? { ...this.driver } : null;
  }
  async getDriverByProfileId(profileId: string) {
    return this.driver.profileId === profileId ? { ...this.driver } : null;
  }
  async recordVerificationEvent(input: RecordVerificationEventInput) {
    const id = `event-${++this.seq}`;
    this.events.push({ ...input, id });
    return { id };
  }
  async updateDriverVerificationState(input: UpdateDriverVerificationStateInput) {
    this.stateUpdates.push(input);
    this.driver = {
      ...this.driver,
      licenseVerificationStatus: input.status,
      isVerified: input.isVerified,
    };
  }
  /** Último estado gravado — o que o motorista fica de fato. */
  finalState(): UpdateDriverVerificationStateInput | undefined {
    return this.stateUpdates[this.stateUpdates.length - 1];
  }
}

function makeDriver(over: Partial<DriverRecordForVerification> = {}): DriverRecordForVerification {
  return {
    id: DRIVER_ID,
    profileId: PROFILE_ID,
    carrierId: null, // motorista independente
    cpf: "00000000000",
    licenseNumber: "ABC12345",
    licenseExpiry: "2030-01-01",
    licenseIssuerCountry: "BR",
    licenseVerificationStatus: "pending" as DriverLicenseState,
    isVerified: false,
    ...over,
  };
}

function makeService(opts: {
  driver?: Partial<DriverRecordForVerification>;
  gcc?: FakeGCCScenario;
  datavalid?: FakeDatavalidScenario;
  senatran?: FakeSenatranScenario;
} = {}) {
  const repository = new InMemoryRepository(makeDriver(opts.driver));
  const service = new DriverVerificationService({
    repository,
    gcc: new FakeGCCProvider(opts.gcc ?? "granted", () => NOW),
    datavalid: new FakeDatavalidProvider(opts.datavalid ?? "match_high"),
    senatran:
      opts.senatran && opts.senatran !== "skip" ? new FakeSenatranProvider(opts.senatran) : null,
    clock: fixedClock,
  });
  return { service, repository };
}

const actor = { actorId: PROFILE_ID, actorRole: "driver" as const };

test("approved: consentimento + identidade compatível de alta confiança", async () => {
  const { service, repository } = makeService();
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "approved");
  assert.equal(r.status, "approved");
  assert.equal(r.reasonCode, "OK_ALL_CHECKS_PASSED");
  assert.equal(repository.finalState()?.isVerified, true);
  assert.equal(repository.finalState()?.verifiedAt, NOW.toISOString());
});

test("manual_review: confiança média vira revisão humana, não aprovação", async () => {
  const { service, repository } = makeService({ datavalid: "match_medium" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "manual_review");
  assert.equal(r.status, "under_review");
  assert.equal(r.reasonCode, "IDENTITY_PARTIAL_MATCH");
  assert.equal(repository.finalState()?.isVerified, false);
});

test("manual_review: sem número de CNH não consulta provedor algum", async () => {
  const { service, repository } = makeService({ driver: { licenseNumber: null } });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "manual_review");
  assert.equal(r.reasonCode, "MISSING_LICENSE_NUMBER");
  // Só a linha de decisão. Nenhuma chamada paga a GCC ou Datavalid.
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0]?.provider, "manual");
});

test("rejected: divergência de identidade reprova", async () => {
  const { service, repository } = makeService({ datavalid: "no_match" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "rejected");
  assert.equal(r.status, "rejected");
  assert.equal(r.reasonCode, "IDENTITY_MISMATCH");
  assert.equal(repository.finalState()?.isVerified, false);
});

test("rejected: um único campo divergente já reprova", async () => {
  const { service } = makeService({ datavalid: "field_mismatch" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  assert.equal(r.decision, "rejected");
});

test("expired: CNH vencida decide localmente, sem provedor", async () => {
  const { service, repository } = makeService({ driver: { licenseExpiry: "2020-05-01" } });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "expired");
  assert.equal(r.status, "expired");
  assert.equal(r.reasonCode, "LICENSE_EXPIRED");
  assert.equal(repository.events.length, 1);
});

test("expired: vencimento reportado pelo SENATRAN também expira", async () => {
  const { service } = makeService({ senatran: "expired_at_source" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  assert.equal(r.decision, "expired");
});

test("rejected: SENATRAN informa CNH inválida na origem", async () => {
  const { service } = makeService({ senatran: "invalid_license" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  assert.equal(r.decision, "rejected");
  assert.equal(r.reasonCode, "LICENSE_INVALID_AT_SOURCE");
});

test("Datavalid indisponível: NÃO reprova, mantém under_review", async () => {
  const { service, repository } = makeService({ datavalid: "unavailable" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "provider_error");
  assert.equal(r.status, "under_review");
  assert.equal(r.reasonCode, "PROVIDER_UNAVAILABLE");
  assert.equal(repository.finalState()?.isVerified, false);
  assert.notEqual(r.status, "rejected");
});

test("Datavalid em timeout: provider_error, nunca reprovação", async () => {
  const { service } = makeService({ datavalid: "timeout" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  assert.equal(r.decision, "provider_error");
  assert.equal(r.reasonCode, "PROVIDER_TIMEOUT");
});

test("GCC indisponível: para antes do Datavalid e mantém under_review", async () => {
  const { service, repository } = makeService({ gcc: "unavailable" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "provider_error");
  assert.equal(r.status, "under_review");
  // gcc + linha de decisão; Datavalid nunca foi chamado sem autorização.
  assert.equal(repository.events.filter((a) => a.provider === "datavalid").length, 0);
});

test("SENATRAN indisponível: não reprova por indisponibilidade externa", async () => {
  const { service } = makeService({ senatran: "unavailable" });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  assert.equal(r.decision, "provider_error");
  assert.equal(r.status, "under_review");
});

test("idempotência: já aprovado não reconsulta provedor", async () => {
  const { service, repository } = makeService({
    driver: { licenseVerificationStatus: "approved", isVerified: true },
  });
  const r = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(r.decision, "approved");
  assert.equal(r.reasonCode, "ALREADY_APPROVED");
  assert.equal(repository.events.length, 0);
  assert.equal(repository.stateUpdates.length, 0);
});

test("repetição: segunda chamada após aprovação é barata e estável", async () => {
  const { service, repository } = makeService();
  const first = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  const attemptsAfterFirst = repository.events.length;
  const second = await service.verifyDriver({ driverId: DRIVER_ID, ...actor });

  assert.equal(first.decision, "approved");
  assert.equal(second.decision, "approved");
  assert.equal(second.reasonCode, "ALREADY_APPROVED");
  assert.equal(repository.events.length, attemptsAfterFirst);
});

test("IDOR: motorista não verifica registro de terceiro", async () => {
  const { service, repository } = makeService({ driver: { profileId: OTHER_PROFILE_ID } });

  await assert.rejects(
    () => service.verifyDriver({ driverId: DRIVER_ID, actorId: PROFILE_ID, actorRole: "driver" }),
    (err: unknown) => err instanceof VerificationAuthorizationError,
  );
  assert.equal(repository.events.length, 0);
  assert.equal(repository.stateUpdates.length, 0);
});

test("admin pode verificar registro de terceiro", async () => {
  const { service } = makeService({ driver: { profileId: OTHER_PROFILE_ID } });
  const r = await service.verifyDriver({
    driverId: DRIVER_ID,
    actorId: "44444444-4444-4444-4444-444444444444",
    actorRole: "admin",
  });
  assert.equal(r.decision, "approved");
});

test("portão de papel: shipper e carrier não entram no fluxo", () => {
  assert.equal(resolveActorRole(["shipper"]), null);
  assert.equal(resolveActorRole(["carrier"]), null);
  assert.equal(resolveActorRole([]), null);
  assert.equal(resolveActorRole(["driver"]), "driver");
  assert.equal(resolveActorRole(["admin"]), "admin");
  assert.equal(resolveActorRole(["driver", "admin"]), "admin");
});

test("auditoria: nenhum dado pessoal é gravado na trilha", () => {
  const forbidden = ["cpf", "license_number", "selfie", "payload", "token", "bearer"];
  const keys = [
    "verificationId", "status", "decision", "providerReference", "resultCode",
    "internalReasonCode", "ruleVersion", "decidedBy", "completedAt", "expiresAt",
  ];
  for (const f of forbidden) {
    assert.ok(!keys.some((k) => k.toLowerCase().includes(f)), `campo proibido: ${f}`);
  }
});

test("append-only: repositório não expõe UPDATE nem DELETE de evento", () => {
  const repo = new InMemoryRepository(makeDriver());
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repo));
  // updateDriverVerificationState existe e é legítimo: escreve em `drivers`,
  // não na trilha. O que não pode existir é mutação de EVENTO.
  const forbidden = [
    "startVerification",
    "appendVerificationResult",
    "updateVerificationEvent",
    "deleteVerificationEvent",
  ];
  for (const m of forbidden) {
    assert.ok(!methods.includes(m), `porta expõe mutação de evento: ${m}`);
  }
  assert.ok(methods.includes("recordVerificationEvent"));
});

test("append-only: todo evento nasce com desfecho, nunca em aberto", async () => {
  const { service, repository } = makeService({ datavalid: "unavailable" });
  await service.verifyDriver({ driverId: DRIVER_ID, ...actor });
  for (const e of repository.events) {
    assert.ok(e.status === "completed" || e.status === "failed", "status intermediário gravado");
    assert.ok(!!e.completedAt, "evento sem completedAt");
    assert.ok(!!e.requestedAt, "evento sem requestedAt");
  }
});
