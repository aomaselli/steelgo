// Outbox duravel de localizacao: identidade estavel, ordem/dedup, remocao SOMENTE
// por classificacao terminal do servidor, erro transitorio mantem, nada em
// background, seq monotona apos "reload". IndexedDB substituido por um mock em
// memoria de `idb` (sem framework novo).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- mock de `idb` em memoria (openDB -> stores com keyPath/autoIncrement e store de meta)
type Row = Record<string, unknown> & { id?: number };
const stores: Record<string, Map<IDBValidKey, unknown>> = {};
const counters: Record<string, number> = {};
function memDb() {
  const ensure = (n: string) => (stores[n] ??= new Map());
  const api = {
    objectStoreNames: { contains: (n: string) => n in stores },
    createObjectStore: (n: string) => ensure(n),
    async add(n: string, v: Row) {
      const s = ensure(n);
      const id = (counters[n] = (counters[n] ?? 0) + 1);
      s.set(id, { ...v, id });
      return id;
    },
    async put(n: string, v: unknown, key?: IDBValidKey) {
      const s = ensure(n);
      if (key !== undefined) s.set(key, v);
      else s.set((v as Row).id!, v);
    },
    async get(n: string, k: IDBValidKey) {
      return ensure(n).get(k);
    },
    async getAll(n: string) {
      return [...ensure(n).values()];
    },
    async getAllKeys(n: string) {
      return [...ensure(n).keys()];
    },
    async delete(n: string, k: IDBValidKey) {
      ensure(n).delete(k);
    },
    async count(n: string) {
      return ensure(n).size;
    },
    async clear(n: string) {
      ensure(n).clear();
    },
    transaction(n: string) {
      const s = ensure(n);
      return {
        store: {
          get: async (k: IDBValidKey) => s.get(k),
          put: async (v: unknown, k: IDBValidKey) => {
            s.set(k, v);
          },
        },
        done: Promise.resolve(),
      };
    },
  };
  return api;
}
vi.mock("idb", () => ({
  openDB: async (_n: string, _v: number, o: { upgrade: (d: unknown) => void }) => {
    const d = memDb();
    o.upgrade(d);
    return d;
  },
}));
vi.mock("@/lib/device", () => ({
  getDeviceId: () => "00000000-0000-4000-8000-0000000000d1",
  isNativePlatform: () => true,
  platformName: () => "android",
  appVersion: () => "t",
  appBuild: () => "t",
}));
const TRIP = "bc6dd62d-20ba-4263-a86f-464019cfd1ed";
let ingestImpl: (pts: unknown[]) => Promise<unknown>;
const rpcIngestLocations = vi.fn((_t: string, _d: string, _b: string, pts: unknown[]) =>
  ingestImpl(pts),
);
let driverTrip: unknown = { has_trip: true, trip: { id: TRIP } };
const fetchMyDriverTrip = vi.fn(async () => driverTrip);
vi.mock("@/lib/trips", () => ({
  rpcIngestLocations: (...a: unknown[]) =>
    rpcIngestLocations(...(a as [string, string, string, unknown[]])),
  fetchMyDriverTrip: () => fetchMyDriverTrip(),
  rpcTransitionTrip: vi.fn(),
  rpcRecordCheckpoint: vi.fn(),
  rpcSubmitPod: vi.fn(),
  rpcSubmitReturnReceipt: vi.fn(),
  rpcOpenSos: vi.fn(),
  rpcOpenTripException: vi.fn(),
  uploadTripMedia: vi.fn(),
}));

