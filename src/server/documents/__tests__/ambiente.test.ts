/**
 * Barreira de ambiente: o fluxo não sobe fora de destino sintético local.
 *
 * O caso que importa é o terceiro: `DOCUMENTOS_FLUXO_MODO=demonstracao`
 * apontando para base hospedada. É o que acontece quando alguém copia um
 * `.env` inteiro, ou quando um preview recebe as variáveis do projeto.
 */

import { describe, expect, it } from "vitest";

import { AmbienteNaoSinteticoError, conferirAmbienteSintetico } from "../ambiente";

const LOCAL = {
  DOCUMENTOS_FLUXO_MODO: "demonstracao",
  SUPABASE_URL: "http://127.0.0.1:57324",
};

function motivoDe(env: Record<string, string | undefined>): string {
  try {
    conferirAmbienteSintetico(env);
    return "(nao recusou)";
  } catch (e) {
    if (e instanceof AmbienteNaoSinteticoError) return e.motivo;
    throw e;
  }
}

describe("conferirAmbienteSintetico", () => {
  it("aceita laço local com o modo declarado", () => {
    expect(conferirAmbienteSintetico(LOCAL)).toEqual({
      destino: "http://127.0.0.1:57324",
      modo: "demonstracao",
    });
  });

  it("aceita localhost e [::1]", () => {
    expect(conferirAmbienteSintetico({ ...LOCAL, SUPABASE_URL: "http://localhost:57324" }).modo)
      .toBe("demonstracao");
    expect(conferirAmbienteSintetico({ ...LOCAL, SUPABASE_URL: "http://[::1]:57324" }).modo)
      .toBe("demonstracao");
  });

  it("recusa runtime de produção mesmo com tudo o mais em ordem", () => {
    expect(motivoDe({ ...LOCAL, NODE_ENV: "production" })).toBe("RUNTIME_DE_PRODUCAO");
    expect(motivoDe({ ...LOCAL, VERCEL_ENV: "production" })).toBe("RUNTIME_DE_PRODUCAO");
  });

  it("recusa quando o modo não foi declarado — ausência não é permissão", () => {
    expect(motivoDe({ SUPABASE_URL: LOCAL.SUPABASE_URL })).toBe("MODO_AUSENTE_OU_INVALIDO");
  });

  it("recusa modo diferente de demonstracao", () => {
    expect(motivoDe({ ...LOCAL, DOCUMENTOS_FLUXO_MODO: "producao" })).toBe(
      "MODO_AUSENTE_OU_INVALIDO",
    );
  });

  it("recusa base hospedada ainda que o modo diga demonstracao", () => {
    expect(motivoDe({ ...LOCAL, SUPABASE_URL: "https://exemplo.supabase.co" })).toBe(
      "DESTINO_HOSPEDADO",
    );
  });

  it("recusa qualquer endereço que não seja laço local", () => {
    expect(motivoDe({ ...LOCAL, SUPABASE_URL: "https://db.interno.steelgo.com" })).toBe(
      "DESTINO_NAO_E_LOCAL",
    );
    // 0.0.0.0 é endereço de escuta, não de destino.
    expect(motivoDe({ ...LOCAL, SUPABASE_URL: "http://0.0.0.0:57324" })).toBe(
      "DESTINO_NAO_E_LOCAL",
    );
    // Nome que apenas CONTÉM "localhost" não conta.
    expect(motivoDe({ ...LOCAL, SUPABASE_URL: "https://localhost.exemplo.com" })).toBe(
      "DESTINO_NAO_E_LOCAL",
    );
  });

  it("recusa destino ausente ou inválido", () => {
    expect(motivoDe({ DOCUMENTOS_FLUXO_MODO: "demonstracao" })).toBe("DESTINO_AUSENTE");
    expect(motivoDe({ ...LOCAL, SUPABASE_URL: "nao-e-url" })).toBe("DESTINO_NAO_E_LOCAL");
  });

  it("confere o runtime antes do modo — produção não se destrava declarando", () => {
    expect(motivoDe({ NODE_ENV: "production" })).toBe("RUNTIME_DE_PRODUCAO");
  });
});
