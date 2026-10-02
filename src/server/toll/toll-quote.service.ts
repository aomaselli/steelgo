/**
 * Serviço de cotação de pedágio.
 *
 * Responsabilidades, nesta ordem:
 *   1. recusar corredor sem cobertura verificada;
 *   2. impedir consulta duplicada (mesma pergunta não vira duas chamadas pagas);
 *   3. consultar o provedor com prazo limitado;
 *   4. validar a resposta — resposta incompleta NÃO vira valor;
 *   5. dizer quando uma mudança exige recálculo.
 *
 * Nada aqui conhece steel_type: serve ao aço e às demais cargas.
 */

import type {
  CountryCode,
  ProviderOutcome,
  TollFailure,
  TollProvider,
  TollQuote,
  TollQuotePublicResult,
  TollQuoteRequest,
} from "./types";

// -----------------------------------------------------------------------------
// 1. Cobertura por corredor
// -----------------------------------------------------------------------------
// A estrutura é multipaís desde já, mas cada corredor só é liberado com
// cobertura CONFERIDA contra tarifa oficial. Enquanto não houver essa
// conferência, o corredor fica fora e a cotação é recusada em vez de devolver
// número sem lastro.
export interface CorridorCoverage {
  from: CountryCode;
  to: CountryCode;
  /** Data da conferência contra tarifa oficial. Nulo = não conferido. */
  verifiedAt: string | null;
  /** Observação da conferência, para auditoria. */
  note?: string;
}

/**
 * Nenhum corredor está liberado ainda. A primeira liberação depende da
 * validação com API real e tarifa oficial nos corredores do piloto — simulação
 * não libera corredor.
 */
export const CORRIDOR_COVERAGE: readonly CorridorCoverage[] = [
  { from: "BR", to: "BR", verifiedAt: null, note: "aguarda conferência com tarifa oficial" },
];

export function isCorridorCovered(
  from: CountryCode,
  to: CountryCode,
  coverage: readonly CorridorCoverage[] = CORRIDOR_COVERAGE,
): boolean {
  return coverage.some((c) => c.from === from && c.to === to && c.verifiedAt !== null);
}

/** Países tocados pela rota, na ordem. */
export function routeCountries(request: TollQuoteRequest): CountryCode[] {
  return [
    request.origin.countryCode,
    ...request.waypoints.map((w) => w.countryCode),
    request.destination.countryCode,
  ];
}

// -----------------------------------------------------------------------------
// 2. Chave de deduplicação
// -----------------------------------------------------------------------------
// Mesma pergunta = mesma chave. Arredondar coordenada a 5 casas (~1 m) evita
// que ruído de GPS gere consultas distintas para a mesma rota.
function round5(n: number): string {
  return n.toFixed(5);
}

export function quoteKey(request: TollQuoteRequest): string {
  const pts = [request.origin, ...request.waypoints, request.destination]
    .map((p) => `${round5(p.lat)},${round5(p.lng)},${p.countryCode}`)
    .join("|");
  const v = request.vehicle;
  return [
    pts,
    `axles=${v.axleCount}`,
    `type=${v.truckType}`,
    `raised=${v.raisedAxles ?? "na"}`,
    `date=${request.referenceDate}`,
    `cur=${request.currency}`,
  ].join(";");
}

// -----------------------------------------------------------------------------
// 3. Quando uma mudança exige novo cálculo
// -----------------------------------------------------------------------------
export type RecalculationReason =
  | "rota_alterada"
  | "configuracao_veicular_alterada"
  | "data_de_referencia_alterada"
  | "moeda_alterada"
  | "cotacao_expirada";

/**
 * Compara a cotação guardada com a pergunta atual. Devolve os motivos pelos
 * quais ela não serve mais. Lista vazia = a cotação continua válida.
 */
export function recalculationReasons(
  previousRequest: TollQuoteRequest,
  previousQuote: Pick<TollQuote, "validUntil">,
  currentRequest: TollQuoteRequest,
  now: Date = new Date(),
): RecalculationReason[] {
  const reasons: RecalculationReason[] = [];

  const pts = (r: TollQuoteRequest) =>
    [r.origin, ...r.waypoints, r.destination]
      .map((p) => `${round5(p.lat)},${round5(p.lng)}`)
      .join("|");
  if (pts(previousRequest) !== pts(currentRequest)) reasons.push("rota_alterada");

  const veh = (r: TollQuoteRequest) =>
    `${r.vehicle.axleCount}/${r.vehicle.truckType}/${r.vehicle.raisedAxles ?? "na"}`;
  if (veh(previousRequest) !== veh(currentRequest)) {
    reasons.push("configuracao_veicular_alterada");
  }

  if (previousRequest.referenceDate !== currentRequest.referenceDate) {
    reasons.push("data_de_referencia_alterada");
  }
  if (previousRequest.currency !== currentRequest.currency) reasons.push("moeda_alterada");

  if (previousQuote.validUntil !== null && new Date(previousQuote.validUntil) <= now) {
    reasons.push("cotacao_expirada");
  }

  return reasons;
}

// -----------------------------------------------------------------------------
// 4. Validação da resposta do provedor
// -----------------------------------------------------------------------------
/**
 * Resposta incompleta não vira valor. Em particular, total ausente NÃO é zero:
 * vira falha `incomplete`.
 */
