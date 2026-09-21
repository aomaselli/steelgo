// tripTracker: autoridade unica + fila serial + stop idempotente + durabilidade.
// Prova: dialogo so dentro do gate; dois stop concorrentes compartilham a Promise;
// stop durante flush nunca envia trip nulo; callback durante stop e ignorado;
// HOME persiste o buffer sem rede; foreground envia a outbox e retoma sem 2a sessao.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeOutboxMemory } from "./testing/outboxMemory";

vi.mock("@/lib/device", () => ({
  isNativePlatform: () => true, // producao nativa (APK): provedor de primeiro plano via WebView
  getDeviceId: () => "00000000-0000-4000-8000-0000000000d1",
  platformName: () => "android",
  appVersion: () => "test",
  appBuild: () => "test",
}));
vi.mock("@/lib/appInfo", () => ({
  resolveAppVersion: async () => "1.0-test+1",
  appVersionSync: () => "1.0-test+1",
}));
const mem = makeOutboxMemory();
vi.mock("@/lib/outbox", () => mem);

const TRIP = "bc6dd62d-20ba-4263-a86f-464019cfd1ed";
let payload: Record<string, unknown>;
const fetchMyDriverTrip = vi.fn(async () => payload);
const rpcStartTrackingSession = vi.fn(async () => ({
  session_id: "sess-1",
  policy: null,
  was_existing: false,
}));
let ingestImpl: () => Promise<unknown> = async () => ({
  accepted: 1,
  stored_flagged: 0,
  duplicates: 0,
  downsampled: 0,
  rejected: [],
  tracking_active: true,
  trip_status: "en_route_to_pickup",
});
const rpcIngestLocations = vi.fn((...a: unknown[]) => {
  ingestArgs.push(a);
  return ingestImpl();
});
const ingestArgs: unknown[][] = [];
vi.mock("@/lib/trips", () => ({
  fetchMyDriverTrip: (...a: unknown[]) => fetchMyDriverTrip(...(a as [])),
  rpcStartTrackingSession: (...a: unknown[]) => rpcStartTrackingSession(...(a as [])),
  rpcIngestLocations: (...a: unknown[]) => rpcIngestLocations(...a),
  rpcStartTripTracking: vi.fn(),
}));

type Cb = (pos: GeolocationPosition) => void;
type Err = (e: GeolocationPositionError) => void;
const geo = {
  watchPosition: vi.fn<(ok: Cb, err: Err, o?: PositionOptions) => number>(),
  getCurrentPosition: vi.fn<(ok: Cb, err: Err, o?: PositionOptions) => void>(),
  clearWatch: vi.fn(),
};
const GATE_OK = {
  assignmentState: "accepted" as const,
  noticeAcknowledged: true,
  trackingRequired: true,
  tripStatus: "en_route_to_pickup" as const,
};
const POLICY_V2 = {
  version: 2,
  accuracy_primary_m: 100,
  accuracy_reject_m: 500,
  location_batch_max_points: 200,
  location_max_age_hours: 72,
  location_min_interval_s: 30,
  location_min_distance_m: 50,
  location_stationary_interval_s: 120,
  location_flush_interval_s: 30,
};
const T0 = Date.parse("2026-09-21T10:00:00Z");
const fix = (i: number) =>
  ({
    coords: {
      latitude: -19.9 - i * 0.001,
      longitude: -44.1,
      accuracy: 10,
      speed: null,
      heading: null,
      altitude: null,
    },
    timestamp: T0 + i * 60_000,
  }) as GeolocationPosition;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 4) => {
  for (let i = 0; i < n; i++) await flush();
};

let tripTracker: typeof import("./geoTracker").tripTracker;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DEV", false);
  mem.reset();
  ingestArgs.length = 0;
  geo.watchPosition.mockReset();
  geo.getCurrentPosition.mockReset();
  geo.clearWatch.mockReset();
  rpcStartTrackingSession.mockClear();
  rpcIngestLocations.mockClear();
  fetchMyDriverTrip.mockClear();
  ingestImpl = async () => ({
    accepted: 1,
    stored_flagged: 0,
    duplicates: 0,
    downsampled: 0,
    rejected: [],
    tracking_active: true,
    trip_status: "en_route_to_pickup",
  });
  payload = {
    has_trip: true,
    trip: { id: TRIP, status: "en_route_to_pickup" },
    assignment: { state: "accepted" },
    privacy_notice: { published: true, acknowledged: true },
    tracking_required: true,
    policy: POLICY_V2,
  };
  Object.defineProperty(navigator, "geolocation", { value: geo, configurable: true });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  setVisibility("visible");
  ({ tripTracker } = await import("./geoTracker"));
});
afterEach(async () => {
  await tripTracker.dispose("test");
});

