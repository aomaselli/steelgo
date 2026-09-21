// Ocorrencia operacional aberta pelo motorista (Modulo 3): atraso, pane,
// avaria (foto obrigatoria), documento, acidente, furto/roubo, outra.
// Sai pelo outbox -> open_trip_exception.
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { DriverShell } from "@/components/driver/DriverShell";
import { DriverHeader, StepPhoto, usePhoto } from "@/components/trip/DriverCapture";
import { useGeolocation } from "@/hooks/useGeolocation";
import { getCommandPosition } from "@/hooks/useTripTracker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  enqueueCommand,
  flushOutbox,
  listCommands,
  newCaptureCtx,
  type OutboxMedia,
} from "@/lib/outbox";
import { sha256HexOfBuffer } from "@/lib/sha256";
import { buildTripMediaPath, fetchMyDriverTrip } from "@/lib/trips";
import { rejectionMessage } from "@/lib/tripStatus";

export const Route = createFileRoute("/driver/exception")({ component: ExceptionPage });

const KINDS = [
  { id: "delay", label: "Atraso", photo: false },
  { id: "vehicle_breakdown", label: "Pane do veículo", photo: false },
  { id: "cargo_damage", label: "Avaria na carga (foto obrigatória)", photo: true },
  { id: "document_issue", label: "Problema documental", photo: false },
  { id: "accident", label: "Acidente", photo: false },
  { id: "theft", label: "Furto / roubo", photo: false },
  { id: "other", label: "Outra ocorrência", photo: false },
] as const;

function ExceptionPage() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const geo = useGeolocation(true);
  const photo = usePhoto();
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("delay");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState<"form" | "photo">("form");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["driver-trip", "exception"], queryFn: fetchMyDriverTrip });
  const trip = data?.has_trip ? data.trip : null;
  const needsPhoto = KINDS.find((k) => k.id === kind)!.photo;

  async function submit() {
    if (!trip) return;
    if (description.trim().length < 10) {
      toast.error("Descreva a ocorrência (mínimo 10 caracteres).");
      return;
    }
    if (needsPhoto && !photo.blob) {
      setStep("photo");
      return;
    }
    setBusy(true);
    try {
      // posicao fresca da acao explicita (rastreador ativo); nunca abre dialogo por si
      const ctx = await newCaptureCtx(await getCommandPosition());
      const media: OutboxMedia[] = [];
      if (photo.blob) {
        const sha = await sha256HexOfBuffer(await photo.blob.arrayBuffer());
        media.push({
          key: "ev1",
          kind: "evidence",
          blob: photo.blob,
          sha256: sha,
          path: buildTripMediaPath(trip.id, ctx.commandId, "evidence", sha, "jpg"),
        });
      }
      await enqueueCommand({
        command_id: ctx.commandId,
        trip_id: trip.id,
        seq: ctx.seq,
        captured_at: ctx.capturedAt,
        lat: ctx.lat,
        lng: ctx.lng,
        accuracy_m: ctx.accuracyM,
        device_id: ctx.deviceId,
        kind: "exception",
        payload: {
          kind,
          severity: null,
          description: description.trim(),
          evidence_keys: media.map((m) => m.key),
        },
        media,
      });
      if (!online) {
        toast("Sem internet — ocorrência salva e será enviada ao reconectar.");
        navigate({ to: "/driver" });
        return;
      }
      const rep = await flushOutbox();
      if (rep.sent) toast.success("Ocorrência registrada");
      else if (rep.rejected) {
        const c = (await listCommands()).find((x) => x.command_id === ctx.commandId);
        toast.error(rejectionMessage(c?.outcome?.rejection_code));
        return;
      } else toast("Ocorrência na fila; será enviada em seguida.");
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
        title="Registrar ocorrência"
        onBack={() => (step === "photo" ? setStep("form") : navigate({ to: "/driver" }))}
      />
      {step === "photo" ? (
        <StepPhoto
          photoUrl={photo.url}
          hint="Fotografe a avaria / evidência"
          onCapture={photo.capture}
          onConfirm={() => setStep("form")}
          onRetake={photo.reset}
          onSkip={needsPhoto ? undefined : () => setStep("form")}
        />
      ) : (
        <div className="px-4 space-y-3 pb-10">
          {!trip && <div className="text-[13px] text-amber-400">Nenhuma viagem ativa.</div>}
          <div className="grid grid-cols-1 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className="text-left rounded-[12px] p-3 text-[14px]"
                style={{
                  background: kind === k.id ? "#161B22" : "#0D1117",
                  border: `1.5px solid ${kind === k.id ? "#1B6CB8" : "#30363D"}`,
                  color: "#E6EDF3",
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que aconteceu? (mínimo 10 caracteres)"
            className="w-full rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
            style={{ height: 96, fontSize: 14, resize: "none" }}
          />
          <button
            type="button"
            onClick={() => setStep("photo")}
            className="w-full rounded-[12px] text-[14px]"
            style={{ height: 44, border: "1px solid #30363D", color: "#E6EDF3" }}
          >
            {photo.blob
              ? "Foto anexada ✓ (trocar)"
              : needsPhoto
                ? "Anexar foto (obrigatória)"
                : "Anexar foto (opcional)"}
          </button>
          <div className="text-[11px] text-graphite-400">
            Acidente e furto/roubo pausam a viagem e preservam a trilha automaticamente. A
            transportadora e a SteelGo são notificadas.
          </div>
          <button
            type="button"
            disabled={busy || !trip}
            onClick={() => void submit()}
            className="w-full rounded-[14px] bg-steel-blue text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ height: 56, fontSize: 16 }}
          >
            <ClipboardCheck size={20} /> {busy ? "Enviando..." : "Registrar ocorrência"}
          </button>
        </div>
      )}
    </DriverShell>
  );
}
