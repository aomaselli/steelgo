/**
 * Validação do envio de documento de validação.
 *
 * Função pura: recebe o que foi declarado e os bytes, e devolve aceito/recusado
 * COM MOTIVO de lista fechada. Nada de `if (file.type === "image/png")` espalhado
 * entre tela e rota.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O FORMATO É LIDO DOS BYTES, E NÃO DO QUE O CLIENTE DISSE
 *
 * `Content-Type` e extensão são declaração de quem envia. O bucket aceita
 * `image/jpeg` e `image/png`, e a policy confere o caminho — nenhum dos dois
 * olha o conteúdo. Um arquivo qualquer com `Content-Type: image/png` entraria
 * no bucket privado e ficaria lá, contado como documento, até alguém tentar
 * abri-lo.
 *
 * Então: o formato vem do número mágico, e a declaração só é usada para
 * CONFERIR. Divergência é recusa, não correção silenciosa — quem enviou
 * precisa saber que o que mandou não era o que disse.
 */

import { DOCUMENT_KINDS, DOCUMENT_PURPOSES, type DocumentKind, type DocumentPurpose } from "./types";

/** Igual ao `file_size_limit` do bucket. Divergir aqui seria recusa em dois lugares diferentes. */
export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

export type FormatoAceito = "image/jpeg" | "image/png";

export const FORMATOS_ACEITOS: readonly FormatoAceito[] = ["image/jpeg", "image/png"];

const EXTENSAO: Record<FormatoAceito, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export type MotivoDeRecusa =
  | "FINALIDADE_INVALIDA"
  | "ESPECIE_INVALIDA"
  | "NAO_E_TITULAR"
  | "ARQUIVO_VAZIO"
  | "ARQUIVO_GRANDE_DEMAIS"
  | "FORMATO_NAO_RECONHECIDO"
  | "FORMATO_DIVERGE_DO_DECLARADO";

export type ResultadoDaValidacao =
  | { aceito: true; formato: FormatoAceito; extensao: string }
  | { aceito: false; motivo: MotivoDeRecusa; detalhe: string };

/**
 * `detalhe` nunca repete o que o cliente mandou.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A VERSÃO ANTERIOR ECOAVA
 *
 * `detalhe: \`declarado "${e.contentTypeDeclarado}"\`` devolvia ao chamador a
 * string que o chamador enviou. Hoje ela só volta para quem mandou, e parece
 * inofensivo. Deixa de ser no dia em que essa mensagem passar a ser registrada
 * em log, mostrada a um revisor ou repassada numa resposta de erro — e
 * nenhuma dessas mudanças teria motivo para reabrir esta linha.
 *
 * Então o detalhe descreve o que FOI RECUSADO, usando só valores que o
 * servidor conhece. Valor fora das listas vira rótulo fixo, não aspas em volta
 * do que veio de fora.
 */
function semEco(valor: string, conhecidos: readonly string[]): string {
  return conhecidos.includes(valor) ? valor : "(fora da lista)";
}

/**
 * Formato pelo número mágico.
 *
 * JPEG: `FF D8 FF`. PNG: a assinatura de oito bytes, inteira — os quatro
 * primeiros sozinhos já casariam com arquivo truncado.
 */
export function detectarFormato(bytes: Uint8Array): FormatoAceito | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= PNG.length && PNG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  return null;
}

export interface EnvioDeclarado {
  purpose: string;
  kind: string;
  /** De quem o documento diz ser. */
  subjectId: string;
  /** Quem está enviando, resolvido pela sessão. */
  actorId: string;
  /** O que o cliente declarou. Conferido, nunca acreditado. */
  contentTypeDeclarado: string;
  bytes: Uint8Array;
}

/**
 * Ordem deliberada: finalidade, espécie, titularidade, tamanho, formato.
 *
 * Titularidade antes de tamanho e formato porque recusar por tamanho um envio
 * que nem era da pessoa revelaria que o caminho de outra pessoa existe.
 */
