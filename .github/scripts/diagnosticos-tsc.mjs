// Normaliza a saída do tsc numa lista comparável de DIAGNÓSTICOS.
//
// Chave = arquivo | código | mensagem. Linha e coluna ficam de fora de
// propósito: elas andam a cada edição e fariam a comparação acusar regressão
// onde não houve. O que não pode mudar é QUAL erro existe, e quantos.
//
// Saída: "<contagem>\t<arquivo>|<TScode>|<mensagem>", ordenada.
//
// FALHAS ENCONTRADAS NA INSPEÇÃO, corrigidas aqui:
//
//   1. DIAGNÓSTICO GLOBAL ignorado. Erros sem arquivo — `error TS18003: No
//      inputs were found`, `error TS5083: Cannot read file 'tsconfig.json'` —
//      não casavam com a expressão e sumiam. Um projeto que parasse de compilar
//      por tsconfig quebrado produzia lista VAZIA, ou seja, "tudo resolvido".
//      Agora entram com arquivo `(global)`.
//
//   2. FALHA DE EXECUÇÃO tratada como sucesso. `npx tsc` ausente (código 127),
//      estouro de memória ou crash geravam log sem diagnóstico, e o passo
//      seguinte lia isso como "zero erros". Agora o código de saída do tsc é
//      obrigatório e cruzado com o que foi extraído.
//
//   3. SAÍDA INESPERADA engolida. Qualquer linha que fale em "error" e não seja
//      reconhecida como diagnóstico agora interrompe: é sinal de formato que
//      este extrator não entende, e extrair pela metade é pior que falhar.
//
// Uso:
//   node diagnosticos-tsc.mjs <log> --codigo-tsc <n> [--saida <arquivo>]
import fs from "node:fs";

export const RE_ARQUIVO = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
export const RE_GLOBAL = /^error (TS\d+): (.*)$/;
export const RE_RESUMO = /^Found (\d+) errors?/;
export const ARQUIVO_GLOBAL = "(global)";

/** Extrai diagnósticos de um texto de log do tsc. Não decide nada sobre êxito. */
export function extrair(texto) {
  const mapa = new Map();
  const inesperadas = [];
  const ruido = [];
  let resumo = null;

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.replace(/\s+$/, "");
    if (linha.trim() === "") continue;

    const porArquivo = linha.match(RE_ARQUIVO);
    if (porArquivo) {
      const [, arquivo, , , codigo, mensagem] = porArquivo;
      somar(mapa, `${arquivo.replace(/\\/g, "/")}|${codigo}|${mensagem.trim()}`);
      continue;
    }

    const global = linha.match(RE_GLOBAL);
    if (global) {
      const [, codigo, mensagem] = global;
      somar(mapa, `${ARQUIVO_GLOBAL}|${codigo}|${mensagem.trim()}`);
      continue;
    }

    const res = linha.match(RE_RESUMO);
    if (res) { resumo = Number(res[1]); continue; }

    // Continuação de mensagem de várias linhas: o tsc indenta. Faz parte do
    // diagnóstico anterior, já contado.
    if (/^\s/.test(bruta)) continue;

    if (/\berrors?\b/i.test(linha)) inesperadas.push(linha);
    else ruido.push(linha);
  }

  const ocorrencias = [...mapa.values()].reduce((a, b) => a + b, 0);
  return { mapa, ocorrencias, resumo, inesperadas, ruido };
}

function somar(mapa, chave) {
  mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
}

/** Formata o mapa no texto versionável, ordenado e estável. */
export function formatar(mapa) {
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, n]) => `${n}\t${k}`)
    .join("\n") + (mapa.size ? "\n" : "");
}

/**
 * Decide se a extração pode ser usada como medição.
 * Devolve { ok, motivo } — nunca lança, para o chamador poder relatar.
 */
export function conferirExecucao({ codigoTsc, resultado }) {
  const { mapa, ocorrencias, resumo, inesperadas } = resultado;

  if (!Number.isInteger(codigoTsc)) {
    return { ok: false, motivo: "codigo de saida do tsc nao informado" };
  }
  // 0 = sem erros; 1 e 2 = erros de tipo/sintaxe. Qualquer outro valor é o
  // compilador NÃO tendo rodado: 127 (comando ausente), 134/137 (morto),
  // 3221225477 (falha de acesso no Windows).
  if (![0, 1, 2].includes(codigoTsc)) {
    return { ok: false, motivo: `tsc nao chegou a executar (codigo ${codigoTsc}). Nao e medicao de tipos.` };
  }
  if (inesperadas.length > 0) {
    return {
      ok: false,
      motivo: `saida inesperada do tsc, ${inesperadas.length} linha(s) nao reconhecida(s): ` +
        inesperadas.slice(0, 3).map((l) => JSON.stringify(l)).join(" ; "),
    };
  }
  if (codigoTsc === 0 && mapa.size > 0) {
    return { ok: false, motivo: `tsc saiu com 0 mas o log tem ${ocorrencias} diagnostico(s)` };
  }
  if (codigoTsc !== 0 && mapa.size === 0) {
    return { ok: false, motivo: `tsc saiu com ${codigoTsc} e nenhum diagnostico foi reconhecido no log` };
  }
  if (resumo !== null && resumo !== ocorrencias) {
    return { ok: false, motivo: `o tsc anunciou ${resumo} erro(s) e foram reconhecidos ${ocorrencias}` };
  }
  return { ok: true, motivo: "" };
}

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------
const esteArquivo = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(String(process.argv[1]).replace(/\\/g, "/"));

if (esteArquivo) {
  const argv = process.argv.slice(2);
  let entrada = null, saida = null, codigoTsc = NaN;
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === "--codigo-tsc") { codigoTsc = Number(argv[++k]); continue; }
    if (argv[k] === "--saida") { saida = argv[++k]; continue; }
    if (entrada === null) entrada = argv[k];
  }

  if (!entrada) {
    console.error("::error::uso: diagnosticos-tsc.mjs <log> --codigo-tsc <n> [--saida <arquivo>]");
    process.exit(3);
  }
  if (!fs.existsSync(entrada)) {
    console.error(`::error::log do tsc nao encontrado: ${entrada}. O passo anterior nao chegou a gravar nada.`);
    process.exit(3);
  }

  const resultado = extrair(fs.readFileSync(entrada, "utf8"));
  const veredito = conferirExecucao({ codigoTsc, resultado });

  if (!veredito.ok) {
    console.error(`::error::${veredito.motivo}`);
    console.error("--- primeiras linhas do log ---");
    console.error(fs.readFileSync(entrada, "utf8").split(/\r?\n/).slice(0, 20).join("\n"));
    process.exit(3);
  }

  const texto = formatar(resultado.mapa);
  if (saida) fs.writeFileSync(saida, texto);
  else process.stdout.write(texto);

  const globais = [...resultado.mapa.keys()].filter((k) => k.startsWith(`${ARQUIVO_GLOBAL}|`)).length;
  console.error(
    `${resultado.mapa.size} diagnostico(s) distinto(s), ${resultado.ocorrencias} ocorrencia(s)` +
    (globais ? `, ${globais} global(is)` : "") +
    (resultado.ruido.length ? `, ${resultado.ruido.length} linha(s) de ruido ignorada(s)` : "")
  );
}
