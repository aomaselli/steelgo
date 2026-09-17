// Pecas reutilizaveis dos fluxos de captura do motorista (GPS, foto, QR).
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, MapPin, RotateCcw, ScanLine } from "lucide-react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { GeoState } from "@/hooks/useGeolocation";
import { compressImage } from "@/lib/imageUtils";

export function StepGPS({
  geo,
  onNext,
  maxAccuracy = 100,
}: {
  geo: GeoState;
  onNext: () => void;
  maxAccuracy?: number;
}) {
  const accColor =
    geo.accuracy == null
      ? "#8B949E"
      : geo.accuracy < 20
        ? "#2ECC8A"
        : geo.accuracy < 50
          ? "#F0A500"
          : "#F87171";
  return (
    <div className="px-6 py-12 flex flex-col items-center text-center">
      <MapPin
        size={56}
        className="text-steel-blue"
        style={{ animation: geo.loading ? "pulse 1.5s ease-in-out infinite" : undefined }}
      />
      {geo.loading ? (
        <div className="text-[18px] text-graphite-50 mt-6">Verificando localização...</div>
      ) : geo.error ? (
        <div className="text-[16px] text-red-400 mt-6">{geo.error}</div>
      ) : (
        <>
          <div className="text-[18px] text-esg-green-400 mt-6 font-medium">
            Localização confirmada
          </div>
          <div className="text-[13px] text-graphite-200 mt-2 tabular-nums">
            {geo.lat?.toFixed(5)}, {geo.lng?.toFixed(5)}
          </div>
          <div
            className="mt-4 px-3 py-1.5 rounded-full text-[12px] font-medium tabular-nums"
            style={{ background: `${accColor}22`, color: accColor }}
          >
            Precisão: ±{Math.round(geo.accuracy ?? 0)} m
          </div>
        </>
      )}
      <button
        onClick={onNext}
        disabled={geo.loading || (geo.accuracy != null && geo.accuracy > maxAccuracy)}
        className="mt-10 w-full rounded-[14px] bg-steel-blue text-white font-medium disabled:opacity-40"
        style={{ height: 56, fontSize: 16, touchAction: "manipulation" }}
      >
        Continuar
      </button>
      {!geo.loading && (
        <button onClick={onNext} className="mt-3 text-[13px] text-graphite-200 underline">
          Usar mesmo assim (fica registrado como baixa precisão)
        </button>
      )}
    </div>
  );
}

export function usePhoto() {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const capture = async (file: File) => {
    const b = await compressImage(file, 1280, 0.8);
    setBlob(b);
    setUrl(URL.createObjectURL(b));
  };
  const reset = () => {
    setBlob(null);
    setUrl(null);
  };
  return { blob, url, capture, reset };
}

export function StepPhoto({
  photoUrl,
  hint,
  onCapture,
  onConfirm,
  onRetake,
  onSkip,
}: {
  photoUrl: string | null;
  hint: string;
  onCapture: (f: File) => void;
  onConfirm: () => void;
  onRetake: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="px-4">
      {!photoUrl ? (
        <div>
          <div
            className="relative rounded-[14px] overflow-hidden bg-graphite-800"
            style={{ aspectRatio: "4/3" }}
          >
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
              {hint}
            </div>
          </div>
          <label
            className="mt-6 mx-auto flex items-center justify-center rounded-full bg-white"
            style={{
              width: 72,
              height: 72,
              border: "3px solid #1B6CB8",
              touchAction: "manipulation",
            }}
          >
            <div
              className="rounded-full bg-steel-blue flex items-center justify-center"
              style={{ width: 56, height: 56 }}
            >
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
          {onSkip && (
            <button
              onClick={onSkip}
              className="mt-4 w-full text-[13px] text-graphite-200 underline"
            >
              Sem foto
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="relative rounded-[14px] overflow-hidden">
            <img src={photoUrl} alt="captura" className="w-full" />
            <div
              className="absolute top-3 right-3 rounded-full bg-esg-green flex items-center justify-center"
              style={{ width: 36, height: 36 }}
            >
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

export function StepQR({
  onScanned,
  onSkip,
}: {
  onScanned: (c: string) => void;
  onSkip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: { stop: () => void } | undefined;
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
      } catch (e) {
        setErr((e as Error).message ?? "Câmera indisponível");
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
        style={{
          background: "#21262D",
          border: scanned ? "2px solid #1A9B5E" : "2px dashed #1A9B5E",
          minHeight: 240,
        }}
      >
        <video ref={videoRef} className="w-full" playsInline muted />
        {err && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-graphite-200 text-center p-4">
            {err}
          </div>
        )}
      </div>
      {scanned && (
        <div className="mt-3 text-center">
          <div className="text-[18px] text-esg-green-400 font-medium">Lacre lido</div>
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

export function DriverHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
      <button
        onClick={onBack}
        className="rounded-[10px] bg-graphite-700 flex items-center justify-center text-graphite-50"
        style={{ width: 36, height: 36, touchAction: "manipulation" }}
      >
        ←
      </button>
      <div className="text-[15px] text-graphite-50 font-medium">{title}</div>
    </div>
  );
}
