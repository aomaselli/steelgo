/**
 * O fluxo de documentos não aprova cadastro nem libera viagem.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UMA REGRESSÃO, E NÃO UM COMENTÁRIO
 *
 * A tela de validação e o cadastro do motorista estão a uma linha de distância
 * um do outro. `drivers.status`, `drivers.verification_status` e as tabelas de
 * viagem ficam no mesmo banco, alcançáveis pela mesma sessão. O jeito como
 * isso dá errado não é alguém decidir aprovar — é um `update` conveniente
 * aparecer num ajuste de fim de tarde, num fluxo que hoje roda contra
 * demonstração.
 *
 * Enquanto o adaptador real não estiver homologado contra o serviço
 * contratado, nada neste caminho pode escrever estado de aprovação. Esta
 * regressão lê o código-fonte, como a de service role, porque convenção de
 * diretório não segura mudança nenhuma.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ_DOCS = join(process.cwd(), "src", "server", "documents");
const TELA = join(process.cwd(), "src", "routes", "driver.validacao.tsx");
const TELA_REVISAO = join(process.cwd(), "src", "routes", "admin.validacao-documental.tsx");
const RAIZ_DEMO = join(
  process.cwd(),
  "src",
  "server",
  "verification",
  "datavalid",
  "demonstracao",
);

/** Tabelas e colunas cuja escrita significaria aprovar ou liberar. */
const ESCRITAS_PROIBIDAS: Array<{ nome: string; re: RegExp }> = [
  { nome: "tabela drivers", re: /\bfrom\(\s*["'`]drivers["'`]\s*\)/ },
  { nome: "tabela de viagens", re: /\bfrom\(\s*["'`](operational_trips|trips|freights)["'`]\s*\)/ },
  { nome: "tabela de verificação", re: /\bfrom\(\s*["'`]driver_verifications["'`]\s*\)/ },
  { nome: "estado de aprovação", re: /\b(verification_status|approval_status)\b/ },
  { nome: "atualização de estado", re: /\.update\(\s*\{[^}]*\bstatus\b/ },
];

function arquivosFonte(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosFonte(caminho, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

function relativo(caminho: string): string {
  return caminho.slice(process.cwd().length + 1);
}

test("documentos: nenhum arquivo escreve estado de aprovação ou de viagem", () => {
  const infratores: string[] = [];
  const alvos = [...arquivosFonte(RAIZ_DOCS), ...arquivosFonte(RAIZ_DEMO), TELA];

  for (const caminho of alvos) {
    // A própria regressão cita os termos que procura.
    if (/__tests__|\.test\.tsx?$/.test(caminho)) continue;
    const fonte = readFileSync(caminho, "utf8");
    for (const { nome, re } of ESCRITAS_PROIBIDAS) {
      if (re.test(fonte)) infratores.push(`${relativo(caminho)} — ${nome}`);
    }
  }

  assert.deepEqual(
    infratores,
    [],
    `o fluxo de documentos tocou em estado de aprovacao:\n  ${infratores.join("\n  ")}`,
  );
});

test("documentos: a barreira de ambiente é chamada em toda server function", () => {
  // Uma server function nova que esqueça a barreira roda contra o que
  // `SUPABASE_URL` apontar. O teste conta as declarações e as chamadas.
  const fonte = readFileSync(join(RAIZ_DOCS, "fluxo.fn.ts"), "utf8");
  const declaracoes = fonte.match(/createServerFn\(/g) ?? [];
  const barreiras = fonte.match(/conferirAmbienteSintetico\(/g) ?? [];
  assert.ok(declaracoes.length > 0, "nenhuma server function encontrada");
  assert.equal(
    barreiras.length,
    declaracoes.length,
    `${declaracoes.length} server function(s) e ${barreiras.length} chamada(s) da barreira`,
  );
});

/**
 * O caminho mais curto para um vazamento sério, neste repositório, é mandar ao
 * endpoint público de demonstração um documento que alguém enviou pela tela.
 * O endpoint é compartilhado, a tela não sabe se o arquivo é sintético, e o
 * botão de "processar" fica logo abaixo do de "enviar".
 *
 * A barreira principal é a assinatura: `processarDemonstracaoFn` aceita um
 * índice da massa e nada mais. Esta regressão guarda a barreira — ela falha no
 * dia em que alguém acrescentar um parâmetro de documento, antes de aquele
 * parâmetro chegar a ser usado.
 */
test("demonstração: o processamento não alcança documento do titular", () => {
  const PROIBIDOS: Array<{ nome: string; re: RegExp }> = [
    { nome: "conteúdo enviado pela tela", re: /\bconteudoBase64\b/ },
    { nome: "bucket de documentos", re: /["'`]validation-documents["'`]/ },
    { nome: "caminho de objeto", re: /\bobject_path\b|\bobjectPath\b/ },
    { nome: "cliente de storage", re: /\.storage\b/ },
    { nome: "módulo de envio de documentos", re: /from\s+["'`][^"'`]*documents\/envio["'`]/ },
  ];

  const infratores: string[] = [];
  for (const caminho of arquivosFonte(RAIZ_DEMO)) {
    if (/__tests__|\.test\.tsx?$/.test(caminho)) continue;
    const fonte = readFileSync(caminho, "utf8");
    for (const { nome, re } of PROIBIDOS) {
      if (re.test(fonte)) infratores.push(`${relativo(caminho)} — ${nome}`);
    }
  }

  assert.deepEqual(
    infratores,
    [],
    `o processamento de demonstracao encostou no documento do titular:\n  ${infratores.join("\n  ")}`,
  );
});

test("demonstração: a entrada do processamento é só o índice da massa", () => {
  const fonte = readFileSync(join(RAIZ_DEMO, "processamento.fn.ts"), "utf8");
  const schema = fonte.match(/const entradaSchema = z\.object\(\{([\s\S]*?)\}\);/);
  assert.ok(schema, "nao encontrei o schema de entrada");
  const campos = [...schema![1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => m[1]);
  assert.deepEqual(
    campos,
    ["indiceDaMassa"],
    `a entrada ganhou campo alem do indice: ${campos.join(", ")}`,
  );
});

test("documentos: a tela declara o estado de demonstração", () => {
  const fonte = readFileSync(TELA, "utf8");
  assert.match(
    fonte,
    /demonstra[çc][ãa]o/i,
    "a tela precisa dizer, de forma visivel, que roda em demonstracao",
  );
});

/**
 * D4 decidida: documento servido por rota autenticada, com autorização
 * revalidada por leitura. A tentação de voltar atrás é concreta — URL assinada
 * é uma linha de código e resolve o problema de hoje — e por isso a decisão
 * fica guardada por regressão, não por memória.
 */
test("leitura: nenhuma URL assinada no caminho dos documentos", () => {
  const PROIBIDOS: Array<{ nome: string; re: RegExp }> = [
    { nome: "emissão de URL assinada", re: /createSignedUrls?\s*\(/ },
    { nome: "URL pública do bucket", re: /getPublicUrl\s*\(/ },
    { nome: "redirecionamento para o Storage", re: /\bredirect\s*\(\s*["'`]https?:/ },
  ];

  const infratores: string[] = [];
  for (const caminho of [...arquivosFonte(RAIZ_DOCS), TELA, TELA_REVISAO]) {
    if (/__tests__|\.test\.tsx?$/.test(caminho)) continue;
    const fonte = readFileSync(caminho, "utf8");
    for (const { nome, re } of PROIBIDOS) {
      if (re.test(fonte)) infratores.push(`${relativo(caminho)} — ${nome}`);
    }
  }

  assert.deepEqual(
    infratores,
    [],
    `o caminho dos documentos voltou a emitir credencial:\n  ${infratores.join("\n  ")}`,
  );
});

test("revisão: toda server function de revisão aplica os cabeçalhos de leitura", () => {
  const fonte = readFileSync(join(RAIZ_DOCS, "revisao.fn.ts"), "utf8");
  const declaracoes = fonte.match(/createServerFn\(/g) ?? [];
  const cabecalhos = fonte.match(/aplicarCabecalhosDeLeitura\(/g) ?? [];
  assert.ok(declaracoes.length > 0, "nenhuma server function encontrada");
  assert.equal(
    cabecalhos.length,
    declaracoes.length,
    `${declaracoes.length} server function(s) e ${cabecalhos.length} aplicacao(oes) de cabecalho`,
  );
});

test("revisão: a tela do revisor não oferece aprovação", () => {
  const fonte = readFileSync(TELA_REVISAO, "utf8");
  // "não aprova" é texto do aviso e deve continuar lá; o que não pode existir
  // é um rótulo de ação que aprove.
  const rotulos = [...fonte.matchAll(/>\s*(Aprovar|Validar|Liberar)[^<]*</gi)].map((m) => m[0]);
  assert.deepEqual(rotulos, [], `a tela ganhou acao de aprovacao: ${rotulos.join(", ")}`);
  assert.match(fonte, /n[ãa]o aprova/i, "o aviso de que a revisao nao aprova sumiu");
});
