// Seguranca operacional (Modulo 3): fila de alertas criticos (SOS) e
// ocorrencias abertas, por RPC de admin. A tabela legada security_alerts
// foi congelada (leitura historica em Governanca -> tabelas legadas).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Badge, Button } from "@/components/steel";
import { ReasonAction } from "@/components/trip/TripDetailView";
import { fetchOperationalAlerts, fetchSosQueue, rpcAcknowledgeSos } from "@/lib/trips";
import { ALERT_KIND_LABEL, fmtDateTime } from "@/lib/tripStatus";

export const Route = createFileRoute("/admin/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const qc = useQueryClient();
  const { data: sos = [] } = useQuery({
    queryKey: ["sos-queue"],
    queryFn: fetchSosQueue,
    refetchInterval: 15_000,
  });
  const { data: alerts = [] } = useQuery({
    queryKey: ["op-alerts", "all"],
    queryFn: () => fetchOperationalAlerts("all", 100),
    refetchInterval: 60_000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sos-queue"] });
    qc.invalidateQueries({ queryKey: ["op-alerts"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[#10274A]">Segurança</h1>
        <Link to="/admin/operations">
          <Button variant="outline" size="sm">
            Control Tower
          </Button>
        </Link>
      </div>

      <div className="rounded-[12px] border border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)] p-4 text-xs text-[#54657C]">
        O alerta crítico do motorista notifica transportadora e SteelGo e preserva a trilha. A
        SteelGo não opera central 24h nem aciona serviços de emergência; reconhecimento e
        encerramento ficam registrados com autor, hora e motivo.
      </div>

      <h2 className="text-sm font-semibold text-[#10274A]">
        Alertas críticos abertos ({sos.length})
      </h2>
      <div className="space-y-2">
        {sos.length === 0 && (
          <div className="rounded-[12px] border border-[#DDE7F2] bg-white p-6 text-center text-[#54657C]">
            Nenhum alerta crítico aberto.
          </div>
        )}
        {sos.map((s) => (
          <div
            key={s.exception_id}
            className="flex items-start gap-3 rounded-[12px] border border-red-200 bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)] p-4"
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 text-red-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="danger">crítico</Badge>
                <Link
                  to="/admin/operations/$id"
                  params={{ id: s.trip_id }}
                  className="text-sm font-medium text-[#1B6CB8] hover:underline"
                >
                  {s.trip_number}
                </Link>
                <span className="text-xs text-[#54657C]">
                  {s.carrier_company_name} · {s.driver_label}
                </span>
                {s.sos_mode === "homologation" && <Badge variant="gray">em homologação</Badge>}
                {s.acknowledged_at ? (
                  <Badge variant="green">reconhecido ({s.acknowledged_by_kind})</Badge>
                ) : (
                  <Badge variant="amber">não reconhecido</Badge>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[#7A8AA0]">
                aberto {fmtDateTime(s.captured_at)} · meta {fmtDateTime(s.ack_target_at)} · nível{" "}
                {s.escalation_level}
              </p>
            </div>
            {!s.acknowledged_at && (
              <ReasonAction
                label="Reconhecer"
                size="sm"
                variant="danger"
                title="Reconhecer alerta crítico"
                minLen={0}
                optional
                onSubmit={(n, rid) => rpcAcknowledgeSos(s.exception_id, n || null, rid)}
                onDone={refresh}
              />
            )}
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-[#10274A]">Alertas automáticos recentes</h2>
      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="rounded-[12px] border border-[#DDE7F2] bg-white p-6 text-center text-[#54657C]">
            Nenhum alerta registrado.
          </div>
        )}
        {alerts.map((a) => (
          <div
            key={a.alert_id}
            className="flex items-start gap-3 rounded-[12px] border border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)] p-4"
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 text-[#B45309]" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={a.severity === "critical" ? "danger" : "amber"}>{a.severity}</Badge>
                <Link
                  to="/admin/operations/$id"
                  params={{ id: a.trip_id }}
                  className="text-sm font-medium text-[#1B6CB8] hover:underline"
                >
                  {a.trip_number}
                </Link>
                <span className="text-sm text-[#10274A]">{ALERT_KIND_LABEL[a.kind] ?? a.kind}</span>
                <Badge variant={a.status === "open" ? "amber" : "green"}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-[#7A8AA0]">{fmtDateTime(a.detected_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
