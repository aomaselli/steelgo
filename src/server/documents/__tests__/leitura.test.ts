/**
 * Leitura e revisão: cabeçalhos, classificação de falha e guarda da nota.
 *
 * O que NÃO está aqui: autorização e auditoria, que vivem no banco e só
 * respondem a sessão de verdade — estão em
 * `scripts/homologacao/revisao-documental.mjs`.
 */

import { describe, expect, it } from "vitest";

import {
  CABECALHOS_DE_LEITURA,
  CONTEXTOS_DE_REVISAO,
  NotaDeRevisaoInvalidaError,
  TAMANHO_MAXIMO_DA_NOTA,
  TIPOS_DE_REVISAO,
  aplicarCabecalhosDeLeitura,
  classificarFalhaDeLeitura,
  conferirNotaDeRevisao,
} from "../leitura";

describe("cabeçalhos da leitura", () => {
  it("diz no-store, e não no-cache", () => {
    // `no-cache` autoriza guardar e revalidar, o que deixa o documento no
    // disco de quem leu. A diferença é o ponto.
    expect(CABECALHOS_DE_LEITURA["Cache-Control"]).toContain("no-store");
    expect(CABECALHOS_DE_LEITURA["Cache-Control"]).not.toMatch(/\bno-cache\b/);
  });

  it("impede adivinhação de tipo e vazamento de referência", () => {
    expect(CABECALHOS_DE_LEITURA["X-Content-Type-Options"]).toBe("nosniff");
    expect(CABECALHOS_DE_LEITURA["Referrer-Policy"]).toBe("no-referrer");
  });

  it("não contém cabeçalho de redirecionamento nem de URL", () => {
    const chaves = Object.keys(CABECALHOS_DE_LEITURA).map((k) => k.toLowerCase());
    expect(chaves).not.toContain("location");
    const valores = Object.values(CABECALHOS_DE_LEITURA).join(" ");
    expect(valores).not.toMatch(/https?:\/\//);
  });

  it("aplica todos os cabeçalhos, um a um", () => {
    const escritos: Record<string, string> = {};
    aplicarCabecalhosDeLeitura((n, v) => (escritos[n] = v));
    expect(escritos).toEqual({ ...CABECALHOS_DE_LEITURA });
  });
});

describe("classificação de falha", () => {
  it("cada SQLSTATE vira um estado distinto para quem está do outro lado", () => {
    expect(classificarFalhaDeLeitura("DV020")).toBe("SESSAO_EXPIRADA");
    expect(classificarFalhaDeLeitura("DV021")).toBe("DOCUMENTO_INEXISTENTE");
    expect(classificarFalhaDeLeitura("DV022")).toBe("SEM_PERMISSAO");
    expect(classificarFalhaDeLeitura("DV023")).toBe("CONSENTIMENTO_NAO_VIGENTE");
  });

  it("sem código não afirma inexistência nem falta de permissão", () => {
    // As duas afirmações teriam consequência: uma manda o titular desistir, a
    // outra manda avisar o suporte. Silêncio não autoriza nenhuma das duas.
    for (const codigo of [undefined, null, "", "57P01", "ETIMEDOUT"]) {
      expect(classificarFalhaDeLeitura(codigo)).toBe("SERVICO_INDISPONIVEL");
    }
  });

  it("os quatro estados conhecidos são distintos entre si", () => {
    const estados = new Set(
      ["DV020", "DV021", "DV022", "DV023"].map((c) => classificarFalhaDeLeitura(c)),
    );
    expect(estados.size).toBe(4);
  });
});

describe("a revisão não aprova", () => {
  it("não existe tipo de aprovação na lista fechada", () => {
    expect(TIPOS_DE_REVISAO).toEqual(["observacao", "divergencia", "novo_envio_solicitado"]);
    expect(TIPOS_DE_REVISAO.join(" ")).not.toMatch(/aprov|valid|libera/i);
  });

  it("o contexto separa demonstração de real", () => {
    expect(CONTEXTOS_DE_REVISAO).toEqual(["demonstracao", "real"]);
  });
});

describe("guarda da nota do revisor", () => {
  it("aceita texto comum e apara espaço", () => {
    expect(conferirNotaDeRevisao("  foto tremida  ")).toBe("foto tremida");
  });

  it("trata vazio e ausente como ausência de nota", () => {
    expect(conferirNotaDeRevisao(null)).toBeNull();
    expect(conferirNotaDeRevisao(undefined)).toBeNull();
    expect(conferirNotaDeRevisao("   ")).toBeNull();
  });

  it("recusa URL — é o caminho mais curto para um link de documento na nota", () => {
    expect(() => conferirNotaDeRevisao("ver https://exemplo.com/doc.png")).toThrow(
      NotaDeRevisaoInvalidaError,
    );
  });

  it("recusa credencial em URL e JWT", () => {
    expect(() => conferirNotaDeRevisao("abrir ?token=abc123")).toThrow(NotaDeRevisaoInvalidaError);
    expect(() => conferirNotaDeRevisao("eyJhbGciOiJIUzI1NiJ9.carga")).toThrow(
      NotaDeRevisaoInvalidaError,
    );
  });

  it("recusa CPF, com e sem pontuação", () => {
    expect(() => conferirNotaDeRevisao("titular 123.456.789-09")).toThrow(
      NotaDeRevisaoInvalidaError,
    );
    expect(() => conferirNotaDeRevisao("titular 12345678909")).toThrow(NotaDeRevisaoInvalidaError);
  });

  it("recusa nota acima do teto", () => {
    expect(() => conferirNotaDeRevisao("a".repeat(TAMANHO_MAXIMO_DA_NOTA + 1))).toThrow(
      /teto/,
    );
    expect(conferirNotaDeRevisao("a".repeat(TAMANHO_MAXIMO_DA_NOTA))).toHaveLength(
      TAMANHO_MAXIMO_DA_NOTA,
    );
  });
});
