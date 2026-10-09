/**
 * Ambiente de DEMONSTRAÇÃO do Datavalid — porta de entrada e única barreira
 * de destino.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE A URL É CONSTANTE E NÃO VEM DO AMBIENTE
 *
 * Um `DATAVALID_BASE_URL` configurável parece conveniente e é a falha. Basta
 * uma variável errada num deploy para que dado sintético vá para produção, ou
 * para que a resposta de um serviço qualquer seja lida como validação oficial.
 * O destino aqui é literal, verificado contra o OpenAPI do próprio SERPRO, e
 * trocá-lo exige editar este arquivo e encarar este comentário.
 *
 * O servidor de produção aparece abaixo por uma razão só: para ser recusado
 * por nome. Deixá-lo fora do arquivo faria a recusa depender de alguém não
 * digitá-lo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PROCEDÊNCIA DOS ENDEREÇOS
 *
 * Do OpenAPI 3.0.1 do ambiente de demonstração (`info.version`
 * 2609181441.4140937), lido em 09/10/2026 em
 * `apicenter.estaleiro.serpro.gov.br/documentacao/datavalid/openapi-demo/`.
 *
 * O caminho do template DIVERGE da documentação em prosa, e a divergência é
 * dupla. O webinar técnico escreve
 * `/v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/`; o artigo
 * "Registro do Template" escreve `POST /pessoa-fisica/privacidade/rfb/
 * template-de-tratamento/` — sem o `/v5` — e, na MESMA página, os dois GET
 * com `/v5`. O OpenAPI, que é o que o servidor atende, declara
 * `/v5/pessoa-fisica/privacidade/rfb/template-tratamento`: com `/v5` e
 * **sem o `de`**. É este que vale aqui.
 */

/** O único destino que este módulo conhece. Não vem de variável de ambiente. */
export const DEMONSTRACAO_BASE_URL =
  "https://gateway.apiserpro.serpro.gov.br/datavalid-demonstracao";

/**
 * O destino de produção, listado para ser RECUSADO.
 *
 * Nenhuma função deste módulo o usa como destino; `assertDestinoDeDemonstracao`
 * o rejeita por nome.
 */
export const PRODUCAO_BASE_URL = "https://gateway.apiserpro.serpro.gov.br/datavalid";

/** Caminhos, conforme o OpenAPI de demonstração. */
export const CAMINHOS = {
  /** Registro e listagem do template de tratamento RFB. */
  template: "/v5/pessoa-fisica/privacidade/rfb/template-tratamento",
  /** Validação de identidade. */
  validacao: "/v5/pessoa-fisica/validacao",
  /**
   * Simulador de GCC do próprio SERPRO. O resumo da operação no OpenAPI diz,
   * em maiúsculas: "APENAS EM DEMONSTRAÇÃO".
   */
  gccSimulada: "/v5/gcc/token",
} as const;

/** Teto de espera por resposta. Curto de propósito: quem chama é interativo. */
export const TIMEOUT_PADRAO_MS = 20_000;

export class AmbienteDeProducaoError extends Error {
  constructor(motivo: string) {
    super(
      `Adaptador de DEMONSTRAÇÃO do Datavalid recusou inicializar: ${motivo}. ` +
        `Este adaptador usa massa fictícia e token de GCC simulado; servir ` +
        `qualquer coisa disso em produção seria aprovar cadastro sem validação real.`,
    );
    this.name = "AmbienteDeProducaoError";
  }
}

export class DestinoNaoPermitidoError extends Error {
  constructor(url: string) {
    super(
      `Destino "${url}" não é o serviço oficial de demonstração. ` +
        `Este adaptador só fala com ${DEMONSTRACAO_BASE_URL}.`,
    );
    this.name = "DestinoNaoPermitidoError";
  }
}

/**
 * As variáveis de ambiente, sem supor que exista um `process` global.
 *
 * Alcançar `process.env` direto amarraria o módulo ao Node e, pior, ao
 * `@types/node` estar no programa — o que depende de QUAIS arquivos entram na
 * compilação. A homologação pegou isso: compilando só este módulo, `process`
 * não existia e nada compilava, embora o `tsc` do projeto inteiro passasse.
 *
 * Aqui a leitura é defensiva e tipada sem o Node. Ambiente ausente devolve
 * `{}`, e `{}` RECUSA — que é a resposta certa: num contexto sem `process`
 * (navegador, por exemplo) não há como provar que estamos em teste.
 */
function ambienteDoProcesso(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

/**
 * Onde estamos, na visão deste módulo.
 *
 * Lê o ambiente em vez de receber por parâmetro, de propósito: quem chama não
 * deve poder afirmar "estou em teste".
 */
export function ambienteAtual(env: Record<string, string | undefined> = ambienteDoProcesso()): {
  nome: string;
  permitido: boolean;
  motivo: string;
} {
  const node = (env.NODE_ENV ?? "").toLowerCase();
  const app = (env.APP_ENV ?? env.VITE_APP_ENV ?? "").toLowerCase();
  const vercel = (env.VERCEL_ENV ?? "").toLowerCase();

  // Qualquer sinal de produção basta para recusar. A recusa é a opção segura:
  // errar para o lado de não chamar não aprova ninguém indevidamente.
  const sinaisDeProducao = [
    node === "production" ? "NODE_ENV=production" : null,
    app === "production" || app === "producao" ? "APP_ENV=production" : null,
    vercel === "production" ? "VERCEL_ENV=production" : null,
  ].filter((s): s is string => s !== null);

  if (sinaisDeProducao.length > 0) {
    return { nome: "producao", permitido: false, motivo: sinaisDeProducao.join(", ") };
  }

  // Ausência de sinal também recusa. Um ambiente que não se declara não é
  // prova de que seja local — e presumir que é seria a mesma falha de antes,
  // noutro lugar.
  const declaradoLocalOuTeste =
    node === "development" || node === "test" || app === "local" || app === "test" || app === "teste";

  if (!declaradoLocalOuTeste) {
    return {
      nome: node || app || vercel || "(não declarado)",
      permitido: false,
      motivo:
        "o ambiente não se declara local nem de teste (esperado NODE_ENV=development|test " +
        "ou APP_ENV=local|test|teste)",
    };
  }

  return { nome: node || app, permitido: true, motivo: "" };
}

/** Lança se não estivermos em ambiente local ou de teste. */
export function assertAmbienteDeDemonstracao(
  env: Record<string, string | undefined> = ambienteDoProcesso(),
): void {
  const a = ambienteAtual(env);
  if (!a.permitido) throw new AmbienteDeProducaoError(a.motivo);
}

/**
 * Confere o destino montado, imediatamente antes da chamada.
 *
 * Segunda barreira: a primeira é a URL ser constante. Esta existe porque
 * concatenação de caminho é onde um `..` ou um caminho absoluto escapam.
 */
export function assertDestinoDeDemonstracao(url: string): void {
  if (!url.startsWith(DEMONSTRACAO_BASE_URL + "/")) throw new DestinoNaoPermitidoError(url);
  // `startsWith` sozinho não basta: o que vem depois ainda pode sair do lugar.
  const resto = url.slice(DEMONSTRACAO_BASE_URL.length);
  if (resto.includes("..") || resto.includes("//")) throw new DestinoNaoPermitidoError(url);
}

/** Monta a URL de um caminho conhecido, já conferida. */
export function urlDeDemonstracao(caminho: (typeof CAMINHOS)[keyof typeof CAMINHOS]): string {
  const url = DEMONSTRACAO_BASE_URL + caminho;
  assertDestinoDeDemonstracao(url);
  return url;
}
