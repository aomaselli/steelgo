/**
 * Expurgo: o que não pode ser declarado concluído.
 *
 * O caso que organiza esta bateria é o terceiro: a Storage API responde SEM
 * erro e o arquivo continua lá. Se o módulo confiasse na resposta da remoção,
 * marcaria `purged_at`, o documento sairia da seleção para sempre e ficaria
 * biometria guardada além do prazo com registro dizendo que foi apagada.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  ATOR_DO_EXPURGO,
  type PurgePorts,
  type PurgeableDocument,
  expurgarDocumento,
  expurgarLote,
  resumirExpurgo,
} from "../purge";
import { POLITICA_NAO_APROVADA, RetencaoNaoConfiguradaError, type RetentionPolicy } from "../retention";

const AGORA = new Date("2026-10-09T12:00:00.000Z");

/** Prazo EXCLUSIVO destes testes. Não é proposta de prazo de produção. */
const PRAZO_DE_TESTE: RetentionPolicy = {
  biometricDays: 1,
  documentImageDays: 2,
  abandonedUploadHours: 1,
};

const SELFIE_VENCIDA: PurgeableDocument = {
  objectPath: "identity_validation/sujeito-1/selfie-1.jpg",
  kind: "selfie",
  subjectId: "sujeito-1",
  purpose: "identity_validation",
  uploadedAt: "2026-10-01T00:00:00.000Z",
  validationStartedAt: "2026-10-01T00:00:00.000Z",
  purgedAt: null,
};

interface Registro {
  removeu: string[];
  marcou: string[];
  trilha: Array<{ action: string; objectPath: string; actorId: string; reasonCode: string }>;
}

function portas(
  cfg: {
    aoRemover?: (tentativa: number) => void | Promise<void>;
    existeApos?: (tentativa: number) => boolean;
    aoConferir?: (tentativa: number) => void;
  } = {},
): { ports: PurgePorts; reg: Registro } {
  const reg: Registro = { removeu: [], marcou: [], trilha: [] };
  let tentativaRemocao = 0;
  let tentativaConferencia = 0;
  const ports: PurgePorts = {
    async remover(p) {
      tentativaRemocao += 1;
      if (cfg.aoRemover) await cfg.aoRemover(tentativaRemocao);
      reg.removeu.push(p);
    },
    async existe() {
      tentativaConferencia += 1;
      if (cfg.aoConferir) cfg.aoConferir(tentativaConferencia);
      return cfg.existeApos ? cfg.existeApos(tentativaConferencia) : false;
    },
    async marcarExpurgado(p) {
      reg.marcou.push(p);
    },
    async registrarTrilha(e) {
      reg.trilha.push({
        action: e.action,
        objectPath: e.objectPath,
        actorId: e.actorId,
        reasonCode: e.reasonCode,
      });
    },
  };
  return { ports, reg };
}

// ───────────────────────── o caminho que funciona ──────────────────────────

test("expurga, marca e registra na trilha — nessa ordem", async () => {
  const { ports, reg } = portas();
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "expurgado");
  assert.equal(r.status === "expurgado" && r.reason, "BIOMETRIC_EXPIRED");
  assert.deepEqual(reg.removeu, [SELFIE_VENCIDA.objectPath]);
  assert.deepEqual(reg.marcou, [SELFIE_VENCIDA.objectPath]);
  assert.equal(reg.trilha.length, 1);
  assert.equal(reg.trilha[0].action, "purge");
  assert.equal(reg.trilha[0].actorId, ATOR_DO_EXPURGO.actorId);
  assert.equal(reg.trilha[0].reasonCode, "BIOMETRIC_EXPIRED");
});

// ──────────── o caso difícil: sucesso aparente, arquivo presente ───────────

test("remocao sem erro mas arquivo PRESENTE nao conclui o expurgo", async () => {
  const { ports, reg } = portas({ existeApos: () => true });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "pendente");
  assert.equal(r.status === "pendente" && r.falha, "ARQUIVO_PERSISTE");
  assert.equal(r.status === "pendente" && r.concluido, false);
  // O essencial: nada marcado, nada registrado.
  assert.deepEqual(reg.marcou, [], "purged_at nao pode ser marcado com o arquivo presente");
  assert.deepEqual(reg.trilha, [], "nao se registra purge de arquivo que continua la");
});

test("a conferencia NAO usa a resposta da remocao", async () => {
  // A remoção responde sem erro todas as vezes; quem decide é `existe`.
  let conferencias = 0;
  const { ports } = portas({
    existeApos: () => {
      conferencias += 1;
      return true;
    },
  });
  await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA, 3);
  assert.equal(conferencias, 3, "cada tentativa tem de conferir por consulta separada");
});

