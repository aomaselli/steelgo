/**
 * Homologação ponta a ponta do adaptador Datavalid em modo DEMONSTRAÇÃO.
 *
 * Exercita o módulo de verdade (`src/server/verification/datavalid/demonstracao/`)
 * contra o serviço oficial de demonstração do SERPRO, com a massa fictícia
 * oficial. Nenhum dado de pessoa real, em nenhum ponto.
 *
 * O FLUXO, na ordem que a documentação impõe
 *
 *   1. registrar o template de tratamento RFB  -> devolve `id`
 *   2. obter token da GCC SIMULADA             -> `/v5/gcc/token`, só em demo
 *   3. mapear um registro da massa             -> recusando código sem tabela
 *   4. validar                                 -> `/v5/pessoa-fisica/validacao`
 *   5. ler o resultado POR BLOCO
 *
 * CREDENCIAL
 *
 * O bearer do ambiente de demonstração é publicado pelo próprio SERPRO no
 * artigo "Demonstração". Mesmo assim ele NÃO é versionado aqui: entra por
 * `DATAVALID_DEMO_BEARER`. Credencial publicada continua sendo credencial, e
 * repositório não é lugar de guardar nenhuma.
 *
 * MASSA
 *
 * `DATAVALID_MASSA_OFICIAL` aponta o `exemplos.json` baixado de
 * `apicenter.estaleiro.serpro.gov.br/documentacao/datavalid/downloads/`.
 * São ~12 MB para 5 registros, por causa da biometria em base64; não entra no
 * repositório.
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

// Ambiente local, exigido pelo próprio adaptador.
process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

const BEARER = process.env.DATAVALID_DEMO_BEARER;
const MASSA = process.env.DATAVALID_MASSA_OFICIAL;

const resultados = [];
function reg(ok, texto) {
  resultados.push(ok);
  console.log("  " + (ok ? "OK     | " : "FALHOU | ") + texto);
}

/** Compila o módulo real com o tsconfig do repositório. */
function compilar() {
  const saida = join(TMP, "compilado");
  mkdirSync(saida, { recursive: true });
  // O tsconfig gerado vive NO REPOSITORIO, nao no temporario.
  //
  // `extends` resolve `types` relativamente ao diretorio do proprio arquivo
  // de configuracao. Com ele no temporario, `vite/client` -- herdado do
  // tsconfig do projeto -- nao e encontrado, e o compilador para antes de
  // ver qualquer codigo. Sai no `finally`.
  const cfg = join(REPO, "tsconfig.homologacao-datavalid.json");
  const base = "src/server/verification/datavalid";
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
        // Sem `types: []`: isso tirava os tipos do Node e o modulo usa
        // `process.env`. Herdar o `types` do projeto e o que faz o
        // `tsc --noEmit` passar, e e a mesma configuracao.
      },
      include: [],
      files: [
        `${base}/demonstracao/ambiente.ts`,
        `${base}/demonstracao/mapa.ts`,
        `${base}/demonstracao/gcc-simulada.ts`,
        `${base}/demonstracao/cliente.ts`,
        `${base}/privacy.ts`,
        `${base}/semantics.ts`,
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
    // O `tsc` escreve os diagnosticos em stdout, nao em stderr. Sem isto a
    // falha chega como "Command failed" e nao se sabe o que nao compilou.
    const saidaTsc = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      "a compilacao do modulo falhou:\n" +
        saidaTsc.split("\n").map((l) => "    " + l).join("\n"),
    );
  } finally {
    rmSync(cfg, { force: true });
  }
  return join(saida, "demonstracao");
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
    // produto: validar o motorista que vai executar o frete. Não é escolha
    // de conveniência — hipótese tem de guardar relação com a finalidade.
    hipoteses_legais: ["EXECUCAO_CONTRATO"],
    eventos: ["onboarding_motorista", "validacao_de_habilitacao"],
    como_exercer_direitos: ["REQUISICAO_ELETRONICA"],
  };
}

const log = [];

