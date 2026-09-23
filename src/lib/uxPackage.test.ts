// Pacote de experiencia P1/P2: nome exibivel, portao de onboarding, estado do
// mapa do motorista e tratamento limitado da defasagem de relogio no login.
import { describe, expect, it } from "vitest";
import { displayFirstName, displayFullName } from "./displayName";
import { cadastroIncompleto, onboardingRedirect } from "./onboardingGate";
import { driverMapMessageKey, driverMapState } from "./driverMapState";
import {
  MAX_TENTATIVAS_SKEW,
  isClockSkewAuthError,
  shouldRetryAuthError,
  skewRetryDelayMs,
} from "./authSkew";

describe("displayName — saudacao nao repete o cadastro cru", () => {
  it("normaliza capitalizacao sem alterar o dado de origem", () => {
    expect(displayFirstName("malika")).toBe("Malika");
    expect(displayFirstName("MARIA DA SILVA")).toBe("Maria");
    expect(displayFullName("MARIA DA SILVA")).toBe("Maria da Silva");
    expect(displayFullName("  joão   dos  santos ")).toBe("João dos Santos");
    expect(displayFullName("ana-maria d'avila")).toBe("Ana-Maria D'Avila");
  });
  it("sem nome utilizavel devolve o fallback da interface", () => {
    expect(displayFirstName("", "equipe")).toBe("equipe");
    expect(displayFirstName(null, "equipe")).toBe("equipe");
    expect(displayFirstName("   ", "equipe")).toBe("equipe");
    expect(displayFullName(undefined)).toBe("");
  });
});

describe("onboardingGate — cadastro incompleto nao entra no shell da empresa", () => {
  const base = { role: "carrier", isOnboarded: false, companies: [] as unknown[] };
  it("desvia qualquer rota da transportadora, nao so o pos-login (navegacao direta e refresh)", () => {
    for (const p of [
      "/carrier",
      "/carrier/trips",
      "/carrier/bids",
      "/carrier/marketplace",
      "/carrier/contracts",
      "/carrier/payments",
      "/carrier/disputes",
      "/carrier/settings",
      "/carrier/trips/abc-123",
    ]) {
      expect(onboardingRedirect({ ...base, pathname: p })).toBe("/onboarding");
    }
  });
  it("embarcador NAO e afetado: o achado aprovado era da transportadora", () => {
    for (const p of ["/shipper", "/shipper/freights", "/shipper/contracts"]) {
      expect(onboardingRedirect({ ...base, role: "shipper", pathname: p })).toBeNull();
    }
  });
  it("nao cria laco: onboarding, autenticacao e saida continuam liberados", () => {
    for (const p of [
      "/onboarding",
      "/onboarding/empresa",
      "/login",
      "/logout",
      "/register",
      "/forgot-password",
      "/reset-password",
    ]) {
      expect(onboardingRedirect({ ...base, pathname: p })).toBeNull();
    }
  });
  it("transportadora com onboarding completo acessa normalmente", () => {
    for (const p of ["/carrier", "/carrier/trips", "/carrier/payments"]) {
      expect(onboardingRedirect({ ...base, isOnboarded: true, pathname: p })).toBeNull();
      expect(onboardingRedirect({ ...base, companies: [{ id: "c1" }], pathname: p })).toBeNull();
    }
  });
  it("quem ja tem empresa passa, mesmo com a flag legada desmarcada", () => {
    expect(
      onboardingRedirect({ ...base, companies: [{ id: "c1" }], pathname: "/carrier" }),
    ).toBeNull();
    expect(onboardingRedirect({ ...base, isOnboarded: true, pathname: "/carrier" })).toBeNull();
  });
  it("motorista, admin e embarcador nao sao afetados por este portao", () => {
    expect(onboardingRedirect({ ...base, role: "driver", pathname: "/driver" })).toBeNull();
    expect(onboardingRedirect({ ...base, role: "admin", pathname: "/admin" })).toBeNull();
    expect(onboardingRedirect({ ...base, role: "shipper", pathname: "/shipper" })).toBeNull();
    expect(onboardingRedirect({ ...base, role: null, pathname: "/carrier" })).toBeNull();
  });
  it("cadastroIncompleto reflete o mesmo criterio", () => {
    expect(cadastroIncompleto(base)).toBe(true);
    expect(cadastroIncompleto({ ...base, companies: [{ id: "c1" }] })).toBe(false);
  });
});

