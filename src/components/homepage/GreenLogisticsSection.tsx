import { useState, useMemo } from "react";
import { Leaf, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "🌿 Logística verde",
    h2a: "Transporte de aço com ",
    h2b: "impacto climático positivo",
    sub: "Acesse nossa frota verificada de caminhões elétricos e baixo carbono.",
    evTitle: "Caminhões 100% elétricos",
    evDesc: "Frota de caminhões elétricos para rotas urbanas e interestaduais. Zero emissão direta. Ideal para metas net-zero.",
    evHighlight: "Zero emissão direta",
    evNote: "Ideal para metas net-zero",
    lcTitle: "Biodiesel B100",
    lcDesc: "Frota com biodiesel B100. Redução de até 80% nas emissões versus diesel convencional.",
    lcHighlight: "Redução até 80% CO₂",
    calcTitle: "Calculadora de CO₂",
    distance: "Distância (km)",
    weight: "Peso (toneladas)",
    fuel: "Combustível",
    emitted: "CO₂ emitido",
    baseline: "Baseline diesel",
    saved: "CO₂ evitado",
    trees: (n: number) => `= ${n} árvores poupadas por 1 ano`,
    fuelOptions: [
      { label: "Diesel convencional", value: 0.0892 },
      { label: "Biodiesel B100", value: 0.0321 },
      { label: "Elétrico (EV)", value: 0 },
    ],
    features: [
      { icon: "🌿", title: "Cálculo automático de CO₂", desc: "Estimativa por tonelada-km antes de publicar. Comparação verde vs tradicional." },
      { icon: "📋", title: "Relatório ESG mensal", desc: "PDF gerado automaticamente com CO₂ evitado, % fretes verdes e rating ESG." },
      { icon: "🏆", title: "Rating ESG A+ a C", desc: "Cada transportadora recebe um rating baseado no tipo de frota e histórico de emissões." },
      { icon: "🎯", title: "Meta verde por empresa", desc: "Defina sua meta de % de fretes verdes e acompanhe no dashboard ESG." },
    ],
    ctaPrimary: "Ativar logística verde →",
    ctaSecondary: "Ver calculadora de CO₂",
  },
  en: {
    eyebrow: "🌿 Green logistics",
    h2a: "Steel transport with ",
    h2b: "positive climate impact",
    sub: "Access our verified fleet of electric and low-carbon trucks.",
    evTitle: "100% electric trucks",
    evDesc: "Fleet of electric trucks for urban and interstate routes. Zero direct emissions. Perfect for net-zero targets.",
    evHighlight: "Zero direct emissions",
    evNote: "Perfect for net-zero targets",
    lcTitle: "B100 biodiesel",
    lcDesc: "Fleet running on B100 biodiesel. Up to 80% emission reduction vs conventional diesel.",
    lcHighlight: "Up to 80% CO₂ reduction",
    calcTitle: "CO₂ calculator",
    distance: "Distance (km)",
    weight: "Weight (tons)",
    fuel: "Fuel",
    emitted: "CO₂ emitted",
    baseline: "Diesel baseline",
    saved: "CO₂ avoided",
    trees: (n: number) => `= ${n} trees saved for 1 year`,
    fuelOptions: [
      { label: "Conventional diesel", value: 0.0892 },
      { label: "B100 biodiesel", value: 0.0321 },
      { label: "Electric (EV)", value: 0 },
    ],
    features: [
      { icon: "🌿", title: "Automatic CO₂ calculation", desc: "Per ton-km estimate before posting. Green vs traditional comparison." },
      { icon: "📋", title: "Monthly ESG report", desc: "PDF auto-generated with CO₂ avoided, % green freights and ESG rating." },
      { icon: "🏆", title: "ESG rating A+ to C", desc: "Each carrier gets a rating based on fleet type and emission history." },
      { icon: "🎯", title: "Per-company green goal", desc: "Set your % green freight target and track it on the ESG dashboard." },
    ],
    ctaPrimary: "Activate green logistics →",
    ctaSecondary: "Open CO₂ calculator",
  },
} as const;

