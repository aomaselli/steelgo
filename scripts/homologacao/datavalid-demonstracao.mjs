/**
 * Homologação do adaptador Datavalid em modo DEMONSTRAÇÃO.
 *
 * Exercita o módulo de verdade (`src/server/verification/datavalid/demonstracao/`)
 * contra o serviço oficial de demonstração do SERPRO, com a massa fictícia
 * oficial. Nenhum dado de pessoa real, em nenhum ponto.
 *
 * CENÁRIOS
 *
 *   1. biográfico e habilitação — o caminho que responde tudo verdadeiro
 *   2. QR Code da CNH — decodificação, que é outro tipo de resultado
 *   3. biometria facial COM PROVA DE VIDA
 *   4. resultado NEGATIVO — dado trocado de propósito
 *   5. resultado AUSENTE — CPF fora da base
 *   6. impedimento não avaliado NÃO aprova — pelo motor de regras de verdade
 *
 * O fluxo de cada cenário segue a ordem que a documentação impõe: template
 * (registrado uma vez e reutilizado, porque a finalidade é a mesma), token da
 * GCC simulada (um POR OPERAÇÃO, sem reúso), mapeamento, validação, leitura
 * por bloco.
 *
 * CREDENCIAL E MASSA
 *
 * O bearer do ambiente de demonstração é publicado pelo próprio SERPRO. Mesmo
 * assim entra por `DATAVALID_DEMO_BEARER`: credencial publicada continua sendo
 * credencial. A massa entra por `DATAVALID_MASSA_OFICIAL` — são ~12 MB para 5
 * registros, por causa da biometria em base64, e não entra no repositório.
 *
 * USO
 *   DATAVALID_DEMO_BEARER=... DATAVALID_MASSA_OFICIAL=.../exemplos.json \
 *     node scripts/homologacao/datavalid-demonstracao.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const TMP = mkdtempSync(join(tmpdir(), "datavalid-demo-"));

process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

const BEARER = process.env.DATAVALID_DEMO_BEARER;
const MASSA = process.env.DATAVALID_MASSA_OFICIAL;

/**
 * O serviço de demonstração é compartilhado e limita taxa com folga curta.
 *
 * Numa execução com 2,5 s entre cenários, quatro das cinco validações
 * voltaram 429. Não é defeito do adaptador — é o bearer público sendo
 * público. Esperar é a resposta certa; repetir automaticamente seria
 * treinar a esteira a insistir contra um limite.
 */
const PAUSA_ENTRE_CENARIOS_MS = 25_000;

