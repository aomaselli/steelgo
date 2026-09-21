// app_version auditavel: nativo "<version>+<build>" via @capacitor/app; web
// "web:<modo>"; erro do plugin => "native:unknown" (nao bloqueia); nunca le
// `.then` do Proxy do plugin; resolvido uma vez (cache/single-flight).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let native = true;
vi.mock("@/lib/device", () => ({
  isNativePlatform: () => native,
  getDeviceId: () => "d",
  platformName: () => "android",
  appVersion: () => "web-dev",
  appBuild: () => "development",
}));

const thenAccess = vi.fn();
let getInfoImpl: () => Promise<unknown> = async () => ({
  name: "SteelGo HOMOLOG",
  id: "com.steelgo.app.homolog",
  version: "1.0-homolog",
  build: "1",
});
const getInfo = vi.fn(() => getInfoImpl());
vi.mock("@capacitor/app", () => ({
  App: new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") thenAccess();
        if (prop === "getInfo") return getInfo;
        if (typeof prop !== "string") return undefined;
        return () => Promise.reject(new Error(`"App.${prop}()" is not implemented on android`));
      },
    },
  ),
}));

type Mod = typeof import("./appInfo");
let mod: Mod;
beforeEach(async () => {
  vi.resetModules();
  native = true;
  thenAccess.mockClear();
  getInfo.mockClear();
  getInfoImpl = async () => ({
    name: "SteelGo HOMOLOG",
    id: "com.steelgo.app.homolog",
    version: "1.0-homolog",
    build: "1",
  });
  mod = await import("./appInfo");
  mod.__resetAppInfoForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe("resolveAppVersion", () => {
  it("nativo: versao+build reais do pacote, resolvido uma vez e reutilizado", async () => {
    const [a, b] = await Promise.all([mod.resolveAppVersion(), mod.resolveAppVersion()]);
    expect(a).toBe("1.0-homolog+1");
    expect(b).toBe(a);
    expect(await mod.resolveAppVersion()).toBe("1.0-homolog+1");
    expect(getInfo).toHaveBeenCalledTimes(1); // cache + single-flight
    expect(mod.appVersionSync()).toBe("1.0-homolog+1");
    expect(a).not.toMatch(/web-dev/);
  });

  it("nativo sem build -> so a versao; APK normal usa a sua versao nativa", async () => {
    getInfoImpl = async () => ({ version: "1.0", build: "" });
    expect(await mod.resolveAppVersion()).toBe("1.0");
  });

  it("web: fallback claramente identificado, sem tocar no plugin", async () => {
    native = false;
    vi.stubEnv("MODE", "test");
    expect(await mod.resolveAppVersion()).toMatch(/^web:/);
    expect(getInfo).not.toHaveBeenCalled();
  });

  it("erro do plugin -> 'native:unknown', nao lanca (rastreamento segue), erro auditavel", async () => {
    getInfoImpl = async () => {
      throw new Error("App.getInfo() is not implemented");
    };
    expect(await mod.resolveAppVersion()).toBe("native:unknown");
    expect(mod.appVersionError()).toMatch(/not implemented/);
  });

  it("versao vazia -> tratado como erro controlado", async () => {
    getInfoImpl = async () => ({ version: "", build: "7" });
    expect(await mod.resolveAppVersion()).toBe("native:unknown");
  });

  it("nunca le `.then` do Proxy do plugin (sem assimilacao de Promise)", async () => {
    await mod.resolveAppVersion();
    expect(thenAccess).not.toHaveBeenCalled();
  });

  it("antes de resolver, o valor sincrono e um marcador explicito (nunca 'web-dev' em nativo)", () => {
    expect(mod.appVersionSync()).toBe("native:unresolved");
  });
});
