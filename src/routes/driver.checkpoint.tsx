import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Camera, ScanLine, CheckCircle2, RotateCcw } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { BrowserQRCodeReader } from "@zxing/browser";
import { DriverShell } from "@/components/driver/DriverShell";
import { useAuth } from "@/contexts/AuthContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageUtils";
import { queueCheckpoint } from "@/lib/offlineQueue";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/checkpoint")({ component: CheckpointPage });

function CheckpointPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sealCode, setSealCode] = useState<string | null>(null);
  const [sealVerified, setSealVerified] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const geo = useGeolocation();
  const online = useOnlineStatus();
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [notes, setNotes] = useState("");

  // Find active contract
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id")
        .eq("driver_id", user.id)
        .in("status", ["active"])
        .limit(1);
      setContractId(data?.[0]?.id ?? null);
    })();
  }, [user]);

  // Auto-advance step 1 when GPS accuracy is good
  useEffect(() => {
    if (step === 1 && !geo.loading && geo.accuracy != null && geo.accuracy < 30) {
      const t = setTimeout(() => setStep(2), 2000);
      return () => clearTimeout(t);
    }
  }, [step, geo.loading, geo.accuracy]);

  async function handleSubmit() {
    if (!contractId || !user) {
      toast.error("Contrato não encontrado");
      return;
    }
    setSubmitting(true);
    const type = "transit_pickup";
    const photoName = `${contractId}_${Date.now()}.jpg`;
    try {
      if (online) {
        let photo_url: string | null = null;
        if (photoBlob) {
          const path = `${user.id}/${photoName}`;
          const { error: upErr } = await supabase.storage
            .from("cargo-photos")
            .upload(path, photoBlob, { contentType: "image/jpeg", upsert: true });
          if (!upErr) {
            const { data } = await supabase.storage.from("cargo-photos").createSignedUrl(path, 60 * 60 * 24 * 30);
            photo_url = data?.signedUrl ?? null;
          }
        }
        const { error } = await supabase.from("checkpoints").insert({
          contract_id: contractId,
          driver_id: user.id,
          type: type as never,
          lat: geo.lat,
          lng: geo.lng,
          qr_seal_code: sealCode,
          qr_verified: sealVerified,
          photo_url,
          recorded_at: new Date().toISOString(),
        });
        if (error) throw error;
        toast.success("Checkpoint enviado");
      } else {
        await queueCheckpoint({
          contract_id: contractId,
          driver_id: user.id,
          type,
          lat: geo.lat,
          lng: geo.lng,
          qr_seal_code: sealCode,
          qr_verified: sealVerified,
          photo_blob: photoBlob,
          photo_name: photoName,
          createdAt: Date.now(),
        });
        toast("Sem internet — checkpoint salvo", {
          description: "Será enviado quando reconectar",
        });
      }
      navigate({ to: "/driver/delivery-complete" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell activeTab="trip" noNav>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : navigate({ to: "/driver" }))}
          className="rounded-[10px] bg-graphite-700 flex items-center justify-center"
          style={{ width: 36, height: 36, touchAction: "manipulation" }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-[15px] text-graphite-50 font-medium">Checkpoint {step} de 4</div>
      </div>
      <div className="px-4 mb-5">
        <div className="h-2 rounded-full bg-graphite-700 overflow-hidden">
          <div className="h-full bg-steel-blue transition-all" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
      </div>

      {step === 1 && <StepGPS geo={geo} onNext={() => setStep(2)} />}
      {step === 2 && (
        <StepPhoto
          photoUrl={photoUrl}
          onCapture={async (file) => {
            const blob = await compressImage(file, 800, 0.75);
            setPhotoBlob(blob);
            setPhotoUrl(URL.createObjectURL(blob));
          }}
          onConfirm={() => setStep(3)}
          onRetake={() => {
            setPhotoBlob(null);
            setPhotoUrl(null);
          }}
        />
      )}
      {step === 3 && (
        <StepQR
          onScanned={(code) => {
            setSealCode(code);
            setSealVerified(true);
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setTimeout(() => setStep(4), 1500);
          }}
          onSkip={() => {
            setSealVerified(false);
            setStep(4);
          }}
        />
      )}
      {step === 4 && (
        <StepConfirm
          photoUrl={photoUrl}
          sealCode={sealCode}
          notes={notes}
          setNotes={setNotes}
          sigRef={sigRef}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </DriverShell>
  );
}

function StepGPS({ geo, onNext }: { geo: ReturnType<typeof useGeolocation>; onNext: () => void }) {
  const accColor =
    geo.accuracy == null ? "#8B949E" : geo.accuracy < 20 ? "#2ECC8A" : geo.accuracy < 50 ? "#F0A500" : "#F87171";
  return (
    <div className="px-6 py-12 flex flex-col items-center text-center">
      <div className="relative">
        <MapPin size={56} className="text-steel-blue" style={{ animation: geo.loading ? "pulse 1.5s ease-in-out infinite" : undefined }} />
      </div>
      {geo.loading ? (
        <div className="text-[18px] text-graphite-50 mt-6">Verificando localização...</div>
      ) : geo.error ? (
        <div className="text-[16px] text-red-400 mt-6">{geo.error}</div>
      ) : (
        <>
          <div className="text-[18px] text-esg-green-400 mt-6 font-medium">Localização confirmada</div>
          <div className="text-[13px] text-graphite-200 mt-2 tabular-nums">
            {geo.lat?.toFixed(5)}, {geo.lng?.toFixed(5)}
          </div>
          <div
            className="mt-4 px-3 py-1.5 rounded-full text-[12px] font-medium tabular-nums"
            style={{ background: `${accColor}22`, color: accColor }}
          >
            Precisão: ±{Math.round(geo.accuracy ?? 0)}m
          </div>
        </>
      )}
      <button
        onClick={onNext}
        disabled={geo.loading || (geo.accuracy != null && geo.accuracy > 100)}
        className="mt-10 w-full rounded-[14px] bg-steel-blue text-white font-medium disabled:opacity-40"
        style={{ height: 56, fontSize: 16, touchAction: "manipulation" }}
      >
        Continuar
      </button>
      {!geo.loading && (
        <button onClick={onNext} className="mt-3 text-[13px] text-graphite-200 underline">
          Usar mesmo assim
        </button>
      )}
    </div>
  );
}

function StepPhoto({
  photoUrl,
  onCapture,
  onConfirm,
  onRetake,
}: {
  photoUrl: string | null;
  onCapture: (f: File) => void;
  onConfirm: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="px-4">
      {!photoUrl ? (
        <div>
          <div className="relative rounded-[14px] overflow-hidden bg-graphite-800" style={{ aspectRatio: "4/3" }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera size={56} className="text-graphite-400" />
            </div>
            <div
              className="absolute inset-[10%] border-2 border-dashed rounded-lg pointer-events-none"
              style={{ borderColor: "rgba(255,255,255,0.4)" }}
            />
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-[13px] px-3 py-1 rounded"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              Fotografe toda a carga
            </div>
          </div>
          <label
            className="mt-6 mx-auto flex items-center justify-center rounded-full bg-white"
            style={{ width: 72, height: 72, border: "3px solid #1B6CB8", touchAction: "manipulation" }}
          >
            <div className="rounded-full bg-steel-blue flex items-center justify-center" style={{ width: 56, height: 56 }}>
              <Camera size={28} className="text-white" />
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onCapture(f);
              }}
            />
          </label>
        </div>
      ) : (
        <div>
          <div className="relative rounded-[14px] overflow-hidden">
            <img src={photoUrl} alt="captured" className="w-full" />
            <div className="absolute top-3 right-3 rounded-full bg-esg-green flex items-center justify-center" style={{ width: 36, height: 36 }}>
              <CheckCircle2 size={20} className="text-white" />
            </div>
          </div>
          <button
            onClick={onConfirm}
            className="mt-5 w-full rounded-[14px] bg-esg-green text-white font-medium"
            style={{ height: 56, fontSize: 16 }}
          >
            Usar esta foto
          </button>
          <button
            onClick={onRetake}
            className="mt-2 w-full rounded-[12px] bg-bg-input text-graphite-100 flex items-center justify-center gap-2"
            style={{ height: 48, fontSize: 14 }}
          >
            <RotateCcw size={16} />
            Tirar de novo
          </button>
        </div>
      )}
    </div>
  );
}

function StepQR({ onScanned, onSkip }: { onScanned: (c: string) => void; onSkip: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: any;
    (async () => {
      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (result) {
            const text = result.getText();
            setScanned(text);
            controls?.stop();
            onScanned(text);
          }
        });
      } catch (e: any) {
        setErr(e.message ?? "Câmera indisponível");
      }
    })();
    return () => controls?.stop();
  }, [onScanned]);

  return (
    <div className="px-4">
      <div className="flex items-center justify-center gap-2 mb-3">
        <ScanLine size={28} className="text-esg-green-400" />
        <div className="text-[16px] text-graphite-50">Escanear lacre da carga</div>
      </div>
      <div
        className="relative rounded-[14px] overflow-hidden flex items-center justify-center"
        style={{ background: "#21262D", border: scanned ? "2px solid #1A9B5E" : "2px dashed #1A9B5E", minHeight: 240 }}
      >
        <video ref={videoRef} className="w-full" playsInline muted />
        {!videoRef.current && !err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <ScanLine size={48} className="text-esg-green-400" />
            <div className="text-[14px] text-esg-green-400">Aponte para o QR Code</div>
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-graphite-200 text-center p-4">
            {err}
          </div>
        )}
      </div>
      {scanned && (
        <div className="mt-3 text-center">
          <div className="text-[18px] text-esg-green-400 font-medium">Lacre verificado</div>
          <div className="text-[12px] font-mono text-graphite-200 mt-1">{scanned}</div>
        </div>
      )}
      <button
        onClick={onSkip}
        className="mt-6 w-full rounded-[12px] bg-bg-input text-graphite-100"
        style={{ height: 48, fontSize: 14 }}
      >
        Sem QR nesta carga
      </button>
    </div>
  );
}