export function validarEnvio(e: EnvioDeclarado): ResultadoDaValidacao {
  if (!(DOCUMENT_PURPOSES as readonly string[]).includes(e.purpose)) {
    return {
      aceito: false,
      motivo: "FINALIDADE_INVALIDA",
      detalhe: `finalidade ${semEco(e.purpose, DOCUMENT_PURPOSES)}`,
    };
  }
  if (!(DOCUMENT_KINDS as readonly string[]).includes(e.kind)) {
    return {
      aceito: false,
      motivo: "ESPECIE_INVALIDA",
      detalhe: `especie ${semEco(e.kind, DOCUMENT_KINDS)}`,
    };
  }
  if (e.actorId !== e.subjectId) {
    return {
      aceito: false,
      motivo: "NAO_E_TITULAR",
      detalhe: "quem envia nao e o titular declarado",
    };
  }
  if (e.bytes.length === 0) {
    return { aceito: false, motivo: "ARQUIVO_VAZIO", detalhe: "0 bytes" };
  }
  if (e.bytes.length > TAMANHO_MAXIMO_BYTES) {
    return {
      aceito: false,
      motivo: "ARQUIVO_GRANDE_DEMAIS",
      detalhe: `${e.bytes.length} bytes, teto ${TAMANHO_MAXIMO_BYTES}`,
    };
  }

  const formato = detectarFormato(e.bytes);
  if (!formato) {
    return {
      aceito: false,
      motivo: "FORMATO_NAO_RECONHECIDO",
      detalhe: "os bytes nao sao JPEG nem PNG",
    };
  }
  if (e.contentTypeDeclarado.trim().toLowerCase() !== formato) {
    return {
      aceito: false,
      motivo: "FORMATO_DIVERGE_DO_DECLARADO",
      detalhe: `declarado ${semEco(
        e.contentTypeDeclarado.trim().toLowerCase(),
        FORMATOS_ACEITOS,
      )}, lido ${formato}`,
    };
  }

  return { aceito: true, formato, extensao: EXTENSAO[formato] };
}

// ─────────────────────────── caminho do objeto ─────────────────────────────

/**
 * `<finalidade>/<titular>/<espécie>-<id>.<ext>`
 *
 * O segundo segmento é o que a policy do bucket confere contra `auth.uid()`.
 * Montar o caminho aqui, e só aqui, é o que impede a convenção de divergir
 * entre quem grava e quem autoriza.
 */
export function montarCaminhoDoObjeto(a: {
  purpose: DocumentPurpose;
  subjectId: string;
  kind: DocumentKind;
  documentId: string;
  extensao: string;
}): string {
  return `${a.purpose}/${a.subjectId}/${a.kind}-${a.documentId}.${a.extensao}`;
}

/** Leitura do caminho, para conferir do outro lado sem refazer a convenção. */
export function titularDoCaminho(caminho: string): string | null {
  const partes = caminho.split("/");
  if (partes.length !== 3) return null;
  return partes[1] || null;
}

// ─────────────── identificador derivado do titular e do conteúdo ───────────

/**
 * O identificador do documento vem do CONTEÚDO, não de um sorteio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE A VERSÃO ANTERIOR NÃO PROTEGIA
 *
 * A função do banco é idempotente por `p_document_id`, e isso resolvia a
 * repetição da CHAMADA. Não resolvia a repetição do ENVIO: o identificador era
 * sorteado a cada clique, então dois cliques no mesmo arquivo viravam dois
 * identificadores, dois objetos, dois registros e dois eventos de trilha. A
 * idempotência existia e não alcançava o caso que acontece de verdade.
 *
 * Agora o identificador é função de (titular, finalidade, espécie, bytes).
 * Reenviar o mesmo arquivo para a mesma espécie recai no mesmo identificador,
 * no mesmo caminho e no mesmo registro — e a repetição vira um nada acontecer,
 * que é o que repetição deveria ser.
 *
 * O titular entra na derivação, e não só por idempotência: sem ele, duas
 * pessoas que enviassem o mesmo arquivo colidiriam no mesmo identificador, e a
 * segunda receberia DV015 por um documento que não é dela. Com ele, cada
 * titular tem o próprio espaço.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE VERSÃO 8
 *
 * É um UUID derivado por hash, e a RFC 9562 reserva a versão 8 exatamente para
 * derivação própria. Chamá-lo de v5 seria mentir sobre o algoritmo — v5 é
 * SHA-1 com namespace, e isto é SHA-256 com um prefixo de domínio.
 */
