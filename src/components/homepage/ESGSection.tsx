import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "ESG & Sustentabilidade",
    h2: "Dados para uma logística de menor impacto",
    sub: "Centralize estimativas de emissões e compare cenários operacionais para apoiar metas e relatórios de sustentabilidade.",
    metrics: [
      { icon: "🌿", value: "CO₂e", valueColor: "#2FA98A", label: "Estimativas por operação" },
      { icon: "⚡", value: "Rotas", valueColor: "#2FA98A", label: "Comparação de cenários" },
      { icon: "🎯", value: "Metas", valueColor: "#9FB4D4", label: "Acompanhamento ambiental" },
      { icon: "📋", value: "Dados", valueColor: "#9FB4D4", label: "Apoio a relatórios ESG" },
    ],
    reportTitle: "Recursos para gestão ESG",
    reportItems: [
      "Estimativas de CO₂e por rota e operação",
      "Comparação entre combustíveis e cenários de transporte",
      "Indicadores por período, veículo e parceiro logístico",
      "Histórico para acompanhamento da evolução das emissões",
      "Definição de metas ambientais e monitoramento de progresso",
      "Dados estruturados para apoiar relatórios internos de sustentabilidade",
    ],
    ctaPrimary: "Solicitar acesso ao dashboard →",
  },
  en: {
    eyebrow: "ESG & Sustainability",
    h2: "Data for lower-impact logistics",
    sub: "Centralize emission estimates and compare operational scenarios to support sustainability goals and reporting.",
    metrics: [
      { icon: "🌿", value: "CO₂e", valueColor: "#2FA98A", label: "Estimates by operation" },
      { icon: "⚡", value: "Routes", valueColor: "#2FA98A", label: "Scenario comparison" },
      { icon: "🎯", value: "Goals", valueColor: "#9FB4D4", label: "Environmental tracking" },
      { icon: "📋", value: "Data", valueColor: "#9FB4D4", label: "Support for ESG reporting" },
    ],
    reportTitle: "ESG management resources",
    reportItems: [
      "CO₂e estimates by route and operation",
      "Comparison between fuels and transport scenarios",
      "Indicators by period, vehicle and logistics partner",
      "Historical data to track emission trends",
      "Environmental goals and progress monitoring",
      "Structured data to support internal sustainability reporting",
    ],
    ctaPrimary: "Request dashboard access →",
  },
  es: {
    eyebrow: "ESG y Sostenibilidad",
    h2: "Datos para una logística de menor impacto",
    sub: "Centraliza estimaciones de emisiones y compara escenarios operativos para apoyar metas e informes de sostenibilidad.",
    metrics: [
      { icon: "🌿", value: "CO₂e", valueColor: "#2FA98A", label: "Estimaciones por operación" },
      { icon: "⚡", value: "Rutas", valueColor: "#2FA98A", label: "Comparación de escenarios" },
      { icon: "🎯", value: "Metas", valueColor: "#9FB4D4", label: "Seguimiento ambiental" },
      { icon: "📋", value: "Datos", valueColor: "#9FB4D4", label: "Apoyo a informes ESG" },
    ],
    reportTitle: "Recursos para la gestión ESG",
    reportItems: [
      "Estimaciones de CO₂e por ruta y operación",
      "Comparación entre combustibles y escenarios de transporte",
      "Indicadores por período, vehículo y socio logístico",
      "Histórico para acompañar la evolución de las emisiones",
      "Metas ambientales y seguimiento del progreso",
      "Datos estructurados para apoyar informes internos de sostenibilidad",
    ],
    ctaPrimary: "Solicitar acceso al dashboard →",
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
              <Button
                size="lg"
                onClick={() => document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-[#2FA98A] text-white hover:bg-[#1E8168]"
              >
                {c.ctaPrimary}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
