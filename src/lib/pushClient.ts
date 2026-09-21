// Push (Modulo 3): registro do aparelho e homologacao PONTA A PONTA.
//
// O servidor so considera o push "recebido" quando o proprio aparelho chama
// ack_push_homologation com o nonce que veio DENTRO da notificacao
// (homologation_id + nonce). "Aceito pelo FCM" e um estado separado e nunca
// vira sucesso. So o ACK real destrava enable_push_dispatch / sos_operational.
//
// Web (navegador): nao ha push nativo -> status explicito "indisponivel".
// Nativo: @capacitor/push-notifications (carregado dinamicamente).
//
// CORRECAO (homologacao 18/09/2026): `PushNotifications` e um Proxy de
// registerPlugin; devolve-lo de uma funcao async faz o motor JS ler `.then`
// (assimilacao de Promise) e o Proxy encaminha `then` ao nativo ->
// "PushNotifications.then() is not implemented on android". O plugin nunca e
// retornado como valor: fica em variavel de modulo e sai embrulhado em { plugin }.
//
// PERMISSAO: nenhum requestPermissions() ao montar/logar. Listeners podem ser
// preparados sem pedir nada (preparePushListeners). POST_NOTIFICATIONS so e
// pedida por acao explicita (enablePush) apos explicacao contextual na UI.
// Negar e um estado normal e recuperavel. Sem configuracao FCM (homolog) o
// registro falha de forma controlada (registrationError / rejeicao capturada):
// sem crash, sem loop, sem push_device parcial (o servidor exige token >= 20).
import { appBuild, getDeviceId, isNativePlatform, platformName } from "@/lib/device";
import { resolveAppVersion } from "@/lib/appInfo";
import {
  rpcAckPushHomologation,
  rpcRegisterPushDevice,
  rpcRequestPushHomologation,
  rpcRevokePushDevice,
} from "@/lib/trips";

export type PushPermission = "unknown" | "prompt" | "granted" | "denied";
/** Resultado da ULTIMA tentativa explicita: qualquer coisa que nao seja "granted" e "not_granted" */
export type PushAttemptOutcome = "granted" | "not_granted" | null;

export type PushStatus = {
  supported: boolean;
  /** true quando este aparelho registrou um token valido no servidor */
  registered: boolean;
  token: string | null;
  permission: PushPermission;
  /** listeners preparados (sem pedir permissao) */
  listenersReady: boolean;
  /** pedido em andamento (explicacao -> permissao -> registro) */
  busy: boolean;
  /** null = nunca solicitado por acao explicita; "not_granted" = tentou e o sistema nao concedeu (denied/prompt/desconhecido) */
  attempt: PushAttemptOutcome;
  error: string | null;
  lastAck: string | null;
};

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (ev: string, cb: (x: unknown) => void) => Promise<unknown>;
};

/** Embrulho: NUNCA retornar o Proxy do plugin como valor de uma Promise. */
export type PluginHandle = { plugin: PushPlugin };

