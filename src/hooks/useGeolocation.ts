import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GeoState = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  isLoading: boolean;
};

export type GeoOpts = {
  watch?: boolean;
  /** When set, upsert each new position into driver_positions for this contract */
  contractId?: string | null;
  driverId?: string | null;
  /** Min ms between upserts (default 10s) */
  upsertEveryMs?: number;
};

export function useGeolocation(opts: GeoOpts | boolean = false): GeoState {
  const cfg: GeoOpts = typeof opts === "boolean" ? { watch: opts } : opts;
  const { watch = false, contractId = null, driverId = null, upsertEveryMs = 10_000 } = cfg;

  const [state, setState] = useState<GeoState>({
    lat: null,
    lng: null,
    accuracy: null,
    error: null,
    loading: true,
    isLoading: true,
  });

  const lastUpsertRef = useRef(0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, loading: false, isLoading: false, error: "Geolocalização não disponível" }));
      return;
    }
    const onOk: PositionCallback = (pos) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        error: null,
        loading: false,
        isLoading: false,
      };
      setState(next);

      // Throttled upsert to driver_positions
      if (contractId && driverId) {
        const now = Date.now();
        if (now - lastUpsertRef.current >= upsertEveryMs) {
          lastUpsertRef.current = now;
          void supabase
            .from("driver_positions")
            .upsert(
              {
                driver_id: driverId,
                contract_id: contractId,
                lat: next.lat,
                lng: next.lng,
                accuracy: next.accuracy,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "driver_id,contract_id" },
            )
            .then(() => {});
        }
      }
    };
    const onErr: PositionErrorCallback = (err) =>
      setState((s) => ({ ...s, error: err.message, loading: false, isLoading: false }));
    const o: PositionOptions = { enableHighAccuracy: true, timeout: 5000, maximumAge: 10_000 };

    if (watch) {
      const id = navigator.geolocation.watchPosition(onOk, onErr, o);
      return () => navigator.geolocation.clearWatch(id);
    }
    navigator.geolocation.getCurrentPosition(onOk, onErr, o);
  }, [watch, contractId, driverId, upsertEveryMs]);

  return state;
}
