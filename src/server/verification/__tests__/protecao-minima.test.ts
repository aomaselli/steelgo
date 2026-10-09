/**
 * Proteção mínima do módulo de validação.
 *
 * Duas invariantes, provadas aqui em vez de supostas:
 *
 *   1. nenhum provider simulado é aceito em modo de integração real — nem pelo
 *      modo, nem embutido na fábrica;
 *   2. fonte obrigatória ausente ou indisponível nunca produz aprovação.
 *
 * E a consequência das duas: implementar o Datavalid não habilita aprovação
 * apoiada em GCC falsa nem em habilitação não conferida.
 *
 * Sem rede, sem banco, sem documento real.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  assertProviderNaoSimulado,
  buildVerificationProviders,
  DatavalidSerproProvider,
  FakeDatavalidProvider,
  FakeGCCProvider,
  FakeSenatranProvider,
  SimulatedProviderInRealModeError,
  type VerificationProviderMode,
} from "../providers";
import { avaliarHabilitacao, avaliarIdentidade, compor, decideDriverVerification } from "../rules";
import type { BlockOutcome, BlockStatus, IdentityValidationResult, ProviderFailure } from "../types";

const NOW = new Date("2026-10-08T12:00:00.000Z");

/** Ambiente mínimo para a fábrica chegar até a conferência de providers. */
function envReal(mode: "sandbox" | "production"): NodeJS.ProcessEnv {
  return {
    VERIFICATION_PROVIDER_MODE: mode,
    DATAVALID_BASE_URL: "https://exemplo.invalido",
    DATAVALID_CLIENT_ID: "id-de-teste",
    DATAVALID_CLIENT_SECRET: "segredo-de-teste",
    DATAVALID_RFB_TEMPLATE_ID: "template-de-teste",
  } as NodeJS.ProcessEnv;
}

// ═════════════════════════ 1. nenhum fake em modo real ═════════════════════

test("fábrica: sandbox não inicializa enquanto a GCC embutida for fake", () => {
  assert.throws(
    () => buildVerificationProviders(envReal("sandbox")),
    (e: unknown) => e instanceof SimulatedProviderInRealModeError && e.slot === "gcc",
  );
});

test("fábrica: production não inicializa enquanto a GCC embutida for fake", () => {
  assert.throws(
    () => buildVerificationProviders(envReal("production")),
    (e: unknown) => e instanceof SimulatedProviderInRealModeError && e.slot === "gcc",
  );
});

