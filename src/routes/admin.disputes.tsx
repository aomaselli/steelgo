import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Button, Textarea } from "@/components/steel";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/disputes")({
  component: DisputesPage,
});

type Tab = "open" | "review" | "resolved";

function DisputesPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: disputes = [] } = useQuery({
    queryKey: ["admin-disputes", tab],
    queryFn: async () => {
      const statusFilter: ("disputed" | "completed" | "cancelled")[] =
        tab === "resolved" ? ["completed", "cancelled"] : ["disputed"];
      const { data } = await supabase
        .from("contracts")
        .select(
          "id, contract_number, total_amount_brl, status, created_at, freight_id, shipper_company_id, carrier_company_id",
        )
        .in("status", statusFilter)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const openCount = disputes.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-graphite-50">Central de disputas</h1>
          {openCount > 0 && tab === "open" && <Badge variant="danger">{openCount}</Badge>}
        </div>
      </div>

      <div className="flex gap-2 border-b border-graphite-700">
        {(
          [
            { id: "open", label: "Abertas" },
            { id: "review", label: "Em análise" },
            { id: "resolved", label: "Resolvidas" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium",
              tab === t.id
                ? "border-steel-blue-400 text-steel-blue-200"
                : "border-transparent text-graphite-400 hover:text-graphite-100",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {disputes.length === 0 ? (
        <div className="rounded-[16px] border border-graphite-600 bg-bg-surface p-12 text-center text-graphite-400">
          Nenhuma disputa nesta categoria.
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <DisputeCard
              key={d.id}
              dispute={d}
              expanded={expanded === d.id}
              onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DisputeCard({
  dispute,
  expanded,
  onToggle,
}: {
  dispute: {
    id: string;
    contract_number: string | null;
    total_amount_brl: number | null;
    created_at: string | null;
    freight_id: string;
    status: string | null;
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<"A" | "B" | "C" | null>(null);
  const [split, setSplit] = useState(50);
  const [reason, setReason] = useState("");

  const days = Math.floor(
    (Date.now() - new Date(dispute.created_at ?? Date.now()).getTime()) / 86400000,
  );

  async function apply() {
    if (!decision || reason.length < 20) return;
    const newStatus = decision === "B" ? "cancelled" : "completed";
    const escrow = decision === "A" ? "released" : decision === "B" ? "refunded" : "released";
    await supabase
      .from("contracts")
      .update({ status: newStatus as never, escrow_status: escrow, completed_at: new Date().toISOString() })
      .eq("id", dispute.id);
    toast.success("Decisão aplicada");
    qc.invalidateQueries({ queryKey: ["admin-disputes"] });
  }

  return (
    <div className="rounded-[16px] border border-graphite-600 bg-bg-surface p-5">
      <button onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-medium text-graphite-50">
              SG-{dispute.contract_number ?? dispute.id.slice(0, 6)}
            </span>
            <Badge variant={dispute.status === "disputed" ? "danger" : "green"}>{dispute.status}</Badge>
            <span className={cn("text-xs", days > 3 ? "text-red-400" : "text-graphite-400")}>
              {days} dias abertos
            </span>
          </div>
          <p className="mt-1 text-xs text-graphite-400">
            Valor em disputa:{" "}
            <span className="font-semibold text-graphite-200">
              {(dispute.total_amount_brl ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-graphite-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-graphite-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-5 space-y-4 border-t border-graphite-700 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-md border border-graphite-700 p-4">
              <h4 className="text-sm font-semibold text-graphite-200">🏭 Embarcador alega</h4>
              <p className="mt-2 text-xs text-graphite-400">
                Carga chegou com atraso e parte dos perfis apresentou avarias na pintura.
              </p>
            </section>
            <section className="rounded-md border border-graphite-700 p-4">
              <h4 className="text-sm font-semibold text-graphite-200">🚛 Transportadora alega</h4>
              <p className="mt-2 text-xs text-graphite-400">
                Entrega dentro da janela acordada. Lacre QR intacto na descarga.
              </p>
            </section>
          </div>

          <div className="rounded-md border-t border-graphite-700 pt-4">
            <h4 className="text-sm font-semibold text-graphite-50">Decisão do administrador</h4>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {(
                [
                  { id: "A", title: "Liberar para transportadora", desc: "Entrega confirmada. Pagamento liberado." },
                  { id: "B", title: "Reembolsar embarcador", desc: "Entrega não confirmada. Estorno total." },
                  { id: "C", title: "Divisão parcial", desc: "Liberação parcial conforme percentual." },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setDecision(opt.id)}
                  className={cn(
                    "rounded-md border p-3 text-left text-xs transition-colors",
                    decision === opt.id
                      ? "border-steel-blue-400 bg-steel-blue-100"
                      : "border-graphite-700 hover:bg-bg-elevated",
                  )}
                >
                  <div className="font-semibold text-graphite-50">{opt.title}</div>
                  <div className="mt-1 text-graphite-400">{opt.desc}</div>
                </button>
              ))}
            </div>

            {decision === "C" && (
              <div className="mt-3">
                <label className="text-xs text-graphite-400">
                  Parte para transportadora: <span className="font-bold text-graphite-50">{split}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(e) => setSplit(+e.target.value)}
                  className="mt-1 w-full"
                />
              </div>
            )}

            <Textarea
              className="mt-3"
              rows={3}
              placeholder="Justificativa (mínimo 20 caracteres)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <Button
              className="mt-3 bg-red-600 hover:bg-red-700"
              disabled={!decision || reason.length < 20}
              onClick={apply}
            >
              Aplicar decisão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
