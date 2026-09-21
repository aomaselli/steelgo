// Substituto EM MEMORIA de @/lib/outbox para os testes do rastreador (vitest).
// Mantem a semantica usada pelo geoTracker: seq monotona, lotes persistidos,
// meta (comando de inicio pendente). Nenhum IndexedDB.
import { vi } from "vitest";
import type { LocationFlushStats, OutboxPoint } from "@/lib/outbox";

export function makeOutboxMemory() {
  let seq = 0;
  const batches: Array<{ trip_id: string; device_id: string; points: OutboxPoint[] }> = [];
  const meta = new Map<string, unknown>();
  const emptyStats = (): LocationFlushStats => ({
    batches_sent: 0,
    accepted: 0,
    stored_flagged: 0,
    duplicates: 0,
    downsampled: 0,
    rejected: 0,
    retryable_failures: 0,
    dropped_terminal_trip: 0,
  });
  const api = {
    batches,
    meta,
    reset() {
      seq = 0;
      batches.length = 0;
      meta.clear();
      api.flushOutbox.mockClear();
      api.enqueueLocationBatch.mockClear();
      api.nextSeqRange.mockClear();
    },
    nextSeq: vi.fn(async () => ++seq),
    nextSeqRange: vi.fn(async (n: number) => Array.from({ length: n }, () => ++seq)),
    enqueueLocationBatch: vi.fn(
      async (tripId: string, points: OutboxPoint[], deviceId = "dev-test") => {
        if (!tripId || points.length === 0) return;
        batches.push({ trip_id: tripId, device_id: deviceId, points: [...points] });
      },
    ),
    lastQueuedPoint: vi.fn(async (tripId: string) => {
      let best: OutboxPoint | null = null;
      for (const b of batches)
        if (b.trip_id === tripId)
          for (const p of b.points) if (!best || p.captured_at > best.captured_at) best = p;
      return best;
    }),
    getMeta: vi.fn(async (k: string) => meta.get(k)),
    setMeta: vi.fn(async (k: string, v: unknown) => {
      meta.set(k, v);
    }),
    deleteMeta: vi.fn(async (k: string) => {
      meta.delete(k);
    }),
    flushOutbox: vi.fn(async () => ({
      sent: 0,
      duplicates: 0,
      rejected: 0,
      failed: 0,
      locations: 0,
      points: emptyStats(),
    })),
    pendingLocationBatches: vi.fn(async () => batches.length),
    listLocationBatches: vi.fn(async () =>
      batches.map((b, i) => ({ ...b, id: i, batch_id: "b" + i, attempts: 0, created_at: i })),
    ),
    sortPoints: <T extends { seq: number; captured_at: string }>(pts: T[]) =>
      [...pts].sort((a, b) =>
        a.captured_at < b.captured_at ? -1 : a.captured_at > b.captured_at ? 1 : a.seq - b.seq,
      ),
    isRetryableError(e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "40001" || code === "40P01") return true;
      if (
        code === "42501" ||
        code === "22023" ||
        code === "22004" ||
        code === "23505" ||
        code === "P0002"
      )
        return false;
      return true;
    },
    enqueueCommand: vi.fn(async () => 1),
    newCaptureCtx: vi.fn(),
    clearOutbox: vi.fn(async () => undefined),
  };
  return api;
}
