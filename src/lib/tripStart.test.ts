// "Iniciar deslocamento" atomico (tripTracker.startTrip -> start_trip_tracking):
// preflight no servidor, captura explicita, UMA RPC, command_id persistido,
// replay identico em falha de rede, novo command_id apos rejeicao, sessao
// incompativel nunca abre outra sessao, amostragem do watch pela politica v2.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeOutboxMemory } from "./testing/outboxMemory";

vi.mock("@/lib/device", () => ({
  isNativePlatform: () => true,
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
type Payload = {
  has_trip: true;
  trip: {
    id: string;
    status: string;
    paused_by_contract: boolean;
    paused_by_exception_id: string | null;
    has_open_critical_exception: boolean;
  };
  assignment: { state: string };
  privacy_notice: { published: boolean; acknowledged: boolean };
  tracking_required: boolean;
  policy: Record<string, unknown>;
};
let payload: Payload;
const fetchMyDriverTrip = vi.fn(async () => payload);
const calls: string[] = [];
type SttReply = {
  applied: boolean;
  duplicate: boolean;
  rejection_code: string | null;
  trip_status: string;
  session_id: string | null;
  session_was_existing: boolean;
  point_accepted: boolean;
  point_flags: string[];
  policy: Record<string, unknown> | null;
};
const rpcStartTripTracking = vi.fn(async (i: { commandId: string }): Promise<SttReply> => {
  calls.push("start_trip_tracking:" + i.commandId);
  return {
    applied: true,
    duplicate: false,
    rejection_code: null,
    trip_status: "en_route_to_pickup",
    session_id: "sess-1",
    session_was_existing: false,
    point_accepted: true,
    point_flags: [],
    policy: POLICY_V2,
  };
});
const rpcStartTrackingSession = vi.fn(async () => {
  calls.push("start_tracking_session");
  return { session_id: "sess-old", policy: null, was_existing: true };
});
const rpcIngestLocations = vi.fn(async () => {
  calls.push("ingest_trip_locations");
  return {
    accepted: 1,
    stored_flagged: 0,
    duplicates: 0,
    downsampled: 0,
    rejected: [],
    tracking_active: true,
    trip_status: "en_route_to_pickup",
  };
});
vi.mock("@/lib/trips", () => ({
  fetchMyDriverTrip: (...a: unknown[]) => fetchMyDriverTrip(...(a as [])),
  rpcStartTripTracking: (...a: unknown[]) =>
    rpcStartTripTracking(...(a as [{ commandId: string }])),
  rpcStartTrackingSession: (...a: unknown[]) => rpcStartTrackingSession(...(a as [])),
  rpcIngestLocations: (...a: unknown[]) => rpcIngestLocations(...(a as [])),
  rpcTransitionTrip: vi.fn(async () => {
    calls.push("transition_trip");
    throw new Error("nao deve ser chamada no inicio novo");
  }),
}));

type Cb = (pos: GeolocationPosition) => void;
type Err = (e: GeolocationPositionError) => void;
const geo = {
  watchPosition: vi.fn<(ok: Cb, err: Err, o?: PositionOptions) => number>(),
  getCurrentPosition: vi.fn<(ok: Cb, err: Err, o?: PositionOptions) => void>(),
  clearWatch: vi.fn(),
};
const T0 = Date.parse("2026-09-21T10:00:00Z");
const FIX = (acc = 12, lat = -19.9725, lng = -44.201, t = T0) =>
  ({
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      speed: null,
      heading: null,
      altitude: null,
    },
    timestamp: t,
  }) as GeolocationPosition;
const DENIED = {
  code: 1,
  message: "User denied Geolocation",
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
} as GeolocationPositionError;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

let tripTracker: typeof import("./geoTracker").tripTracker;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DEV", false);
  mem.reset();
  calls.length = 0;
  geo.watchPosition.mockReset();
  geo.getCurrentPosition.mockReset();
  geo.clearWatch.mockReset();
  fetchMyDriverTrip.mockClear();
  rpcStartTripTracking.mockClear();
  rpcStartTrackingSession.mockClear();
  rpcIngestLocations.mockClear();
  payload = {
    has_trip: true,
    trip: {
      id: TRIP,
      status: "driver_accepted",
      paused_by_contract: false,
      paused_by_exception_id: null,
      has_open_critical_exception: false,
    },
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

function expectNothingHappened() {
  expect(rpcStartTripTracking).not.toHaveBeenCalled();
  expect(rpcStartTrackingSession).not.toHaveBeenCalled();
  expect(rpcIngestLocations).not.toHaveBeenCalled();
  expect(geo.watchPosition).not.toHaveBeenCalled();
  expect(mem.batches).toHaveLength(0);
  expect(mem.meta.size).toBe(0);
  expect(tripTracker.getStatus().active).toBe(false);
  expect(tripTracker.getStatus().sessionId).toBeNull();
}

describe("startTrip — fail-closed antes de qualquer RPC mutavel", () => {
  it("permissao negada -> nenhuma RPC, nenhuma sessao, nada na outbox; pode tentar de novo", async () => {
    geo.getCurrentPosition.mockImplementation((_ok, err) => err(DENIED));
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r).toMatchObject({ ok: false, reason: "sem_posicao", retryable: false });
    expect(fetchMyDriverTrip).toHaveBeenCalledTimes(1); // preflight no servidor ANTES do dialogo
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expectNothingHappened();
    const r2 = await tripTracker.startTrip({ tripId: TRIP });
    expect(r2.ok).toBe(false);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2);
    expectNothingHappened();
  });

  it("timeout do GNSS -> idem", async () => {
    geo.getCurrentPosition.mockImplementation((_ok, err) => err({ ...DENIED, code: 3 }));
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({
      ok: false,
      reason: "sem_posicao",
    });
    expectNothingHappened();
  });

  it("precisao acima de accuracy_reject_m da POLITICA DO SERVIDOR -> recusa local, nada no servidor", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX(900)));
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({
      ok: false,
      reason: "precisao_insuficiente",
    });
    expectNothingHappened();
  });

  it.each([
    [
      "designacao offered",
      (p: Payload) => (p.assignment.state = "offered"),
      "designacao_nao_aceita",
    ],
    [
      "aviso nao reconhecido",
      (p: Payload) => (p.privacy_notice.acknowledged = false),
      "aviso_nao_reconhecido",
    ],
    [
      "aviso nao publicado",
      (p: Payload) => (p.privacy_notice.published = false),
      "aviso_nao_publicado",
    ],
    [
      "viagem ja en_route",
      (p: Payload) => (p.trip.status = "en_route_to_pickup"),
      "estado_invalido",
    ],
    [
      "viagem pausada por contrato",
      (p: Payload) => (p.trip.paused_by_contract = true),
      "viagem_pausada",
    ],
    [
      "ocorrencia critica aberta",
      (p: Payload) => (p.trip.has_open_critical_exception = true),
      "viagem_pausada",
    ],
    ["outra viagem ativa", (p: Payload) => (p.trip.id = "outra"), "estado_invalido"],
  ])("preflight no servidor: %s -> nem pede localizacao", async (_n, mut, reason) => {
    mut(payload);
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({ ok: false, reason });
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    expectNothingHappened();
  });

  it("app em segundo plano -> nem consulta o servidor", async () => {
    setVisibility("hidden");
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({
      ok: false,
      reason: "app_em_segundo_plano",
    });
    expect(fetchMyDriverTrip).not.toHaveBeenCalled();
    expectNothingHappened();
  });

  it("servidor indisponivel no preflight -> sem_rede, nenhum dialogo", async () => {
    fetchMyDriverTrip.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({
      ok: false,
      reason: "sem_rede",
    });
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    expectNothingHappened();
  });
});