// ───────────────────── falha da Storage API e repeticao ────────────────────

test("falha na remocao deixa pendente, sem marcar nem registrar", async () => {
  const { ports, reg } = portas({
    aoRemover: () => {
      throw new Error("HTTP 401 ao remover");
    },
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "pendente");
  assert.equal(r.status === "pendente" && r.falha, "REMOCAO_FALHOU");
  assert.match(r.status === "pendente" ? r.detalhe : "", /401/);
  assert.deepEqual(reg.marcou, []);
  assert.deepEqual(reg.trilha, []);
});

test("nova tentativa depois da falha conclui o expurgo", async () => {
  const { ports, reg } = portas({
    aoRemover: (tentativa) => {
      if (tentativa === 1) throw new Error("HTTP 401 ao remover");
    },
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA, 2);

  assert.equal(r.status, "expurgado");
  assert.equal(r.status === "expurgado" && r.tentativas, 2);
  assert.equal(reg.trilha.length, 1, "uma unica linha de purge, nao uma por tentativa");
});

test("falha na CONFERENCIA tambem deixa pendente", async () => {
  const { ports, reg } = portas({
    aoConferir: () => {
      throw new Error("HTTP 500 ao listar");
    },
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "pendente");
  assert.equal(r.status === "pendente" && r.falha, "CONFERENCIA_FALHOU");
  assert.deepEqual(reg.marcou, [], "sem conferencia nao ha o que declarar");
});

// ─────────────────────────── idempotencia ──────────────────────────────────

test("documento ja expurgado nao gera segunda linha de trilha", async () => {
  const { ports, reg } = portas();
  const r = await expurgarDocumento(
    { ...SELFIE_VENCIDA, purgedAt: "2026-10-08T00:00:00.000Z" },
    PRAZO_DE_TESTE,
    ports,
    AGORA,
  );
  assert.equal(r.status, "dispensado");
  assert.equal(r.status === "dispensado" && r.reason, "ALREADY_PURGED");
  assert.deepEqual(reg.removeu, []);
  assert.deepEqual(reg.trilha, []);
});

test("dentro do prazo nao se toca no arquivo", async () => {
  const { ports, reg } = portas();
  const r = await expurgarDocumento(
    { ...SELFIE_VENCIDA, validationStartedAt: "2026-10-09T11:00:00.000Z" },
    PRAZO_DE_TESTE,
    ports,
    AGORA,
  );
  assert.equal(r.status, "dispensado");
  assert.equal(r.status === "dispensado" && r.reason, "WITHIN_RETENTION");
  assert.deepEqual(reg.removeu, []);
});

// ───────────────── prazo nao aprovado: o expurgo nao roda ──────────────────

test("sem prazo aprovado o expurgo LANCA, em vez de apagar por padrao", async () => {
  const { ports, reg } = portas();
  await assert.rejects(
    () => expurgarDocumento(SELFIE_VENCIDA, POLITICA_NAO_APROVADA, ports, AGORA),
    RetencaoNaoConfiguradaError,
  );
  assert.deepEqual(reg.removeu, [], "nada pode ser removido sem prazo aprovado");
});

// ─────────────────────────────── lote ──────────────────────────────────────

test("um pendente no lote nao impede os outros", async () => {
  const docs: PurgeableDocument[] = [
    SELFIE_VENCIDA,
    { ...SELFIE_VENCIDA, objectPath: "identity_validation/sujeito-1/selfie-2.jpg" },
    { ...SELFIE_VENCIDA, objectPath: "identity_validation/sujeito-1/selfie-3.jpg" },
  ];
  const { ports, reg } = portas({
    existeApos: () => false,
    aoRemover: (t) => {
      if (t === 2) throw new Error("HTTP 503");
    },
  });
  const rs = await expurgarLote(docs, PRAZO_DE_TESTE, ports, AGORA);
  const resumo = resumirExpurgo(rs);

  assert.equal(resumo.expurgados, 2);
  assert.equal(resumo.pendentes, 1);
  assert.equal(resumo.exigeAtencao, true, "pendente tem de exigir atencao");
  assert.equal(reg.trilha.length, 2, "so o que saiu de fato entra na trilha");
});

test("resumo sem pendente nao exige atencao", () => {
  const resumo = resumirExpurgo([
    { status: "expurgado", objectPath: "a", reason: "BIOMETRIC_EXPIRED", tentativas: 1 },
    { status: "dispensado", objectPath: "b", reason: "WITHIN_RETENTION" },
  ]);
  assert.equal(resumo.exigeAtencao, false);
});
