import { useConsent, setConsent } from "@/lib/consent";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/i18n";

const CONTENT = {
  pt: {
    title: "Preferências de cookies analíticos",
    granted: "Você aceitou cookies analíticos (Google Analytics).",
    denied: "Você recusou cookies analíticos (Google Analytics).",
    unset: "Você ainda não escolheu se aceita cookies analíticos (Google Analytics).",
    accept: "Aceitar",
    decline: "Recusar",
  },
  en: {
    title: "Analytics cookie preferences",
    granted: "You have accepted analytics cookies (Google Analytics).",
    denied: "You have declined analytics cookies (Google Analytics).",
    unset: "You haven't chosen whether to accept analytics cookies (Google Analytics) yet.",
    accept: "Accept",
    decline: "Decline",
  },
  es: {
    title: "Preferencias de cookies analíticas",
    granted: "Aceptaste las cookies analíticas (Google Analytics).",
    denied: "Rechazaste las cookies analíticas (Google Analytics).",
    unset: "Todavía no elegiste si aceptas las cookies analíticas (Google Analytics).",
    accept: "Aceptar",
    decline: "Rechazar",
  },
} as const;

// Lets the user revisit/change the analytics consent choice after the initial banner decision.
export function ConsentPreferences({ language }: { language: Language }) {
  const consent = useConsent();
  const c = CONTENT[language] ?? CONTENT.en;
  const statusText = consent === "granted" ? c.granted : consent === "denied" ? c.denied : c.unset;

  return (
    <section className="border-t border-[#E2E8F0] pt-6">
      <h2 className="text-xl font-semibold text-[#0F172A]">{c.title}</h2>
      <p className="mt-4 text-sm leading-7 text-[#334155]">{statusText}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setConsent("denied")}>
          {c.decline}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConsent("granted")}>
          {c.accept}
        </Button>
      </div>
    </section>
  );
}
