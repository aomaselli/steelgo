/**
 * Cliente do Datavalid em modo DEMONSTRAÇÃO.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE CLIENTE NUNCA FAZ
 *
 *   - falar com outro destino que não o serviço oficial de demonstração;
 *   - inicializar em produção;
 *   - repetir sozinho depois de a requisição possivelmente ter saído;
 *   - escrever token, biometria, imagem ou corpo completo em log;
 *   - devolver resultado que possa ser lido como aprovação de cadastro real.
 *
 * O último é o mais fácil de errar e o mais caro: o resultado sai marcado
 * `demonstracao: true` e com `aprovaCadastroReal: false` em literal, de modo
 * que nenhum chamador consiga tratá-lo como validação oficial sem alterar o
 * tipo e encarar este comentário.
 */

import { classificarFase, decidirRetry, type RetryDecision } from "../privacy";
import {
  CAMINHOS,
  TIMEOUT_PADRAO_MS,
  assertAmbienteDeDemonstracao,
  urlDeDemonstracao,
} from "./ambiente";
import {
  type AutorizacaoSimulada,
  envelopeParaCorpo,
  montarPrivacidadeDeDemonstracao,
} from "./gcc-simulada";
import type { CampoOmitido, CorpoDeValidacao } from "./mapa";

// ───────────────────────────── log seguro ──────────────────────────────────

/**
 * O que pode ser registrado.
 *
 * Lista FECHADA, não "tudo menos o proibido". A diferença importa: uma lista
 * de proibidos esquece o campo novo que alguém acrescentar; uma lista de
 * permitidos não registra o que não foi pensado.
 */
export interface EntradaDeLog {
  evento: string;
  /** Identificador NOSSO da operação. Não é identificador de pessoa. */
  operationId: string;
  /** Caminho chamado, sem query. */
  caminho: string;
  httpStatus: number | null;
  duracaoMs: number;
  /** Nomes de campo enviados. NOMES, não valores. */
  camposEnviados: string[];
  /** Quantidade de campos omitidos pelo mapeamento. */
  camposOmitidos: number;
  demonstracao: true;
  detalhe?: string;
}

export type Logger = (e: EntradaDeLog) => void;

/**
 * Padrões que não podem aparecer em nenhum campo textual do log.
 *
 * Mesma forma da guarda de `src/server/documents/audit.ts`, e pelo mesmo
 * motivo: o chamador não precisa acertar, precisa não conseguir errar calado.
 */
