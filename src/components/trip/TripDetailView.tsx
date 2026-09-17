// Detalhe da viagem para transportadora, embarcador e SteelGo (Modulo 3).
// Fonte unica: get_trip (jsonb sanitizado por papel). Acoes por papel:
//   transportadora (owner/operator): designar/reatribuir, cancelar (antes da
//   carga), informar ETA, reconhecer/resolver ocorrencias permitidas, reconhecer
//   alerta critico; embarcador: acompanhar; SteelGo: tudo, com motivo e auditoria.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  FileText,
  Image as ImageIcon,
  MapPin,
  ShieldAlert,
  Truck,
  UserRound,
} from "lucide-react";
import { Badge, Button, Card, Input, Modal, Select, Spinner, Textarea } from "@/components/steel";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTrip,
  fetchTripPositions,
  openTripMedia,
  rpcAcknowledgeException,
  rpcAcknowledgeSos,
  rpcAssignTrip,
  rpcCancelTrip,
  rpcEscalateSos,
  rpcForceTransition,
  rpcPauseTrip,
  rpcPurgeRawLocations,
  rpcReassignTrip,
  rpcReleaseLegalHold,
  rpcReportEta,
  rpcResolveDeliveryException,
  rpcResolveException,
  rpcResolveSos,
  rpcResumeTrip,
  rpcSetLegalHold,
  type TripDetail,
} from "@/lib/trips";
import {
  ALERT_KIND_LABEL,
  CARGO_DISPOSITION_LABEL,
  EXCEPTION_KIND_LABEL,
  SEVERITY_CLS,
  fmtDateTime,
  relativeMinutes,
  tripStatusMeta,
  type TripStatus,
} from "@/lib/tripStatus";
import { TripTrackMap } from "./TripTrackMap";
import { CargoDispositionPanel } from "./CargoDispositionPanel";

const H = "text-[#10274A]";
const SUB = "text-[#54657C]";

