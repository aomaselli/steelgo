// pushClient: o loader nunca provoca acesso a `.then` do Proxy do Capacitor;
// nenhum requestPermissions na preparacao; permissao so em enablePush (acao
// explicita); negar e normal; sem FCM o registro falha de forma controlada e
// nenhum push_device e gravado; token valido -> uma unica RPC.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Proxy fiel ao registerPlugin do Capacitor: qualquer propriedade vira uma
// funcao que chama o "nativo"; `then` nao esta implementado -> rejeita.
const native: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
const thenAccess = vi.fn();
const listenersByEvent: Record<string, Array<(x: unknown) => void>> = {};
function makeCapacitorProxy() {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") thenAccess();
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          if (prop === "addListener") {
            const [ev, cb] = args as [string, (x: unknown) => void];
            (listenersByEvent[ev] ??= []).push(cb);
            return Promise.resolve({ remove: () => undefined });
          }
          const impl = native[prop];
          if (!impl)
            return Promise.reject(
              new Error(`"PushNotifications.${prop}()" is not implemented on android`),
            );
          return impl(...args);
        };
      },
    },
  );
}
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: makeCapacitorProxy() }));
vi.mock("@/lib/device", () => ({
  isNativePlatform: () => true,
  getDeviceId: () => "00000000-0000-4000-8000-0000000000d1",
  platformName: () => "android",
  appVersion: () => "1.0-homolog",
  appBuild: () => "1",
}));
const rpcRegisterPushDevice = vi.fn(async () => ({}));
vi.mock("@/lib/trips", () => ({
  rpcRegisterPushDevice: (...a: unknown[]) => rpcRegisterPushDevice(...(a as [])),
  rpcAckPushHomologation: vi.fn(),
  rpcRequestPushHomologation: vi.fn(),
  rpcRevokePushDevice: vi.fn(async () => ({})),
}));

type Push = typeof import("./pushClient");
let push: Push;
const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(native)) delete native[k];
  for (const k of Object.keys(listenersByEvent)) delete listenersByEvent[k];
  thenAccess.mockClear();
  rpcRegisterPushDevice.mockClear();
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  native.checkPermissions = async () => ({ receive: "prompt" });
  push = await import("./pushClient");
  push.__resetPushForTests();
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("loader do plugin", () => {
  it("loadPushPlugin resolve um wrapper { plugin } e NUNCA le `.then` do Proxy", async () => {
    const h = await push.loadPushPlugin();
    expect(h).not.toBeNull();
    expect(Object.keys(h!)).toEqual(["plugin"]);
    expect("then" in (h as object)).toBe(false);
    expect(thenAccess).not.toHaveBeenCalled();
    await flush();
    expect(unhandled).toHaveLength(0);
  });
});

describe("montagem: preparar listeners sem pedir permissao", () => {
  it("preparePushListeners -> 4 listeners, checkPermissions, ZERO requestPermissions/register/RPC", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => undefined);
    const s = await push.preparePushListeners();
    expect(s.listenersReady).toBe(true);
    expect(s.permission).toBe("prompt");
    expect(Object.keys(listenersByEvent).sort()).toEqual([
      "pushNotificationActionPerformed",
      "pushNotificationReceived",
      "registration",
      "registrationError",
    ]);
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(native.register).not.toHaveBeenCalled();
    expect(rpcRegisterPushDevice).not.toHaveBeenCalled();
    await push.preparePushListeners(); // idempotente
    expect(listenersByEvent.registration).toHaveLength(1);
    expect(thenAccess).not.toHaveBeenCalled();
    expect(unhandled).toHaveLength(0);
  });
});

