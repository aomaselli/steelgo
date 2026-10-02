/**
 * Fábrica de provedores de pedágio, dirigida por TOLL_PROVIDER_MODE.
 *
 * Mesma trava da verificação de motorista: em produção, modo `fake` ABORTA a
 * inicialização. É o que impede que um deploy com a variável errada cote
 * pedágio simulado e o valor entre numa proposta real.
 *
 * Credenciais vivem só aqui, no servidor. Nada disto chega ao navegador.
 */

import type { TollProvider, TollProviderMode } from "../types";
import { SimulatedTollProvider } from "./simulated.provider";

export interface TollProviders {
  mode: TollProviderMode;
  provider: TollProvider;
}

function readMode(env: NodeJS.ProcessEnv): TollProviderMode {
  const raw = (env.TOLL_PROVIDER_MODE ?? "").trim().toLowerCase();
  if (raw === "fake" || raw === "sandbox" || raw === "production") return raw;
  throw new Error("TOLL_PROVIDER_MODE ausente ou inválido. Use: fake | sandbox | production.");
}

export function buildTollProviders(env: NodeJS.ProcessEnv = process.env): TollProviders {
  const mode = readMode(env);
  const isProdRuntime =
    (env.NODE_ENV ?? "") === "production" || (env.VERCEL_ENV ?? "") === "production";

  if (mode === "fake" && isProdRuntime) {
    throw new Error(
      "TOLL_PROVIDER_MODE=fake é proibido em produção. " +
        "Pedágio simulado entraria em proposta e contrato como se fosse apurado.",
    );
  }

  if (mode === "fake") {
    return { mode, provider: new SimulatedTollProvider() };
  }

  // sandbox e production: nenhum provedor real implementado ainda. Falhar aqui
  // é melhor que devolver simulação com outro rótulo.
  //
  // TODO(QUALP): instanciar QualpTollProvider quando a assinatura existir.
  //   Exige QUALP_API_BASE_URL e QUALP_API_TOKEN.
  // TODO(AILOG): instanciar AilogTollProvider quando o contrato existir.
  //   Exige AILOG_API_BASE_URL, AILOG_CLIENT_ID e AILOG_CLIENT_SECRET.
  throw new Error(
    `TOLL_PROVIDER_MODE=${mode} exige um provedor contratado. ` +
      "Nenhum está implementado: ver docs/produto/pedagio-integracao.md.",
  );
}

export { SimulatedTollProvider };
