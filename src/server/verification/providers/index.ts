/**
 * Fábrica de providers, dirigida por VERIFICATION_PROVIDER_MODE.
 *
 * Guarda-trilho central: em produção, modo `fake` aborta o processo de
 * inicialização da verificação. É o que impede que um deploy com a variável
 * errada aprove motorista sem consultar ninguém.
 */

import { FakeGCCProvider, type GCCProvider } from "./gcc.provider";
import {
  DatavalidSerproProvider,
  FakeDatavalidProvider,
  type DatavalidProvider,
  type DatavalidSerproConfig,
} from "./datavalid.provider";
import { FakeSenatranProvider, type SenatranProvider } from "./senatran.provider";

export type VerificationProviderMode = "fake" | "sandbox" | "production";

export interface VerificationProviders {
  mode: VerificationProviderMode;
  gcc: GCCProvider;
  datavalid: DatavalidProvider;
  /** null enquanto a Consulta Online SENATRAN não estiver contratada. */
  senatran: SenatranProvider | null;
}

function readMode(env: NodeJS.ProcessEnv): VerificationProviderMode {
  const raw = (env.VERIFICATION_PROVIDER_MODE ?? "").trim().toLowerCase();
  if (raw === "fake" || raw === "sandbox" || raw === "production") return raw;
  throw new Error(
    "VERIFICATION_PROVIDER_MODE ausente ou inválido. Use: fake | sandbox | production.",
  );
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

export function buildVerificationProviders(
  env: NodeJS.ProcessEnv = process.env,
): VerificationProviders {
  const mode = readMode(env);
  const isProdRuntime = (env.NODE_ENV ?? "") === "production" || (env.VERCEL_ENV ?? "") === "production";

  if (mode === "fake" && isProdRuntime) {
    throw new Error(
      "VERIFICATION_PROVIDER_MODE=fake é proibido em produção. " +
        "Providers falsos aprovariam motoristas sem consulta real.",
    );
  }

  if (mode === "fake") {
    return {
      mode,
      gcc: new FakeGCCProvider("granted"),
      datavalid: new FakeDatavalidProvider("match_high"),
      senatran: null,
    };
  }

  // sandbox e production compartilham a mesma estrutura; mudam só as URLs
  // e credenciais, que vêm exclusivamente do ambiente server-side.
  const datavalidConfig: DatavalidSerproConfig = {
    baseUrl: requireEnv(env, "DATAVALID_BASE_URL"),
    clientId: requireEnv(env, "DATAVALID_CLIENT_ID"),
    clientSecret: requireEnv(env, "DATAVALID_CLIENT_SECRET"),
    rfbTemplateId: requireEnv(env, "DATAVALID_RFB_TEMPLATE_ID"),
    timeoutMs: Number(env.DATAVALID_TIMEOUT_MS ?? 10000),
  };

  return {
    mode,
    // TODO(GCC-REAL): trocar por GccHttpProvider quando a GCC for contratada.
    gcc: new FakeGCCProvider("granted"),
    datavalid: new DatavalidSerproProvider(datavalidConfig),
    // TODO(SENATRAN-REAL): instanciar quando a Consulta Online for contratada.
    senatran: null,
  };
}

export type { GCCProvider, DatavalidProvider, SenatranProvider };
export { FakeGCCProvider, FakeDatavalidProvider, FakeSenatranProvider, DatavalidSerproProvider };