describe("startTrip — uma unica RPC atomica", () => {
  it("ordem: preflight -> primeiro fix -> start_trip_tracking (uma vez) -> watch; nenhuma RPC antiga", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX(12)));
    geo.watchPosition.mockReturnValue(5);
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r).toEqual({
      ok: true,
      sessionId: "sess-1",
      duplicate: false,
      sessionWasExisting: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^start_trip_tracking:[0-9a-f-]{36}$/);
    const arg = rpcStartTripTracking.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(arg).toMatchObject({
      tripId: TRIP,
      deviceId: "00000000-0000-4000-8000-0000000000d1",
      platform: "android",
      provider: "web",
      lat: -19.9725,
      lng: -44.201,
      accuracyM: 12,
      seq: 1,
      capturedAt: new Date(T0).toISOString(),
    });
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
    expect(rpcIngestLocations).not.toHaveBeenCalled();
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(tripTracker.getStatus()).toMatchObject({
      active: true,
      sessionId: "sess-1",
      policyVersion: 2,
    });
    expect(mem.meta.size).toBe(0); // comando pendente limpo apos resultado conhecido
    expect(mem.batches).toHaveLength(0);
  });

  it("duplo clique -> uma tentativa (uma leitura, uma RPC)", async () => {
    let release: (() => void) | null = null;
    geo.getCurrentPosition.mockImplementation((ok) => {
      release = () => ok(FIX());
    });
    geo.watchPosition.mockReturnValue(6);
    const p1 = tripTracker.startTrip({ tripId: TRIP });
    const p2 = tripTracker.startTrip({ tripId: TRIP });
    await flush();
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    release!();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2).toBe(r1);
    expect(rpcStartTripTracking).toHaveBeenCalledTimes(1);
  });

  it("falha de rede na RPC -> command_id e fix persistidos; novo toque reenvia a MESMA tentativa sem novo dialogo", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX(12)));
    geo.watchPosition.mockReturnValue(7);
    rpcStartTripTracking.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r).toMatchObject({ ok: false, reason: "sem_rede", retryable: true });
    expect(mem.meta.size).toBe(1);
    const pending = [...mem.meta.values()][0] as {
      command_id: string;
      point: { captured_at: string };
    };
    expect(tripTracker.getStatus().active).toBe(false);
    expect(mem.batches).toHaveLength(0);
    const r2 = await tripTracker.startTrip({ tripId: TRIP });
    expect(r2.ok).toBe(true);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1); // sem novo fix
    expect(rpcStartTripTracking).toHaveBeenCalledTimes(2);
    const a1 = rpcStartTripTracking.mock.calls[0][0] as unknown as Record<string, unknown>;
    const a2 = rpcStartTripTracking.mock.calls[1][0] as unknown as Record<string, unknown>;
    expect(a2.commandId).toBe(pending.command_id);
    expect(a2).toEqual(a1); // seq, captured_at, coordenadas identicos
    expect(mem.meta.size).toBe(0);
  });

  it("40P01 -> uma retentativa automatica com o mesmo command_id", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX()));
    geo.watchPosition.mockReturnValue(8);
    rpcStartTripTracking.mockRejectedValueOnce(
      Object.assign(new Error("deadlock"), { code: "40P01" }),
    );
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r.ok).toBe(true);
    expect(rpcStartTripTracking).toHaveBeenCalledTimes(2);
    const [a, b] = rpcStartTripTracking.mock.calls.map(
      (c) => (c[0] as unknown as { commandId: string }).commandId,
    );
    expect(a).toBe(b);
  });

  it("rejeicao conhecida (accuracy_rejected) consome o command_id: correcao => NOVO command_id e novo fix", async () => {
    geo.getCurrentPosition
      .mockImplementationOnce((ok) => ok(FIX(400)))
      .mockImplementationOnce((ok) => ok(FIX(8)));
    geo.watchPosition.mockReturnValue(9);
    rpcStartTripTracking.mockResolvedValueOnce({
      applied: false,
      duplicate: false,
      rejection_code: "accuracy_rejected",
      trip_status: "driver_accepted",
      session_id: null,
      session_was_existing: false,
      point_accepted: false,
      point_flags: [],
      policy: POLICY_V2,
    });
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r).toMatchObject({ ok: false, reason: "accuracy_rejected", retryable: false });
    expect(mem.meta.size).toBe(0);
    expect(tripTracker.getStatus().active).toBe(false);
    const r2 = await tripTracker.startTrip({ tripId: TRIP });
    expect(r2.ok).toBe(true);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2);
    const [a, b] = rpcStartTripTracking.mock.calls.map(
      (c) => (c[0] as unknown as { commandId: string }).commandId,
    );
    expect(a).not.toBe(b);
  });

  it("duplicate de inicio ja aplicado (resposta perdida) -> ok, watch com a sessao devolvida", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX()));
    geo.watchPosition.mockReturnValue(10);
    rpcStartTripTracking.mockResolvedValueOnce({
      applied: false,
      duplicate: true,
      rejection_code: null,
      trip_status: "en_route_to_pickup",
      session_id: "sess-1",
      session_was_existing: true,
      point_accepted: false,
      point_flags: [],
      policy: null,
    });
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r).toEqual({ ok: true, sessionId: "sess-1", duplicate: true, sessionWasExisting: true });
    expect(tripTracker.getStatus()).toMatchObject({ active: true, sessionId: "sess-1" });
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
  });

  it("session_context_mismatch -> erro claro, NENHUMA outra sessao, nada ativo", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX()));
    rpcStartTripTracking.mockRejectedValueOnce(
      Object.assign(new Error("start_trip_tracking: session_context_mismatch (sessao aberta x)"), {
        code: "22023",
      }),
    );
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r).toMatchObject({ ok: false, reason: "session_context_mismatch", retryable: false });
    expect(rpcStartTrackingSession).not.toHaveBeenCalled();
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(tripTracker.getStatus().active).toBe(false);
    expect(mem.meta.size).toBe(0);
  });

  it.each([
    ["privacy_notice_required", "aviso_nao_reconhecido"],
    ["privacy_notice_unpublished", "aviso_nao_publicado"],
  ])("excecao dura %s -> %s, nada gravado localmente", async (srv, reason) => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX()));
    rpcStartTripTracking.mockRejectedValueOnce(
      Object.assign(new Error(`start_trip_tracking: ${srv}`), { code: "22023" }),
    );
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({ ok: false, reason });
    expect(mem.meta.size).toBe(0);
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it("rejeicoes de negocio mapeadas: assignment_not_accepted / invalid_state", async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX()));
    rpcStartTripTracking.mockResolvedValueOnce({
      applied: false,
      duplicate: false,
      rejection_code: "invalid_state:at_pickup",
      trip_status: "at_pickup",
      session_id: null,
      session_was_existing: false,
      point_accepted: false,
      point_flags: [],
      policy: null,
    });
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({
      ok: false,
      reason: "invalid_state",
      code: "invalid_state:at_pickup",
    });
    rpcStartTripTracking.mockResolvedValueOnce({
      applied: false,
      duplicate: false,
      rejection_code: "assignment_not_accepted",
      trip_status: "driver_accepted",
      session_id: null,
      session_was_existing: false,
      point_accepted: false,
      point_flags: [],
      policy: null,
    });
    expect(await tripTracker.startTrip({ tripId: TRIP })).toMatchObject({
      ok: false,
      reason: "assignment_not_accepted",
    });
  });
});

