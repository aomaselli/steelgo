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
  /**
   * A requisição pode ter saído?
   *
   * É a informação que o status HTTP sozinho não dá, e a única que separa
   * "provado que nada foi emitido" de "não sabemos". Na dúvida, `true`.
   */
  readonly possivelmenteEnviado: boolean;
  constructor(httpStatus: number | null, detalhe: string, possivelmenteEnviado = true) {
    super(
      `Simulador de GCC do ambiente de demonstração não devolveu token ` +
        `(HTTP ${httpStatus ?? "sem resposta"}): ${detalhe}`,
    );
    this.name = "SimuladorIndisponivelError";
    this.httpStatus = httpStatus;
    this.possivelmenteEnviado = possivelmenteEnviado;
  }
}

/**
 * Resultado de pedir um token.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EMITIR TOKEN É UMA OPERAÇÃO COM EFEITOS, E REPETIR NÃO É DE GRAÇA
 *
 * Uma versão anterior desta função repetia em 5xx com a justificativa de que
 * "emitir token não é validar: nada é submetido à base, nada é cobrado, e
 * token não usado simplesmente expira". Era o MESMO erro que `privacy.ts`
 * existe para não cometer — afirmar ausência de efeito sem ter onde apoiar a
 * afirmação.
 *
 * O que de fato se sabe: a GCC registra a emissão, a Portaria 139/2025 trata
 * o token como registro de consentimento e ciência, e o titular acompanha as
 * consultas no Portal de Privacidade. Um 502 depois de a requisição sair pode
 * significar que o token FOI emitido e a resposta se perdeu. Nenhuma
 * documentação diz o contrário, e é só isso que basta para não afirmar nada.
 *
 * Então: repetir continua permitido, porque sem token não há validação — mas
 * com limite rígido, e registrando que pode haver emissão órfã. O que some é
 * a afirmação de que não há efeito.
 */
export type ResultadoDaEmissao =
  | {
      situacao: "emitido";
      autorizacao: AutorizacaoSimulada;
      tentativas: number;
      /**
       * Tentativas anteriores cujo desfecho é desconhecido — cada uma pode ter
       * emitido um token que ninguém usou. Zero é o caso comum; acima de zero
       * é informação para conciliação, não ruído.
       */
      emissoesPossivelmenteOrfas: number;
    }
  | {
      situacao: "recusado";
      httpStatus: number;
      tentativas: number;
      detalhe: string;
      /**
       * Sempre `false`. Recusa explícita diz que NÃO RECEBEMOS token; não diz
       * que nenhum foi emitido, nem que nada foi registrado do outro lado. A
       * documentação do simulador não afirma isso em nenhum status.
       */
      readonly garanteAusenciaDeEmissao: false;
      emissoesPossivelmenteOrfas: number;
    }
  | {
      situacao: "desfecho_desconhecido";
      httpStatus: number | null;
      tentativas: number;
      detalhe: string;
      readonly garanteAusenciaDeEmissao: false;
      emissoesPossivelmenteOrfas: number;
      /** Esgotou o limite. Repetir de novo é decisão de quem chama, não daqui. */
      readonly limiteDeTentativasAtingido: true;
    };

/** Teto rígido. Não há como pedir mais do que isto. */
export const TENTATIVAS_MAXIMAS_DE_EMISSAO = 3;

/**
 * Pede um token ao simulador oficial.
 *
 * `parametros` são os metadados que o token vai carregar — os mesmos nomes de
 * campo que a validação vai comparar. Nenhum valor pessoal entra: são nomes de
 * campo, não conteúdo.
 *
 * Não lança nos desfechos previstos: devolve-os. Quem chama precisa VER o
 * desfecho desconhecido para registrá-lo, e exceção convida a engolir.
 */
