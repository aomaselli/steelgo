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
  CampoInvalidoEmLogDeExpurgoError,
  DadoPessoalEmLogDeExpurgoError,
  conferirFalhaParaLog,
  type FalhaDeExpurgoParaLog,
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
  // `validation_documents.id`: a chave do REGISTRO, nao da pessoa. E o unico
  // identificador que entra no log operacional.
  documentId: "3f1b9c7e-0000-4000-8000-000000000001",
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
  tentativasFalhas: Array<{ objectPath: string; motivo: string }>;
  logOperacional: FalhaDeExpurgoParaLog[];
}

function portas(
  cfg: {
    aoRemover?: (tentativa: number) => void | Promise<void>;
    existeApos?: (tentativa: number) => boolean;
    aoConferir?: (tentativa: number) => void;
    /** Simula a transação de conclusão: lança, ou devolve o desfecho. */
    aoConcluir?: (tentativa: number) => "concluido" | "ja_concluido" | void;
    aoMarcarTentativa?: (tentativa: number) => void;
  } = {},
): { ports: PurgePorts; reg: Registro } {
  const reg: Registro = {
    removeu: [],
    marcou: [],
    trilha: [],
    tentativasFalhas: [],
    logOperacional: [],
  };
  let tentativaRemocao = 0;
  let tentativaConferencia = 0;
  let tentativaConclusao = 0;
  let tentativaMarcacao = 0;
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
    async concluirExpurgo({ objectPath, evento }) {
      tentativaConclusao += 1;
      const r = cfg.aoConcluir ? cfg.aoConcluir(tentativaConclusao) : undefined;
      // A porta de verdade grava as três coisas na MESMA transação. Aqui,
      // se a conclusão lançar, NADA é registrado — é o que o teste de
      // falha de auditoria verifica.
      if (r === "ja_concluido") return "ja_concluido";
      reg.marcou.push(objectPath);
      reg.trilha.push({
        action: evento.action,
        objectPath: evento.objectPath,
        actorId: evento.actorId,
        reasonCode: evento.reasonCode,
      });
      return "concluido";
    },
    async marcarTentativaFalha(p, _quando, motivo) {
      tentativaMarcacao += 1;
      if (cfg.aoMarcarTentativa) cfg.aoMarcarTentativa(tentativaMarcacao);
      reg.tentativasFalhas.push({ objectPath: p, motivo });
    },
    registrarFalhaOperacional(f) {
      reg.logOperacional.push(f);
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

test("falha na remocao COM arquivo presente deixa pendente", async () => {
  // `existeApos: true` e o que torna este caso distinto da recuperacao:
  // a remocao falhou E o arquivo continua la. Sem essa condicao, ausencia
  // comprovada autorizaria concluir -- e e isso que o teste de
  // recuperacao verifica.
  const { ports, reg } = portas({
    aoRemover: () => {
      throw new Error("HTTP 401 ao remover");
    },
    existeApos: () => true,
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
    // Na primeira conferencia o arquivo ainda esta la; na segunda, nao.
    existeApos: (conferencia) => conferencia === 1,
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
    // O segundo falha na remocao E o arquivo dele continua la.
    existeApos: (conferencia) => conferencia === 2,
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
    {
      status: "expurgado",
      objectPath: "a",
      reason: "BIOMETRIC_EXPIRED",
      tentativas: 1,
      concluidoPorOutraExecucao: false,
    },
    { status: "dispensado", objectPath: "b", reason: "WITHIN_RETENTION" },
  ]);
  assert.equal(resumo.exigeAtencao, false);
});

// ──────────────── log operacional de falha de expurgo ──────────────────────

test("falha registra tentativa no documento E no log operacional", async () => {
  const { ports, reg } = portas({
    aoRemover: () => {
      throw new Error("HTTP 401 ao remover");
    },
    existeApos: () => true,
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA, 2);
  assert.equal(r.status, "pendente");

  // No documento: e o que faz `purged_at is null` deixar de ser ambiguo.
  assert.equal(reg.tentativasFalhas.length, 1);
  assert.equal(reg.tentativasFalhas[0].motivo, "REMOCAO_FALHOU");

  // No log: identificador do REGISTRO e motivo, nada mais.
  assert.equal(reg.logOperacional.length, 1);
  const f = reg.logOperacional[0];
  assert.equal(f.documentId, SELFIE_VENCIDA.documentId);
  assert.equal(f.motivo, "REMOCAO_FALHOU");
  assert.equal(f.tentativas, 2);
  assert.deepEqual(
    Object.keys(f).sort(),
    ["documentId", "motivo", "ocorridoEm", "tentativas"],
    "o log tem lista FECHADA de campos",
  );
});

test("o log operacional nao carrega caminho de objeto nem titular", async () => {
  const { ports, reg } = portas({ existeApos: () => true });
  await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);
  const serializado = JSON.stringify(reg.logOperacional);
  assert.ok(!serializado.includes("identity_validation"), "caminho nao entra");
  assert.ok(!serializado.includes(SELFIE_VENCIDA.subjectId), "titular nao entra");
  assert.ok(!serializado.includes("selfie"), "especie do documento nao entra");
});

test("sucesso nao registra falha em lugar nenhum", async () => {
  const { ports, reg } = portas();
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);
  assert.equal(r.status, "expurgado");
  assert.deepEqual(reg.tentativasFalhas, []);
  assert.deepEqual(reg.logOperacional, []);
});

test("a guarda do log recusa dado pessoal", () => {
  const base: FalhaDeExpurgoParaLog = {
    documentId: "3f1b9c7e-0000-4000-8000-000000000001",
    motivo: "ARQUIVO_PERSISTE",
    tentativas: 1,
    ocorridoEm: AGORA.toISOString(),
  };
  conferirFalhaParaLog(base);
  const ruins: Array<[string, Partial<FalhaDeExpurgoParaLog>]> = [
    ["caminho", { documentId: "identity_validation/sujeito-1/selfie-1.jpg" }],
    ["CPF", { documentId: "257.744.350-16" }],
    ["URL", { documentId: "https://exemplo.invalido/obj" }],
    ["JWT", { documentId: "eyJhbGciOiJIUzI1NiJ9.corpo" }],
    ["segredo", { documentId: "service_role-1" }],
  ];
  for (const [nome, mudanca] of ruins) {
    assert.throws(
      () => conferirFalhaParaLog({ ...base, ...mudanca }),
      DadoPessoalEmLogDeExpurgoError,
      `esperava recusa de ${nome}`,
    );
  }
});

test("as duas portas de falha sao OPCIONAIS", async () => {
  // Uma esteira sem o esquema atualizado nao pode quebrar por isso: o log
  // operacional segue sendo o registro, e a ausencia das portas nao lanca.
  const { ports } = portas({
    aoRemover: () => {
      throw new Error("HTTP 503");
    },
    existeApos: () => true,
  });
  const semPortas: PurgePorts = {
    remover: ports.remover,
    existe: ports.existe,
    concluirExpurgo: ports.concluirExpurgo,
  };
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, semPortas, AGORA);
  assert.equal(r.status, "pendente");
});

