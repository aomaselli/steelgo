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
  const contactMailto =
    language === "en"
      ? "mailto:ariane@steelgoapp.com?subject=SteelGo%20contact&body=Hello%2C%20I%20would%20like%20to%20learn%20more%20about%20SteelGo."
      : language === "es"
        ? "mailto:ariane@steelgoapp.com?subject=Contacto%20SteelGo&body=Hola%2C%20me%20gustaría%20saber%20más%20sobre%20SteelGo."
        : "mailto:ariane@steelgoapp.com?subject=Contato%20SteelGo&body=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20a%20SteelGo.";
  const [active, setActive] = useState<SegmentKey>("siderurgica");
  const segment = c.segments[active];

  return (
    <section id="empresas" className="bg-[#F7F9FB] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-12">
          <div className="text-[#16263F] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-[#16263F] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#5B6B80] text-lg">{c.sub}</p>
        </div>

        <div className="mb-10 flex flex-wrap gap-2">
          {(Object.keys(c.segments) as SegmentKey[]).map((key) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-[#16263F] text-white shadow-sm" : "border border-[#E6EAF0] bg-white text-[#5B6B80] hover:text-[#16263F]"
                }`}
              >
                {c.segments[key].label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-16 rounded-[24px] border border-[#E6EAF0] bg-white p-8 shadow-sm md:grid-cols-2">
          <div>
            <h3 className="text-[#16263F] font-bold text-xl mb-3">{segment.title}</h3>
            <p className="mb-4 text-sm text-[#5B6B80]" style={{ lineHeight: 1.7 }}>{segment.body}</p>
            <div className="flex flex-col gap-2">
              {segment.bullets.map((b) => (
                <div key={b} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 flex-shrink-0 text-[#2FA98A]" />
                  <span className="text-sm text-[#1F2933]">{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-[#E6EAF0] bg-[#F7F9FB] p-6">
            {c.features.map((f, i) => (
              <div key={f} className={`flex items-center gap-2 py-2.5 ${i === c.features.length - 1 ? "" : "border-b border-[#E6EAF0]"}`}>
                <Check size={16} className="text-[#2FA98A]" />
                <span className="text-sm text-[#1F2933]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="h-12 bg-[#16263F] px-8 text-base text-white hover:bg-[#101C30]">
            {c.ctaPrimary}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-12 border-[#E6EAF0] px-8 text-base text-[#1F2933] hover:bg-[#F7F9FB]"
            onClick={() => window.location.assign(contactMailto)}
          >
            {c.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
