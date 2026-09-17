import { useEffect, useState } from "react";
import { tripTracker, type TrackerStatus } from "@/lib/geoTracker";
import {
  flushOutbox,
  pendingCommandCount,
  pendingLocationBatches,
  type FlushReport,
} from "@/lib/outbox";

export function useTripTracker(): TrackerStatus {
  const [s, setS] = useState<TrackerStatus>(tripTracker.getStatus());
  useEffect(() => tripTracker.subscribe(setS), []);
  return s;
}

/** Posicao fresca para um COMANDO (nao para a trilha): ultimo ponto do rastreador ou leitura pontual. */
export async function getCommandPosition(
  timeoutMs = 12_000,
): Promise<{ lat: number | null; lng: number | null; accuracy: number | null }> {
  const last = tripTracker.getStatus().last;
  if (last && Date.now() - new Date(last.captured_at).getTime() < 60_000)
    return { lat: last.lat, lng: last.lng, accuracy: last.accuracy_m };
  if (typeof navigator === "undefined" || !("geolocation" in navigator))
    return { lat: null, lng: null, accuracy: null };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      () => resolve({ lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 },
    );
  });
}

export type OutboxState = {
  commands: number;
  batches: number;
  syncing: boolean;
  last: FlushReport | null;
};

/** Estado da fila offline + sincronizacao automatica ao voltar a rede. */
export function useOutbox(pollMs = 5_000): OutboxState & { sync: () => Promise<void> } {
  const [st, setSt] = useState<OutboxState>({
    commands: 0,
    batches: 0,
    syncing: false,
    last: null,
  });
  const refresh = async () => {
    const [commands, batches] = await Promise.all([
      pendingCommandCount(),
      pendingLocationBatches(),
    ]);
    setSt((s) => ({ ...s, commands, batches }));
  };
  const sync = async () => {
    setSt((s) => ({ ...s, syncing: true }));
    try {
      const last = await flushOutbox();
      setSt((s) => ({ ...s, last }));
    } finally {
      setSt((s) => ({ ...s, syncing: false }));
      await refresh();
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs]);
  return { ...st, sync };
}
