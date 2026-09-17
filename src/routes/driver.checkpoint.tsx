// Checkpoint de CARGA CARREGADA (Modulo 3): foto obrigatoria, lacre opcional.
// Sai pelo outbox (command_id do cliente) -> record_trip_checkpoint. Sem rede,
// fica na fila com a foto e sobe depois no caminho canonico do trip-media.
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { DriverShell } from "@/components/driver/DriverShell";
import {
  DriverHeader,
  StepGPS,
  StepPhoto,
  StepQR,
  usePhoto,
} from "@/components/trip/DriverCapture";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueueCommand, flushOutbox, listCommands, newCaptureCtx } from "@/lib/outbox";
import { sha256HexOfBuffer } from "@/lib/sha256";
import { buildTripMediaPath, fetchMyDriverTrip } from "@/lib/trips";
import { rejectionMessage } from "@/lib/tripStatus";

export const Route = createFileRoute("/driver/checkpoint")({ component: CheckpointPage });

function CheckpointPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const photo = usePhoto();
  const [sealCode, setSealCode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const geo = useGeolocation(true);
  const online = useOnlineStatus();
  const { data } = useQuery({
    queryKey: ["driver-trip", "checkpoint"],
    queryFn: fetchMyDriverTrip,
  });
  const trip = data?.has_trip ? data.trip : null;

  useEffect(() => {
    if (step === 1 && !geo.loading && geo.accuracy != null && geo.accuracy < 30) {
      const t = setTimeout(() => setStep(2), 1500);
      return () => clearTimeout(t);
    }
  }, [step, geo.loading, geo.accuracy]);

  async function handleSubmit() {
    if (!trip) {
      toast.error("Nenhuma viagem ativa.");
      return;
    }
    if (!photo.blob) {
      toast.error("A foto da carga é obrigatória.");
      return;
    }
    if (photo.blob.size < 1024) {
      toast.error("Foto inválida (muito pequena).");
      return;
    }
    setSubmitting(true);
    try {
      const ctx = await newCaptureCtx({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy });
      const sha256 = await sha256HexOfBuffer(await photo.blob.arrayBuffer());
      const path = buildTripMediaPath(trip.id, ctx.commandId, "photo", sha256, "jpg");
      await enqueueCommand({
        command_id: ctx.commandId,
        trip_id: trip.id,
        seq: ctx.seq,
        captured_at: ctx.capturedAt,
        lat: ctx.lat,
        lng: ctx.lng,
        accuracy_m: ctx.accuracyM,
        device_id: ctx.deviceId,
        kind: "checkpoint",
        payload: { kind: "loaded", seal_code: sealCode, note: notes.trim() || null },
        media: [{ key: "photo", kind: "photo", blob: photo.blob, sha256, path }],
      });
      if (online) {
        const rep = await flushOutbox();
        if (rep.sent) toast.success("Carga carregada registrada");
        else if (rep.rejected) {
          const c = (await listCommands()).find((x) => x.command_id === ctx.commandId);
          toast.error(rejectionMessage(c?.outcome?.rejection_code));
        } else toast("Registro salvo na fila; será enviado em seguida.");
      } else {
        toast("Sem internet — registro salvo e será enviado ao reconectar.");
      }
      navigate({ to: "/driver" });
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao registrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell activeTab="home" noNav>
      <DriverHeader
        title={`Carga carregada · ${step} de 4`}
        onBack={() => (step > 1 ? setStep(step - 1) : navigate({ to: "/driver" }))}
      />
      <div className="px-4 mb-5">
        <div className="h-2 rounded-full bg-graphite-700 overflow-hidden">
          <div
            className="h-full bg-steel-blue transition-all"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>
      {!trip && (
        <div className="px-4 text-[13px] text-amber-400">
          Nenhuma viagem ativa encontrada para este motorista.
        </div>
      )}
      {step === 1 && <StepGPS geo={geo} onNext={() => setStep(2)} />}
      {step === 2 && (
        <StepPhoto
          photoUrl={photo.url}
          hint="Fotografe toda a carga no veículo"
          onCapture={photo.capture}
          onConfirm={() => setStep(3)}
          onRetake={photo.reset}
        />
      )}
      {step === 3 && (
        <StepQR
          onScanned={(c) => {
            setSealCode(c);
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setTimeout(() => setStep(4), 1200);
          }}
          onSkip={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <div className="px-4 space-y-4 pb-8">
          <div className="rounded-[16px] bg-bg-surface p-4 flex items-center gap-3">
            {photo.url && (
              <img
                src={photo.url}
                alt=""
                className="rounded-[10px] object-cover"
                style={{ width: 64, height: 64 }}
              />
            )}
            <div className="flex-1">
              <div className="text-[14px] text-graphite-50 font-medium">
                Carga carregada · {trip?.trip_number ?? "—"}
              </div>
              <div className="text-[12px] text-graphite-200">
                {new Date().toLocaleString("pt-BR")}
              </div>
              {sealCode && (
                <div className="text-[11px] font-mono text-graphite-400 mt-1 truncate">
                  Lacre {sealCode}
                </div>
              )}
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observação (opcional)"
            className="w-full rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3 outline-none focus:border-steel-blue"
            style={{ height: 80, fontSize: 15, resize: "none" }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || !trip}
            className="w-full rounded-[14px] bg-esg-green text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ height: 60, fontSize: 17 }}
          >
            <CheckCircle2 size={22} /> {submitting ? "Registrando..." : "Confirmar carga carregada"}
          </button>
        </div>
      )}
    </DriverShell>
  );
}
