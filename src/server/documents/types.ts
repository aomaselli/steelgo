/**
 * Documentos de validação — tipos internos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE MÓDULO NÃO HERDA AS PERMISSÕES DO COMPROVANTE DE VIAGEM
 *
 * `trip-media` libera as PARTES da viagem: motorista, transportadora e
 * embarcador. Isso é certo para foto de carga e assinatura de recebimento —
 * são a prova de um negócio entre eles.
 *
 * CNH e selfie não são prova de negócio nenhum. São documento de identidade e
 * biometria de uma pessoa, coletados para UMA finalidade: validar que ela é
 * quem diz ser e que está habilitada. A transportadora precisa do RESULTADO
 * dessa validação, não do rosto e do documento do motorista.
 *
 * Por isso o acesso aqui é mais estreito e é por FINALIDADE, não por
 * participação num negócio.
 */

/**
 * Finalidade da coleta. Entra no caminho do objeto, no consentimento e na
 * trilha — e é o que delimita quem pode ver o quê.
 *
 * Uma finalidade nova exige consentimento próprio: consentir em validar
 * identidade não é consentir em qualquer outro uso do mesmo arquivo.
 */
export type DocumentPurpose = "identity_validation";

export const DOCUMENT_PURPOSES: readonly DocumentPurpose[] = ["identity_validation"];

/** Espécie do arquivo dentro de uma finalidade. */
export type DocumentKind = "cnh_front" | "cnh_back" | "selfie";

export const DOCUMENT_KINDS: readonly DocumentKind[] = ["cnh_front", "cnh_back", "selfie"];

/** Biometria tem tratamento próprio: prazo mais curto, acesso mais estreito. */
export function isBiometric(kind: DocumentKind): boolean {
  return kind === "selfie";
}

/**
 * Quem pode alcançar um documento.
 *
 * `carrier` e `shipper` NÃO aparecem, e a ausência é a decisão — não um
 * esquecimento a ser corrigido depois copiando de `trip-media`.
 */
export type DocumentViewerRole = "owner" | "admin_reviewer";

export const DOCUMENT_VIEWER_ROLES: readonly DocumentViewerRole[] = ["owner", "admin_reviewer"];

/** Papéis que o resto do produto conhece, incluindo os que NÃO têm acesso. */
export type ActorRole = "driver" | "carrier" | "shipper" | "admin" | "anon";

/** Ações registradas na trilha. Toda uma delas, sem exceção. */
export type DocumentAuditAction =
  | "upload"
  | "access"
  | "delete"
  | "validation_started"
  | "purge";

export const DOCUMENT_AUDIT_ACTIONS: readonly DocumentAuditAction[] = [
  "upload",
  "access",
  "delete",
  "validation_started",
  "purge",
];

/** Resultado de uma decisão de autorização, sempre com motivo. */
export type AuthorizationDecision =
  | { allowed: true; viewerRole: DocumentViewerRole }
  | { allowed: false; reason: AuthorizationDenialReason };

export type AuthorizationDenialReason =
  | "ANONYMOUS"
  | "ROLE_NOT_ALLOWED_FOR_PURPOSE"
  | "NOT_OWNER"
  | "PURPOSE_MISMATCH"
  | "CONSENT_MISSING"
  | "CONSENT_OUTDATED"
  | "CONSENT_WITHDRAWN";

/** Consentimento registrado para UMA finalidade. */
export interface ConsentRecord {
  subjectId: string;
  purpose: DocumentPurpose;
  /** Versão do texto aceito. */
  version: string;
  /** SHA-256 do corpo do texto aceito, em hexadecimal. */
  textSha256: string;
  acceptedAt: string;
  withdrawnAt?: string | null;
}

/** Texto de consentimento publicado e vigente. */
export interface PublishedConsentText {
  purpose: DocumentPurpose;
  version: string;
  textSha256: string;
  effectiveFrom: string;
}
