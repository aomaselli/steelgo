// Control Tower da SteelGo (Modulo 3): mapa, fila de alertas criticos,
// alertas automaticos e viagens. Tudo por RPC de admin.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ShieldAlert } from "lucide-react";
import { Badge, Button, Card } from "@/components/steel";
import { AdminOperationsMap } from "@/components/maps/AdminOperationsMap";
import { TripListView } from "@/components/trip/TripListView";
import { ReasonAction } from "@/components/trip/TripDetailView";
import {
  fetchOperationalAlerts,
  fetchSchedulerHealth,
  fetchSosQueue,
  rpcAcknowledgeSos,
} from "@/lib/trips";
import { ALERT_KIND_LABEL, SEVERITY_CLS, fmtDateTime, tripStatusMeta } from "@/lib/tripStatus";

export const Route = createFileRoute("/admin/operations/")({ component: OperationsPage });

function OperationsPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data: sos = [] } = useQuery({
    queryKey: ["sos-queue"],
    queryFn: fetchSosQueue,
    refetchInterval: 15_000,
  });
  const { data: alerts = [] } = useQuery({
    queryKey: ["op-alerts", "open"],
    queryFn: () => fetchOperationalAlerts("open", 100),
    refetchInterval: 30_000,
  });
  const { data: health = [] } = useQuery({
    queryKey: ["scheduler-health"],
    queryFn: fetchSchedulerHealth,
    refetchInterval: 60_000,
  });
  const tick = health.find((h) => h.kind === "operational_tick");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sos-queue"] });
    qc.invalidateQueries({ queryKey: ["op-alerts"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-bold text-[#10274A]">{t("controlTower.title")}</h1>
          <p className="text-[#54657C] mt-1">
            {t("controlTower.subtitle")} Estimativas são estimativas; o alerta crítico não é central
            24h.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${tick?.stale ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
          >
            <Activity className="w-3 h-3" /> scheduler{" "}
            {tick
              ? tick.stale
                ? `parado há ${Math.round(Number(tick.seconds_since_last) / 60)} min`
                : `ok · ${Math.round(Number(tick.seconds_since_last))} s`
              : "sem execução"}
          </span>
          <Link to="/admin/operations/governance">
            <Button variant="outline" size="sm">
              Governança
            </Button>
          </Link>
        </div>
      </div>

      <div className="px-6">
        <AdminOperationsMap />
      </div>

      <div className="px-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card variant="light" className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DDE7F2] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-medium text-[#10274A]">Alertas críticos (SOS) abertos</h2>
            <span className="text-xs text-[#54657C]">{sos.length}</span>
          </div>
          {!sos.length ? (
            <div className="p-4 text-sm text-[#54657C]">Nenhum alerta crítico aberto.</div>
          ) : (
            <ul className="divide-y divide-[#DDE7F2]">
              {sos.map((s) => (
                <li key={s.exception_id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <Link
                        to="/admin/operations/$id"
                        params={{ id: s.trip_id }}
                        className="font-medium text-[#1B6CB8] hover:underline"
                      >
                        {s.trip_number}
                      </Link>
                      <span className="text-[#54657C]">
                        {" "}
                        · {s.carrier_company_name} · {s.driver_label}
                      </span>
                      {s.sos_mode === "homologation" && (
                        <Badge variant="gray" className="ml-2">
                          homologação
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-[#54657C]">
                      aberto há {Math.round(Number(s.seconds_open) / 60)} min · nível{" "}
                      {s.escalation_level} ·{" "}
                      {s.acknowledged_at ? (
                        `reconhecido (${s.acknowledged_by_kind})`
                      ) : (
                        <b className="text-red-700">NÃO reconhecido</b>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[#54657C]">
                    meta {fmtDateTime(s.ack_target_at)}
                    {s.lat != null && s.lng != null && (
                      <a
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://maps.google.com/?q=${s.lat},${s.lng}`}
                      >
                        posição
                      </a>
                    )}
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
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card variant="light" className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#DDE7F2] flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#10274A]">Alertas automáticos abertos</h2>
            <span className="text-xs text-[#54657C]">{alerts.length}</span>
          </div>
          {!alerts.length ? (
            <div className="p-4 text-sm text-[#54657C]">Nenhum alerta aberto.</div>
          ) : (
            <ul className="divide-y divide-[#DDE7F2] max-h-[420px] overflow-y-auto">
              {alerts.map((a) => (
                <li
                  key={a.alert_id}
                  className="px-4 py-2.5 text-sm flex items-center justify-between gap-2"
                >
                  <div>
                    <span
                      className={`inline-flex px-1.5 rounded-full text-xs mr-2 ${SEVERITY_CLS[a.severity] ?? ""}`}
                    >
                      {a.severity}
                    </span>
                    <Link
                      to="/admin/operations/$id"
                      params={{ id: a.trip_id }}
                      className="text-[#1B6CB8] hover:underline"
                    >
                      {a.trip_number}
                    </Link>
                    <span className="text-[#10274A]"> · {ALERT_KIND_LABEL[a.kind] ?? a.kind}</span>
                    {a.details &&
                      typeof a.details === "object" &&
                      typeof (a.details as { message?: unknown }).message === "string" && (
                        <span className="text-[#54657C]">
                          {" "}
                          — {(a.details as { message: string }).message}
                        </span>
                      )}
                  </div>
                  <div className="text-xs text-[#54657C] whitespace-nowrap">
                    {fmtDateTime(a.detected_at)} · {tripStatusMeta(a.trip_status).short}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <TripListView
        scope="admin"
        detailTo="/admin/operations/$id"
        title="Viagens"
        subtitle="Todas as viagens da plataforma"
      />
    </div>
  );
}
