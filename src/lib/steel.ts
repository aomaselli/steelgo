// =============================================================================
// Catálogo da VERTICAL DE AÇO — fonte única
// =============================================================================
// Aço é a primeira vertical da SteelGo. Este arquivo é o ÚNICO lugar que define
// quais tipos de aço existem, como se chamam e como aparecem. Nenhuma tela deve
// declarar a sua própria lista.
//
// DISTINÇÃO QUE PRECISA SER PRESERVADA:
//
//   categoria da carga      — classificação GENÉRICA, válida para qualquer
//                             vertical. Ainda NÃO existe no modelo (ver
//                             docs/produto/catalogo-de-carga.md).
//   tipo de aço             — classificação ESPECÍFICA desta vertical. É o que
//                             `freights.steel_type` guarda.
//
// `steel_type` não é, e não deve virar, o classificador genérico de carga. Em
// particular, `outro` significa "outro tipo de AÇO fora do catálogo" — nunca
// "carga que não é de aço".
//
// ONDE A DEPENDÊNCIA DO ENUM PODE EXISTIR: aqui, e só aqui. Regras genéricas de
// frete, proposta, viagem e pagamento tratam `steel_type` como texto opaco e
// usam `steelLabel()` para exibir. Nenhuma delas deve importar o tipo do enum
// nem comparar com valores literais.
// =============================================================================
import type { Enums } from "@/integrations/supabase/types";

/** Identificador de tipo de aço. É exatamente o enum `public.steel_type`. */
export type SteelTypeId = Enums<"steel_type">;

type SteelTypeOption = {
  id: SteelTypeId;
  label: string;
  desc: string;
  color: string;
};

// A anotação `satisfies` é a trava: se um id deixar de existir no enum, ou se o
// enum ganhar um valor que o catálogo não cobre, isto deixa de compilar. Foi a
// ausência dessa trava que permitiu o catálogo divergir do banco e quebrar a
// publicação de frete (a tela enviava "plate", o banco só aceita
// "chapa_grossa").
//
// A ordem acompanha a ordem do enum no banco.
export const STEEL_TYPES = [
  {
    id: "bobina_laminada_frio",
    label: "Bobina laminada a frio",
    desc: "Chapas de aço processadas a frio",
    color: "#79B8F8",
  },
  {
    id: "bobina_laminada_quente",
    label: "Bobina laminada a quente",
    desc: "Produção de tubos e perfis",
    color: "#F0A500",
  },
  {
    id: "chapa_grossa",
    label: "Chapa grossa",
    desc: "Estruturas pesadas, navios, pontes",
    color: "#8B949E",
  },
  {
    id: "perfil_estrutural",
    label: "Perfil estrutural",
    desc: "Vigas, colunas, pilares",
    color: "#3B89D4",
  },
  {
    id: "cano_sem_costura",
    label: "Cano sem costura",
    desc: "Alta pressão e resistência",
    color: "#C9D1D9",
  },
  {
    id: "barra_redonda",
    label: "Barra redonda",
    desc: "Usinagem, eixos e componentes",
    color: "#B08968",
  },
  {
    id: "vergalhao",
    label: "Vergalhão",
    desc: "Construção civil",
    color: "#CC8800",
  },
  {
    id: "tubo_galvanizado",
    label: "Tubo galvanizado",
    desc: "Resistência à corrosão",
    color: "#2ECC8A",
  },
  {
    id: "blank_estampagem",
    label: "Blank de estampagem",
    desc: "Corte pronto para estamparia",
    color: "#1A9B5E",
  },
  {
    id: "outro",
    label: "Outro aço",
    desc: "Tipo de aço fora do catálogo",
    color: "#6E7681",
  },
] as const satisfies readonly SteelTypeOption[];

/** Todos os ids válidos, para validação de formulário. */
export const STEEL_TYPE_IDS = STEEL_TYPES.map((s) => s.id) as readonly SteelTypeId[];

export function isSteelTypeId(v: unknown): v is SteelTypeId {
  return typeof v === "string" && (STEEL_TYPE_IDS as readonly string[]).includes(v);
}

export const TRUCK_TYPES = [
  { id: "truck", label: "Truck", capacity: 14 },
  { id: "carreta", label: "Carreta", capacity: 33 },
  { id: "bitrem", label: "Bitrem", capacity: 57 },
  { id: "rodotrem", label: "Rodotrem", capacity: 74 },
  { id: "vanderleia", label: "Vanderléia", capacity: 30 },
] as const;

export const CO2_FACTOR_TRADITIONAL = 0.062; // kg CO2 per ton-km diesel
export const CO2_FACTOR_GREEN = 0.018; // biodiesel
export const CO2_FACTOR_EV = 0.005;

/**
 * Rótulo de exibição de um tipo de aço. Aceita texto opaco de propósito: é o
 * que as telas genéricas recebem do banco. Valor desconhecido volta como veio,
 * em vez de virar "—", para que uma divergência futura apareça em vez de sumir.
 */
export function steelLabel(id?: string | null) {
  return STEEL_TYPES.find((s) => s.id === id)?.label ?? id ?? "—";
}

export function formatBRL(v?: number | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export function formatNum(v?: number | null, suffix = "") {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(v) + suffix;
}