const PROIBIDOS: Array<{ nome: string; re: RegExp }> = [
  { nome: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\./ },
  { nome: "dado embutido (data URI)", re: /\bdata:[a-z]+\/[a-z0-9.+-]+;base64,/i },
  { nome: "base64 longo", re: /[A-Za-z0-9+/]{120,}={0,2}/ },
  { nome: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  { nome: "chave ou segredo", re: /\b(bearer|secret|api[_-]?key|service[_-]?role)\b/i },
  { nome: "URL com credencial", re: /[?&](token|signature|sig)=/i },
];

export class DadoSensivelEmLogError extends Error {
  constructor(campo: string, achado: string) {
    super(
      `Log do adaptador de demonstração recusou a entrada: "${campo}" contém ` +
        `${achado}. Log vai para serviço de terceiro, com retenção que não ` +
        `controlamos.`,
    );
    this.name = "DadoSensivelEmLogError";
  }
}

/** Confere a entrada antes de entregá-la ao logger. */
export function conferirEntradaDeLog(e: EntradaDeLog): EntradaDeLog {
  const textuais: Array<[string, string]> = [
    ["evento", e.evento],
    ["operationId", e.operationId],
    ["caminho", e.caminho],
    ["detalhe", e.detalhe ?? ""],
    ...e.camposEnviados.map((c, i): [string, string] => [`camposEnviados[${i}]`, c]),
  ];
  for (const [campo, valor] of textuais) {
    for (const { nome, re } of PROIBIDOS) {
      if (re.test(valor)) throw new DadoSensivelEmLogError(campo, nome);
    }
  }
  return e;
}

// ─────────────────────────── leitura por bloco ─────────────────────────────

/**
 * A resposta da V5 vem em blocos, e cada bloco responde por uma coisa
 * diferente. Misturá-los num veredito só foi o defeito que o motor de regras
 * do #12 corrigiu; aqui a leitura preserva a separação.
 */
export interface LeituraPorBloco {
  /** `rfb_existe` — o CPF existe na base da Receita. */
  rfbExiste: boolean | null;
  /** `cnh_existe` — há registro de habilitação. */
  cnhExiste: boolean | null;
  blocos: {
    rfb: BlocoLido;
    cnh: BlocoLido;
    biometriaFacial: BlocoLido;
    biometriaDigital: BlocoLido;
    qrcode: BlocoLido;
  };
}

export interface BlocoLido {
  /** `ausente` = o bloco não veio; `vazio` = veio sem campo algum. */
  estado: "lido" | "ausente" | "vazio";
  /** Comparações booleanas: nome do campo -> o valor ENVIADO casou com a base. */
  comparacoes: Record<string, boolean>;
  /** Similaridades, de 0 a 1. */
  similaridades: Record<string, number>;
  /** Campos decodificados (QR code). */
  decodificados: Record<string, unknown>;
  /** Campos que vieram e não se encaixam em nenhuma das formas acima. */
  naoClassificados: string[];
}

/**
 * Lê um bloco da resposta.
 *
 * Desce UM nível de aninhamento, com o nome achatado por ponto. A resposta
 * aninha de fato: dentro de `cnh` vem um `endereco` com as comparações de
 * logradouro, bairro, CEP e município. A primeira versão desta função não
 * descia, e a homologação ponta a ponta mostrou essas comparações caindo em
 * "não classificados" — ou seja, lidas como ruído em vez de resultado.
 *
 * Um nível, e não recursão sem limite, porque é o que o contrato tem. Mais
 * fundo exigiria rever o contrato, não afrouxar esta função.
 */
function lerBloco(bruto: unknown): BlocoLido {
  const vazio: BlocoLido = {
    estado: "ausente",
    comparacoes: {},
    similaridades: {},
    decodificados: {},
    naoClassificados: [],
  };
  if (bruto === undefined || bruto === null) return vazio;
  if (typeof bruto !== "object") return { ...vazio, estado: "vazio" };

  const b: BlocoLido = {
    estado: "lido",
    comparacoes: {},
    similaridades: {},
    decodificados: {},
    naoClassificados: [],
  };

  const classificar = (nome: string, v: unknown, podeDescer: boolean) => {
    if (typeof v === "boolean") b.comparacoes[nome] = v;
    else if (typeof v === "number" && /similaridade/.test(nome)) b.similaridades[nome] = v;
    else if (/decodificado/.test(nome)) b.decodificados[nome] = v;
    else if (podeDescer && v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [sub, sv] of Object.entries(v as Record<string, unknown>)) {
        classificar(`${nome}.${sub}`, sv, false);
      }
    } else b.naoClassificados.push(nome);
  };

  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    classificar(k, v, true);
  }
  if (Object.keys(bruto as object).length === 0) b.estado = "vazio";
  return b;
}

export function lerPorBloco(resposta: Record<string, unknown>): LeituraPorBloco {
  return {
    rfbExiste: typeof resposta.rfb_existe === "boolean" ? resposta.rfb_existe : null,
    cnhExiste: typeof resposta.cnh_existe === "boolean" ? resposta.cnh_existe : null,
    blocos: {
      rfb: lerBloco(resposta.rfb),
      cnh: lerBloco(resposta.cnh),
      biometriaFacial: lerBloco(resposta.biometria_facial),
      biometriaDigital: lerBloco(resposta.biometria_digital),
      qrcode: lerBloco(resposta.qrcode),
    },
  };
}

