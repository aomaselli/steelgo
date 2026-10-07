// Regressões dos scripts de verificação de TypeScript.
//
// Cada caso aqui corresponde a uma falha que a inspeção encontrou e que a
// versão anterior deixava passar. Rodam com o executor do próprio Node:
//
//     node --test .github/scripts/
//
// Não dependem do vitest (cuja configuração cobre só `src/**`) nem do projeto
// compilar: trabalham sobre logs de tsc fabricados.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { extrair, formatar, conferirExecucao, ARQUIVO_GLOBAL } from "./diagnosticos-tsc.mjs";
import { ler, comparar } from "./comparar-diagnosticos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXTRATOR = path.join(AQUI, "diagnosticos-tsc.mjs");
const COMPARADOR = path.join(AQUI, "comparar-diagnosticos.mjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-regressoes-"));
const arquivoCom = (nome, conteudo) => {
  const p = path.join(tmp, nome);
  fs.writeFileSync(p, conteudo);
  return p;
};

/** Roda um script e devolve { codigo, saida, erro } sem lançar. */
function rodar(script, args) {
  try {
    const saida = execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe" });
    return { codigo: 0, saida, erro: "" };
  } catch (e) {
    return { codigo: e.status ?? -1, saida: e.stdout ?? "", erro: e.stderr ?? "" };
  }
}

const LOG_NORMAL = [
  "src/a.ts(10,5): error TS2345: Argument of type 'x' is not assignable.",
  "src/a.ts(44,9): error TS2345: Argument of type 'x' is not assignable.",
  "src/b.ts(3,1): error TS2554: Expected 1 arguments, but got 2.",
  "Found 3 errors in 2 files.",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// 1. Diagnóstico GLOBAL (sem arquivo)
// ---------------------------------------------------------------------------
test("erro global sem arquivo entra no mapa como (global)", () => {
  const r = extrair("error TS5083: Cannot read file 'tsconfig.json'.\n");
  assert.equal(r.mapa.size, 1);
  assert.equal([...r.mapa.keys()][0], `${ARQUIVO_GLOBAL}|TS5083|Cannot read file 'tsconfig.json'.`);
  assert.equal(r.ocorrencias, 1);
});

test("erro global NAO e confundido com projeto limpo", () => {
  const r = extrair("error TS18003: No inputs were found in config file.\n");
  const v = conferirExecucao({ codigoTsc: 1, resultado: r });
  assert.equal(v.ok, true, v.motivo);
  assert.match(formatar(r.mapa), /\(global\)\|TS18003\|/);
});

test("erro global aparece como diagnostico NOVO contra a linha de base", () => {
  const base = ler(formatar(extrair(LOG_NORMAL).mapa));
  const atual = ler(formatar(extrair(LOG_NORMAL + "error TS5083: Cannot read file 'tsconfig.json'.\n").mapa));
  const v = comparar(base, atual);
  assert.equal(v.regrediu, true);
  assert.equal(v.novos.length, 1);
  assert.match(v.novos[0].chave, /^\(global\)\|TS5083\|/);
});

// ---------------------------------------------------------------------------
// 2. Comando indisponível / falha de execução
// ---------------------------------------------------------------------------
test("codigo 127 (comando ausente) reprova, mesmo com log vazio", () => {
  const v = conferirExecucao({ codigoTsc: 127, resultado: extrair("") });
  assert.equal(v.ok, false);
  assert.match(v.motivo, /nao chegou a executar/);
});

test("CLI com log vazio e codigo 127 sai com 3 e nao grava medicao", () => {
  const log = arquivoCom("vazio.log", "");
  const saida = path.join(tmp, "nao-deve-existir.txt");
  const r = rodar(EXTRATOR, [log, "--codigo-tsc", "127", "--saida", saida]);
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /::error::/);
  assert.equal(fs.existsSync(saida), false, "nao pode gravar medicao quando o tsc nao rodou");
});

test("CLI com log inexistente sai com 3", () => {
  const r = rodar(EXTRATOR, [path.join(tmp, "nao-existe.log"), "--codigo-tsc", "1"]);
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /nao encontrado/);
});

test("codigo 2 sem nenhum diagnostico reconhecido reprova", () => {
  const v = conferirExecucao({ codigoTsc: 2, resultado: extrair("algum texto qualquer\n") });
  assert.equal(v.ok, false);
  assert.match(v.motivo, /nenhum diagnostico/);
});

test("codigo 0 com diagnosticos no log reprova (incoerencia)", () => {
  const v = conferirExecucao({ codigoTsc: 0, resultado: extrair(LOG_NORMAL) });
  assert.equal(v.ok, false);
  assert.match(v.motivo, /saiu com 0/);
});

test("codigo 0 com log limpo aprova", () => {
  const v = conferirExecucao({ codigoTsc: 0, resultado: extrair("") });
  assert.equal(v.ok, true, v.motivo);
});

// ---------------------------------------------------------------------------
// 3. Saída inesperada
// ---------------------------------------------------------------------------
test("linha que fala em erro e nao e diagnostico interrompe", () => {
  const texto = LOG_NORMAL + "FATAL ERROR: Ineffective mark-compacts near heap limit\n";
  const v = conferirExecucao({ codigoTsc: 1, resultado: extrair(texto) });
  assert.equal(v.ok, false);
  assert.match(v.motivo, /saida inesperada/);
});

