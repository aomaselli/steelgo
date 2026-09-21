// Versao/build REAIS do pacote instalado (Android/iOS) via @capacitor/app, com
// fallback web claramente identificado. Gravado em trip_tracking_sessions.app_version
// e push_devices.app_version - por isso nunca pode ser "web-dev" num APK.
//
// Regras:
//  * resolvido UMA vez (cache + single-flight) ANTES de start_trip_tracking e
//    reutilizado na retomada (start_tracking_session) e no registro de push;
//  * falha ao ler App.getInfo() NAO impede o rastreamento: devolve "native:unknown";
//  * nunca retornar/await-ar o Proxy do plugin (assimilacao de `.then`): so a
//    funcao getInfo() e chamada e o objeto simples devolvido por ela e lido.
import { isNativePlatform } from "@/lib/device";

let cached: string | null = null;
let inflight: Promise<string> | null = null;
let lastError: string | null = null;

/** Formato auditavel: "<version>+<build>" (nativo), "web:<modo>" (navegador) ou "native:unknown" (falha). */
export function formatAppVersion(version: unknown, build: unknown): string {
  const v = String(version ?? "").trim();
  const b = String(build ?? "").trim();
  if (!v) throw new Error("App.getInfo() sem version");
  return b ? `${v}+${b}` : v;
}

export function webFallbackVersion(): string {
  const v = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? import.meta.env.MODE;
  return `web:${v ?? "unknown"}`;
}

export async function resolveAppVersion(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    if (!isNativePlatform()) {
      cached = webFallbackVersion();
      return cached;
    }
    try {
      const mod = await import("@capacitor/app");
      const info = await mod.App.getInfo(); // objeto simples {name, id, build, version}
      cached = formatAppVersion(info?.version, info?.build);
      lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      cached = "native:unknown"; // nao bloqueia o rastreamento; auditavel
    }
    return cached;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Valor ja resolvido (ou marcador explicito se ainda nao resolvido). */
export function appVersionSync(): string {
  return cached ?? (isNativePlatform() ? "native:unresolved" : webFallbackVersion());
}

export function appVersionError(): string | null {
  return lastError;
}

/** Somente para testes. */
export function __resetAppInfoForTests() {
  cached = null;
  inflight = null;
  lastError = null;
}
