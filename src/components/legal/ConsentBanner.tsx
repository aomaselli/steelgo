import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { useConsent, setConsent } from "@/lib/consent";

const CONTENT = {
  pt: {
    message:
      "Usamos cookies analíticos (Google Analytics) para entender páginas visitadas, origem do acesso e localização aproximada (cidade/região). Não coletamos nome, e-mail, CPF, telefone, placa ou outros dados pessoais identificáveis.",
    accept: "Aceitar",
    decline: "Recusar",
    policy: "Política de Cookies",
  },
  en: {
    message:
      "We use analytics cookies (Google Analytics) to understand pages visited, traffic source and approximate location (city/region). We do not collect name, email, national ID, phone, plate or other personally identifiable data.",
    accept: "Accept",
    decline: "Decline",
    policy: "Cookie Policy",
  },
  es: {
    message:
      "Usamos cookies analíticas (Google Analytics) para entender páginas visitadas, origen del acceso y ubicación aproximada (ciudad/región). No recopilamos nombre, correo electrónico, documento, teléfono, placa u otros datos personales identificables.",
    accept: "Aceptar",
    decline: "Rechazar",
    policy: "Política de Cookies",
  },
} as const;

export function ConsentBanner() {
  const { language } = useLanguage();
  const consent = useConsent();
  const c = CONTENT[language] ?? CONTENT.en;

  if (consent !== "unset") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {c.message}{" "}
          <Link to="/cookies" className="underline underline-offset-2">
            {c.policy}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setConsent("denied")}>
            {c.decline}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConsent("granted")}>
            {c.accept}
          </Button>
        </div>
      </div>
    </div>
  );
}
