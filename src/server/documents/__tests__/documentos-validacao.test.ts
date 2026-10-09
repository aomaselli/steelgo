/**
 * Etapa 1 — proteção dos documentos e consentimento.
 *
 * Testes puros: sem rede, sem banco, sem documento real. A matriz de permissões
 * daqui é a REFERÊNCIA; as policies do banco são a segunda barreira e precisam
 * concordar com esta — a bateria SQL confere isso quando o destino descartável
 * estiver acessível.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  authorizeDocumentAccess,
  consentStatus,
  normalizarTtl,
  TtlInvalidoError,
  TTL_MAXIMO_SEGUNDOS,
  type AccessRequest,
  type ConsentState,
} from "../access";
import {
  avaliarExpurgo,
  POLITICA_NAO_APROVADA,
  RetencaoNaoConfiguradaError,
  selecionarParaExpurgo,
  type RetentionPolicy,
  type StoredDocument,
} from "../retention";
import {
  auditEventForLog,
  buildDocumentAuditEvent,
  SensitiveDataInAuditError,
  type DocumentAuditEvent,
} from "../audit";
import { DOCUMENT_AUDIT_ACTIONS, isBiometric, type ActorRole } from "../types";

const DONO = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-10-08T12:00:00.000Z");

const publicado = {
  purpose: "identity_validation" as const,
  version: "1.0",
  textSha256: "a".repeat(64),
  effectiveFrom: "2026-10-01T00:00:00.000Z",
};

const consentimentoVigente: ConsentState = {
  published: publicado,
  record: {
    subjectId: DONO,
    purpose: "identity_validation",
    version: "1.0",
    textSha256: "a".repeat(64),
    acceptedAt: "2026-10-02T00:00:00.000Z",
  },
};

function pedido(p: Partial<AccessRequest> = {}): AccessRequest {
  return {
    actorId: DONO,
    actorRole: "driver",
    subjectId: DONO,
    objectPurpose: "identity_validation",
    requestedPurpose: "identity_validation",
    ...p,
  };
}

// ═══════════════════════ matriz de permissões ══════════════════════════════

test("matriz: o titular acessa o próprio documento", () => {
  const d = authorizeDocumentAccess(pedido(), consentimentoVigente);
  assert.equal(d.allowed, true);
  assert.equal(d.allowed && d.viewerRole, "owner");
});

test("matriz: o revisor administrativo acessa", () => {
  const d = authorizeDocumentAccess(
    pedido({ actorId: ADMIN, actorRole: "admin" }),
    consentimentoVigente,
  );
  assert.equal(d.allowed, true);
  assert.equal(d.allowed && d.viewerRole, "admin_reviewer");
});

test("matriz: a TRANSPORTADORA não acessa CNH nem selfie", () => {
  // A diferença deliberada em relação a `trip-media`. A transportadora precisa
  // do resultado da validação, não do rosto e do documento do motorista.
  const d = authorizeDocumentAccess(
    pedido({ actorId: OUTRO, actorRole: "carrier" }),
    consentimentoVigente,
  );
  assert.equal(d.allowed, false);
  assert.equal(!d.allowed && d.reason, "ROLE_NOT_ALLOWED_FOR_PURPOSE");
});

test("matriz: o embarcador não acessa", () => {
  const d = authorizeDocumentAccess(
    pedido({ actorId: OUTRO, actorRole: "shipper" }),
    consentimentoVigente,
  );
  assert.equal(d.allowed, false);
});

test("matriz: outro motorista não acessa documento alheio", () => {
  const d = authorizeDocumentAccess(
    pedido({ actorId: OUTRO, actorRole: "driver" }),
    consentimentoVigente,
  );
  assert.equal(d.allowed, false);
  assert.equal(!d.allowed && d.reason, "NOT_OWNER");
});

test("matriz: anônimo é recusado antes de qualquer outra conferência", () => {
  for (const req of [
    pedido({ actorId: null, actorRole: "anon" }),
    pedido({ actorId: null, actorRole: "driver" }),
  ]) {
    const d = authorizeDocumentAccess(req, consentimentoVigente);
    assert.equal(d.allowed, false);
    assert.equal(!d.allowed && d.reason, "ANONYMOUS");
  }
});

test("matriz: varredura exaustiva de papéis — só titular e admin passam", () => {
  const papeis: ActorRole[] = ["driver", "carrier", "shipper", "admin", "anon"];
  const permitidos = new Set(["driver:proprio", "admin:qualquer"]);
  for (const role of papeis) {
    for (const proprio of [true, false]) {
      const actorId = role === "anon" ? null : proprio ? DONO : OUTRO;
      const d = authorizeDocumentAccess(
        pedido({ actorId, actorRole: role, subjectId: DONO }),
        consentimentoVigente,
      );
      const chave = role === "admin" ? "admin:qualquer" : `${role}:${proprio ? "proprio" : "alheio"}`;
      assert.equal(
        d.allowed,
        permitidos.has(chave),
        `papel=${role} proprio=${proprio} devolveu allowed=${d.allowed}`,
      );
    }
  }
});

test("finalidade: documento de uma finalidade não serve a outra", () => {
  const d = authorizeDocumentAccess(
    // Com uma finalidade só hoje, o teste força a divergência para provar que a
    // conferência existe antes de a segunda finalidade aparecer.
    { ...pedido(), objectPurpose: "identity_validation", requestedPurpose: "outra" as never },
    consentimentoVigente,
  );
  assert.equal(d.allowed, false);
  assert.equal(!d.allowed && d.reason, "PURPOSE_MISMATCH");
});

// ═══════════════════════════ consentimento ═════════════════════════════════

test("consentimento: ausente, retirado e desatualizado não liberam — nem para o titular", () => {
  const casos: Array<[string, ConsentState, string]> = [
    ["ausente", { published: publicado, record: null }, "CONSENT_MISSING"],
    [
      "retirado",
      {
        published: publicado,
        record: { ...consentimentoVigente.record!, withdrawnAt: "2026-10-05T00:00:00.000Z" },
      },
      "CONSENT_WITHDRAWN",
    ],
    [
      "versão antiga",
      { published: { ...publicado, version: "2.0" }, record: consentimentoVigente.record },
      "CONSENT_OUTDATED",
    ],
    [
      "mesma versão, corpo diferente",
      { published: { ...publicado, textSha256: "b".repeat(64) }, record: consentimentoVigente.record },
      "CONSENT_OUTDATED",
    ],
  ];
  for (const [nome, estado, motivo] of casos) {
    const d = authorizeDocumentAccess(pedido(), estado);
    assert.equal(d.allowed, false, `${nome} deveria recusar`);
    assert.equal(!d.allowed && d.reason, motivo, nome);
  }
});

test("consentimento: republicar o texto invalida o aceite anterior", () => {
  assert.equal(consentStatus(consentimentoVigente), "current");
  const depoisDaRepublicacao: ConsentState = {
    published: { ...publicado, version: "1.1", textSha256: "c".repeat(64) },
    record: consentimentoVigente.record,
  };
  assert.equal(consentStatus(depoisDaRepublicacao), "outdated");
});

test("consentimento: o aceite guarda finalidade, versão, hash e data", () => {
  const r = consentimentoVigente.record!;
  assert.equal(r.purpose, "identity_validation");
  assert.equal(r.version, "1.0");
  assert.equal(r.textSha256.length, 64);
  assert.ok(!Number.isNaN(new Date(r.acceptedAt).getTime()));
});

// ══════════════════════════ URL assinada ═══════════════════════════════════

test("URL assinada: teto rígido, e pedido acima do teto é erro, não ajuste calado", () => {
  assert.equal(normalizarTtl(), 60);
  assert.equal(normalizarTtl(30), 30);
  assert.equal(normalizarTtl(TTL_MAXIMO_SEGUNDOS), TTL_MAXIMO_SEGUNDOS);
  assert.throws(() => normalizarTtl(TTL_MAXIMO_SEGUNDOS + 1), TtlInvalidoError);
  assert.throws(() => normalizarTtl(3600), TtlInvalidoError);
  assert.throws(() => normalizarTtl(0), TtlInvalidoError);
  assert.throws(() => normalizarTtl(-1), TtlInvalidoError);
  assert.throws(() => normalizarTtl(1.5), TtlInvalidoError);
});

// ════════════════════════════ retenção ═════════════════════════════════════

const docBase: StoredDocument = {
  objectPath: "identity_validation/driver-1/selfie-abc",
  kind: "selfie",
  uploadedAt: "2026-10-01T12:00:00.000Z",
  validationStartedAt: "2026-10-01T12:30:00.000Z",
};

test("retenção: sem prazo aprovado, o expurgo RECUSA rodar — não inventa padrão", () => {
  assert.throws(
    () => avaliarExpurgo(docBase, POLITICA_NAO_APROVADA, NOW),
    RetencaoNaoConfiguradaError,
  );
  assert.throws(
    () => avaliarExpurgo({ ...docBase, validationStartedAt: null }, POLITICA_NAO_APROVADA, NOW),
    (e: unknown) => e instanceof RetencaoNaoConfiguradaError && e.campo === "abandonedUploadHours",
  );
});

test("retenção: prazos distintos para biometria e imagem de documento", () => {
  const p: RetentionPolicy = { biometricDays: 5, documentImageDays: 30, abandonedUploadHours: 24 };
  // 7 dias desde o início da validação: a selfie vence, a CNH ainda não.
  assert.equal(avaliarExpurgo(docBase, p, NOW).purge, true);
  assert.equal(avaliarExpurgo({ ...docBase, kind: "cnh_front" }, p, NOW).purge, false);
  assert.equal(isBiometric("selfie"), true);
  assert.equal(isBiometric("cnh_front"), false);
});

test("retenção: upload abandonado é expurgado sem esperar o prazo do documento", () => {
  const p: RetentionPolicy = { biometricDays: 365, documentImageDays: 365, abandonedUploadHours: 24 };
  const abandonado: StoredDocument = {
    ...docBase,
    kind: "cnh_front",
    uploadedAt: "2026-10-06T12:00:00.000Z",
    validationStartedAt: null,
  };
  const v = avaliarExpurgo(abandonado, p, NOW);
  assert.equal(v.purge, true);
  assert.equal(v.purge && v.reason, "ABANDONED_UPLOAD");

  const recente = { ...abandonado, uploadedAt: "2026-10-08T06:00:00.000Z" };
  assert.equal(avaliarExpurgo(recente, p, NOW).purge, false);
});

test("retenção: expurgo é idempotente", () => {
  const p: RetentionPolicy = { biometricDays: 1, documentImageDays: 1, abandonedUploadHours: 1 };
  const v = avaliarExpurgo({ ...docBase, purgedAt: "2026-10-07T00:00:00.000Z" }, p, NOW);
  assert.equal(v.purge, false);
  assert.equal(!v.purge && v.reason, "ALREADY_PURGED");
});

test("retenção: seleção em lote só devolve o que venceu", () => {
  const p: RetentionPolicy = { biometricDays: 5, documentImageDays: 30, abandonedUploadHours: 24 };
  const lote: StoredDocument[] = [
    docBase,
    { ...docBase, kind: "cnh_front" },
    { ...docBase, kind: "cnh_back", validationStartedAt: null, uploadedAt: "2026-10-01T00:00:00.000Z" },
    { ...docBase, purgedAt: "2026-10-07T00:00:00.000Z" },
  ];
  const sel = selecionarParaExpurgo(lote, p, NOW);
  assert.equal(sel.length, 2);
  assert.deepEqual(sel.map((s) => s.reason).sort(), ["ABANDONED_UPLOAD", "BIOMETRIC_EXPIRED"]);
});

// ═════════════════════════════ trilha ══════════════════════════════════════

const eventoBase: DocumentAuditEvent = {
  action: "upload",
  subjectId: DONO,
  actorId: DONO,
  actorRole: "driver",
  purpose: "identity_validation",
  kind: "selfie",
  objectPath: "identity_validation/driver-1/selfie-abc",
  occurredAt: NOW.toISOString(),
};

test("trilha: as cinco ações são registráveis", () => {
  for (const action of DOCUMENT_AUDIT_ACTIONS) {
    const e = buildDocumentAuditEvent({ ...eventoBase, action });
    assert.equal(e.action, action);
  }
  assert.deepEqual([...DOCUMENT_AUDIT_ACTIONS].sort(), [
    "access",
    "delete",
    "purge",
    "upload",
    "validation_started",
  ]);
});

test("trilha: recusa URL assinada, JWT, base64, CPF e segredo", () => {
  const venenos: Array<[string, string]> = [
    ["objectPath", "https://x.supabase.co/object/sign/a?token=abc.def.ghi"],
    ["objectPath", "/obj?X-Amz-Signature=deadbeef"],
    ["reasonCode", "eyJhbGciOiJIUzI1NiJ9.payload"],
    ["reasonCode", "data:image/jpeg;base64,/9j/4AAQ"],
    ["reasonCode", "cpf 123.456.789-09"],
    ["reasonCode", "Bearer xyz"],
    ["actorRole", "service_role"],
  ];
  for (const [campo, valor] of venenos) {
    assert.throws(
      () => buildDocumentAuditEvent({ ...eventoBase, [campo]: valor } as DocumentAuditEvent),
      SensitiveDataInAuditError,
      `deveria recusar ${campo}=${valor}`,
    );
  }
});

test("trilha: evento limpo passa, e o log é ainda mais estreito", () => {
  const e = buildDocumentAuditEvent(eventoBase);
  assert.equal(e.objectPath, eventoBase.objectPath);

  const log = auditEventForLog(e);
  // Nenhum identificador de pessoa vai para o log da aplicação.
  assert.equal("subjectId" in log, false);
  assert.equal("actorId" in log, false);
  assert.equal("objectPath" in log, false);
  assert.equal(log.action, "upload");
  assert.equal(log.purpose, "identity_validation");
});

// ─────────────── revalidar a autorizacao A CADA EMISSAO ────────────────────

test("a autorizacao e revalidada a cada emissao, nao uma vez por sessao", () => {
  // O pedido e o mesmo; o CONSENTIMENTO muda entre as duas emissoes. Se a
  // autorizacao fosse decidida uma vez e guardada, a segunda emissao passaria.
  const pedido = {
    actorId: DONO,
    actorRole: "driver" as const,
    subjectId: DONO,
    objectPurpose: "identity_validation" as const,
    requestedPurpose: "identity_validation" as const,
  };

  const primeira = authorizeDocumentAccess(pedido, consentimentoVigente);
  assert.equal(primeira.allowed, true);

  const depoisDaRetirada = authorizeDocumentAccess(pedido, {
    ...consentimentoVigente,
    record: { ...consentimentoVigente.record!, withdrawnAt: "2026-10-09T00:00:00.000Z" },
  });
  assert.equal(depoisDaRetirada.allowed, false);
  assert.equal(
    depoisDaRetirada.allowed === false && depoisDaRetirada.reason,
    "CONSENT_WITHDRAWN",
  );
});

test("retirar consentimento impede NOVA emissao; nao alcanca URL ja emitida", () => {
  // A funcao pura so decide EMISSAO. O que acontece com uma URL ja entregue
  // nao esta ao alcance dela, e fingir o contrario seria pior que registrar o
  // limite: medido em scripts/homologacao/url-assinada-como-credencial.mjs, a
  // URL emitida continua servindo depois da retirada, e para de servir quando
  // o OBJETO e apagado.
  const retirado = {
    ...consentimentoVigente,
    record: { ...consentimentoVigente.record!, withdrawnAt: "2026-10-09T00:00:00.000Z" },
  };
  const d = authorizeDocumentAccess(
    {
      actorId: DONO,
      actorRole: "driver",
      subjectId: DONO,
      objectPurpose: "identity_validation",
      requestedPurpose: "identity_validation",
    },
    retirado,
  );
  assert.equal(d.allowed, false, "nenhuma emissao nova");

  // O teto curto de validade e o que limita a janela de uma URL ja emitida.
  // Nao e configuracao: pedido acima do teto e ERRO.
  assert.equal(TTL_MAXIMO_SEGUNDOS, 120);
  assert.throws(() => normalizarTtl(TTL_MAXIMO_SEGUNDOS + 1), TtlInvalidoError);
});