/** liga o watch em en_route e entrega o primeiro ponto (abre a sessao de retomada) */
async function running() {
  geo.watchPosition.mockReturnValue(7);
  await tripTracker.start(TRIP, GATE_OK, POLICY_V2);
  const onOk = geo.watchPosition.mock.calls[0][0];
  onOk(fix(0));
  await settle();
  expect(tripTracker.getStatus().sessionId).toBe("sess-1");
  return onOk;
}

describe("tripTracker — nunca pede localizacao fora do gate", () => {
  it.each([
    ["motorista sem viagem", { ...GATE_OK, assignmentState: null, tripStatus: null }],
    [
      "offered + aviso nao reconhecido",
      { ...GATE_OK, assignmentState: "offered" as const, noticeAcknowledged: false },
    ],
    ["accepted + aviso nao reconhecido", { ...GATE_OK, noticeAcknowledged: false }],
    ["offered + aviso reconhecido", { ...GATE_OK, assignmentState: "offered" as const }],
    [
      "viagem apenas visualizada (assigned, sem tracking_required)",
      { ...GATE_OK, trackingRequired: false, tripStatus: "assigned" as const },
    ],
    [
      "driver_accepted (inicio so pelo startTrip)",
      { ...GATE_OK, tripStatus: "driver_accepted" as const },
    ],
  ])("%s -> zero chamadas a geolocation e zero sessao", async (_n, gate) => {
    await tripTracker.start(TRIP, gate);
    await tripTracker.start(TRIP, gate); // "rerender": chamada repetida
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
    expect(tripTracker.getStatus().active).toBe(false);
  });

  it("app em segundo plano -> nenhuma chamada", async () => {
    setVisibility("hidden");
    await tripTracker.start(TRIP, GATE_OK);
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
  });

  it("captureOnce (comando) nunca abre dialogo com o rastreador desligado", async () => {
    expect(await tripTracker.captureOnce(100)).toBeNull();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("tripTracker — retomada (viagem ja em andamento)", () => {
  it("gate completo -> pede UMA vez; rerender nao duplica; sessao (reutilizada) so apos o primeiro ponto", async () => {
    geo.watchPosition.mockReturnValue(7);
    await tripTracker.start(TRIP, GATE_OK);
    await tripTracker.start(TRIP, GATE_OK);
    await tripTracker.start(TRIP, GATE_OK, POLICY_V2);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(tripTracker.getStatus().active).toBe(true);
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
    const onOk = geo.watchPosition.mock.calls[0][0];
    onOk(fix(0));
    await settle();
    expect(rpcStartTrackingSession).toHaveBeenCalledTimes(1);
    expect(rpcStartTrackingSession.mock.calls[0]).toEqual([
      TRIP,
      "00000000-0000-4000-8000-0000000000d1",
      "android",
      "web",
      "1.0-test+1",
    ]);
    expect(tripTracker.getStatus().sessionId).toBe("sess-1");
    expect(tripTracker.getStatus().buffered).toBe(1);
  });

  it("permissao negada no watch -> nenhuma sessao, nenhum ponto, rastreador desligado", async () => {
    geo.watchPosition.mockReturnValue(8);
    await tripTracker.start(TRIP, GATE_OK);
    const onErr = geo.watchPosition.mock.calls[0][1];
    onErr({
      code: 1,
      message: "denied",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
    await settle();
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(geo.clearWatch).toHaveBeenCalled();
    expect(tripTracker.getStatus()).toMatchObject({ active: false, sessionId: null });
    expect(tripTracker.getStatus().error).toMatch(/negada/);
  });

  it("gate deixa de valer (viagem encerrada) -> para, limpa o watch e PERSISTE o buffer", async () => {
    const onOk = await running();
    onOk(fix(1));
    await settle();
    await tripTracker.start(TRIP, { ...GATE_OK, tripStatus: "delivered" });
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
    expect(tripTracker.getStatus().active).toBe(false);
    expect(mem.batches).toHaveLength(1);
    expect(mem.batches[0].points.map((p) => p.seq)).toEqual([1, 2]);
  });
});

describe("tripTracker — serializacao e stop idempotente", () => {
  it("dois stop() concorrentes compartilham a mesma Promise: 1 clearWatch, 1 lote persistido, nenhuma RPC", async () => {
    const onOk = await running();
    onOk(fix(1));
    await settle();
    const p1 = tripTracker.stop("background");
    const p2 = tripTracker.stop("not_required");
    expect(p2).toBe(p1);
    await Promise.all([p1, p2]);
    expect(geo.clearWatch).toHaveBeenCalledTimes(1);
    expect(mem.enqueueLocationBatch).toHaveBeenCalledTimes(1);
    expect(mem.batches[0].trip_id).toBe(TRIP);
    expect(mem.batches[0].points).toHaveLength(2);
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(tripTracker.getStatus()).toMatchObject({ active: false, buffered: 0, sessionId: null });
  });

  it("stop durante o flush: o envio em voo mantem trip/device corretos e nada e perdido", async () => {
    const onOk = await running();
    onOk(fix(1));
    await settle();
    let release: (v: unknown) => void = () => undefined;
    ingestImpl = () => new Promise((r) => (release = r));
    const fl = tripTracker.flush();
    await settle();
    expect(ingestArgs).toHaveLength(1);
    const st = tripTracker.stop("background"); // fica na fila atras do flush
    release({
      accepted: 2,
      stored_flagged: 0,
      duplicates: 0,
      downsampled: 0,
      rejected: [],
      tracking_active: true,
      trip_status: "en_route_to_pickup",
    });
    await Promise.all([fl, st]);
    expect(ingestArgs[0][0]).toBe(TRIP); // nunca p_trip_id nulo
    expect(ingestArgs[0][1]).toBe("00000000-0000-4000-8000-0000000000d1");
    expect(mem.batches).toHaveLength(0); // enviados; nada duplicado na outbox
    expect(tripTracker.getStatus().active).toBe(false);
  });

  it("falha transitoria no flush -> pontos vao para a outbox (nunca descartados) e o watch continua", async () => {
    const onOk = await running();
    onOk(fix(1));
    await settle();
    ingestImpl = async () => {
      throw new TypeError("Failed to fetch");
    };
    await tripTracker.flush();
    expect(mem.batches).toHaveLength(1);
    expect(mem.batches[0].points).toHaveLength(2);
    expect(tripTracker.getStatus().active).toBe(true);
  });

  it("callback chegando enquanto o stop ocorre -> ignorado (epoch); ponto em alocacao de seq e persistido", async () => {
    const onOk = await running();
    // alocacao de seq lenta para simular o ponto "no meio" do stop
    let releaseSeq: (v: number[]) => void = () => undefined;
    mem.nextSeqRange.mockImplementationOnce(() => new Promise<number[]>((r) => (releaseSeq = r)));
    onOk(fix(1)); // entra na fila e fica aguardando o seq
    await flush();
    const st = tripTracker.stop("background");
    onOk(fix(2)); // chega DEPOIS do stop: epoch antigo -> ignorado
    releaseSeq([2]);
    await st;
    await settle();
    const all = mem.batches.flatMap((b) => b.points.map((p) => p.seq));
    expect(all.sort()).toEqual([1, 2]); // ponto 0 (buffer) + ponto 1 (alocacao em voo); ponto 2 ignorado
    expect(tripTracker.getStatus().active).toBe(false);
  });
});

describe("tripTracker — background / foreground", () => {
  it("HOME com buffer pendente: watch para, buffer persistido, ZERO rede, nenhuma coleta", async () => {
    const onOk = await running();
    onOk(fix(1));
    await settle();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(6);
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
    expect(tripTracker.getStatus().active).toBe(false);
    expect(mem.batches).toHaveLength(1);
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(mem.flushOutbox).not.toHaveBeenCalled();
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    onOk(fix(2)); // callback tardio do provedor
    await settle();
    expect(tripTracker.getStatus().buffered).toBe(0);
    // flush periodico nunca roda em background
    await tripTracker.flush();
    expect(rpcIngestLocations).not.toHaveBeenCalled();
  });

  it("volta ao foreground: outbox primeiro, viagem recarregada no servidor, watch retomado com a MESMA sessao", async () => {
    await running();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(6);
    expect(tripTracker.getStatus().active).toBe(false);
    rpcStartTrackingSession.mockResolvedValueOnce({
      session_id: "sess-1",
      policy: null,
      was_existing: true,
    });
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(8);
    expect(mem.flushOutbox).toHaveBeenCalledTimes(1);
    expect(fetchMyDriverTrip).toHaveBeenCalledTimes(1);
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    expect(tripTracker.getStatus().active).toBe(true);
    const onOk2 = geo.watchPosition.mock.calls[1][0];
    onOk2(fix(3));
    await settle();
    expect(rpcStartTrackingSession).toHaveBeenCalledTimes(2); // reutilizacao idempotente (was_existing)
    expect(tripTracker.getStatus().sessionId).toBe("sess-1");
  });

  it("volta ao foreground com a viagem encerrada no servidor -> nao retoma", async () => {
    await running();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(6);
    payload = { has_trip: false };
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(8);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(tripTracker.getStatus().active).toBe(false);
  });
});
