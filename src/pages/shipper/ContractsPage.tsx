import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, EmptyState, Spinner, Button } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { formatBRL } from "@/lib/steel";

const FILTERS = [
  { id: "all", label: "Todos", statuses: null as string[] | null },
  { id: "signing", label: "Aguardando assinatura", statuses: ["awaiting_shipper_signature", "awaiting_carrier_signature", "draft"] },
  { id: "active", label: "Ativos", statuses: ["active"] },
  { id: "completed", label: "Concluídos", statuses: ["completed"] },
  { id: "disputed", label: "Disputados", statuses: ["disputed"] },
];

export function ContractsPage() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const f = FILTERS.find((x) => x.id === filter)!;

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-contracts", company?.id, filter],
    enabled: !!company?.id,
    queryFn: async () => {
      let q = supabase
        .from("contracts")
        .select("*, freights(id, origin_city, dest_city, origin_state, dest_state), carrier_company:carrier_company_id (name)")
        .eq("shipper_company_id", company!.id)
        .order("created_at", { ascending: false });
      if (f.statuses) q = q.in("status", f.statuses as never);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <AppShell title="Meus Contratos">
      <div className="p-6 space-y-6">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((x) => (
            <button
              key={x.id}
              onClick={() => setFilter(x.id)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                filter === x.id
                  ? "bg-steel-blue-200/20 text-steel-blue-200 border border-steel-blue-200/30"
                  : "bg-bg-elevated text-graphite-300 border border-graphite-700 hover:text-graphite-100"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : !data?.length ? (
            <EmptyState icon={FileText} title="Nenhum contrato" description="Aceite uma proposta para gerar um contrato." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-xs uppercase text-graphite-400">
                <tr>
                  <th className="text-left px-4 py-2">Número</th>
                  <th className="text-left px-4 py-2">Rota</th>
                  <th className="text-left px-4 py-2">Transportadora</th>
                  <th className="text-right px-4 py-2">Valor</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const fr = c.freights as { id?: string; origin_city?: string; dest_city?: string } | null;
                  const ca = (c as { carrier_company?: { name?: string } | null }).carrier_company;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-graphite-700 hover:bg-bg-elevated cursor-pointer"
                      onClick={() => navigate({ to: "/shipper/contracts/$id", params: { id: String(c.id) } })}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-steel-blue-200">{c.contract_number ?? String(c.id).slice(0, 8)}</td>
                      <td className="px-4 py-3 text-graphite-100">{fr?.origin_city ?? "—"} → {fr?.dest_city ?? "—"}</td>
                      <td className="px-4 py-3 text-graphite-200">{ca?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatBRL(c.total_amount_brl)}</td>
                      <td className="px-4 py-3"><StatusPill status={c.status ?? "draft"} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm">Ver →</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
