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
  /** Availability record used for pre-contract capacity tracking */
  availabilityId?: string | null;
  /** Min ms between upserts (default 10s) */
  upsertEveryMs?: number;
};

export function useGeolocation(opts: GeoOpts | boolean = false): GeoState {
  const cfg: GeoOpts = typeof opts === "boolean" ? { watch: opts } : opts;
  const {
    watch = false,
    contractId = null,
    driverId = null,
    availabilityId = null,
    upsertEveryMs = 10_000,
  } = cfg;

  const [state, setState] = useState<GeoState>({
    lat: null,
    lng: null,
    accuracy: null,
    error: null,
    loading: true,
    isLoading: true,
  });

  const lastUpsertRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (mountedRef.current) {
        setState((s) => ({ ...s, loading: false, isLoading: false, error: "Geolocalização não disponível" }));
      }
      return;
    }

    if (!navigator.onLine) {
      if (mountedRef.current) {
        setState((s) => ({ ...s, loading: false, isLoading: false, error: "Sem internet — GPS local não pode sincronizar." }));
      }
      return;
    }

    const onOk: PositionCallback = (pos) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
        error: null,
        loading: false,
        isLoading: false,
      };

      if (!mountedRef.current) return;
      setState(next);

      const now = Date.now();
      if (now - lastUpsertRef.current < upsertEveryMs) return;
      lastUpsertRef.current = now;

      const persistCapacityLocation = async () => {
        const effectiveAvailabilityId = availabilityId ?? undefined;
        if (!effectiveAvailabilityId) return;

        try {
          const { error } = await supabase.rpc("update_capacity_location", {
            p_availability_id: effectiveAvailabilityId,
            p_lat: next.lat,
            p_lng: next.lng,
            p_accuracy_m: next.accuracy,
          });
          if (error) throw error;
          if (mountedRef.current) console.info("[geolocation] capacity location updated");
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Erro desconhecido";
          if (mountedRef.current) console.warn("[geolocation] update_capacity_location failed", message, err);
        }
      };

      if (availabilityId) {
        void persistCapacityLocation();
      }

      const persistDriverPosition = async () => {
        const effectiveDriverId = driverId ?? undefined;
        const effectiveContractId = contractId ?? undefined;
        if (!effectiveDriverId || !effectiveContractId) return;

        try {
          const { error } = await supabase.from("driver_positions").upsert(
            {
              driver_id: effectiveDriverId,
              contract_id: effectiveContractId,
              lat: next.lat,
              lng: next.lng,
              accuracy: next.accuracy,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "driver_id,contract_id" },
          );
          if (error) throw error;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Erro desconhecido";
          if (mountedRef.current) console.warn("[geolocation] driver_positions upsert failed", message, err);
        }
      };

      if (contractId && driverId) {
        void persistDriverPosition();
      }
    };

    const onErr: PositionErrorCallback = (err) => {
      const code = err.code ?? 0;
      const message =
        code === 1
          ? "Permissão de localização negada. Permita o acesso ao GPS para ativar a disponibilidade."
          : code === 2
            ? "GPS indisponível no momento. Tente novamente quando houver sinal."
            : "Erro ao obter localização em tempo real.";

      if (mountedRef.current) {
        setState((s) => ({ ...s, error: message, loading: false, isLoading: false }));
      }
    };

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 5_000,
    };

    const handle = watch
      ? navigator.geolocation.watchPosition(onOk, onErr, options)
      : navigator.geolocation.getCurrentPosition(onOk, onErr, options);

    return () => {
      if (watch && typeof handle === "number") {
        navigator.geolocation.clearWatch(handle);
      }
    };
  }, [watch, contractId, driverId, availabilityId, upsertEveryMs]);

  return state;
}