export function GreenLogisticsSection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const [distance, setDistance] = useState(620);
  const [weight, setWeight] = useState(42);
  const [factor, setFactor] = useState(0.0321);

  const { emitted, baseline, saved, trees } = useMemo(() => {
    const e = Math.round(distance * weight * factor);
    const b = Math.round(distance * weight * 0.0892);
    const s = Math.max(0, b - e);
    return { emitted: e, baseline: b, saved: s, trees: Math.round(s / 21.7) };
  }, [distance, weight, factor]);

  return (
    <section id="logistica-verde" className="relative py-[100px] bg-[#0D1117] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(26,155,94,0.08) 0%, transparent 70%)" }} />

      <div className="relative max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-16">
          <div className="text-[#2ECC8A] text-xs uppercase tracking-widest font-medium mb-3">{c.eyebrow}</div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">
            {c.h2a}<span className="text-[#2ECC8A]">{c.h2b}</span>
          </h2>
          <p className="text-[#8B949E] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <div className="border border-[#1A9B5E] bg-[#1A9B5E]/5 rounded-[16px] p-6">
            <span className="inline-block bg-[#1A9B5E]/20 text-[#2ECC8A] border border-[#1A9B5E]/40 rounded-full px-2.5 py-0.5 text-xs mb-4">🔋 EV</span>
            <h3 className="text-[#E6EDF3] font-bold text-xl mb-2">{c.evTitle}</h3>
            <p className="text-[#8B949E] text-sm" style={{ lineHeight: 1.7 }}>{c.evDesc}</p>
            <div className="flex items-center gap-2 mt-4">
              <Leaf size={18} className="text-[#2ECC8A]" />
              <span className="text-[#2ECC8A] font-bold text-lg">{c.evHighlight}</span>
            </div>
            <div className="text-[#484F58] text-xs mt-1">{c.evNote}</div>
          </div>

          <div className="border border-[#0F6E56] bg-[#0F6E56]/5 rounded-[16px] p-6">
            <span className="inline-block bg-[#0F6E56]/20 text-[#3DD68C] border border-[#0F6E56]/40 rounded-full px-2.5 py-0.5 text-xs mb-4">⛽ LC</span>
            <h3 className="text-[#E6EDF3] font-bold text-xl mb-2">{c.lcTitle}</h3>
            <p className="text-[#8B949E] text-sm" style={{ lineHeight: 1.7 }}>{c.lcDesc}</p>
            <div className="flex items-center gap-2 mt-4">
              <ArrowDown size={18} className="text-[#3DD68C]" />
              <span className="text-[#3DD68C] font-bold text-lg">{c.lcHighlight}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#1C2128] border border-[#30363D] rounded-[16px] p-6 mb-16">
          <h3 className="text-[#E6EDF3] font-semibold mb-6">{c.calcTitle}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm text-[#8B949E] mb-2">{c.distance}</label>
              <input type="range" min={100} max={2000} step={10} value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="w-full" style={{ accentColor: "#1B6CB8" }} />
              <div className="text-[#E6EDF3] font-bold text-lg mt-2">{distance} km</div>
            </div>

            <div>
              <label className="block text-sm text-[#8B949E] mb-2">{c.weight}</label>
              <input type="range" min={1} max={74} step={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="w-full" style={{ accentColor: "#1B6CB8" }} />
              <div className="text-[#E6EDF3] font-bold text-lg mt-2">{weight} t</div>
            </div>

            <div>
              <label className="block text-sm text-[#8B949E] mb-2">{c.fuel}</label>
              <select value={factor} onChange={(e) => setFactor(Number(e.target.value))} className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-3 py-2 text-[#E6EDF3] text-sm">
                {c.fuelOptions.map((f) => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#30363D]">
            <div className="text-center">
              <div className="text-xs text-[#8B949E] mb-1">{c.emitted}</div>
              <div className="font-bold text-xl text-[#F0A500]">{emitted} kg</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-[#8B949E] mb-1">{c.baseline}</div>
              <div className="font-bold text-xl text-[#8B949E]">{baseline} kg</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-[#8B949E] mb-1">{c.saved}</div>
              <div className="font-bold text-2xl text-[#2ECC8A]">{saved} kg</div>
            </div>
          </div>

          {saved > 0 && (
            <div className="text-center text-sm text-[#2ECC8A] mt-3">{c.trees(trees)}</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {c.features.map((f) => (
            <div key={f.title} className="bg-[#1C2128] border border-[#30363D] rounded-[14px] p-5">
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-[#E6EDF3] font-semibold text-sm mb-2">{f.title}</div>
              <p className="text-[#8B949E] text-xs" style={{ lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-12 justify-center">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="bg-[#1A9B5E] hover:bg-[#168f55] text-white h-12 px-8 text-base">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="h-12 px-8 text-base text-[#E6EDF3] hover:bg-[#1C2128]">
            {c.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
