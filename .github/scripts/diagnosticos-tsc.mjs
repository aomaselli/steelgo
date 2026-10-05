// Normaliza a saída do tsc numa lista comparável de DIAGNÓSTICOS.
//
// Chave = arquivo | código | mensagem. Linha e coluna ficam de fora de
// propósito: elas andam a cada edição e fariam a comparação acusar regressão
// onde não houve. O que não pode mudar é QUAL erro existe, e quantos.
//
// Saída: "<contagem>\t<arquivo>|<TScode>|<mensagem>", ordenada.
import fs from "node:fs";

const entrada = process.argv[2];
const texto = fs.readFileSync(entrada, "utf8");

const mapa = new Map();
for (const linha of texto.split(/\r?\n/)) {
  const m = linha.match(/^(.+?)\((\d+),(\d+)\): (error TS\d+): (.*)$/);
  if (!m) continue;
  const [, arquivo, , , codigo, mensagem] = m;
  // Barra normal em qualquer sistema, para o arquivo bater entre Windows e CI.
  const chave = `${arquivo.replace(/\\/g, "/")}|${codigo.replace("error ", "")}|${mensagem.trim()}`;
  mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
}

const linhas = [...mapa.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([k, n]) => `${n}\t${k}`);

process.stdout.write(linhas.join("\n") + "\n");
process.stderr.write(`${linhas.length} diagnóstico(s) distinto(s), ${[...mapa.values()].reduce((a, b) => a + b, 0)} ocorrência(s)\n`);