// ═══════════ conclusao ATOMICA, recuperacao e concorrencia ════════════════

test("auditoria que falha NAO deixa purged_at gravado", async () => {
  // A porta de verdade faz as três coisas numa transação. Se o evento não
  // entrar, `purged_at` não entra. O estado proibido é documento fora da
  // seleção e trilha vazia: some o arquivo, e some a prova de que sumiu.
  const { ports, reg } = portas({
    aoConcluir: () => {
      throw new Error("insert em document_audit violou a trilha");
    },
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "pendente");
  assert.equal(r.status === "pendente" && r.falha, "CONCLUSAO_FALHOU");
  assert.deepEqual(reg.marcou, [], "purged_at nao pode ter sido gravado");
  assert.deepEqual(reg.trilha, [], "nem o evento");
  // E segue recuperável: a falha foi registrada, `purged_at` continua nulo.
  assert.equal(reg.tentativasFalhas[0]?.motivo, "CONCLUSAO_FALHOU");
});

test("recuperacao: arquivo JA removido, transacao anterior falhou", async () => {
  // O cenário exato de uma execução anterior que apagou o arquivo e perdeu
  // a transação. A Storage API responde erro para objeto ausente — medido:
  // HTTP 400 —, e tratar isso como falha prenderia o documento para sempre.
  const { ports, reg } = portas({
    aoRemover: () => {
      throw new Error("HTTP 400: objeto nao encontrado");
    },
    existeApos: () => false, // a prova: o arquivo nao esta la
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "expurgado", "ausencia comprovada autoriza concluir");
  assert.deepEqual(reg.marcou, [SELFIE_VENCIDA.objectPath]);
  assert.equal(reg.trilha.length, 1);
  assert.equal(reg.trilha[0].action, "purge");
});

test("remocao falha E arquivo continua la: pendente, nao concluido", async () => {
  // O contraponto do teste acima. Sem a prova de ausência, nada se conclui.
  const { ports, reg } = portas({
    aoRemover: () => {
      throw new Error("HTTP 500");
    },
    existeApos: () => true,
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);
  assert.equal(r.status, "pendente");
  assert.equal(r.status === "pendente" && r.falha, "REMOCAO_FALHOU");
  assert.deepEqual(reg.marcou, []);
  assert.deepEqual(reg.trilha, []);
});

test("concorrencia: quem chega depois nao grava segundo evento", async () => {
  const { ports, reg } = portas({
    aoConcluir: () => "ja_concluido",
  });
  const r = await expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(r.status, "expurgado", "o desfecho e o mesmo");
  assert.equal(
    r.status === "expurgado" && r.concluidoPorOutraExecucao,
    true,
    "mas o relatorio diz quem concluiu",
  );
  assert.deepEqual(reg.trilha, [], "nenhum evento duplicado");
});

test("duas execucoes concorrentes produzem UM evento", async () => {
  // Só a primeira grava; a segunda recebe `ja_concluido`, como a função do
  // banco devolve quando o `update` condicional não casa linha.
  let concluiu = 0;
  const { ports, reg } = portas({
    aoConcluir: () => {
      concluiu += 1;
      return concluiu === 1 ? "concluido" : "ja_concluido";
    },
  });
  const [a, b] = await Promise.all([
    expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA),
    expurgarDocumento(SELFIE_VENCIDA, PRAZO_DE_TESTE, ports, AGORA),
  ]);
  assert.equal(a.status, "expurgado");
  assert.equal(b.status, "expurgado");
  assert.equal(reg.trilha.length, 1, "um unico evento purge");
});

// ═══════════════════ isolamento das falhas por documento ══════════════════

test("falha nao prevista num documento nao interrompe o lote", async () => {
  const docs: PurgeableDocument[] = [1, 2, 3].map((n) => ({
    ...SELFIE_VENCIDA,
    documentId: `3f1b9c7e-0000-4000-8000-00000000000${n}`,
    objectPath: `identity_validation/sujeito-1/selfie-${n}.jpg`,
  }));
  let conclusoes = 0;
  const { ports, reg } = portas({
    aoConcluir: () => {
      conclusoes += 1;
      // O segundo documento falha de um jeito que `expurgarDocumento` trata,
      // e o terceiro tem de ser processado assim mesmo.
      if (conclusoes === 2) throw new Error("deadlock detectado");
    },
  });
  const rs = await expurgarLote(docs, PRAZO_DE_TESTE, ports, AGORA);

  assert.equal(rs.length, 3, "os tres documentos tem resultado");
  assert.equal(rs[0].status, "expurgado");
  assert.equal(rs[1].status, "pendente");
  assert.equal(rs[1].status === "pendente" && rs[1].falha, "CONCLUSAO_FALHOU");
  assert.equal(rs[2].status, "expurgado", "o terceiro foi processado");
  assert.equal(reg.trilha.length, 2);
});

test("falha ao registrar a TENTATIVA nao derruba o documento nem o lote", async () => {
  const { ports } = portas({
    aoRemover: () => {
      throw new Error("HTTP 503");
    },
    existeApos: () => true,
    aoMarcarTentativa: () => {
      throw new Error("banco indisponivel ao marcar tentativa");
    },
  });
  const rs = await expurgarLote([SELFIE_VENCIDA], PRAZO_DE_TESTE, ports, AGORA);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].status, "pendente");
  // O motivo ORIGINAL e preservado; a falha acessoria entra no detalhe.
  assert.equal(rs[0].status === "pendente" && rs[0].falha, "REMOCAO_FALHOU");
  assert.match(
    rs[0].status === "pendente" ? rs[0].detalhe : "",
    /registro da tentativa também falhou/,
  );
});

