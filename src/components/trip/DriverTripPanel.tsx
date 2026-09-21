// Painel da viagem do motorista (Modulo 3). Fonte: get_my_driver_trip.
// Comandos saem pelo outbox (command_id do cliente, captured_at real) e sao
// enviados imediatamente quando ha rede; sem rede ficam na fila.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Navigation,
  PackageCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DriverMap } from "@/pages/driver/DriverMap";
import { PrivacyNoticeModal } from "./PrivacyNoticeModal";
import { PermissionExplainerModal, type PermissionExplainerKind } from "./PermissionExplainerModal";
import { PushSection } from "./PushSection";
import { TrackingStatusCard } from "./TrackingStatusCard";
import { getCommandPosition, useAppForeground } from "@/hooks/useTripTracker";
import { tripTracker } from "@/lib/geoTracker";
import {
  dismissCommand,
  enqueueCommand,
  flushOutbox,
  listCommands,
  newCaptureCtx,
  type OutboxCommand,
} from "@/lib/outbox";
import { rpcRespondAssignment, type DriverTripPayload } from "@/lib/trips";
import {
  ACTIVE_TRIP_STATUSES,
  DRIVER_NEXT_STEP,
  EXCEPTION_KIND_LABEL,
  fmtDateTime,
  rejectionMessage,
  tripStatusMeta,
  type TripStatus,
} from "@/lib/tripStatus";

const STEPS: { key: TripStatus; label: string }[] = [
  { key: "en_route_to_pickup", label: "P/ coleta" },
  { key: "at_pickup", label: "Coleta" },
  { key: "loading", label: "Carga" },
  { key: "in_transit", label: "Trânsito" },
  { key: "at_delivery", label: "Entrega" },
  { key: "unloading", label: "Descarga" },
  { key: "delivered", label: "Comprovante" },
];
const ORDER: TripStatus[] = [
  "planned",
  "assigned",
  "driver_accepted",
  "en_route_to_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
  "delivered",
  "completed",
];

