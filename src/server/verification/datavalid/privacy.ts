/**
 * Objeto `privacidade` do Datavalid V5 — dois identificadores, duas origens,
 * dois ciclos de vida.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TRÊS CREDENCIAIS, TRÊS REGRAS DIFERENTES
 *
 * | credencial    | escopo                    | reutilizável                 |
 * |---------------|---------------------------|------------------------------|
 * | Bearer OAuth2 | 1 hora                    | sim, até o gateway dar 401   |
 * | id_template   | finalidade + base legal   | sim, em todas as chamadas    |
 * | token GCC     | UMA operação              | NÃO entre validações distintas |
 *
 * Fontes:
 *   Bearer      Guias rápidos, Passo 3: "Esse token possui uma (1) hora de
 *               validade e, sempre que expirado, repita este passo"
 *   Template    Webinar, "Registro do Template RFB": "processo único por
 *               finalidade [...] reutilizar o mesmo ID em todas as chamadas"
 *   Token GCC   Webinar, "Fluxo da GCC": "Cada token emitido pela GCC é
 *               vinculado a uma operação específica. Não é possível reutilizar
 *               tokens entre validações distintas"
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE A DOCUMENTAÇÃO NÃO DIZ — e como tratamos
 *
 * Ela proíbe reutilizar o token "entre validações distintas". NÃO diz se um
 * RETRY da mesma validação, após desfecho desconhecido, pode reenviar o mesmo
 * token.
 *
 * Diante do silêncio, este módulo falha fechado: retry obtém token NOVO. O
 * contrário seria presumir uma permissão que ninguém deu, e o token é o
 * registro formal de consentimento do titular — reusá-lo indevidamente
 * corromperia a rastreabilidade individual que a própria GCC existe para
 * garantir.
 *
 * A idempotência fica ancorada no NOSSO identificador de operação, nunca no
 * token. É o que permite repetir com segurança sem depender de o token ser
 * reutilizável.
 */

/** Identificador do template de tratamento RFB. Reutilizável por finalidade. */
export interface RfbTemplateRef {
  idTemplate: string;
  /** Finalidade e base legal que o template declara. Troca de finalidade exige template novo. */
  finalidade: string;
}

/** HASH/token da GCC. Vinculado a UMA operação. */
export interface GccAuthorizationToken {
  /** O token em si. Nunca sai deste objeto para log nem para a trilha. */
  readonly token: string;
  /** Operação à qual o token está vinculado — a NOSSA, não a da GCC. */
  readonly operationId: string;
  cnpjAnuente?: string | null;
}

/** O objeto `privacidade` como vai no corpo da requisição. */
export interface PrivacyEnvelope {
  rfb: { id_template: string };
  senatran: { token: string; cnpj_anuente?: string | null };
}

export class TokenDeOutraOperacaoError extends Error {
  constructor(esperada: string, recebida: string) {
    super(
      `Token da GCC pertence à operação "${recebida}" e foi oferecido à "${esperada}". ` +
        `Cada token é vinculado a uma operação específica; reutilizar quebra a ` +
        `rastreabilidade individual do consentimento.`,
    );
    this.name = "TokenDeOutraOperacaoError";
  }
}

/**
 * Monta o objeto `privacidade`, exigindo que o token pertença a ESTA operação.
 *
 * O campo chama-se `senatran.token` mas carrega o HASH/token da GCC — a
 * nomenclatura é da API, não nossa, e por isso está isolada aqui.
 */
export function montarPrivacidade(
  template: RfbTemplateRef,
  autorizacao: GccAuthorizationToken,
  operationId: string,
): PrivacyEnvelope {
  if (autorizacao.operationId !== operationId) {
    throw new TokenDeOutraOperacaoError(operationId, autorizacao.operationId);
  }
  return {
    rfb: { id_template: template.idTemplate },
    senatran: { token: autorizacao.token, cnpj_anuente: autorizacao.cnpjAnuente ?? null },
  };
}

// ─────────────────────────────── retry ─────────────────────────────────────

/**
 * Em que FASE a tentativa parou. É isto que decide se repetir é seguro — não
 * o código HTTP isolado.
 *
 *   nao_enviado          provado que a requisição não chegou a sair. Nada foi
 *                        processado do outro lado.
 *   recusa_explicita     o gateway respondeu uma recusa definitiva, antes do
 *                        processamento. Há resposta; não há dúvida.
 *   desfecho_desconhecido  timeout, conexão interrompida, ou erro de servidor
 *                        depois de a requisição possivelmente ter sido
 *                        entregue. NÃO SABEMOS se foi processada.
 */
export type SendPhase = "nao_enviado" | "recusa_explicita" | "desfecho_desconhecido";

export type RetryDecision =
  | {
      retry: true;
      /** Sempre `true`: a documentação não autoriza reenviar o mesmo token. */
      requiresNewGccToken: true;
      reason: "NAO_ENVIADO" | "RECUSA_COM_ORIENTACAO_DE_REPETIR";
    }
  | {
      retry: false;
      reason: "RECUSA_DEFINITIVA";
    }
  | {
      retry: false;
      reason: "DESFECHO_DESCONHECIDO";
      /**
       * Repetição automática fica BLOQUEADA até existir mecanismo documentado
       * de reconciliação ou orientação do fornecedor.
       */
      requerReconciliacao: true;
      registrarResultadoDesconhecido: true;
    };

