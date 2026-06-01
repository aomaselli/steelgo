import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, EmptyState, Spinner } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { formatBRL } from "@/lib/steel";

export const Route = createFileRoute("/carrier/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const { company } = useAuth();

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["carrier-payments", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase.from("contracts")
        .select("*, freights(origin_city, dest_city)")
        .eq("carrier_company_id", company!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const list = contracts ?? [];
    const received = list.filter((c) => c.status === "completed").reduce((s, c) => s + Number(c.carrier_payout_brl ?? 0), 0);
    const pending = list.filter((c) => c.status === "active").reduce((s, c) => s + Number(c.carrier_payout_brl ?? 0), 0);
    const fees = list.reduce((s, c) => s + Number(c.platform_fee_brl ?? 0), 0);
    return { received, pending, fees, total: list.length };
  }, [contracts]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-graphite-50">Pagamentos</h1>
        <p className="text-graphite-200 mt-1">Histórico de recebimentos e taxas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-graphite-400 uppercase">Recebido</div>
          <div className="text-3xl font-bold mt-1 tabular-nums text-esg-green-400">{formatBRL(summary.received)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-graphite-400 uppercase">A receber</div>
          <div className="text-3xl font-bold mt-1 tabular-nums text-amber-400">{formatBRL(summary.pending)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-graphite-400 uppercase">Taxas plataforma</div>
          <div className="text-3xl font-bold mt-1 tabular-nums text-graphite-50">{formatBRL(summary.fees)}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-graphite-700">
          <h2 className="text-sm font-medium text-graphite-50">Extrato</h2>
        </div>
        {isLoading ? (
          <div className="p-8 flex justify-center"><Spinner /></div>
        ) : !contracts?.length ? (
          <EmptyState icon={DollarSign} title="Sem pagamentos ainda" description="Complete viagens para receber pagamentos." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-graphite-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Contrato</th>
                <th className="text-left px-4 py-2">Rota</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Taxa</th>
                <th className="text-right px-4 py-2">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const f = (c as { freights?: { origin_city?: string; dest_city?: string } }).freights;
                return (
                  <tr key={c.id} className="border-t border-graphite-700">
                    <td className="px-4 py-3 text-xs text-graphite-200">{c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-steel-blue-200">{c.contract_number ?? String(c.id).slice(0, 8)}</td>
                    <td className="px-4 py-3 text-graphite-100">{f?.origin_city ?? "—"} → {f?.dest_city ?? "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={c.status ?? "draft"} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-graphite-400">{formatBRL(c.platform_fee_brl)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-graphite-50 font-medium">{formatBRL(c.carrier_payout_brl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