const resultados = [];
function reg(ok, texto) {
  resultados.push(ok);
  console.log("  " + (ok ? "OK     | " : "FALHOU | ") + texto);
}
function nota(texto) {
  console.log("  nota   | " + texto);
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Compila o módulo de verdade, com a configuração do PRÓPRIO repositório.
 *
 * O tsconfig gerado vive NO REPOSITÓRIO, não no temporário: `extends` resolve
 * `types` relativamente ao diretório do arquivo de configuração, e de fora
 * dele `vite/client` não é encontrado. Sai no `finally`.
 */
function compilar() {
  const saida = join(TMP, "compilado");
  mkdirSync(saida, { recursive: true });
  const cfg = join(REPO, "tsconfig.homologacao-datavalid.json");
  const base = "src/server/verification";
  writeFileSync(
    cfg,
    JSON.stringify({
      extends: join(REPO, "tsconfig.json").replace(/\\/g, "/"),
      compilerOptions: {
        noEmit: false,
        outDir: saida.replace(/\\/g, "/"),
        rootDir: join(REPO, base).replace(/\\/g, "/"),
        allowImportingTsExtensions: false,
        declaration: false,
        module: "commonjs",
        moduleResolution: "node10",
        verbatimModuleSyntax: false,
      },
      include: [],
      files: [
        `${base}/datavalid/demonstracao/ambiente.ts`,
        `${base}/datavalid/demonstracao/mapa.ts`,
        `${base}/datavalid/demonstracao/gcc-simulada.ts`,
        `${base}/datavalid/demonstracao/cliente.ts`,
        `${base}/datavalid/privacy.ts`,
        `${base}/datavalid/semantics.ts`,
        `${base}/rules.ts`,
      ].map((p) => join(REPO, p).replace(/\\/g, "/")),
    }),
    "utf8",
  );
  try {
    execFileSync("npx", ["tsc", "-p", cfg], {
      cwd: REPO,
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // O `tsc` escreve os diagnósticos em stdout, não em stderr. Sem isto a
    // falha chega como "Command failed" e não se sabe o que não compilou.
    const saidaTsc = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      "a compilacao do modulo falhou:\n" +
        saidaTsc.split("\n").map((l) => "    " + l).join("\n"),
    );
  } finally {
    rmSync(cfg, { force: true });
  }
  return saida;
}

/** Corpo do template. Agente de tratamento FICTÍCIO, rotulado como tal. */
function corpoDoTemplate() {
  return {
    agente_tratamento: {
      cnpj: "11222333000181",
      nome: "DEMONSTRACAO - agente ficticio",
      razao_social: "DEMONSTRACAO SteelGo (ficticio, ambiente de teste)",
      email: "demonstracao@exemplo.invalido",
      email_encarregado: "encarregado.demonstracao@exemplo.invalido",
    },
    finalidade: "DEMONSTRACAO - autenticacao de identidade de motorista",
    // `EXECUCAO_CONTRATO` é a hipótese que corresponde ao caso real do
    // produto: validar o motorista que vai executar o frete.
    hipoteses_legais: ["EXECUCAO_CONTRATO"],
    eventos: ["onboarding_motorista", "validacao_de_habilitacao"],
    como_exercer_direitos: ["REQUISICAO_ELETRONICA"],
  };
}

const log = [];
let seqOperacao = 0;
function proximaOperacao(rotulo) {
  seqOperacao += 1;
  const t = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `demo-${t}-${seqOperacao}-${rotulo}`;
}

async function main() {
  console.log("Datavalid — homologação do modo DEMONSTRAÇÃO\n");

  if (!BEARER) {
    console.log("  FALTA  | DATAVALID_DEMO_BEARER não definido.");
    console.log("           Publicado pelo SERPRO no artigo Demonstração; não é versionado aqui.");
    return 2;
  }
  if (!MASSA) {
    console.log("  FALTA  | DATAVALID_MASSA_OFICIAL não definido (caminho do exemplos.json).");
    return 2;
  }

  const dir = compilar();
  const req = createRequire(import.meta.url);
  const ambiente = req(join(dir, "datavalid", "demonstracao", "ambiente.js"));
  const mapa = req(join(dir, "datavalid", "demonstracao", "mapa.js"));
  const gcc = req(join(dir, "datavalid", "demonstracao", "gcc-simulada.js"));
  const cliente = req(join(dir, "datavalid", "demonstracao", "cliente.js"));
  const regras = req(join(dir, "rules.js"));

  // ─── barreiras, antes de qualquer chamada ──────────────────────────────
  console.log("  -- barreiras --");
  const a = ambiente.ambienteAtual();
  reg(a.permitido, `B1. ambiente "${a.nome}" permitido`);
  reg(
    ambiente.DEMONSTRACAO_BASE_URL ===
      "https://gateway.apiserpro.serpro.gov.br/datavalid-demonstracao",
    "B2. destino é o serviço oficial de demonstração, constante no código",
  );
  let recusou = false;
  try {
    ambiente.assertDestinoDeDemonstracao(
      ambiente.PRODUCAO_BASE_URL + "/v5/pessoa-fisica/validacao",
    );
  } catch {
    recusou = true;
  }
  reg(recusou, "B3. o destino de produção é recusado");
  reg(
    ambiente.CAMINHOS.template === "/v5/pessoa-fisica/privacidade/rfb/template-tratamento",
    `B4. caminho do template resolvido pelo OpenAPI: ${ambiente.CAMINHOS.template}`,
  );

  // ─── template, uma vez, reutilizado ────────────────────────────────────
  console.log("\n  -- template de tratamento RFB (registrado uma vez) --");
  let idTemplate;
  try {
    const r = await cliente.registrarTemplate({
      bearer: BEARER,
      corpo: corpoDoTemplate(),
      operationId: proximaOperacao("template"),
      log: (e) => log.push(e),
    });
    idTemplate = r.id;
    reg(true, `T1. template registrado (HTTP ${r.httpStatus}), id com ${r.id.length} caracteres`);
  } catch (e) {
    reg(false, `T1. registro do template falhou: ${e.message}`);
    return 1;
  }

  const massa = JSON.parse(readFileSync(MASSA, "utf8"));
  reg(Array.isArray(massa) && massa.length === 5, `T2. massa oficial com ${massa.length} registros`);
  const registro = massa[0];

  /** Pede token e valida. Um token POR OPERAÇÃO, sem reúso. */
  async function validar(rotulo, corpo, omitidos) {
    const operationId = proximaOperacao(rotulo);
    const parametros = mapa.parametrosDoCorpo(corpo.validacao);
    const emissao = await gcc.pedirAutorizacaoSimulada({
      bearer: BEARER,
      cpfFicticio: corpo.cpf,
      operationId,
      parametros,
      timeoutMs: 30_000,
      tentativas: 3,
    });
    if (emissao.situacao !== "emitido") {
      nota(
        `emissão de token: ${emissao.situacao} (HTTP ${emissao.httpStatus}), ` +
          `emissões possivelmente órfãs: ${emissao.emissoesPossivelmenteOrfas}; ` +
          `nada aqui afirma ausência de efeito`,
      );
      return { emissao, resultado: null, operationId };
    }
    if (emissao.emissoesPossivelmenteOrfas > 0) {
      nota(
        `emissões possivelmente órfãs antes do sucesso: ` +
          `${emissao.emissoesPossivelmenteOrfas} (sem afirmação de ausência de efeito)`,
      );
    }
    const resultado = await cliente.validarNaDemonstracao({
      bearer: BEARER,
      idTemplate,
      autorizacao: emissao.autorizacao,
      operationId,
      corpo,
      camposOmitidos: omitidos,
      timeoutMs: 60_000,
      log: (e) => log.push(e),
    });
    return { emissao, resultado, operationId };
  }

  function mostrarBlocos(leitura, apenas) {
    console.log(`    rfb_existe = ${leitura.rfbExiste}   cnh_existe = ${leitura.cnhExiste}`);
    for (const [nome, b] of Object.entries(leitura.blocos)) {
      if (apenas && !apenas.includes(nome)) continue;
      console.log(`    ${nome.padEnd(17)} ${b.estado}`);
      for (const [k, v] of Object.entries(b.comparacoes)) console.log(`      ${k.padEnd(36)} ${v}`);
      for (const [k, v] of Object.entries(b.similaridades)) console.log(`      ${k.padEnd(36)} ${v}`);
      for (const [k, v] of Object.entries(b.decodificados)) {
        console.log(`      ${k.padEnd(36)} ${JSON.stringify(v).slice(0, 44)}`);
      }
      for (const [k, v] of Object.entries(b.valores)) {
        console.log(`      ${k.padEnd(36)} ${JSON.stringify(v)}`);
      }
      if (b.naoClassificados.length) {
        console.log(`      (não classificados: ${b.naoClassificados.join(", ")})`);
      }
    }
  }

  // ═══ CENÁRIO 1: biográfico e habilitação ═══════════════════════════════
  console.log("\n  == 1. biografico e habilitacao ==");
  const base = mapa.mapearRegistro(registro, { estrito: false });
  reg(base.corpo.validacao.sexo === "FEMININO", `1.1 sexo "F" -> ${base.corpo.validacao.sexo}`);
  reg(base.corpo.validacao.nacionalidade === "BRASILEIRO", '1.2 nacionalidade "1" -> BRASILEIRO');
  reg(base.corpo.validacao.cnh?.situacao === "EMITIDA", '1.3 cnh_situacao "3" -> EMITIDA');
  const impedimento = base.omitidos.find((o) => o.campo === "cnh_possui_impedimento");
  reg(
    !!impedimento && impedimento.motivo === "SEM_TABELA_OFICIAL",
    "1.4 possui_impedimento RECUSADO: nao ha tabela oficial",
  );
  for (const o of base.omitidos) nota(`omitido ${o.campo} (${o.motivo})`);

  const c1 = await validar("biografico", base.corpo, base.omitidos);
  reg(c1.resultado?.situacao === "respondido", `1.5 validacao respondida (${c1.resultado?.situacao})`);
  let leitura1 = null;
  if (c1.resultado?.situacao === "respondido") {
    leitura1 = c1.resultado.leitura;
    mostrarBlocos(leitura1, ["rfb", "cnh"]);
    reg(leitura1.rfbExiste === true && leitura1.cnhExiste === true, "1.6 CPF e CNH existem na base");
    reg(
      !("possui_impedimento" in leitura1.blocos.cnh.comparacoes),
      "1.7 nenhuma comparacao de impedimento — o campo nao foi enviado",
    );
  }

  // ═══ CENÁRIO 2: QR Code da CNH ═════════════════════════════════════════
  await pausa(PAUSA_ENTRE_CENARIOS_MS);
  console.log("\n  == 2. QR Code da CNH ==");
  const omitidosQr = [];
  const anexoQr = mapa.prepararAnexo("qrcode", registro.qrcode, omitidosQr, { estrito: false });
  reg(!!anexoQr, `2.1 formato LIDO dos primeiros bytes: ${anexoQr?.formato ?? "nao reconhecido"}`);
  if (anexoQr) {
    // O QR vai JUNTO do biográfico, que é como uma validação real é feita.
    // Mandá-lo sozinho também funciona — duas sondas confirmaram 200 —, mas
    // junto exercita o caso de uso e gasta uma chamada a menos.
    const corpoQr = {
      cpf: registro.cpf,
      validacao: {
        ...base.corpo.validacao,
        qrcode: { formato: anexoQr.formato, base64: anexoQr.base64, essencial: false },
      },
    };
    const c2 = await validar("qrcode", corpoQr, omitidosQr);
    reg(c2.resultado?.situacao === "respondido", `2.2 validacao respondida (${c2.resultado?.situacao})`);
    if (c2.resultado?.situacao === "respondido") {
      mostrarBlocos(c2.resultado.leitura, ["qrcode"]);
      const b = c2.resultado.leitura.blocos.qrcode;
      reg(b.estado === "lido", "2.3 o bloco qrcode foi avaliado");
      reg(
        Object.keys(b.decodificados).length > 0,
        `2.4 ha campos DECODIFICADOS (${Object.keys(b.decodificados).length}) — outro tipo de resultado`,
      );
    } else {
      nota(`detalhe: ${c2.resultado?.detalhe ?? "-"}`);
    }
  }

  // ═══ CENÁRIO 3: biometria facial com prova de vida ═════════════════════
  await pausa(PAUSA_ENTRE_CENARIOS_MS);
  console.log("\n  == 3. biometria facial COM PROVA DE VIDA ==");
  const omitidosBio = [];
  const anexoFace = mapa.prepararAnexo("biometria_face", registro.biometria_face, omitidosBio, {
    estrito: false,
  });
  reg(!!anexoFace, `3.1 formato LIDO: ${anexoFace?.formato ?? "nao reconhecido"}`);
  if (anexoFace) {
    nota(`tamanho do base64: ${(anexoFace.base64.length / 1024 / 1024).toFixed(2)} MB`);
    const corpoBio = {
      cpf: registro.cpf,
      validacao: {
        ...base.corpo.validacao,
        biometria_facial: {
          formato: anexoFace.formato,
          base64: anexoFace.base64,
          // É ISTO que pede prova de vida. Sem a flag, o serviço só compara
          // a face; com ela, avalia vivacidade.
          vivacidade: true,
          essencial: false,
        },
      },
    };
    const c3 = await validar("biometria", corpoBio, omitidosBio);
    if (c3.resultado?.situacao === "respondido") {
      mostrarBlocos(c3.resultado.leitura, ["biometriaFacial"]);
      const b = c3.resultado.leitura.blocos.biometriaFacial;
      reg(b.estado === "lido", "3.2 o bloco de biometria facial foi avaliado");
      const vivacidade =
        "vivacidade" in b.comparacoes ? b.comparacoes.vivacidade : b.valores.vivacidade;
      reg(
        vivacidade !== undefined,
        `3.3 prova de vida avaliada: vivacidade = ${JSON.stringify(vivacidade)}`,
      );
      reg(
        "similaridade" in b.similaridades || b.valores.similaridade !== undefined ||
          "similaridade" in b.comparacoes,
        `3.4 similaridade facial devolvida: ${JSON.stringify(b.similaridades.similaridade ?? b.valores.similaridade)}`,
      );
    } else {
      reg(false, `3.2 validacao nao respondeu: ${c3.resultado?.situacao}`);
      nota(`detalhe: ${c3.resultado?.detalhe ?? "-"}`);
      nota("413 aqui seria limite de tamanho do gateway, nao defeito do adaptador");
    }
  }

  // ═══ CENÁRIO 4: resultado NEGATIVO ═════════════════════════════════════
  await pausa(PAUSA_ENTRE_CENARIOS_MS);
  console.log("\n  == 4. resultado NEGATIVO (dado trocado de proposito) ==");
  const trocado = mapa.mapearRegistro(
    { ...registro, nome: "NOME QUE NAO E O DA BASE", data_nascimento: "1900-01-01" },
    { estrito: false },
  );
  const c4 = await validar("negativo", trocado.corpo, trocado.omitidos);
  if (c4.resultado?.situacao === "respondido") {
    const l = c4.resultado.leitura;
    mostrarBlocos(l, ["rfb", "cnh"]);
    const simNome = l.blocos.rfb.similaridades.nome_similaridade;
    const nascimento = l.blocos.rfb.comparacoes.data_nascimento;
    reg(
      typeof simNome === "number" && simNome < 1,
      `4.1 similaridade do nome caiu para ${simNome} (era 1 com o dado certo)`,
    );
    reg(nascimento === false, `4.2 data_nascimento comparou FALSO (${nascimento})`);
    reg(
      l.rfbExiste === true,
      "4.3 existencia segue verdadeira: existir na base e outra pergunta que comparar",
    );
  } else {
    reg(false, `4.1 validacao nao respondeu: ${c4.resultado?.situacao}`);
    nota(`detalhe: ${c4.resultado?.detalhe ?? "-"}`);
  }

  // ═══ CENÁRIO 5: resultado AUSENTE ══════════════════════════════════════
  await pausa(PAUSA_ENTRE_CENARIOS_MS);
  console.log("\n  == 5. resultado AUSENTE (CPF fora da base de demonstracao) ==");
  // CPF fictício com dígitos verificadores válidos, fora dos 5 da massa.
  const CPF_FORA = "11144477735";
  const c5 = await validar("ausente", { cpf: CPF_FORA, validacao: { nome: "NOME FICTICIO" } }, []);
  if (c5.resultado?.situacao === "respondido") {
    const l = c5.resultado.leitura;
    mostrarBlocos(l, ["rfb", "cnh"]);
    reg(
      l.rfbExiste === false || l.cnhExiste === false,
      `5.1 existencia negativa (rfb=${l.rfbExiste}, cnh=${l.cnhExiste})`,
    );
    reg(
      l.blocos.rfb.estado !== "lido" || Object.keys(l.blocos.rfb.comparacoes).length === 0,
      "5.2 sem comparacoes quando nao ha o que comparar",
    );
  } else {
    // Recusa também é um desfecho legítimo aqui, e tem de ser lida como tal —
    // não como "não existe".
    reg(
      c5.resultado?.situacao === "recusado" || c5.resultado?.situacao === "desfecho_desconhecido",
      `5.1 desfecho: ${c5.resultado?.situacao} (HTTP ${c5.resultado?.httpStatus}) — lido como desfecho, nao como negativa`,
    );
    nota(`detalhe: ${c5.resultado?.detalhe ?? "-"}`);
  }

  // ═══ CENÁRIO 6: impedimento não avaliado NÃO aprova ════════════════════
  console.log("\n  == 6. impedimento nao avaliado NAO aprova (motor de regras) ==");
  if (leitura1) {
    const cnh = leitura1.blocos.cnh;
    const impedimentoLido =
      "possui_impedimento" in cnh.comparacoes ? cnh.comparacoes.possui_impedimento : null;
    reg(impedimentoLido === null, "6.1 a resposta real NAO traz impedimento avaliado");

    // A massa oficial tem TODAS as cinco CNHs vencidas. Com a data real, o
    // bloco reprova por `LICENSE_EXPIRED` antes de chegar ao impedimento —
    // correto, e foi o que a primeira execução mostrou. Para isolar a
    // pergunta do impedimento é preciso uma validade futura, e a troca é
    // declarada, não escondida.
    const vencidaNaMassa = registro.cnh_data_validade < new Date().toISOString().slice(0, 10);
    reg(vencidaNaMassa, `6.2 a CNH da massa está vencida (${registro.cnh_data_validade})`);

    const comDataReal = regras.avaliarHabilitacao({
      now: new Date(),
      identityVerified: true,
      licenseNumber: registro.cnh_numero_registro,
      licenseExpiry: registro.cnh_data_validade,
      drivingLicenseSourceConfigured: true,
      driverStatus: {
        licenseValid: true,
        hasImpediment: impedimentoLido,
        licenseExpiresAt: registro.cnh_data_validade,
      },
    });
    reg(
      comDataReal.status === "expired" && comDataReal.reasonCode === "LICENSE_EXPIRED",
      `6.3 com a data real da massa, reprova por vencimento: ${comDataReal.status}/${comDataReal.reasonCode}`,
    );

    // Validade futura: agora a ÚNICA pergunta em aberto é o impedimento.
    const FUTURA = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const entrada = {
      now: new Date(),
      identityVerified: true,
      licenseNumber: registro.cnh_numero_registro,
      licenseExpiry: FUTURA,
      drivingLicenseSourceConfigured: true,
      driverStatus: {
        licenseValid: true,
        // Exatamente o que a resposta deu: não avaliado.
        hasImpediment: impedimentoLido,
        licenseExpiresAt: FUTURA,
      },
    };
    const bloco = regras.avaliarHabilitacao(entrada);
    reg(
      bloco.status === "inconclusive" && bloco.reasonCode === "LICENSE_STATUS_UNCONFIRMED",
      `6.4 com validade futura, o impedimento não avaliado deixa o bloco ` +
        `${bloco.status}/${bloco.reasonCode}`,
    );

    const composto = regras.compor([
      { block: "identity", status: "approved", reasonCode: "OK_ALL_CHECKS_PASSED" },
      bloco,
    ]);
    reg(
      composto.decision !== "approved",
      `6.5 com identidade APROVADA ainda assim NÃO aprova: ${composto.decision}/${composto.reasonCode}`,
    );

    // Controle positivo: com impedimento avaliado como falso, aprova. Sem
    // isto, 6.3 poderia passar por o motor nunca aprovar nada.
    const compostoOk = regras.compor([
      { block: "identity", status: "approved", reasonCode: "OK_ALL_CHECKS_PASSED" },
      regras.avaliarHabilitacao({
        ...entrada,
        driverStatus: { ...entrada.driverStatus, hasImpediment: false },
      }),
    ]);
    reg(
      compostoOk.decision === "approved",
      `6.6 controle positivo: com impedimento avaliado FALSO, aprova (${compostoOk.decision})`,
    );
  } else {
    reg(false, "6.1 sem a leitura do cenario 1 nao ha o que compor");
  }

  // ─── log ───────────────────────────────────────────────────────────────
  console.log("\n  -- log operacional --");
  const texto = JSON.stringify(log);
  reg(!texto.includes(registro.cpf), "L1. nenhum CPF no log");
  reg(!texto.includes(registro.nome), "L2. nenhum nome no log");
  reg(!/[A-Za-z0-9+/]{120,}/.test(texto), "L3. nenhum base64 longo no log");
  reg(
    log.every((e) => e.demonstracao === true),
    "L4. toda entrada marcada como demonstracao",
  );
  for (const e of log) {
    console.log(
      `    ${e.evento.padEnd(30)} HTTP ${String(e.httpStatus ?? "-").padStart(3)}  ` +
        `${String(e.duracaoMs).padStart(6)} ms  campos=${e.camposEnviados.length} omitidos=${e.camposOmitidos}`,
    );
  }

  const falhou = resultados.filter((x) => !x).length;
  console.log(`\n  TOTAL OK=${resultados.length - falhou}  FALHOU=${falhou}`);
  return falhou > 0 ? 1 : 0;
}

main()
  .then((c) => {
    rmSync(TMP, { recursive: true, force: true });
    process.exit(c);
  })
  .catch((e) => {
    console.error("\nERRO: " + (e.stderr || e.message));
    rmSync(TMP, { recursive: true, force: true });
    process.exit(2);
  });
