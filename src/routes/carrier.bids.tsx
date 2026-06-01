import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, EmptyState, Spinner } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { steelLabel, formatBRL, formatNum } from "@/lib/steel";

export const Route = createFileRoute("/carrier/bids")({
  component: BidsPage,
});

const TABS = [
  { id: "pending", label: "Pendentes" },
  { id: "accepted", label: "Aceitas" },
  { id: "rejected", label: "Recusadas" },
  { id: "expired", label: "Expiradas" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function BidsPage() {
  const { company } = useAuth();
  const [tab, setTab] = useState<TabId>("pending");

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase.from("carriers").select("id").eq("company_id", company!.id).maybeSingle();
      return data;
    },
  });

  const { data: bids, isLoading } = useQuery({
    queryKey: ["carrier-bids", carrier?.id, tab],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase.from("bids")
        .select("*, freights(origin_city, origin_state, dest_city, dest_state, steel_type, weight_tons, budget_brl, distance_km)")
        .eq("carrier_id", carrier!.id).eq("status", tab).order("submitted_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-graphite-50">Minhas propostas</h1>
        <p className="text-graphite-200 mt-1">Acompanhe o status das suas ofertas</p>
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
      ) : !bids?.length ? (
        <EmptyState icon={Clock} title="Nenhuma proposta" description="Suas propostas aparecerão aqui." />
      ) : (
        <div className="space-y-3">
          {bids.map((b) => {
            const f = (b as { freights?: { origin_city?: string; origin_state?: string; dest_city?: string; dest_state?: string; steel_type?: string; weight_tons?: number; budget_brl?: number; distance_km?: number } }).freights;
            return (
              <Card key={b.id} className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-steel-blue-200">#{String(b.id).slice(0, 8)}</span>
                      <StatusPill status={b.status ?? "pending"} />
                      {b.ev_certified && <span className="text-xs px-2 py-0.5 rounded-full bg-esg-green-400/20 text-esg-green-400">Verde</span>}
                    </div>
                    <div className="text-sm text-graphite-100">{f?.origin_city ?? "—"}, {f?.origin_state ?? ""} → {f?.dest_city ?? "—"}, {f?.dest_state ?? ""}</div>
                    <div className="text-xs text-graphite-400">{steelLabel(f?.steel_type)} • {formatNum(f?.weight_tons)} t • {formatNum(f?.distance_km)} km</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-graphite-400">Sua proposta</div>
                    <div className="text-xl font-bold text-graphite-50 tabular-nums">{formatBRL(b.amount_brl)}</div>
                    <div className="text-xs text-graphite-400 mt-1">Orçamento: {formatBRL(f?.budget_brl)}</div>
                    {b.estimated_hours && <div className="text-xs text-graphite-400">~{b.estimated_hours}h</div>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