let handle: PluginHandle | null = null;
let listenersAttached = false;
let enabling: Promise<PushStatus> | null = null;
let status: PushStatus = {
  supported: false,
  registered: false,
  token: null,
  permission: "unknown",
  listenersReady: false,
  busy: false,
  attempt: null,
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

/**
 * Carrega o plugin nativo e devolve um wrapper comum `{ plugin }` (nunca o Proxy).
 * Web: null. Falha de import: null (status.error explica).
 */
export async function loadPushPlugin(): Promise<PluginHandle | null> {
  if (handle) return handle;
  if (!isNativePlatform()) return null;
  try {
    const mod = await import("@capacitor/push-notifications");
    const plugin = mod.PushNotifications as unknown as PushPlugin;
    handle = { plugin }; // objeto comum: sem propriedade `then`
    return handle;
  } catch (e) {
    emit({ error: `Plugin de push indisponível: ${e instanceof Error ? e.message : String(e)}` });
    return null;
  }
}

function permissionOf(v: string | undefined): PushPermission {
  if (v === "granted") return "granted";
  if (v === "denied") return "denied";
  if (v === "prompt" || v === "prompt-with-rationale") return "prompt";
  return "unknown";
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

let registrationWaiters: Array<(r: { token?: string; error?: string }) => void> = [];
function settleRegistration(r: { token?: string; error?: string }) {
  const w = registrationWaiters;
  registrationWaiters = [];
  for (const f of w) f(r);
}

/**
 * Prepara os listeners do plugin SEM pedir permissao nem registrar o aparelho.
 * Pode rodar na montagem (nativo). Idempotente. Le o estado atual da permissao
 * (checkPermissions nao abre dialogo).
 */
export async function preparePushListeners(): Promise<PushStatus> {
  const h = await loadPushPlugin();
  if (!h) {
    emit({ supported: false, listenersReady: false });
    return status;
  }
  emit({ supported: true });
  if (listenersAttached) return status;
  try {
    await h.plugin.addListener("registration", (t) => {
      const token = (t as { value?: string })?.value ?? "";
      settleRegistration({ token });
    });
    await h.plugin.addListener("registrationError", (e) => {
      const msg =
        typeof e === "object" && e && "error" in e
          ? String((e as { error: unknown }).error)
          : JSON.stringify(e);
      settleRegistration({ error: msg });
    });
    await h.plugin.addListener(
      "pushNotificationReceived",
      (n) => void handleIncomingPush((n as { data?: Record<string, unknown> }).data),
    );
    await h.plugin.addListener(
      "pushNotificationActionPerformed",
      (a) =>
        void handleIncomingPush(
          (a as { notification?: { data?: Record<string, unknown> } }).notification?.data,
        ),
    );
    listenersAttached = true;
    emit({ listenersReady: true, error: null });
  } catch (e) {
    emit({ listenersReady: false, error: e instanceof Error ? e.message : String(e) });
    return status;
  }
  try {
    const p = await h.plugin.checkPermissions();
    emit({ permission: permissionOf(p?.receive) });
  } catch {
    /* estado desconhecido: sem dialogo */
  }
  return status;
}

/**
 * ACAO EXPLICITA do motorista ("Ativar notificacoes da viagem"), depois da
 * explicacao contextual: pede POST_NOTIFICATIONS, registra no FCM e grava o
 * aparelho SOMENTE com token valido. Negar => estado normal (permission=denied),
 * push_devices continua 0. Sem FCM configurado => erro controlado, sem loop.
 */
export function enablePush(): Promise<PushStatus> {
  if (enabling) return enabling;
  enabling = doEnablePush()
    .then(() => status) // estado final (apos busy=false)
    .finally(() => {
      enabling = null;
    });
  return enabling;
}

async function doEnablePush(): Promise<PushStatus> {
  emit({ busy: true, error: null });
  try {
    await preparePushListeners();
    const h = handle;
    if (!h || !status.listenersReady) {
      emit({
        error:
          status.error ??
          (isNativePlatform() ? "Plugin de push não disponível nesta build." : null),
      });
      return status;
    }
    let perm: PushPermission = "unknown";
    try {
      const r = await h.plugin.requestPermissions();
      perm = permissionOf(r?.receive);
    } catch (e) {
      emit({
        error: `Não foi possível pedir a permissão: ${e instanceof Error ? e.message : String(e)}`,
      });
      return status;
    }
    emit({ permission: perm, attempt: perm === "granted" ? "granted" : "not_granted" });
    if (perm !== "granted") {
      // negar (ou qualquer estado nao concedido) e normal e recuperavel: sem loop, sem push_device
      emit({ registered: false, token: null, error: null });
      return status;
    }
    const result = await new Promise<{ token?: string; error?: string }>((resolve) => {
      const timer = setTimeout(
        () => resolve({ error: "Tempo esgotado ao registrar no serviço de push." }),
        20_000,
      );
      registrationWaiters.push((r) => {
        clearTimeout(timer);
        resolve(r);
      });
      h.plugin.register().catch((e: unknown) => {
        clearTimeout(timer);
        settleRegistration({ error: e instanceof Error ? e.message : String(e) });
      });
    });
    if (result.error || !result.token || result.token.length < 20) {
      // sem FCM/google-services (homolog) ou token invalido: indisponivel, sem linha parcial
      emit({
        registered: false,
        token: null,
        error: result.error
          ? `Push indisponível neste aparelho/build: ${result.error}`
          : "Push indisponível: o serviço não devolveu um token válido.",
      });
      return status;
    }
    try {
      await rpcRegisterPushDevice(
        getDeviceId(),
        platformName(),
        result.token,
        await resolveAppVersion(),
        appBuild(),
      );
      emit({ registered: true, token: result.token, error: null });
    } catch (e) {
      emit({
        registered: false,
        token: result.token,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return status;
  } finally {
    emit({ busy: false });
  }
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

/** Somente para testes: zera o estado do modulo. */
export function __resetPushForTests() {
  handle = null;
  listenersAttached = false;
  enabling = null;
  registrationWaiters = [];
  status = {
    supported: false,
    registered: false,
    token: null,
    permission: "unknown",
    listenersReady: false,
    busy: false,
    attempt: null,
    error: null,
    lastAck: null,
  };
}
