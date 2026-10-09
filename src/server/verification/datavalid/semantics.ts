/**
 * Semântica dos retornos do Datavalid V5.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUATRO COISAS DIFERENTES, QUE A RESPOSTA MISTURA NO MESMO OBJETO
 *
 *   1. valor ENVIADO          o que nós afirmamos
 *   2. COMPARAÇÃO             booleano: o valor enviado confere com a base
 *   3. EXTRAÇÃO               `*_decodificado` do QR Code: o valor lido
 *   4. PROBABILÍSTICO         similaridade e probabilidade biométrica
 *
 * A documentação oficial é explícita (Guias rápidos, "Passo 6.1 — IMPORTANTE:
 * Utilize o retorno de acordo com sua regra de negócio"):
 *
 *     "o Datavalid processa apenas os dados que foram enviados pelo
 *      contratante"
 *
 * Por isso `situacao: true` NÃO significa "a CNH está regular". Significa
 * "o valor de `situacao` que você enviou confere com a base".
 *
 * O exemplo oficial é o melhor aviso que existe: a requisição envia
 * `"possui_impedimento": true` e a resposta devolve `"possui_impedimento":
 * true`. Lido como aprovação, é exatamente ao contrário — a resposta confirma
 * que HÁ impedimento.
 *
 * Este módulo torna esse erro impossível de cometer por distração: não existe
 * tipo que carregue o booleano sozinho.
 */

/**
 * Comparação: só existe junto com o valor enviado.
 *
 * Não há construtor que aceite apenas `matches`. É deliberado — um booleano
 * solto não tem significado, e um tipo que o permitisse convidaria a lê-lo.
 */
export interface FieldComparison<T> {
  /** O que NÓS afirmamos. Sem isto, `matches` não quer dizer nada. */
  sent: T;
  /** A base oficial confirma que o valor enviado confere. */
  matches: boolean;
}

/** Extração: o valor lido do documento (QR Code da CNH). */
export interface ExtractedField<T> {
  decoded: T | null;
}

/** Probabilístico: similaridade de texto e probabilidade biométrica. */
export interface ProbabilisticMatch {
  /** 0..1 para texto; a API devolve `*_similaridade`. */
  similarity: number | null;
  /** Faixa devolvida pela biometria facial, quando houver. */
  probability: string | null;
}

/**
 * Veredito de um campo. `inconclusive` é estado de primeira classe: a maior
 * parte das respostas do Datavalid não conclui nada sozinha.
 */
export type FieldVerdict = "satisfied" | "refuted" | "inconclusive";

export class CampoObrigatorioAusenteError extends Error {
  readonly campo: string;
  constructor(campo: string) {
    super(`Campo obrigatório ausente na resposta: ${campo}. Resultado inconclusivo.`);
    this.name = "CampoObrigatorioAusenteError";
    this.campo = campo;
  }
}

/**
 * Campo obrigatório omitido NUNCA satisfaz a verificação.
 *
 * Ausência não é "não se aplica": é desconhecimento. Devolve inconclusivo em
 * vez de deixar o chamador tropeçar em `undefined`.
 */
export function exigirCampo<T>(valor: T | null | undefined, campo: string): T | null {
  if (valor === undefined || valor === null) return null;
  void campo;
  return valor;
}

/**
 * Comparação simples.
 *
 * `matches === true` diz que o valor enviado confere — e só isso. Se o valor
 * enviado for indesejável, confirmar que ele confere é má notícia, não boa.
 * Por isso esta função não decide nada sobre aprovação: devolve se a
 * AFIRMAÇÃO se sustenta.
 */
export function compararCampo<T>(c: FieldComparison<T> | null | undefined): FieldVerdict {
  if (!c) return "inconclusive";
  return c.matches ? "satisfied" : "refuted";
}

