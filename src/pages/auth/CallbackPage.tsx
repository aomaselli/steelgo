import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { roleHome } from "@/lib/redirects";
import { supabase } from "@/integrations/supabase/client";

export function CallbackPage() {
  const { isAuthenticated, isLoading, role, profile, company, user, refresh } = useAuth();
  const navigate = useNavigate();
  const [completingCompany, setCompletingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const maybeCompleteCompany = async () => {
      if (isLoading || !isAuthenticated || !user || !role) return;
      if (company || (role !== "shipper" && role !== "carrier")) {
        return;
      }

      const pendingCompany = (user.user_metadata as { pending_company?: Record<string, unknown> } | undefined)?.pending_company;
      if (!pendingCompany) {
        return;
      }

      if (!active) return;
      setCompletingCompany(true);
      setCompanyError(null);

      try {
        const { error } = await supabase.rpc("complete_company_registration");
        if (error) throw error;
        await refresh();
        await supabase.auth.updateUser({ data: { pending_company: null } });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Não foi possível concluir o cadastro da empresa.";
        setCompanyError(message);
      } finally {
        if (active) setCompletingCompany(false);
      }
    };

    void maybeCompleteCompany();
    return () => {
      active = false;
    };
  }, [company, isAuthenticated, isLoading, refresh, role, user]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: "/login" });
      return;
    }
    if (companyError) {
      return;
    }
    if ((role === "shipper" || role === "carrier") && !company && !completingCompany) {
      const pendingCompany = (user?.user_metadata as { pending_company?: Record<string, unknown> } | undefined)?.pending_company;
      if (pendingCompany) {
        return;
      }
    }
    if (profile && !profile.is_onboarded) {
      void navigate({ to: "/onboarding" });
    } else {
      void navigate({ to: roleHome(role) });
    }
  }, [company, companyError, completingCompany, isAuthenticated, isLoading, navigate, profile, role, user]);

  if (companyError) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-[#E6EDF3]">Não foi possível concluir o cadastro</h1>
        <p className="max-w-md text-sm text-[#F85149]">{companyError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 text-[#1B6CB8] animate-spin" />
      <p className="text-sm text-[#8B949E]">{completingCompany ? "Concluindo cadastro da empresa..." : "Autenticando..."}</p>
    </div>
  );
}
