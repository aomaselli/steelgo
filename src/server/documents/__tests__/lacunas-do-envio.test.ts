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

import { describe, expect, it } from "vitest";

import {
  CampoInvalidoEmLogDeEnvioError,
  decidirAposFalhaDeRegistro,
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
      expect(decidirAposFalhaDeRegistro(codigo)).toBe("REMOVER_OBJETO");
    }
  });

  it("falha sem código manda repetir: o registro pode ter acontecido", () => {
    expect(decidirAposFalhaDeRegistro(undefined)).toBe("REPETIR_REGISTRO");
    expect(decidirAposFalhaDeRegistro(null)).toBe("REPETIR_REGISTRO");
    expect(decidirAposFalhaDeRegistro("")).toBe("REPETIR_REGISTRO");
  });

  it("código de banco que não é barreira nossa também manda repetir", () => {
    // Indisponibilidade, deadlock, conexão caída: a resposta pode ter se
    // perdido depois de o registro ter sido gravado.
    expect(decidirAposFalhaDeRegistro("57P01")).toBe("REPETIR_REGISTRO");
    expect(decidirAposFalhaDeRegistro("40001")).toBe("REPETIR_REGISTRO");
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
