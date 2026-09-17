// Estado do rastreamento e da fila offline, com o PROVEDOR identificado
// (web / community-dev / transistorsoft). Nunca esconde um provedor ausente.
import { RefreshCw, Satellite, WifiOff } from "lucide-react";
import { useOutbox, useTripTracker } from "@/hooks/useTripTracker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { relativeMinutes } from "@/lib/tripStatus";

export function TrackingStatusCard({ trackingRequired }: { trackingRequired: boolean }) {
  const t = useTripTracker();
  const ob = useOutbox();
  const online = useOnlineStatus();
  const pending = ob.commands + ob.batches;
  const color = !trackingRequired ? "#8B949E" : t.active ? "#2ECC8A" : "#F87171";
  return (
    <div
      className="mx-4 mt-3 rounded-[14px] p-3 text-[12px]"
      style={{ background: "#161B22", border: `1px solid ${t.active ? "#1A9B5E" : "#30363D"}` }}
    >
      <div className="flex items-center gap-2">
        <Satellite size={16} style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium" style={{ color: "#E6EDF3" }}>
            {!trackingRequired
              ? "Rastreamento inativo (fora de viagem ativa)"
              : t.active
                ? "Rastreamento ativo"
                : "Rastreamento DESLIGADO"}
          </div>
          <div style={{ color: "#8B949E" }} className="truncate">
            Provedor: {t.providerLabel || "nenhum"}
            {t.background ? " · segundo plano" : " · primeiro plano"}
          </div>
        </div>
        {!online && <WifiOff size={16} style={{ color: "#F0A500" }} />}
      </div>
      {trackingRequired && !t.active && t.reason && (
        <div className="mt-2" style={{ color: "#F87171" }}>
          {t.reason}
        </div>
      )}
      {t.error && (
        <div className="mt-2" style={{ color: "#F0A500" }}>
          {t.error}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between" style={{ color: "#8B949E" }}>
        <span>
          Último ponto:{" "}
          {t.last
            ? `${relativeMinutes(t.last.captured_at)} · ±${Math.round(t.last.accuracy_m)} m`
            : "—"}{" "}
          · enviados {t.sentPoints}
          {t.lastSync ? ` · sync ${relativeMinutes(t.lastSync)}` : ""}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span style={{ color: pending ? "#F0A500" : "#8B949E" }}>
          Fila offline: {ob.commands} comando(s), {ob.batches} lote(s) de posição
        </span>
        <button
          type="button"
          onClick={() => void ob.sync()}
          disabled={ob.syncing || !online}
          className="flex items-center gap-1 rounded-[8px] px-2 py-1 disabled:opacity-40"
          style={{ background: "#21262D", color: "#E6EDF3" }}
        >
          <RefreshCw size={12} className={ob.syncing ? "animate-spin" : ""} /> Sincronizar
        </button>
      </div>
      {ob.last && (ob.last.rejected > 0 || ob.last.failed > 0) && (
        <div className="mt-2" style={{ color: "#F87171" }}>
          {ob.last.rejected} comando(s) recusado(s) pelo servidor e {ob.last.failed} falha(s). Veja
          os detalhes abaixo.
        </div>
      )}
    </div>
  );
}
