import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, EmptyState, Spinner } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { formatBRL } from "@/lib/steel";

export const Route = createFileRoute("/carrier/trips/")({
  component: TripsPage,
});

const TABS = [
  { id: "active", label: "Ativas", statuses: ["active", "awaiting_carrier_signature", "awaiting_shipper_signature"] },
  { id: "completed", label: "Concluídas", statuses: ["completed"] },
  { id: "cancelled", label: "Canceladas", statuses: ["cancelled", "disputed"] },
] as const;

function TripsPage() {
  const { company } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("active");
  const statuses = TABS.find((t) => t.id === tab)!.statuses;

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["carrier-trips", company?.id, tab],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase.from("contracts")
        .select("*, freights(origin_city, origin_state, dest_city, dest_state, pickup_date, weight_tons)")
        .eq("carrier_company_id", company!.id)
        .in("status", statuses as never)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-graphite-50">Viagens</h1>
        <p className="text-graphite-200 mt-1">Contratos e operações</p>
      </div>

      <div className="flex gap-1 border-b border-graphite-700">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors ${tab === t.id ? "text-steel-blue-200 border-b-2 border-steel-blue-200 -mb-px" : "text-graphite-400 hover:text-graphite-100"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : !contracts?.length ? (
        <EmptyState icon={Package} title="Nenhuma viagem" description="Suas viagens aparecerão aqui." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-graphite-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Contrato</th>
                <th className="text-left px-4 py-2">Rota</th>
                <th className="text-left px-4 py-2">Coleta</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const f = (c as { freights?: { origin_city?: string; dest_city?: string; pickup_date?: string } }).freights;
                return (
                  <tr key={c.id} className="border-t border-graphite-700">
                    <td className="px-4 py-3 font-mono text-xs text-steel-blue-200">{c.contract_number ?? String(c.id).slice(0, 8)}</td>
                    <td className="px-4 py-3 text-graphite-100">{f?.origin_city ?? "—"} → {f?.dest_city ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-graphite-200">{f?.pickup_date ? new Date(f.pickup_date).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={c.status ?? "draft"} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-graphite-50">{formatBRL(c.carrier_payout_brl)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/carrier/trips/$id" params={{ id: String(c.id) }}>
                        <Button variant="ghost" size="sm">Abrir</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
