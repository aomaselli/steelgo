/**
 * Trilha de documentos de validação.
 *
 * Mesma forma da trilha de verificação (`driver_verifications`): uma linha por
 * evento concluído, append-only, sem o dado que originou o evento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NUNCA ENTRA
 *
 *   documento, imagem, biometria, bytes de arquivo, base64;
 *   token, bearer, chave, URL assinada;
 *   CPF, CNH, nome, e-mail, telefone.
 *
 * A URL assinada é o caso traiçoeiro: ela é curta, parece inofensiva e é
 * exatamente o que daria acesso ao documento a quem lesse o log. Por isso o
 * construtor abaixo RECUSA montar o evento quando encontra qualquer uma —
 * em vez de confiar em quem chama lembrar de não passar.
 */

import { type DocumentAuditAction, type DocumentKind, type DocumentPurpose } from "./types";

export interface DocumentAuditEvent {
  action: DocumentAuditAction;
  /** De quem é o documento. Identificador interno, nunca CPF. */
  subjectId: string;
  /** Quem agiu. Identificador interno. */
  actorId: string;
  actorRole: string;
  purpose: DocumentPurpose;
  kind: DocumentKind;
  /** Caminho do objeto. Sem segredo: é um id opaco dentro do bucket privado. */
  objectPath: string;
  /** Motivo interno, quando houver. Nunca mensagem de provedor externo. */
  reasonCode?: string | null;
  occurredAt: string;
}

export class SensitiveDataInAuditError extends Error {
  readonly campo: string;
  constructor(campo: string, achado: string) {
    super(
      `Trilha de documentos recusou o evento: campo "${campo}" contém ${achado}. ` +
        `A trilha sobrevive ao documento justamente por não guardá-lo.`,
    );
    this.name = "SensitiveDataInAuditError";
    this.campo = campo;
  }
}

/** Padrões que não podem aparecer em nenhum campo textual do evento. */
const PROIBIDOS: Array<{ nome: string; re: RegExp }> = [
  { nome: "URL assinada", re: /[?&](token|signature|sig|X-Amz-Signature)=/i },
  { nome: "URL com esquema", re: /\bhttps?:\/\//i },
  { nome: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\./ },
  { nome: "dado embutido (data URI)", re: /\bdata:[a-z]+\/[a-z0-9.+-]+;base64,/i },
  { nome: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  { nome: "chave ou segredo", re: /\b(bearer|secret|api[_-]?key|service[_-]?role)\b/i },
];

/** Campos textuais conferidos. `objectPath` entra: caminho não carrega token. */
const CAMPOS_CONFERIDOS: Array<keyof DocumentAuditEvent> = [
  "subjectId",
  "actorId",
  "actorRole",
  "objectPath",
  "reasonCode",
];

/**
 * Monta o evento, recusando qualquer dado que não deva ser registrado.
 *
 * É uma barreira, não uma validação de formulário: o chamador não precisa
 * acertar, precisa não conseguir errar em silêncio.
 */
export function buildDocumentAuditEvent(e: DocumentAuditEvent): DocumentAuditEvent {
  for (const campo of CAMPOS_CONFERIDOS) {
    const valor = e[campo];
    if (typeof valor !== "string") continue;
    for (const { nome, re } of PROIBIDOS) {
      if (re.test(valor)) throw new SensitiveDataInAuditError(String(campo), nome);
    }
  }
  return { ...e };
}

/**
 * Projeção para log de aplicação.
 *
 * Ainda mais estreita que a trilha: o log vai para serviço de terceiro e tem
 * retenção que não controlamos. Nem identificador de pessoa entra — só o que
 * serve para operar.
 */
export function auditEventForLog(e: DocumentAuditEvent): Record<string, string> {
  return {
    action: e.action,
    purpose: e.purpose,
    kind: e.kind,
    actorRole: e.actorRole,
    reasonCode: e.reasonCode ?? "-",
    occurredAt: e.occurredAt,
  };
}
