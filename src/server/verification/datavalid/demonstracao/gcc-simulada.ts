/**
 * Autorização SIMULADA de GCC, para o ambiente de demonstração.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ELA NÃO É UMA GCC, E O TIPO IMPEDE QUE SEJA CONFUNDIDA COM UMA
 *
 * `GccAuthorizationToken`, em `../privacy.ts`, representa autorização de uma
 * GCC credenciada pela SENATRAN. A que vive aqui é outra coisa: vem do
 * simulador do próprio SERPRO (`POST /v5/gcc/token`, cujo resumo no OpenAPI
 * diz, em maiúsculas, "APENAS EM DEMONSTRAÇÃO").
 *
 * Os dois tipos são DISTINTOS de propósito, e não por disciplina de quem
 * escreve: `AutorizacaoSimulada` carrega `readonly simulada: true`, que
 * `GccAuthorizationToken` não tem e não pode receber. Passar uma onde a outra
 * é esperada não compila. Foi essa a escolha em vez de reaproveitar o mesmo
 * tipo com uma bandeira opcional — bandeira opcional se esquece, tipo
 * incompatível não.
 *
 * Nada aqui enfraquece a barreira do módulo de providers. `demonstracao` NÃO
 * entra em `MODOS_INTEGRACAO_REAL`: `sandbox` e `production` continuam
 * recusando provider simulado, e continuam recusando inicializar enquanto a
 * GCC real for um fake. Este arquivo acrescenta um caminho separado, não
 * afrouxa o existente.
 */

import { CAMINHOS, assertAmbienteDeDemonstracao, urlDeDemonstracao } from "./ambiente";

/**
 * Autorização obtida do simulador. Incompatível com a autorização real.
 *
 * O campo `simulada` é literal `true`: não existe como construir uma destas
 * dizendo que não é simulada.
 */
export interface AutorizacaoSimulada {
  readonly simulada: true;
  /** O token em si. NUNCA sai deste objeto para log, trilha ou mensagem. */
  readonly token: string;
  /** A operação à qual este token está vinculado — a NOSSA. */
  readonly operationId: string;
  /** CPF fictício da massa oficial ao qual o token foi emitido. */
  readonly cpfFicticio: string;
  readonly cnpjAnuente: string | null;
  /** De onde veio, para o relatório não ter de adivinhar. */
  readonly origem: "simulador-serpro-demonstracao";
}

/** O envelope `privacidade`, na variante de demonstração. */
export interface EnvelopeDeDemonstracao {
  rfb: { id_template: string };
  senatran: { token: string; cnpj_anuente?: string | null };
  /** Marca nossa, não da API: o relatório sabe que isto é demonstração. */
  readonly __demonstracao: true;
}

export class TokenSimuladoDeOutraOperacaoError extends Error {
  constructor(esperada: string, recebida: string) {
    super(
      `Token simulado pertence à operação "${recebida}" e foi oferecido à ` +
        `"${esperada}". A regra de uma autorização por operação vale também na ` +
        `demonstração: relaxá-la aqui treinaria a esteira a reutilizar token.`,
    );
    this.name = "TokenSimuladoDeOutraOperacaoError";
  }
}

export class SimuladorIndisponivelError extends Error {
  readonly httpStatus: number | null;
  constructor(httpStatus: number | null, detalhe: string) {
    super(
      `Simulador de GCC do ambiente de demonstração não emitiu token ` +
        `(HTTP ${httpStatus ?? "sem resposta"}): ${detalhe}`,
    );
    this.name = "SimuladorIndisponivelError";
    this.httpStatus = httpStatus;
  }
}

/**
 * Pede um token ao simulador oficial.
 *
 * `parametros` são os metadados que o token vai carregar — os mesmos nomes de
 * campo que a validação vai comparar. Nenhum valor pessoal entra: são nomes de
 * campo, não conteúdo.
 */
