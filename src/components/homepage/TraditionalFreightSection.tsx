import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";

type TruckRow = { name: string; payload: string; tone: "gray" | "blue" | "amber" };

const COPY = {
  pt: {
    eyebrow: "OPERAÇÕES LOGÍSTICAS",
    h2: "Estrutura para diferentes cargas, rotas e veículos",
    sub: "Configure cada operação de acordo com o perfil da carga, a rota e os requisitos de transporte.",
    cargoLabel: "Perfis de operação e carga:",
    truckLabel: "Configurações de veículos:",
    cargoTypes: [
      "Insumos e matérias-primas", "Produtos industrializados", "Carga fracionada", "Carga dedicada",
      "Componentes e equipamentos", "Transferências entre unidades", "Operações de varejo", "Cargas especiais",
    ],
    trucks: [
      { name: "Truck simples", payload: "23t", tone: "gray" },
      { name: "Toco", payload: "15t", tone: "gray" },
      { name: "Carreta", payload: "33t", tone: "gray" },
      { name: "Carreta estendida", payload: "45t", tone: "gray" },
      { name: "Bitrem", payload: "57t", tone: "gray" },
      { name: "Rodotrem", payload: "74t", tone: "blue" },
      { name: "Prancha especial", payload: "AET", tone: "amber" },
    ] as TruckRow[],
    features: [
      { icon: "🗺️", title: "Gestão de rotas", desc: "Centralize origens, destinos, janelas e responsáveis por cada operação." },
      { icon: "⚖️", title: "Cargas especiais", desc: "Organize requisitos de peso, dimensões, autorizações e recursos operacionais." },
      { icon: "📋", title: "Compliance documental", desc: "Mantenha documentos, contratos e evidências vinculados ao frete." },
      { icon: "🔄", title: "Frete de retorno", desc: "Identifique oportunidades para reduzir deslocamentos vazios e melhorar a eficiência da rota." },
    ],
  },
  en: {
    eyebrow: "LOGISTICS OPERATIONS",
    h2: "Built for different cargo, routes and vehicles",
    sub: "Configure each operation according to cargo profile, route and transport requirements.",
    cargoLabel: "Operation and cargo profiles:",
    truckLabel: "Vehicle configurations:",
    cargoTypes: [
      "Inputs and raw materials", "Manufactured products", "Less-than-truckload", "Dedicated cargo",
      "Components and equipment", "Inter-unit transfers", "Retail operations", "Special cargo",
    ],
    trucks: [
      { name: "Light truck", payload: "23t", tone: "gray" },
      { name: "Toco", payload: "15t", tone: "gray" },
      { name: "Trailer", payload: "33t", tone: "gray" },
      { name: "Extended trailer", payload: "45t", tone: "gray" },
      { name: "Bitrem", payload: "57t", tone: "gray" },
      { name: "Road train", payload: "74t", tone: "blue" },
      { name: "Special flatbed", payload: "AET", tone: "amber" },
    ] as TruckRow[],
    features: [
      { icon: "🗺️", title: "Route management", desc: "Centralize origins, destinations, time windows and operation owners." },
      { icon: "⚖️", title: "Special cargo", desc: "Organize weight, dimensions, permits and operating requirements." },
      { icon: "📋", title: "Document compliance", desc: "Keep documents, contracts and evidence linked to each freight." },
      { icon: "🔄", title: "Return freight", desc: "Identify opportunities to reduce empty miles and improve route efficiency." },
    ],
  },
} as const;

function payloadBadgeClass(tone: TruckRow["tone"]) {
  switch (tone) {
    case "blue": return "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40";
    case "amber": return "bg-[#E0A23A]/15 text-[#E0A23A] border-[#E0A23A]/40";
    default: return "bg-[#30363D]/60 text-[#C9D1D9] border-[#30363D]";
  }
}

export function TraditionalFreightSection() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section id="frete-tradicional" className="bg-[#101C30] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-16">
          <div className="mb-4">
            <span className="text-[#9FB4D4] text-xs uppercase tracking-widest font-semibold">{c.eyebrow}</span>
          </div>
          <h2 className="text-white font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#B8C6D9] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 gap-16 rounded-[24px] border border-[#29405F] bg-[#111E33] p-8 shadow-sm md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm text-[#9FB4D4]">{c.cargoLabel}</h3>
            <div className="grid grid-cols-2 gap-3">
              {c.cargoTypes.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm bg-[#16263F]" />
                  <span className="text-sm text-[#E7EDF5]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm text-[#9FB4D4]">{c.truckLabel}</h3>
            <div>
              {c.trucks.map((truck, i) => (
                <div key={truck.name} className={`flex items-center justify-between py-2 ${i === c.trucks.length - 1 ? "" : "border-b border-[#29405F]"}`}>
                  <span className="text-sm text-[#E7EDF5]">{truck.name}</span>
                  <Badge variant="outline" className={payloadBadgeClass(truck.tone)}>{truck.payload}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {c.features.map((f) => (
            <div key={f.title} className="rounded-[16px] border border-[#29405F] bg-[#111E33] p-5 shadow-sm">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <div className="mb-2 text-sm font-semibold text-white">{f.title}</div>
              <p className="text-xs text-[#9FB4D4]" style={{ lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
