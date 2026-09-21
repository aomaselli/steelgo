import { describe, expect, it } from "vitest";
import {
  evaluateLocationGate,
  canStartForegroundTracking,
  TRACKING_STATUSES,
} from "./locationGate";

const ok = {
  assignmentState: "accepted" as const,
  noticeAcknowledged: true,
  trackingRequired: true,
  tripStatus: "en_route_to_pickup" as const,
  appForeground: true,
};

describe("locationGate — o unico gate que autoriza pedir localizacao em primeiro plano", () => {
  it("libera somente com TODAS as condicoes verdadeiras", () => {
    expect(evaluateLocationGate(ok)).toEqual({ allowed: true });
    for (const st of TRACKING_STATUSES)
      expect(canStartForegroundTracking({ ...ok, tripStatus: st })).toBe(true);
  });

  it("motorista logado sem viagem (sem designacao) -> negado", () => {
    expect(evaluateLocationGate({ ...ok, assignmentState: null, tripStatus: null })).toEqual({
      allowed: false,
      reason: "designacao_nao_aceita",
    });
  });

  it("designacao offered + aviso nao reconhecido -> negado", () => {
    expect(
      evaluateLocationGate({ ...ok, assignmentState: "offered", noticeAcknowledged: false }),
    ).toMatchObject({ allowed: false, reason: "designacao_nao_aceita" });
  });

  it("designacao accepted + aviso nao reconhecido -> negado (aviso e requisito informacional)", () => {
    expect(evaluateLocationGate({ ...ok, noticeAcknowledged: false })).toEqual({
      allowed: false,
      reason: "aviso_nao_reconhecido",
    });
  });

  it("designacao offered + aviso reconhecido -> negado", () => {
    expect(evaluateLocationGate({ ...ok, assignmentState: "offered" })).toEqual({
      allowed: false,
      reason: "designacao_nao_aceita",
    });
  });

  it("viagem apenas visualizada (assigned/driver_accepted, tracking_required=false) -> negado", () => {
    expect(
      evaluateLocationGate({ ...ok, trackingRequired: false, tripStatus: "driver_accepted" }),
    ).toEqual({ allowed: false, reason: "rastreamento_nao_exigido" });
    expect(evaluateLocationGate({ ...ok, tripStatus: "assigned" })).toEqual({
      allowed: false,
      reason: "estado_nao_admite_rastreamento",
    });
  });

  it("estados terminais nunca admitem rastreamento", () => {
    for (const st of ["planned", "delivered", "completed", "cancelled", "returned"] as const)
      expect(canStartForegroundTracking({ ...ok, tripStatus: st })).toBe(false);
  });

  it("app em segundo plano -> negado mesmo com tudo o mais valido", () => {
    expect(evaluateLocationGate({ ...ok, appForeground: false })).toEqual({
      allowed: false,
      reason: "app_em_segundo_plano",
    });
  });
});