type Outbox = typeof import("./outbox");
let ob: Outbox;
const ok = (over: Partial<Record<string, unknown>> = {}) => ({
  accepted: 0,
  stored_flagged: 0,
  duplicates: 0,
  downsampled: 0,
  rejected: [],
  tracking_active: true,
  trip_status: "en_route_to_pickup",
  ...over,
});
const P = (seq: number, t: string, lat = -19.9) => ({
  seq,
  captured_at: t,
  lat,
  lng: -44.1,
  accuracy_m: 10,
});

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(stores)) delete stores[k];
  for (const k of Object.keys(counters)) delete counters[k];
  rpcIngestLocations.mockClear();
  fetchMyDriverTrip.mockClear();
  driverTrip = { has_trip: true, trip: { id: TRIP } };
  ingestImpl = async (pts) => ok({ accepted: (pts as unknown[]).length });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  ob = await import("./outbox");
});
afterEach(() => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("outbox de localizacao — identidade, ordem e dedup", () => {
  it("seq e monotona e persistida (sobrevive a reload do modulo)", async () => {
    expect(await ob.nextSeqRange(3)).toEqual([1, 2, 3]);
    expect(await ob.nextSeq()).toBe(4);
    vi.resetModules();
    const ob2 = await import("./outbox"); // "restart" do app: mesmo IndexedDB
    expect(await ob2.nextSeqRange(2)).toEqual([5, 6]);
  });

  it("envio ordenado por (captured_at, seq); duplicatas locais (mesmo captured_at) eliminadas entre lotes; valores originais preservados", async () => {
    await ob.enqueueLocationBatch(TRIP, [
      P(3, "2026-09-21T10:00:30Z"),
      P(2, "2026-09-21T10:00:00Z"),
    ]);
    await ob.enqueueLocationBatch(TRIP, [
      P(9, "2026-09-21T10:00:30Z", -19.5),
      P(4, "2026-09-21T10:01:00Z"),
    ]);
    const rep = await ob.flushOutbox();
    expect(rpcIngestLocations).toHaveBeenCalledTimes(2);
    const sent1 = rpcIngestLocations.mock.calls[0][3] as Array<{
      seq: number;
      captured_at: string;
    }>;
    const sent2 = rpcIngestLocations.mock.calls[1][3] as Array<{
      seq: number;
      captured_at: string;
    }>;
    expect(sent1.map((p) => p.seq)).toEqual([2, 3]);
    expect(sent2.map((p) => p.seq)).toEqual([4]); // seq 9 tinha o mesmo captured_at do seq 3: nao reenviado
    expect(sent1[0]).toMatchObject({
      seq: 2,
      captured_at: "2026-09-21T10:00:00Z",
      lat: -19.9,
      accuracy_m: 10,
    });
    expect(rep.points.accepted).toBe(3);
    expect(await ob.pendingLocationBatches()).toBe(0);
  });
});

describe("outbox de localizacao — remocao somente por classificacao terminal", () => {
  it("accepted/duplicate/downsampled/rejeicao por ponto -> lote removido; telemetria separada", async () => {
    await ob.enqueueLocationBatch(TRIP, [
      P(1, "2026-09-21T10:00:00Z"),
      P(2, "2026-09-21T10:00:10Z"),
      P(3, "2026-09-21T10:00:00Z"),
      P(4, "2026-09-21T10:05:00Z"),
    ]);
    ingestImpl = async () =>
      ok({
        accepted: 1,
        duplicates: 1,
        downsampled: 1,
        rejected: [{ seq: 4, code: "accuracy_rejected" }],
      });
    const rep = await ob.flushOutbox();
    expect(rep.points).toMatchObject({
      accepted: 1,
      duplicates: 1,
      downsampled: 1,
      rejected: 1,
      retryable_failures: 0,
      batches_sent: 1,
    });
    expect(await ob.pendingLocationBatches()).toBe(0);
  });

  it("erro de rede -> lote mantido com attempts+1, ordem preservada, tentativa seguinte reenvia os MESMOS pontos", async () => {
    await ob.enqueueLocationBatch(TRIP, [P(1, "2026-09-21T10:00:00Z")]);
    await ob.enqueueLocationBatch(TRIP, [P(2, "2026-09-21T10:01:00Z")]);
    ingestImpl = async () => {
      throw new TypeError("Failed to fetch");
    };
    const rep = await ob.flushOutbox();
    expect(rep.points.retryable_failures).toBe(1);
    expect(rpcIngestLocations).toHaveBeenCalledTimes(1); // para no primeiro erro (ordem)
    const kept = await ob.listLocationBatches();
    expect(kept).toHaveLength(2);
    expect(kept[0].attempts).toBe(1);
    ingestImpl = async (pts) => ok({ accepted: (pts as unknown[]).length });
    await ob.flushOutbox();
    const again = rpcIngestLocations.mock.calls[1][3] as Array<{ seq: number }>;
    expect(again.map((p) => p.seq)).toEqual([1]);
    expect(rpcIngestLocations.mock.calls[1][2]).toBe(rpcIngestLocations.mock.calls[0][2]); // mesmo batch_id
    expect(await ob.pendingLocationBatches()).toBe(0);
  });

  it.each(["40001", "40P01", "XX000", "57014"])(
    "SQLSTATE %s e transitorio: mantem",
    async (code) => {
      await ob.enqueueLocationBatch(TRIP, [P(1, "2026-09-21T10:00:00Z")]);
      ingestImpl = async () => {
        throw Object.assign(new Error("x"), { code });
      };
      await ob.flushOutbox();
      expect(await ob.pendingLocationBatches()).toBe(1);
    },
  );

  it("resposta ambigua (vazia) -> mantem", async () => {
    await ob.enqueueLocationBatch(TRIP, [P(1, "2026-09-21T10:00:00Z")]);
    ingestImpl = async () => null;
    await ob.flushOutbox();
    expect(await ob.pendingLocationBatches()).toBe(1);
  });

  it("tracking_inactive -> lote BLOQUEADO (nao descartado) enquanto a viagem for a ativa; descartado so quando o servidor mostra outra/nenhuma viagem", async () => {
    await ob.enqueueLocationBatch(TRIP, [P(1, "2026-09-21T10:00:00Z")]);
    ingestImpl = async () => {
      throw Object.assign(new Error("ingest_trip_locations: tracking_inactive"), { code: "22023" });
    };
    await ob.flushOutbox();
    let b = await ob.listLocationBatches();
    expect(b).toHaveLength(1);
    expect(b[0].blocked_reason).toBe("tracking_inactive");
    // proximo flush: viagem continua ativa -> permanece, sem reenviar
    rpcIngestLocations.mockClear();
    await ob.flushOutbox();
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(await ob.pendingLocationBatches()).toBe(1);
    // servidor: nenhuma viagem ativa -> descarte classificado (dropped_terminal_trip)
    driverTrip = { has_trip: false };
    const rep = await ob.flushOutbox();
    expect(rep.points.dropped_terminal_trip).toBe(1);
    expect(await ob.pendingLocationBatches()).toBe(0);
    b = await ob.listLocationBatches();
    expect(b).toHaveLength(0);
  });

  it("app em segundo plano -> nenhuma chamada de rede", async () => {
    await ob.enqueueLocationBatch(TRIP, [P(1, "2026-09-21T10:00:00Z")]);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await ob.flushOutbox();
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(await ob.pendingLocationBatches()).toBe(1);
  });

  it("offline -> nenhuma chamada; lote intacto", async () => {
    await ob.enqueueLocationBatch(TRIP, [P(1, "2026-09-21T10:00:00Z")]);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await ob.flushOutbox();
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(await ob.pendingLocationBatches()).toBe(1);
  });

  it("meta do comando de inicio: set/get/delete; clearOutbox remove start_cmd:*", async () => {
    await ob.setMeta("start_cmd:" + TRIP, { command_id: "c1" });
    expect(await ob.getMeta("start_cmd:" + TRIP)).toEqual({ command_id: "c1" });
    await ob.clearOutbox();
    expect(await ob.getMeta("start_cmd:" + TRIP)).toBeUndefined();
    expect(await ob.nextSeq()).toBe(1); // sequencia nao e zerada pelo clear (continua monotona)
  });
});