describe("watch apos o inicio — amostragem pela politica v2 do servidor", () => {
  async function started() {
    geo.getCurrentPosition.mockImplementation((ok) => ok(FIX(12)));
    geo.watchPosition.mockReturnValue(11);
    const r = await tripTracker.startTrip({ tripId: TRIP });
    expect(r.ok).toBe(true);
    return geo.watchPosition.mock.calls[0][0];
  }
  it("primeiro fix repetido pelo watch (mesmo captured_at) -> descartado localmente", async () => {
    const onOk = await started();
    onOk(FIX(12));
    await flush();
    expect(tripTracker.getStatus().buffered).toBe(0);
    expect(tripTracker.getStatus().sampling.dropped_duplicate_fix).toBe(1);
  });
  it("10 s depois a 1,5 km -> nao enviado (piso 30 s ignora distancia)", async () => {
    const onOk = await started();
    onOk(FIX(12, -19.9835, -44.201, T0 + 10_000));
    await flush();
    expect(tripTracker.getStatus().buffered).toBe(0);
    expect(tripTracker.getStatus().sampling.dropped_min_interval).toBe(1);
  });
  it("30 s + 60 m -> elegivel (seq alocado, buffer 1)", async () => {
    const onOk = await started();
    onOk(FIX(12, -19.97196, -44.201, T0 + 30_000));
    await flush();
    expect(tripTracker.getStatus().buffered).toBe(1);
    expect(tripTracker.getStatus().sampling.kept).toBe(1);
  });
  it("parado: 60 s no mesmo lugar -> nao enviado; 120 s -> enviado", async () => {
    const onOk = await started();
    onOk(FIX(12, -19.9725, -44.201, T0 + 60_000));
    await flush();
    expect(tripTracker.getStatus().sampling.dropped_no_movement).toBe(1);
    onOk(FIX(12, -19.9725, -44.201, T0 + 120_000));
    await flush();
    expect(tripTracker.getStatus().buffered).toBe(1);
  });
  it("precisao acima do limite da politica -> descartado sem contar como ponto", async () => {
    const onOk = await started();
    onOk(FIX(900, -19.9, -44.3, T0 + 60_000));
    await flush();
    expect(tripTracker.getStatus().buffered).toBe(0);
    expect(tripTracker.getStatus().sampling.dropped_accuracy).toBe(1);
  });
  it("politica v1 (sem amostragem): callbacks a 1 s entram todos (o servidor continua a autoridade)", async () => {
    payload.policy = {
      ...POLICY_V2,
      version: 1,
      location_min_interval_s: null,
      location_min_distance_m: null,
      location_stationary_interval_s: null,
      location_flush_interval_s: null,
    };
    rpcStartTripTracking.mockImplementationOnce(async (i) => {
      calls.push("start_trip_tracking:" + i.commandId);
      return {
        applied: true,
        duplicate: false,
        rejection_code: null,
        trip_status: "en_route_to_pickup",
        session_id: "s",
        session_was_existing: false,
        point_accepted: true,
        point_flags: [],
        policy: payload.policy,
      };
    });
    const onOk = await started();
    onOk(FIX(12, -19.97251, -44.201, T0 + 1000));
    onOk(FIX(12, -19.97252, -44.201, T0 + 2000));
    await flush();
    expect(tripTracker.getStatus().buffered).toBe(2);
  });
});
