// Identidade tecnica do aparelho para o Modulo 3: um uuid gerado localmente
// (NUNCA IMEI, numero de telefone ou id de publicidade), estavel entre sessoes.
// E o "device_id" das sessoes de rastreamento, dos comandos offline e do push.
import { Capacitor } from "@capacitor/core";

const KEY = "steelgo.device_id";

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platformName(): "android" | "ios" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : "web";
  } catch {
    return "web";
  }
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "00000000-0000-4000-8000-000000000000";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function appVersion(): string {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "web-dev";
}

export function appBuild(): string {
  return (
    (import.meta.env.VITE_APP_BUILD as string | undefined) ?? import.meta.env.MODE ?? "development"
  );
}
