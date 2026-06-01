import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, EmptyState, Spinner } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { GreenFreightTag } from "@/components/steel/GreenFreightTag";
import { steelLabel, formatBRL, formatNum } from "@/lib/steel";

type TabKey = "all" | "active" | "in_transit" | "done" | "draft";

const TABS: { id: TabKey; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Ativos" },
  { id: "in_transit", label: "Em trânsito" },
  { id: "done", label: "Concluídos" },
  { id: "draft", label: "Rascunhos" },
];

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  all: { title: "Nenhum frete ainda", description: "Comece criando seu primeiro frete." },
  active: { title: "Nenhum frete ativo", description: "Publique um novo frete para começar a receber propostas." },
  in_transit: { title: "Nenhum frete em trânsito", description: "Quando contratados, eles aparecerão aqui." },
  done: { title: "Nenhum frete concluído", description: "Histórico de entregas finalizadas aparece aqui." },
  draft: { title: "Nenhum rascunho", description: "Rascunhos salvos durante a criação aparecem aqui." },
};

export function FreightsPage() {
  const { company } = useAuth();
  const [tab, setTab] = useState<TabKey>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-all-freights", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("freights")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    switch (tab) {
      case "active":
        return list.filter((f) =>
          ["published", "bidding", "matched", "contract_pending", "contracted"].includes(f.status ?? ""),
        );
      case "in_transit":
        return list.filter((f) => f.status === "in_transit");
      case "done":
        return list.filter((f) => f.status === "delivered" || f.status === "completed");
      case "draft":
        return list.filter((f) => f.status === "draft");
      default:
        return list;
    }
  }, [data, tab]);

  return (
    <AppShell title="Meus Fretes">
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#E6EDF3]">Meus fretes</h1>
            <p className="text-sm text-[#8B949E] mt-1">Gerencie todas as suas cargas</p>
          </div>
          <Link to="/shipper/freights/new">
            <Button><Plus className="w-4 h-4" />Publicar novo frete</Button>
          </Link>
        </div>

        <div className="flex gap-2 border-b border-[#30363D]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm transition border-b-2 -mb-px ${
                tab === t.id
                  ? "border-steel-blue-400 text-[#E6EDF3]"
                  : "border-transparent text-[#8B949E] hover:text-[#C9D1D9]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : !filtered.length ? (
            <EmptyState
              title={EMPTY_COPY[tab].title}
              description={EMPTY_COPY[tab].description}
              action={
                <Link to="/shipper/freights/new">
                  <Button>Publicar frete</Button>
                </Link>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-[#8B949E] text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">ID</th>
                  <th className="text-left px-4 py-2">Rota</th>
                  <th className="text-left px-4 py-2">Tipo</th>
                  <th className="text-right px-4 py-2">Peso</th>
                  <th className="text-left px-4 py-2">Categoria</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr
                    key={f.id}
                    className="border-t border-[#30363D] hover:bg-[#161B22] cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[#79B8F8]">
                      <Link to="/shipper/freights/$id" params={{ id: String(f.id) }}>
                        {String(f.id).slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#C9D1D9]">
                      <Link to="/shipper/freights/$id" params={{ id: String(f.id) }}>
                        {f.origin_city ?? "—"} → {f.dest_city ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#8B949E]">{steelLabel(f.steel_type)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#C9D1D9]">
                      {formatNum(f.weight_tons)} t
                    </td>
                    <td className="px-4 py-3"><GreenFreightTag category={f.category} /></td>
                    <td className="px-4 py-3"><StatusPill status={f.status ?? "draft"} /></td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-[#C9D1D9]">
                      {formatBRL(f.final_price_brl ?? f.budget_brl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
