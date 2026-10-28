/**
 * Orquestração da demonstração, com `fetch` falso.
 *
 * Nenhum teste aqui toca a rede: o endpoint de demonstração é público,
 * compartilhado e limitado por taxa, e bateria que depende dele falha por
 * motivo que não é defeito nosso.
 *
 * O que se mede:
 *
 *   1. os parâmetros pedidos à GCC saem do corpo JÁ PODADO — pedir
 *      consentimento de campo que não vai seria coletar autorização que não se
 *      usa;
 *   2. desfecho desconhecido na emissão PARA ali, sem repetir;
 *   3. bloco não avaliado nunca vira "confere" na composição;
 *   4. nada no retorno aprova cadastro.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  blocosParaTela,
  composicaoDaDemonstracao,
  executarDemonstracao,
} from "../orquestracao";
import type { RegistroDaMassa } from "../mapa";
import type { LeituraPorBloco } from "../cliente";

/** Registro fictício mínimo, nos moldes da massa oficial. */
const REGISTRO: RegistroDaMassa = {
  cpf: "11111111111",
  nome: "FULANO FICTICIO DA SILVA",
  sexo: "M",
  data_nascimento: "1990-01-01",
  nome_mae: "MARIA FICTICIA DA SILVA",
  cnh_numero_registro: "12345678901",
  cnh_data_validade: "2030-01-01",
  // Código sem tabela de domínio publicada: tem de ser OMITIDO, não traduzido.
  cnh_possui_impedimento: "1",
};

beforeEach(() => {
  process.env.DATAVALID_AMBIENTE = "teste";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
});

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchDeDemonstracao(opcoes: {
  tokenStatus?: number;
  tokenCorpo?: string;
  validacao?: unknown;
  validacaoStatus?: number;
  aoValidar?: (corpo: unknown) => void;
  aoEmitir?: (corpo: unknown) => void;
}) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const alvo = String(url);
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;

    if (alvo.includes("/gcc/token")) {
      opcoes.aoEmitir?.(corpo);
      if (opcoes.tokenStatus && opcoes.tokenStatus !== 200) {
        return new Response("recusado", { status: opcoes.tokenStatus });
      }
      return new Response(opcoes.tokenCorpo ?? "token-simulado.demo", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (alvo.includes("/validacao")) {
      opcoes.aoValidar?.(corpo);
      return respostaJson(opcoes.validacao ?? {}, opcoes.validacaoStatus ?? 200);
    }

    throw new Error(`fetch inesperado: ${alvo}`);
  }) as unknown as typeof fetch;
}

describe("os parâmetros saem do corpo já podado", () => {
  it("não pede consentimento de campo que foi omitido por falta de tabela", async () => {
    let corpoEmitido: Record<string, unknown> | null = null;
    let corpoValidado: Record<string, unknown> | null = null;

    const r = await executarDemonstracao({
      registro: REGISTRO,
      bearer: "bearer-de-teste",
      idTemplate: "template-de-teste",
      operationId: "op-1",
      fetchImpl: fetchDeDemonstracao({
        validacao: { rfb_existe: true, cnh_existe: true, rfb: { nome: true } },
        aoEmitir: (c) => (corpoEmitido = c as Record<string, unknown>),
        aoValidar: (c) => (corpoValidado = c as Record<string, unknown>),
      }),
    });

    expect(r.situacao).toBe("respondido");

    const pedidos = (corpoEmitido!.parametros ?? []) as string[];
    const enviados = Object.keys(
      (corpoValidado!.validacao ?? {}) as Record<string, unknown>,
    );

    // `possui_impedimento` não foi enviado (sem tabela oficial), então também
    // não pode ter sido pedido à GCC.
    expect(enviados.join(" ")).not.toContain("possui_impedimento");
    expect(pedidos).not.toContain("cnh.possui_impedimento");

    // E o que foi enviado está coberto.
    expect(pedidos).toContain("cpf");
    expect(pedidos).toContain("nome");
  });

  it("registra o campo omitido com motivo, em vez de sumir com ele", async () => {
    const r = await executarDemonstracao({
      registro: REGISTRO,
      bearer: "b",
      idTemplate: "t",
      operationId: "op-2",
      fetchImpl: fetchDeDemonstracao({ validacao: { rfb_existe: true } }),
    });

    if (r.situacao !== "respondido") throw new Error("esperava resposta");
    const impedimento = r.camposOmitidos.find((c) => c.campo.includes("impedimento"));
    expect(impedimento?.motivo).toBe("SEM_TABELA_OFICIAL");
  });
});

