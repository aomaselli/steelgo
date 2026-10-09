/**
 * Adaptador de demonstração: as barreiras.
 *
 * A bateria está organizada pela ordem em que as coisas dão errado na vida
 * real: ambiente errado, destino trocado, código traduzido por palpite,
 * autorização simulada escapando para o caminho real, repetição depois de a
 * requisição sair, e segredo em log.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AmbienteDeProducaoError,
  DEMONSTRACAO_BASE_URL,
  DestinoNaoPermitidoError,
  PRODUCAO_BASE_URL,
  ambienteAtual,
  assertAmbienteDeDemonstracao,
  assertDestinoDeDemonstracao,
  urlDeDemonstracao,
  CAMINHOS,
} from "../ambiente";
import {
  CodigoDesconhecidoError,
  PARAMETROS_DE_CONSENTIMENTO,
  mapearRegistro,
  parametrosDoCorpo,
  type RegistroDaMassa,
} from "../mapa";
import {
  SimuladorIndisponivelError,
  TokenSimuladoDeOutraOperacaoError,
  type AutorizacaoSimulada,
  envelopeParaCorpo,
  montarPrivacidadeDeDemonstracao,
  obterAutorizacaoSimulada,
} from "../gcc-simulada";
import {
  DadoSensivelEmLogError,
  conferirEntradaDeLog,
  lerPorBloco,
  validarNaDemonstracao,
  type EntradaDeLog,
} from "../cliente";

const LOCAL = { NODE_ENV: "test" };

const AUTORIZACAO: AutorizacaoSimulada = {
  simulada: true,
  token: "token-simulado-de-teste",
  operationId: "op-1",
  cpfFicticio: "00000000000",
  cnpjAnuente: null,
  origem: "simulador-serpro-demonstracao",
};

// ────────────────────────── A. ambiente ────────────────────────────────────

test("A1. producao recusa inicializar", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { APP_ENV: "production" },
    { APP_ENV: "producao" },
    { VERCEL_ENV: "production" },
    { NODE_ENV: "test", VERCEL_ENV: "production" },
  ]) {
    assert.throws(() => assertAmbienteDeDemonstracao(env), AmbienteDeProducaoError, JSON.stringify(env));
  }
});

test("A2. ambiente que nao se declara tambem recusa", () => {
  // Ausência de sinal não é prova de que seja local. Presumir que é seria a
  // mesma falha, noutro lugar.
  assert.throws(() => assertAmbienteDeDemonstracao({}), AmbienteDeProducaoError);
  assert.throws(() => assertAmbienteDeDemonstracao({ NODE_ENV: "staging" }), AmbienteDeProducaoError);
  assert.equal(ambienteAtual({}).permitido, false);
});

test("A3. local e teste sao permitidos", () => {
  for (const env of [
    { NODE_ENV: "development" },
    { NODE_ENV: "test" },
    { APP_ENV: "local" },
    { APP_ENV: "teste" },
  ]) {
    assertAmbienteDeDemonstracao(env);
    assert.equal(ambienteAtual(env).permitido, true, JSON.stringify(env));
  }
});

// ────────────────────────── B. destino ─────────────────────────────────────

test("B1. o destino de producao e recusado por nome", () => {
  assert.throws(
    () => assertDestinoDeDemonstracao(PRODUCAO_BASE_URL + CAMINHOS.validacao),
    DestinoNaoPermitidoError,
  );
});

test("B2. qualquer outro destino e recusado", () => {
  for (const u of [
    "https://exemplo.invalido/v5/pessoa-fisica/validacao",
    "http://gateway.apiserpro.serpro.gov.br/datavalid-demonstracao/v5/pessoa-fisica/validacao",
    DEMONSTRACAO_BASE_URL + "/../datavalid/v5/pessoa-fisica/validacao",
    DEMONSTRACAO_BASE_URL + "//v5/pessoa-fisica/validacao",
    DEMONSTRACAO_BASE_URL,
  ]) {
    assert.throws(() => assertDestinoDeDemonstracao(u), DestinoNaoPermitidoError, u);
  }
});

test("B3. o caminho do template e o do OpenAPI, nao o da prosa", () => {
  // O webinar e o artigo escrevem `template-de-tratamento`, e o artigo omite
  // o `/v5` no POST. O OpenAPI — que é o que o servidor atende — declara
  // `/v5/pessoa-fisica/privacidade/rfb/template-tratamento`.
  assert.equal(CAMINHOS.template, "/v5/pessoa-fisica/privacidade/rfb/template-tratamento");
  assert.ok(!CAMINHOS.template.includes("template-de-tratamento"));
  assert.ok(CAMINHOS.template.startsWith("/v5/"));
  assert.equal(
    urlDeDemonstracao(CAMINHOS.template),
    DEMONSTRACAO_BASE_URL + "/v5/pessoa-fisica/privacidade/rfb/template-tratamento",
  );
});

// ────────────────────────── C. mapeamento ──────────────────────────────────

const REGISTRO: RegistroDaMassa = {
  cpf: "00000000000",
  nome: "Nome Ficticio da Massa",
  sexo: "F",
  data_nascimento: "1975-06-04",
  nacionalidade: "1",
  tipo_documento: "1",
  situacao_cpf: "regular",
  uf_expedidor: "SP",
  endereco_cep: "04766-900",
  endereco_uf: "SP",
  cnh_categoria: "B",
  cnh_situacao: "3",
  cnh_possui_impedimento: "1",
};

test("C1. os codigos COM tabela oficial sao traduzidos", () => {
  const { corpo } = mapearRegistro(REGISTRO);
  assert.equal(corpo.validacao.sexo, "FEMININO");
  assert.equal(corpo.validacao.nacionalidade, "BRASILEIRO");
  assert.equal(corpo.validacao.tipo_documento_origem, "RG");
  assert.equal((corpo.validacao.cnh as Record<string, unknown>).situacao, "EMITIDA");
  // `situacao_cpf` TAMBÉM é traduzida — mas o bloco `rfb` é podado depois, por
  // não ter parâmetro de consentimento. São dois fatos distintos, e quem
  // afirma o segundo é J2. Esta asserção pedia `rfb.situacao_cpf` no corpo e
  // passou a reprovar quando a poda entrou; estava afirmando a coisa errada.
  assert.equal("rfb" in corpo.validacao, false);
});

test("C2. a mascara do CEP sai", () => {
  const { corpo } = mapearRegistro(REGISTRO);
  assert.equal((corpo.validacao.endereco as Record<string, unknown>).cep, "04766900");
});

test("C3. possui_impedimento NAO e convertido: nao ha tabela oficial", () => {
  const { corpo, omitidos } = mapearRegistro(REGISTRO);
  const cnh = corpo.validacao.cnh as Record<string, unknown>;
  assert.equal("possui_impedimento" in cnh, false, "o campo nao pode entrar na requisicao");
  const o = omitidos.find((x) => x.campo === "cnh_possui_impedimento");
  assert.ok(o, "a omissao tem de ser relatada, nao silenciosa");
  assert.equal(o.motivo, "SEM_TABELA_OFICIAL");
  assert.equal(o.codigo, "1");
});

test("C4. codigo FORA da tabela lanca em modo estrito", () => {
  for (const [campo, mudanca] of [
    ["sexo", { sexo: "X" }],
    ["nacionalidade", { nacionalidade: "9" }],
    ["tipo_documento", { tipo_documento: "7" }],
    ["cnh_situacao", { cnh_situacao: "Z" }],
    ["situacao_cpf", { situacao_cpf: "indefinida" }],
    ["endereco_uf", { endereco_uf: "XX" }],
  ] as Array<[string, Partial<RegistroDaMassa>]>) {
    assert.throws(
      () => mapearRegistro({ ...REGISTRO, ...mudanca }),
      CodigoDesconhecidoError,
      `esperava recusa em ${campo}`,
    );
  }
});

test("C5. em modo nao estrito, omite e registra — nunca converte", () => {
  const { corpo, omitidos } = mapearRegistro({ ...REGISTRO, sexo: "X" }, { estrito: false });
  assert.equal("sexo" in corpo.validacao, false);
  const o = omitidos.find((x) => x.campo === "sexo");
  assert.ok(o);
  assert.equal(o.motivo, "CODIGO_FORA_DA_TABELA");
  assert.equal(o.codigo, "X");
});

test("C6. biometria e QR code ficam fora do recorte", () => {
  const { corpo } = mapearRegistro({
    ...REGISTRO,
    biometria_face: "QUFB".repeat(100),
    polegar_direito: "QkJC".repeat(100),
    qrcode: "Q0ND".repeat(100),
  });
  const serializado = JSON.stringify(corpo);
  assert.ok(!serializado.includes("QUFB"), "biometria facial nao pode entrar");
  assert.ok(!serializado.includes("QkJC"), "digital nao pode entrar");
  assert.ok(!serializado.includes("Q0ND"), "qrcode nao pode entrar");
});

// ─────────────────── D. a massa oficial, de verdade ────────────────────────

test("D1. os cinco registros oficiais mapeiam sem conversao por suposicao", () => {
  let massa: RegistroDaMassa[];
  try {
    massa = JSON.parse(
      readFileSync(process.env.DATAVALID_MASSA_OFICIAL ?? "", "utf8"),
    ) as RegistroDaMassa[];
  } catch {
    // Sem a massa em disco não há o que medir, e inventar registro aqui
    // transformaria a asserção em teatro. O arquivo tem 12 MB e não entra no
    // repositório; o harness de homologação o busca.
    return;
  }
  assert.equal(massa.length, 5);
  for (const r of massa) {
    const { corpo, omitidos } = mapearRegistro(r, { estrito: false });
    assert.equal(corpo.cpf, r.cpf);
    // Todo registro da massa traz `cnh_possui_impedimento`, e nenhum pode
    // tê-lo convertido.
    assert.ok(
      omitidos.some((o) => o.campo === "cnh_possui_impedimento"),
      "impedimento tem de ser omitido em todo registro",
    );
    assert.equal("possui_impedimento" in ((corpo.validacao.cnh ?? {}) as object), false);
  }
});

// ───────── J. vocabulario de consentimento (mais estreito que a requisicao) ─

test("J1. o vocabulario nao tem prefixo rfb., e nem os campos do bloco RFB", () => {
  // Nao e deducao: e a lista que o proprio servico devolve no corpo do 400.
  for (const n of ["rfb.situacao_cpf", "rfb.nome_social", "rfb.data_inscricao_cpf",
                   "situacao_cpf", "nome_social", "data_inscricao_cpf"]) {
    assert.equal(PARAMETROS_DE_CONSENTIMENTO.has(n), false, n);
  }
  for (const n of ["cnh.situacao", "endereco.cep", "cpf", "nome", "sexo"]) {
    assert.equal(PARAMETROS_DE_CONSENTIMENTO.has(n), true, n);
  }
});

test("J2. campo sem parametro de consentimento NAO e enviado", () => {
  const { corpo, omitidos } = mapearRegistro(
    { ...REGISTRO, nome_social: "Nome Social Ficticio", data_inscricao: "1994-06-01" },
    { estrito: false },
  );
  // O bloco `rfb` inteiro sai: nenhum de seus campos tem consentimento.
  assert.equal("rfb" in corpo.validacao, false);
  const motivos = omitidos.filter((o) => o.motivo === "SEM_PARAMETRO_DE_CONSENTIMENTO");
  assert.ok(motivos.length >= 2, "as omissoes tem de ser relatadas");
  assert.ok(motivos.some((o) => o.campo === "rfb.situacao_cpf"));
});

test("J3. os parametros pedidos saem do corpo JA podado", () => {
  const { corpo } = mapearRegistro(REGISTRO, { estrito: false });
  const p = parametrosDoCorpo(corpo.validacao);
  assert.ok(p.includes("cpf"), "cpf sempre entra");
  for (const n of p) {
    assert.equal(PARAMETROS_DE_CONSENTIMENTO.has(n), true, `${n} fora do vocabulario`);
  }
  // Pedir a lista inteira seria coletar autorizacao que nao se usa.
  assert.ok(p.length < PARAMETROS_DE_CONSENTIMENTO.size);
});

// ───────── K. token: repetir so aqui, e so em falha transitoria ─────────────

test("K1. 5xx ao obter token repete; 4xx nao", async () => {
  process.env.NODE_ENV = "test";
  let chamadas = 0;
  const transitorio = (async () => {
    chamadas += 1;
    if (chamadas < 3) return new Response("", { status: 502 });
    return new Response("token-simulado", { status: 201 });
  }) as unknown as typeof fetch;

  const a = await obterAutorizacaoSimulada({
    bearer: "b",
    cpfFicticio: "00000000000",
    operationId: "op-1",
    parametros: ["cpf"],
    timeoutMs: 1000,
    tentativas: 3,
    fetchImpl: transitorio,
  });
  assert.equal(a.simulada, true);
  assert.equal(chamadas, 3);

  let chamadas4xx = 0;
  const definitivo = (async () => {
    chamadas4xx += 1;
    return new Response("", { status: 400 });
  }) as unknown as typeof fetch;
  await assert.rejects(
    () =>
      obterAutorizacaoSimulada({
        bearer: "b",
        cpfFicticio: "00000000000",
        operationId: "op-1",
        parametros: ["cpf"],
        timeoutMs: 1000,
        tentativas: 3,
        fetchImpl: definitivo,
      }),
    SimuladorIndisponivelError,
  );
  assert.equal(chamadas4xx, 1, "recusa 4xx nao se repete");
});

test("K2. o token vem em texto puro, nao em JSON", async () => {
  const texto = (async () =>
    new Response("eyJhbGciOiJSUzI1NiJ9.corpo.demo", {
      status: 201,
      headers: { "Content-Type": "text/plain" },
    })) as unknown as typeof fetch;
  const a = await obterAutorizacaoSimulada({
    bearer: "b",
    cpfFicticio: "00000000000",
    operationId: "op-1",
    parametros: ["cpf"],
    timeoutMs: 1000,
    fetchImpl: texto,
  });
  assert.equal(a.token, "eyJhbGciOiJSUzI1NiJ9.corpo.demo");
});

// ─────────────────── E. a autorizacao simulada ─────────────────────────────

test("E1. a autorizacao simulada se declara simulada, sempre", () => {
  assert.equal(AUTORIZACAO.simulada, true);
  assert.equal(AUTORIZACAO.origem, "simulador-serpro-demonstracao");
});

test("E2. token simulado de outra operacao e recusado", () => {
  assert.throws(
    () => montarPrivacidadeDeDemonstracao("id-template", AUTORIZACAO, "op-OUTRA"),
    TokenSimuladoDeOutraOperacaoError,
  );
});

test("E3. o envelope carrega marca de demonstracao, e ela NAO vai no corpo", () => {
  const e = montarPrivacidadeDeDemonstracao("id-template", AUTORIZACAO, "op-1");
  assert.equal(e.__demonstracao, true);
  const corpo = envelopeParaCorpo(e);
  assert.equal("__demonstracao" in corpo, false, "marca nossa nao vai para a API");
  assert.equal(corpo.rfb.id_template, "id-template");
});

test("E4. a autorizacao simulada nao tem a forma da autorizacao real", () => {
  // `GccAuthorizationToken` não tem `simulada`, e o compilador recusa a
  // passagem de uma pela outra. Em execução, o que se pode afirmar é que a
  // forma é distinta — e é isso que esta asserção fixa, para que ninguém
  // "conserte" a incompatibilidade acrescentando o campo lá.
  assert.ok("simulada" in AUTORIZACAO);
  assert.ok("origem" in AUTORIZACAO);
  assert.ok("cpfFicticio" in AUTORIZACAO);
});

// ───────────────── F. repeticao depois de possivel envio ───────────────────

function respostaFalsa(status: number): typeof fetch {
  return (async () =>
    new Response(status === 200 ? JSON.stringify({ rfb_existe: true }) : "", {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const CHAMADA_BASE = {
  bearer: "bearer-de-teste",
  idTemplate: "id-template",
  autorizacao: AUTORIZACAO,
  operationId: "op-1",
  corpo: { cpf: "00000000000", validacao: { nome: "Nome Ficticio" } },
  camposOmitidos: [],
};

test("F1. 5xx devolve desfecho desconhecido com repeticao BLOQUEADA", async () => {
  process.env.NODE_ENV = "test";
  const r = await validarNaDemonstracao({ ...CHAMADA_BASE, fetchImpl: respostaFalsa(503) });
  assert.equal(r.situacao, "desfecho_desconhecido");
  assert.equal(r.situacao === "desfecho_desconhecido" && r.repeticaoAutomaticaBloqueada, true);
  assert.equal(r.retry.retry, false);
});

test("F2. timeout tambem bloqueia repeticao", async () => {
  const travado = (async (_u: string, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("abortado");
        e.name = "AbortError";
        rej(e);
      });
    })) as unknown as typeof fetch;

  const r = await validarNaDemonstracao({
    ...CHAMADA_BASE,
    timeoutMs: 30,
    fetchImpl: travado,
  });
  assert.equal(r.situacao, "desfecho_desconhecido");
  assert.equal(r.httpStatus, null);
  assert.equal(r.situacao === "desfecho_desconhecido" && r.repeticaoAutomaticaBloqueada, true);
  assert.match(r.situacao === "desfecho_desconhecido" ? r.detalhe : "", /tempo esgotado/);
});

test("F3. recusa explicita nao repete", async () => {
  const r = await validarNaDemonstracao({ ...CHAMADA_BASE, fetchImpl: respostaFalsa(422) });
  assert.equal(r.situacao, "recusado");
  assert.equal(r.retry.retry, false);
  assert.equal(r.retry.reason, "RECUSA_DEFINITIVA");
});

test("F4. nenhum resultado aprova cadastro real", async () => {
  for (const status of [200, 422, 503]) {
    const r = await validarNaDemonstracao({ ...CHAMADA_BASE, fetchImpl: respostaFalsa(status) });
    assert.equal(r.aprovaCadastroReal, false, `status ${status}`);
    assert.equal(r.demonstracao, true, `status ${status}`);
  }
});

// ───────────────────────── G. leitura por bloco ────────────────────────────

test("G1. cada bloco e lido em separado", () => {
  const l = lerPorBloco({
    rfb_existe: true,
    cnh_existe: false,
    rfb: { nome_similaridade: 1, situacao_cpf: true, data_nascimento: false },
    cnh: {},
    qrcode: { categoria_decodificado: "B" },
  });
  assert.equal(l.rfbExiste, true);
  assert.equal(l.cnhExiste, false);
  assert.equal(l.blocos.rfb.estado, "lido");
  assert.deepEqual(l.blocos.rfb.comparacoes, { situacao_cpf: true, data_nascimento: false });
  assert.deepEqual(l.blocos.rfb.similaridades, { nome_similaridade: 1 });
  assert.equal(l.blocos.cnh.estado, "vazio");
  assert.equal(l.blocos.biometriaFacial.estado, "ausente", "bloco ausente nao e bloco vazio");
  assert.deepEqual(l.blocos.qrcode.decodificados, { categoria_decodificado: "B" });
});

test("G3. bloco aninhado e lido, nao jogado em nao classificados", () => {
  // A resposta real aninha: dentro de `cnh` vem um `endereco` com as
  // comparacoes de logradouro, bairro, CEP e municipio. A primeira versao do
  // leitor nao descia, e essas comparacoes apareciam como ruido.
  const l = lerPorBloco({
    cnh: {
      categoria: true,
      endereco: { logradouro: true, cep: false, municipio_similaridade: 0.8 },
    },
  });
  assert.equal(l.blocos.cnh.comparacoes["endereco.logradouro"], true);
  assert.equal(l.blocos.cnh.comparacoes["endereco.cep"], false);
  assert.equal(l.blocos.cnh.similaridades["endereco.municipio_similaridade"], 0.8);
  assert.deepEqual(l.blocos.cnh.naoClassificados, []);
});

test("G2. ausencia de rfb_existe nao vira false", () => {
  const l = lerPorBloco({});
  assert.equal(l.rfbExiste, null);
  assert.equal(l.cnhExiste, null);
});

// ──────────────────────────── H. log seguro ────────────────────────────────

const LOG_BASE: EntradaDeLog = {
  evento: "validacao.respondida",
  operationId: "op-1",
  caminho: CAMINHOS.validacao,
  httpStatus: 200,
  duracaoMs: 12,
  camposEnviados: ["nome", "data_nascimento"],
  camposOmitidos: 1,
  demonstracao: true,
};

test("H1. a entrada limpa passa", () => {
  conferirEntradaDeLog(LOG_BASE);
});

test("H2. token, biometria, CPF e segredo sao recusados no log", () => {
  const ruins: Array<[string, Partial<EntradaDeLog>]> = [
    ["JWT", { detalhe: "token eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.abc" }],
    ["data URI", { detalhe: "data:image/png;base64,AAAA" }],
    ["base64 longo", { detalhe: "QUFB".repeat(40) }],
    ["CPF", { detalhe: "titular 257.744.350-16" }],
    ["segredo", { detalhe: "usando o service_role" }],
    ["URL com credencial", { detalhe: "GET /obj?token=abc" }],
    ["campo com JWT", { camposEnviados: ["eyJhbGciOiJIUzI1NiJ9.x"] }],
  ];
  for (const [nome, mudanca] of ruins) {
    assert.throws(
      () => conferirEntradaDeLog({ ...LOG_BASE, ...mudanca }),
      DadoSensivelEmLogError,
      `esperava recusa de ${nome}`,
    );
  }
});

test("H3. o cliente so registra nomes de campo, nunca valores", async () => {
  const entradas: EntradaDeLog[] = [];
  await validarNaDemonstracao({
    ...CHAMADA_BASE,
    corpo: {
      cpf: "25774435016",
      validacao: { nome: "Nome Ficticio da Massa", data_nascimento: "1975-06-04" },
    },
    log: (e) => entradas.push(e),
    fetchImpl: respostaFalsa(200),
  });
  assert.equal(entradas.length, 1);
  const serializado = JSON.stringify(entradas[0]);
  assert.ok(!serializado.includes("25774435016"), "o CPF nao pode aparecer");
  assert.ok(!serializado.includes("Nome Ficticio"), "o nome nao pode aparecer");
  assert.ok(!serializado.includes("1975-06-04"), "a data nao pode aparecer");
  assert.ok(serializado.includes("data_nascimento"), "o NOME do campo pode");
  assert.equal(entradas[0].demonstracao, true);
});

test("H4. corpo de erro nao entra no log", async () => {
  const entradas: EntradaDeLog[] = [];
  const comEco = (async () =>
    new Response(JSON.stringify({ erro: "cpf 25774435016 invalido" }), { status: 422 })) as unknown as typeof fetch;
  await validarNaDemonstracao({ ...CHAMADA_BASE, log: (e) => entradas.push(e), fetchImpl: comEco });
  assert.ok(!JSON.stringify(entradas).includes("25774435016"));
});

// ──────────────── I. producao bloqueia a chamada, nao so a fabrica ─────────

test("I1. a chamada em si recusa em producao", async () => {
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(
      () => validarNaDemonstracao({ ...CHAMADA_BASE, fetchImpl: respostaFalsa(200) }),
      AmbienteDeProducaoError,
    );
  } finally {
    process.env.NODE_ENV = anterior;
  }
});

test("I2. ambienteAtual nomeia o sinal que causou a recusa", () => {
  const a = ambienteAtual({ NODE_ENV: "production", VERCEL_ENV: "production" });
  assert.equal(a.permitido, false);
  assert.match(a.motivo, /NODE_ENV=production/);
  assert.match(a.motivo, /VERCEL_ENV=production/);
});

void LOCAL;