// ──────────────────────────── a chamada ────────────────────────────────────

export type ResultadoDaDemonstracao =
  | {
      situacao: "respondido";
      httpStatus: number;
      leitura: LeituraPorBloco;
      /** Sempre `true`. Marca a procedência do resultado. */
      readonly demonstracao: true;
      /**
       * Sempre `false`. Resultado de demonstração não aprova cadastro real
       * nem libera viagem — o literal impede que alguém trate como se
       * aprovasse sem mexer neste tipo.
       */
      readonly aprovaCadastroReal: false;
      camposOmitidos: CampoOmitido[];
      duracaoMs: number;
    }
  | {
      situacao: "recusado";
      httpStatus: number;
      /** A decisão de repetir, vinda de `../privacy.ts`. */
      retry: RetryDecision;
      readonly demonstracao: true;
      readonly aprovaCadastroReal: false;
      duracaoMs: number;
      detalhe: string;
    }
  | {
      situacao: "desfecho_desconhecido";
      httpStatus: number | null;
      retry: RetryDecision;
      /** Repetição automática BLOQUEADA. */
      readonly repeticaoAutomaticaBloqueada: true;
      readonly demonstracao: true;
      readonly aprovaCadastroReal: false;
      duracaoMs: number;
      detalhe: string;
    };

/**
 * Executa UMA validação. Nunca repete por conta própria.
 *
 * Quem decide repetir é `decidirRetry`, de `../privacy.ts`, e ele só autoriza
 * no caso comprovadamente anterior ao envio. Desfecho desconhecido devolve
 * `repeticaoAutomaticaBloqueada` e para ali — inclusive na demonstração, onde
 * a tentação de repetir é maior justamente porque "não custa nada". Treinar a
 * esteira a repetir aqui é treiná-la a duplicar em produção.
 */