function StepConfirm({
  photoUrl,
  sealCode,
  notes,
  setNotes,
  sigRef,
  submitting,
  onSubmit,
}: {
  photoUrl: string | null;
  sealCode: string | null;
  notes: string;
  setNotes: (v: string) => void;
  sigRef: React.MutableRefObject<SignatureCanvas | null>;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="px-4 space-y-4 pb-8">
      <div className="rounded-[16px] bg-bg-surface p-4 flex items-center gap-3">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="rounded-[10px] object-cover" style={{ width: 64, height: 64 }} />
        ) : (
          <div className="rounded-[10px] bg-graphite-700 flex items-center justify-center" style={{ width: 64, height: 64 }}>
            <Camera size={24} className="text-graphite-400" />
          </div>
        )}
        <div className="flex-1">
          <div className="text-[14px] text-graphite-50 font-medium">Checkpoint em rota</div>
          <div className="text-[12px] text-graphite-200">{new Date().toLocaleString("pt-BR")}</div>
          {sealCode && <div className="text-[11px] font-mono text-graphite-400 mt-1 truncate">{sealCode}</div>}
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
        onClick={onSubmit}
        disabled={submitting}
        className="w-full rounded-[14px] bg-esg-green text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ height: 60, fontSize: 17 }}
      >
        <CheckCircle2 size={22} />
        {submitting ? "Enviando..." : "Confirmar e enviar"}
      </button>
    </div>
  );
}
