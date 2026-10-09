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

export type RetryDecision =
  | { retry: false; reason: "NOT_RETRYABLE" }
  | { retry: true; requiresNewGccToken: true; reason: "UNKNOWN_OUTCOME" | "GATEWAY" };

/**
 * Decide se vale repetir, e com o quê.
 *
 * Quando vale repetir, `requiresNewGccToken` é SEMPRE `true` — não há ramo que
 * autorize reenviar o mesmo token, porque a documentação não autoriza. O tipo
 * é literal `true` de propósito: não existe como escrever o contrário sem
 * mexer aqui e encarar este comentário.
 *
 * 502 é o único caso em que a própria documentação manda repetir
 * (Referência da API: "Bad Gateway — efetue uma nova requisição").
 */
export function decidirRetry(httpStatus: number | null): RetryDecision {
  if (httpStatus === 502 || httpStatus === 503 || httpStatus === null) {
    return { retry: true, requiresNewGccToken: true, reason: httpStatus === 502 ? "GATEWAY" : "UNKNOWN_OUTCOME" };
  }
  return { retry: false, reason: "NOT_RETRYABLE" };
}

/**
 * Chave de idempotência da NOSSA operação.
 *
 * Ancorada no identificador que nós geramos, nunca no token: o token muda a
 * cada tentativa, e ancorar nele faria cada retry parecer uma operação nova.
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
