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
    <section className="relative overflow-hidden bg-[#101C30] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_12%,rgba(41,96,172,0.28),transparent_48%),radial-gradient(circle_at_80%_78%,rgba(26,155,94,0.15),transparent_45%),linear-gradient(180deg,#101C30_0%,#101C30_55%,#101C30_100%)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6 py-24 lg:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80">
              <Sparkles size={16} />
              {c.eyebrow}
            </div>

            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-7xl">
              <span className="block">{c.h1}</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              {c.sub}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="xl"
                className="bg-[#2FA98A] text-white hover:bg-[#1E8168]"
                onClick={() => navigate({ to: "/register", search: { role: primaryRole } as never })}
              >
                {c.ctaPrimary}
              </Button>
              <Button
                variant="ghost"
                size="xl"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                onClick={() => navigate({ to: "/login" })}
              >
                {c.ctaSecondary}
              </Button>
            </div>

            <p className="mt-6 text-sm font-medium text-slate-400">{c.note}</p>
          </div>

          <div className="rounded-[28px] border border-white/12 bg-[#101C30]/95 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-sm sm:p-10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck size={18} className="text-[#2FA98A]" />
              {c.cardTitle}
            </div>

            <div className="mt-8 space-y-4">
              {c.bullets.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/12 bg-white/5 p-4">
                  <div className="mt-0.5 rounded-full bg-[#2FA98A]/10 p-2 text-[#2FA98A]">
                    <Gauge size={16} />
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between rounded-2xl border border-white/12 bg-[#101C30]/70 px-4 py-3 text-sm text-slate-300">
              <span>{c.cardFooter}</span>
              <button className="inline-flex items-center gap-2 font-semibold text-white" type="button">
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
