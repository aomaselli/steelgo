// Comprovante de entrega (POD) do motorista - Modulo 3.
// accepted / accepted_with_notes: entrega. refused / partially_refused: NAO e
// entrega - abre divergencia para decisao da SteelGo. Sai pelo outbox.
import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import SignatureCanvas from "react-signature-canvas";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DriverShell } from "@/components/driver/DriverShell";
import { DriverHeader, StepGPS, StepPhoto, usePhoto } from "@/components/trip/DriverCapture";
import { useGeolocation } from "@/hooks/useGeolocation";
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
import { rejectionMessage, type PodOutcome } from "@/lib/tripStatus";

export const Route = createFileRoute("/driver/pod")({ component: PodPage });

const OUTCOMES: { id: PodOutcome; label: string; hint: string; cls: string }[] = [
  {
    id: "accepted",
    label: "Aceita integralmente",
    hint: "Recebedor conferiu e assinou.",
    cls: "#1A9B5E",
  },
  {
    id: "accepted_with_notes",
    label: "Aceita com ressalvas",
    hint: "Entrega feita, com observações (mín. 20 caracteres).",
    cls: "#F0A500",
  },
  {
    id: "partially_refused",
    label: "Recusa parcial",
    hint: "NÃO é entrega. Abre divergência para a SteelGo.",
    cls: "#C23333",
  },
  {
    id: "refused",
    label: "Recusa total",
    hint: "NÃO é entrega. Abre divergência para a SteelGo.",
    cls: "#C23333",
  },
];

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function PodPage() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const geo = useGeolocation(true);
  const sigRef = useRef<SignatureCanvas | null>(null);
  const photo = usePhoto();
  const [step, setStep] = useState(1);
  const [outcome, setOutcome] = useState<PodOutcome>("accepted");
  const [receiverName, setReceiverName] = useState("");
  const [docKind, setDocKind] = useState("rg");
  const [docLast4, setDocLast4] = useState("");
  const [qtyDeclared, setQtyDeclared] = useState("");
  const [qtyReceived, setQtyReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState("");
  const [needOverride, setNeedOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data } = useQuery({ queryKey: ["driver-trip", "pod"], queryFn: fetchMyDriverTrip });
  const trip = data?.has_trip ? data.trip : null;
  const refusal = outcome === "refused" || outcome === "partially_refused";
  const notesRequired = outcome !== "accepted";
  const canSubmit = useMemo(
    () =>
      !!trip &&
      receiverName.trim().length >= 2 &&
      !!photo.blob &&
      (!notesRequired || notes.trim().length >= 20),
    [trip, receiverName, photo.blob, notesRequired, notes],
  );

  async function submit(overrideReason: string | null) {
    if (!trip || !photo.blob) return;
    let sigBlob: Blob | null = null;
    if (!refusal) {
      if (!sigRef.current || sigRef.current.isEmpty()) {
        toast.error("Assinatura do recebedor é obrigatória para entrega aceita.");
        return;
      }
      sigBlob = dataUrlToBlob(sigRef.current.getTrimmedCanvas().toDataURL("image/png"));
      if (sigBlob.size < 1024) {
        toast.error("Assinatura muito curta. Assine novamente.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const ctx = await newCaptureCtx({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy });
      const media: OutboxMedia[] = [];
      const pSha = await sha256HexOfBuffer(await photo.blob.arrayBuffer());
      media.push({
        key: "photo1",
        kind: "photo",
        blob: photo.blob,
        sha256: pSha,
        path: buildTripMediaPath(trip.id, ctx.commandId, "photo", pSha, "jpg"),
      });
      if (sigBlob) {
        const sSha = await sha256HexOfBuffer(await sigBlob.arrayBuffer());
        media.push({
          key: "signature",
          kind: "signature",
          blob: sigBlob,
          sha256: sSha,
          path: buildTripMediaPath(trip.id, ctx.commandId, "signature", sSha, "png"),
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
        kind: "pod",
        payload: {
          outcome,
          receiverName: receiverName.trim(),
          receiverDocumentKind: docLast4 ? docKind : null,
          receiverDocumentLast4: docLast4 || null,
          qtyDeclared: qtyDeclared ? Number(qtyDeclared) : null,
          qtyReceived: qtyReceived ? Number(qtyReceived) : null,
          notes: notes.trim() || null,
          overrideReason,
          photo_keys: ["photo1"],
        },
        media,
      });
      if (!online) {
        toast("Sem internet — comprovante salvo e será enviado ao reconectar.");
        navigate({ to: "/driver" });
        return;
      }
      const rep = await flushOutbox();
      if (rep.sent) {
        navigate({ to: "/driver/delivery-complete", search: { outcome } });
        return;
      }
      if (rep.rejected) {
        const c = (await listCommands()).find((x) => x.command_id === ctx.commandId);
        const code = c?.outcome?.rejection_code ?? null;
        if (code === "outside_geofence" && !overrideReason) {
          setNeedOverride(true);
          toast.error("Fora do raio do local de entrega. Informe o motivo.");
        } else toast.error(rejectionMessage(code));
        return;
      }
      toast("Comprovante na fila; será enviado em seguida.");
      navigate({ to: "/driver" });
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell activeTab="home" noNav>
      <DriverHeader
        title={`Comprovante de entrega · ${step} de 3`}
        onBack={() => (step > 1 ? setStep(step - 1) : navigate({ to: "/driver" }))}
      />
      <div className="px-4 mb-4">
        <div className="h-2 rounded-full bg-graphite-700 overflow-hidden">
          <div
            className="h-full bg-esg-green transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>
      {step === 1 && <StepGPS geo={geo} onNext={() => setStep(2)} />}
      {step === 2 && (
        <StepPhoto
          photoUrl={photo.url}
          hint="Fotografe a carga no ponto de entrega"
          onCapture={photo.capture}
          onConfirm={() => setStep(3)}
          onRetake={photo.reset}
        />
      )}
      {step === 3 && (
        <div className="px-4 space-y-4 pb-10">
          <div className="space-y-2">
            <div className="text-[12px] uppercase tracking-wider text-graphite-400">Resultado</div>
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutcome(o.id)}
                className="w-full text-left rounded-[12px] p-3"
                style={{
                  background: outcome === o.id ? "#161B22" : "#0D1117",
                  border: `1.5px solid ${outcome === o.id ? o.cls : "#30363D"}`,
                }}
              >
                <div className="text-[14px] font-medium" style={{ color: "#E6EDF3" }}>
                  {o.label}
                </div>
                <div className="text-[12px]" style={{ color: "#8B949E" }}>
                  {o.hint}
                </div>
              </button>
            ))}
          </div>
          <input
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            placeholder="Nome de quem recebeu / recusou *"
            className="w-full rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
            style={{ fontSize: 15 }}
          />
          <div className="flex gap-2">
            <select
              value={docKind}
              onChange={(e) => setDocKind(e.target.value)}
              className="rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
              style={{ fontSize: 14 }}
            >
              <option value="rg">RG</option>
              <option value="cpf">CPF</option>
              <option value="cnh">CNH</option>
              <option value="other">Outro</option>
            </select>
            <input
              value={docLast4}
              onChange={(e) => setDocLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Últimos 4 dígitos (opcional)"
              className="flex-1 rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
              style={{ fontSize: 14 }}
              inputMode="numeric"
            />
          </div>
          <div className="text-[11px] text-graphite-400">
            Só os 4 últimos dígitos do documento são registrados — nunca o número completo.
          </div>
          <div className="flex gap-2">
            <input
              value={qtyDeclared}
              onChange={(e) => setQtyDeclared(e.target.value)}
              placeholder="Qtd. declarada"
              inputMode="decimal"
              className="flex-1 rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
              style={{ fontSize: 14 }}
            />
            <input
              value={qtyReceived}
              onChange={(e) => setQtyReceived(e.target.value)}
              placeholder="Qtd. recebida"
              inputMode="decimal"
              className="flex-1 rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
              style={{ fontSize: 14 }}
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              notesRequired
                ? "Descreva as ressalvas ou a recusa (mínimo 20 caracteres) *"
                : "Observações (opcional)"
            }
            className="w-full rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 p-3"
            style={{ height: 88, fontSize: 14, resize: "none" }}
          />
          {!refusal && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] uppercase tracking-wider text-graphite-400">
                  Assinatura do recebedor *
                </span>
                <button
                  type="button"
                  onClick={() => sigRef.current?.clear()}
                  className="text-[12px] text-graphite-200 flex items-center gap-1"
                >
                  <RotateCcw size={12} /> limpar
                </button>
              </div>
              <div className="rounded-[12px] overflow-hidden bg-white">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#10274A"
                  canvasProps={{ width: 380, height: 160, className: "w-full" }}
                />
              </div>
            </div>
          )}
          {needOverride && (
            <div
              className="rounded-[12px] p-3 space-y-2"
              style={{ background: "#161B22", border: "1px solid #F0A500" }}
            >
              <div className="text-[13px]" style={{ color: "#F0A500" }}>
                Fora do raio do local de entrega. Informe o motivo (mín. 20 caracteres); ficará
                visível ao embarcador.
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
            disabled={!canSubmit || submitting || (needOverride && override.trim().length < 20)}
            onClick={() => void submit(needOverride ? override.trim() : null)}
            className="w-full rounded-[14px] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ height: 60, fontSize: 17, background: refusal ? "#C23333" : "#1A9B5E" }}
          >
            <CheckCircle2 size={22} />{" "}
            {submitting ? "Enviando..." : refusal ? "Registrar recusa" : "Confirmar entrega"}
          </button>
        </div>
      )}
    </DriverShell>
  );
}
