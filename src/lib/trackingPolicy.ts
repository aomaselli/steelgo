// Politica de rastreamento congelada na viagem (operational_policies, jsonb devolvido
// por get_my_driver_trip / start_trip_tracking). O SERVIDOR e a autoridade final
// (ingest_trip_locations faz a mesma amostragem e deduplica); o cliente aplica a
// regra antes de armazenar/enviar apenas para reduzir callbacks e trafego.
//
// Regra (v2+): primeiro ponto valido sempre segue no start_trip_tracking;
//   dt < location_min_interval_s          -> nao enviar (piso absoluto, ignora distancia)
//   dt >= piso e (dist >= location_min_distance_m OU dt >= location_stationary_interval_s) -> candidato
//   senao                                  -> nao enviar
// A comparacao e sempre com o ULTIMO PONTO ACEITO/CONHECIDO (o que foi enviado ou
// guardado), nunca com o ultimo callback bruto. Politica v1 (sem amostragem) aceita tudo.
import type { LocationPoint } from "@/lib/geoTracker";

export type TrackingPolicy = {
  version: number | null;
  accuracy_primary_m: number;
  accuracy_reject_m: number;
  location_batch_max_points: number;
  location_max_age_hours: number;
  /** nulos na politica v1 (sem amostragem) */
  location_min_interval_s: number | null;
  location_min_distance_m: number | null;
  location_stationary_interval_s: number | null;
  location_flush_interval_s: number | null;
};

const num = (v: unknown, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : dflt;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Le a politica do jsonb do servidor. Sem politica => valores conservadores da v1 (sem amostragem). */
export function parseTrackingPolicy(raw: unknown): TrackingPolicy {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    version: numOrNull(p.version),
    accuracy_primary_m: num(p.accuracy_primary_m, 100),
    accuracy_reject_m: num(p.accuracy_reject_m, 500),
    location_batch_max_points: Math.min(num(p.location_batch_max_points, 200), 200),
    location_max_age_hours: num(p.location_max_age_hours, 72),
    location_min_interval_s: numOrNull(p.location_min_interval_s),
    location_min_distance_m: numOrNull(p.location_min_distance_m),
    location_stationary_interval_s: numOrNull(p.location_stationary_interval_s),
    location_flush_interval_s: numOrNull(p.location_flush_interval_s),
  };
}

/** Distancia em metros (haversine; precisao suficiente para dezenas/centenas de metros). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Mesmo fix repetido pelo watch (cache do WebView): mesmo captured_at OU mesmas coordenadas no mesmo segundo. */
export function isSameFix(a: LocationPoint | null, b: LocationPoint): boolean {
  if (!a) return false;
  if (a.captured_at === b.captured_at) return true;
  return (
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.accuracy_m === b.accuracy_m &&
    Math.abs(new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()) < 1000
  );
}

export type SampleVerdict =
  | { keep: true }
  | { keep: false; why: "duplicate_fix" | "accuracy_rejected" | "min_interval" | "no_movement" };

/**
 * Decide se um callback do watch vira ponto a enviar. `last` = ultimo ponto aceito/
 * conhecido (primeiro fix do inicio, ultimo guardado no buffer/outbox ou ultimo enviado).
 */
export function sampleVerdict(
  last: LocationPoint | null,
  next: LocationPoint,
  policy: TrackingPolicy,
): SampleVerdict {
  if (isSameFix(last, next)) return { keep: false, why: "duplicate_fix" };
  if (next.accuracy_m > policy.accuracy_reject_m) return { keep: false, why: "accuracy_rejected" };
  if (!last || policy.location_min_interval_s == null) return { keep: true }; // v1: sem amostragem
  const dt = (new Date(next.captured_at).getTime() - new Date(last.captured_at).getTime()) / 1000;
  if (dt < policy.location_min_interval_s) return { keep: false, why: "min_interval" };
  const dist = distanceM(last, next);
  const stationary = policy.location_stationary_interval_s ?? Number.POSITIVE_INFINITY;
  const minDist = policy.location_min_distance_m ?? 0;
  if (dist >= minDist || dt >= stationary) return { keep: true };
  return { keep: false, why: "no_movement" };
}
