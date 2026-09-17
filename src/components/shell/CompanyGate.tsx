// Portao de empresa (Modulo 3, delegacao B): quem tem apenas vinculos
// revogados ou convites pendentes nao entra no shell da empresa. O
// proprietario sem empresa segue o fluxo existente (onboarding).
import type { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/steel/Button";
import { AcceptInvitation } from "@/components/trip/CompanyMembersPanel";

export function CompanyGate({ children }: { children: ReactNode }) {
  const { companies, memberships, role, signOut, refreshCompanies } = useAuth();
  const blocked =
    (role === "carrier" || role === "shipper") && companies.length === 0 && memberships.length > 0;
  if (!blocked) return <>{children}</>;
  const revoked = memberships.filter((m) => m.status === "revoked").length;
  const invited = memberships.filter((m) => m.status === "invited").length;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FB] p-6">
      <div className="w-full max-w-lg rounded-[14px] border border-[#DDE7F2] bg-white p-6 shadow-[0_8px_18px_rgba(16,39,74,0.04)] space-y-4">
        <div className="flex items-center gap-2 text-[#10274A]">
          <ShieldOff className="h-5 w-5 text-red-600" />
          <h1 className="text-lg font-semibold">Sem empresa ativa</h1>
        </div>
        <p className="text-sm text-[#54657C]">
          {revoked > 0 &&
            `Seu acesso como membro foi revogado em ${revoked} empresa(s). Nenhuma tela operacional fica disponível até um novo convite. `}
          {invited > 0 &&
            `Há ${invited} convite(s) pendente(s): aceite com o token recebido para entrar na empresa.`}
        </p>
        <AcceptInvitation onDone={() => void refreshCompanies()} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshCompanies()}>
            Atualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
