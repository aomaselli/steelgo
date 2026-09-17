// FCM HTTP v1 (Modulo 3) com conta de servico do Firebase (JWT RS256 -> OAuth2).
// Runtime-agnostico (WebCrypto). SEM credencial configurada, nada e enviado:
// o index.ts usa o remetente mock apenas quando PUSH_FCM_MODE=mock.
import type { ClaimedItem, FcmSender } from "./dispatch.ts";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes =
    typeof buf === "string"
      ? enc.encode(buf)
      : buf instanceof Uint8Array
        ? buf
        : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let cachedToken: { value: string; exp: number } | null = null;

export async function getAccessToken(sa: ServiceAccount, fetchFn: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${b64url(sig)}`;
  const r = await fetchFn("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!r.ok) throw new Error(`oauth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

// Minimizacao na tela bloqueada (espelho do CHECK push_outbox_text_minimized e
// do catalogo push_minimized_body no banco): o payload FCM leva SOMENTE chaves
// de roteamento e textos curtos; qualquer outra chave em data e descartada, e
// texto com e-mail, CPF/CNPJ, telefone, valor ou coordenada e substituido pelo
// generico. Os detalhes ficam no app, apos autenticacao.
// data: chave -> formato estrito (identificadores de roteamento, nunca texto livre)
const DATA_ALLOWLIST: Record<string, RegExp> = {
  kind: /^[a-z_]{1,64}$/,
  ref: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  link: /^\/[a-z0-9\/_-]{0,120}$/i, // caminho interno do app, sem query string
  homologation_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  nonce: /^[0-9a-f]{32}$/i, // ack_push_homologation exige o nonce recebido no aparelho
};
const FORBIDDEN_TEXT = [
  /@/, // e-mail
  /R\$/, // valor financeiro
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/, // CPF
  /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/, // CNPJ
  /\(?\d{2}\)?\s?9?\d{4}-?\d{4}/, // telefone
  /-?\d{1,3}\.\d{4,}/, // coordenada decimal
  /\d{9,}/, // documento/telefone sem mascara
];
export const GENERIC_BODY = "Atualização da viagem. Abra o aplicativo para ver os detalhes.";
export const GENERIC_TITLE = "SteelGo";

export function isMinimizedText(text: string): boolean {
  return !FORBIDDEN_TEXT.some((re) => re.test(text));
}

export type FcmMessage = {
  message: {
    token: string;
    notification: { title: string; body: string };
    data: Record<string, string>;
    android: { priority: "HIGH" | "NORMAL"; notification: { channel_id: string } };
  };
};

/** Monta a mensagem FCM a partir do item da fila. Puro: testavel sem rede. */
export function buildFcmMessage(
  device: ClaimedItem["devices"][number],
  item: ClaimedItem,
): FcmMessage {
  const data: Record<string, string> = { kind: item.kind, outbox_id: String(item.outbox_id) };
  const src = item.data ?? {};
  for (const [k, re] of Object.entries(DATA_ALLOWLIST)) {
    const v = src[k];
    if (typeof v === "string" && re.test(v)) data[k] = v;
  }
  const title = isMinimizedText(item.title) ? item.title.slice(0, 120) : GENERIC_TITLE;
  const body = isMinimizedText(item.body) ? item.body.slice(0, 400) : GENERIC_BODY;
  return {
    message: {
      token: device.token,
      notification: { title, body },
      data,
      android: {
        priority: item.priority === "high" ? "HIGH" : "NORMAL",
        notification: {
          channel_id:
            item.kind === "sos_opened" || item.kind === "sos_escalated"
              ? "steelgo_critical"
              : "steelgo_ops",
        },
      },
    },
  };
}

/** Remetente real (FCM HTTP v1). notification + data de roteamento; nunca dados pessoais no payload. */
export function makeFcmSender(sa: ServiceAccount, fetchFn: typeof fetch): FcmSender {
  return async (device, item) => {
    const token = await getAccessToken(sa, fetchFn);
    const message = buildFcmMessage(device, item);
    const r = await fetchFn(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      },
    );
    const text = await r.text();
    if (r.ok) {
      const j = JSON.parse(text) as { name?: string };
      return { messageId: j.name ?? "fcm" };
    }
    // UNREGISTERED / NOT_FOUND: token morto -> revoga no servidor (mark_push_result)
    const dead = r.status === 404 || /UNREGISTERED|NOT_FOUND|InvalidRegistration/.test(text);
    return { deadToken: dead, error: `fcm ${r.status}: ${text.slice(0, 200)}` };
  };
}

/** Remetente MOCK (somente PUSH_FCM_MODE=mock): aceita tudo, nao entrega nada. */
export const mockFcmSender: FcmSender = async (device) => ({
  messageId: `mock-${device.push_device_id}-${Date.now()}`,
});
