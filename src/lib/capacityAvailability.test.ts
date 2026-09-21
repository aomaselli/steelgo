// "Estou disponivel": captura pontual explicita e contextual. Prova a ordem
// aviso -> explicacao -> UMA captura -> set_capacity_available, e que recusa/
// cancelamento/falha nao muda nada e nao le posicao.
import { describe, expect, it, vi } from "vitest";
import { activateAvailability, type AvailabilityDeps } from "./capacityAvailability";

const NOTICE_OK = {
  published: true as const,
  version: "0.9.0",
  sha256: "x",
  effective_from: "2026-09-01",
  url: null,
  body_md: "",
  legal_basis: null,
  acknowledged: true,
  acknowledged_at: "2026-09-17T00:00:00Z",
};
const POINT = { lat: -19.9, lng: -44.1, accuracy_m: 15, captured_at: new Date().toISOString() };

function deps(over: Partial<AvailabilityDeps> = {}) {
  const order: string[] = [];
  const d: AvailabilityDeps = {
    isOnline: () => true,
    fetchNotice: vi.fn(async () => {
      order.push("notice");
      return NOTICE_OK;
    }),
    requestAcknowledgement: vi.fn(async () => {
      order.push("ack");
      return true;
    }),
    explain: vi.fn(async () => {
      order.push("explain");
      return true;
    }),
    capture: vi.fn(async () => {
      order.push("capture");
      return POINT;
    }),
    setAvailable: vi.fn(async () => {
      order.push("set_capacity_available");
    }),
    ...over,
  };
  return { d, order };
}

describe("activateAvailability", () => {
  it("sucesso: aviso reconhecido -> explicacao -> captura unica -> set_capacity_available", async () => {
    const { d, order } = deps();
    const r = await activateAvailability(d);
    expect(r).toEqual({ ok: true, position: { lat: -19.9, lng: -44.1, accuracy: 15 } });
    expect(order).toEqual(["notice", "explain", "capture", "set_capacity_available"]);
    expect(d.capture).toHaveBeenCalledTimes(1);
    expect(d.capture).toHaveBeenCalledWith(true);
  });

  it("cancelar na explicacao -> nenhuma captura, nenhuma RPC", async () => {
    const { d, order } = deps({ explain: vi.fn(async () => false) });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "cancelled" });
    expect(d.capture).not.toHaveBeenCalled();
    expect(d.setAvailable).not.toHaveBeenCalled();
    expect(order).toEqual(["notice"]);
  });

  it("aviso nao reconhecido -> abre o aviso; recusa -> nenhuma captura", async () => {
    const { d } = deps({
      fetchNotice: vi.fn(async () => ({ ...NOTICE_OK, acknowledged: false })),
      requestAcknowledgement: vi.fn(async () => false),
    });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "notice_not_acknowledged" });
    expect(d.explain).not.toHaveBeenCalled();
    expect(d.capture).not.toHaveBeenCalled();
    expect(d.setAvailable).not.toHaveBeenCalled();
  });

  it("aviso nao reconhecido -> reconhecido agora -> segue para explicacao e captura", async () => {
    const { d, order } = deps({
      fetchNotice: vi.fn(async () => ({ ...NOTICE_OK, acknowledged: false })),
    });
    const r = await activateAvailability(d);
    expect(r.ok).toBe(true);
    expect(order).toEqual(["ack", "explain", "capture", "set_capacity_available"]);
  });

  it("aviso nao publicado -> nada", async () => {
    const { d } = deps({ fetchNotice: vi.fn(async () => ({ published: false as const })) });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "notice_unpublished" });
    expect(d.explain).not.toHaveBeenCalled();
    expect(d.capture).not.toHaveBeenCalled();
  });

  it("permissao negada / sem posicao -> disponibilidade NAO ativada, sem posicao inventada", async () => {
    const { d } = deps({ capture: vi.fn(async () => null) });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "no_position" });
    expect(d.setAvailable).not.toHaveBeenCalled();
  });

  it("precisao ruim -> nao ativa", async () => {
    const { d } = deps({ capture: vi.fn(async () => ({ ...POINT, accuracy_m: 350 })) });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "accuracy_rejected" });
    expect(d.setAvailable).not.toHaveBeenCalled();
  });

  it("servidor falha -> erro claro, uma unica captura", async () => {
    const { d } = deps({
      setAvailable: vi.fn(async () => {
        throw new Error("set_capacity_available: truck_not_found");
      }),
    });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "server_error" });
    expect(d.capture).toHaveBeenCalledTimes(1);
  });

  it("offline -> nem consulta o aviso", async () => {
    const { d } = deps({ isOnline: () => false });
    const r = await activateAvailability(d);
    expect(r).toMatchObject({ ok: false, reason: "offline" });
    expect(d.fetchNotice).not.toHaveBeenCalled();
    expect(d.capture).not.toHaveBeenCalled();
  });
});
