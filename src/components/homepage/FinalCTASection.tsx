import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    h2: "Pronto para digitalizar sua logística de aço?",
    sub: "Cadastre-se em menos de 5 minutos e publique seu primeiro frete hoje. Sem cartão de crédito, sem burocracia.",
    ctaPrimary: "Publicar meu primeiro frete →",
    ctaSecondary: "Falar com especialista",
    contact: "Contato:",
  },
  en: {
    h2: "Ready to digitize your steel logistics?",
    sub: "Sign up in under 5 minutes and post your first freight today. No credit card, no paperwork.",
    ctaPrimary: "Post my first freight →",
    ctaSecondary: "Talk to a specialist",
    contact: "Contact:",
  },
  es: {
    h2: "¿Listo para digitalizar tu logística de acero?",
    sub: "Regístrate en menos de 5 minutos y publica tu primer flete hoy. Sin tarjeta de crédito y sin burocracia.",
    ctaPrimary: "Publicar mi primer flete →",
    ctaSecondary: "Hablar con un especialista",
    contact: "Contacto:",
  },
} as const;

export function FinalCTASection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const contactMailto =
    language === "en"
      ? "mailto:ariane@steelgoapp.com?subject=SteelGo%20contact&body=Hello%2C%20I%20would%20like%20to%20learn%20more%20about%20SteelGo."
      : language === "es"
        ? "mailto:ariane@steelgoapp.com?subject=Contacto%20SteelGo&body=Hola%2C%20me%20gustaría%20saber%20más%20sobre%20SteelGo."
        : "mailto:ariane@steelgoapp.com?subject=Contato%20SteelGo&body=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20a%20SteelGo.";

  return (
    <section className="relative overflow-hidden bg-[#F7F9FB] py-[100px] text-center">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(27,108,184,0.12) 0%, transparent 70%)" }} />
      <div className="relative z-10 mx-auto max-w-[760px] px-6">
        <h2 className="mb-4 text-4xl font-bold text-[#16263F]">{c.h2}</h2>
        <p className="mb-8 text-lg text-[#5B6B80]">{c.sub}</p>

        <div className="mb-6 flex flex-wrap justify-center gap-4">
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

        <div className="text-sm text-[#9AA6B2]">
          {c.contact}{" "}
          <a href={contactMailto} className="text-[#16263F] hover:underline">ariane@steelgoapp.com</a>
        </div>
      </div>
    </section>
  );
}
