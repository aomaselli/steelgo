/**
 * Mascaramento para log. CPF e CNH completos NUNCA vão para console,
 * telemetria ou banco. Os logs da Vercel ficam retidos e legíveis por
 * qualquer pessoa com acesso ao projeto.
 */

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** "12345678901" -> "123.***.**9-01" ; entradas curtas viram só asteriscos. */
export function maskCpf(value: string | null | undefined): string {
  const d = digitsOnly(value ?? "");
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.**${d.slice(8, 9)}-${d.slice(9)}`;
}

/** Mantém 2 primeiros e 2 últimos caracteres. */
export function maskDocument(value: string | null | undefined): string {
  const v = (value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (v.length === 0) return "***";
  if (v.length <= 4) return "*".repeat(v.length);
  return `${v.slice(0, 2)}${"*".repeat(v.length - 4)}${v.slice(-2)}`;
}

/** Log seguro: só identificadores internos e códigos. */
export function verificationLog(
  event: string,
  fields: Record<string, string | number | boolean | null>,
): void {
  const safe = Object.entries(fields)
    .map(([k, v]) => `${k}=${v === null ? "-" : String(v)}`)
    .join(" ");
  console.info(`[verification] ${event} ${safe}`);
}