test("resumo 'Found N errors' divergente interrompe (log truncado)", () => {
  const texto = [
    "src/a.ts(10,5): error TS2345: Argument of type 'x' is not assignable.",
    "Found 9 errors in 4 files.",
    "",
  ].join("\n");
  const v = conferirExecucao({ codigoTsc: 1, resultado: extrair(texto) });
  assert.equal(v.ok, false);
  assert.match(v.motivo, /anunciou 9/);
});

test("continuacao indentada de mensagem nao vira linha inesperada", () => {
  const texto = [
    "src/a.ts(10,5): error TS2345: Argument of type 'x' is not assignable.",
    "  Types of property 'id' are incompatible.",
    "Found 1 error in 1 file.",
    "",
  ].join("\n");
  const r = extrair(texto);
  assert.equal(r.inesperadas.length, 0);
  assert.equal(conferirExecucao({ codigoTsc: 1, resultado: r }).ok, true);
});

test("ruido sem a palavra erro passa, mas e contado", () => {
  const r = extrair(LOG_NORMAL + "npm warn exec package pode ficar desatualizado\n");
  assert.equal(r.inesperadas.length, 0);
  assert.equal(r.ruido.length, 1);
});

// ---------------------------------------------------------------------------
// 4. Comparação de mapas: redução passa, aumento e novo reprovam
// ---------------------------------------------------------------------------
const CHAVE_A = "src/a.ts|TS2345|Argument of type 'x' is not assignable.";
const CHAVE_B = "src/b.ts|TS2554|Expected 1 arguments, but got 2.";

test("REDUCAO de ocorrencias APROVA (era isto que reprovava antes)", () => {
  const base = ler(`5\t${CHAVE_A}\n1\t${CHAVE_B}\n`);
  const atual = ler(`3\t${CHAVE_A}\n1\t${CHAVE_B}\n`);
  const v = comparar(base, atual);
  assert.equal(v.regrediu, false);
  assert.equal(v.melhorou, true);
  assert.deepEqual(v.reducoes, [{ chave: CHAVE_A, de: 5, para: 3 }]);
});

test("REDUCAO de ocorrencias aprova tambem pela CLI", () => {
  const base = arquivoCom("base-red.txt", `5\t${CHAVE_A}\n`);
  const atual = arquivoCom("atual-red.txt", `3\t${CHAVE_A}\n`);
  const r = rodar(COMPARADOR, [base, atual]);
  assert.equal(r.codigo, 0);
  assert.match(r.saida, /menos frequentes/);
});

test("diagnostico resolvido por completo APROVA", () => {
  const v = comparar(ler(`2\t${CHAVE_A}\n1\t${CHAVE_B}\n`), ler(`2\t${CHAVE_A}\n`));
  assert.equal(v.regrediu, false);
  assert.equal(v.sumidos.length, 1);
});

test("AUMENTO de ocorrencias REPROVA", () => {
  const v = comparar(ler(`3\t${CHAVE_A}\n`), ler(`4\t${CHAVE_A}\n`));
  assert.equal(v.regrediu, true);
  assert.deepEqual(v.aumentos, [{ chave: CHAVE_A, de: 3, para: 4 }]);
});

test("diagnostico NOVO REPROVA", () => {
  const v = comparar(ler(`3\t${CHAVE_A}\n`), ler(`3\t${CHAVE_A}\n1\t${CHAVE_B}\n`));
  assert.equal(v.regrediu, true);
  assert.equal(v.novos.length, 1);
});

test("MESMA CONTAGEM com diagnostico trocado REPROVA", () => {
  const v = comparar(ler(`1\t${CHAVE_A}\n`), ler(`1\t${CHAVE_B}\n`));
  assert.equal(v.regrediu, true);
  assert.equal(v.novos.length, 1);
  assert.equal(v.sumidos.length, 1);
});

test("conjunto identico APROVA e nao pede atualizacao", () => {
  const v = comparar(ler(`3\t${CHAVE_A}\n`), ler(`3\t${CHAVE_A}\n`));
  assert.equal(v.regrediu, false);
  assert.equal(v.melhorou, false);
});

test("AUMENTO reprova pela CLI com codigo 1", () => {
  const base = arquivoCom("base-aum.txt", `3\t${CHAVE_A}\n`);
  const atual = arquivoCom("atual-aum.txt", `4\t${CHAVE_A}\n`);
  const r = rodar(COMPARADOR, [base, atual]);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /::error::/);
});

test("arquivo de medicao com formato invalido reprova, nao e lido como vazio", () => {
  const base = arquivoCom("base-fmt.txt", `3\t${CHAVE_A}\n`);
  const atual = arquivoCom("atual-fmt.txt", "isto nao e o formato\n");
  const r = rodar(COMPARADOR, [base, atual]);
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /formato invalido/);
});

// ---------------------------------------------------------------------------
// 5. Fim a fim: extrator -> comparador
// ---------------------------------------------------------------------------
test("fim a fim: log normal gera medicao identica a si mesma", () => {
  const log = arquivoCom("normal.log", LOG_NORMAL);
  const med = path.join(tmp, "medicao.txt");
  const e = rodar(EXTRATOR, [log, "--codigo-tsc", "1", "--saida", med]);
  assert.equal(e.codigo, 0, e.erro);
  const c = rodar(COMPARADOR, [med, med]);
  assert.equal(c.codigo, 0);
  assert.match(c.saida, /IDENTICO/);
});