test("fábrica: modo fake continua proibido em runtime de produção", () => {
  assert.throws(
    () =>
      buildVerificationProviders({
        VERIFICATION_PROVIDER_MODE: "fake",
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv),
    /proibido em produção/,
  );
});

test("fábrica: modo fake fora de produção monta, e traz fonte de habilitação", () => {
  const p = buildVerificationProviders({
    VERIFICATION_PROVIDER_MODE: "fake",
  } as NodeJS.ProcessEnv);
  assert.equal(p.mode, "fake");
  assert.equal(p.gcc.simulated, true);
  assert.equal(p.datavalid.simulated, true);
  // Fonte presente no modo fake: sem ela, nem em teste se aprova alguém.
  assert.notEqual(p.senatran, null);
});

for (const mode of ["sandbox", "production"] as const) {
  test(`barreira: cada slot simulado é recusado em ${mode}`, () => {
    const casos: Array<[string, { simulated: boolean }]> = [
      ["gcc", new FakeGCCProvider("granted")],
      ["datavalid", new FakeDatavalidProvider("match_high")],
      ["senatran", new FakeSenatranProvider("valid")],
    ];
    for (const [slot, provider] of casos) {
      assert.throws(
        () => assertProviderNaoSimulado(slot, provider, mode),
        (e: unknown) => e instanceof SimulatedProviderInRealModeError && e.slot === slot,
        `slot ${slot} deveria ser recusado em ${mode}`,
      );
    }
  });
}

test("barreira: fake que MENTE sobre `simulated` ainda é pego pelo nome da classe", () => {
  // O caso realista não é malícia: é copiar e colar e esquecer de trocar.
  class FakeMentiroso {
    readonly simulated = false as const;
  }
  assert.throws(
    () => assertProviderNaoSimulado("gcc", new FakeMentiroso(), "production"),
    (e: unknown) => e instanceof SimulatedProviderInRealModeError && /FakeMentiroso/.test(e.message),
  );
});

test("barreira: provider real passa, e o modo fake não aplica a barreira", () => {
  const real = new DatavalidSerproProvider({
    baseUrl: "https://exemplo.invalido",
    clientId: "x",
    clientSecret: "y",
    rfbTemplateId: "z",
    timeoutMs: 1000,
  });
  assert.equal(real.simulated, false);
  assert.doesNotThrow(() => assertProviderNaoSimulado("datavalid", real, "production"));
  // Em modo fake a barreira não se aplica — é o modo em que fakes existem.
  assert.doesNotThrow(() =>
    assertProviderNaoSimulado("gcc", new FakeGCCProvider("granted"), "fake"),
  );
});

test("barreira: slot vazio não é falso-positivo", () => {
  const modos: VerificationProviderMode[] = ["fake", "sandbox", "production"];
  for (const m of modos) {
    assert.doesNotThrow(() => assertProviderNaoSimulado("senatran", null, m));
  }
});

// ═══════════════ 2. fonte obrigatória ausente nunca aprova ═════════════════

const baseRegra = {
  now: NOW,
  licenseNumber: "12345678901",
  licenseExpiry: "2030-01-01",
  consentGranted: true,
  identity: {
    matched: true,
    confidence: "high",
    fields: { nome: "match", nascimento: "match" },
    providerReference: "ref",
    resultCode: "ok",
  } as IdentityValidationResult,
};

test("habilitação: fonte não configurada dá inconclusivo, nunca aprovado", () => {
  const bloco = avaliarHabilitacao({ ...baseRegra, drivingLicenseSourceConfigured: false });
  assert.equal(bloco.status, "inconclusive");
  assert.equal(bloco.reasonCode, "SOURCE_NOT_CONFIGURED");
});

test("habilitação: fonte indisponível dá inconclusivo, nunca reprovação", () => {
  const falha: ProviderFailure = {
    kind: "unavailable",
    resultCode: "X_HTTP_503",
    retryable: true,
  };
  const bloco = avaliarHabilitacao({
    ...baseRegra,
    drivingLicenseSourceConfigured: true,
    driverStatusFailure: falha,
  });
  assert.equal(bloco.status, "inconclusive");
  assert.equal(bloco.reasonCode, "PROVIDER_UNAVAILABLE");
});

test("composto: identidade perfeita + habilitação sem fonte NÃO aprova", () => {
  const r = decideDriverVerification({ ...baseRegra, drivingLicenseSourceConfigured: false });
  assert.notEqual(r.decision, "approved");
  assert.equal(r.decision, "manual_review");
  assert.equal(r.reasonCode, "SOURCE_NOT_CONFIGURED");
});

// ════ 3. Datavalid implementado não aprova com GCC falsa nem sem habilitação ═

test("Datavalid real não basta: com a GCC ainda falsa, a fábrica recusa subir", () => {
  // Mesmo com o Datavalid real configurado por ambiente, sandbox e produção
  // param — porque a autorização continua simulada. É o cenário exato de
  // "implementar o Datavalid e achar que acabou".
  for (const mode of ["sandbox", "production"] as const) {
    const erro = (() => {
      try {
        buildVerificationProviders(envReal(mode));
        return null;
      } catch (e) {
        return e as SimulatedProviderInRealModeError;
      }
    })();
    assert.ok(erro, `${mode} deveria ter recusado`);
    assert.equal(erro.slot, "gcc");
  }
});

test("Datavalid real não basta: consentimento concedido e identidade ótima, sem fonte de habilitação, não aprova", () => {
  const identidade = avaliarIdentidade({ ...baseRegra, drivingLicenseSourceConfigured: false });
  assert.equal(identidade.status, "approved");

  const r = decideDriverVerification({ ...baseRegra, drivingLicenseSourceConfigured: false });
  assert.notEqual(r.decision, "approved");
});

test("consentimento não concedido não aprova, mesmo com identidade e habilitação boas", () => {
  const r = decideDriverVerification({
    ...baseRegra,
    consentGranted: false,
    drivingLicenseSourceConfigured: true,
    driverStatus: {
      licenseValid: true,
      licenseExpiresAt: "2030-01-01",
      category: "E",
      restrictions: [],
      hasImpediment: false,
      providerReference: "ref",
      resultCode: "ok",
    },
  });
  assert.notEqual(r.decision, "approved");
  assert.equal(r.reasonCode, "CONSENT_NOT_GRANTED");
});

// ═════════════════════ 4. blocos preservados e separados ═══════════════════

test("blocos: identidade e habilitação aparecem separadas, com resultado próprio", () => {
  const r = decideDriverVerification({ ...baseRegra, drivingLicenseSourceConfigured: false });
  const porBloco = Object.fromEntries(r.blocks.map((b) => [b.block, b]));

  assert.equal(r.blocks.length, 2);
  assert.equal(porBloco.identity.status, "approved");
  assert.equal(porBloco.driving_license.status, "inconclusive");
  // A leitura que importa: identidade aprovada NÃO torna o motorista habilitado.
  assert.notEqual(r.decision, "approved");
});

test("composição: só aprova quando TODOS os blocos aprovam — exaustivo", () => {
  const estados: BlockStatus[] = ["approved", "rejected", "expired", "inconclusive"];
  const motivo = { approved: "OK_ALL_CHECKS_PASSED", rejected: "IDENTITY_MISMATCH",
                   expired: "LICENSE_EXPIRED", inconclusive: "SOURCE_NOT_CONFIGURED" } as const;

  for (const a of estados) {
    for (const b of estados) {
      const blocks: BlockOutcome[] = [
        { block: "identity", status: a, reasonCode: motivo[a] },
        { block: "driving_license", status: b, reasonCode: motivo[b] },
      ];
      const { decision } = compor(blocks);
      const todosAprovados = a === "approved" && b === "approved";
      assert.equal(
        decision === "approved",
        todosAprovados,
        `identidade=${a} habilitacao=${b} produziu ${decision}`,
      );
    }
  }
});

test("composição: indisponibilidade vira provider_error, não reprovação", () => {
  const { decision } = compor([
    { block: "identity", status: "inconclusive", reasonCode: "PROVIDER_UNAVAILABLE" },
    { block: "driving_license", status: "inconclusive", reasonCode: "NOT_EVALUATED" },
  ]);
  assert.equal(decision, "provider_error");
});

test("composição: reprovação de um bloco prevalece sobre aprovação de outro", () => {
  const { decision, reasonCode } = compor([
    { block: "identity", status: "approved", reasonCode: "OK_ALL_CHECKS_PASSED" },
    { block: "driving_license", status: "rejected", reasonCode: "LICENSE_INVALID_AT_SOURCE" },
  ]);
  assert.equal(decision, "rejected");
  assert.equal(reasonCode, "LICENSE_INVALID_AT_SOURCE");
});
