import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/steel";

const COPY = {
  pt: {
    label: "Preços",
    headline: "Simples, transparente e baseado em sucesso",
    desc: "Sem mensalidade. Você só paga quando fecha um frete.",
    plans: [
      {
        name: "Embarcador",
        price: "Grátis",
        sub: "Publique fretes sem custo",
        items: ["Publicação ilimitada", "Recebe propostas", "Contrato digital", "Conta protegida", "Dashboard ESG"],
        cta: "Começar agora",
        role: "shipper" as const,
      },
      {
        name: "Transportadora",
        price: "5%",
        sub: "do valor do frete fechado",
        items: ["Acesso ao marketplace", "Lances ilimitados", "Pagamento D+1", "Frete de retorno sugerido", "Gestão de frota"],
        cta: "Cadastrar transportadora",
        role: "carrier" as const,
        highlight: true,
      },
      {
        name: "Enterprise",
        price: "Custom",
        sub: "Para grandes siderúrgicas",
        items: ["API dedicada", "SLA garantido", "Integração ERP", "Suporte 24/7", "Relatórios sob medida"],
        cta: "Falar com vendas",
        role: "shipper" as const,
      },
    ],
  },
  en: {
    label: "Pricing",
    headline: "Simple, transparent, success-based",
    desc: "No monthly fee. You pay only when you close a freight.",
    plans: [
      {
        name: "Shipper",
        price: "Free",
        sub: "Post freight at no cost",
        items: ["Unlimited posting", "Receive bids", "Digital contract", "Conta protegida", "ESG dashboard"],
        cta: "Get started",
        role: "shipper" as const,
      },
      {
        name: "Carrier",
        price: "5%",
        sub: "of closed freight value",
        items: ["Marketplace access", "Unlimited bids", "D+1 payment", "Return freight suggestions", "Fleet management"],
        cta: "Sign up as carrier",
        role: "carrier" as const,
        highlight: true,
      },
      {
        name: "Enterprise",
        price: "Custom",
        sub: "For large steel mills",
        items: ["Dedicated API", "Guaranteed SLA", "ERP integration", "24/7 support", "Custom reports"],
        cta: "Talk to sales",
        role: "shipper" as const,
      },
    ],
  },
};

export function Pricing() {
  const { language } = useLanguage();
  const c = COPY[language];
  return (
    <section id="pricing" className="border-b border-graphite-800 bg-bg-surface/30 py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-steel-blue-400">{c.label}</span>
          <h2 className="mt-2 text-3xl font-bold text-graphite-50 md:text-4xl">{c.headline}</h2>
          <p className="mt-3 text-graphite-300">{c.desc}</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {c.plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border p-6 ${
                p.highlight
                  ? "border-steel-blue-400 bg-bg-surface ring-2 ring-steel-blue-400/30"
                  : "border-graphite-800 bg-bg-surface"
              }`}
            >
              <div className="text-sm font-semibold text-graphite-400">{p.name}</div>
              <div className="mt-2 text-4xl font-bold text-graphite-50">{p.price}</div>
              <div className="mt-1 text-sm text-graphite-400">{p.sub}</div>
              <ul className="mt-6 space-y-3">
                {p.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-sm text-graphite-200">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-esg-green" />
                    {it}
                  </li>
                ))}
              </ul>
              <Link to="/register" search={{ role: p.role }} className="mt-8 block">
                <Button variant={p.highlight ? "primary" : "outline"} className="w-full" size="lg">
                  {p.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