describe("desfecho desconhecido na emissão para ali", () => {
  it("não chama a validação quando a emissão não se resolve", async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/gcc/token")) throw new Error("conexao caiu");
      throw new Error("a validacao NAO deveria ter sido chamada");
    }) as unknown as typeof fetch;

    const r = await executarDemonstracao({
      registro: REGISTRO,
      bearer: "b",
      idTemplate: "t",
      operationId: "op-3",
      fetchImpl: f,
    });

    expect(r.situacao).toBe("autorizacao_indefinida");
    if (r.situacao !== "autorizacao_indefinida") return;
    expect(r.repeticaoAutomaticaBloqueada).toBe(true);
    expect(r.emissoesPossivelmenteOrfas).toBeGreaterThanOrEqual(1);
    expect(r.aprovaCadastroReal).toBe(false);
  });

  it("pede o token uma única vez — não repete sozinho", async () => {
    let chamadas = 0;
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/gcc/token")) {
        chamadas += 1;
        throw new Error("indisponivel");
      }
      throw new Error("nao deveria validar");
    }) as unknown as typeof fetch;

    await executarDemonstracao({
      registro: REGISTRO,
      bearer: "b",
      idTemplate: "t",
      operationId: "op-4",
      fetchImpl: f,
    });

    expect(chamadas).toBe(1);
  });
});

describe("composição: bloco não avaliado impede aprovação", () => {
  function leitura(parcial: Partial<LeituraPorBloco["blocos"]>): LeituraPorBloco {
    const vazio = {
      estado: "ausente" as const,
      comparacoes: {},
      similaridades: {},
      decodificados: {},
      valores: {},
      naoClassificados: [],
    };
    return {
      rfbExiste: true,
      cnhExiste: true,
      blocos: {
        rfb: vazio,
        cnh: vazio,
        biometriaFacial: vazio,
        biometriaDigital: vazio,
        qrcode: vazio,
        ...parcial,
      },
    };
  }

  const lido = (comparacoes: Record<string, boolean>) => ({
    estado: "lido" as const,
    comparacoes,
    similaridades: {},
    decodificados: {},
    valores: {},
    naoClassificados: [],
  });

  it("tudo conferindo, mas com bloco ausente, é inconclusivo — não aprovado", () => {
    const blocos = blocosParaTela(leitura({ rfb: lido({ nome: true }) }));
    expect(composicaoDaDemonstracao(blocos)).toBe("inconclusivo");
  });

  it("uma divergência vence o inconclusivo", () => {
    const blocos = blocosParaTela(
      leitura({ rfb: lido({ nome: true }), cnh: lido({ categoria: false }) }),
    );
    expect(composicaoDaDemonstracao(blocos)).toBe("divergencia");
  });

  it("bloco lido e vazio conta como não avaliado, não como conferido", () => {
    const blocos = blocosParaTela(leitura({ rfb: lido({}) }));
    expect(blocos.find((b) => b.nome === "Receita Federal")?.veredito).toBe("nao_avaliado");
  });

  it("todos os blocos conferindo não vira 'aprovado'", () => {
    const todos = lido({ a: true });
    const blocos = blocosParaTela(
      leitura({
        rfb: todos,
        cnh: todos,
        biometriaFacial: todos,
        biometriaDigital: todos,
        qrcode: todos,
      }),
    );
    // O melhor desfecho possível é a ausência de impedimento aparente.
    expect(composicaoDaDemonstracao(blocos)).toBe("sem_impedimento_aparente");
  });
});

describe("a procedência acompanha todo retorno", () => {
  it("nenhum desfecho aprova cadastro real", async () => {
    const casos = [
      fetchDeDemonstracao({ validacao: { rfb_existe: true } }),
      fetchDeDemonstracao({ validacaoStatus: 422, validacao: { erro: "x" } }),
    ];
    for (const f of casos) {
      const r = await executarDemonstracao({
        registro: REGISTRO,
        bearer: "b",
        idTemplate: "t",
        operationId: "op-5",
        fetchImpl: f,
      });
      expect(r.aprovaCadastroReal).toBe(false);
      expect(r.demonstracao).toBe(true);
    }
  });
});
