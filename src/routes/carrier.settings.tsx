import { createFileRoute } from "@tanstack/react-router";
import { CompanyMembersPanel } from "@/components/trip/CompanyMembersPanel";

export const Route = createFileRoute("/carrier/settings")({
  component: () => (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#10274A]">Configurações</h1>
      <CompanyMembersPanel />
    </div>
  ),
});