async function main() {
  console.log("Datavalid — homologação do modo DEMONSTRAÇÃO\n");

  if (!BEARER) {
    console.log("  FALTA  | DATAVALID_DEMO_BEARER não definido.");
    console.log(
      "           O valor é publicado pelo SERPRO no artigo Demonstração;\n" +
        "           não é versionado aqui de propósito.",
    );
    return 2;
  }
  if (!MASSA) {
    console.log("  FALTA  | DATAVALID_MASSA_OFICIAL não definido (caminho do exemplos.json).");
    return 2;
  }

  const dir = compilar();
  const req = createRequire(import.meta.url);
  const ambiente = req(join(dir, "ambiente.js"));
  const mapa = req(join(dir, "mapa.js"));
  const gcc = req(join(dir, "gcc-simulada.js"));
  const cliente = req(join(dir, "cliente.js"));

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
    ambiente.assertDestinoDeDemonstracao(ambiente.PRODUCAO_BASE_URL + "/v5/pessoa-fisica/validacao");
  } catch {
    recusou = true;
  }
  reg(recusou, "B3. o destino de produção é recusado");
  reg(
    ambiente.CAMINHOS.template === "/v5/pessoa-fisica/privacidade/rfb/template-tratamento",
    `B4. caminho do template resolvido pelo OpenAPI: ${ambiente.CAMINHOS.template}`,
  );

  const operationId = "demo-" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);

  // ─── 1. template ───────────────────────────────────────────────────────
  console.log("\n  -- 1. template de tratamento RFB --");
  let idTemplate;
  try {
    const r = await cliente.registrarTemplate({
      bearer: BEARER,
      corpo: corpoDoTemplate(),
      operationId,
      log: (e) => log.push(e),
    });
    idTemplate = r.id;
    reg(true, `T1. template registrado (HTTP ${r.httpStatus}), id com ${r.id.length} caracteres`);
  } catch (e) {
    reg(false, `T1. registro do template falhou: ${e.message}`);
    console.log("\n  interrompido: sem id de template não há validação a fazer.");
    return 1;
  }

  // ─── 2. GCC simulada ───────────────────────────────────────────────────
  console.log("\n  -- 2. autorização da GCC SIMULADA --");
  const massa = JSON.parse(readFileSync(MASSA, "utf8"));
  reg(Array.isArray(massa) && massa.length === 5, `G0. massa oficial com ${massa.length} registros`);
  const registro = massa[0];

  // Mapeia primeiro, para pedir consentimento só dos campos que vão de fato.
  const { corpo, omitidos } = mapa.mapearRegistro(registro, { estrito: false });
  // Os parametros saem do corpo JA PODADO, pelo vocabulario fechado da GCC.
  // A primeira versao achatava os nomes por conta propria e produzia
  // `rfb.situacao_cpf`, que o servico recusa com HTTP 400 e a lista permitida
  // no corpo -- o vocabulario de consentimento nao tem prefixo `rfb.`.
  const parametros = mapa.parametrosDoCorpo(corpo.validacao);

  let autorizacao;
  try {
    autorizacao = await gcc.obterAutorizacaoSimulada({
      bearer: BEARER,
      cpfFicticio: registro.cpf,
      operationId,
      parametros,
      timeoutMs: 20_000,
      // Tres tentativas SO para obter o token: 502 transitorio do gateway
      // aconteceu na primeira execucao ponta a ponta. Repetir aqui nao
      // duplica validacao -- token emitido e nao usado expira.
      tentativas: 3,
    });
    reg(autorizacao.simulada === true, "G1. autorização obtida e marcada como SIMULADA");
    reg(
      autorizacao.origem === "simulador-serpro-demonstracao",
      `G2. origem registrada: ${autorizacao.origem}`,
    );
  } catch (e) {
    reg(false, `G1. simulador de GCC não emitiu token: ${e.message}`);
    console.log("\n  interrompido: sem autorização não se chama a validação.");
    return 1;
  }

  // ─── 3. mapeamento ─────────────────────────────────────────────────────
  console.log("\n  -- 3. mapeamento da massa para o contrato V5 --");
  reg(
    corpo.validacao.sexo === "FEMININO" || corpo.validacao.sexo === "MASCULINO",
    `M1. sexo traduzido por tabela oficial: ${corpo.validacao.sexo}`,
  );
  reg(
    corpo.validacao.nacionalidade === "BRASILEIRO",
    `M2. nacionalidade "1" -> ${corpo.validacao.nacionalidade}`,
  );
  reg(corpo.validacao.cnh?.situacao === "EMITIDA", `M3. cnh_situacao "3" -> ${corpo.validacao.cnh?.situacao}`);
  const impedimento = omitidos.find((o) => o.campo === "cnh_possui_impedimento");
  reg(
    !!impedimento && impedimento.motivo === "SEM_TABELA_OFICIAL",
    "M4. possui_impedimento RECUSADO: não há tabela oficial, não se converte",
  );
  reg(
    !("possui_impedimento" in (corpo.validacao.cnh ?? {})),
    "M5. o campo recusado não entrou na requisição",
  );
  const serializado = JSON.stringify(corpo);
  reg(
    !serializado.includes(String(registro.biometria_face ?? "x").slice(0, 40)),
    "M6. biometria não entrou no corpo",
  );
  console.log(
    `  nota   | campos enviados: ${Object.keys(corpo.validacao).length} no topo, ` +
      `${nomesDeCampo(corpo.validacao).length} contando os aninhados; omitidos: ${omitidos.length}`,
  );
  for (const o of omitidos) {
    console.log(`           omitido ${o.campo} (${o.motivo})`);
  }

  // ─── 4. validação ──────────────────────────────────────────────────────
  console.log("\n  -- 4. validação --");
  const r = await cliente.validarNaDemonstracao({
    bearer: BEARER,
    idTemplate,
    autorizacao,
    operationId,
    corpo,
    camposOmitidos: omitidos,
    log: (e) => log.push(e),
  });

  reg(r.demonstracao === true, "V1. o resultado vem marcado como demonstração");
  reg(r.aprovaCadastroReal === false, "V2. o resultado NÃO aprova cadastro real");
  reg(
    r.situacao === "respondido",
    `V3. situação: ${r.situacao}${r.httpStatus ? " (HTTP " + r.httpStatus + ")" : ""}` +
      (r.situacao !== "respondido" ? " — " + (r.detalhe ?? "") : ""),
  );

  if (r.situacao !== "respondido") {
    if (r.situacao === "desfecho_desconhecido") {
      reg(
        r.repeticaoAutomaticaBloqueada === true,
        "V4. repetição automática BLOQUEADA depois de possível envio",
      );
    } else {
      reg(r.retry.retry === false, "V4. recusa explícita não repete");
    }
  } else {
    // ─── 5. resultado por bloco ──────────────────────────────────────────
    console.log("\n  -- 5. resultado POR BLOCO --");
    const l = r.leitura;
    console.log(`    rfb_existe = ${l.rfbExiste}   cnh_existe = ${l.cnhExiste}`);
    for (const [nome, b] of Object.entries(l.blocos)) {
      const comp = Object.entries(b.comparacoes);
      const sim = Object.entries(b.similaridades);
      console.log(`    ${nome.padEnd(17)} ${b.estado}`);
      for (const [k, v] of comp) console.log(`      ${k.padEnd(34)} ${v}`);
      for (const [k, v] of sim) console.log(`      ${k.padEnd(34)} ${v}`);
      if (b.naoClassificados.length) {
        console.log(`      (não classificados: ${b.naoClassificados.join(", ")})`);
      }
    }
    reg(l.rfbExiste !== null, "V4. o bloco RFB foi avaliado");
    reg(
      l.blocos.biometriaFacial.estado === "ausente",
      "V5. biometria facial AUSENTE do resultado, porque não foi enviada",
    );
    reg(
      !("possui_impedimento" in l.blocos.cnh.comparacoes),
      "V6. nenhuma comparação de impedimento, porque o campo foi recusado",
    );
  }

  // ─── log ───────────────────────────────────────────────────────────────
  console.log("\n  -- log operacional --");
  const texto = JSON.stringify(log);
  reg(!texto.includes(registro.cpf), "L1. nenhum CPF no log");
  reg(!texto.includes(registro.nome), "L2. nenhum nome no log");
  reg(!texto.includes(autorizacao.token.slice(0, 20)), "L3. nenhum token no log");
  reg(
    log.every((e) => e.demonstracao === true),
    "L4. toda entrada marcada como demonstração",
  );
  for (const e of log) {
    console.log(
      `    ${e.evento.padEnd(32)} HTTP ${String(e.httpStatus ?? "-").padStart(3)}  ` +
        `${String(e.duracaoMs).padStart(5)} ms  campos=${e.camposEnviados.length} omitidos=${e.camposOmitidos}`,
    );
  }

  const falhou = resultados.filter((x) => !x).length;
  console.log(`\n  TOTAL OK=${resultados.length - falhou}  FALHOU=${falhou}`);
  return falhou > 0 ? 1 : 0;
}

/** Nomes de campo, achatados com ponto, como o `parametros` da GCC espera. */
function nomesDeCampo(obj, prefixo = "") {
  const saida = [];
  for (const [k, v] of Object.entries(obj)) {
    const nome = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) saida.push(...nomesDeCampo(v, nome));
    else saida.push(nome);
  }
  return saida;
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
