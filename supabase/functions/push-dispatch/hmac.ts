// Verificacao HMAC do agendador (Modulo 3). Runtime-agnostico (WebCrypto):
// roda no Deno (Edge Function) e no Node (teste local).
//
// Contrato com run_push_dispatch_tick():
//   assinatura = HMAC-SHA256(secret, `${ts}.${nonce}.${body}`) em hex
//   headers    x-steelgo-ts, x-steelgo-nonce, x-steelgo-signature ("v1=<hex>")
//   body       EXATAMENTE os bytes enviados pelo pg_net (jsonb::text canonico);
//              o servidor assina uma vez e este lado verifica os mesmos bytes -
//              nunca re-serializa o JSON antes de verificar.
export type Verified = { ok: true; ts: number; nonce: string } | { ok: false; reason: string };

const enc = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparacao em tempo constante sobre strings hex de mesmo tamanho. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySchedulerRequest(args: {
  rawBody: string;
  ts: string | null;
  nonce: string | null;
  signature: string | null;
  secret: string;
  nowSeconds?: number;
  skewSeconds?: number;
}): Promise<Verified> {
  const { rawBody, ts, nonce, signature, secret } = args;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = args.skewSeconds ?? 60;
  if (!secret || secret.length < 32) return { ok: false, reason: "secret_missing" };
  if (!ts || !/^\d{9,11}$/.test(ts)) return { ok: false, reason: "ts_malformed" };
  if (!nonce || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonce))
    return { ok: false, reason: "nonce_malformed" };
  if (!signature || !/^v1=[0-9a-f]{64}$/i.test(signature))
    return { ok: false, reason: "signature_malformed" };
  const tsNum = Number(ts);
  if (Math.abs(now - tsNum) > skew) return { ok: false, reason: "ts_out_of_window" };
  const expected = await hmacSha256Hex(secret, `${ts}.${nonce}.${rawBody}`);
  if (!timingSafeEqualHex(expected, signature.slice(3).toLowerCase()))
    return { ok: false, reason: "signature_mismatch" };
  // o corpo assinado tambem carrega ts/nonce: precisam bater com os headers
  let parsed: { ts?: unknown; nonce?: unknown } = {};
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "body_not_json" };
  }
  if (String(parsed.ts) !== ts || String(parsed.nonce).toLowerCase() !== nonce.toLowerCase())
    return { ok: false, reason: "body_header_mismatch" };
  return { ok: true, ts: tsNum, nonce: nonce.toLowerCase() };
}
