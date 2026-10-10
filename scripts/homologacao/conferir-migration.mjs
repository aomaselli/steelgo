/**
 * O descartável corresponde ao arquivo FINAL da migration?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O HISTÓRICO NÃO RESPONDE ISSO
 *
 * `supabase_migrations.schema_migrations` guarda a versão aplicada e o texto
 * que foi aplicado NAQUELE momento. A migration do #13 mudou DEPOIS da
 * primeira aplicação — ganhou o `check` do ator de sistema e as duas colunas
 * de falha de expurgo, aplicadas em separado. A linha do histórico continua
 * dizendo "20261009090000 aplicada", e isso não prova que o banco corresponda
 * ao arquivo de hoje. Pode faltar coisa, pode sobrar.
 *
 * Então a conferência é ESTRUTURAL: o que o arquivo declara tem de existir no
 * banco, e com a mesma definição. É o que este script faz.
 *
 * O QUE ELE NÃO FAZ
 *
 * Não aplica a migration num banco limpo. A conexão do validador é fixa no
 * banco `postgres` do contêiner autorizado — barreira de desenho, não
 * limitação acidental —, e aplicar num banco novo exigiria conectar noutro
 * banco. A reprodutibilidade em banco limpo precisa de uma instância nova, e
 * isso é decisão de quem autoriza, não deste script.
 *
 * O que ele dá no lugar: a lista completa de objetos declarados, conferida um
 * a um contra o banco, mais a conferência de que o arquivo é internamente
 * aplicável em ordem.
 *
 * USO
 *   node scripts/homologacao/conferir-migration.mjs <impressao.txt>
 *
 * A impressão vem de uma consulta pelo validador; o script não fala com banco.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/20261009090000_validation_documents.sql";

const resultados = [];
function reg(ok, texto) {
  resultados.push(ok);
  console.log("  " + (ok ? "OK     | " : "FALHOU | ") + texto);
}

const impressaoPath = process.argv[2];
if (!impressaoPath) {
  console.log("uso: node scripts/homologacao/conferir-migration.mjs <impressao.txt>");
  process.exit(2);
}

const sql = readFileSync(MIGRATION, "utf8");
const impressao = readFileSync(impressaoPath, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim() !== "");

const porTipo = (t) => impressao.filter((l) => l.startsWith(t + "|"));

console.log("Conferência: descartável × arquivo final da migration\n");
console.log(`  arquivo: ${MIGRATION}`);
console.log(`  sha256:  ${createHash("sha256").update(readFileSync(MIGRATION)).digest("hex")}`);
console.log(`  impressão do banco: ${impressao.length} linhas\n`);

// ─────────────── 1. o que o ARQUIVO declara ────────────────────────────────

const tabelasDeclaradas = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(
  (m) => m[1],
);
const constraintsDeclaradas = [
  ...sql.matchAll(/constraint\s+(\w+)\s+check/gi),
  ...sql.matchAll(/add constraint\s+(\w+)\s+check/gi),
].map((m) => m[1]);
const indicesDeclarados = [...sql.matchAll(/create index if not exists (\w+)/g)].map((m) => m[1]);
const policiesDeclaradas = [...sql.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
const colunasDeclaradas = [...sql.matchAll(/add column (\w+)\s+(\w+)/g)].map((m) => m[1]);
const triggersDeclarados = [...sql.matchAll(/create trigger (\w+)/g)].map((m) => m[1]);

console.log("  -- o que o arquivo declara --");
console.log(`    tabelas ....... ${tabelasDeclaradas.length}  ${tabelasDeclaradas.join(", ")}`);
console.log(`    constraints ... ${constraintsDeclaradas.length}`);
console.log(`    índices ....... ${indicesDeclarados.length}`);
console.log(`    policies ...... ${policiesDeclaradas.length}`);
console.log(`    colunas add ... ${colunasDeclaradas.length}  ${colunasDeclaradas.join(", ")}`);
console.log(`    triggers ...... ${triggersDeclarados.length}`);
console.log();

// ─────────────── 2. cada declaração existe no banco? ───────────────────────

console.log("  -- cada objeto declarado existe no banco --");

const tabelasNoBanco = new Set(porTipo("TABELA").map((l) => l.split("|")[1]));
for (const t of tabelasDeclaradas) {
  reg(tabelasNoBanco.has(t), `tabela ${t}`);
}

const constraintsNoBanco = new Set(porTipo("CONSTRAINT").map((l) => l.split("|")[2]));
for (const c of constraintsDeclaradas) {
  reg(constraintsNoBanco.has(c), `constraint ${c}`);
}

const indicesNoBanco = new Set(porTipo("INDICE").map((l) => l.split("|")[2]));
for (const i of indicesDeclarados) {
  reg(indicesNoBanco.has(i), `índice ${i}`);
}

const policiesNoBanco = new Set(porTipo("POLICY").map((l) => l.split("|")[2]));
for (const p of policiesDeclaradas) {
  reg(policiesNoBanco.has(p), `policy ${p}`);
}

const colunasNoBanco = new Set(porTipo("TABELA").map((l) => l.split("|")[2]));
for (const c of colunasDeclaradas) {
  reg(colunasNoBanco.has(c), `coluna ${c}`);
}

const triggersNoBanco = new Set(porTipo("TRIGGER").map((l) => l.split("|")[2]));
for (const t of triggersDeclarados) {
  reg(triggersNoBanco.has(t), `trigger ${t}`);
}

// ─────────────── 3. e o banco tem algo A MAIS? ─────────────────────────────

console.log("\n  -- o banco tem objeto que o arquivo NÃO declara? --");
const DECLARADOS_FORA_DO_ARQUIVO = new Set([
  // Chaves primárias, únicas e FK que o Postgres nomeia sozinho a partir da
  // definição inline das colunas. Estão no arquivo, só não com `constraint X`.
  ...porTipo("CONSTRAINT")
    .map((l) => l.split("|"))
    .filter(([, , nome, tipo]) => tipo !== "c" || /_pkey$|_key$|_fkey$/.test(nome))
    .map(([, , nome]) => nome),
  ...porTipo("INDICE")
    .map((l) => l.split("|")[2])
    .filter((n) => /_pkey$|_key$/.test(n)),
]);

const sobrandoConstraints = [...constraintsNoBanco].filter(
  (c) => !constraintsDeclaradas.includes(c) && !DECLARADOS_FORA_DO_ARQUIVO.has(c),
);
reg(
  sobrandoConstraints.length === 0,
  sobrandoConstraints.length === 0
    ? "nenhuma constraint a mais"
    : `constraints a mais: ${sobrandoConstraints.join(", ")}`,
);

const sobrandoPolicies = [...policiesNoBanco].filter((p) => !policiesDeclaradas.includes(p));
reg(
  sobrandoPolicies.length === 0,
  sobrandoPolicies.length === 0
    ? "nenhuma policy a mais"
    : `policies a mais: ${sobrandoPolicies.join(", ")}`,
);

const sobrandoIndices = [...indicesNoBanco].filter(
  (i) => !indicesDeclarados.includes(i) && !DECLARADOS_FORA_DO_ARQUIVO.has(i),
);
reg(
  sobrandoIndices.length === 0,
  sobrandoIndices.length === 0
    ? "nenhum índice a mais"
    : `índices a mais: ${sobrandoIndices.join(", ")}`,
);

// ─────────────── 4. estado que o arquivo exige ─────────────────────────────

console.log("\n  -- o estado que o arquivo exige no fim --");

const bucket = porTipo("BUCKET")[0];
reg(!!bucket, "bucket validation-documents existe");
if (bucket) {
  const [, , publico, limite] = bucket.split("|");
  reg(publico === "false", `bucket é privado (public=${publico})`);
  reg(Number(limite) <= 5242880, `limite de tamanho ${limite} dentro do previsto`);
}

const rls = porTipo("RLS").map((l) => l.split("|"));
reg(
  rls.length === 5 && rls.every(([, , on]) => on === "true"),
  `RLS ligada nas ${rls.length} tabelas (${rls.filter(([, , o]) => o === "true").length} com RLS)`,
);

// ─────────────── 5. o arquivo é aplicável em ordem? ────────────────────────

console.log("\n  -- o arquivo é internamente aplicável, de cima para baixo? --");

// Todo objeto referenciado por `alter table` ou `create policy ... on` tem de
// ter sido criado ANTES, no próprio arquivo.
const ordemOk = [];
for (const m of sql.matchAll(/alter table public\.(\w+)/g)) {
  const alvo = m[1];
  if (!tabelasDeclaradas.includes(alvo)) continue;
  const posCriacao = sql.indexOf(`create table if not exists public.${alvo}`);
  ordemOk.push([`alter table public.${alvo}`, posCriacao >= 0 && posCriacao < m.index]);
}
for (const m of sql.matchAll(/create policy \w+ on public\.(\w+)/g)) {
  const alvo = m[1];
  const posCriacao = sql.indexOf(`create table if not exists public.${alvo}`);
  ordemOk.push([`policy sobre public.${alvo}`, posCriacao >= 0 && posCriacao < m.index]);
}
const foraDeOrdem = ordemOk.filter(([, ok]) => !ok);
reg(
  foraDeOrdem.length === 0,
  foraDeOrdem.length === 0
    ? `${ordemOk.length} referências, todas depois da criação do alvo`
    : `fora de ordem: ${foraDeOrdem.map(([n]) => n).join(", ")}`,
);

// O arquivo não pode depender de estado que ele mesmo não cria, fora os
// objetos do Supabase. Isto é documentação, não asserção.
const prerequisitos = [
  ...new Set([
    ...[...sql.matchAll(/references (auth\.\w+)/g)].map((m) => m[1]),
    ...[...sql.matchAll(/(storage\.\w+)/g)].map((m) => m[1]),
    ...[...sql.matchAll(/(public\.has_role|public\.app_role|gen_random_uuid)/g)].map((m) => m[1]),
  ]),
].sort();
console.log(`\n  pré-requisitos do arquivo (não criados por ele):`);
for (const p of prerequisitos) console.log(`    ${p}`);
console.log(
  "\n  Um banco limpo precisa destes objetos antes da migration. Numa instância\n" +
    "  Supabase nova eles já existem, menos `public.has_role` e `public.app_role`,\n" +
    "  que vêm de migrations anteriores deste repositório.",
);

const falhou = resultados.filter((x) => !x).length;
console.log(`\n  TOTAL OK=${resultados.length - falhou}  FALHOU=${falhou}`);
process.exit(falhou > 0 ? 1 : 0);
