import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "Tecnologia para logística industrial",
    h1: <>Conectando a logística industrial na América Latina.</>,
    sub: "A SteelGo conecta operações industriais, transportadoras e motoristas em uma infraestrutura digital para controle, rastreamento e visibilidade em tempo real.",
    ctaPrimary: "Solicitar acesso",
    ctaSecondary: "Entrar",
    cardTitle: "Projetado para equipes modernas de logística",
    cardFooter: "Conectado com equipes de operações",
    cardCta: "Explorar o fluxo de trabalho",
    bullets: [
      "Fluxos digitais desde a cotação até a entrega",
      "Rastreamento e visibilidade em tempo real",
      "Compliance, assinatura e evidências digitais por padrão.",
    ],
    note: "Sem processos dispersos. Mais controle, menos retrabalho.",
  },
  en: {
    eyebrow: "Technology for Industrial Logistics",
    h1: <>Connecting industrial logistics across Latin America.</>,
    sub: "SteelGo connects industrial operations, carriers and drivers through a digital infrastructure for control, tracking and real-time visibility.",
    ctaPrimary: "Request access",
    ctaSecondary: "Sign in",
    cardTitle: "Built for modern logistics teams",
    cardFooter: "Trusted by operations teams",
    cardCta: "Explore the workflow",
    bullets: [
      "Digital flows from quote to delivery",
      "Live tracking and operational visibility",
      "Compliance, signatures and digital evidence by default.",
    ],
    note: "Less noise, more control across every leg of the shipment.",
  },
  es: {
    eyebrow: "Tecnología para logística industrial",
    h1: <>Conectando la logística industrial en América Latina.</>,
    sub: "SteelGo conecta operaciones industriales, transportistas y conductores en una infraestructura digital para control, rastreo y visibilidad en tiempo real.",
    ctaPrimary: "Solicitar acceso",
    ctaSecondary: "Ingresar",
    cardTitle: "Diseñado para equipos modernos de logística",
    cardFooter: "Conectado con equipos de operaciones",
    cardCta: "Explorar el flujo de trabajo",
    bullets: [
      "Flujos digitales desde la cotización hasta la entrega",
      "Seguimiento en tiempo real y visibilidad operativa",
      "Cumplimiento, firmas y evidencias digitales por defecto.",
    ],
    note: "Menos ruido, más control en cada etapa del traslado.",
  },
} as const;

export function HeroSection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const currentRole =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("role") ?? "shipper"
      : "shipper";
  const primaryRole = currentRole === "carrier" ? "carrier" : "shipper";

  return (
    <section className="relative overflow-hidden homepage-shell">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(26,155,94,0.16),transparent_45%)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6 py-24 lg:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="homepage-pill mb-6 px-4 py-1.5 text-sm font-medium">
              <Sparkles size={16} />
              {c.eyebrow}
            </div>

            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[#0f172a] sm:text-5xl lg:text-7xl">
              <span className="block">{c.h1}</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-[#334155]">
              {c.sub}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="xl"
                onClick={() => navigate({ to: "/register", search: { role: primaryRole } as never })}
              >
                {c.ctaPrimary}
              </Button>
              <Button variant="ghost" size="xl" onClick={() => navigate({ to: "/login" })}>
                {c.ctaSecondary}
              </Button>
            </div>

            <p className="mt-6 text-sm font-medium text-[#475569]">{c.note}</p>
          </div>

          <div className="homepage-card rounded-[28px] p-8 sm:p-10">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <ShieldCheck size={18} className="text-[#1A9B5E]" />
              {c.cardTitle}
            </div>

            <div className="mt-8 space-y-4">
              {c.bullets.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-[#dbe8f8] bg-[#f8fbff] p-4">
                  <div className="mt-0.5 rounded-full bg-[#1A9B5E]/10 p-2 text-[#1A9B5E]">
                    <Gauge size={16} />
                  </div>
                  <p className="text-sm leading-6 text-[#334155]">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between rounded-2xl border border-[#dbe8f8] bg-white/80 px-4 py-3 text-sm text-[#475569]">
              <span>{c.cardFooter}</span>
              <button className="inline-flex items-center gap-2 font-semibold text-[#0f172a]" type="button">
                {c.cardCta}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
