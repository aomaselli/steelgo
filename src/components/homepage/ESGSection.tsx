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
    <section id="esg" className="bg-[#F7F9FB] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-16">
          <div className="text-[#1A9B5E] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-[#0F172A] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#475569] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 gap-16 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-4">
            {c.metrics.map((m) => (
              <div key={m.label} className="rounded-[14px] border border-[#D8E1EA] bg-white p-4 text-center shadow-sm">
                <div className="mb-2 text-2xl">{m.icon}</div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: m.valueColor }}>{m.value}</div>
                <div className="mt-1 text-xs text-[#475569]">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[20px] border border-[#D8E1EA] bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-[#0F172A]">{c.reportTitle}</h3>
            <div className="flex flex-col gap-2">
              {c.reportItems.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <Check size={14} className="mt-0.5 flex-shrink-0 text-[#1A9B5E]" />
                  <span className="text-sm text-[#334155]">{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="bg-[#1A9B5E] text-white hover:bg-[#168f55]">{c.ctaPrimary}</Button>
              <Button size="lg" variant="ghost" className="border-[#D8E1EA] text-[#334155] hover:bg-[#F8FAFC]">{c.ctaSecondary}</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
