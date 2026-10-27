/**
 * Autorização de acesso a documento de validação.
 *
 * Função pura: recebe quem pede, o que pede e o estado do consentimento, e
 * devolve autorizado/negado COM MOTIVO. Nada de `if (role === "admin")`
 * espalhado por tela e por RPC.
 *
 * Esta função é a referência; as policies do banco são a segunda barreira, não
 * a única. As duas precisam concordar — é o que a bateria SQL confere.
 */

import {
  type ActorRole,
  type AuthorizationDecision,
  type ConsentRecord,
  type DocumentPurpose,
  type PublishedConsentText,
} from "./types";

export interface AccessRequest {
  /** Quem pede. `null` quando não há sessão. */
  actorId: string | null;
  actorRole: ActorRole;
  /** De quem é o documento. */
  subjectId: string;
  /** Finalidade declarada no caminho do objeto. */
  objectPurpose: DocumentPurpose;
  /** Finalidade para a qual se pede acesso agora. */
  requestedPurpose: DocumentPurpose;
}

export interface ConsentState {
  published: PublishedConsentText | null;
  record: ConsentRecord | null;
}

/**
 * O consentimento vigente é o que vale.
 *
 * Republicar o texto invalida o aceite anterior — mesma regra do aviso de
 * privacidade da viagem, onde a troca de versão em viagem em curso foi o caso
 * que quebrou. Aqui a comparação é por versão E por hash do corpo: versão igual
 * com corpo diferente também não vale, senão bastaria republicar sem subir a
 * versão para mudar o que a pessoa aceitou.
 */
export function consentStatus(
  state: ConsentState,
): "current" | "missing" | "outdated" | "withdrawn" {
  const { published, record } = state;
  if (!record) return "missing";
  if (record.withdrawnAt) return "withdrawn";
  if (!published) return "missing";
  if (record.purpose !== published.purpose) return "missing";
  if (record.version !== published.version) return "outdated";
  if (record.textSha256 !== published.textSha256) return "outdated";
  return "current";
}

/**
 * Decide o acesso.
 *
 * Ordem deliberada: identidade do solicitante, depois finalidade, depois
 * consentimento. Um `anon` nunca chega a revelar se o documento existe.
 */
export function authorizeDocumentAccess(
  req: AccessRequest,
  consent: ConsentState,
): AuthorizationDecision {
  // 1. Sem sessão não se discute mais nada.
  if (!req.actorId || req.actorRole === "anon") {
    return { allowed: false, reason: "ANONYMOUS" };
  }

  // 2. A finalidade do objeto tem de ser a finalidade do pedido. Documento
  //    coletado para validar identidade não é material para outro uso.
  if (req.objectPurpose !== req.requestedPurpose) {
    return { allowed: false, reason: "PURPOSE_MISMATCH" };
  }

  // 3. Papel. `carrier` e `shipper` caem aqui — de propósito. A transportadora
  //    precisa do RESULTADO da validação, não da selfie e da CNH.
  let viewerRole: "owner" | "admin_reviewer";
  if (req.actorRole === "driver") {
    if (req.actorId !== req.subjectId) {
      return { allowed: false, reason: "NOT_OWNER" };
    }
    viewerRole = "owner";
  } else if (req.actorRole === "admin") {
    viewerRole = "admin_reviewer";
  } else {
    return { allowed: false, reason: "ROLE_NOT_ALLOWED_FOR_PURPOSE" };
  }

  // 4. Consentimento vigente. Vale inclusive para o próprio titular: sem
  //    consentimento vigente o documento não deveria ter sido coletado, e
  //    continuar servindo-o prolongaria a coleta sem base.
  switch (consentStatus(consent)) {
    case "missing":
      return { allowed: false, reason: "CONSENT_MISSING" };
    case "outdated":
      return { allowed: false, reason: "CONSENT_OUTDATED" };
    case "withdrawn":
      return { allowed: false, reason: "CONSENT_WITHDRAWN" };
    case "current":
      return { allowed: true, viewerRole };
  }
}

// ──────────────────────────── URL assinada ────────────────────────────────

/**
 * Teto absoluto da validade de uma URL assinada, em segundos.
 *
 * Não é configuração: é limite. Um documento de identidade não precisa de link
 * vivo por horas, e link longo vaza por histórico, log de proxy e cópia de
 * mensagem.
 */
export const TTL_MAXIMO_SEGUNDOS = 120;

/** Valor usado quando quem chama não especifica. Dentro do teto. */
export const TTL_PADRAO_SEGUNDOS = 60;

export class TtlInvalidoError extends Error {}

/**
 * Normaliza a validade pedida, com teto rígido.
 *
 * Pedido acima do teto é ERRO, não ajuste silencioso: quem pediu dez minutos
 * precisa saber que não vai recebê-los, em vez de achar que recebeu.
 */
export function normalizarTtl(segundos?: number): number {
  if (segundos === undefined) return TTL_PADRAO_SEGUNDOS;
  if (!Number.isInteger(segundos) || segundos <= 0) {
    throw new TtlInvalidoError(`TTL inválido: ${segundos}. Use inteiro positivo de segundos.`);
  }
  if (segundos > TTL_MAXIMO_SEGUNDOS) {
    throw new TtlInvalidoError(
      `TTL de ${segundos}s excede o teto de ${TTL_MAXIMO_SEGUNDOS}s para documento de validação.`,
    );
  }
  return segundos;
}
