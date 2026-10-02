/**
 * Tipos da cotação de pedágio.
 *
 * Espelha o desenho já usado em src/server/verification: resultado de provedor
 * é `ProviderOutcome`, que NUNCA colapsa falha em valor, e "desconhecido" é um
 * estado próprio — jamais zero.
 *
 * Serve ao aço e a qualquer outra carga: nada aqui depende de steel_type.
 */

/** Moeda ISO-4217. A estrutura é multimoeda desde já. */
export type CurrencyCode = string;

/** País ISO-3166-1 alfa-2. */
export type CountryCode = string;

export type TollProviderId = "simulated" | "qualp" | "ailog";

export type TollProviderMode = "fake" | "sandbox" | "production";

export type TollFailureKind =
  | "unavailable" // provedor fora do ar, timeout, 5xx
  | "rejected" // provedor respondeu, mas recusou a requisição (4xx)
  | "incomplete" // respondeu sem os campos obrigatórios
  | "unsupported_corridor" // corredor sem cobertura verificada
  | "misconfigured"; // credencial/ambiente ausente

export interface TollFailure {
  kind: TollFailureKind;
  /** Mensagem interna, nunca exposta ao navegador sem revisão. */
  detail: string;
  provider: TollProviderId;
}

export type ProviderOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; failure: TollFailure };

/**
 * Valor de pedágio.
 *
 * REGRA CENTRAL: valor desconhecido NUNCA vira zero. Zero é um valor legítimo
 * (rota sem praça de pedágio) e precisa ser distinguível de "não foi possível
 * apurar". Por isso duas formas, e nenhuma função deve devolver `0` como
 * substituto de falha.
 */
export type TollAmount =
  | { known: true; amount: number; currency: CurrencyCode }
  | { known: false; reason: TollFailureKind };

/** Praça de pedágio individual, quando o provedor detalha. */
export interface TollPlaza {
  name: string;
  /** Concessionária, quando informada. */
  concessionaire?: string;
  countryCode: CountryCode;
  amount: number;
  currency: CurrencyCode;
  /** Cobrança sem cancela (Free Flow), quando o provedor identifica. */
  freeFlow?: boolean;
  /** Coordenadas, quando informadas. */
  lat?: number;
  lng?: number;
}

/** Configuração do conjunto veicular que determina a tarifa. */
export interface VehicleConfiguration {
  /**
   * Quantidade de eixos do conjunto. É o parâmetro que define a tarifa no
   * Brasil. Obrigatório: sem ele não há cotação, e não se chuta um padrão.
   */
  axleCount: number;
  /** Tipo do veículo no vocabulário da SteelGo (enum truck_type). */
  truckType: string;
  /**
   * Eixos suspensos/levantados, quando aplicável. Afeta a tarifa em algumas
   * concessionárias. `undefined` = não informado, diferente de 0.
   */
  raisedAxles?: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  countryCode: CountryCode;
  /** Rótulo humano, só para registro. */
  label?: string;
}

export interface TollQuoteRequest {
  origin: RoutePoint;
  destination: RoutePoint;
  waypoints: RoutePoint[];
  vehicle: VehicleConfiguration;
  /**
   * Data de referência da tarifa. Tarifa de pedágio muda por reajuste; cotar
   * para a data da viagem evita cotar com tabela que já não vale.
   */
  referenceDate: string; // ISO yyyy-mm-dd
  currency: CurrencyCode;
}

export interface TollQuote {
  provider: TollProviderId;
  /** Identificador da rota no provedor, para auditoria e reconsulta. */
  providerRouteId: string | null;
  toll: TollAmount;
  /** Detalhamento por praça. Vazio NÃO implica pedágio zero. */
  plazas: TollPlaza[];
  /**
   * `true` quando o provedor afirma ter detalhado todas as praças. Quando
   * `false`, o total pode estar certo e o detalhamento incompleto.
   */
  plazasComplete: boolean;
  loadedDistanceKm: number | null;
  durationMinutes: number | null;
  /** Travessias de fronteira, para corredores LATAM. */
  borderCrossings: Array<{ fromCountry: CountryCode; toCountry: CountryCode }>;
  /** Até quando esta cotação vale. Nulo = o provedor não informou validade. */
  validUntil: string | null;
  calculatedAt: string;
  /** Resposta crua do provedor, para auditoria. Nunca vai ao navegador. */
  rawPayload: unknown;
}

/** O que o navegador recebe. Sem payload de provedor, sem credencial. */
export interface TollQuotePublicResult {
  status: "quoted" | "unavailable";
  provider: TollProviderId;
  toll: TollAmount;
  plazaCount: number;
  plazasComplete: boolean;
  validUntil: string | null;
  /** Preenchido só quando status = "unavailable". */
  reason?: TollFailureKind;
}

export interface TollProvider {
  readonly id: TollProviderId;
  readonly mode: TollProviderMode;
  quote(request: TollQuoteRequest): Promise<ProviderOutcome<TollQuote>>;
}
