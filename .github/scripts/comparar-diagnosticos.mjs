// Compara dois MAPAS de diagnóstico → quantidade.
//
// FALHA ENCONTRADA NA INSPEÇÃO, corrigida aqui. A versão anterior comparava os
// dois arquivos com `diff -u` e reprovava sempre que houvesse qualquer linha
// começando por `+`. Só que uma REDUÇÃO de ocorrências produz exatamente isso:
//
//     -5\tsrc/a.ts|TS2345|...        (linha de base)
//     +3\tsrc/a.ts|TS2345|...        (atual, três em vez de cinco)
//
// Resultado: corrigir dois erros REPROVAVA a verificação. O incentivo ficava
// invertido — mexer no código só para manter a contagem.
//
// A regra correta é por chave, não por texto:
//
//   diagnóstico novo        -> REPROVA
//   mesma chave, mais       -> REPROVA
//   mesma chave, menos      -> aprova, e pede atualização da linha de base
//   chave que sumiu         -> aprova, idem
//   idêntico                -> aprova
//
// Uso: node comparar-diagnosticos.mjs <linha-de-base> <atual>
import fs from "node:fs";

/** Lê o formato "<contagem>\t<chave>" num Map. Formato inválido lança. */
export function ler(texto, origem = "arquivo") {
  const mapa = new Map();
  texto.split(/\r?\n/).forEach((linha, i) => {
    if (linha.trim() === "") return;
    const m = linha.match(/^(\d+)\t(.+)$/);
    if (!m) throw new Error(`${origem}, linha ${i + 1}: formato invalido: ${JSON.stringify(linha)}`);
    const [, n, chave] = m;
    if (mapa.has(chave)) throw new Error(`${origem}, linha ${i + 1}: chave repetida: ${chave}`);
    mapa.set(chave, Number(n));
  });
  return mapa;
}

/** Compara base x atual e devolve o veredito, sem imprimir nada. */
export function comparar(base, atual) {
  const novos = [];      // chave inexistente na base
  const aumentos = [];   // mesma chave, mais ocorrências
  const reducoes = [];   // mesma chave, menos ocorrências
  const sumidos = [];    // chave que deixou de existir

  for (const [chave, n] of atual) {
    if (!base.has(chave)) { novos.push({ chave, n }); continue; }
    const b = base.get(chave);
    if (n > b) aumentos.push({ chave, de: b, para: n });
    else if (n < b) reducoes.push({ chave, de: b, para: n });
  }
  for (const [chave, n] of base) {
    if (!atual.has(chave)) sumidos.push({ chave, n });
  }

  const regrediu = novos.length > 0 || aumentos.length > 0;
  const melhorou = reducoes.length > 0 || sumidos.length > 0;
  return { novos, aumentos, reducoes, sumidos, regrediu, melhorou };
}

export function relatar(v) {
  const l = [];
  const soma = (a) => a.reduce((s, x) => s + (x.n ?? x.para - x.de), 0);
  if (v.novos.length) {
    l.push(`DIAGNOSTICOS NOVOS (${v.novos.length}):`);
    for (const x of v.novos) l.push(`  + ${x.n}x  ${x.chave}`);
  }
  if (v.aumentos.length) {
    l.push(`DIAGNOSTICOS MAIS FREQUENTES (${v.aumentos.length}):`);
    for (const x of v.aumentos) l.push(`  ^ ${x.de} -> ${x.para}  ${x.chave}`);
  }
  if (v.reducoes.length) {
    l.push(`diagnosticos menos frequentes (${v.reducoes.length}):`);
    for (const x of v.reducoes) l.push(`  v ${x.de} -> ${x.para}  ${x.chave}`);
  }
  if (v.sumidos.length) {
    l.push(`diagnosticos resolvidos (${v.sumidos.length}):`);
    for (const x of v.sumidos) l.push(`  - ${x.n}x  ${x.chave}`);
  }
  if (!l.length) l.push("conjunto de diagnosticos IDENTICO a linha de base");
  void soma;
  return l.join("\n") + "\n";
}

const esteArquivo = import.meta.url.endsWith(String(process.argv[1] ?? "").replace(/\\/g, "/"));

if (esteArquivo) {
  const [arqBase, arqAtual] = process.argv.slice(2);
  if (!arqBase || !arqAtual) {
    console.error("::error::uso: comparar-diagnosticos.mjs <linha-de-base> <atual>");
    process.exit(3);
  }
  for (const f of [arqBase, arqAtual]) {
    if (!fs.existsSync(f)) {
      console.error(`::error::arquivo ausente: ${f}`);
      process.exit(3);
    }
  }

  let base, atual;
  try {
    base = ler(fs.readFileSync(arqBase, "utf8"), arqBase);
    atual = ler(fs.readFileSync(arqAtual, "utf8"), arqAtual);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(3);
  }

  const v = comparar(base, atual);
  process.stdout.write(relatar(v));

  if (v.regrediu) {
    const n = v.novos.length + v.aumentos.length;
    console.error(`::error::${n} diagnostico(s) de tipo novo(s) ou mais frequente(s) que a linha de base. Veja tsc-comparacao.txt no artefato.`);
    process.exit(1);
  }
  if (v.melhorou) {
    const n = v.reducoes.length + v.sumidos.length;
    console.log(`::notice::${n} diagnostico(s) resolvido(s) ou menos frequente(s), e nenhum novo. Atualize .github/tsc-baseline.txt neste PR.`);
  }
  process.exit(0);
}
