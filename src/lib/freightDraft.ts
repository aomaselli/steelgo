// =============================================================================
// Publicação de frete — regras puras do formulário
// =============================================================================
// Extraído de NewFreightPage para poder ser testado sem navegador. Três coisas
// moram aqui, todas corrigindo defeito observado em execução:
//
//   buildFreightPayload  — o payload da RPC. NAO leva colunas governadas.
//   isStepComplete       — etapa só é "concluída" se tiver o dado obrigatório.
//   sanitizeDraft        — rascunho antigo não devolve valor que saiu do catálogo.
// =============================================================================

/** Só o que estas regras precisam do formulário. */
export type FreightFormValues = {
  steel_type: string;
  weight_tons: number | "";
  cargo_value_brl: number | "";
  volume_m3: number | "";
  notes: string;
  origin_city: string;
  origin_state: string;
  origin_name: string;
  dest_city: string;
  dest_state: string;
  dest_name: string;
  distance_km: number | "";
  category: "traditional" | "green" | "green_ev";
  required_truck: string[];
  pickup_date: string;
  pickup_from: string;
  pickup_to: string;
  delivery_date: string;
  budget_brl: number | "";
  bid_deadline: string;
};

/** Número positivo ou nulo. Zero e vazio viram nulo, como a RPC espera. */
function num(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A tela usa "green"; o enum `freight_category` usa "green_low_carbon". */
export function toDbCategory(c: FreightFormValues["category"]) {
  if (c === "green") return "green_low_carbon";
  if (c === "green_ev") return "green_ev";
  return "traditional";
}

// -----------------------------------------------------------------------------
// COLUNAS GOVERNADAS — nunca vão no payload do rascunho
// -----------------------------------------------------------------------------
// `freights_enforce_publication_event` governa status, published_at,
// last_publication_event_id, budget_brl, budget_amount, final_price_brl,
// final_price_amount e os matched_*. Mudança nessas colunas exige um evento de
// publicação novo.
//
// `create_freight_draft_core` aplica o payload num UPDATE de cópia de campos
// logo após inserir a linha. Se o payload trouxer `budget_brl`, esse UPDATE vira
// alteração governada numa linha que ainda não tem evento, e o guarda recusa com
//
//   42501  freights: alteracao governada exige last_publication_event_id
//          apontando para um evento novo
//
// Comprovado por bissecção no banco descartável: o payload completo da tela só
// falha por causa dessa chave, e publica sem ela. O orçamento chega pelo
// parâmetro `p_budget_brl`, que passa por `publish_freight_core` e gera o
// evento. O guarda está correto e não foi alterado.
export const GOVERNED_COLUMNS = [
  "status",
  "published_at",
  "last_publication_event_id",
  "budget_brl",
  "budget_amount",
  "final_price_brl",
  "final_price_amount",
  "matched_carrier_id",
  "matched_driver_id",
  "matched_truck_id",
] as const;

export function buildFreightPayload(v: FreightFormValues): Record<string, unknown> {
  const pickupWindow = v.pickup_from && v.pickup_to ? `${v.pickup_from}-${v.pickup_to}` : null;
  return {
    steel_type: v.steel_type || null,
    weight_tons: num(v.weight_tons),
    cargo_value_brl: num(v.cargo_value_brl),
    notes: v.notes || null,
    origin_name: v.origin_name || null,
    origin_city: v.origin_city || null,
    origin_state: v.origin_state || null,
    dest_name: v.dest_name || null,
    dest_city: v.dest_city || null,
    dest_state: v.dest_state || null,
    distance_km: num(v.distance_km),
    category: toDbCategory(v.category),
    required_truck: v.required_truck.length ? v.required_truck : null,
    pickup_date: v.pickup_date || null,
    delivery_date: v.delivery_date || null,
    pickup_window: pickupWindow,
    bid_deadline: v.bid_deadline ? new Date(v.bid_deadline).toISOString() : null,
  };
}

// -----------------------------------------------------------------------------
// Etapas
// -----------------------------------------------------------------------------
// O indicador marcava etapa como concluída só por `currentStep > id`, sem olhar
// dado nenhum: dava para chegar na revisão com Carga e Rota em verde e os campos
// vazios, e o rascunho era gravado assim.
export function isStepComplete(step: number, v: FreightFormValues): boolean {
  switch (step) {
    case 1:
      return Boolean(v.steel_type) && Number(v.weight_tons) > 0;
    case 2:
      return Boolean(v.origin_city && v.origin_state && v.dest_city && v.dest_state);
    case 3:
      return v.required_truck.length > 0 && Boolean(v.pickup_date);
    case 4:
      return Number(v.budget_brl) > 0;
    case 5:
      return [1, 2, 3, 4].every((s) => isStepComplete(s, v));
    default:
      return false;
  }
}

/** Primeira etapa incompleta, ou null se tudo estiver preenchido. */
export function firstIncompleteStep(v: FreightFormValues): number | null {
  for (const s of [1, 2, 3, 4]) if (!isStepComplete(s, v)) return s;
  return null;
}

// -----------------------------------------------------------------------------
// Rascunhos antigos
// -----------------------------------------------------------------------------
// O rascunho vive no localStorage e era devolvido ao formulário sem conferência.
// Um rascunho gravado antes da correção do catálogo traz `steel_type: "plate"`,
// que não existe mais — e seguiria para a RPC, que o recusa com 22P02. O mesmo
// vale para `required_truck: ["carreta_ext"]` e `["prancha"]`.
export type DraftSanitizeResult<T> = {
  draft: T;
  /** Rótulos dos campos descartados, para avisar quem está usando a tela. */
  discarded: string[];
};

// Genérica no tipo do formulário: a tela guarda mais campos do que estas regras
// precisam (janelas, waypoints, referência interna). Devolver o mesmo tipo que
// entrou deixa quem chama repassar o rascunho sem perder os demais campos.
export function sanitizeDraft<T extends Partial<FreightFormValues>>(
  parsed: T,
  allowedSteelIds: readonly string[],
  allowedTruckIds: readonly string[],
): DraftSanitizeResult<T> {
  const draft = { ...parsed };
  const campos = draft as Partial<FreightFormValues>;
  const discarded: string[] = [];

  if (campos.steel_type && !allowedSteelIds.includes(campos.steel_type)) {
    delete campos.steel_type;
    discarded.push("tipo de aço");
  }

  if (Array.isArray(campos.required_truck)) {
    const mantidos = campos.required_truck.filter((t) => allowedTruckIds.includes(t));
    if (mantidos.length !== campos.required_truck.length) {
      discarded.push("tipo de caminhão");
    }
    campos.required_truck = mantidos;
  }

  return { draft, discarded };
}