describe("driverMapState — sem mapa falso", () => {
  const p = { lat: -19.97, lng: -44.2 };
  const d = { lat: -23.96, lng: -46.33 };
  it("posicao conhecida -> mapa vivo centrado no motorista", () => {
    const s = driverMapState({ status: "ready", driver: p, origin: p, dest: d });
    expect(s).toEqual({ kind: "live", center: p, hasRoute: true });
    expect(driverMapMessageKey(s)).toBeNull();
  });
  it("viagem designada sem posicao -> aguardando posicao, centrado na origem", () => {
    const s = driverMapState({ status: "ready", driver: null, origin: p, dest: d });
    expect(s).toEqual({ kind: "awaiting_position", center: p, hasRoute: true });
    expect(driverMapMessageKey(s)).toBe("driverMap.awaitingPosition");
  });
  it("viagem sem coordenadas -> estado proprio, nao mapa cinza", () => {
    const s = driverMapState({ status: "ready", driver: null, origin: null, dest: null });
    expect(s.kind).toBe("no_coordinates");
    expect(driverMapMessageKey(s)).toBe("driverMap.noCoordinates");
  });
  it("sem chave ou sem conseguir carregar -> indisponivel com motivo distinto", () => {
    expect(driverMapState({ status: "no-key", driver: p, origin: p, dest: d })).toEqual({
      kind: "unavailable",
      reason: "no-key",
    });
    expect(driverMapState({ status: "error", driver: p, origin: p, dest: d })).toEqual({
      kind: "unavailable",
      reason: "load-error",
    });
    expect(driverMapMessageKey({ kind: "unavailable", reason: "load-error" })).toBe(
      "driverMap.unavailableOffline",
    );
    expect(driverMapMessageKey({ kind: "unavailable", reason: "no-key" })).toBe(
      "driverMap.unavailableNoKey",
    );
  });
  it("indisponibilidade tem prioridade sobre coordenadas (nunca desenhar rota falsa)", () => {
    expect(driverMapState({ status: "error", driver: null, origin: null, dest: null }).kind).toBe(
      "unavailable",
    );
  });
});

describe("authSkew — retentativa limitada e so para relogio adiantado", () => {
  it("reconhece apenas a defasagem de relogio", () => {
    expect(isClockSkewAuthError(new Error("JWT issued at future"))).toBe(true);
    expect(isClockSkewAuthError({ message: 'jwt issued at future check "iat"' })).toBe(true);
    expect(isClockSkewAuthError({ message: "token used before issued" })).toBe(true);
    expect(isClockSkewAuthError(new Error("permission denied for table user_roles"))).toBe(false);
    expect(isClockSkewAuthError(new Error("Invalid login credentials"))).toBe(false);
    expect(isClockSkewAuthError(null)).toBe(false);
  });
  it("espera curta e crescente, com teto", () => {
    expect(skewRetryDelayMs(0)).toBe(600);
    expect(skewRetryDelayMs(1)).toBe(1_800);
    expect(skewRetryDelayMs(2)).toBe(4_000);
    expect(skewRetryDelayMs(MAX_TENTATIVAS_SKEW)).toBe(0);
    expect(skewRetryDelayMs(99)).toBe(0);
  });
  it("erro real nunca e retentado; skew para de retentar no teto", () => {
    expect(shouldRetryAuthError(new Error("permission denied"), 0)).toBe(false);
    expect(shouldRetryAuthError(new Error("JWT issued at future"), 0)).toBe(true);
    expect(shouldRetryAuthError(new Error("JWT issued at future"), MAX_TENTATIVAS_SKEW)).toBe(
      false,
    );
  });
});
