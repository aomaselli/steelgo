// Portao de onboarding (P1): antes desta correcao o desvio para /onboarding
// existia apenas no pos-login, entao digitar /carrier/trips (ou recarregar a
// pagina) abria o shell da empresa com o cadastro incompleto — menus quase
// vazios e botoes que dependem de dados inexistentes.
//
// Este portao e de NAVEGACAO. A autoridade sobre dados continua no servidor
// (RLS + policies); aqui apenas levamos a pessoa ao unico passo util.
import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { onboardingRedirect } from "@/lib/onboardingGate";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/steel/Button";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { isLoading, role, profile, companies } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { t } = useLanguage();

  const destino = isLoading
    ? null
    : onboardingRedirect({
        role,
        isOnboarded: profile?.is_onboarded,
        companies,
        pathname,
      });

  useEffect(() => {
    if (destino) void navigate({ to: destino });
  }, [destino, navigate]);

  if (!destino) return <>{children}</>;

  // enquanto o roteador nao troca de tela, explicamos o motivo em vez de piscar
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FB] p-6">
      <div className="w-full max-w-md space-y-3 rounded-[14px] border border-[#DDE7F2] bg-white p-6 text-center shadow-[0_8px_18px_rgba(16,39,74,0.04)]">
        <ClipboardList className="mx-auto h-6 w-6 text-[#1B6CB8]" />
        <h1 className="text-lg font-semibold text-[#10274A]">{t("onboardingGate.title")}</h1>
        <p className="text-sm text-[#54657C]">{t("onboardingGate.description")}</p>
        <Button size="sm" onClick={() => void navigate({ to: "/onboarding" })}>
          {t("onboardingGate.action")}
        </Button>
      </div>
    </div>
  );
}
