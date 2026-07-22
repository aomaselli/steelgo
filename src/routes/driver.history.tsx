import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, TruckIcon, Star, X } from "lucide-react";
import { DriverShell } from "@/components/driver/DriverShell";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/driver/history")({ component: HistoryPage });

function HistoryPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<any | null>(null);

  const { data: deliveries = [] } = useQuery({
    queryKey: ["driver-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, status, total_amount_brl, completed_at, freight_id, created_at")
        .eq("driver_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!data?.length) return [];
      const fIds = data.map((d) => d.freight_id);
      const { data: freights } = await supabase
        .from("freights")
        .select("id, origin_state, dest_state, weight_tons, steel_type")
        .in("id", fIds);
      return data.map((c) => ({ ...c, freight: freights?.find((f) => f.id === c.freight_id) }));
    },
  });

  const monthDeliveries = deliveries.filter((d) => {
    if (!d.completed_at) return false;
    const dt = new Date(d.completed_at);
    const now = new Date();
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  });
  const monthTotal = monthDeliveries.reduce((s, d) => s + Number(d.total_amount_brl ?? 0), 0);

  return (
    <DriverShell activeTab="history">
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <h1 className="text-[18px] font-medium text-graphite-50">Histórico</h1>
        <span
          className="text-[11px] px-2.5 py-1 rounded-full font-medium tabular-nums"
          style={{ background: "rgba(46,204,138,0.15)", color: "#2ECC8A" }}
        >
          R$ {monthTotal.toLocaleString("pt-BR")} este mês
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 px-4">
        <div className="rounded-[12px] bg-bg-surface p-3.5 text-center">
          <div className="text-[24px] font-medium text-graphite-50 tabular-nums">{monthDeliveries.length}</div>
          <div className="text-[12px] text-graphite-200">Entregas</div>
        </div>
        <div className="rounded-[12px] bg-bg-surface p-3.5 text-center">
          <div className="text-[24px] font-medium text-esg-green-400 tabular-nums">
            R$ {(monthTotal / 1000).toFixed(1)}k
          </div>
          <div className="text-[12px] text-graphite-200">Ganhos</div>
        </div>
      </div>

      <div className="mt-4 mx-4">
        {deliveries.length === 0 ? (
          <div className="text-center py-16">
            <TruckIcon size={56} className="text-graphite-400 mx-auto" strokeWidth={1.5} />
            <div className="text-[15px] text-graphite-50 mt-3">Nenhuma entrega ainda</div>
            <div className="text-[13px] text-graphite-200">Suas entregas aparecerão aqui</div>
          </div>
        ) : (
          <div className="rounded-[14px] bg-bg-surface overflow-hidden">
            {deliveries.map((d, i) => {
              const done = d.status === "completed";
              return (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className="w-full flex items-center gap-3 px-4 text-left"
                  style={{
                    minHeight: 72,
                    borderBottom: i === deliveries.length - 1 ? undefined : "1px solid #21262D",
                  }}
                >
                  <div
                    className="rounded-full flex items-center justify-center"
                    style={{ width: 36, height: 36, background: done ? "rgba(26,155,94,0.15)" : "rgba(240,165,0,0.15)" }}
                  >
                    {done ? (
                      <CheckCircle2 size={20} className="text-esg-green-400" />
                    ) : (
                      <Clock size={20} className="text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] text-graphite-50">
                      {d.freight?.origin_state ?? "—"} → {d.freight?.dest_state ?? "—"}
                    </div>
                    <div className="text-[12px] text-graphite-200 truncate">
                      {new Date(d.created_at!).toLocaleDateString("pt-BR")} · {d.freight?.weight_tons ?? "—"}t ·{" "}
                      {d.freight?.steel_type ?? "carga"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] text-esg-green-400 tabular-nums">
                      R$ {Number(d.total_amount_brl ?? 0).toLocaleString("pt-BR")}
                    </div>
                    {done && (
                      <div className="flex gap-0.5 mt-0.5 justify-end">
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-[430px] bg-bg-surface rounded-t-[20px] p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-medium text-graphite-50">Detalhes da entrega</h2>
              <button onClick={() => setSelected(null)} className="rounded-full bg-graphite-700 p-1.5">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-[14px] text-graphite-100">
              <div>
                <span className="text-graphite-400">Contrato:</span> #{selected.id.slice(0, 8)}
              </div>
              <div>
                <span className="text-graphite-400">Rota:</span> {selected.freight?.origin_state} →{" "}
                {selected.freight?.dest_state}
              </div>
              <div>
                <span className="text-graphite-400">Carga:</span> {selected.freight?.steel_type} ·{" "}
                {selected.freight?.weight_tons}t
              </div>
              <div>
                <span className="text-graphite-400">Pagamento:</span>{" "}
                <span className="text-esg-green-400 tabular-nums">
                  R$ {Number(selected.total_amount_brl ?? 0).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </DriverShell>
  );
}
