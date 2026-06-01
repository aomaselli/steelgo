import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, MapPin, Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/panic")({ component: PanicPage });

const HOLD_MS = 3000;

function PanicPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const geo = useGeolocation(true);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activated, setActivated] = useState(false);
  const [alertId, setAlertId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  // Send GPS pings while activated
  useEffect(() => {
    if (!activated || !alertId || !user) return;
    const interval = setInterval(() => {
      if (geo.lat != null && geo.lng != null) {
        supabase.from("security_alerts_tracking" as any).insert({
          alert_id: alertId,
          driver_id: user.id,
          lat: geo.lat,
          lng: geo.lng,
        });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [activated, alertId, geo.lat, geo.lng, user]);

  const start = () => {
    if (activated) return;
    setHolding(true);
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(elapsed / HOLD_MS, 1);
      setProgress(p);
      if (p >= 1) {
        triggerAlert();
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

  async function triggerAlert() {
    try {
      const { data, error } = await supabase
        .from("security_alerts")
        .insert({
          type: "panic_button" as never,
          severity: "critical" as never,
          lat: geo.lat,
          lng: geo.lng,
          title: "Botão de pânico",
          description: `${profile?.full_name ?? "Motorista"} acionou o botão de pânico`,
        })
        .select("id")
        .single();
      if (error) throw error;
      setAlertId(data.id);
      setActivated(true);
      const msg = `🚨 EMERGÊNCIA SteelGo: ${profile?.full_name ?? "Motorista"} ativou pânico. Ver: https://maps.google.com/?q=${geo.lat},${geo.lng}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar alerta");
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-[430px] min-h-[100dvh] relative flex flex-col"
      style={{ background: "#1F0A0A", color: "#F87171", WebkitTapHighlightColor: "transparent", userSelect: "none" }}
    >
      <header className="flex items-center justify-between px-4 pt-5">
        {!activated && (
          <button
            onClick={() => navigate({ to: "/driver" })}
            className="rounded-[10px] px-3 py-2 text-[13px]"
            style={{ background: "rgba(194,51,51,0.2)", border: "1px solid #C23333", color: "#F87171" }}
          >
            ← Voltar
          </button>
        )}
        <div className="ml-auto px-3 py-1 rounded-full text-[12px] font-bold" style={{ background: "#C23333", color: "white" }}>
          SOS
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {!activated ? (
          <>
            <button
              onPointerDown={start}
              onPointerUp={cancel}
              onPointerCancel={cancel}
              onPointerLeave={cancel}
              className="relative flex items-center justify-center"
              style={{ width: 160, height: 160, touchAction: "manipulation" }}
            >
              {/* Outer ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: "3px solid #C23333",
                  boxShadow: holding ? "0 0 0 8px rgba(194,51,51,0.3)" : "0 0 0 0 rgba(194,51,51,0.5)",
                  animation: holding ? undefined : "pulse 2s ease-in-out infinite",
                }}
              />
              {/* Progress ring */}
              {holding && (
                <svg className="absolute inset-0" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r="76"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 76}
                    strokeDashoffset={2 * Math.PI * 76 * (1 - progress)}
                    transform="rotate(-90 80 80)"
                    style={{ transition: "stroke-dashoffset 0.1s linear" }}
                  />
                </svg>
              )}
              {/* Inner */}
              <div
                className="rounded-full flex flex-col items-center justify-center"
                style={{ width: 120, height: 120, background: "#C23333" }}
              >
                <AlertTriangle size={44} className="text-white" />
                <div className="text-white text-[13px] font-bold mt-1">PÂNICO</div>
              </div>
            </button>
            <div className="mt-6 text-center text-[14px] text-graphite-200">
              {holding
                ? `Segure ${Math.max(1, Math.ceil(HOLD_MS / 1000 - (progress * HOLD_MS) / 1000))}...`
                : "Segure por 3 segundos para ativar"}
            </div>

            <div
              className="mt-10 w-full rounded-[14px] p-4"
              style={{ background: "rgba(194,51,51,0.12)", border: "1px solid rgba(194,51,51,0.3)" }}
            >
              <div className="text-[12px] text-red-400 font-semibold mb-2">O que acontece:</div>
              <Row icon={<MapPin size={16} />} text="Sua localização em tempo real" />
              <Row icon={<Phone size={16} />} text="Central SteelGo e transportadora alertadas" />
              <Row icon={<MessageCircle size={16} />} text="WhatsApp com sua localização" />
            </div>

            <div className="mt-8 text-center">
              <div className="text-[12px] text-graphite-200">Central 24h</div>
              <a href="tel:+551199999999" className="text-[20px] text-graphite-50 font-medium tabular-nums">
                (11) 9 9999-9999
              </a>
            </div>
          </>
        ) : (
          <ActivatedView lat={geo.lat} lng={geo.lng} onCancel={() => setActivated(false)} />
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(194,51,51,0.5)}50%{box-shadow:0 0 0 16px rgba(194,51,51,0)}}`}</style>
    </div>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px] text-graphite-100">
      <span className="text-red-400">{icon}</span>
      {text}
    </div>
  );
}

function ActivatedView({ lat, lng, onCancel }: { lat: number | null; lng: number | null; onCancel: () => void }) {
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: "3px solid #1A9B5E", animation: "pulse-g 2s ease-in-out infinite" }}
        />
        <div className="rounded-full flex items-center justify-center bg-esg-green" style={{ width: 120, height: 120 }}>
          <CheckCircle2 size={56} className="text-white" />
        </div>
      </div>
      <div className="text-[24px] text-graphite-50 font-medium mt-6">Alerta enviado!</div>
      <div
        className="mt-4 px-3 py-1.5 rounded-full text-[11px] tabular-nums"
        style={{ background: "rgba(46,204,138,0.15)", color: "#2ECC8A" }}
      >
        📍 {lat?.toFixed(5)}, {lng?.toFixed(5)}
      </div>
      <div className="mt-4 space-y-1 text-[13px] text-esg-green-400">
        <div>✓ Central notificada</div>
        <div>✓ Transportadora notificada</div>
      </div>
      {!showPin ? (
        <button
          onClick={() => setShowPin(true)}
          className="mt-8 px-5 py-2.5 rounded-[10px] bg-bg-input text-graphite-200 text-[13px]"
        >
          Cancelar emergência (PIN)
        </button>
      ) : (
        <div className="mt-6 w-full max-w-xs">
          <input
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="••••"
            className="w-full text-center tracking-[0.5em] text-[24px] rounded-[12px] bg-bg-input border border-graphite-600 text-graphite-50 outline-none"
            style={{ height: 56 }}
          />
          <button
            onClick={() => {
              if (pinInput === "1234") {
                toast.success("Emergência cancelada");
                onCancel();
              } else toast.error("PIN incorreto");
            }}
            className="mt-3 w-full rounded-[12px] bg-graphite-700 text-graphite-100"
            style={{ height: 48 }}
          >
            Confirmar
          </button>
        </div>
      )}
      <style>{`@keyframes pulse-g{0%,100%{box-shadow:0 0 0 0 rgba(26,155,94,0.5)}50%{box-shadow:0 0 0 16px rgba(26,155,94,0)}}`}</style>
    </div>
  );
}
