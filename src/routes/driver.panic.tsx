// Alerta critico do motorista (Modulo 3). Abre open_sos: posicao + ocorrencia
// critica, notifica transportadora e SteelGo, preserva a trilha.
// NAO e central 24h e NAO aciona servicos de emergencia: 190 / 192 / 193.
import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueueCommand, flushOutbox, listCommands, newCaptureCtx } from "@/lib/outbox";
import { fetchMyDriverTrip } from "@/lib/trips";
import { fmtDateTime, rejectionMessage } from "@/lib/tripStatus";

export const Route = createFileRoute("/driver/panic")({ component: PanicPage });

const HOLD_MS = 3000;

function PanicPage() {
  const navigate = useNavigate();
  const geo = useGeolocation(true);
  const online = useOnlineStatus();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activated, setActivated] = useState<{ ackTarget: string | null; queued: boolean } | null>(
    null,
  );
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const { data, refetch } = useQuery({
    queryKey: ["driver-trip", "panic"],
    queryFn: fetchMyDriverTrip,
    refetchInterval: 10_000,
  });
  const trip = data?.has_trip ? data.trip : null;
  const sosMode = data?.sos_mode ?? "homologation";
  const openSos =
    trip?.exceptions.find(
      (x) => x.kind === "sos" && !["resolved", "converted_to_dispute"].includes(x.status),
    ) ?? null;

  useEffect(() => {
    if (openSos && !activated) setActivated({ ackTarget: openSos.ack_target_at, queued: false });
  }, [openSos, activated]);

  const start = () => {
    if (activated || !trip) return;
    setHolding(true);
    startRef.current = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / HOLD_MS, 1);
      setProgress(p);
      if (p >= 1) {
        void trigger();
        setHolding(false);
        return;
      }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    setHolding(false);
    setProgress(0);
  };

  async function trigger() {
    if (!trip) return;
    try {
      const ctx = await newCaptureCtx({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy });
      await enqueueCommand({
        command_id: ctx.commandId,
        trip_id: trip.id,
        seq: ctx.seq,
        captured_at: ctx.capturedAt,
        lat: ctx.lat,
        lng: ctx.lng,
        accuracy_m: ctx.accuracyM,
        device_id: ctx.deviceId,
        kind: "sos",
        payload: { note: null },
        media: [],
      });
      if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      if (!online) {
        setActivated({ ackTarget: null, queued: true });
        return;
      }
      const rep = await flushOutbox();
      if (rep.sent || rep.duplicates) {
        await refetch();
        setActivated({ ackTarget: null, queued: false });
      } else if (rep.rejected) {
        const c = (await listCommands()).find((x) => x.command_id === ctx.commandId);
        toast.error(rejectionMessage(c?.outcome?.rejection_code));
        if (c?.outcome?.rejection_code === "sos_already_open") await refetch();
      } else setActivated({ ackTarget: null, queued: true });
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao enviar o alerta");
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-[430px] min-h-[100dvh] relative flex flex-col"
      style={{
        background: "#1F0A0A",
        color: "#F87171",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          onClick={() => navigate({ to: "/driver" })}
          className="rounded-[10px] px-3 py-2 text-[13px]"
          style={{
            background: "rgba(194,51,51,0.2)",
            border: "1px solid #C23333",
            color: "#F87171",
          }}
        >
          ← Voltar
        </button>
        <div
          className="ml-auto px-3 py-1 rounded-full text-[12px] font-bold"
          style={{ background: "#C23333", color: "white" }}
        >
          ALERTA CRÍTICO
        </div>
      </header>

      <div
        className="mx-4 mt-4 rounded-[12px] p-3 text-[12px]"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid #C23333", color: "#FECACA" }}
      >
        <div className="font-medium">
          {sosMode === "homologation"
            ? "Alerta crítico operacional — EM HOMOLOGAÇÃO"
            : "Alerta crítico operacional"}
        </div>
        <div className="mt-1">
          Este botão avisa a transportadora e a SteelGo e preserva sua trilha.{" "}
          <b>Não é central 24h e não aciona polícia, bombeiros ou SAMU.</b> Em emergência, ligue:
        </div>
        <div className="mt-2 flex gap-2">
          {[
            ["190", "Polícia"],
            ["192", "SAMU"],
            ["193", "Bombeiros"],
          ].map(([n, l]) => (
            <a
              key={n}
              href={`tel:${n}`}
              className="flex-1 flex items-center justify-center gap-1 rounded-[10px] py-2 font-bold"
              style={{ background: "#C23333", color: "white" }}
            >
              <Phone size={14} /> {n} <span className="font-normal text-[11px]">{l}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {!trip ? (
          <div className="text-center text-[14px]" style={{ color: "#FECACA" }}>
            Sem viagem ativa: o alerta crítico só pode ser aberto durante uma viagem.
          </div>
        ) : !activated ? (
          <>
            <button
              onPointerDown={start}
              onPointerUp={cancel}
              onPointerCancel={cancel}
              onPointerLeave={cancel}
              className="relative flex items-center justify-center"
              style={{ width: 180, height: 180, touchAction: "manipulation" }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(#F87171 ${progress * 360}deg, rgba(194,51,51,0.25) 0deg)`,
                }}
              />
              <div
                className="absolute inset-[10px] rounded-full flex flex-col items-center justify-center"
                style={{ background: holding ? "#C23333" : "#7A1F1F" }}
              >
                <AlertTriangle size={44} style={{ color: "white" }} />
                <div className="text-[12px] font-bold mt-1" style={{ color: "white" }}>
                  {holding ? "SEGURE" : "SEGURAR 3 s"}
                </div>
              </div>
            </button>
            <div className="mt-6 text-center text-[13px]" style={{ color: "#FECACA" }}>
              Viagem {trip.trip_number}. Segure o botão por 3 segundos para acionar.
            </div>
            <div className="mt-3 flex items-center gap-1 text-[12px]" style={{ color: "#FCA5A5" }}>
              <MapPin size={14} />{" "}
              {geo.lat != null
                ? `${geo.lat.toFixed(4)}, ${geo.lng?.toFixed(4)} (±${Math.round(geo.accuracy ?? 0)} m)`
                : (geo.error ?? "obtendo posição…")}
            </div>
          </>
        ) : (
          <div
            className="w-full rounded-[16px] p-5 text-center"
            style={{ background: "rgba(0,0,0,0.35)", border: "1px solid #C23333" }}
          >
            <CheckCircle2 size={40} style={{ color: "#FECACA", margin: "0 auto" }} />
            <div className="text-[18px] font-medium mt-3" style={{ color: "white" }}>
              {activated.queued ? "Alerta salvo — sem internet" : "Alerta enviado"}
            </div>
            <div className="text-[13px] mt-2" style={{ color: "#FECACA" }}>
              {activated.queued
                ? "Será enviado assim que a conexão voltar. Enquanto isso, use os telefones de emergência acima."
                : openSos?.acknowledged_at
                  ? `Recebido pela ${openSos.acknowledged_by_kind === "carrier" ? "transportadora" : "SteelGo"} em ${fmtDateTime(openSos.acknowledged_at)}.`
                  : `Aguardando reconhecimento. Meta: ${fmtDateTime(openSos?.ack_target_at ?? activated.ackTarget)} (meta interna, não garantia).`}
            </div>
            {openSos && openSos.escalation_level > 0 && (
              <div className="text-[12px] mt-2" style={{ color: "#FCA5A5" }}>
                Escalonado internamente (nível {openSos.escalation_level}).
              </div>
            )}
            <div className="text-[12px] mt-3" style={{ color: "#FCA5A5" }}>
              Sua trilha está preservada. A viagem fica pausada até o encerramento do alerta.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
