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
  const alvos = [...arquivosFonte(RAIZ_DOCS), TELA];

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

test("documentos: a tela declara o estado de demonstração", () => {
  const fonte = readFileSync(TELA, "utf8");
  assert.match(
    fonte,
    /demonstra[çc][ãa]o/i,
    "a tela precisa dizer, de forma visivel, que roda em demonstracao",
  );
});
