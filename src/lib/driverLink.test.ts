import { describe, expect, it } from "vitest";
import {
  canBecomeIndependent,
  canOfferInviteToken,
  canOfferLinkRequest,
  driverLinkState,
  normalizeInviteContact,
} from "./driverLink";

describe("driverLinkState", () => {
  it("conta sem linha em drivers", () => {
    expect(driverLinkState(null)).toBe("sem_registro");
    expect(driverLinkState(undefined)).toBe("sem_registro");
  });

  it("registro proprio sem transportadora e independente", () => {
    expect(driverLinkState({ carrier_id: null })).toBe("independente");
  });

  it("registro com transportadora e vinculado", () => {
    expect(driverLinkState({ carrier_id: "c-1" })).toBe("vinculado");
  });
});

describe("caminhos oferecidos pela tela", () => {
  // Defeito corrigido: a tela usava "existe registro?" como porta. O motorista
  // independente caia fora dos dois caminhos e nao tinha nenhuma acao.
  it("motorista independente ainda pode solicitar vinculo", () => {
    expect(canOfferLinkRequest(driverLinkState({ carrier_id: null }))).toBe(true);
  });

  it("motorista sem registro ve convite, solicitacao e opcao independente", () => {
    const s = driverLinkState(null);
    expect(canOfferInviteToken(s)).toBe(true);
    expect(canOfferLinkRequest(s)).toBe(true);
    expect(canBecomeIndependent(s)).toBe(true);
  });

  it("convite por token some quando ja existe registro independente", () => {
    // O servidor recusa com 22023; a tela nao deve oferecer o botao.
    const s = driverLinkState({ carrier_id: null });
    expect(canOfferInviteToken(s)).toBe(false);
    expect(canBecomeIndependent(s)).toBe(false);
  });

  it("motorista vinculado nao recebe nenhum dos caminhos de vinculo", () => {
    const s = driverLinkState({ carrier_id: "c-1" });
    expect(canOfferInviteToken(s)).toBe(false);
    expect(canOfferLinkRequest(s)).toBe(false);
    expect(canBecomeIndependent(s)).toBe(false);
  });
});

describe("normalizeInviteContact", () => {
  it("recusa convite sem nenhum contato", () => {
    expect(normalizeInviteContact({ email: "", phone: "" })).toEqual({
      ok: false,
      reason: "sem_contato",
    });
  });

  it("recusa espaco em branco e mascara sem digitos", () => {
    expect(normalizeInviteContact({ email: "   ", phone: "() -" })).toEqual({
      ok: false,
      reason: "sem_contato",
    });
  });

  it("aceita so e-mail", () => {
    expect(normalizeInviteContact({ email: " motorista@exemplo.test ", phone: "" })).toEqual({
      ok: true,
      email: "motorista@exemplo.test",
      phone: undefined,
    });
  });

  it("aceita so telefone e devolve apenas digitos", () => {
    expect(normalizeInviteContact({ email: "", phone: "(11) 90000-0000" })).toEqual({
      ok: true,
      email: undefined,
      phone: "11900000000",
    });
  });

  it("aceita os dois", () => {
    const r = normalizeInviteContact({ email: "a@b.test", phone: "11900000000" });
    expect(r).toEqual({ ok: true, email: "a@b.test", phone: "11900000000" });
  });
});
