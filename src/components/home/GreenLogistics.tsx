import { useMemo, useState } from "react";
import { Leaf, Zap, TrendingDown } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { Button, Input } from "@/components/steel";

const COPY = {
  pt: {
    label: "Logística Verde",
    headline: "Cada frete verde, um passo para o net-zero",
    desc: "Priorize transportadoras com caminhões EV ou combustíveis de baixo carbono. Acompanhe a economia de CO₂ por embarque.",
    calcTitle: "Calcule a economia de CO₂",
    distance: "Distância (km)",
    weight: "Peso (toneladas)",
    traditional: "Frete tradicional",
    green: "Frete verde SteelGo",
    saved: "CO₂ evitado",
    cta: "Quero fretes verdes",
  },
  en: {
    label: "Green logistics",
    headline: "Every green freight, a step toward net-zero",
    desc: "Prioritize carriers with EV trucks or low-carbon fuels. Track CO₂ savings per shipment.",
    calcTitle: "Calculate your CO₂ savings",
    distance: "Distance (km)",
    weight: "Weight (tons)",
    traditional: "Traditional freight",
    green: "SteelGo green freight",
    saved: "CO₂ avoided",
    cta: "I want green freight",
  },
};

// kg CO₂ per ton-km
const FACTOR_TRADITIONAL = 0.062;
const FACTOR_GREEN = 0.018;

export function GreenLogistics() {
  const { language } = useLanguage();
  const c = COPY[language];
  const [distance, setDistance] = useState("800");
  const [weight, setWeight] = useState("25");

  const { trad, green, saved, pct } = useMemo(() => {
    const d = parseFloat(distance) || 0;
    const w = parseFloat(weight) || 0;
    const trad = d * w * FACTOR_TRADITIONAL;
    const green = d * w * FACTOR_GREEN;
    const saved = trad - green;
    const pct = trad > 0 ? Math.round((saved / trad) * 100) : 0;
    return { trad, green, saved, pct };
  }, [distance, weight]);

  const fmt = (n: number) => `${Math.round(n).toLocaleString(language === "pt" ? "pt-BR" : "en-US")} kg`;

  return (
    <section id="green" className="border-b border-graphite-800 bg-esg-green-100/5 py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-esg-green/30 bg-esg-green-100 px-3 py-1 text-xs font-medium text-esg-green">
            <Leaf className="h-3.5 w-3.5" />
            {c.label}
          </div>
          <h2 className="mt-4 text-3xl font-bold text-graphite-50 md:text-4xl">{c.headline}</h2>
          <p className="mt-3 text-base text-graphite-300">{c.desc}</p>
          <Button variant="green" size="lg" className="mt-6">
            <Zap className="h-4 w-4" />
            {c.cta}
          </Button>
        </div>

        <div className="rounded-xl border border-graphite-800 bg-bg-surface p-6 md:p-8">
          <h3 className="text-lg font-semibold text-graphite-50">{c.calcTitle}</h3>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-graphite-400">{c.distance}</span>
              <Input
                type="number"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-graphite-400">{c.weight}</span>
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>

          <div className="mt-6 space-y-3">
            <Row label={c.traditional} value={fmt(trad)} color="text-graphite-200" />
            <Row label={c.green} value={fmt(green)} color="text-esg-green" />
            <div className="flex items-center justify-between rounded-md bg-esg-green-100 p-4">
              <div>
                <div className="text-xs font-medium text-esg-green">{c.saved}</div>
                <div className="text-2xl font-bold text-esg-green">{fmt(saved)}</div>
              </div>
              <div className="flex items-center gap-1 text-esg-green">
                <TrendingDown className="h-4 w-4" />
                <span className="text-lg font-bold">{pct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between border-b border-graphite-800 pb-2">
      <span className="text-sm text-graphite-300">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
