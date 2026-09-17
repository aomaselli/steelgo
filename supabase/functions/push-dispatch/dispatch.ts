// Despacho de push (Modulo 3): claim transacional -> envio -> mark_push_result.
// Runtime-agnostico: recebe fetch e o remetente FCM por injecao (mock nos
// testes locais; FCM HTTP v1 real em producao, quando houver credencial).
//
// "Enviado/aceito pelo FCM" NUNCA e recebimento: a homologacao so vira
// device_received quando o aparelho chama ack_push_homologation.
export type ClaimedItem = {
  outbox_id: number;
  lease_token: string;
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  priority: string;
  attempts: number;
  devices: { push_device_id: string; platform: string; token: string }[];
};

export type FcmResult = { messageId?: string; deadToken?: boolean; error?: string };
export type FcmSender = (
  device: ClaimedItem["devices"][number],
  item: ClaimedItem,
) => Promise<FcmResult>;

export type DispatchDeps = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn: typeof fetch;
  send: FcmSender;
  batch: number;
  leaseSeconds: number;
  log?: (m: string) => void;
};

async function rpc<T>(deps: DispatchDeps, name: string, args: Record<string, unknown>): Promise<T> {
  const r = await deps.fetchFn(`${deps.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: deps.serviceRoleKey,
      Authorization: `Bearer ${deps.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`rpc ${name} ${r.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Consome o nonce (UNIQUE no banco): a segunda execucao com o mesmo nonce e recusada. */
export async function consumeNonce(
  deps: DispatchDeps,
  nonce: string,
  ts: number,
): Promise<boolean> {
  return (await rpc<boolean>(deps, "consume_push_nonce", { p_nonce: nonce, p_ts: ts })) === true;
}

export async function runDispatch(deps: DispatchDeps): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  dead_tokens: number;
}> {
  const items =
    (await rpc<ClaimedItem[]>(deps, "claim_push_batch", {
      p_limit: deps.batch,
      p_lease_seconds: deps.leaseSeconds,
    })) ?? [];
  const out = { claimed: items.length, sent: 0, failed: 0, skipped: 0, dead_tokens: 0 };
  for (const item of items) {
    try {
      if (!item.devices?.length) {
        await rpc(deps, "mark_push_result", {
          p_outbox_id: item.outbox_id,
          p_lease_token: item.lease_token,
          p_result: "no_device",
          p_fcm_message_ids: null,
          p_error: null,
          p_dead_tokens: null,
        });
        out.skipped++;
        continue;
      }
      const ids: string[] = [];
      const dead: string[] = [];
      const errors: string[] = [];
      for (const d of item.devices) {
        try {
          const r = await deps.send(d, item);
          if (r.messageId) ids.push(r.messageId);
          if (r.deadToken) dead.push(d.token);
          if (r.error) errors.push(r.error);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      out.dead_tokens += dead.length;
      if (ids.length > 0) {
        await rpc(deps, "mark_push_result", {
          p_outbox_id: item.outbox_id,
          p_lease_token: item.lease_token,
          p_result: "sent",
          p_fcm_message_ids: ids,
          p_error: null,
          p_dead_tokens: dead.length ? dead : null,
        });
        out.sent++;
      } else {
        await rpc(deps, "mark_push_result", {
          p_outbox_id: item.outbox_id,
          p_lease_token: item.lease_token,
          p_result: "failed",
          p_fcm_message_ids: null,
          p_error: errors.join("; ").slice(0, 500) || "sem entrega",
          p_dead_tokens: dead.length ? dead : null,
        });
        out.failed++;
      }
    } catch (e) {
      deps.log?.(`item ${item.outbox_id}: ${e instanceof Error ? e.message : String(e)}`);
      out.failed++;
    }
  }
  await rpc(deps, "record_push_dispatch_run", {
    p_pushes: out.sent,
    p_error: out.failed > 0 ? `${out.failed} falha(s) no lote` : null,
  });
  return out;
}
