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
 *   nao_enviado            provado que a requisição não chegou a sair. É o
 *                          ÚNICO caso em que podemos afirmar, por conta
 *                          própria, que nada foi processado do outro lado.
 *   recusa_explicita       o fornecedor respondeu recusando. Há resposta —
 *                          mas SE a requisição foi processada antes da
 *                          recusa é outra pergunta, e só a documentação do
 *                          fornecedor pode respondê-la.
 *   desfecho_desconhecido  timeout, conexão interrompida, ou erro de servidor
 *                          depois de a requisição possivelmente ter sido
 *                          entregue. NÃO SABEMOS se foi processada.
 */
export type SendPhase = "nao_enviado" | "recusa_explicita" | "desfecho_desconhecido";

/**
 * Houve processamento do outro lado?
 *
 * Eixo SEPARADO da fase, e de propósito. Uma versão anterior deste módulo
 * tratava todo 4xx — e o 429 em especial — como "seguramente anterior ao
 * processamento". Isso não está escrito em lugar nenhum: era presunção
 * minha, apoiada em como gateways costumam se comportar.
 *
 * Aqui só se afirma `nao_processado` quando a documentação do endpoint diz
 * isso, com a citação junto. Todo o resto é `desconhecido`.
 */
export type EvidenciaDeProcessamento =
  | { processado: "nao_processado"; fonte: string }
  | { processado: "desconhecido"; motivo: string };

/**
 * Evidência documentada, por status, para POST /v5/pessoa-fisica/validacao.
 *
 * Hoje há exatamente UMA entrada. O 422 é o único cuja descrição afirma o
 * não processamento:
 *
 *     "Requisição não processada — A requisição não pode ser processada
 *      pois há alguma inconsistência com base no corpo da requisição
 *      recebida"
 *
 * Os demais 4xx descrevem a recusa sem dizer se houve processamento:
 * 400 "a requisição não foi aceita", 401 "problemas durante a autenticação",
 * 403 "acesso não autorizado", 404 "verifique se o endereço é válido",
 * 413 "a requisição tem um tamanho muito grande". Nenhuma afirma o que nos
 * interessaria afirmar.
 *
 * 429 NÃO CONSTA das respostas documentadas deste endpoint. A versão
 * anterior tinha um ramo para ele dizendo que não era processado — para um
 * status que a documentação sequer lista.
 */
const EVIDENCIA_POR_STATUS: Record<number, EvidenciaDeProcessamento> = {
  422: {
    processado: "nao_processado",
    fonte: "Referência da API, POST /v5/pessoa-fisica/validacao, 422: \"A requisição não pode ser processada\"",
  },
};

export function evidenciaDeProcessamento(input: {
  httpStatus: number | null;
  possivelmenteEnviado: boolean;
}): EvidenciaDeProcessamento {
  if (!input.possivelmenteEnviado) {
    return { processado: "nao_processado", fonte: "não houve envio (constatado no nosso lado)" };
  }
  if (input.httpStatus !== null && EVIDENCIA_POR_STATUS[input.httpStatus]) {
    return EVIDENCIA_POR_STATUS[input.httpStatus];
  }
  return {
    processado: "desconhecido",
    motivo:
      input.httpStatus === null
        ? "sem resposta: não há como saber se a requisição foi processada"
        : `HTTP ${input.httpStatus} não é documentado como anterior ao processamento`,
  };
}

export type RetryDecision =
  | {
      retry: true;
      /** Sempre `true`: a documentação não autoriza reenviar o mesmo token. */
      requiresNewGccToken: true;
      reason: "NAO_ENVIADO";
    }
  | {
      retry: false;
      reason: "RECUSA_DEFINITIVA";
      /** O que sabemos sobre processamento — pode ser `desconhecido`. */
      evidencia: EvidenciaDeProcessamento;
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
      evidencia: EvidenciaDeProcessamento;
    };

/**
 * Classifica a fase a partir do que de fato aconteceu.
 *
 * `possivelmenteEnviado` é a informação que o código HTTP sozinho não dá.
 * Um `fetch` que falhou em DNS ou em connect não enviou; um que falhou ao ler
 * a resposta pode ter enviado. Na dúvida, `true`.
 */
export function classificarFase(input: {
  httpStatus: number | null;
  possivelmenteEnviado: boolean;
}): SendPhase {
  if (!input.possivelmenteEnviado) return "nao_enviado";
  if (input.httpStatus !== null && input.httpStatus >= 400 && input.httpStatus < 500) {
    return "recusa_explicita";
  }
  return "desfecho_desconhecido";
}

/**
 * Decide se repetir é seguro.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * NENHUMA REPETIÇÃO AUTOMÁTICA DEPOIS DE A REQUISIÇÃO SAIR
 *
 * Só o caso comprovadamente anterior ao envio repete sozinho. Recusa
 * explícita não repete — a mesma requisição recebe a mesma recusa — e
 * desfecho desconhecido fica bloqueado até haver reconciliação documentada
 * ou orientação do fornecedor.
 *
 * Token novo evita reutilizar consentimento entre operações. NÃO evita que o
 * SERPRO processe duas vezes: são problemas diferentes, e o segundo não tem
 * mecanismo documentado do nosso lado.
 */
export function decidirRetry(input: {
  httpStatus: number | null;
  possivelmenteEnviado: boolean;
}): RetryDecision {
  const fase = classificarFase(input);
  const evidencia = evidenciaDeProcessamento(input);

  if (fase === "nao_enviado") {
    return { retry: true, requiresNewGccToken: true, reason: "NAO_ENVIADO" };
  }

  if (fase === "recusa_explicita") {
    // Não repete, independentemente da evidência: a mesma requisição receberia
    // a mesma recusa. A evidência vai junto porque importa para conciliação e
    // para faturamento, não para a decisão de repetir.
    return { retry: false, reason: "RECUSA_DEFINITIVA", evidencia };
  }

  return {
    retry: false,
    reason: "DESFECHO_DESCONHECIDO",
    requerReconciliacao: true,
    registrarResultadoDesconhecido: true,
    evidencia,
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