export async function pedirAutorizacaoSimulada(opcoes: {
  bearer: string;
  cpfFicticio: string;
  operationId: string;
  /** Nomes de campo que o consentimento simulado abrange. */
  parametros: readonly string[];
  cnpjAnuente?: string | null;
  timeoutMs: number;
  /** Teto de tentativas, limitado a `TENTATIVAS_MAXIMAS_DE_EMISSAO`. */
  tentativas?: number;
  fetchImpl?: typeof fetch;
}): Promise<ResultadoDaEmissao> {
  assertAmbienteDeDemonstracao();

  const maximo = Math.min(
    TENTATIVAS_MAXIMAS_DE_EMISSAO,
    Math.max(1, opcoes.tentativas ?? 1),
  );

  let tentativas = 0;
  let orfas = 0;
  let ultimo: SimuladorIndisponivelError | null = null;

  while (tentativas < maximo) {
    tentativas += 1;
    try {
      const autorizacao = await umaTentativa(opcoes);
      return { situacao: "emitido", autorizacao, tentativas, emissoesPossivelmenteOrfas: orfas };
    } catch (e) {
      if (!(e instanceof SimuladorIndisponivelError)) throw e;
      ultimo = e;

      // Mesma classificação por FASE de `privacy.ts`, e pela mesma razão.
      if (!e.possivelmenteEnviado) {
        // Provado que nada saiu: aqui sim dá para afirmar que não houve
        // emissão, e repetir é inofensivo.
        continue;
      }

      // A requisição saiu. Pode ter emitido token e perdido a resposta.
      orfas += 1;

      if (e.httpStatus !== null && e.httpStatus >= 400 && e.httpStatus < 500) {
        // Recusa explícita: a mesma requisição receberia a mesma recusa.
        return {
          situacao: "recusado",
          httpStatus: e.httpStatus,
          tentativas,
          detalhe: e.message,
          garanteAusenciaDeEmissao: false,
          emissoesPossivelmenteOrfas: orfas,
        };
      }
      // 5xx ou sem resposta: repete, dentro do teto.
    }
  }

  return {
    situacao: "desfecho_desconhecido",
    httpStatus: ultimo?.httpStatus ?? null,
    tentativas,
    detalhe: ultimo?.message ?? "nenhuma tentativa executada",
    garanteAusenciaDeEmissao: false,
    emissoesPossivelmenteOrfas: orfas,
    limiteDeTentativasAtingido: true,
  };
}

/**
 * Atalho que lança quando não se obtém token.
 *
 * Existe para quem só quer o caminho feliz. O desfecho desconhecido vira
 * exceção, e com ele a contagem de emissões possivelmente órfãs — por isso
 * `pedirAutorizacaoSimulada` é a função a usar quando o desfecho importa.
 */
export async function obterAutorizacaoSimulada(opcoes: {
  bearer: string;
  cpfFicticio: string;
  operationId: string;
  parametros: readonly string[];
  cnpjAnuente?: string | null;
  timeoutMs: number;
  tentativas?: number;
  fetchImpl?: typeof fetch;
}): Promise<AutorizacaoSimulada> {
  const r = await pedirAutorizacaoSimulada(opcoes);
  if (r.situacao === "emitido") return r.autorizacao;
  throw new SimuladorIndisponivelError(
    r.httpStatus,
    `${r.detalhe} (tentativas: ${r.tentativas}; emissões possivelmente órfãs: ` +
      `${r.emissoesPossivelmenteOrfas}; nada aqui afirma ausência de emissão)`,
    r.emissoesPossivelmenteOrfas > 0,
  );
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

  // Vira `true` no instante em que o `fetch` começa: dali em diante não se
  // pode mais afirmar que nada saiu. Só o corpo serializado antes dele é
  // seguramente anterior ao envio.
  let possivelmenteEnviado = false;

  let resposta: Response;
  try {
    const corpo = JSON.stringify({
      cpf: opcoes.cpfFicticio,
      anuente: opcoes.cnpjAnuente ?? undefined,
      parametros: opcoes.parametros,
    });
    possivelmenteEnviado = true;
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
      body: corpo,
      signal: controle.signal,
    });
  } catch (e) {
    throw new SimuladorIndisponivelError(
      null,
      e instanceof Error ? e.message : String(e),
      possivelmenteEnviado,
    );
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
