/**
 * Validação do envio: formato, tamanho, titularidade e finalidade.
 *
 * O caso que dá nome a este arquivo é o do formato: um arquivo qualquer com
 * `Content-Type: image/png` entraria no bucket e ficaria contado como
 * documento. Por isso o formato vem dos bytes, e a declaração só confere.
 */

import { describe, expect, it } from "vitest";

import {
  TAMANHO_MAXIMO_BYTES,
  detectarFormato,
  montarCaminhoDoObjeto,
  titularDoCaminho,
  validarEnvio,
} from "../envio";

const TITULAR = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const OUTRO = "3b017ae9-b74a-4c1a-87d7-e796ad2a7feb";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function base(extra: Partial<Parameters<typeof validarEnvio>[0]> = {}) {
  return {
    purpose: "identity_validation",
    kind: "selfie",
    subjectId: TITULAR,
    actorId: TITULAR,
    contentTypeDeclarado: "image/png",
    bytes: PNG,
    ...extra,
  };
}

describe("detectarFormato", () => {
  it("reconhece PNG pela assinatura inteira de oito bytes", () => {
    expect(detectarFormato(PNG)).toBe("image/png");
  });

  it("reconhece JPEG", () => {
    expect(detectarFormato(JPEG)).toBe("image/jpeg");
  });

  it("recusa PNG truncado na metade da assinatura", () => {
    expect(detectarFormato(PNG.slice(0, 4))).toBeNull();
  });

  it("recusa conteúdo que não é imagem", () => {
    expect(detectarFormato(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
  });
});

describe("validarEnvio", () => {
  it("aceita PNG declarado como PNG", () => {
    const r = validarEnvio(base());
    expect(r).toMatchObject({ aceito: true, formato: "image/png", extensao: "png" });
  });

  it("recusa quem envia documento de outra pessoa", () => {
    const r = validarEnvio(base({ actorId: OUTRO }));
    expect(r).toMatchObject({ aceito: false, motivo: "NAO_E_TITULAR" });
  });

  it("decide titularidade ANTES de olhar tamanho ou formato", () => {
    // Envio de outra pessoa, grande demais e com bytes irreconhecíveis: o
    // motivo tem de ser a titularidade, senão a recusa revelaria que o
    // caminho da outra pessoa foi avaliado.
    const r = validarEnvio(
      base({
        actorId: OUTRO,
        bytes: new Uint8Array(TAMANHO_MAXIMO_BYTES + 1),
        contentTypeDeclarado: "application/pdf",
      }),
    );
    expect(r).toMatchObject({ aceito: false, motivo: "NAO_E_TITULAR" });
  });

  it("recusa finalidade fora da lista", () => {
    const r = validarEnvio(base({ purpose: "marketing" }));
    expect(r).toMatchObject({ aceito: false, motivo: "FINALIDADE_INVALIDA" });
  });

  it("recusa espécie fora da lista", () => {
    const r = validarEnvio(base({ kind: "passaporte" }));
    expect(r).toMatchObject({ aceito: false, motivo: "ESPECIE_INVALIDA" });
  });

  it("recusa arquivo vazio", () => {
    const r = validarEnvio(base({ bytes: new Uint8Array(0) }));
    expect(r).toMatchObject({ aceito: false, motivo: "ARQUIVO_VAZIO" });
  });

  it("recusa um byte acima do teto, que é o mesmo do bucket", () => {
    const grande = new Uint8Array(TAMANHO_MAXIMO_BYTES + 1);
    grande.set(PNG.slice(0, 8), 0);
    const r = validarEnvio(base({ bytes: grande }));
    expect(r).toMatchObject({ aceito: false, motivo: "ARQUIVO_GRANDE_DEMAIS" });
  });

  it("aceita exatamente no teto", () => {
    const noLimite = new Uint8Array(TAMANHO_MAXIMO_BYTES);
    noLimite.set(PNG.slice(0, 8), 0);
    expect(validarEnvio(base({ bytes: noLimite })).aceito).toBe(true);
  });

  it("recusa PDF disfarçado de PNG — o caso que motiva a leitura por bytes", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const r = validarEnvio(base({ bytes: pdf, contentTypeDeclarado: "image/png" }));
    expect(r).toMatchObject({ aceito: false, motivo: "FORMATO_NAO_RECONHECIDO" });
  });

  it("recusa JPEG declarado como PNG em vez de corrigir em silêncio", () => {
    const r = validarEnvio(base({ bytes: JPEG, contentTypeDeclarado: "image/png" }));
    expect(r).toMatchObject({ aceito: false, motivo: "FORMATO_DIVERGE_DO_DECLARADO" });
  });

  it("não se importa com caixa ou espaço no tipo declarado", () => {
    expect(validarEnvio(base({ contentTypeDeclarado: " Image/PNG " })).aceito).toBe(true);
  });
});

describe("caminho do objeto", () => {
  const caminho = montarCaminhoDoObjeto({
    purpose: "identity_validation",
    subjectId: TITULAR,
    kind: "selfie",
    documentId: "11111111-2222-4333-8444-555555555555",
    extensao: "png",
  });

  it("põe o titular no segundo segmento, que é o que a policy confere", () => {
    expect(caminho.split("/")[1]).toBe(TITULAR);
    expect(titularDoCaminho(caminho)).toBe(TITULAR);
  });

  it("tem exatamente três segmentos", () => {
    expect(caminho.split("/")).toHaveLength(3);
  });

  it("não lê titular de caminho com forma diferente", () => {
    expect(titularDoCaminho("identity_validation/so-dois")).toBeNull();
    expect(titularDoCaminho("a/b/c/d")).toBeNull();
  });
});
