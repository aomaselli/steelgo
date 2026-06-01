import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

type Plan = {
  name: string;
  nameColor: string;
  price: string;
  priceClass: string;
  period: string;
  cta: string;
  ctaVariant: "primary" | "ghost";
  features: string[];
  dotColor: string;
  featured?: boolean;
  note?: string;
};

const COPY = {
  pt: {
    eyebrow: "Preços",
    h2: "Simples e transparente",
    sub: "Para embarcadores, pague apenas por frete fechado. Para transportadoras, gratuito.",
    popular: "⭐ Mais popular",
    footnote: "Para transportadoras: cadastro e uso 100% gratuitos. A taxa de 3,5% é paga pelo embarcador.",
    plans: [
      { name: "Grátis", nameColor: "#8B949E", price: "R$ 0", priceClass: "text-4xl", period: "para sempre", cta: "Começar grátis", ctaVariant: "ghost", dotColor: "#30363D", features: ["3 fretes/mês", "Matching manual", "Rastreamento básico", "Contrato digital", "Suporte email"] },
      { name: "Pro", nameColor: "#79B8F8", price: "3,5%", priceClass: "text-4xl", period: "por frete fechado", cta: "Começar agora →", ctaVariant: "primary", dotColor: "#1B6CB8", featured: true, note: "Sem custo fixo. Pague só quando fechar.", features: ["Fretes ilimitados", "Matching inteligente", "GPS tempo real", "Checkpoints + fotos", "Conta protegida automática", "Assinatura ICP-Brasil", "ESG dashboard", "Relatório PDF mensal", "WhatsApp + Push", "Suporte prioritário"] },
      { name: "Enterprise", nameColor: "#8B949E", price: "Sob consulta", priceClass: "text-2xl mt-2", period: "contrato anual", cta: "Falar com comercial", ctaVariant: "ghost", dotColor: "#30363D", features: ["Tudo do Pro", "API REST (SAP/TOTVS)", "SLA garantido", "Gerente dedicado", "Relatórios customizados", "Onboarding assistido", "Suporte 24×7"] },
    ] as Plan[],
  },
  en: {
    eyebrow: "Pricing",
    h2: "Simple and transparent",
    sub: "Shippers pay only per closed freight. Carriers use it for free.",
    popular: "⭐ Most popular",
    footnote: "Carriers: registration and use are 100% free. The 3.5% fee is paid by the shipper.",
    plans: [
      { name: "Free", nameColor: "#8B949E", price: "$0", priceClass: "text-4xl", period: "forever", cta: "Start free", ctaVariant: "ghost", dotColor: "#30363D", features: ["3 freights/month", "Manual matching", "Basic tracking", "Digital contract", "Email support"] },
      { name: "Pro", nameColor: "#79B8F8", price: "3.5%", priceClass: "text-4xl", period: "per closed freight", cta: "Get started →", ctaVariant: "primary", dotColor: "#1B6CB8", featured: true, note: "No fixed cost. Pay only on close.", features: ["Unlimited freights", "Smart matching", "Real-time GPS", "Checkpoints + photos", "Automatic escrow", "ICP-Brasil signature", "ESG dashboard", "Monthly PDF report", "WhatsApp + Push", "Priority support"] },
      { name: "Enterprise", nameColor: "#8B949E", price: "Contact us", priceClass: "text-2xl mt-2", period: "annual contract", cta: "Talk to sales", ctaVariant: "ghost", dotColor: "#30363D", features: ["Everything in Pro", "REST API (SAP/TOTVS)", "Guaranteed SLA", "Dedicated manager", "Custom reports", "Assisted onboarding", "24×7 support"] },
    ] as Plan[],
  },
} as const;

export function PricingSection() {
  const { language } = useLanguage();
  const c = COPY[language];

  return (
    <section id="precos" className="bg-[#0D1117] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-[#79B8F8] text-xs uppercase tracking-widest font-medium mb-3">{c.eyebrow}</div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#8B949E] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {c.plans.map((plan) => (
            <div key={plan.name} className={`rounded-[20px] p-6 relative ${plan.featured ? "bg-[#1B6CB8]/[0.08] border-2 border-[#1B6CB8]" : "bg-[#161B22] border border-[#30363D]"}`}>
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1B6CB8] text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">{c.popular}</div>
              )}

              <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: plan.nameColor }}>{plan.name}</div>
              <div className={`font-bold text-[#E6EDF3] ${plan.priceClass}`}>{plan.price}</div>
              <div className="text-sm text-[#484F58] mt-1 mb-6">{plan.period}</div>

              <Button className={`w-full ${plan.ctaVariant === "primary" ? "bg-[#1B6CB8] hover:bg-[#1758a0] text-white" : "bg-transparent border border-[#30363D] text-[#E6EDF3] hover:bg-[#1C2128]"}`}>
                {plan.cta}
              </Button>

              {plan.note && <div className="text-xs text-[#484F58] text-center mt-2">{plan.note}</div>}

              <div className="flex flex-col gap-2 mt-6">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: plan.dotColor }} />
                    <span className="text-sm text-[#8B949E]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center text-sm text-[#484F58] mt-8">{c.footnote}</div>
      </div>
    </section>
  );
}
