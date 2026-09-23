// Nome exibivel em saudacoes e cabecalhos. O cadastro aceita o nome como a
// pessoa digitou ("malika", "MARIA DA SILVA"); a interface nao deve repetir
// isso literalmente. Aqui normalizamos apenas a apresentacao: o dado original
// permanece intacto no banco.

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "del", "la", "van", "von"]);

function capitalizarPalavra(palavra: string): string {
  if (!palavra) return palavra;
  const minuscula = palavra.toLocaleLowerCase("pt-BR");
  // hifens e apostrofos preservam a capitalizacao interna (Ana-Maria, D'Avila)
  return minuscula
    .split(/([-'’])/)
    .map((parte, i) =>
      i % 2 === 1 || !parte ? parte : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1),
    )
    .join("");
}

/** Nome completo apresentavel: "MARIA DA SILVA" -> "Maria da Silva". */
export function displayFullName(fullName?: string | null): string {
  const limpo = (fullName ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  return limpo
    .split(" ")
    .map((palavra, i) => {
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      if (i > 0 && PARTICULAS.has(minuscula)) return minuscula;
      return capitalizarPalavra(palavra);
    })
    .join(" ");
}

/**
 * Primeiro nome para saudacao. Sem nome utilizavel devolve o fallback recebido
 * (a interface decide o texto neutro, traduzido).
 */
export function displayFirstName(fullName?: string | null, fallback = ""): string {
  const completo = displayFullName(fullName);
  if (!completo) return fallback;
  const primeiro = completo.split(" ")[0];
  return primeiro || fallback;
}