export function DriverTripPanel({
  data,
  refetch,
}: {
  data: Extract<DriverTripPayload, { has_trip: true }>;
  refetch: () => void;
}) {
  const { trip, assignment, privacy_notice, tracking_required, policy } = data;
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // explicacao contextual antes do PRIMEIRO pedido de permissao (localizacao / notificacoes)
  const [explainer, setExplainer] = useState<PermissionExplainerKind | null>(null);
  const [overrideFor, setOverrideFor] = useState<{ to: TripStatus; reason: string } | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [rejected, setRejected] = useState<OutboxCommand[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await listCommands();
      if (alive) setRejected(all.filter((c) => c.outcome !== null));
    };
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Rastreamento (UNICO caminho que pode pedir localizacao fora do inicio atomico):
  // o gate completo e avaliado dentro de tripTracker.start - designacao aceita +
  // aviso reconhecido + tracking_required + estado rastreavel + app em primeiro
  // plano. Fora disso, stop(). A visibilidade (HOME/retorno) e tratada pelo proprio
  // rastreador (persiste o buffer, envia a outbox e recarrega a elegibilidade no
  // servidor ao voltar); por isso NAO entra nas dependencias deste efeito.
  useEffect(() => {
    void tripTracker.start(
      trip.id,
      {
        assignmentState: assignment.state,
        noticeAcknowledged: privacy_notice.acknowledged,
        trackingRequired: tracking_required,
        tripStatus: trip.status,
      },
      policy,
    );
  }, [
    trip.id,
    trip.status,
    assignment.state,
    tracking_required,
    privacy_notice.acknowledged,
    policy,
  ]);
  // ao voltar ao primeiro plano, a tela recarrega a viagem (o rastreador ja recarregou a sua parte)
  const foreground = useAppForeground();
  useEffect(() => {
    if (foreground) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreground]);

  const meta = tripStatusMeta(trip.status);
  const next = DRIVER_NEXT_STEP[trip.status];
  const idx = ORDER.indexOf(trip.status);
  const origin =
    trip.freight.origin_lat != null && trip.freight.origin_lng != null
      ? { lat: Number(trip.freight.origin_lat), lng: Number(trip.freight.origin_lng) }
      : null;
  const dest =
    trip.freight.dest_lat != null && trip.freight.dest_lng != null
      ? { lat: Number(trip.freight.dest_lat), lng: Number(trip.freight.dest_lng) }
      : null;
  const driverPos = trip.last_location
    ? { lat: trip.last_location.lat, lng: trip.last_location.lng }
    : null;
  const etaLabel = useMemo(
    () =>
      trip.eta.at
        ? `${new Date(trip.eta.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (estimativa)`
        : "--:--",
    [trip.eta.at],
  );
  const openException = trip.exceptions.find(
    (x) => !["resolved", "converted_to_dispute"].includes(x.status),
  );

  async function respond(accept: boolean) {
    if (accept && !privacy_notice.acknowledged) {
      setNoticeOpen(true);
      return;
    }
    if (!accept && declineReason.trim().length < 10) {
      toast.error("Informe o motivo da recusa (mínimo 10 caracteres).");
      return;
    }
    setBusy(true);
    try {
      const r = await rpcRespondAssignment(
        assignment.id,
        accept,
        accept ? null : declineReason.trim(),
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      if (!r.applied && !r.duplicate) {
        toast.error(rejectionMessage(r.rejection_code));
        return;
      }
      toast.success(accept ? "Viagem aceita. Boa viagem!" : "Viagem recusada.");
      refetch();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "22023" && /privacy_notice/.test((e as Error).message)) setNoticeOpen(true);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Iniciar deslocamento" NAO passa pelo outbox nem por RPCs separadas: e UMA
   * chamada a start_trip_tracking (sessao + tracking_state + transicao + primeiro
   * ponto na mesma transacao), feita por tripTracker.startTrip depois do preflight
   * no servidor e da captura explicita do primeiro fix. Qualquer falha: viagem
   * segue driver_accepted, sem sessao, sem ponto, nada na outbox; o motorista pode
   * tentar de novo (falha de rede reenvia a MESMA tentativa; rejeicao conhecida
   * gera nova tentativa com novo command_id).
   */
  async function startTrip() {
    setExplainer(null);
    if (busy) return;
    setBusy(true);
    try {
      const r = await tripTracker.startTrip({ tripId: trip.id });
      if (r.ok) {
        toast.success(
          r.duplicate
            ? "Início já registrado anteriormente; rastreamento retomado."
            : `Etapa registrada: ${tripStatusMeta("en_route_to_pickup").label}`,
        );
      } else if (r.reason === "aviso_nao_reconhecido") {
        setNoticeOpen(true);
        toast.error(r.message);
      } else if (r.reason === "sem_rede") {
        toast.error(r.message); // mesma tentativa sera reenviada no proximo toque
      } else if (r.reason === "session_context_mismatch") {
        toast.error(r.message, { duration: 10_000 }); // nunca abre outra sessao automaticamente
      } else toast.error(r.message);
      refetch();
    } finally {
      setBusy(false);
    }
  }

  function onNextStep(to: TripStatus) {
    if (to === "en_route_to_pickup") {
      if (!privacy_notice.acknowledged) {
        setNoticeOpen(true);
        return;
      }
      setExplainer("trip_start"); // nada e lido ate "Continuar"
      return;
    }
    void transition(to, null);
  }

  async function transition(to: TripStatus, overrideReason: string | null) {
    setBusy(true);
    try {
      const pos = await getCommandPosition();
      const ctx = await newCaptureCtx(pos);
      await enqueueCommand({
        command_id: ctx.commandId,
        trip_id: trip.id,
        seq: ctx.seq,
        captured_at: ctx.capturedAt,
        lat: ctx.lat,
        lng: ctx.lng,
        accuracy_m: ctx.accuracyM,
        device_id: ctx.deviceId,
        kind: "transition",
        payload: { to, override_reason: overrideReason },
        media: [],
      });
      const rep = await flushOutbox();
      if (rep.sent) {
        toast.success(`Etapa registrada: ${tripStatusMeta(to).label}`);
      } else if (rep.rejected) {
        const all = await listCommands();
        const mine = all.find((c) => c.command_id === ctx.commandId);
        const code = mine?.outcome?.rejection_code ?? null;
        if (code === "outside_geofence" && !overrideReason) {
          setOverrideFor({ to, reason: "" });
          if (mine?.id != null) await dismissCommand(mine.id);
        } else toast.error(rejectionMessage(code));
      } else if (rep.failed) {
        toast.error("Falha ao enviar. O comando ficou na fila.");
      } else {
        toast("Sem internet — comando salvo na fila e será enviado ao reconectar.");
      }
      refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PrivacyNoticeModal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        onAcknowledged={refetch}
      />
      <PermissionExplainerModal
        kind={explainer}
        busy={busy}
        onCancel={() => setExplainer(null)}
        onConfirm={() => void startTrip()}
      />
      <DriverMap driver={driverPos} origin={origin} dest={dest} eta={etaLabel} />

      <div
        className="mx-4 mt-2.5 rounded-[16px] p-4"
        style={{ background: "#0D2744", border: "1px solid #1B6CB8" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className="text-[11px] uppercase font-medium tracking-wide"
              style={{ color: "#3B89D4" }}
            >
              {trip.trip_number}
            </div>
            <div className="text-[18px] font-medium mt-0.5" style={{ color: "#E6EDF3" }}>
              {trip.freight.origin} → {trip.freight.destination}
            </div>
            <div className="text-[13px] mt-0.5" style={{ color: "#8B949E" }}>
              {trip.freight.weight_tons ?? "—"} t · {trip.freight.steel_type ?? "Carga"} ·{" "}
              {trip.shipper?.name ?? "Embarcador"}
            </div>
          </div>
          <span
            className={`text-[11px] px-3 py-1 rounded-full font-medium whitespace-nowrap ${meta.cls}`}
          >
            {meta.short}
          </span>
        </div>
        <div className="flex items-center mt-4 px-1">
          {STEPS.map((s, i) => {
            const sIdx = ORDER.indexOf(s.key);
            const done = idx > sIdx || trip.status === "completed";
            const current = trip.status === s.key;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
                  <div
                    className="rounded-full relative z-10"
                    style={{
                      width: 10,
                      height: 10,
                      background: done ? "#1A9B5E" : current ? "#1B6CB8" : "#21262D",
                      border: !done && !current ? "1.5px solid #30363D" : undefined,
                      boxShadow: current ? "0 0 0 3px rgba(27,108,184,0.25)" : undefined,
                    }}
                  />
                  <div
                    className="text-[9px] mt-1.5 whitespace-nowrap"
                    style={{ color: done || current ? "#E6EDF3" : "#8B949E" }}
                  >
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="h-[2px] flex-1 mx-1"
                    style={{ background: done ? "#1A9B5E" : "#21262D", marginBottom: 18 }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {trip.eta.at && (
          <div className="mt-3 text-[12px]" style={{ color: "#8B949E" }}>
            Chegada estimada {fmtDateTime(trip.eta.at)} · {trip.eta.label}
            {trip.planned_delivery_at ? ` · prazo ${fmtDateTime(trip.planned_delivery_at)}` : ""}
          </div>
        )}
      </div>

      {assignment.state === "offered" && (
        <div
          className="mx-4 mt-3 rounded-[14px] p-4 space-y-3"
          style={{ background: "#161B22", border: "1px solid #F0A500" }}
        >
          <div className="text-[15px] font-medium" style={{ color: "#E6EDF3" }}>
            Nova viagem designada para você
          </div>
          <div className="text-[12px]" style={{ color: "#8B949E" }}>
            Designada em {fmtDateTime(assignment.assigned_at)}. Ao aceitar, o rastreamento passa a
            valer durante a viagem
            {privacy_notice.published
              ? privacy_notice.acknowledged
                ? " (aviso de privacidade já reconhecido)."
                : ". Antes, você precisa reconhecer o aviso de privacidade."
              : ". Atenção: nenhum aviso de privacidade está publicado — o aceite ficará bloqueado."}
          </div>
          {!declining ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void respond(true)}
                className="flex-1 rounded-[12px] bg-[#1A9B5E] text-white font-medium disabled:opacity-50"
                style={{ height: 52 }}
              >
                {privacy_notice.acknowledged ? "Aceitar viagem" : "Ler aviso e aceitar"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeclining(true)}
                className="rounded-[12px] px-4"
                style={{ border: "1px solid #C23333", color: "#F87171", height: 52 }}
              >
                Recusar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Motivo da recusa (mínimo 10 caracteres)"
                className="w-full rounded-[10px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
                style={{ height: 72, fontSize: 14 }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeclining(false)}
                  className="flex-1 rounded-[12px]"
                  style={{ border: "1px solid #30363D", color: "#E6EDF3", height: 44 }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void respond(false)}
                  className="flex-1 rounded-[12px] bg-[#C23333] text-white"
                  style={{ height: 44 }}
                >
                  Confirmar recusa
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {assignment.state === "accepted" && (
        <>
          <TrackingStatusCard trackingRequired={tracking_required} />
          <PushSection />
        </>
      )}

      {trip.paused_by_contract && (
        <Banner
          color="#F0A500"
          text="Viagem pausada pelo contrato (disputa ou cancelamento). Rastreamento segue ativo; comandos de etapa ficam bloqueados até a retomada."
        />
      )}
      {trip.has_open_critical_exception && (
        <Banner
          color="#F87171"
          text="Alerta crítico aberto. A entrega só prossegue após o encerramento pela transportadora/SteelGo."
        />
      )}
      {trip.delivery_exception && (
        <Banner
          color="#F0A500"
          text="Divergência de entrega aberta. Aguarde a decisão da SteelGo (nova tentativa, retorno ou aceite)."
        />
      )}
      {trip.status === "returning" && (
        <Banner
          color="#F0A500"
          text="Retorno à origem determinado. Ao chegar, registre o recibo de retorno com foto."
        />
      )}
      {openException && !trip.has_open_critical_exception && (
        <Banner
          color="#8B949E"
          text={`Ocorrência aberta: ${EXCEPTION_KIND_LABEL[openException.kind] ?? openException.kind} (${openException.status}).`}
        />
      )}

      {assignment.state === "accepted" && (
        <div className="pt-3 pb-2 space-y-2 px-4">
          {next && (
            <button
              type="button"
              disabled={busy || trip.paused_by_contract}
              onClick={() => onNextStep(next.to)}
              className="w-full flex items-center justify-center gap-2 rounded-[14px] font-medium disabled:opacity-50"
              style={{
                height: 56,
                fontSize: 17,
                background: "#1B6CB8",
                color: "#fff",
                touchAction: "manipulation",
              }}
            >
              <Navigation size={22} /> {next.label}
            </button>
          )}
          {next && (
            <div className="text-[12px] text-center" style={{ color: "#8B949E" }}>
              {next.hint}
            </div>
          )}
          {(trip.status === "at_pickup" || trip.status === "loading") && (
            <Link
              to="/driver/checkpoint"
              className="w-full flex items-center justify-center gap-2 rounded-[14px] font-medium"
              style={{
                height: 52,
                fontSize: 15,
                background: "#161B22",
                border: "1px solid #1B6CB8",
                color: "#E6EDF3",
              }}
            >
              <Camera size={20} /> Registrar carga carregada (foto
              {trip.loaded_at ? " — já registrada" : ""})
            </Link>
          )}
          {(trip.status === "at_delivery" || trip.status === "unloading") &&
            !trip.delivery_exception &&
            !trip.has_open_critical_exception && (
              <Link
                to="/driver/pod"
                className="w-full flex items-center justify-center gap-2 rounded-[14px] font-medium"
                style={{ height: 56, fontSize: 16, background: "#1A9B5E", color: "#fff" }}
              >
                <PackageCheck size={22} /> Comprovante de entrega
              </Link>
            )}
          {trip.status === "returning" && (
            <Link
              to="/driver/return-receipt"
              className="w-full flex items-center justify-center gap-2 rounded-[14px] font-medium"
              style={{ height: 52, fontSize: 15, background: "#F0A500", color: "#111" }}
            >
              <Undo2 size={20} /> Recibo de retorno
            </Link>
          )}
          {ACTIVE_TRIP_STATUSES.includes(trip.status) && (
            <Link
              to="/driver/exception"
              className="w-full flex items-center justify-center gap-2 rounded-[14px]"
              style={{
                height: 48,
                fontSize: 14,
                background: "#161B22",
                border: "1px solid #30363D",
                color: "#E6EDF3",
              }}
            >
              <ClipboardCheck size={18} /> Registrar ocorrência (atraso, pane, avaria…)
            </Link>
          )}
          <Link
            to="/driver/panic"
            className="w-full flex items-center justify-center gap-2 rounded-[14px] font-medium"
            style={{
              height: 52,
              fontSize: 15,
              background: "rgba(194,51,51,0.2)",
              border: "1.5px solid #C23333",
              color: "#F87171",
            }}
          >
            <AlertTriangle size={20} /> Alerta crítico{" "}
            {data.sos_mode === "homologation" ? "(em homologação)" : ""}
          </Link>
          {trip.status === "delivered" && (
            <div
              className="rounded-[12px] p-3 text-[13px] flex items-center gap-2"
              style={{ background: "#0A2118", color: "#2ECC8A" }}
            >
              <CheckCircle2 size={18} /> Entrega registrada em {fmtDateTime(trip.delivered_at)}. A
              viagem conclui quando o pagamento for confirmado.
            </div>
          )}
        </div>
      )}

      {overrideFor && (
        <div
          className="mx-4 mt-2 rounded-[14px] p-4 space-y-2"
          style={{ background: "#161B22", border: "1px solid #F0A500" }}
        >
          <div
            className="text-[14px] font-medium flex items-center gap-2"
            style={{ color: "#F0A500" }}
          >
            <MapPin size={16} /> Você está fora do raio do local
          </div>
          <div className="text-[12px]" style={{ color: "#8B949E" }}>
            Informe o motivo (mínimo 20 caracteres). O registro fica marcado como "fora do geofence"
            e visível para embarcador e transportadora.
          </div>
          <textarea
            value={overrideFor.reason}
            onChange={(e) => setOverrideFor({ ...overrideFor, reason: e.target.value })}
            className="w-full rounded-[10px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
            style={{ height: 72, fontSize: 14 }}
            placeholder="Ex.: pátio de espera a 600 m do portão, aguardando liberação"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOverrideFor(null)}
              className="flex-1 rounded-[12px]"
              style={{ border: "1px solid #30363D", color: "#E6EDF3", height: 44 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || overrideFor.reason.trim().length < 20}
              onClick={() => {
                const o = overrideFor;
                setOverrideFor(null);
                void transition(o.to, o.reason.trim());
              }}
              className="flex-1 rounded-[12px] bg-[#1B6CB8] text-white disabled:opacity-40"
              style={{ height: 44 }}
            >
              Registrar mesmo assim
            </button>
          </div>
        </div>
      )}

      {rejected.length > 0 && (
        <div
          className="mx-4 mt-3 rounded-[14px] p-3 space-y-2"
          style={{ background: "#161B22", border: "1px solid #C23333" }}
        >
          <div className="text-[13px] font-medium" style={{ color: "#F87171" }}>
            Comandos não aceitos pelo servidor
          </div>
          {rejected.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 text-[12px]"
              style={{ color: "#E6EDF3" }}
            >
              <XCircle size={14} style={{ color: "#F87171", marginTop: 2 }} />
              <div className="flex-1">
                <div>
                  {c.kind} · {fmtDateTime(c.captured_at)}
                </div>
                <div style={{ color: "#8B949E" }}>
                  {c.outcome?.status === "rejected"
                    ? rejectionMessage(c.outcome.rejection_code)
                    : (c.outcome?.detail ?? c.last_error)}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  c.id != null &&
                  dismissCommand(c.id).then(() =>
                    setRejected((r) => r.filter((x) => x.id !== c.id)),
                  )
                }
                className="text-[11px] underline"
                style={{ color: "#8B949E" }}
              >
                dispensar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Banner({ color, text }: { color: string; text: string }) {
  return (
    <div
      className="mx-4 mt-3 rounded-[12px] px-3 py-2 text-[12px]"
      style={{ background: "#161B22", border: `1px solid ${color}`, color }}
    >
      {text}
    </div>
  );
}