/**
 * Impedimento na CNH.
 *
 * O caso que a documentação usa de exemplo, e que é um convite ao erro:
 *
 *   enviado=true,  confere=true   -> HÁ impedimento          (bloqueia)
 *   enviado=false, confere=true   -> NÃO há impedimento      (não bloqueia)
 *   confere=false                 -> a afirmação está errada,
 *                                    e não sabemos a verdade (inconclusivo)
 *   ausente                       -> inconclusivo
 *
 * Em nenhum ramo um booleano sozinho vira aprovação.
 */
export type ImpedimentReading = "com_impedimento" | "sem_impedimento" | "inconclusivo";

export function lerImpedimento(
  c: FieldComparison<boolean> | null | undefined,
): ImpedimentReading {
  if (!c) return "inconclusivo";
  if (!c.matches) return "inconclusivo";
  return c.sent ? "com_impedimento" : "sem_impedimento";
}

/**
 * Situação por SONDAGEM.
 *
 * Não existe consulta de situação no endpoint unificado. O que dá para fazer é
 * afirmar um valor e ler se ele confere. Confirmar a hipótese desejada é um
 * indício forte; refutá-la só diz que a situação é OUTRA, não qual.
 *
 * Por isso `refuted` vira inconclusivo para fins de aprovação — nunca
 * aprovação, nunca reprovação definitiva.
 */
export function sondarSituacao(
  c: FieldComparison<string> | null | undefined,
  situacaoDesejada: string,
): FieldVerdict {
  if (!c) return "inconclusive";
  if (c.sent !== situacaoDesejada) return "inconclusive";
  return c.matches ? "satisfied" : "inconclusive";
}

/**
 * Similaridade contra um limiar EXPLÍCITO.
 *
 * Sem limiar padrão. O limiar é decisão de negócio da SteelGo e precisa estar
 * escrito em quem chama — um padrão aqui viraria a política de fato.
 */
export function avaliarSimilaridade(
  p: ProbabilisticMatch | null | undefined,
  limiar: number,
): FieldVerdict {
  if (!p || p.similarity === null || p.similarity === undefined) return "inconclusive";
  return p.similarity >= limiar ? "satisfied" : "refuted";
}

/**
 * Leitura do QR Code da CNH.
 *
 * Devolve o que está NO DOCUMENTO. Categoria e validade extraídas ainda
 * precisam das regras operacionais da SteelGo — categoria exigida pelo
 * veículo, antecedência mínima de vencimento — e, sobretudo:
 *
 *   o QR Code NÃO prova ausência de restrição posterior à emissão.
 *
 * Uma suspensão aplicada depois de a via ser impressa não aparece ali. Por
 * isso o retorno abaixo nomeia o que cobre e o que não cobre, em vez de
 * entregar um "válido" que seria falso.
 */
export interface QrCodeReading {
  categoria: string | null;
  dataValidade: string | null;
  numeroRegistro: string | null;
  /** Sempre `false`: o QR Code não carrega restrição posterior à emissão. */
  provaAusenciaDeRestricaoPosterior: false;
}

export function lerQrCode(campos: {
  categoria?: ExtractedField<string> | null;
  dataValidade?: ExtractedField<string> | null;
  numeroRegistro?: ExtractedField<string> | null;
}): QrCodeReading {
  return {
    categoria: campos.categoria?.decoded ?? null,
    dataValidade: campos.dataValidade?.decoded ?? null,
    numeroRegistro: campos.numeroRegistro?.decoded ?? null,
    provaAusenciaDeRestricaoPosterior: false,
  };
}

/**
 * Compõe vereditos de campo.
 *
 * Satisfaz apenas se TODOS satisfazem. Um refutado reprova; um inconclusivo
 * deixa inconclusivo. Nenhum caminho leva de "inconclusivo" a "satisfeito".
 */
export function comporVereditos(vereditos: FieldVerdict[]): FieldVerdict {
  if (vereditos.length === 0) return "inconclusive";
  if (vereditos.includes("refuted")) return "refuted";
  if (vereditos.includes("inconclusive")) return "inconclusive";
  return "satisfied";
}
