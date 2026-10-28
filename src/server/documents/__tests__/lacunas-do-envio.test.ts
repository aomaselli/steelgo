/**
 * Lacunas achadas na auditoria do envio. Só elas.
 *
 * As 25 verificações de acesso entre usuários já passaram e não são repetidas
 * aqui — repetir teste aprovado gasta a atenção de quem lê a bateria sem
 * acrescentar informação. O que entra é o que a auditoria encontrou:
 *
 *   L3. as mensagens de recusa ecoavam entrada do cliente;
 *   L4. desfazer e repetir eram tratados como a mesma coisa;
 *   L5. o log operacional do envio não existia.
 *
 * L1 (consentimento exigido pela função do banco) e L2 (idempotência) são do
 * banco e só respondem a sessão de verdade: estão em
 * `scripts/homologacao/lacunas-do-envio.mjs`.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CampoInvalidoEmLogDeEnvioError,
  decidirAposFalhaDeRegistro,
  identificadorDoEnvio,
  montarFalhaDeEnvioParaLog,
  validarEnvio,
} from "../envio";

const TITULAR = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function recusa(extra: Record<string, unknown>) {
  const r = validarEnvio({
    purpose: "identity_validation",
    kind: "selfie",
    subjectId: TITULAR,
    actorId: TITULAR,
    contentTypeDeclarado: "image/png",
    bytes: PNG,
    ...extra,
  } as Parameters<typeof validarEnvio>[0]);
  if (r.aceito) throw new Error("esperava recusa");
  return r;
}

describe("L3 — a recusa não repete o que o cliente mandou", () => {
  it("não ecoa um tipo declarado arbitrário", () => {
    const r = recusa({ bytes: JPEG, contentTypeDeclarado: "eyJhbGciOiJIUzI1NiJ9.carga" });
    expect(r.detalhe).not.toContain("eyJ");
    expect(r.detalhe).toContain("(fora da lista)");
    expect(r.detalhe).toContain("image/jpeg"); // o LIDO, que o servidor derivou
  });

  it("não ecoa finalidade inventada", () => {
    const r = recusa({ purpose: "https://exfiltra.exemplo/x" });
    expect(r.detalhe).not.toContain("http");
    expect(r.detalhe).toBe("finalidade (fora da lista)");
  });

  it("não ecoa espécie inventada", () => {
    const r = recusa({ kind: "<script>alert(1)</script>" });
    expect(r.detalhe).not.toContain("script");
    expect(r.detalhe).toBe("especie (fora da lista)");
  });

  it("ainda diz o que foi lido quando o declarado é um formato conhecido", () => {
    const r = recusa({ bytes: JPEG, contentTypeDeclarado: "image/png" });
    expect(r.detalhe).toBe("declarado image/png, lido image/jpeg");
  });
});

describe("L4 — desfazer e repetir não são a mesma decisão", () => {
  it("recusa de barreira manda remover: ela vai recusar de novo", () => {
    for (const codigo of ["DV010", "DV011", "DV012", "DV013", "DV014", "DV015"]) {
      expect(decidirAposFalhaDeRegistro(codigo, false)).toBe("REMOVER_OBJETO");
      // E continua mandando remover depois da repetição: o banco respondeu.
      expect(decidirAposFalhaDeRegistro(codigo, true)).toBe("REMOVER_OBJETO");
    }
  });

  it("falha sem código manda repetir: o registro pode ter acontecido", () => {
    expect(decidirAposFalhaDeRegistro(undefined, false)).toBe("REPETIR_REGISTRO");
    expect(decidirAposFalhaDeRegistro(null, false)).toBe("REPETIR_REGISTRO");
    expect(decidirAposFalhaDeRegistro("", false)).toBe("REPETIR_REGISTRO");
  });

  it("código de banco que não é barreira nossa também manda repetir", () => {
    // Indisponibilidade, deadlock, conexão caída: a resposta pode ter se
    // perdido depois de o registro ter sido gravado.
    expect(decidirAposFalhaDeRegistro("57P01", false)).toBe("REPETIR_REGISTRO");
    expect(decidirAposFalhaDeRegistro("40001", false)).toBe("REPETIR_REGISTRO");
  });
});

describe("L6 — silêncio do transporte não é recusa definitiva", () => {
  it("falha sem código que persiste MANTÉM o objeto, em vez de apagar", () => {
    for (const codigo of [undefined, null, "", "57P01", "40001", "ETIMEDOUT"]) {
      expect(decidirAposFalhaDeRegistro(codigo, true)).toBe("MANTER_E_DECLARAR");
    }
  });

  it("os três desfechos são distintos — nenhum colapsa no outro", () => {
    const desfechos = new Set([
      decidirAposFalhaDeRegistro("DV014", true),
      decidirAposFalhaDeRegistro(undefined, false),
      decidirAposFalhaDeRegistro(undefined, true),
    ]);
    expect(desfechos.size).toBe(3);
  });

  it("o motivo do silêncio tem lugar próprio no log", () => {
    const f = montarFalhaDeEnvioParaLog({
      documentId: "11111111-2222-4333-8444-555555555555",
      motivo: "REGISTRO_INDEFINIDO",
      ocorridoEm: "2026-10-28T21:00:00.000Z",
    });
    expect(f.motivo).toBe("REGISTRO_INDEFINIDO");
  });
});

describe("L7 — a chave de idempotência vem do titular e do conteúdo", () => {
  const digerir = (texto: string) =>
    new Uint8Array(createHash("sha256").update(texto, "utf8").digest());

  const base = {
    subjectId: TITULAR,
    purpose: "identity_validation",
    kind: "selfie",
    sha256DoConteudo: "a".repeat(64),
  };

  it("o mesmo titular com o mesmo arquivo e a mesma espécie dá o mesmo id", () => {
    expect(identificadorDoEnvio(base, digerir)).toBe(identificadorDoEnvio(base, digerir));
  });

  it("conteúdo diferente dá id diferente", () => {
    expect(identificadorDoEnvio(base, digerir)).not.toBe(
      identificadorDoEnvio({ ...base, sha256DoConteudo: "b".repeat(64) }, digerir),
    );
  });

  it("titular diferente dá id diferente — ninguém colide com o arquivo do outro", () => {
    expect(identificadorDoEnvio(base, digerir)).not.toBe(
      identificadorDoEnvio({ ...base, subjectId: "3b017ae9-b74a-4c1a-87d7-e796ad2a7feb" }, digerir),
    );
  });

  it("espécie diferente dá id diferente — a mesma foto como CNH e como selfie são dois envios", () => {
    expect(identificadorDoEnvio(base, digerir)).not.toBe(
      identificadorDoEnvio({ ...base, kind: "cnh_front" }, digerir),
    );
  });

  it("finalidade diferente dá id diferente", () => {
    expect(identificadorDoEnvio(base, digerir)).not.toBe(
      identificadorDoEnvio({ ...base, purpose: "outra_finalidade" }, digerir),
    );
  });

  it("é um UUID válido, versão 8 e variante RFC 9562", () => {
    const id = identificadorDoEnvio(base, digerir);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("os campos não se confundem entre si — a separação é explícita", () => {
    // Sem separador, "ab" + "c" e "a" + "bc" dariam a mesma entrada.
    const a = identificadorDoEnvio({ ...base, kind: "selfie", purpose: "x" }, digerir);
    const b = identificadorDoEnvio({ ...base, kind: "", purpose: "xselfie" }, digerir);
    expect(a).not.toBe(b);
  });

  it("recusa digestor que devolve bytes de menos", () => {
    expect(() => identificadorDoEnvio(base, () => new Uint8Array(8))).toThrow(/16 bytes/);
  });
});

describe("L5 — o log operacional do envio é de lista fechada", () => {
  const base = {
    documentId: "11111111-2222-4333-8444-555555555555",
    motivo: "REGISTRO_RECUSADO" as const,
    ocorridoEm: "2026-10-28T19:00:00.000Z",
  };

  it("aceita os três campos e só eles", () => {
    expect(Object.keys(montarFalhaDeEnvioParaLog(base)).sort()).toEqual([
      "documentId",
      "motivo",
      "ocorridoEm",
    ]);
  });

  it("não carrega campo que alguém acrescentar depois", () => {
    const comExtra = { ...base, objectPath: `identity_validation/${TITULAR}/selfie-x.png` };
    const saida = montarFalhaDeEnvioParaLog(comExtra) as unknown as Record<string, unknown>;
    expect(saida.objectPath).toBeUndefined();
  });

  it("recusa caminho de objeto no lugar do identificador", () => {
    expect(() =>
      montarFalhaDeEnvioParaLog({
        ...base,
        documentId: `identity_validation/${TITULAR}/selfie-x.png`,
      }),
    ).toThrow(CampoInvalidoEmLogDeEnvioError);
  });

  it("recusa motivo fora da lista", () => {
    expect(() =>
      montarFalhaDeEnvioParaLog({
        ...base,
        motivo: "FALHOU_PORQUE_SIM" as never,
      }),
    ).toThrow(CampoInvalidoEmLogDeEnvioError);
  });

  it("recusa instante inválido", () => {
    expect(() => montarFalhaDeEnvioParaLog({ ...base, ocorridoEm: "ontem" })).toThrow(
      CampoInvalidoEmLogDeEnvioError,
    );
  });
});