export async function validarNaDemonstracao(opcoes: {
  bearer: string;
  idTemplate: string;
  autorizacao: AutorizacaoSimulada;
  operationId: string;
  corpo: CorpoDeValidacao;
  camposOmitidos: CampoOmitido[];
  timeoutMs?: number;
  log?: Logger;
  fetchImpl?: typeof fetch;
}): Promise<ResultadoDaDemonstracao> {
  assertAmbienteDeDemonstracao();

  const url = urlDeDemonstracao(CAMINHOS.validacao);
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const privacidade = montarPrivacidadeDeDemonstracao(
    opcoes.idTemplate,
    opcoes.autorizacao,
    opcoes.operationId,
  );

  const corpo = {
    privacidade: envelopeParaCorpo(privacidade),
    cpf: opcoes.corpo.cpf,
    validacao: opcoes.corpo.validacao,
  };

  const camposEnviados = Object.keys(opcoes.corpo.validacao);
  const registrar = (
    evento: string,
    httpStatus: number | null,
    duracaoMs: number,
    detalhe?: string,
  ) => {
    if (!opcoes.log) return;
    opcoes.log(
      conferirEntradaDeLog({
        evento,
        operationId: opcoes.operationId,
        caminho: CAMINHOS.validacao,
        httpStatus,
        duracaoMs,
        camposEnviados,
        camposOmitidos: opcoes.camposOmitidos.length,
        demonstracao: true,
        detalhe,
      }),
    );
  };

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeoutMs);
  const inicio = Date.now();

  // `possivelmenteEnviado` é a informação que o status HTTP não dá. Começa
  // `false` e passa a `true` no instante em que o `fetch` é iniciado: dali em
  // diante não se pode mais afirmar que nada saiu.
  let possivelmenteEnviado = false;

  let resposta: Response;
  try {
    possivelmenteEnviado = true;
    resposta = await (opcoes.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + opcoes.bearer,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
  } catch (e) {
    clearTimeout(relogio);
    const duracaoMs = Date.now() - inicio;
    const abortado = e instanceof Error && e.name === "AbortError";
    const detalhe = abortado
      ? `tempo esgotado em ${timeoutMs} ms`
      : e instanceof Error
        ? e.message
        : String(e);
    registrar("validacao.sem_resposta", null, duracaoMs, detalhe);
    return {
      situacao: "desfecho_desconhecido",
      httpStatus: null,
      retry: decidirRetry({ httpStatus: null, possivelmenteEnviado }),
      repeticaoAutomaticaBloqueada: true,
      demonstracao: true,
      aprovaCadastroReal: false,
      duracaoMs,
      detalhe,
    };
  } finally {
    clearTimeout(relogio);
  }

  const duracaoMs = Date.now() - inicio;
  const fase = classificarFase({ httpStatus: resposta.status, possivelmenteEnviado });

  if (resposta.ok) {
    const bruto = (await resposta.json()) as Record<string, unknown>;
    registrar("validacao.respondida", resposta.status, duracaoMs);
    return {
      situacao: "respondido",
      httpStatus: resposta.status,
      leitura: lerPorBloco(bruto),
      demonstracao: true,
      aprovaCadastroReal: false,
      camposOmitidos: opcoes.camposOmitidos,
      duracaoMs,
    };
  }

  // Corpo de erro NÃO entra no log: pode ecoar o que foi enviado. Só o status.
  const detalhe = `HTTP ${resposta.status} ${resposta.statusText || ""}`.trim();
  const retry = decidirRetry({ httpStatus: resposta.status, possivelmenteEnviado });

  if (fase === "recusa_explicita") {
    registrar("validacao.recusada", resposta.status, duracaoMs, detalhe);
    return {
      situacao: "recusado",
      httpStatus: resposta.status,
      retry,
      demonstracao: true,
      aprovaCadastroReal: false,
      duracaoMs,
      detalhe,
    };
  }

  registrar("validacao.desfecho_desconhecido", resposta.status, duracaoMs, detalhe);
  return {
    situacao: "desfecho_desconhecido",
    httpStatus: resposta.status,
    retry,
    repeticaoAutomaticaBloqueada: true,
    demonstracao: true,
    aprovaCadastroReal: false,
    duracaoMs,
    detalhe,
  };
}

/**
 * Registra o template de tratamento RFB e devolve o `id`.
 *
 * O corpo segue o OpenAPI, que diverge do artigo em prosa: o campo é
 * `agente_tratamento` (não `agente_de_tratamento`) e `como_exercer_direitos`
 * é LISTA DE ENUM, não texto livre.
 */
export async function registrarTemplate(opcoes: {
  bearer: string;
  corpo: Record<string, unknown>;
  operationId: string;
  timeoutMs?: number;
  log?: Logger;
  fetchImpl?: typeof fetch;
}): Promise<{ id: string; httpStatus: number }> {
  assertAmbienteDeDemonstracao();

  const url = urlDeDemonstracao(CAMINHOS.template);
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeoutMs);
  const inicio = Date.now();

  try {
    const r = await (opcoes.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + opcoes.bearer,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(opcoes.corpo),
      signal: controle.signal,
    });
    const duracaoMs = Date.now() - inicio;
    opcoes.log?.(
      conferirEntradaDeLog({
        evento: r.ok ? "template.registrado" : "template.recusado",
        operationId: opcoes.operationId,
        caminho: CAMINHOS.template,
        httpStatus: r.status,
        duracaoMs,
        camposEnviados: Object.keys(opcoes.corpo),
        camposOmitidos: 0,
        demonstracao: true,
      }),
    );
    if (!r.ok) {
      throw new Error(
        `Registro do template recusado: HTTP ${r.status} ${r.statusText || ""}`.trim(),
      );
    }
    const corpo = (await r.json()) as { id?: string };
    if (!corpo.id) throw new Error("registro do template respondeu sem `id`");
    return { id: corpo.id, httpStatus: r.status };
  } finally {
    clearTimeout(relogio);
  }
}