export async function obterAutorizacaoSimulada(opcoes: {
  bearer: string;
  cpfFicticio: string;
  operationId: string;
  /** Nomes de campo que o consentimento simulado abrange. */
  parametros: readonly string[];
  cnpjAnuente?: string | null;
  timeoutMs: number;
  /**
   * Tentativas de OBTER O TOKEN, não de validar.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * POR QUE AQUI SE PODE REPETIR, E NA VALIDAÇÃO NÃO
   *
   * O risco que `decidirRetry` protege, em `../privacy.ts`, é o SERPRO
   * processar duas vezes a mesma validação. Emitir token não é validação:
   * nada foi submetido à base, nada é cobrado por validação, e um token
   * emitido e não usado simplesmente expira. Repetir aqui não duplica nada.
   *
   * Só vale para 5xx e falha de rede. Recusa 4xx é definitiva e não repete —
   * a mesma requisição receberia a mesma recusa. A primeira versão desta
   * função não distinguia os dois casos: um 502 transitório do gateway
   * derrubava a homologação como se fosse recusa, e foi assim que isto
   * apareceu.
   */
  tentativas?: number;
  fetchImpl?: typeof fetch;
}): Promise<AutorizacaoSimulada> {
  assertAmbienteDeDemonstracao();

  const maximo = Math.max(1, opcoes.tentativas ?? 1);
  let ultimo: SimuladorIndisponivelError | null = null;

  for (let n = 1; n <= maximo; n += 1) {
    try {
      return await umaTentativa(opcoes);
    } catch (e) {
      if (!(e instanceof SimuladorIndisponivelError)) throw e;
      const transitorio = e.httpStatus === null || e.httpStatus >= 500;
      if (!transitorio) throw e;
      ultimo = e;
    }
  }
  throw ultimo ?? new SimuladorIndisponivelError(null, "nenhuma tentativa executada");
}

async function umaTentativa(opcoes: {
  bearer: string;
  cpfFicticio: string;
  operationId: string;
  parametros: readonly string[];
  cnpjAnuente?: string | null;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<AutorizacaoSimulada> {
  const url = urlDeDemonstracao(CAMINHOS.gccSimulada);
  const f = opcoes.fetchImpl ?? fetch;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.timeoutMs);

  let resposta: Response;
  try {
    resposta = await f(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + opcoes.bearer,
        "Content-Type": "application/json",
        // `text/plain`, não `application/json`: o OpenAPI declara a resposta
        // 201 deste endpoint como `text/plain` com o token em texto puro.
        // Pedir JSON aqui devolve 406 Not Acceptable — foi o que a primeira
        // execução ponta a ponta recebeu.
        Accept: "text/plain",
      },
      body: JSON.stringify({
        cpf: opcoes.cpfFicticio,
        anuente: opcoes.cnpjAnuente ?? undefined,
        parametros: opcoes.parametros,
      }),
      signal: controle.signal,
    });
  } catch (e) {
    throw new SimuladorIndisponivelError(null, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(relogio);
  }

  if (!resposta.ok) {
    throw new SimuladorIndisponivelError(resposta.status, resposta.statusText || "sem detalhe");
  }

  // A resposta é o TOKEN EM TEXTO PURO, conforme o OpenAPI. A tolerância a
  // JSON abaixo existe porque o contrato pode mudar sem aviso, e cair com
  // "sem campo reconhecível" é melhor que cair com erro de parse.
  const texto = (await resposta.text()).trim();
  let token: string | null = texto.length > 0 ? texto : null;
  if (token && (token.startsWith("{") || token.startsWith('"'))) {
    try {
      const j = JSON.parse(token) as unknown;
      if (typeof j === "string") token = j;
      else if (j && typeof j === "object") {
        const o = j as Record<string, unknown>;
        token =
          typeof o.token === "string" ? o.token : typeof o.hash === "string" ? o.hash : null;
      }
    } catch {
      /* não era JSON; segue como texto puro */
    }
  }
  if (!token) {
    throw new SimuladorIndisponivelError(
      resposta.status,
      "resposta sem token reconhecível (esperado texto puro, conforme o OpenAPI)",
    );
  }

  return {
    simulada: true,
    token,
    operationId: opcoes.operationId,
    cpfFicticio: opcoes.cpfFicticio,
    cnpjAnuente: opcoes.cnpjAnuente ?? null,
    origem: "simulador-serpro-demonstracao",
  };
}

/**
 * Monta o envelope `privacidade` da demonstração.
 *
 * Função SEPARADA de `montarPrivacidade`, em `../privacy.ts`, e não uma
 * sobrecarga dela: a real recebe `GccAuthorizationToken` e continua intocada.
 * Quem tenta passar uma `AutorizacaoSimulada` para lá não compila, que é
 * exatamente o efeito pretendido.
 */
export function montarPrivacidadeDeDemonstracao(
  idTemplate: string,
  autorizacao: AutorizacaoSimulada,
  operationId: string,
): EnvelopeDeDemonstracao {
  if (autorizacao.operationId !== operationId) {
    throw new TokenSimuladoDeOutraOperacaoError(operationId, autorizacao.operationId);
  }
  return {
    rfb: { id_template: idTemplate },
    senatran: { token: autorizacao.token, cnpj_anuente: autorizacao.cnpjAnuente },
    __demonstracao: true,
  };
}

/** Retira a marca interna antes de serializar: ela é nossa, não da API. */
export function envelopeParaCorpo(e: EnvelopeDeDemonstracao): {
  rfb: { id_template: string };
  senatran: { token: string; cnpj_anuente?: string | null };
} {
  return { rfb: e.rfb, senatran: e.senatran };
}