export function validateQuote(quote: TollQuote): ProviderOutcome<TollQuote> {
  const fail = (detail: string): ProviderOutcome<TollQuote> => ({
    ok: false,
    failure: { kind: "incomplete", detail, provider: quote.provider },
  });

  if (!quote.toll.known) {
    return fail("provedor não informou o valor do pedágio");
  }
  // Captura o valor ja estreitado: dentro de callback o TypeScript perde a
  // narrowing de `quote.toll`.
  const total = quote.toll;

  if (!Number.isFinite(total.amount) || total.amount < 0) {
    return fail(`valor de pedágio inválido: ${String(total.amount)}`);
  }
  if (!total.currency) {
    return fail("valor sem moeda");
  }

  // Soma das praças, quando o provedor afirma detalhamento completo, tem de
  // bater com o total. Divergência é resposta inconsistente, não arredondamento
  // a ignorar.
  if (quote.plazasComplete && quote.plazas.length > 0) {
    const soma = quote.plazas.reduce((a, p) => a + p.amount, 0);
    if (Math.abs(soma - total.amount) > 0.01) {
      return fail(
        `soma das praças (${soma.toFixed(2)}) difere do total (${total.amount.toFixed(2)})`,
      );
    }
    const moedaDiferente = quote.plazas.find((p) => p.currency !== total.currency);
    if (moedaDiferente) {
      return fail(`praça em moeda diferente do total: ${moedaDiferente.currency}`);
    }
  }

  return { ok: true, value: quote };
}

// -----------------------------------------------------------------------------
// 5. Orquestração
// -----------------------------------------------------------------------------
export interface TollQuoteCache {
  get(key: string): TollQuote | undefined;
  set(key: string, quote: TollQuote): void;
}

export class InMemoryTollQuoteCache implements TollQuoteCache {
  private readonly store = new Map<string, TollQuote>();
  get(key: string) {
    return this.store.get(key);
  }
  set(key: string, quote: TollQuote) {
    this.store.set(key, quote);
  }
}

export interface QuoteTollOptions {
  provider: TollProvider;
  cache?: TollQuoteCache;
  /** Chamadas em voo, para que duplo clique não gere duas consultas pagas. */
  inFlight?: Map<string, Promise<ProviderOutcome<TollQuote>>>;
  coverage?: readonly CorridorCoverage[];
  timeoutMs?: number;
  now?: () => Date;
}

function failure(kind: TollFailure["kind"], detail: string, provider: TollProvider): TollFailure {
  return { kind, detail, provider: provider.id };
}

export async function quoteToll(
  request: TollQuoteRequest,
  options: QuoteTollOptions,
): Promise<ProviderOutcome<TollQuote>> {
  const { provider } = options;
  const cache = options.cache;
  const inFlight = options.inFlight;
  const coverage = options.coverage ?? CORRIDOR_COVERAGE;
  const now = options.now ?? (() => new Date());

  // Eixos são obrigatórios: sem eles não existe tarifa, e supor um padrão
  // produziria número errado com aparência de certo.
  if (!Number.isInteger(request.vehicle.axleCount) || request.vehicle.axleCount <= 0) {
    return {
      ok: false,
      failure: failure(
        "incomplete",
        `quantidade de eixos ausente ou inválida: ${String(request.vehicle.axleCount)}`,
        provider,
      ),
    };
  }

  // Cobertura por corredor, par a par ao longo da rota.
  const countries = routeCountries(request);
  for (let i = 0; i < countries.length - 1; i++) {
    const de = countries[i];
    const para = countries[i + 1];
    if (de === para && isCorridorCovered(de, para, coverage)) continue;
    if (de !== para && isCorridorCovered(de, para, coverage)) continue;
    return {
      ok: false,
      failure: failure(
        "unsupported_corridor",
        `corredor ${de}->${para} sem cobertura verificada`,
        provider,
      ),
    };
  }

  const key = quoteKey(request);

  const guardado = cache?.get(key);
  if (guardado) {
    const motivos = recalculationReasons(request, guardado, request, now());
    if (motivos.length === 0) return { ok: true, value: guardado };
  }

  const emVoo = inFlight?.get(key);
  if (emVoo) return emVoo;

  const chamada = (async (): Promise<ProviderOutcome<TollQuote>> => {
    let resultado: ProviderOutcome<TollQuote>;
    try {
      resultado = await withTimeout(provider.quote(request), options.timeoutMs ?? 10_000, provider);
    } catch (e) {
      return {
        ok: false,
        failure: failure("unavailable", e instanceof Error ? e.message : String(e), provider),
      };
    }
    if (!resultado.ok) return resultado;

    const validado = validateQuote(resultado.value);
    if (!validado.ok) return validado;

    cache?.set(key, validado.value);
    return validado;
  })();

  inFlight?.set(key, chamada);
  try {
    return await chamada;
  } finally {
    inFlight?.delete(key);
  }
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  provider: TollProvider,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout de ${ms}ms consultando ${provider.id}`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, limite]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Converte para o que o navegador pode ver. Sem payload, sem credencial. */
export function toPublicResult(
  outcome: ProviderOutcome<TollQuote>,
  provider: TollProvider,
): TollQuotePublicResult {
  if (!outcome.ok) {
    return {
      status: "unavailable",
      provider: outcome.failure.provider,
      toll: { known: false, reason: outcome.failure.kind },
      plazaCount: 0,
      plazasComplete: false,
      validUntil: null,
      reason: outcome.failure.kind,
    };
  }
  const q = outcome.value;
  return {
    status: "quoted",
    provider: q.provider,
    toll: q.toll,
    plazaCount: q.plazas.length,
    plazasComplete: q.plazasComplete,
    validUntil: q.validUntil,
  };
}
