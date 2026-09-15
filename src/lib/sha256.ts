// Hash e assinatura inicial de arquivos, calculados NO NAVEGADOR.
//
// Modulo 1 (operacao financeira): o SHA-256 do comprovante e calculado aqui,
// pelo navegador do administrador, e declarado ao Storage (user_metadata) e a
// RPC de atestacao. O servidor confere apenas a coerencia entre as duas
// declaracoes; nao recalcula o hash nem le os bytes. E uma atestacao humana -
// nao e verificacao bancaria nem criptografica independente. A checagem de
// assinatura inicial abaixo reduz erro operacional (arquivo errado) e tambem
// NAO e independente contra um administrador malicioso.

export async function sha256HexOfBuffer(buf: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return sha256HexOfBuffer(new TextEncoder().encode(input));
}

export type EvidenceMime = "application/pdf" | "image/jpeg" | "image/png";
export type EvidenceExt = "pdf" | "jpg" | "png";
export type EvidenceType = { mime: EvidenceMime; ext: EvidenceExt };

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Detecta o tipo pelos primeiros bytes (magic number), nunca pelo nome:
 *   PDF  25 50 44 46 2D            ("%PDF-")
 *   JPEG FF D8 FF
 *   PNG  89 50 4E 47 0D 0A 1A 0A
 * Devolve null para qualquer outro conteudo.
 */
export function detectEvidenceType(buf: ArrayBuffer): EvidenceType | null {
  const b = new Uint8Array(buf.slice(0, 8));
  if (
    b.length >= 5 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d
  ) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  return null;
}

/** Timestamp UTC no formato YYYYMMDDTHHMMSS.mmmZ, sem separadores. */
export function utcStamp(d: Date = new Date()): string {
  const iso = d.toISOString(); // 2026-09-12T10:30:05.123Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}.${iso.slice(20, 23)}Z`;
}

/**
 * Caminho do comprovante no bucket payment-evidence, exatamente como a policy
 * de INSERT e a RPC assert_payment_evidence exigem:
 *   <contract_id>/<transaction_id>/<kind>-<UTC ms>-<random uuid>-<sha256_16>.<ext>
 */
export function buildEvidencePath(args: {
  contractId: string;
  transactionId: string;
  kind: "funding" | "release";
  sha256: string;
  ext: EvidenceExt;
  objectUuid: string;
  at?: Date;
}): string {
  const { contractId, transactionId, kind, sha256, ext, objectUuid, at } = args;
  return `${contractId}/${transactionId}/${kind}-${utcStamp(at)}-${objectUuid}-${sha256.slice(0, 16)}.${ext}`;
}
