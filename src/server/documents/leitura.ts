/**
 * Leitura de documento: cabeçalhos e classificação de falha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO HÁ URL ASSINADA AQUI
 *
 * A medição de `url-assinada-como-credencial.mjs` fechou a questão: uma URL
 * assinada continua servindo o documento depois de o consentimento ser
 * retirado e depois de o registro ser apagado. Ela é credencial, não consulta
 * autorizada, e não existe revogação por URL — o token não tem `jti`.
 *
 * Então os bytes passam pela aplicação. Custa um salto a mais por byte, e é o
 * preço de a autorização ser revalidada A CADA LEITURA em vez de uma vez, na
 * emissão.
 *
 * Pelo mesmo motivo não há redirecionamento: redirecionar para o Storage seria
 * entregar a credencial pela porta dos fundos.
 */

export const CABECALHOS_DE_LEITURA = Object.freeze({
  /**
   * `no-store` e não `no-cache`: `no-cache` autoriza guardar e revalidar, o
   * que deixa o documento no disco de quem leu. `no-store` diz para não
   * guardar em lugar nenhum.
   */
  "Cache-Control": "no-store, no-transform",
  /** Proxies antigos só entendem este. */
  Pragma: "no-cache",
  /** O navegador não adivinha o tipo: o tipo é o que o registro declarou. */
  "X-Content-Type-Options": "nosniff",
  /** Nada do endereço vaza para o próximo salto. */
  "Referrer-Policy": "no-referrer",
  /** O documento não é moldura de página alguma. */
  "Content-Disposition": "inline",
});

export type MotivoDeFalhaDeLeitura =
  | "SESSAO_EXPIRADA"
  | "SEM_PERMISSAO"
  | "CONSENTIMENTO_NAO_VIGENTE"
  | "DOCUMENTO_INEXISTENTE"
  | "ARQUIVO_AUSENTE"
  | "SERVICO_INDISPONIVEL";

/**
 * SQLSTATE das funções de leitura e revisão → motivo que a tela entende.
 *
 * Cada um é um estado diferente para quem está do outro lado, e colapsá-los
 * num "erro" genérico faria o titular tentar de novo quando o que ele precisa
 * é aceitar o termo outra vez — ou avisar o suporte.
 */
export function classificarFalhaDeLeitura(
  codigo: string | null | undefined,
): MotivoDeFalhaDeLeitura {
  switch (codigo) {
    case "DV020":
      return "SESSAO_EXPIRADA";
    case "DV021":
      return "DOCUMENTO_INEXISTENTE";
    case "DV022":
      return "SEM_PERMISSAO";
    case "DV023":
      return "CONSENTIMENTO_NAO_VIGENTE";
    default:
      // Sem código não se sabe: pode ser rede, pode ser indisponibilidade. O
      // que NÃO se pode é afirmar que o documento não existe ou que a pessoa
      // não tem permissão — as duas afirmações teriam consequência.
      return "SERVICO_INDISPONIVEL";
  }
}

/** O que a revisão pode registrar. Não há "aprovado", e a ausência é a decisão. */
export const TIPOS_DE_REVISAO = ["observacao", "divergencia", "novo_envio_solicitado"] as const;

export type TipoDeRevisao = (typeof TIPOS_DE_REVISAO)[number];

/**
 * Contexto da revisão.
 *
 * Enquanto o adaptador real não existir, toda revisão é sobre demonstração — e
 * registrar isso agora é o que impede que, no dia em que a real existir, o
 * histórico pareça todo real.
 */
export const CONTEXTOS_DE_REVISAO = ["demonstracao", "real"] as const;

export type ContextoDeRevisao = (typeof CONTEXTOS_DE_REVISAO)[number];

export class NotaDeRevisaoInvalidaError extends Error {}

const PROIBIDOS_NA_NOTA: Array<{ nome: string; re: RegExp }> = [
  { nome: "URL", re: /\bhttps?:\/\//i },
  { nome: "credencial em URL", re: /[?&](token|signature|sig)=/i },
  { nome: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\./ },
  { nome: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
];

export const TAMANHO_MAXIMO_DA_NOTA = 1000;

/**
 * A nota é texto livre de um revisor, e é por isso que ela precisa de guarda.
 *
 * Campo livre numa tabela de documentos é onde dado pessoal entra sem ninguém
 * decidir. A barreira recusa montar, como a da trilha — em vez de confiar que
 * quem escreve vai lembrar.
 */
export function conferirNotaDeRevisao(nota: string | null | undefined): string | null {
  if (nota == null) return null;
  const limpa = nota.trim();
  if (limpa === "") return null;
  if (limpa.length > TAMANHO_MAXIMO_DA_NOTA) {
    throw new NotaDeRevisaoInvalidaError(
      `nota com ${limpa.length} caracteres; o teto e ${TAMANHO_MAXIMO_DA_NOTA}`,
    );
  }
  for (const { nome, re } of PROIBIDOS_NA_NOTA) {
    if (re.test(limpa)) {
      throw new NotaDeRevisaoInvalidaError(`a nota contem ${nome}`);
    }
  }
  return limpa;
}

/**
 * Aplica os cabeçalhos por meio de quem sabe escrevê-los.
 *
 * A função de framework tipa os nomes de cabeçalho num mapa fechado, e a
 * conversão para esse mapa fica aqui, num lugar só, em vez de aparecer em
 * cada `setResponseHeader` espalhado pelas quatro server functions.
 */
export function aplicarCabecalhosDeLeitura(
  escrever: (nome: string, valor: string) => void,
): void {
  for (const [nome, valor] of Object.entries(CABECALHOS_DE_LEITURA)) escrever(nome, valor);
}
