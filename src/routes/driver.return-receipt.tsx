// Recibo de retorno a origem (Modulo 3): quando a SteelGo decide o retorno
// apos recusa/divergencia. Foto obrigatoria; a viagem termina como "returned"
// (disposicao returned_to_origin) e o contrato NAO registra entrega.
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { DriverShell } from "@/components/driver/DriverShell";
import { DriverHeader, StepGPS, StepPhoto, usePhoto } from "@/components/trip/DriverCapture";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueueCommand, flushOutbox, listCommands, newCaptureCtx } from "@/lib/outbox";
import { sha256HexOfBuffer } from "@/lib/sha256";
import { buildTripMediaPath, fetchMyDriverTrip } from "@/lib/trips";
import { rejectionMessage } from "@/lib/tripStatus";

export const Route = createFileRoute("/driver/return-receipt")({ component: ReturnReceiptPage });

function ReturnReceiptPage() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const geo = useGeolocation(true);
  const photo = usePhoto();
  const [step, setStep] = useState(1);
  const [receiver, setReceiver] = useState("");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const [needOverride, setNeedOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["driver-trip", "return"], queryFn: fetchMyDriverTrip });
  const trip = data?.has_trip ? data.trip : null;

  async function submit(overrideReason: string | null) {
    if (!trip || !photo.blob) return;
    if (receiver.trim().length < 2) {
      toast.error("Informe quem recebeu a carga na origem.");
      return;
    }
    setBusy(true);
    try {
      const ctx = await newCaptureCtx({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy });
      const sha = await sha256HexOfBuffer(await photo.blob.arrayBuffer());
      await enqueueCommand({
        command_id: ctx.commandId,
        trip_id: trip.id,
        seq: ctx.seq,
        captured_at: ctx.capturedAt,
        lat: ctx.lat,
        lng: ctx.lng,
        accuracy_m: ctx.accuracyM,
        device_id: ctx.deviceId,
        kind: "return_receipt",
        payload: {
          receiver_name: receiver.trim(),
          note: note.trim() || null,
          override_reason: overrideReason,
        },
        media: [
          {
            key: "photo",
            kind: "photo",
            blob: photo.blob,
            sha256: sha,
            path: buildTripMediaPath(trip.id, ctx.commandId, "photo", sha, "jpg"),
          },
        ],
      });
      if (!online) {
        toast("Sem internet — recibo salvo e será enviado ao reconectar.");
        navigate({ to: "/driver" });
        return;
      }
      const rep = await flushOutbox();
      if (rep.sent) {
        toast.success("Retorno registrado. A viagem foi encerrada como devolvida.");
        navigate({ to: "/driver" });
        return;
      }
      if (rep.rejected) {
        const c = (await listCommands()).find((x) => x.command_id === ctx.commandId);
        const code = c?.outcome?.rejection_code ?? null;
        if (code === "outside_geofence" && !overrideReason) setNeedOverride(true);
        else toast.error(rejectionMessage(code));
        return;
      }
      toast("Recibo na fila; será enviado em seguida.");
      navigate({ to: "/driver" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverShell activeTab="home" noNav>
      <DriverHeader
        title={`Recibo de retorno · ${step} de 3`}
        onBack={() => (step > 1 ? setStep(step - 1) : navigate({ to: "/driver" }))}
      />
      {step === 1 && <StepGPS geo={geo} onNext={() => setStep(2)} />}
      {step === 2 && (
        <StepPhoto
          photoUrl={photo.url}
          hint="Fotografe a carga devolvida no pátio de origem"
          onCapture={photo.capture}
          onConfirm={() => setStep(3)}
          onRetake={photo.reset}
        />
      )}
      {step === 3 && (
        <div className="px-4 space-y-3 pb-10">
          {trip?.status !== "returning" && (
            <div className="text-[13px] text-amber-400">
              A viagem não está em retorno; este recibo será recusado pelo servidor.
            </div>
          )}
          <input
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="Quem recebeu na origem *"
            className="w-full rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
            style={{ fontSize: 15 }}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observações (opcional)"
            className="w-full rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
            style={{ height: 80, fontSize: 14, resize: "none" }}
          />
          {needOverride && (
            <div
              className="rounded-[12px] p-3 space-y-2"
              style={{ background: "#161B22", border: "1px solid #F0A500" }}
            >
              <div className="text-[13px]" style={{ color: "#F0A500" }}>
                Fora do raio da origem. Informe o motivo (mín. 20 caracteres).
              </div>
              <textarea
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                className="w-full rounded-[10px] bg-bg-input border border-graphite-600 text-graphite-50 p-2"
                style={{ height: 64, fontSize: 13 }}
              />
            </div>
          )}
          <button
            type="button"
            disabled={busy || !trip || !photo.blob || (needOverride && override.trim().length < 20)}
            onClick={() => void submit(needOverride ? override.trim() : null)}
            className="w-full rounded-[14px] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ height: 56, fontSize: 16, background: "#F0A500", color: "#111" }}
          >
            <Undo2 size={20} /> {busy ? "Enviando..." : "Registrar devolução"}
          </button>
        </div>
      )}
    </DriverShell>
  );
}
