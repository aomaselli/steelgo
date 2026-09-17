// Edge Function push-dispatch (Modulo 3).
//
// Chamada SOMENTE pelo agendador do banco (run_push_dispatch_tick via pg_net),
// com HMAC-SHA256 sobre os bytes exatos do corpo + ts + nonce. verify_jwt e
// false (config.toml): a autenticacao e o HMAC, e o nonce e consumido no banco
// (UNIQUE) antes de qualquer envio - replay recebe 409.
//
// Segredos (Supabase Secrets, NAO criados por esta entrega):
//   STEELGO_CRON_SECRET          mesmo valor do Vault steelgo_cron_secret (>= 32 chars)
//   FCM_SERVICE_ACCOUNT_JSON     JSON da conta de servico (FCM HTTP v1)
//   PUSH_FCM_MODE                "mock" apenas em ambiente local/homologacao interna
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  injetados pela plataforma
import { verifySchedulerRequest } from "./hmac.ts";
import { consumeNonce, runDispatch } from "./dispatch.ts";
import { makeFcmSender, mockFcmSender } from "./fcm.ts";

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Promise<Response> | Response): void;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("STEELGO_CRON_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "platform_env_missing" });

  // bytes exatos do corpo, sem re-serializar
  const rawBody = await req.text();
  const v = await verifySchedulerRequest({
    rawBody,
    ts: req.headers.get("x-steelgo-ts"),
    nonce: req.headers.get("x-steelgo-nonce"),
    signature: req.headers.get("x-steelgo-signature"),
    secret,
  });
  if (!v.ok) return json(401, { error: v.reason });

  const deps = {
    supabaseUrl,
    serviceRoleKey,
    fetchFn: fetch,
    batch: Math.min(
      Math.max(Number((JSON.parse(rawBody) as { batch?: unknown }).batch ?? 200) || 200, 1),
      500,
    ),
    leaseSeconds: 60,
    send: mockFcmSender,
    log: (m: string) => console.warn(`[push-dispatch] ${m}`),
  };
  if (!(await consumeNonce(deps, v.nonce, v.ts)))
    return json(409, { error: "nonce_replayed_or_expired" });

  const mode = Deno.env.get("PUSH_FCM_MODE");
  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (mode === "mock") {
    deps.send = mockFcmSender;
  } else if (saRaw) {
    try {
      deps.send = makeFcmSender(JSON.parse(saRaw), fetch);
    } catch {
      return json(500, { error: "fcm_service_account_invalid" });
    }
  } else {
    // Sem credencial e sem mock explicito: nao envia nada e diz por que.
    return json(503, {
      error: "fcm_not_configured",
      hint: "defina FCM_SERVICE_ACCOUNT_JSON (producao) ou PUSH_FCM_MODE=mock (local)",
    });
  }

  try {
    const result = await runDispatch(deps);
    return json(200, { ok: true, mode: mode === "mock" ? "mock" : "fcm_v1", ...result });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
