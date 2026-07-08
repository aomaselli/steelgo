import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    title: "Solicite acesso à SteelGo",
    subtitle:
      "A SteelGo está sendo construída para equipes de logística industrial que precisam de visibilidade, compliance e controle operacional ao longo da jornada do frete.",
    ctaPrimary: "Solicitar acesso",
    ctaSecondary: "Falar com especialista",
  },
  en: {
    title: "Request access to SteelGo",
    subtitle:
      "SteelGo is being built for industrial logistics teams that need visibility, compliance and operational control across the freight journey.",
    ctaPrimary: "Request access",
    ctaSecondary: "Talk to a specialist",
  },
  es: {
    title: "Solicita acceso a SteelGo",
    subtitle:
      "SteelGo está siendo construida para equipos de logística industrial que necesitan visibilidad, cumplimiento y control operativo en toda la jornada del flete.",
    ctaPrimary: "Solicitar acceso",
    ctaSecondary: "Hablar con un especialista",
  },
} as const;

export function RequestAccessSection() {
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
    <section className="bg-[#F7F9FB] py-[100px]">
      <div className="mx-auto max-w-[860px] rounded-[24px] border border-[#D8E1EA] bg-white px-8 py-12 text-center shadow-sm sm:px-10">
        <h2 className="text-3xl font-semibold text-[#0F172A] sm:text-4xl">{c.title}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#475569]">{c.subtitle}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button
            size="lg"
            onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })}
            className="h-12 bg-[#1B6CB8] px-8 text-base text-white hover:bg-[#1758a0]"
          >
            {c.ctaPrimary}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-12 border-[#D8E1EA] px-8 text-base text-[#334155] hover:bg-[#F8FAFC]"
            onClick={() => window.location.assign(contactMailto)}
          >
            {c.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
