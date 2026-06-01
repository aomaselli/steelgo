import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { roleHome } from "@/lib/redirects";

export function CallbackPage() {
  const { isAuthenticated, isLoading, role, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: "/login" });
      return;
    }
    if (profile && !profile.is_onboarded) {
      void navigate({ to: "/onboarding" });
    } else {
      void navigate({ to: roleHome(role) });
    }
  }, [isAuthenticated, isLoading, role, profile, navigate]);

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 text-[#1B6CB8] animate-spin" />
      <p className="text-sm text-[#8B949E]">Autenticando...</p>
    </div>
  );
}
