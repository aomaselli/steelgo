import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    h2: "Pronto para digitalizar sua operação logística?",
    sub: "Conecte equipes, transportadoras e motoristas em uma operação mais segura, visível e eficiente.",
    ctaPrimary: "Solicitar acesso →",
  },
  en: {
    h2: "Ready to digitize your logistics operation?",
    sub: "Connect teams, carriers and drivers in a safer, more visible and efficient operation.",
    ctaPrimary: "Request access →",
  },
  es: {
    h2: "¿Listo para digitalizar tu operación logística?",
    sub: "Conecta equipos, transportistas y conductores en una operación más segura, visible y eficiente.",
    ctaPrimary: "Solicitar acceso →",
  },
} as const;

export function FinalCTASection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section className="relative overflow-hidden bg-[#0B1628] py-[100px] text-center">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(27,108,184,0.12) 0%, transparent 70%)" }} />
      <div className="relative z-10 mx-auto max-w-[760px] px-6">
        <h2 className="mb-4 text-4xl font-bold text-white">{c.h2}</h2>
        <p className="mb-8 text-lg text-[#B8C6D9]">{c.sub}</p>

        <div className="mb-6 flex flex-wrap justify-center gap-4">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="h-12 bg-[#1B6CB8] px-8 text-base text-white hover:bg-[#155A9C]">
            {c.ctaPrimary}
          </Button>
        </div>

      </div>
    </section>
  );
}
