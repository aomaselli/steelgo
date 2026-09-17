// Lista de viagens (list_my_trips) para transportadora, embarcador e SteelGo.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { Badge, Button, Card, EmptyState, Spinner } from "@/components/steel";
import { fetchMyTrips, type TripListRow } from "@/lib/trips";
import {
  ACTIVE_TRIP_STATUSES,
  TERMINAL_TRIP_STATUSES,
  fmtDateTime,
  relativeMinutes,
  tripStatusMeta,
  type TripStatus,
} from "@/lib/tripStatus";

const TABS: { id: string; label: string; statuses: TripStatus[] | null }[] = [
  { id: "active", label: "Em andamento", statuses: ACTIVE_TRIP_STATUSES },
  {
    id: "pending",
    label: "Aguardando",
    statuses: ["planned", "assigned", "driver_accepted", "delivered"],
  },
  { id: "done", label: "Encerradas", statuses: TERMINAL_TRIP_STATUSES },
  { id: "all", label: "Todas", statuses: null },
];

export function TripListView({
  scope,
  detailTo,
  title,
  subtitle,
}: {
  scope: "carrier" | "shipper" | "admin";
  detailTo: "/carrier/trips/$id" | "/shipper/trips/$id" | "/admin/operations/$id";
  title: string;
  subtitle: string;
}) {
  const [tab, setTab] = useState("active");
  const statuses = TABS.find((t) => t.id === tab)!.statuses;
  const {
    data: rows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trips", scope, tab],
    queryFn: () => fetchMyTrips(scope === "admin" ? "all" : "mine", statuses ?? undefined, 200),
    refetchInterval: tab === "active" ? 30_000 : false,
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#10274A]">{title}</h1>
        <p className="text-[#54657C] mt-1">{subtitle}</p>
      </div>
      <div className="flex gap-1 border-b border-[#DDE7F2]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors ${tab === t.id ? "text-[#1B6CB8] border-b-2 border-[#1B6CB8] -mb-px" : "text-[#54657C] hover:text-[#10274A]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="text-sm text-red-600">{(error as Error).message}</div>
      ) : !rows?.length ? (
        <EmptyState
          tone="light"
          icon={Radar}
          title="Nenhuma viagem"
          description="As viagens aparecem aqui assim que o contrato é ativado."
        />
      ) : (
        <Card variant="light" className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F9FB] text-[#54657C] text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Viagem</th>
                <th className="text-left px-4 py-2">Rota</th>
                <th className="text-left px-4 py-2">
                  {scope === "shipper" ? "Transportadora" : "Embarcador"}
                </th>
                <th className="text-left px-4 py-2">Motorista</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Sinal / ETA</th>
                <th className="text-left px-4 py-2">Atenção</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: TripListRow) => {
                const m = tripStatusMeta(r.status);
                return (
                  <tr key={r.trip_id} className="border-t border-[#DDE7F2]">
                    <td className="px-4 py-3 font-mono text-xs text-[#1B6CB8]">
                      {r.trip_number}
                      <div className="text-[#7A8AA0]">{r.contract_number ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-[#10274A]">
                      {r.origin ?? "—"} → {r.destination ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#54657C]">
                      {scope === "shipper" ? r.carrier_company_name : r.shipper_company_name}
                    </td>
                    <td className="px-4 py-3 text-[#54657C]">
                      {r.driver_label ?? "—"}
                      <div className="text-xs text-[#7A8AA0]">{r.truck_plate_masked ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}
                      >
                        {m.short}
                      </span>
                      {r.paused && (
                        <Badge variant="amber" className="ml-1">
                          pausada
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#54657C]">
                      {m.active ? (
                        <div
                          className={
                            r.last_location_at &&
                            Date.now() - new Date(r.last_location_at).getTime() < 20 * 60_000
                              ? "text-[#1A7D60]"
                              : "text-[#B45309]"
                          }
                        >
                          sinal {relativeMinutes(r.last_location_at)}
                        </div>
                      ) : null}
                      {r.eta_at && (
                        <div>
                          ETA {fmtDateTime(r.eta_at)}
                          {r.eta_source === "reported" ? " (inf.)" : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.has_open_sos && <Badge variant="danger">ALERTA CRÍTICO</Badge>}
                      {!r.has_open_sos && (r.open_exceptions ?? 0) > 0 && (
                        <Badge variant="amber">{r.open_exceptions} ocorrência(s)</Badge>
                      )}
                      {(r.open_alerts ?? 0) > 0 && (
                        <Badge variant="gray" className="ml-1">
                          {r.open_alerts} alerta(s)
                        </Badge>
                      )}
                      {r.delivery_exception && (
                        <Badge variant="amber" className="ml-1">
                          divergência
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={detailTo} params={{ id: r.trip_id }}>
                        <Button variant="ghost" size="sm">
                          Abrir
                        </Button>
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