describe("enablePush (acao explicita)", () => {
  it("negar -> permission=denied, sem register, sem RPC, estado recuperavel", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "denied" }));
    native.register = vi.fn(async () => undefined);
    const s = await push.enablePush();
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(s).toMatchObject({ permission: "denied", registered: false, error: null, busy: false });
    expect(native.register).not.toHaveBeenCalled();
    expect(rpcRegisterPushDevice).not.toHaveBeenCalled();
    // tentar de novo e permitido
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => {
      listenersByEvent.registration?.forEach((cb) => cb({ value: "tok_" + "x".repeat(40) }));
    });
    const s2 = await push.enablePush();
    expect(s2.registered).toBe(true);
    expect(rpcRegisterPushDevice).toHaveBeenCalledTimes(1);
  });

  it("conceder + token valido -> register uma vez, RPC uma vez com o token", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => {
      listenersByEvent.registration?.forEach((cb) => cb({ value: "tok_" + "y".repeat(40) }));
    });
    const s = await push.enablePush();
    expect(s).toMatchObject({ registered: true, permission: "granted", error: null });
    expect(rpcRegisterPushDevice).toHaveBeenCalledTimes(1);
    expect((rpcRegisterPushDevice.mock.calls[0] as unknown[])[2]).toBe("tok_" + "y".repeat(40));
  });

  it("homolog sem FCM: registrationError -> erro controlado, sem RPC, sem rejeicao nao tratada, sem loop", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => {
      listenersByEvent.registrationError?.forEach((cb) =>
        cb({ error: "Default FirebaseApp is not initialized" }),
      );
    });
    const s = await push.enablePush();
    expect(s.registered).toBe(false);
    expect(s.error).toMatch(/FirebaseApp/);
    expect(rpcRegisterPushDevice).not.toHaveBeenCalled();
    expect(native.register).toHaveBeenCalledTimes(1);
    await flush();
    expect(unhandled).toHaveLength(0);
  });

  it("register() rejeita (plugin/nativo) -> erro controlado, sem RPC", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => {
      throw new Error("FCM not configured");
    });
    const s = await push.enablePush();
    expect(s.registered).toBe(false);
    expect(s.error).toMatch(/FCM not configured/);
    expect(rpcRegisterPushDevice).not.toHaveBeenCalled();
    await flush();
    expect(unhandled).toHaveLength(0);
  });

  it("token curto/invalido -> nao grava push_device", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => {
      listenersByEvent.registration?.forEach((cb) => cb({ value: "curto" }));
    });
    const s = await push.enablePush();
    expect(s.registered).toBe(false);
    expect(rpcRegisterPushDevice).not.toHaveBeenCalled();
  });

  it("dois cliques -> uma unica solicitacao em voo", async () => {
    let release: (v: { receive: string }) => void = () => undefined;
    native.requestPermissions = vi.fn(() => new Promise<{ receive: string }>((r) => (release = r)));
    const p1 = push.enablePush();
    const p2 = push.enablePush();
    expect(p2).toBe(p1);
    await flush();
    release({ receive: "denied" });
    await Promise.all([p1, p2]);
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe("enablePush — estado nao concedido distinto de nao solicitado", () => {
  it("antes de qualquer tentativa: attempt=null; apos negar: attempt=not_granted, sem prompt novo", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "denied" }));
    native.register = vi.fn(async () => undefined);
    expect(push.getPushStatus().attempt).toBeNull();
    await push.preparePushListeners();
    expect(push.getPushStatus().attempt).toBeNull(); // preparar nao e tentativa
    const s = await push.enablePush();
    expect(s.attempt).toBe("not_granted");
    expect(s.registered).toBe(false);
    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(rpcRegisterPushDevice).not.toHaveBeenCalled();
  });

  it("Android/Capacitor devolvendo 'prompt' ou estado desconhecido apos a tentativa -> not_granted (nunca granted)", async () => {
    native.register = vi.fn(async () => undefined);
    for (const receive of ["prompt", "prompt-with-rationale", "weird"]) {
      push.__resetPushForTests();
      native.requestPermissions = vi.fn(async () => ({ receive }));
      const s = await push.enablePush();
      expect(s.attempt).toBe("not_granted");
      expect(s.permission).not.toBe("granted");
      expect(native.register).not.toHaveBeenCalled();
    }
  });

  it("granted somente quando efetivamente concedido", async () => {
    native.requestPermissions = vi.fn(async () => ({ receive: "granted" }));
    native.register = vi.fn(async () => {
      listenersByEvent.registration?.forEach((cb) => cb({ value: "tok_" + "z".repeat(40) }));
    });
    const s = await push.enablePush();
    expect(s.attempt).toBe("granted");
    expect(s.registered).toBe(true);
  });
});
