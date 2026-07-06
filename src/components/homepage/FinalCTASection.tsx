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
  const c = COPY[language] ?? COPY.en;

  return (
    <section className="relative overflow-hidden bg-[#F7F9FB] py-[100px] text-center">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(27,108,184,0.12) 0%, transparent 70%)" }} />
      <div className="relative z-10 mx-auto max-w-[760px] px-6">
        <h2 className="mb-4 text-4xl font-bold text-[#0F172A]">{c.h2}</h2>
        <p className="mb-8 text-lg text-[#475569]">{c.sub}</p>

        <div className="mb-6 flex flex-wrap justify-center gap-4">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="h-12 bg-[#1B6CB8] px-8 text-base text-white hover:bg-[#1758a0]">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="h-12 border-[#D8E1EA] px-8 text-base text-[#334155] hover:bg-[#F8FAFC]">
            {c.ctaSecondary}
          </Button>
        </div>

        <div className="text-sm text-[#64748B]">
          {c.contact}{" "}
          <a href="mailto:oi@steelgo.com.br" className="text-[#1B6CB8] hover:underline">oi@steelgo.com.br</a>{" "}
          · WhatsApp:{" "}
          <a href="https://wa.me/5511984339109" target="_blank" rel="noreferrer" className="text-[#1B6CB8] hover:underline">(11) 98433-9109</a>
        </div>
      </div>
    </section>
  );
}