test("falha do LOG operacional tambem nao derruba nada", async () => {
  const { ports } = portas({
    aoRemover: () => {
      throw new Error("HTTP 503");
    },
    existeApos: () => true,
  });
  const comLogQueQuebra: PurgePorts = {
    ...ports,
    registrarFalhaOperacional() {
      throw new Error("coletor de log fora do ar");
    },
  };
  const rs = await expurgarLote([SELFIE_VENCIDA], PRAZO_DE_TESTE, comLogQueQuebra, AGORA);
  assert.equal(rs[0].status, "pendente");
  assert.match(
    rs[0].status === "pendente" ? rs[0].detalhe : "",
    /log operacional também falhou/,
  );
});

// ══════════════════ lista fechada do log, em runtime ══════════════════════

test("propriedade EXTRA com dado pessoal e recusada, nao ignorada", () => {
  // O spread anterior copiava o que viesse. Pior: nem conferia. Bastava
  // alguem anexar o caminho do objeto e o titular para os dois irem para um
  // servico de terceiro sem nenhuma barreira disparar.
  const comExtras = {
    documentId: "3f1b9c7e-0000-4000-8000-000000000001",
    motivo: "ARQUIVO_PERSISTE" as const,
    tentativas: 1,
    ocorridoEm: AGORA.toISOString(),
    objectPath: "identity_validation/sujeito-1/selfie-1.jpg",
  };
  assert.throws(
    () => conferirFalhaParaLog(comExtras as FalhaDeExpurgoParaLog),
    DadoPessoalEmLogDeExpurgoError,
  );
});

