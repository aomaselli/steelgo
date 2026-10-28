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

export type AcaoAposFalhaDeRegistro = "REPETIR_REGISTRO" | "REMOVER_OBJETO";

/**
 * Recusa de barreira vai recusar de novo: repetir só adia a limpeza. Falha sem
 * código — rede, tempo esgotado, indisponibilidade — merece UMA repetição,
 * porque o objeto pode já estar registrado do outro lado e apagá-lo seria
 * destruir um envio que deu certo.
 *
 * A repetição só é segura porque a função do banco é idempotente pelo
 * identificador do documento. Sem aquela idempotência, esta função estaria
 * propondo duplicar registro e trilha.
 */
export function decidirAposFalhaDeRegistro(
  codigo: string | null | undefined,
): AcaoAposFalhaDeRegistro {
  if (codigo && (RECUSAS_DE_BARREIRA as readonly string[]).includes(codigo)) {
    return "REMOVER_OBJETO";
  }
  return "REPETIR_REGISTRO";
}

// ───────────────────── log operacional do envio ────────────────────────────

export type MotivoDeFalhaDeEnvio =
  | "REGISTRO_RECUSADO"
  | "REGISTRO_INDISPONIVEL"
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
