/**
 * Fábrica de providers, dirigida por VERIFICATION_PROVIDER_MODE.
 *
 * DUAS BARREIRAS, não uma.
 *
 * A primeira sempre existiu: modo `fake` em runtime de produção aborta. Ela
 * barra o MODO.
 *
 * A segunda é nova, e existe porque a primeira não bastava: nos modos
 * `sandbox` e `production` a própria fábrica devolvia
 * `gcc: new FakeGCCProvider("granted")` e `senatran: null`. Um fake EMBUTIDO
 * no modo real passava pela primeira barreira sem encostar nela — em produção,
 * a autorização da GCC seria falsamente concedida. Nada aprovava ninguém
 * apenas porque o Datavalid real recusa com `NOT_IMPLEMENTED` antes de a GCC
 * falsa importar; era ordem de implementação, não garantia.
 *
 * Agora todo provider se declara (`simulated`), e modo de integração real
 * recusa qualquer um que seja simulado. A consequência é deliberada: enquanto
 * a GCC não for real, `sandbox` e `production` **não inicializam**. Falhar na
 * partida é o comportamento correto — o contrário é subir um verificador que
 * não verifica.
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

/** Modos em que nenhum provider simulado é aceito. */
export const MODOS_INTEGRACAO_REAL: readonly VerificationProviderMode[] = ["sandbox", "production"];

export interface VerificationProviders {
  mode: VerificationProviderMode;
  gcc: GCCProvider;
  datavalid: DatavalidProvider;
  /** null enquanto a fonte de habilitação não estiver contratada. */
  senatran: SenatranProvider | null;
}

export class SimulatedProviderInRealModeError extends Error {
  readonly slot: string;
  constructor(slot: string, mode: VerificationProviderMode, detalhe: string) {
    super(
      `Provider simulado no slot "${slot}" com VERIFICATION_PROVIDER_MODE=${mode}. ` +
        `${detalhe} Um provider falso em modo de integração real aprovaria ` +
        `motorista sem consulta verdadeira.`,
    );
    this.name = "SimulatedProviderInRealModeError";
    this.slot = slot;
  }
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

/**
 * Recusa provider simulado em modo de integração real.
 *
 * Duas conferências, porque cada uma é frágil de um jeito diferente:
 *
 *  - `simulated === true` é a declaração do próprio provider. Está na
 *    interface, então provider novo é obrigado a declarar — mas um fake pode
 *    mentir, por descuido ou por copiar e colar.
 *  - o nome do construtor começando por `Fake` pega o que mentiu. Não é
 *    sofisticado; é por isso mesmo que funciona para o descuido, que é o caso
 *    real.
 */
export function assertProviderNaoSimulado(
  slot: string,
  provider: { simulated?: boolean } | null | undefined,
  mode: VerificationProviderMode,
): void {
  if (!provider) return;
  if (!MODOS_INTEGRACAO_REAL.includes(mode)) return;

  if (provider.simulated === true) {
    throw new SimulatedProviderInRealModeError(
      slot,
      mode,
      "O provider se declara simulado (`simulated: true`).",
    );
  }

  const construtor = (provider as { constructor?: { name?: string } }).constructor?.name ?? "";
  if (/^Fake/.test(construtor)) {
    throw new SimulatedProviderInRealModeError(
      slot,
      mode,
      `A classe \`${construtor}\` é um fake, ainda que declare \`simulated: ${provider.simulated}\`.`,
    );
  }
}

/** Aplica a barreira a todos os slots de um conjunto já montado. */
export function assertConjuntoNaoSimulado(p: VerificationProviders): VerificationProviders {
  assertProviderNaoSimulado("gcc", p.gcc, p.mode);
  assertProviderNaoSimulado("datavalid", p.datavalid, p.mode);
  assertProviderNaoSimulado("senatran", p.senatran, p.mode);
  return p;
}

export function buildVerificationProviders(
  env: NodeJS.ProcessEnv = process.env,
): VerificationProviders {
  const mode = readMode(env);
  const isProdRuntime = (env.NODE_ENV ?? "") === "production" || (env.VERCEL_ENV ?? "") === "production";

  // Primeira barreira: o MODO.
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
      senatran: new FakeSenatranProvider("valid"),
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

  const conjunto: VerificationProviders = {
    mode,
    // TODO(GCC-REAL): trocar por GccHttpProvider quando a autorização for
    // contratada. Enquanto isto for um fake, a segunda barreira impede sandbox
    // e produção de inicializarem — de propósito.
    // Ver docs/produto/dependencias-por-capacidade.md
    gcc: new FakeGCCProvider("granted"),
    datavalid: new DatavalidSerproProvider(datavalidConfig),
    // TODO(HABILITACAO-REAL): instanciar quando a fonte existir — módulo CNH do
    // Datavalid ou Consulta Online SENATRAN, conforme a análise de capacidade.
    // `null` aqui NÃO significa "pule a habilitação": o motor trata fonte
    // obrigatória ausente como inconclusivo.
    senatran: null,
  };

  // Segunda barreira: os PROVIDERS, inclusive os embutidos acima.
  return assertConjuntoNaoSimulado(conjunto);
}

export type { GCCProvider, DatavalidProvider, SenatranProvider };
export { FakeGCCProvider, FakeDatavalidProvider, FakeSenatranProvider, DatavalidSerproProvider };