/**
 * Classifica a fase a partir do que de fato aconteceu.
 *
 * `enviou` é a informação que o código HTTP sozinho não dá: houve ou não
 * houve entrega da requisição. Quem chama precisa saber disso — um `fetch`
 * que falhou em DNS ou em connect não enviou; um que falhou em leitura de
 * resposta pode ter enviado.
 */
export function classificarFase(input: {
  httpStatus: number | null;
  /** `false` só quando é POSSÍVEL PROVAR que nada saiu. Na dúvida, `true`. */
  possivelmenteEnviado: boolean;
}): SendPhase {
  if (!input.possivelmenteEnviado) return "nao_enviado";

  // Recusa do gateway ANTES do processamento: há resposta e ela é definitiva.
  // 429 entra aqui porque também não foi processada — a diferença é que vem
  // com orientação de repetir.
  if (input.httpStatus !== null && input.httpStatus >= 400 && input.httpStatus < 500) {
    return "recusa_explicita";
  }

  // 5xx, timeout e conexão interrompida: a requisição pode ter chegado ao
  // backend. 502 é explicitamente "problema ENTRE o gateway e o backend" —
  // ou seja, pode ter passado.
  return "desfecho_desconhecido";
}

/**
 * Decide se repetir é seguro.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * O PONTO DIFÍCIL: DESFECHO DESCONHECIDO NÃO SE RESOLVE COM TOKEN NOVO
 *
 * Uma versão anterior desta função repetia em 502, 503 e timeout, confiando
 * em obter um token novo. Estava errada, por dois motivos:
 *
 *  1. token novo evita reutilizar consentimento — não evita que o SERPRO
 *     processe DUAS VEZES. São problemas diferentes;
 *  2. nossa chave de idempotência é NOSSA. O endpoint de validação não
 *     documenta chave de idempotência nem mecanismo de reconciliação, e
 *     `x-request-trace-id` é rastreamento, não deduplicação.
 *
 * Por isso, desfecho desconhecido não repete sozinho: registra resultado
 * desconhecido e espera reconciliação documentada ou orientação do
 * fornecedor. Uma validação cobrada e contada duas vezes contra o
 * consentimento do titular é pior que uma que demora.
 */
export function decidirRetry(input: {
  httpStatus: number | null;
  possivelmenteEnviado: boolean;
}): RetryDecision {
  const fase = classificarFase(input);

  if (fase === "nao_enviado") {
    // Nada saiu. Repetir é seguro quanto a duplicidade externa; ainda assim,
    // token novo, porque a documentação não autoriza reenviar o anterior.
    return { retry: true, requiresNewGccToken: true, reason: "NAO_ENVIADO" };
  }

  if (fase === "recusa_explicita") {
    // 429 é recusa que vem com orientação de repetir, e não foi processada.
    if (input.httpStatus === 429) {
      return { retry: true, requiresNewGccToken: true, reason: "RECUSA_COM_ORIENTACAO_DE_REPETIR" };
    }
    return { retry: false, reason: "RECUSA_DEFINITIVA" };
  }

  return {
    retry: false,
    reason: "DESFECHO_DESCONHECIDO",
    requerReconciliacao: true,
    registrarResultadoDesconhecido: true,
  };
}

/**
 * Chave de idempotência da NOSSA operação.
 *
 * Ancorada no identificador que nós geramos, nunca no token: o token muda a
 * cada tentativa, e ancorar nele faria cada retry parecer uma operação nova.
 *
 * O QUE ELA NÃO GARANTE. Ela evita que NÓS gravemos ou cobremos duas vezes.
 * Ela NÃO garante processamento único no SERPRO: é chave local, o endpoint de
 * validação não documenta chave de idempotência, e nada do nosso lado alcança
 * o que já foi processado do outro. Apresentá-la como garantia de
 * processamento único seria falso.
 */
export function chaveDeIdempotencia(subjectRef: string, operationId: string): string {
  return `${subjectRef}:${operationId}`;
}

// ──────────────────────────── log e trilha ─────────────────────────────────

export class TokenEmLogError extends Error {
  constructor(onde: string) {
    super(
      `Token da GCC apareceu em ${onde}. O token é o registro formal de ` +
        `consentimento do titular e não entra em log nem em trilha.`,
    );
    this.name = "TokenEmLogError";
  }
}

/**
 * Projeção do envelope para log.
 *
 * `id_template` pode aparecer: é identificador de uma declaração nossa, sem
 * titular. O token da GCC NÃO pode, em hipótese alguma.
 */
export function privacidadeParaLog(p: PrivacyEnvelope): Record<string, string> {
  return {
    id_template: p.rfb.id_template,
    gcc_token: "[omitido]",
    cnpj_anuente: p.senatran.cnpj_anuente ?? "-",
  };
}

/**
 * Barreira: recusa qualquer estrutura que ainda carregue o token.
 *
 * Usada antes de logar ou de gravar na trilha. É conferência de valor, não de
 * nome de campo — renomear a chave não contorna.
 */
export function assertSemToken(alvo: unknown, token: string, onde: string): void {
  if (!token) return;
  const texto = typeof alvo === "string" ? alvo : JSON.stringify(alvo ?? null);
  if (texto.includes(token)) throw new TokenEmLogError(onde);
}
