import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    title: "Solicite acesso à SteelGo",
    subtitle: "Conecte sua operação à infraestrutura digital logística da América Latina.",
    ctaPrimary: "Solicitar acesso",
  },
  en: {
    title: "Request access to SteelGo",
    subtitle: "Connect your operation to Latin America's digital logistics infrastructure.",
    ctaPrimary: "Request access",
  },
  es: {
    title: "Solicita acceso a SteelGo",
    subtitle: "Conecta tu operación a la infraestructura logística digital de América Latina.",
    ctaPrimary: "Solicitar acceso",
  },
} as const;

export function RequestAccessSection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section id="request-access" className="bg-[#F7F9FB] py-[100px]">
      <div className="mx-auto max-w-[860px] rounded-[24px] border border-[#E6EAF0] bg-white px-8 py-12 text-center shadow-sm sm:px-10">
        <h2 className="text-3xl font-semibold text-[#16263F] sm:text-4xl">{c.title}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#5B6B80]">{c.subtitle}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button
            size="lg"
            onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })}
            className="h-12 bg-[#1B6CB8] px-8 text-base text-white hover:bg-[#155A9C]"
          >
            {c.ctaPrimary}
          </Button>
        </div>
      </div>
    </section>
  );
}
