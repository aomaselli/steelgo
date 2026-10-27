/**
 * Retenção e expurgo de documentos de validação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NENHUM PRAZO INVENTADO
 *
 * As durações definitivas dependem de aprovação jurídica e NÃO estão aqui.
 * A política é configurável e, **sem configuração explícita, o expurgo recusa
 * rodar** — não cai num padrão plausível.
 *
 * Um padrão inventado seria pior que a ausência: viraria o prazo de fato, sem
 * ninguém ter decidido, e ninguém notaria até alguém perguntar por que um
 * documento sumiu (ou por que não sumiu).
 */

import { type DocumentKind, isBiometric } from "./types";

/**
 * Prazos, em dias. `null` = ainda não aprovado.
 *
 * Três prazos distintos porque os dados são distintos: biometria é o mais
 * sensível e deve viver menos; a imagem do documento vive o necessário para a
 * revisão; e o upload abandonado — aquele que nunca virou validação — não tem
 * razão nenhuma para persistir.
 */
export interface RetentionPolicy {
  /** Selfie e demais dados biométricos. */
  biometricDays: number | null;
  /** Imagem de documento (CNH frente/verso). */
  documentImageDays: number | null;
  /** Upload que nunca teve validação iniciada. */
  abandonedUploadHours: number | null;
}

/** Política vazia: o estado honesto enquanto o jurídico não aprovar. */
export const POLITICA_NAO_APROVADA: RetentionPolicy = {
  biometricDays: null,
  documentImageDays: null,
  abandonedUploadHours: null,
};

export class RetencaoNaoConfiguradaError extends Error {
  readonly campo: keyof RetentionPolicy;
  constructor(campo: keyof RetentionPolicy) {
    super(
      `Retenção não configurada: ${campo}. O expurgo não roda com prazo não ` +
        `aprovado — defina o valor aprovado em vez de aceitar um padrão.`,
    );
    this.name = "RetencaoNaoConfiguradaError";
    this.campo = campo;
  }
}

export interface StoredDocument {
  objectPath: string;
  kind: DocumentKind;
  uploadedAt: string;
  /** Quando a validação que usou este documento começou. `null` = abandonado. */
  validationStartedAt: string | null;
  /** Já expurgado antes? Expurgo é idempotente. */
  purgedAt?: string | null;
}

export type PurgeVerdict =
  | { purge: false; reason: "ALREADY_PURGED" | "WITHIN_RETENTION" }
  | { purge: true; reason: "ABANDONED_UPLOAD" | "BIOMETRIC_EXPIRED" | "DOCUMENT_EXPIRED" };

function dias(ms: number): number {
  return ms / 86_400_000;
}

function horas(ms: number): number {
  return ms / 3_600_000;
}

/**
 * Decide se um documento deve ser expurgado agora.
 *
 * Lança quando o prazo aplicável não foi aprovado. Falhar é melhor do que
 * expurgar cedo demais (perde prova) ou tarde demais (guarda biometria além do
 * necessário).
 */
export function avaliarExpurgo(
  doc: StoredDocument,
  policy: RetentionPolicy,
  now: Date,
): PurgeVerdict {
  if (doc.purgedAt) return { purge: false, reason: "ALREADY_PURGED" };

  const uploadMs = now.getTime() - new Date(doc.uploadedAt).getTime();

  // 1. Upload abandonado: nunca virou validação. Não espera o prazo do
  //    documento, porque não há revisão alguma para sustentar a guarda.
  if (!doc.validationStartedAt) {
    if (policy.abandonedUploadHours === null) {
      throw new RetencaoNaoConfiguradaError("abandonedUploadHours");
    }
    if (horas(uploadMs) >= policy.abandonedUploadHours) {
      return { purge: true, reason: "ABANDONED_UPLOAD" };
    }
    return { purge: false, reason: "WITHIN_RETENTION" };
  }

  // 2. Documento usado numa validação: o relógio corre do início dela.
  const inicioMs = now.getTime() - new Date(doc.validationStartedAt).getTime();

  if (isBiometric(doc.kind)) {
    if (policy.biometricDays === null) throw new RetencaoNaoConfiguradaError("biometricDays");
    return dias(inicioMs) >= policy.biometricDays
      ? { purge: true, reason: "BIOMETRIC_EXPIRED" }
      : { purge: false, reason: "WITHIN_RETENTION" };
  }

  if (policy.documentImageDays === null) throw new RetencaoNaoConfiguradaError("documentImageDays");
  return dias(inicioMs) >= policy.documentImageDays
    ? { purge: true, reason: "DOCUMENT_EXPIRED" }
    : { purge: false, reason: "WITHIN_RETENTION" };
}

/**
 * Seleciona o que expurgar de um lote.
 *
 * A trilha de auditoria NÃO entra aqui: ela sobrevive ao documento, e é por
 * isso que não guarda o documento. Expurgar a prova de que algo existiu seria
 * apagar a própria capacidade de responder por isso depois.
 */
export function selecionarParaExpurgo(
  docs: StoredDocument[],
  policy: RetentionPolicy,
  now: Date,
): Array<{ doc: StoredDocument; reason: string }> {
  const saida: Array<{ doc: StoredDocument; reason: string }> = [];
  for (const doc of docs) {
    const v = avaliarExpurgo(doc, policy, now);
    if (v.purge) saida.push({ doc, reason: v.reason });
  }
  return saida;
}
