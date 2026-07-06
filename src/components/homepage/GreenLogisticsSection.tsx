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
    <section id="logistica-verde" className="relative overflow-hidden bg-[#F7F9FB] py-[100px]">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(26,155,94,0.08) 0%, transparent 70%)" }} />

      <div className="relative mx-auto max-w-[1280px] px-6">
        <div className="mb-16 text-center">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#1A9B5E]">{c.eyebrow}</div>
          <h2 className="mb-4 text-4xl font-bold text-[#0F172A]">
            {c.h2a}<span className="text-[#1A9B5E]">{c.h2b}</span>
          </h2>
          <p className="mx-auto text-lg text-[#475569]">{c.sub}</p>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-[18px] border border-[#1A9B5E]/30 bg-[#F1FBF7] p-6 shadow-sm">
            <span className="mb-4 inline-block rounded-full border border-[#1A9B5E]/40 bg-[#1A9B5E]/15 px-2.5 py-0.5 text-xs text-[#1A9B5E]">🔋 EV</span>
            <h3 className="mb-2 text-xl font-bold text-[#0F172A]">{c.evTitle}</h3>
            <p className="text-sm text-[#475569]" style={{ lineHeight: 1.7 }}>{c.evDesc}</p>
            <div className="mt-4 flex items-center gap-2">
              <Leaf size={18} className="text-[#1A9B5E]" />
              <span className="text-lg font-bold text-[#1A9B5E]">{c.evHighlight}</span>
            </div>
            <div className="mt-1 text-xs text-[#64748B]">{c.evNote}</div>
          </div>

          <div className="rounded-[18px] border border-[#0F6E56]/30 bg-[#F4FCF8] p-6 shadow-sm">
            <span className="mb-4 inline-block rounded-full border border-[#0F6E56]/40 bg-[#0F6E56]/15 px-2.5 py-0.5 text-xs text-[#0F6E56]">⛽ LC</span>
            <h3 className="mb-2 text-xl font-bold text-[#0F172A]">{c.lcTitle}</h3>
            <p className="text-sm text-[#475569]" style={{ lineHeight: 1.7 }}>{c.lcDesc}</p>
            <div className="mt-4 flex items-center gap-2">
              <ArrowDown size={18} className="text-[#0F6E56]" />
              <span className="text-lg font-bold text-[#0F6E56]">{c.lcHighlight}</span>
            </div>
          </div>
        </div>

        <div className="mb-16 rounded-[20px] border border-[#D8E1EA] bg-white p-6 shadow-sm">
          <h3 className="mb-6 font-semibold text-[#0F172A]">{c.calcTitle}</h3>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm text-[#475569]">{c.distance}</label>
              <input type="range" min={100} max={2000} step={10} value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="w-full" style={{ accentColor: "#1B6CB8" }} />
              <div className="mt-2 text-lg font-bold text-[#0F172A]">{distance} km</div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">{c.weight}</label>
              <input type="range" min={1} max={74} step={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="w-full" style={{ accentColor: "#1B6CB8" }} />
              <div className="mt-2 text-lg font-bold text-[#0F172A]">{weight} t</div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">{c.fuel}</label>
              <select value={factor} onChange={(e) => setFactor(Number(e.target.value))} className="w-full rounded-md border border-[#D8E1EA] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A]">
                {c.fuelOptions.map((f) => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#E2E8F0] pt-6 md:grid-cols-3">
            <div className="text-center">
              <div className="mb-1 text-xs text-[#64748B]">{c.emitted}</div>
              <div className="text-xl font-bold text-[#D97706]">{emitted} kg</div>
            </div>
            <div className="text-center">
              <div className="mb-1 text-xs text-[#64748B]">{c.baseline}</div>
              <div className="text-xl font-bold text-[#64748B]">{baseline} kg</div>
            </div>
            <div className="text-center">
              <div className="mb-1 text-xs text-[#64748B]">{c.saved}</div>
              <div className="text-2xl font-bold text-[#1A9B5E]">{saved} kg</div>
            </div>
          </div>

          {saved > 0 && (
            <div className="mt-3 text-center text-sm text-[#1A9B5E]">{c.trees(trees)}</div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {c.features.map((f) => (
            <div key={f.title} className="rounded-[16px] border border-[#D8E1EA] bg-white p-5 shadow-sm">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <div className="mb-2 text-sm font-semibold text-[#0F172A]">{f.title}</div>
              <p className="text-xs text-[#475569]" style={{ lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="h-12 bg-[#1A9B5E] px-8 text-base text-white hover:bg-[#168f55]">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="h-12 border-[#D8E1EA] px-8 text-base text-[#334155] hover:bg-[#F8FAFC]">
            {c.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