export function TripDetailView({ tripId, backTo }: { tripId: string; backTo: string }) {
  const qc = useQueryClient();
  const {
    data: trip,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => fetchTrip(tripId),
    refetchInterval: 30_000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trip", tripId] });
    qc.invalidateQueries({ queryKey: ["trips"] });
  };

  if (isLoading)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  if (error || !trip)
    return (
      <div className="p-6 text-sm text-red-600">
        Viagem não encontrada ou sem permissão de leitura.
      </div>
    );

  const role = trip.my_role;
  const isAdmin = role === "admin";
  const isCarrierOp = role === "carrier_owner" || role === "carrier_operator";
  const isShipper = role.startsWith("shipper_");
  const meta = tripStatusMeta(trip.status);
  const active = meta.active;
  const openSos = trip.exceptions.find(
    (x) => x.kind === "sos" && !["resolved", "converted_to_dispute"].includes(x.status),
  );
  const openDeliveryExc = trip.exceptions.find(
    (x) =>
      ["cargo_refusal", "delivery_mismatch"].includes(x.kind) &&
      !["resolved", "converted_to_dispute"].includes(x.status),
  );
  const openDisposition = trip.exceptions.find(
    (x) =>
      x.kind === "cargo_disposition_required" &&
      !["resolved", "converted_to_dispute"].includes(x.status),
  );

  return (
    <div className="p-6 space-y-6">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-[#1B6CB8] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className={`text-2xl font-bold ${H}`}>Viagem {trip.trip_number}</h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}
            >
              {meta.label}
            </span>
            {trip.attempt_number > 1 && (
              <Badge variant="gray">tentativa {trip.attempt_number}</Badge>
            )}
            {trip.paused_by_contract && <Badge variant="amber">pausada pelo contrato</Badge>}
            {trip.has_open_critical_exception && (
              <Badge variant="danger">alerta crítico aberto</Badge>
            )}
            {trip.delivery_exception && <Badge variant="amber">divergência de entrega</Badge>}
            {trip.sos_mode === "homologation" && (
              <Badge variant="gray">alerta crítico em homologação</Badge>
            )}
          </div>
          <p className={SUB}>
            {trip.freight.origin} → {trip.freight.destination} · {trip.freight.weight_tons ?? "—"} t
            · {trip.freight.steel_type ?? "carga"}
          </p>
          <p className={`${SUB} text-xs mt-1`}>
            Contrato {trip.contract.contract_number ?? trip.contract.id.slice(0, 8)} (
            {trip.contract.status}) · {trip.shipper?.name ?? "—"} → {trip.carrier?.name ?? "—"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(isCarrierOp || isAdmin) &&
            (trip.status === "planned" ||
              trip.status === "assigned" ||
              trip.status === "driver_accepted" ||
              (isAdmin && active)) && <AssignAction trip={trip} onDone={refresh} />}
          {(isCarrierOp || isShipper || isAdmin) &&
            !trip.loaded_at &&
            [
              "planned",
              "assigned",
              "driver_accepted",
              "en_route_to_pickup",
              "at_pickup",
              "loading",
            ].includes(trip.status) && (
              <ReasonAction
                label="Cancelar viagem"
                variant="danger"
                title="Cancelar viagem (antes da carga)"
                minLen={20}
                onSubmit={(reason, rid) => rpcCancelTrip(trip.id, reason, rid)}
                onDone={refresh}
              />
            )}
          {(isCarrierOp || isAdmin) && active && <EtaAction trip={trip} onDone={refresh} />}
        </div>
      </div>

      {openSos && (
        <SosPanel
          trip={trip}
          sos={openSos}
          canAck={isCarrierOp || isAdmin}
          isAdmin={isAdmin}
          onDone={refresh}
        />
      )}
      {openDisposition && isAdmin && <CargoDispositionPanel trip={trip} onDone={refresh} />}
      {openDisposition && !isAdmin && (
        <Card variant="light" className="p-4 border-amber-300 bg-amber-50 text-sm">
          <b>Carga embarcada com contrato encerrado.</b> A viagem segue viva e rastreável até a
          SteelGo registrar a disposição da carga (entrega por resolução, devolução, custódia,
          transbordo ou liberação de emergência).
        </Card>
      )}
      {openDeliveryExc && isAdmin && (
        <DeliveryExceptionPanel trip={trip} exc={openDeliveryExc} onDone={refresh} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          <TripTrackMap trip={trip} />
          <Timeline trip={trip} />
          <PodCard trip={trip} />
          <DispositionsCard trip={trip} />
          <ExceptionsCard trip={trip} role={role} onDone={refresh} />
          <AlertsCard trip={trip} />
        </div>
        <div className="space-y-4">
          <DriverCard trip={trip} />
          <EtaCard trip={trip} />
          <DocumentsCard trip={trip} />
          {isAdmin && <AdminPanel trip={trip} onDone={refresh} />}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- cards
function DriverCard({ trip }: { trip: TripDetail }) {
  const d = trip.driver;
  return (
    <Card variant="light" className="p-4 space-y-2 text-sm">
      <h3 className={`font-medium ${H} flex items-center gap-2`}>
        <UserRound className="w-4 h-4" /> Motorista e veículo
      </h3>
      {!d.assigned ? (
        <div className={SUB}>Nenhum motorista designado.</div>
      ) : (
        <>
          <Row k="Motorista" v={d.driver_name ?? d.driver_label ?? "—"} />
          {d.driver_verification && <Row k="Habilitação" v={d.driver_verification} />}
          <Row k="Placa" v={d.truck_plate ?? "—"} />
          {d.truck && (
            <Row
              k="Veículo"
              v={
                [d.truck.brand, d.truck.model, d.truck.year].filter(Boolean).join(" ") ||
                d.truck.type ||
                "—"
              }
            />
          )}
          <Row
            k="Vínculo"
            v={`${d.assignment_state ?? "—"}${d.accepted_at ? ` · aceito ${fmtDateTime(d.accepted_at)}` : ""}`}
          />
          {d.carrier_operational_contact &&
            (d.carrier_operational_contact.phone || d.carrier_operational_contact.email) && (
              <Row
                k="Contato operacional"
                v={`${d.carrier_operational_contact.phone ?? ""} ${d.carrier_operational_contact.email ?? ""}`.trim()}
              />
            )}
        </>
      )}
      {trip.assignments.length > 1 && (
        <details className="pt-2 border-t border-[#DDE7F2]">
          <summary className={`cursor-pointer text-xs ${SUB}`}>
            Histórico de vínculos ({trip.assignments.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {trip.assignments.map((a) => (
              <li key={a.id} className={SUB}>
                {fmtDateTime(a.assigned_at)} · {a.driver_label} · {a.truck_plate ?? "—"} · {a.state}
                {a.revoke_reason ? ` (${a.revoke_reason})` : ""}
                {a.decline_reason ? ` (${a.decline_reason})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function EtaCard({ trip }: { trip: TripDetail }) {
  return (
    <Card variant="light" className="p-4 space-y-2 text-sm">
      <h3 className={`font-medium ${H} flex items-center gap-2`}>
        <Clock3 className="w-4 h-4" /> Prazos e posição
      </h3>
      <Row k="Coleta planejada" v={fmtDateTime(trip.planned_pickup_at)} />
      <Row k="Entrega planejada" v={fmtDateTime(trip.planned_delivery_at)} />
      <Row
        k="Chegada estimada"
        v={
          trip.eta.at
            ? `${fmtDateTime(trip.eta.at)} (${trip.eta.source === "reported" ? "informada pela transportadora" : "calculada"})`
            : "—"
        }
      />
      {trip.eta.at && (
        <div className={`text-[11px] ${SUB}`}>
          {trip.eta.label}
          {trip.eta.basis && typeof trip.eta.basis.speed_kmh === "number"
            ? ` · ${trip.eta.basis.speed_kmh} km/h (${String(trip.eta.basis.speed_source)})`
            : ""}
        </div>
      )}
      <Row
        k="Última posição"
        v={trip.last_location_at ? `${relativeMinutes(trip.last_location_at)} atrás` : "sem sinal"}
      />
      <Row k="Rastreamento" v={trip.tracking_state} />
      {trip.loaded_at && <Row k="Carregada em" v={fmtDateTime(trip.loaded_at)} />}
      {trip.delivered_at && <Row k="Entregue em" v={fmtDateTime(trip.delivered_at)} />}
      {trip.returned_at && <Row k="Devolvida em" v={fmtDateTime(trip.returned_at)} />}
      {trip.cargo_disposition && (
        <Row
          k="Disposição da carga"
          v={CARGO_DISPOSITION_LABEL[trip.cargo_disposition] ?? trip.cargo_disposition}
        />
      )}
      {trip.cancel_reason && <Row k="Cancelamento" v={trip.cancel_reason} />}
      {trip.facts && (
        <Row
          k="Fatos operacionais"
          v={`${trip.facts.gps_distance_km ?? trip.facts.aggregated_distance_km ?? "—"} km (${trip.facts.distance_source}) · ${trip.facts.duration_min ?? "—"} min · sinal ${trip.facts.sample_quality}`}
        />
      )}
    </Card>
  );
}

function DocumentsCard({ trip }: { trip: TripDetail }) {
  if (!trip.documents.length) return null;
  return (
    <Card variant="light" className="p-4 space-y-2 text-sm">
      <h3 className={`font-medium ${H} flex items-center gap-2`}>
        <FileText className="w-4 h-4" /> Documentos
      </h3>
      {trip.documents.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-2">
          <span className={SUB}>
            {d.kind}
            {d.number ? ` ${d.number}` : ""}
            {d.superseded ? " (substituído)" : ""}
          </span>
          <MediaButton path={d.path} label="abrir" />
        </div>
      ))}
    </Card>
  );
}

function Timeline({ trip }: { trip: TripDetail }) {
  const events = [...trip.events].reverse();
  return (
    <Card variant="light" className="overflow-hidden p-0">
      <div className="px-4 py-3 border-b border-[#DDE7F2] flex items-center justify-between">
        <h2 className={`text-sm font-medium ${H}`}>Linha do tempo</h2>
        <span className={`text-xs ${SUB}`}>
          {trip.events.length} eventos · {trip.checkpoints.length} checkpoints ·{" "}
          {trip.access_log_count} leituras auditadas
        </span>
      </div>
      <ul className="divide-y divide-[#DDE7F2] max-h-[520px] overflow-y-auto">
        {events.map((e) => {
          const cp =
            e.type === "checkpoint"
              ? trip.checkpoints.find(
                  (c) =>
                    String((e.payload ?? {}).checkpoint_id ?? "") === c.id ||
                    (e.captured_at && c.captured_at === e.captured_at),
                )
              : null;
          return (
            <li key={e.seq} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={H}>
                  <span className="font-mono text-xs text-[#7A8AA0] mr-2">#{e.seq}</span>
                  {labelEvent(e.type)}
                  {e.to ? ` → ${tripStatusMeta(e.to).label}` : ""}
                  {cp?.kind ? ` (${cp.kind})` : ""}
                </span>
                <span className={`text-xs ${SUB} whitespace-nowrap`}>
                  {fmtDateTime(e.captured_at ?? e.received_at)} · {e.actor_kind}
                </span>
              </div>
              {e.note && <div className={`text-xs ${SUB} mt-0.5`}>{e.note}</div>}
              {e.internal_note && (
                <div className="text-xs text-[#B45309] mt-0.5">interno: {e.internal_note}</div>
              )}
              {cp && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {cp.inside_geofence === false && (
                    <Badge variant="amber">
                      fora do geofence
                      {cp.distance_to_target_m != null
                        ? ` (${Math.round(cp.distance_to_target_m)} m)`
                        : ""}
                    </Badge>
                  )}
                  {cp.seal_code && <span className={SUB}>lacre {cp.seal_code}</span>}
                  {cp.photo_path && <MediaButton path={cp.photo_path} label="foto" />}
                  {cp.geofence_override_reason && (
                    <span className={SUB}>motivo: {cp.geofence_override_reason}</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!events.length && <li className={`px-4 py-6 text-sm ${SUB}`}>Sem eventos.</li>}
      </ul>
    </Card>
  );
}

function labelEvent(t: string) {
  const m: Record<string, string> = {
    trip_created: "Viagem criada",
    policy_frozen: "Política congelada",
    assigned: "Designação",
    reassigned: "Reatribuição",
    assignment_accepted: "Aceite do motorista",
    assignment_declined: "Recusa do motorista",
    assignment_revoked: "Vínculo revogado",
    transition: "Etapa",
    checkpoint: "Checkpoint",
    transshipment_registered: "Transbordo",
    tracking_started: "Rastreamento iniciado",
    tracking_ended: "Rastreamento encerrado",
    eta_reported: "ETA informado",
    exception_opened: "Ocorrência aberta",
    exception_acknowledged: "Ocorrência reconhecida",
    exception_resolved: "Ocorrência encerrada",
    exception_escalated: "Ocorrência escalonada",
    sos_opened: "ALERTA CRÍTICO aberto",
    sos_acknowledged: "Alerta crítico reconhecido",
    sos_escalated: "Alerta crítico escalonado",
    sos_resolved: "Alerta crítico encerrado",
    document_added: "Documento",
    pod_submitted: "Comprovante de entrega",
    pod_attempt_refused: "Tentativa recusada",
    pod_superseded: "Comprovante substituído",
    delivery_exception_resolved: "Divergência resolvida",
    paused: "Pausada",
    resumed: "Retomada",
    cancelled: "Cancelada",
    completed: "Concluída",
    contract_terminal_hold: "Contrato encerrado com carga a bordo",
    cargo_disposition_resolved: "Disposição da carga",
    emergency_release: "Liberação de emergência",
    admin_override: "Intervenção administrativa",
    command_rejected: "Comando recusado",
    alert_opened: "Alerta aberto",
    alert_acknowledged: "Alerta reconhecido",
    alert_closed: "Alerta fechado",
    legal_hold_set: "Preservação legal",
    legal_hold_released: "Preservação liberada",
    raw_locations_purged: "Trilha bruta purgada",
    notification_sent: "Notificação",
  };
  return m[t] ?? t;
}

function PodCard({ trip }: { trip: TripDetail }) {
  if (!trip.pod && !trip.pod_attempts.length) return null;
  const p = trip.pod;
  return (
    <Card variant="light" className="p-4 space-y-3 text-sm">
      <h3 className={`font-medium ${H}`}>
        Comprovante de entrega {p ? `(versão ${p.version} de ${trip.pod_versions})` : ""}
      </h3>
      {p && (
        <div className="space-y-1">
          <Row k="Resultado" v={p.outcome} />
          <Row
            k="Recebedor"
            v={`${p.receiver_name}${p.receiver_document_last4 ? ` · ${p.receiver_document_kind ?? "doc"} ****${p.receiver_document_last4}` : ""}`}
          />
          <Row k="Entregue em" v={fmtDateTime(p.delivered_at)} />
          {(p.quantity_declared != null || p.quantity_received != null) && (
            <Row
              k="Quantidades"
              v={`${p.quantity_declared ?? "—"} declarada / ${p.quantity_received ?? "—"} recebida`}
            />
          )}
          {p.notes && <Row k="Observações" v={p.notes} />}
          {p.inside_geofence === false && (
            <Badge variant="amber">
              fora do geofence{p.geofence_override_reason ? `: ${p.geofence_override_reason}` : ""}
            </Badge>
          )}
          {p.derived_from_attempt && (
            <Badge variant="gray">derivado de tentativa por resolução da SteelGo</Badge>
          )}
          {p.supersede_reason && (
            <div className={`text-xs ${SUB}`}>Substituição: {p.supersede_reason}</div>
          )}
          <div className="flex gap-2 flex-wrap pt-1">
            {p.signature_path && <MediaButton path={p.signature_path} label="assinatura" />}
            {p.photos.map((ph, i) => (
              <MediaButton key={ph.path} path={ph.path} label={`foto ${i + 1}`} />
            ))}
          </div>
        </div>
      )}
      {trip.pod_attempts.length > 0 && (
        <div className="pt-2 border-t border-[#DDE7F2]">
          <div className={`text-xs ${SUB} mb-1`}>
            Tentativas recusadas ({trip.pod_attempts.length}) — não contam como entrega
          </div>
          {trip.pod_attempts.map((a) => (
            <div key={a.id} className="text-xs flex items-center justify-between gap-2 py-1">
              <span className={SUB}>
                #{a.attempt_seq} · {a.outcome} · {fmtDateTime(a.captured_at)} ·{" "}
                {a.receiver_name ?? "—"}
                {a.notes ? ` · ${a.notes}` : ""}
              </span>
              <span className="flex gap-1">
                {a.photos.map((ph, i) => (
                  <MediaButton key={ph.path} path={ph.path} label={`foto ${i + 1}`} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DispositionsCard({ trip }: { trip: TripDetail }) {
  if (!trip.cargo_dispositions.length) return null;
  return (
    <Card variant="light" className="p-4 space-y-3 text-sm" data-testid="dispositions-card">
      <h3 className={`font-medium ${H}`}>Disposição da carga</h3>
      {trip.cargo_dispositions.map((d, i) => (
        <div key={i} className="rounded-[10px] border border-[#DDE7F2] p-3 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${H}`}>
              {CARGO_DISPOSITION_LABEL[d.disposition] ?? d.disposition}
            </span>
            {d.is_emergency && <Badge variant="danger">liberação de emergência</Badge>}
            <span className={`text-xs ${SUB}`}>{fmtDateTime(d.occurred_at)}</span>
          </div>
          <div className={SUB}>{d.reason}</div>
          <div className={`text-xs ${SUB}`}>{d.note}</div>
          {(d.location_text || d.custodian_label) && (
            <div className={`text-xs ${SUB}`}>
              {d.location_text ?? ""}
              {d.custodian_label ? ` · custodiante: ${d.custodian_label}` : ""}
            </div>
          )}
          {d.evidence.length > 0 && (
            <div className="flex gap-2 flex-wrap pt-1">
              {d.evidence.map((e, j) => (
                <MediaButton key={e.path} path={e.path} label={`evidência ${j + 1}`} />
              ))}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

function ExceptionsCard({
  trip,
  role,
  onDone,
}: {
  trip: TripDetail;
  role: string;
  onDone: () => void;
}) {
  const list = trip.exceptions.filter((x) => x.kind !== "sos");
  if (!list.length) return null;
  const isAdmin = role === "admin";
  const isCarrierOp = role === "carrier_owner" || role === "carrier_operator";
  const carrierResolvable = [
    "delay",
    "vehicle_breakdown",
    "document_issue",
    "long_stop",
    "comm_loss",
    "route_deviation",
    "other",
  ];
  return (
    <Card variant="light" className="p-4 space-y-3 text-sm">
      <h3 className={`font-medium ${H} flex items-center gap-2`}>
        <AlertTriangle className="w-4 h-4" /> Ocorrências
      </h3>
      {list.map((x) => {
        const open = !["resolved", "converted_to_dispute"].includes(x.status);
        const special = [
          "cargo_refusal",
          "delivery_mismatch",
          "cargo_disposition_required",
        ].includes(x.kind);
        return (
          <div key={x.id} className="rounded-[10px] border border-[#DDE7F2] p-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-xs ${SEVERITY_CLS[x.severity] ?? ""}`}
              >
                {x.severity}
              </span>
              <span className={`font-medium ${H}`}>{EXCEPTION_KIND_LABEL[x.kind] ?? x.kind}</span>
              <Badge variant={open ? "amber" : "gray"}>{x.status}</Badge>
              <span className={`text-xs ${SUB}`}>
                {fmtDateTime(x.captured_at)} · {x.opened_by_kind}
              </span>
              {x.blocks_delivery && open && <Badge variant="danger">bloqueia entrega</Badge>}
            </div>
            <div className={SUB}>{x.description}</div>
            {x.evidence.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {x.evidence.map((e, i) => (
                  <MediaButton key={e.path} path={e.path} label={`evidência ${i + 1}`} />
                ))}
              </div>
            )}
            {x.acknowledged_at && (
              <div className={`text-xs ${SUB}`}>
                Reconhecida {fmtDateTime(x.acknowledged_at)} ({x.acknowledged_by_kind})
              </div>
            )}
            {x.resolved_at && (
              <div className={`text-xs ${SUB}`}>
                Encerrada {fmtDateTime(x.resolved_at)} · {x.resolution_kind} · {x.resolution_note}
              </div>
            )}
            {x.dispute_case_id && (
              <div className="text-xs text-[#1B6CB8]">Convertida em disputa.</div>
            )}
            {open && !special && (isAdmin || isCarrierOp) && (
              <div className="flex gap-2 pt-1">
                {["open", "escalated"].includes(x.status) && (
                  <ReasonAction
                    label="Reconhecer"
                    size="sm"
                    title="Reconhecer ocorrência"
                    minLen={0}
                    optional
                    onSubmit={(n, rid) => rpcAcknowledgeException(x.id, n || null, rid)}
                    onDone={onDone}
                  />
                )}
                {(isAdmin || carrierResolvable.includes(x.kind)) && (
                  <ReasonAction
                    label="Encerrar"
                    size="sm"
                    variant="green"
                    title="Encerrar ocorrência (nota ≥ 20 caracteres)"
                    minLen={20}
                    onSubmit={(n, rid) => rpcResolveException(x.id, "handled", n, rid)}
                    onDone={onDone}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function AlertsCard({ trip }: { trip: TripDetail }) {
  if (!trip.alerts.length) return null;
  return (
    <Card variant="light" className="p-4 space-y-2 text-sm">
      <h3 className={`font-medium ${H}`}>Alertas automáticos</h3>
      {trip.alerts.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
          <span className={H}>
            <span
              className={`inline-flex px-1.5 rounded-full mr-2 ${SEVERITY_CLS[a.severity] ?? ""}`}
            >
              {a.severity}
            </span>
            {ALERT_KIND_LABEL[a.kind] ?? a.kind}
            {a.details && typeof a.details.message === "string" ? ` — ${a.details.message}` : ""}
          </span>
          <span className={`${SUB} whitespace-nowrap`}>
            {fmtDateTime(a.detected_at)} · {a.status}
          </span>
        </div>
      ))}
    </Card>
  );
}

function SosPanel({
  trip,
  sos,
  canAck,
  isAdmin,
  onDone,
}: {
  trip: TripDetail;
  sos: TripDetail["exceptions"][number];
  canAck: boolean;
  isAdmin: boolean;
  onDone: () => void;
}) {
  return (
    <Card variant="light" className="p-4 border-red-300 bg-red-50 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-red-700 font-semibold">
        <ShieldAlert className="w-5 h-5" /> ALERTA CRÍTICO ABERTO{" "}
        {trip.sos_mode === "homologation" ? "(recurso em homologação)" : ""}
      </div>
      <div className="text-red-900">
        Acionado {fmtDateTime(sos.captured_at)} · meta de reconhecimento{" "}
        {fmtDateTime(sos.ack_target_at)} · nível de escalonamento {sos.escalation_level}
        {sos.lat != null && sos.lng != null && (
          <>
            {" "}
            · posição {sos.lat.toFixed(4)}, {sos.lng.toFixed(4)}{" "}
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://maps.google.com/?q=${sos.lat},${sos.lng}`}
            >
              abrir no mapa
            </a>
          </>
        )}
      </div>
      <div className="text-xs text-red-900">
        A SteelGo não opera central 24h e não aciona serviços de emergência. Entre em contato com o
        motorista e, se necessário, com 190/192/193.
      </div>
      {sos.acknowledged_at ? (
        <div className="text-xs text-red-900">
          Reconhecido {fmtDateTime(sos.acknowledged_at)} pela {sos.acknowledged_by_kind}.
        </div>
      ) : (
        <div className="text-xs font-medium text-red-700">AINDA NÃO RECONHECIDO.</div>
      )}
      {sos.description && (
        <div className="text-xs text-red-900">Nota do motorista: {sos.description}</div>
      )}
      <div className="flex gap-2 flex-wrap pt-1">
        {canAck && !sos.acknowledged_at && (
          <ReasonAction
            label="Reconhecer alerta"
            variant="danger"
            size="sm"
            title="Reconhecer alerta crítico"
            minLen={0}
            optional
            onSubmit={(n, rid) => rpcAcknowledgeSos(sos.id, n || null, rid)}
            onDone={onDone}
          />
        )}
        {isAdmin && sos.escalation_level < 2 && (
          <ReasonAction
            label="Escalonar"
            size="sm"
            title="Escalonar alerta (manual)"
            minLen={0}
            optional
            onSubmit={(n, rid) => rpcEscalateSos(sos.id, n || null, rid)}
            onDone={onDone}
          />
        )}
        {isAdmin && sos.acknowledged_at && (
          <ChoiceAction
            label="Encerrar alerta"
            size="sm"
            variant="green"
            title="Encerrar alerta crítico"
            choices={[
              ["assisted", "Motorista assistido"],
              ["false_alarm", "Alarme falso"],
              ["incident_registered", "Ocorrência registrada (acidente/furto)"],
              ["escalated_externally", "Encaminhado externamente"],
            ]}
            minLen={20}
            onSubmit={(choice, note, rid) => rpcResolveSos(sos.id, choice, note, rid)}
            onDone={onDone}
          />
        )}
      </div>
    </Card>
  );
}

function DeliveryExceptionPanel({
  trip,
  exc,
  onDone,
}: {
  trip: TripDetail;
  exc: TripDetail["exceptions"][number];
  onDone: () => void;
}) {
  const [res, setRes] = useState<
    "accept_delivery" | "retry_delivery" | "return_to_origin" | "transshipment"
  >("retry_delivery");
  const [note, setNote] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [open, setOpen] = useState(false);
  const rid = useRef<string>(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await rpcResolveDeliveryException(
        exc.id,
        res,
        note.trim(),
        lat ? Number(lat) : null,
        lng ? Number(lng) : null,
        rid.current,
      );
      toast.success("Divergência resolvida");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card variant="light" className="p-4 border-amber-300 bg-amber-50 space-y-2 text-sm">
      <div className="font-semibold text-amber-900">
        Divergência de entrega aberta — decisão da SteelGo
      </div>
      <div className="text-amber-900">
        {EXCEPTION_KIND_LABEL[exc.kind]} · {fmtDateTime(exc.captured_at)} · {exc.description}
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>
        Decidir
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Resolver divergência de entrega">
        <div className="space-y-3">
          <Select value={res} onChange={(e) => setRes(e.target.value as typeof res)}>
            <option value="retry_delivery">
              Nova tentativa de entrega (opcionalmente em outro ponto)
            </option>
            <option value="accept_delivery">
              Aceitar a entrega (com ressalvas) — deriva o comprovante da tentativa
            </option>
            <option value="return_to_origin">Retorno à origem</option>
            <option value="transshipment">Transbordo para outro veículo</option>
          </Select>
          {(res === "retry_delivery" || res === "transshipment") && (
            <div className="flex gap-2">
              <Input
                placeholder="Nova latitude (opcional)"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
              <Input
                placeholder="Nova longitude (opcional)"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo / instrução (mínimo 20 caracteres)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || note.trim().length < 20} onClick={() => void submit()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function AdminPanel({ trip, onDone }: { trip: TripDetail; onDone: () => void }) {
  const r = trip.retention;
  const active = tripStatusMeta(trip.status).active;
  const terminal = ["completed", "cancelled", "returned"].includes(trip.status);
  return (
    <Card variant="light" className="p-4 space-y-3 text-sm">
      <h3 className={`font-medium ${H}`}>SteelGo · governança</h3>
      {r && (
        <div className="space-y-1 text-xs">
          <Row k="Retenção bruta até" v={fmtDateTime(r.retention_until)} />
          <Row k="Resumo até" v={fmtDateTime(r.summary_retention_until)} />
          <Row
            k="Preservação legal"
            v={
              r.legal_hold_reason
                ? `${r.legal_hold_reason} até ${r.legal_hold_until ? fmtDateTime(r.legal_hold_until) : "indefinido"}`
                : "nenhuma"
            }
          />
          <Row
            k="Trilha bruta purgada"
            v={r.raw_locations_purged_at ? fmtDateTime(r.raw_locations_purged_at) : "não"}
          />
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {!r?.legal_hold_reason && (
          <ReasonAction
            label="Preservar trilha"
            size="sm"
            title="Aplicar preservação legal (legal hold)"
            minLen={20}
            onSubmit={(n, rid) => rpcSetLegalHold(trip.id, n, rid)}
            onDone={onDone}
          />
        )}
        {r?.legal_hold_reason === "legal_hold_admin" && (
          <ReasonAction
            label="Liberar preservação"
            size="sm"
            title="Liberar preservação (cauda de 30 dias)"
            minLen={20}
            onSubmit={(n, rid) => rpcReleaseLegalHold(trip.id, n, rid)}
            onDone={onDone}
          />
        )}
        {terminal && !r?.raw_locations_purged_at && (
          <ReasonAction
            label="Purgar trilha bruta"
            size="sm"
            variant="danger"
            title="Purgar trilha bruta (irreversível; mantém resumo e fatos)"
            minLen={0}
            optional
            onSubmit={(_n, rid) => rpcPurgeRawLocations(trip.id, rid)}
            onDone={onDone}
          />
        )}
        {active && !trip.paused_by_exception_id && !trip.paused_by_contract && (
          <ReasonAction
            label="Pausar"
            size="sm"
            title="Pausar viagem (motivo ≥ 20)"
            minLen={20}
            onSubmit={(n, rid) => rpcPauseTrip(trip.id, null, n, rid)}
            onDone={onDone}
          />
        )}
        {active && trip.paused_by_exception_id && (
          <ReasonAction
            label="Retomar"
            size="sm"
            variant="green"
            title="Retomar viagem"
            minLen={20}
            onSubmit={(n, rid) => rpcResumeTrip(trip.id, n, rid)}
            onDone={onDone}
          />
        )}
        {active && <ForceAction trip={trip} onDone={onDone} />}
      </div>
    </Card>
  );
}

function ForceAction({ trip, onDone }: { trip: TripDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<TripStatus>("in_transit");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  const allowed: TripStatus[] = [
    "en_route_to_pickup",
    "at_pickup",
    "loading",
    "in_transit",
    "at_delivery",
    "unloading",
    "returning",
  ];
  async function submit() {
    setBusy(true);
    try {
      await rpcForceTransition(trip.id, to, reason.trim(), rid.current);
      toast.success("Transição forçada registrada");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Forçar etapa
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Forçar etapa (intervenção administrativa)"
      >
        <div className="space-y-3">
          <div className="text-xs text-[#54657C]">
            Nunca para entregue/devolvida/concluída/cancelada: essas exigem comprovante, recibo,
            pagamento ou disposição.
          </div>
          <Select value={to} onChange={(e) => setTo(e.target.value as TripStatus)}>
            {allowed.map((s) => (
              <option key={s} value={s}>
                {tripStatusMeta(s).label}
              </option>
            ))}
          </Select>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (mínimo 20 caracteres)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || reason.trim().length < 20} onClick={() => void submit()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function AssignAction({ trip, onDone }: { trip: TripDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  const reassign =
    trip.driver.assigned &&
    trip.assignments.some((a) => a.state === "offered" || a.state === "accepted");
  // drivers/trucks da transportadora (SELECT permitido por policy: proprietario/operador)
  const { data: drivers = [] } = useQuery({
    queryKey: ["assign-drivers", trip.carrier?.name],
    enabled: open,
    queryFn: async () =>
      (
        await supabase
          .from("drivers")
          .select("id, full_name, license_verification_status, is_active")
          .eq("is_active", true)
          .order("full_name")
      ).data ?? [],
  });
  const { data: trucks = [] } = useQuery({
    queryKey: ["assign-trucks", trip.carrier?.name],
    enabled: open,
    queryFn: async () =>
      (
        await supabase
          .from("trucks")
          .select("id, plate, model, is_active")
          .eq("is_active", true)
          .order("plate")
      ).data ?? [],
  });
  async function submit() {
    setBusy(true);
    try {
      if (reassign) await rpcReassignTrip(trip.id, driverId, truckId, note.trim(), rid.current);
      else await rpcAssignTrip(trip.id, driverId, truckId, note.trim() || null, rid.current);
      toast.success(reassign ? "Viagem reatribuída" : "Motorista designado");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Truck className="w-4 h-4" /> {reassign ? "Reatribuir" : "Designar motorista"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={reassign ? "Reatribuir viagem" : "Designar motorista e veículo"}
      >
        <div className="space-y-3">
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Motorista…</option>
            {drivers.map((d) => (
              <option
                key={d.id}
                value={d.id}
                disabled={d.license_verification_status !== "approved"}
              >
                {d.full_name}
                {d.license_verification_status !== "approved" ? " (habilitação não aprovada)" : ""}
              </option>
            ))}
          </Select>
          <Select value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            <option value="">Veículo…</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plate}
                {t.model ? ` · ${t.model}` : ""}
              </option>
            ))}
          </Select>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              reassign ? "Motivo da reatribuição (mínimo 10 caracteres)" : "Observação (opcional)"
            }
          />
          <div className="text-xs text-[#54657C]">
            O motorista precisa aceitar no aplicativo (e reconhecer o aviso de privacidade vigente)
            antes de iniciar.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || !driverId || !truckId || (reassign && note.trim().length < 10)}
              onClick={() => void submit()}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function EtaAction({ trip, onDone }: { trip: TripDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  async function submit() {
    setBusy(true);
    try {
      await rpcReportEta(trip.id, new Date(when).toISOString(), note.trim() || null, rid.current);
      toast.success("ETA informado");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Clock3 className="w-4 h-4" /> Informar ETA
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Informar chegada estimada">
        <div className="space-y-3">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação (opcional)"
          />
          <div className="text-xs text-[#54657C]">
            Sobrepõe a estimativa calculada por 2 horas. É uma estimativa, não um compromisso.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !when} onClick={() => void submit()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ----------------------------------------------------------------------------- primitivas
export function ReasonAction({
  label,
  title,
  minLen,
  optional,
  onSubmit,
  onDone,
  variant,
  size,
}: {
  label: string;
  title: string;
  minLen: number;
  optional?: boolean;
  onSubmit: (reason: string, requestId: string) => Promise<unknown>;
  onDone: () => void;
  variant?: "primary" | "danger" | "green" | "outline" | "ghost";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  async function submit() {
    setBusy(true);
    try {
      await onSubmit(reason.trim(), rid.current);
      toast.success(`${label}: registrado`);
      setOpen(false);
      setReason("");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant={variant ?? "outline"} size={size ?? "md"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={optional ? "Nota (opcional)" : `Motivo (mínimo ${minLen} caracteres)`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              disabled={busy || (!optional && reason.trim().length < minLen)}
              onClick={() => void submit()}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ChoiceAction({
  label,
  title,
  choices,
  minLen,
  onSubmit,
  onDone,
  variant,
  size,
}: {
  label: string;
  title: string;
  choices: [string, string][];
  minLen: number;
  onSubmit: (choice: string, note: string, requestId: string) => Promise<unknown>;
  onDone: () => void;
  variant?: "primary" | "danger" | "green" | "outline";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(choices[0][0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  async function submit() {
    setBusy(true);
    try {
      await onSubmit(choice, note.trim(), rid.current);
      toast.success(`${label}: registrado`);
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant={variant ?? "outline"} size={size ?? "md"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-3">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {choices.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`Nota (mínimo ${minLen} caracteres)`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || note.trim().length < minLen} onClick={() => void submit()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function MediaButton({ path, label }: { path: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const url = await openTripMedia(path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-[#1B6CB8] underline disabled:opacity-50"
      title="Acesso auditado (fica registrado quem abriu e quando)"
    >
      <ImageIcon className="w-3 h-3" /> {busy ? "abrindo…" : label}
    </button>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={SUB}>{k}</span>
      <span className={`${H} text-right`}>{v}</span>
    </div>
  );
}

/** Posicoes recentes (leitura auditada) para a listagem textual quando nao ha mapa. */
export function PositionsList({ tripId }: { tripId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["trip-positions", tripId],
    queryFn: () => fetchTripPositions(tripId, null),
    refetchInterval: 60_000,
  });
  const last = useMemo(() => data.slice(-5).reverse(), [data]);
  if (!data.length) return null;
  return (
    <div className="text-xs space-y-1">
      {last.map((p, i) => (
        <div key={i} className={SUB}>
          <MapPin className="inline w-3 h-3 mr-1" />
          {fmtDateTime(p.captured_at)} · {Number(p.lat).toFixed(4)}, {Number(p.lng).toFixed(4)} · ±
          {Math.round(Number(p.accuracy_m))} m{p.flags?.length ? ` · ${p.flags.join(",")}` : ""}
        </div>
      ))}
    </div>
  );
}
