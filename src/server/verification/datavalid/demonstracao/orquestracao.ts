/**
 * Orquestração de uma validação de demonstração, ponta a ponta.
 *
 * Junta o que #16 já tinha solto — mapa, GCC simulada, cliente — numa sequência
 * só, para que a tela chame uma função e não quatro. A sequência é:
 *
 *   1. mapear o registro da massa oficial, podando o que não tem tabela;
 *   2. derivar os parâmetros de consentimento DO CORPO JÁ PODADO;
 *   3. pedir a autorização simulada, UMA vez;
 *   4. validar, UMA vez;
 *   5. ler a resposta por bloco.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DUAS COISAS QUE ESTA FUNÇÃO NÃO FAZ, E NÃO É DESCUIDO
 *
 * **Não repete nada por conta própria.** Nem a emissão do token, nem a
 * validação. `pedirAutorizacaoSimulada` já limita a uma tentativa, e desfecho
 * desconhecido para aqui com `repeticaoAutomaticaBloqueada`. A tentação de
 * repetir é maior na demonstração, justamente porque "não custa nada" —
 * treinar a esteira a repetir aqui é treiná-la a duplicar em produção.
 *
 * **Não recebe documento.** A assinatura aceita um índice da massa oficial, e
 * nada mais. Não há parâmetro para bytes, caminho de objeto ou identificador
 * de documento, porque o que não entra na assinatura não vaza por descuido.
 */

import {
  lerPorBloco,
  validarNaDemonstracao,
  type LeituraPorBloco,
  type Logger,
} from "./cliente";
import { pedirAutorizacaoSimulada } from "./gcc-simulada";
import { mapearRegistro, parametrosDoCorpo, type CampoOmitido, type RegistroDaMassa } from "./mapa";
import { TIMEOUT_PADRAO_MS } from "./ambiente";

export type DesfechoDaDemonstracao =
  | {
      situacao: "respondido";
      httpStatus: number;
      leitura: LeituraPorBloco;
      parametrosPedidos: string[];
      camposOmitidos: CampoOmitido[];
      duracaoMs: number;
      readonly demonstracao: true;
      readonly aprovaCadastroReal: false;
    }
  | {
      situacao: "recusado";
      httpStatus: number;
      detalhe: string;
      parametrosPedidos: string[];
      camposOmitidos: CampoOmitido[];
      readonly demonstracao: true;
      readonly aprovaCadastroReal: false;
    }
  | {
      situacao: "autorizacao_indefinida";
      httpStatus: number | null;
      detalhe: string;
      /** Sempre `true`: o desfecho da emissão é desconhecido e não se repete. */
      readonly repeticaoAutomaticaBloqueada: true;
      emissoesPossivelmenteOrfas: number;
      readonly demonstracao: true;
      readonly aprovaCadastroReal: false;
    }
  | {
      situacao: "desfecho_desconhecido";
      httpStatus: number | null;
      detalhe: string;
      readonly repeticaoAutomaticaBloqueada: true;
      readonly demonstracao: true;
      readonly aprovaCadastroReal: false;
    };

export interface OpcoesDaDemonstracao {
  registro: RegistroDaMassa;
  bearer: string;
  idTemplate: string;
  operationId: string;
  cnpjAnuente?: string | null;
  timeoutMs?: number;
  log?: Logger;
  fetchImpl?: typeof fetch;
}

