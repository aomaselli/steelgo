import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "ESG & Sustentabilidade",
    h2: "Sua empresa pronta para reporting ESG em logística",
    sub: "Cada frete gera dados de carbono automáticos. Dashboard ESG e relatório PDF mensal inclusos.",
    metrics: [
      { icon: "🌿", value: "1.240 kg", valueColor: "#2ECC8A", label: "CO₂ evitado/mês" },
      { icon: "⚡", value: "34%", valueColor: "#2ECC8A", label: "Fretes verdes" },
      { icon: "🏆", value: "B+", valueColor: "#79B8F8", label: "Rating ESG médio" },
      { icon: "📋", value: "PDF", valueColor: "#79B8F8", label: "Relatório automático" },
    ],
    reportTitle: "📋 O que tem no relatório ESG",
    reportItems: [
      "CO₂ total emitido por mês e por frete",
      "CO₂ evitado versus baseline de diesel",
      "% de fretes verdes vs. tradicionais",
      "Rating ESG de cada transportadora utilizada",
      "Tipo de caminhão e combustível por rota",
      "Comparativo mensal e tendência anual",
      "Meta de descarbonização e progresso",
      "Dados prontos para GRI, SASB e TCFD",
    ],
    ctaPrimary: "Ver dashboard ESG →",
    ctaSecondary: "Baixar exemplo de relatório",
  },
  en: {
    eyebrow: "ESG & Sustainability",
    h2: "Your company ready for ESG logistics reporting",
    sub: "Every freight generates automatic carbon data. ESG dashboard and monthly PDF report included.",
    metrics: [
      { icon: "🌿", value: "1,240 kg", valueColor: "#2ECC8A", label: "CO₂ avoided/month" },
      { icon: "⚡", value: "34%", valueColor: "#2ECC8A", label: "Green freights" },
      { icon: "🏆", value: "B+", valueColor: "#79B8F8", label: "Average ESG rating" },
      { icon: "📋", value: "PDF", valueColor: "#79B8F8", label: "Automatic report" },
    ],
    reportTitle: "📋 What's in the ESG report",
    reportItems: [
      "Total CO₂ emitted per month and per freight",
      "CO₂ avoided versus diesel baseline",
      "% green vs. traditional freights",
      "ESG rating of every carrier used",
      "Truck type and fuel per route",
      "Monthly comparison and yearly trend",
      "Decarbonization target and progress",
      "Data ready for GRI, SASB and TCFD",
    ],
    ctaPrimary: "Open ESG dashboard →",
    ctaSecondary: "Download sample report",
  },
} as const;

export function ESGSection() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section id="esg" className="bg-[#0D1117] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-16">
          <div className="text-[#2ECC8A] text-xs uppercase tracking-widest font-medium mb-3">{c.eyebrow}</div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#8B949E] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          <div className="grid grid-cols-2 gap-4">
            {c.metrics.map((m) => (
              <div key={m.label} className="bg-[#161B22] border border-[#30363D] rounded-[12px] p-4 text-center">
                <div className="text-2xl mb-2">{m.icon}</div>
                <div className="font-bold text-2xl tabular-nums" style={{ color: m.valueColor }}>{m.value}</div>
                <div className="text-xs text-[#8B949E] mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#161B22] border border-[#30363D] rounded-[16px] p-6">
            <h3 className="text-[#E6EDF3] font-semibold mb-4">{c.reportTitle}</h3>
            <div className="flex flex-col gap-2">
              {c.reportItems.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <Check size={14} className="text-[#2ECC8A] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[#C9D1D9]">{item}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <Button size="lg" className="bg-[#1A9B5E] hover:bg-[#168f55] text-white">{c.ctaPrimary}</Button>
              <Button size="lg" variant="ghost" className="text-[#E6EDF3] hover:bg-[#1C2128]">{c.ctaSecondary}</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