test("propriedade extra INOCUA nao e encaminhada ao log", () => {
  const comExtras = {
    documentId: "3f1b9c7e-0000-4000-8000-000000000001",
    motivo: "ARQUIVO_PERSISTE" as const,
    tentativas: 1,
    ocorridoEm: AGORA.toISOString(),
    maquina: "worker-7",
    prioridade: 3,
  };
  const saida = conferirFalhaParaLog(comExtras as FalhaDeExpurgoParaLog);
  assert.deepEqual(
    Object.keys(saida).sort(),
    ["documentId", "motivo", "ocorridoEm", "tentativas"],
    "so os quatro campos saem, por construcao",
  );
  assert.equal("maquina" in saida, false);
  assert.equal("prioridade" in saida, false);
});

test("valores invalidos sao recusados em runtime", () => {
  const base = {
    documentId: "3f1b9c7e-0000-4000-8000-000000000001",
    motivo: "ARQUIVO_PERSISTE" as const,
    tentativas: 1,
    ocorridoEm: AGORA.toISOString(),
  };
  const ruins: Array<[string, Record<string, unknown>]> = [
    ["documentId vazio", { documentId: "   " }],
    ["documentId nao textual", { documentId: 42 }],
    ["motivo fora da lista", { motivo: "QUALQUER_COISA" }],
    ["tentativas fracionaria", { tentativas: 1.5 }],
    ["tentativas negativa", { tentativas: -1 }],
    ["ocorridoEm ilegivel", { ocorridoEm: "ontem" }],
  ];
  for (const [nome, mudanca] of ruins) {
    assert.throws(
      () => conferirFalhaParaLog({ ...base, ...mudanca } as unknown as FalhaDeExpurgoParaLog),
      CampoInvalidoEmLogDeExpurgoError,
      `esperava recusa de ${nome}`,
    );
  }
});
