/**
 * Carga da massa oficial fictícia.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE A MASSA É A ÚNICA ENTRADA POSSÍVEL
 *
 * O endpoint de demonstração do SERPRO é público e compartilhado. Mandar para
 * lá um documento que alguém enviou pela tela seria publicar dado de uma
 * pessoa num serviço de terceiro, sem base, para ver o que volta — e a tela
 * não tem como saber se o que subiu é sintético.
 *
 * Então o processamento de demonstração **não recebe documento**. Ele escolhe
 * um registro da massa oficial, que é fictícia por construção e publicada pelo
 * próprio SERPRO para esse fim. A assinatura das funções abaixo não aceita
 * bytes, caminho de objeto nem identificador de documento: o que não entra na
 * assinatura não vaza por descuido.
 *
 * O arquivo tem ~12 MB por causa da biometria em base64 e NÃO entra no
 * repositório. O caminho vem de `DATAVALID_MASSA_OFICIAL`, lido só no
 * servidor.
 */

import { readFileSync } from "node:fs";

import type { RegistroDaMassa } from "./mapa";

export type MotivoDeMassaIndisponivel =
  | "CAMINHO_NAO_CONFIGURADO"
  | "ARQUIVO_ILEGIVEL"
  | "FORMATO_INESPERADO";

export class MassaOficialIndisponivelError extends Error {
  readonly motivo: MotivoDeMassaIndisponivel;
  constructor(motivo: MotivoDeMassaIndisponivel, detalhe: string) {
    super(`Massa oficial indisponivel (${motivo}): ${detalhe}`);
    this.name = "MassaOficialIndisponivelError";
    this.motivo = motivo;
  }
}

/** O que a tela pode ver de um registro. Nunca o CPF, nunca a biometria. */
export interface ResumoDoRegistro {
  indice: number;
  /** Nome fictício da massa. Serve para distinguir um registro do outro. */
  nome: string;
  temCnh: boolean;
  temBiometriaFacial: boolean;
  temQrCode: boolean;
}

let cache: RegistroDaMassa[] | null = null;

/**
 * Lê e guarda a massa. Guardar importa: são ~12 MB, e reler a cada chamada
 * transformaria cada clique numa leitura de disco inteira.
 */
export function carregarMassaOficial(
  env: Record<string, string | undefined> = process.env,
): RegistroDaMassa[] {
  if (cache) return cache;

  const caminho = (env.DATAVALID_MASSA_OFICIAL ?? "").trim();
  if (!caminho) {
    throw new MassaOficialIndisponivelError(
      "CAMINHO_NAO_CONFIGURADO",
      "DATAVALID_MASSA_OFICIAL nao definido.",
    );
  }

  let bruto: string;
  try {
    bruto = readFileSync(caminho, "utf8");
  } catch {
    // Sem o caminho na mensagem: ele aponta para fora do repositório e pode
    // carregar nome de usuário do sistema.
    throw new MassaOficialIndisponivelError(
      "ARQUIVO_ILEGIVEL",
      "o arquivo apontado nao pode ser lido.",
    );
  }

  let lido: unknown;
  try {
    lido = JSON.parse(bruto);
  } catch {
    throw new MassaOficialIndisponivelError("FORMATO_INESPERADO", "o arquivo nao e JSON valido.");
  }

  if (!Array.isArray(lido) || lido.length === 0) {
    throw new MassaOficialIndisponivelError(
      "FORMATO_INESPERADO",
      "esperava uma lista de registros.",
    );
  }

  cache = lido as RegistroDaMassa[];
  return cache;
}

/** Só para teste: a massa é cacheada por processo. */
export function esquecerMassaOficial(): void {
  cache = null;
}

/**
 * Resumo para a tela.
 *
 * Deliberadamente sem CPF. Ele é fictício, mas tem a forma de um CPF, e o
 * primeiro lugar onde um CPF fictício vira um CPF de verdade é uma tela que já
 * sabia mostrar CPF.
 */
export function resumirMassa(registros: readonly RegistroDaMassa[]): ResumoDoRegistro[] {
  return registros.map((r, i) => ({
    indice: i,
    nome: r.nome ?? `registro ${i + 1}`,
    temCnh: Boolean(r.cnh_numero_registro),
    temBiometriaFacial: Boolean((r as { biometria_face?: string }).biometria_face),
    temQrCode: Boolean(r.qrcode),
  }));
}

/** Escolhe por índice, recusando o que estiver fora. */
export function registroPorIndice(
  registros: readonly RegistroDaMassa[],
  indice: number,
): RegistroDaMassa {
  if (!Number.isInteger(indice) || indice < 0 || indice >= registros.length) {
    throw new MassaOficialIndisponivelError(
      "FORMATO_INESPERADO",
      `indice ${indice} fora da massa de ${registros.length} registros.`,
    );
  }
  return registros[indice];
}
