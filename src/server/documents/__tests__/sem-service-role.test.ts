/**
 * Nenhuma service role no caminho dos documentos de validação.
 *
 * A chave de service role ignora RLS. Se ela entrar no caminho que serve CNH e
 * selfie, toda a matriz de permissões do banco vira decoração: o código passa a
 * ser a única barreira, e a segunda barreira deixa de existir.
 *
 * Esta regressão lê o código-fonte em vez de confiar em convenção de diretório.
 * `src/server/` não é server-only por garantia do empacotador — é por hábito de
 * quem importa.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), "src");

/** Único lugar onde a service role é aceita hoje, e de onde não deve sair. */
const PERMITIDOS = new Set(
  [
    "src/integrations/supabase/client.server.ts",
    // Trilha de verificação: grava evento append-only que o próprio titular
    // não pode escrever. Precede este módulo e não é ampliado aqui.
    "src/server/verification/driver-verification.repository.ts",
  ].map((p) => p.replace(/\//g, "\\")),
);

function arquivosFonte(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosFonte(caminho, acc);
    } else if (/\.tsx?$/.test(nome)) {
      acc.push(caminho);
    }
  }
  return acc;
}

function relativo(caminho: string): string {
  return caminho.slice(process.cwd().length + 1);
}

test("service role: nenhum arquivo novo a usa fora da lista conhecida", () => {
  const infratores: string[] = [];
  for (const caminho of arquivosFonte(RAIZ)) {
    const rel = relativo(caminho);
    const relNormalizado = rel.replace(/\//g, "\\");
    if (PERMITIDOS.has(relNormalizado)) continue;
    // Teste não é código de aplicação: esta própria regressão cita os termos
    // que procura, e se auto-acusaria.
    if (/__tests__|\.test\.tsx?$/.test(rel)) continue;
    const fonte = readFileSync(caminho, "utf8");
    if (/supabaseAdmin|SERVICE_ROLE|client\.server/.test(fonte)) {
      infratores.push(rel);
    }
  }
  assert.deepEqual(
    infratores,
    [],
    `service role fora da lista permitida:\n  ${infratores.join("\n  ")}`,
  );
});

test("service role: o módulo de documentos não toca em cliente de banco algum", () => {
  // Lógica pura. Quem fizer a chamada ao storage usa a sessão de quem pede, e
  // a policy do bucket é a segunda barreira — não um detalhe contornável.
  const dir = join(RAIZ, "server", "documents");
  for (const caminho of arquivosFonte(dir)) {
    const fonte = readFileSync(caminho, "utf8");
    if (/__tests__/.test(caminho)) continue;
    assert.equal(
      /supabaseAdmin|SERVICE_ROLE|createClient|from\(["']https?:/.test(fonte),
      false,
      `${relativo(caminho)} não deveria instanciar cliente nem usar service role`,
    );
  }
});
