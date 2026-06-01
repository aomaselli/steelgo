import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Button } from "@/components/steel";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/carriers")({
  component: CarriersPage,
});

function CarriersPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-carriers"],
    queryFn: async () => {
      const { data: carriers } = await supabase
        .from("carriers")
        .select("id, company_id, antt_rntrc, rctr_c_active, fleet_size, has_ev_trucks, ev_truck_count, is_active")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!carriers?.length) return [];
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, cnpj, is_verified, address_city, address_state")
        .in("id", carriers.map((c) => c.company_id));
      return carriers.map((c) => ({ ...c, company: companies?.find((co) => co.id === c.company_id) }));
    },
  });

  async function setVerified(companyId: string, value: boolean) {
    await supabase.from("companies").update({ is_verified: value }).eq("id", companyId);
    toast.success(value ? "Aprovada" : "Verificação removida");
    qc.invalidateQueries({ queryKey: ["admin-carriers"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-graphite-50">Transportadoras</h1>
        <Badge variant="blue">{data.length}</Badge>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-graphite-600 bg-bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-graphite-400">
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">ANTT</th>
              <th className="px-4 py-3">Frota</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {data.map((c) => (
              <tr key={c.id} className="hover:bg-bg-elevated">
                <td className="px-4 py-3">
                  <div className="font-medium text-graphite-50">{c.company?.name ?? "—"}</div>
                  <div className="text-xs text-graphite-400">
                    {c.company?.address_city}/{c.company?.address_state}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-graphite-300">{c.company?.cnpj ?? "—"}</td>
                <td className="px-4 py-3 text-graphite-200">{c.antt_rntrc ?? "—"}</td>
                <td className="px-4 py-3 text-graphite-200">
                  {c.fleet_size ?? 0} {c.has_ev_trucks && <Badge variant="green">EV {c.ev_truck_count}</Badge>}
                </td>
                <td className="px-4 py-3">
                  {c.company?.is_verified ? (
                    <Badge variant="green">Verificada</Badge>
                  ) : (
                    <Badge variant="amber">Pendente</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.company?.is_verified ? (
                    <Button variant="ghost" size="sm" onClick={() => setVerified(c.company_id, false)}>
                      <XCircle className="mr-1 h-3 w-3" /> Revogar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setVerified(c.company_id, true)}>
                      <CheckCircle2 className="mr-1 h-3 w-3 text-esg-green-400" /> Aprovar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-graphite-400">
                  Nenhuma transportadora cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