const DOMINIO_DO_IDENTIFICADOR = "steelgo:validation_documents:v1";

export type Digestor = (texto: string) => Uint8Array;

export function identificadorDoEnvio(
  a: {
    subjectId: string;
    purpose: string;
    kind: string;
    sha256DoConteudo: string;
  },
  /**
   * SHA-256, passado por quem chama.
   *
   * `envio.ts` é lógica pura: é importado pelo teste, pela server function e
   * pela regressão que lê o código-fonte. Trazer `node:crypto` para cá faria
   * este arquivo exigir ambiente, e ele acabaria no grafo do cliente pelo
   * caminho da rota. Um parâmetro resolve sem estado de módulo.
   */
  digerir: Digestor,
): string {
  const bytes = digerir(
    [DOMINIO_DO_IDENTIFICADOR, a.subjectId, a.purpose, a.kind, a.sha256DoConteudo].join("\u0000"),
  );
  if (bytes.length < 16) {
    throw new Error("digestor devolveu menos de 16 bytes");
  }

  const b = Uint8Array.from(bytes.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x80; // versão 8
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 9562

  const hex = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ───────────────── o que fazer quando o registro falha ─────────────────────

/**
 * SQLSTATEs com que a função do banco recusa por barreira.
 *
 * Estão aqui, e não só no SQL, porque a decisão de repetir ou desfazer depende
 * de distinguir "o banco disse não" de "o banco não respondeu" — e tratar os
 * dois igual é o jeito de errar em qualquer das duas direções.
 */
export const RECUSAS_DE_BARREIRA = [
  "DV010", // sem sessão
  "DV011", // finalidade ou espécie fora da lista
  "DV012", // caminho não pertence a quem envia
  "DV013", // caminho carrega credencial
  "DV014", // consentimento ausente, retirado ou desatualizado
  "DV015", // o identificador já descreve outro envio
] as const;

export type AcaoAposFalhaDeRegistro =
  | "REPETIR_REGISTRO"
  | "REMOVER_OBJETO"
  | "MANTER_E_DECLARAR";

/**
 * Três desfechos, não dois.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A VERSÃO ANTERIOR PRESUMIA RECUSA
 *
 * Ela tinha dois desfechos: repetir ou remover. Falha de transporte repetida
 * caía em "remover" — ou seja, **presumia que o registro não aconteceu**. Se o
 * registro tivesse acontecido e as duas respostas se perdessem, apagaríamos o
 * objeto de um documento registrado, deixando a linha apontando para o vazio.
 *
 * Só a recusa de barreira autoriza remover, porque só ela afirma que nada foi
 * gravado: o banco respondeu, com código, dizendo não. Silêncio não é não.
 *
 * Quando o silêncio persiste, o objeto FICA. O estado é declarado no retorno e
 * no log, e a reconciliação acontece sozinha na próxima tentativa do titular:
 * o identificador vem do conteúdo, então reenviar o mesmo arquivo recai no
 * mesmo caminho e no mesmo registro.
 */
export function decidirAposFalhaDeRegistro(
  codigo: string | null | undefined,
  jaRepetiu = false,
): AcaoAposFalhaDeRegistro {
  if (codigo && (RECUSAS_DE_BARREIRA as readonly string[]).includes(codigo)) {
    return "REMOVER_OBJETO";
  }
  return jaRepetiu ? "MANTER_E_DECLARAR" : "REPETIR_REGISTRO";
}

// ───────────────────── log operacional do envio ────────────────────────────

export type MotivoDeFalhaDeEnvio =
  | "REGISTRO_RECUSADO"
  | "REGISTRO_INDISPONIVEL"
  /** O banco não respondeu. Pode ter gravado. O objeto ficou, de propósito. */
  | "REGISTRO_INDEFINIDO"
  /**
   * Objeto no bucket sem linha no registro.
   *
   * ──────────────────────────────────────────────────────────────────────
   * PENDÊNCIA DE E5, E O QUE A VARREDURA PRECISA DISTINGUIR
   *
   * O expurgo varre o REGISTRO, então não alcança este estado. A limpeza
   * será uma varredura do bucket — e ela tem um jeito óbvio de dar errado:
   * apagar o objeto de um envio que ainda está em curso.
   *
   * Os dois estados têm a mesma aparência (objeto presente, registro
   * ausente) e são opostos:
   *
   *   - envio ABANDONADO: o registro nunca vai chegar;
   *   - envio EM ANDAMENTO: o registro está a milissegundos de chegar, ou
   *     ficou indefinido e o titular vai reenviar.
   *
   * Três exigências para a varredura, nesta ordem:
   *
   *   1. PRAZO DE SEGURANÇA. Só entra na varredura o objeto cuja criação é
   *      mais antiga que uma janela folgada — maior que qualquer envio
   *      plausível, incluindo rede ruim de caminhão em estrada.
   *   2. NOVA CONFERÊNCIA ANTES DE APAGAR. O registro é consultado de novo
   *      imediatamente antes da remoção, e não no início do lote: entre
   *      listar e apagar cabe um envio inteiro.
   *   3. REGISTRO DO QUE FOI APAGADO, com o identificador derivado do
   *      caminho — nunca o caminho, que carrega o titular.
   *
   * Enquanto E5 não existir, o estado fica declarado no retorno e no log. É
   * pendência conhecida, não defeito silencioso.
   */
  | "OBJETO_SEM_REGISTRO";

export interface FalhaDeEnvioParaLog {
  documentId: string;
  motivo: MotivoDeFalhaDeEnvio;
  ocorridoEm: string;
}

export class CampoInvalidoEmLogDeEnvioError extends Error {}

const MOTIVOS_DE_FALHA: readonly MotivoDeFalhaDeEnvio[] = [
  "REGISTRO_RECUSADO",
  "REGISTRO_INDISPONIVEL",
  "REGISTRO_INDEFINIDO",
  "OBJETO_SEM_REGISTRO",
];

/**
 * Lista fechada, montada campo a campo.
 *
 * Sem espalhamento do objeto de entrada: espalhar carregaria qualquer campo
 * que alguém acrescentasse depois, e o log operacional vai para serviço de
 * terceiro com retenção que não controlamos. O identificador é o do REGISTRO,
 * nunca o caminho do objeto — que carrega o titular no segundo segmento.
 */
export function montarFalhaDeEnvioParaLog(f: FalhaDeEnvioParaLog): FalhaDeEnvioParaLog {
  if (!/^[0-9a-f-]{36}$/i.test(f.documentId)) {
    throw new CampoInvalidoEmLogDeEnvioError("documentId fora da forma de identificador");
  }
  if (!MOTIVOS_DE_FALHA.includes(f.motivo)) {
    throw new CampoInvalidoEmLogDeEnvioError(`motivo "${f.motivo}" fora da lista fechada`);
  }
  if (Number.isNaN(Date.parse(f.ocorridoEm))) {
    throw new CampoInvalidoEmLogDeEnvioError("ocorridoEm nao e um instante valido");
  }
  return { documentId: f.documentId, motivo: f.motivo, ocorridoEm: f.ocorridoEm };
}
