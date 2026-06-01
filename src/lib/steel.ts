export const STEEL_TYPES = [
  { id: "cold_rolled", label: "Bobina laminada a frio", desc: "Chapas de aço processadas a frio", color: "#79B8F8" },
  { id: "hot_rolled", label: "Bobina laminada a quente", desc: "Produção de tubos e perfis", color: "#F0A500" },
  { id: "plate", label: "Chapa grossa", desc: "Estruturas pesadas, navios, pontes", color: "#8B949E" },
  { id: "structural", label: "Perfil estrutural", desc: "Vigas, colunas, pilares", color: "#3B89D4" },
  { id: "seamless_pipe", label: "Cano sem costura", desc: "Alta pressão e resistência", color: "#C9D1D9" },
  { id: "rebar", label: "Vergalhão", desc: "Construção civil", color: "#CC8800" },
  { id: "galvanized_tube", label: "Tubo galvanizado", desc: "Resistência à corrosão", color: "#2ECC8A" },
  { id: "special_steel", label: "Aço especial", desc: "Ferramentas e moldes", color: "#1A9B5E" },
] as const;

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
