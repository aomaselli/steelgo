import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

type SegmentKey = "siderurgica" | "distribuidor" | "industria";

const COPY = {
  pt: {
    eyebrow: "Para empresas",
    h2: "Seu frete de aço seguro do jeito que deveria ser",
    sub: "Siderúrgicas, distribuidores e indústrias digitalizam toda a operação logística.",
    segments: {
      siderurgica: { label: "🏭 Siderúrgicas", title: "Siderúrgicas", body: "Gerencie o escoamento da produção com transportadoras verificadas.", bullets: ["Rastreamento de bobinas e chapas", "Contratos RCTR-C automáticos", "Relatório ESG mensal"] },
      distribuidor: { label: "🏗️ Distribuidores", title: "Distribuidores", body: "Otimize rotas de distribuição e reduza o custo por tonelada.", bullets: ["Matching por tipo de aço e rota", "Score de transportadoras", "Dashboard de custos"] },
      industria: { label: "🔧 Indústrias", title: "Indústrias", body: "Receba matéria-prima com rastreabilidade total.", bullets: ["GPS ao vivo da sua carga", "Alertas por WhatsApp", "Histórico auditável"] },
    },
    features: [
      "Publicação de frete em menos de 5 minutos",
      "Matching automático com transportadoras verificadas",
      "Contrato digital em menos de 2 minutos",
      "Rastreamento GPS em tempo real",
      "Pagamento garantido com liberação automática",
      "Relatório ESG mensal automático",
      "Histórico completo e auditável",
      "Integração ERP — SAP, TOTVS (Enterprise)",
    ],
    ctaPrimary: "Publicar meu primeiro frete →",
    ctaSecondary: "Falar com especialista",
  },
  en: {
    eyebrow: "For companies",
    h2: "Steel freight as secure as it should be",
    sub: "Steel mills, distributors and industries digitize their full logistics operation.",
    segments: {
      siderurgica: { label: "🏭 Steel mills", title: "Steel mills", body: "Manage production outflow with verified carriers.", bullets: ["Coil and plate tracking", "Automatic RCTR-C contracts", "Monthly ESG report"] },
      distribuidor: { label: "🏗️ Distributors", title: "Distributors", body: "Optimize distribution routes and cut cost per ton.", bullets: ["Matching by steel type and route", "Carrier scoring", "Cost dashboard"] },
      industria: { label: "🔧 Industries", title: "Industries", body: "Receive raw materials with full traceability.", bullets: ["Live GPS of your load", "WhatsApp alerts", "Auditable history"] },
    },
    features: [
      "Post a freight in under 5 minutes",
      "Automatic matching with verified carriers",
      "Digital contract in under 2 minutes",
      "Real-time GPS tracking",
      "Escrow payment with auto-release",
      "Automatic monthly ESG report",
      "Full auditable history",
      "ERP integration — SAP, TOTVS (Enterprise)",
    ],
    ctaPrimary: "Post my first freight →",
    ctaSecondary: "Talk to a specialist",
  },
} as const;

export function CompanySection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const [active, setActive] = useState<SegmentKey>("siderurgica");
  const segment = c.segments[active];

  return (
    <section id="empresas" className="bg-[#0D1117] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-12">
          <div className="text-[#79B8F8] text-xs uppercase tracking-widest font-medium mb-3">{c.eyebrow}</div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#8B949E] text-lg">{c.sub}</p>
        </div>

        <div className="flex gap-2 mb-10 flex-wrap">
          {(Object.keys(c.segments) as SegmentKey[]).map((key) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive ? "bg-[#1B6CB8] text-white" : "border border-[#30363D] text-[#8B949E] hover:text-[#E6EDF3]"
                }`}
              >
                {c.segments[key].label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h3 className="text-[#E6EDF3] font-bold text-xl mb-3">{segment.title}</h3>
            <p className="text-sm text-[#8B949E] mb-4" style={{ lineHeight: 1.7 }}>{segment.body}</p>
            <div className="flex flex-col gap-2">
              {segment.bullets.map((b) => (
                <div key={b} className="flex items-start gap-2">
                  <Check size={16} className="text-[#2ECC8A] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[#C9D1D9]">{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            {c.features.map((f, i) => (
              <div key={f} className={`flex items-center gap-2 py-2.5 ${i === c.features.length - 1 ? "" : "border-b border-[#30363D]/30"}`}>
                <Check size={16} className="text-[#2ECC8A]" />
                <span className="text-sm text-[#C9D1D9]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="bg-[#1B6CB8] hover:bg-[#1758a0] text-white h-12 px-8 text-base">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="text-[#E6EDF3] hover:bg-[#1C2128] h-12 px-8 text-base">{c.ctaSecondary}</Button>
        </div>
      </div>
    </section>
  );
}
