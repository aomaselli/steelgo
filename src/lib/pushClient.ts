// Push (Modulo 3): registro do aparelho e homologacao PONTA A PONTA.
//
// O servidor so considera o push "recebido" quando o proprio aparelho chama
// ack_push_homologation com o nonce que veio DENTRO da notificacao
// (homologation_id + nonce). "Aceito pelo FCM" e um estado separado e nunca
// vira sucesso. So o ACK real destrava enable_push_dispatch / sos_operational.
//
// Web (navegador): nao ha push nativo -> status explicito "indisponivel".
// Nativo: @capacitor/push-notifications (carregado dinamicamente).
import { appBuild, appVersion, getDeviceId, isNativePlatform, platformName } from "@/lib/device";
import {
  rpcAckPushHomologation,
  rpcRegisterPushDevice,
  rpcRequestPushHomologation,
  rpcRevokePushDevice,
} from "@/lib/trips";

export type PushStatus = {
  supported: boolean;
  registered: boolean;
  token: string | null;
  error: string | null;
  lastAck: string | null;
};

type PushPlugin = {
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (ev: string, cb: (x: unknown) => void) => Promise<unknown>;
};

let plugin: PushPlugin | null = null;
let status: PushStatus = {
  supported: false,
  registered: false,
  token: null,
  error: null,
  lastAck: null,
};
const listeners = new Set<(s: PushStatus) => void>();
function emit(patch: Partial<PushStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}
export function subscribePush(l: (s: PushStatus) => void) {
  listeners.add(l);
  l(status);
  return () => {
    listeners.delete(l);
  };
}
export function getPushStatus() {
  return status;
}

async function loadPlugin(): Promise<PushPlugin | null> {
  if (plugin) return plugin;
  if (!isNativePlatform()) return null;
  try {
    const mod = await import("@capacitor/push-notifications");
    plugin = mod.PushNotifications as unknown as PushPlugin;
    return plugin;
  } catch {
    return null;
  }
}

/** Trata a notificacao de homologacao: extrai homologation_id + nonce e responde ao servidor (ACK real do aparelho). */
export async function handleIncomingPush(data: Record<string, unknown> | undefined) {
  const kind = data?.kind ?? data?.type;
  const hid = data?.homologation_id;
  const nonce = data?.nonce;
  if (kind === "homologation" && typeof hid === "string" && typeof nonce === "string") {
    try {
      const r = await rpcAckPushHomologation(hid, nonce, getDeviceId());
      emit({ lastAck: r?.device_received_at ?? new Date().toISOString(), error: null });
    } catch (e) {
      emit({ error: `ACK de homologação falhou: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
}

/** Registra o aparelho para push (nativo). No web devolve supported=false sem erro. */
export async function registerPush(): Promise<PushStatus> {
  const p = await loadPlugin();
  if (!p) {
    emit({
      supported: false,
      registered: false,
      error: isNativePlatform() ? "Plugin de push não disponível nesta build." : null,
    });
    return status;
  }
  emit({ supported: true });
  try {
    const perm = await p.requestPermissions();
    if (perm.receive !== "granted") {
      emit({ error: "Permissão de notificações negada." });
      return status;
    }
    await p.addListener("registration", async (t) => {
      const token = (t as { value: string }).value;
      try {
        await rpcRegisterPushDevice(getDeviceId(), platformName(), token, appVersion(), appBuild());
        emit({ registered: true, token, error: null });
      } catch (e) {
        emit({ registered: false, token, error: e instanceof Error ? e.message : String(e) });
      }
    });
    await p.addListener("registrationError", (e) =>
      emit({ error: `Registro de push falhou: ${JSON.stringify(e)}` }),
    );
    await p.addListener(
      "pushNotificationReceived",
      (n) => void handleIncomingPush((n as { data?: Record<string, unknown> }).data),
    );
    await p.addListener(
      "pushNotificationActionPerformed",
      (a) =>
        void handleIncomingPush(
          (a as { notification?: { data?: Record<string, unknown> } }).notification?.data,
        ),
    );
    await p.register();
  } catch (e) {
    emit({ error: e instanceof Error ? e.message : String(e) });
  }
  return status;
}

export async function unregisterPush(reason: string) {
  try {
    await rpcRevokePushDevice(getDeviceId(), reason);
  } catch {
    /* ignore */
  }
  emit({ registered: false, token: null });
}

/** Pede ao servidor a notificacao de homologacao para ESTE aparelho (o ACK acontece em handleIncomingPush). */
export async function requestHomologation() {
  return rpcRequestPushHomologation(getDeviceId());
}
