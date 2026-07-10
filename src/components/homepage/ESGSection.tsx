import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "ESG & Sustentabilidade",
    h2: "Sua empresa pronta para reporting ESG em logística",
    sub: "Cada frete gera dados de carbono automáticos. Dashboard ESG e relatório PDF mensal inclusos.",
    metrics: [
      { icon: "🌿", value: "1.240 kg", valueColor: "#2FA98A", label: "CO₂ evitado/mês" },
      { icon: "⚡", value: "34%", valueColor: "#2FA98A", label: "Fretes verdes" },
      { icon: "🏆", value: "B+", valueColor: "#9FB4D4", label: "Rating ESG médio" },
      { icon: "📋", value: "PDF", valueColor: "#9FB4D4", label: "Relatório automático" },
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
      { icon: "🌿", value: "1,240 kg", valueColor: "#2FA98A", label: "CO₂ avoided/month" },
      { icon: "⚡", value: "34%", valueColor: "#2FA98A", label: "Green freights" },
      { icon: "🏆", value: "B+", valueColor: "#9FB4D4", label: "Average ESG rating" },
      { icon: "📋", value: "PDF", valueColor: "#9FB4D4", label: "Automatic report" },
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
          <div className="text-[#2FA98A] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-[#16263F] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#5B6B80] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 gap-16 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-4">
            {c.metrics.map((m) => (
              <div key={m.label} className="rounded-[14px] border border-[#E6EAF0] bg-white p-4 text-center shadow-sm">
                <div className="mb-2 text-2xl">{m.icon}</div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: m.valueColor }}>{m.value}</div>
                <div className="mt-1 text-xs text-[#5B6B80]">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[20px] border border-[#E6EAF0] bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-[#16263F]">{c.reportTitle}</h3>
            <div className="flex flex-col gap-2">
              {c.reportItems.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <Check size={14} className="mt-0.5 flex-shrink-0 text-[#2FA98A]" />
                  <span className="text-sm text-[#1F2933]">{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="bg-[#2FA98A] text-white hover:bg-[#1E8168]">{c.ctaPrimary}</Button>
              <Button size="lg" variant="ghost" className="border-[#E6EAF0] text-[#1F2933] hover:bg-[#F7F9FB]">{c.ctaSecondary}</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
