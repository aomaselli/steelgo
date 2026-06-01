import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    h2: "Pronto para digitalizar sua logística de aço?",
    sub: "Cadastre-se em menos de 5 minutos e publique seu primeiro frete hoje. Sem cartão de crédito, sem burocracia.",
    ctaPrimary: "Publicar meu primeiro frete →",
    ctaSecondary: "Falar com especialista",
    contact: "Ou fale diretamente:",
  },
  en: {
    h2: "Ready to digitize your steel logistics?",
    sub: "Sign up in under 5 minutes and post your first freight today. No credit card, no paperwork.",
    ctaPrimary: "Post my first freight →",
    ctaSecondary: "Talk to a specialist",
    contact: "Or reach us directly:",
  },
} as const;

export function FinalCTASection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language];

  return (
    <section className="relative bg-[#0D1117] py-[100px] text-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(27,108,184,0.12) 0%, transparent 70%)" }} />
      <div className="relative z-10 max-w-[760px] mx-auto px-6">
        <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
        <p className="text-[#8B949E] text-lg mb-8">{c.sub}</p>

        <div className="flex flex-wrap gap-4 justify-center mb-6">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="bg-[#1B6CB8] hover:bg-[#1758a0] text-white h-12 px-8 text-base">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="text-[#E6EDF3] hover:bg-[#1C2128] h-12 px-8 text-base">
            {c.ctaSecondary}
          </Button>
        </div>

        <div className="text-sm text-[#484F58]">
          {c.contact}{" "}
          <a href="mailto:oi@steelgo.com.br" className="text-[#3B89D4] hover:underline">oi@steelgo.com.br</a>{" "}
          · WhatsApp:{" "}
          <a href="https://wa.me/5511984339109" target="_blank" rel="noreferrer" className="text-[#3B89D4] hover:underline">(11) 98433-9109</a>
        </div>
      </div>
    </section>
  );
}
