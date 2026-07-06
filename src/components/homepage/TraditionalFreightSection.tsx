import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";

type TruckRow = { name: string; payload: string; tone: "gray" | "blue" | "amber" };

const COPY = {
  pt: {
    eyebrow: "Frete tradicional",
    h2: "Para qualquer carga de aço, em qualquer rota do Brasil",
    sub: "Nossa rede cobre todos os 26 estados. Todos os tipos de aço, todos os caminhões.",
    steelLabel: "Tipos de aço transportados:",
    truckLabel: "Caminhões disponíveis:",
    steelTypes: [
      "Bobina laminada a frio", "Bobina laminada a quente", "Chapa grossa", "Perfil estrutural",
      "Cano sem costura", "Vergalhão e barra", "Tubo galvanizado", "Aço especial",
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
      { icon: "🗺️", title: "Cobertura nacional", desc: "340+ transportadoras verificadas em todos os 26 estados do Brasil." },
      { icon: "⚖️", title: "Carga extra-pesada", desc: "Suporte para cargas acima de 74t com AET e escolta especializada." },
      { icon: "📋", title: "RCTR-C automático", desc: "Seguro de responsabilidade civil incluído automaticamente em todos os fretes." },
      { icon: "🔄", title: "Frete de retorno", desc: "Transportadoras podem oferecer desconto para cargas na rota de volta." },
    ],
  },
  en: {
    eyebrow: "Traditional freight",
    h2: "For any steel load, on any route in Brazil",
    sub: "Our network covers all 26 states. Every steel type, every truck.",
    steelLabel: "Steel types transported:",
    truckLabel: "Available trucks:",
    steelTypes: [
      "Cold-rolled coil", "Hot-rolled coil", "Heavy plate", "Structural profile",
      "Seamless pipe", "Rebar and bar", "Galvanized tube", "Special steel",
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
      { icon: "🗺️", title: "Nationwide coverage", desc: "340+ verified carriers across all 26 Brazilian states." },
      { icon: "⚖️", title: "Extra-heavy cargo", desc: "Support for loads over 74t with AET and specialized escort." },
      { icon: "📋", title: "Auto RCTR-C", desc: "Civil liability insurance included by default on every freight." },
      { icon: "🔄", title: "Return freight", desc: "Carriers can offer discounts for loads on their return route." },
    ],
  },
} as const;

function payloadBadgeClass(tone: TruckRow["tone"]) {
  switch (tone) {
    case "blue": return "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40";
    case "amber": return "bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/40";
    default: return "bg-[#30363D]/60 text-[#C9D1D9] border-[#30363D]";
  }
}

export function TraditionalFreightSection() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section id="frete-tradicional" className="bg-[#161B22] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-16">
          <div className="mb-4">
            <span className="text-[#79B8F8] text-xs uppercase tracking-widest font-medium">{c.eyebrow}</span>
          </div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#8B949E] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h3 className="text-[#8B949E] text-sm mb-3">{c.steelLabel}</h3>
            <div className="grid grid-cols-2 gap-3">
              {c.steelTypes.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-[#1B6CB8]" />
                  <span className="text-sm text-[#C9D1D9]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[#8B949E] text-sm mb-3">{c.truckLabel}</h3>
            <div>
              {c.trucks.map((truck, i) => (
                <div key={truck.name} className={`flex justify-between items-center py-2 ${i === c.trucks.length - 1 ? "" : "border-b border-[#30363D]/40"}`}>
                  <span className="text-[#C9D1D9] text-sm">{truck.name}</span>
                  <Badge variant="outline" className={payloadBadgeClass(truck.tone)}>{truck.payload}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
          {c.features.map((f) => (
            <div key={f.title} className="bg-[#1C2128] border border-[#30363D] rounded-[14px] p-5">
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-[#E6EDF3] font-semibold text-sm mb-2">{f.title}</div>
              <p className="text-[#8B949E] text-xs" style={{ lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