export async function executarDemonstracao(
  o: OpcoesDaDemonstracao,
): Promise<DesfechoDaDemonstracao> {
  const timeoutMs = o.timeoutMs ?? TIMEOUT_PADRAO_MS;

  // 1 e 2. O corpo é podado ANTES de os parâmetros serem derivados. A ordem é
  //        o ponto: pedir consentimento de campo que não vai seria coletar
  //        autorização que não se usa, e pedir depois de enviar seria pior.
  const { corpo, omitidos } = mapearRegistro(o.registro, { estrito: false });
  const parametros = parametrosDoCorpo(corpo.validacao);

  // 3. Autorização, uma tentativa.
  const emissao = await pedirAutorizacaoSimulada({
    bearer: o.bearer,
    cpfFicticio: corpo.cpf,
    operationId: o.operationId,
    parametros,
    cnpjAnuente: o.cnpjAnuente ?? null,
    timeoutMs,
    fetchImpl: o.fetchImpl,
  });

  if (emissao.situacao !== "emitido") {
    return {
      situacao: "autorizacao_indefinida",
      httpStatus: emissao.httpStatus ?? null,
      detalhe: emissao.detalhe,
      repeticaoAutomaticaBloqueada: true,
      emissoesPossivelmenteOrfas: emissao.emissoesPossivelmenteOrfas ?? 1,
      demonstracao: true,
      aprovaCadastroReal: false,
    };
  }

  // 4 e 5. Validação e leitura por bloco.
  const r = await validarNaDemonstracao({
    bearer: o.bearer,
    idTemplate: o.idTemplate,
    autorizacao: emissao.autorizacao,
    operationId: o.operationId,
    corpo,
    camposOmitidos: omitidos,
    timeoutMs,
    log: o.log,
    fetchImpl: o.fetchImpl,
  });

  if (r.situacao === "respondido") {
    return {
      situacao: "respondido",
      httpStatus: r.httpStatus,
      leitura: r.leitura,
      parametrosPedidos: parametros,
      camposOmitidos: r.camposOmitidos,
      duracaoMs: r.duracaoMs,
      demonstracao: true,
      aprovaCadastroReal: false,
    };
  }

  if (r.situacao === "recusado") {
    return {
      situacao: "recusado",
      httpStatus: r.httpStatus,
      detalhe: r.detalhe,
      parametrosPedidos: parametros,
      camposOmitidos: omitidos,
      demonstracao: true,
      aprovaCadastroReal: false,
    };
  }

  return {
    situacao: "desfecho_desconhecido",
    httpStatus: r.httpStatus,
    detalhe: r.detalhe,
    repeticaoAutomaticaBloqueada: true,
    demonstracao: true,
    aprovaCadastroReal: false,
  };
}

// ───────────────────────── leitura para a tela ─────────────────────────────

export type VereditoDoBloco = "confere" | "diverge" | "nao_avaliado";

export interface BlocoParaTela {
  nome: string;
  veredito: VereditoDoBloco;
  /** Quantas comparações vieram verdadeiras e quantas vieram ao todo. */
  confere: number;
  total: number;
  /** Escalares que não são comparação — `vivacidade`, por exemplo. */
  observacoes: Array<{ campo: string; valor: string }>;
}

/**
 * Traduz a leitura por bloco para o que a tela mostra.
 *
 * **Um bloco não avaliado nunca vira "confere".** É a regra que o motor de
 * regras do #12 já aplica na composição, repetida aqui porque é na tela que a
 * tentação de simplificar aparece: três blocos verdes e um cinza lido às
 * pressas viram "aprovado" na cabeça de quem olha.
 */
export function blocosParaTela(leitura: LeituraPorBloco): BlocoParaTela[] {
  const nomes: Array<[string, keyof LeituraPorBloco["blocos"]]> = [
    ["Receita Federal", "rfb"],
    ["Habilitação", "cnh"],
    ["Biometria facial", "biometriaFacial"],
    ["Biometria digital", "biometriaDigital"],
    ["QR Code da CNH", "qrcode"],
  ];

  return nomes.map(([nome, chave]) => {
    const b = leitura.blocos[chave];
    const valores = Object.values(b.comparacoes);
    const confere = valores.filter(Boolean).length;

    let veredito: VereditoDoBloco;
    if (b.estado !== "lido" || valores.length === 0) veredito = "nao_avaliado";
    else if (confere === valores.length) veredito = "confere";
    else veredito = "diverge";

    return {
      nome,
      veredito,
      confere,
      total: valores.length,
      observacoes: Object.entries(b.valores ?? {}).map(([campo, valor]) => ({
        campo,
        valor: String(valor),
      })),
    };
  });
}

/**
 * O desfecho composto, pela mesma regra do motor: bloco não avaliado IMPEDE
 * aprovação. Nunca devolve "aprovado" — devolve "sem impedimento aparente",
 * porque aprovar não é coisa que demonstração faça.
 */
export function composicaoDaDemonstracao(
  blocos: readonly BlocoParaTela[],
): "sem_impedimento_aparente" | "divergencia" | "inconclusivo" {
  if (blocos.some((b) => b.veredito === "diverge")) return "divergencia";
  if (blocos.some((b) => b.veredito === "nao_avaliado")) return "inconclusivo";
  return "sem_impedimento_aparente";
}
