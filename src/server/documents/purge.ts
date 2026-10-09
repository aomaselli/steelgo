/**
 * Execução do expurgo de documentos de validação.
 *
 * `retention.ts` DECIDE o que expurgar. Este módulo EXECUTA — e a diferença
 * importa, porque a decisão é pura e a execução depende de um serviço externo
 * que falha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA QUE ORGANIZA O MÓDULO INTEIRO
 *
 * **Expurgo não se declara concluído enquanto o arquivo persistir.**
 *
 * Parece óbvio, e é exatamente o que se perde na pressa: a Storage API devolve
 * sucesso, alguém marca `purged_at`, e o arquivo continua lá. A partir desse
 * momento o documento nunca mais é selecionado para expurgo — ele some do
 * relatório, não do disco. Fica biometria guardada além do prazo, com registro
 * dizendo que foi apagada.
 *
 * Por isso a ordem aqui é:
 *
 *   1. decidir (`avaliarExpurgo`);
 *   2. pedir a remoção;
 *   3. CONFERIR a ausência, por consulta separada — nunca pela resposta da
 *      remoção;
 *   4. só então marcar `purged_at` e registrar `purge` na trilha.
 *
 * Falhar em 2 ou em 3 devolve `pendente`: nada é marcado, nada é registrado, e
 * o documento volta a ser selecionado na próxima passada. Repetir é seguro
 * porque remover o que já não existe é inofensivo — ao contrário de marcar o
 * que ainda existe.
 *
 * A TRILHA SOBREVIVE
 *
 * O expurgo apaga o arquivo e o registro do documento. NÃO apaga a trilha: ela
 * é a prova de que o documento existiu, foi visto e foi apagado. É por não
 * guardar o documento que ela pode sobreviver a ele.
 *
 * O QUE A TRILHA NÃO REGISTRA
 *
 * Tentativa que falhou. `document_audit` guarda uma linha por evento
 * CONCLUÍDO, e as ações possíveis são fechadas por `check` no banco — não há
 * `purge_failed`. Uma falha fica registrada pela AUSÊNCIA de `purged_at`, que
 * é o que faz o documento ser selecionado de novo. Se um dia for preciso
 * contar tentativas, isso é mudança de esquema e de contrato, não um campo a
 * mais escondido aqui.
 */

import { type DocumentAuditAction, type DocumentKind, type DocumentPurpose } from "./types";
import {
  type RetentionPolicy,
  type StoredDocument,
  avaliarExpurgo,
} from "./retention";

/** Documento com o que a execução precisa além da decisão. */
export interface PurgeableDocument extends StoredDocument {
  subjectId: string;
  purpose: DocumentPurpose;
  kind: DocumentKind;
  /**
   * `validation_documents.id` — a chave do REGISTRO, não da pessoa.
   *
   * É o identificador que vai para o log operacional. O caminho do objeto não
   * serve: ele carrega o `subject_id` no segundo segmento, e log operacional
   * vai para serviço de terceiro com retenção que não controlamos.
   */
  documentId: string;
}

/** Motivo da falha. Lista fechada, igual ao `check` do banco. */
export type MotivoDeFalha = "REMOCAO_FALHOU" | "ARQUIVO_PERSISTE" | "CONFERENCIA_FALHOU";

/**
 * Entrada do log operacional de falha de expurgo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IDENTIFICADOR E MOTIVO, E MAIS NADA
 *
 * Lista FECHADA de campos, não "tudo menos o proibido": uma lista de proibidos
 * esquece o campo que alguém acrescenta depois.
 *
 * Fora daqui, de propósito: caminho do objeto (carrega o `subject_id`),
 * `subjectId`, espécie do documento, finalidade e qualquer mensagem de
 * fornecedor. Saber QUE o expurgo do registro X falhou por `ARQUIVO_PERSISTE`
 * é o que a operação precisa; de quem é o documento, não.
 */
export interface FalhaDeExpurgoParaLog {
  /** `validation_documents.id`. Não identifica pessoa. */
  documentId: string;
  motivo: MotivoDeFalha;
  tentativas: number;
  ocorridoEm: string;
}

export class DadoPessoalEmLogDeExpurgoError extends Error {
  constructor(campo: string, achado: string) {
    super(
      `Log operacional de expurgo recusou a entrada: "${campo}" contém ${achado}. ` +
        `Este log vai para serviço de terceiro; identificador de registro e ` +
        `motivo bastam, e nada além deles é permitido.`,
    );
    this.name = "DadoPessoalEmLogDeExpurgoError";
  }
}

const PROIBIDOS_NO_LOG: Array<{ nome: string; re: RegExp }> = [
  { nome: "caminho de objeto", re: /identity_validation\// },
  { nome: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  { nome: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\./ },
  { nome: "URL", re: /\bhttps?:\/\//i },
  { nome: "dado embutido (data URI)", re: /\bdata:[a-z]+\/[a-z0-9.+-]+;base64,/i },
  { nome: "chave ou segredo", re: /\b(bearer|secret|api[_-]?key|service[_-]?role)\b/i },
];

/**
 * Confere a entrada antes de entregá-la ao log.
 *
 * Barreira, não validação de formulário: quem chama não precisa acertar,
 * precisa não conseguir errar em silêncio.
 */
export function conferirFalhaParaLog(f: FalhaDeExpurgoParaLog): FalhaDeExpurgoParaLog {
  for (const [campo, valor] of [
    ["documentId", f.documentId],
    ["motivo", f.motivo],
    ["ocorridoEm", f.ocorridoEm],
  ] as Array<[string, string]>) {
    for (const { nome, re } of PROIBIDOS_NO_LOG) {
      if (re.test(valor)) throw new DadoPessoalEmLogDeExpurgoError(campo, nome);
    }
  }
  return { ...f };
}

/**
 * As dependências externas, injetadas.
 *
 * `remover` e `existe` são separadas de propósito: fundi-las faria a
 * conferência usar a resposta da remoção, que é o erro que este módulo existe
 * para não cometer.
 */
export interface PurgePorts {
  /** Pede a remoção ao Storage. Pode lançar ou devolver falha. */
  remover(objectPath: string): Promise<void>;
  /** Consulta INDEPENDENTE: o objeto ainda está lá? */
  existe(objectPath: string): Promise<boolean>;
  /**
   * Marca o registro do documento como expurgado.
   *
   * Tem de LIMPAR a falha pendente ao concluir: um registro com `purged_at`
   * preenchido e `last_purge_failure` ainda apontando falha é um estado que
   * não existe. O `check validation_documents_purge_coerente` recusa esse
   * estado no banco — e foi ele que apanhou esta porta incompleta na
   * homologação integrada, numa execução em que a primeira passada falhava e a
   * segunda concluía.
   */
  marcarExpurgado(objectPath: string, quando: Date): Promise<void>;
  /** Acrescenta a linha de trilha. Append-only no banco. */
  registrarTrilha(evento: {
    action: DocumentAuditAction;
    subjectId: string;
    actorId: string;
    actorRole: string;
    purpose: DocumentPurpose;
    kind: DocumentKind;
    objectPath: string;
    reasonCode: string;
    occurredAt: string;
  }): Promise<void>;
  /**
   * Marca a TENTATIVA que falhou, no registro do documento.
   *
   * É o que faz `purged_at is null` deixar de ser ambíguo: com a hora da
   * tentativa gravada, falha e tarefa-nunca-executada param de ser o mesmo
   * nulo. Opcional porque uma esteira pode não ter o esquema atualizado — e
   * nesse caso o log operacional continua sendo o único registro.
   */
  marcarTentativaFalha?(objectPath: string, quando: Date, motivo: MotivoDeFalha): Promise<void>;
  /** Log operacional. Recebe só identificador e motivo. */
  registrarFalhaOperacional?(f: FalhaDeExpurgoParaLog): void;
}

export type PurgeResult =
  | {
      status: "expurgado";
      objectPath: string;
      /** Motivo da decisão, de `retention.ts`. */
      reason: "ABANDONED_UPLOAD" | "BIOMETRIC_EXPIRED" | "DOCUMENT_EXPIRED";
      tentativas: number;
    }
  | {
      status: "pendente";
      objectPath: string;
      /** Por que não se pôde concluir. */
      falha: "REMOCAO_FALHOU" | "ARQUIVO_PERSISTE" | "CONFERENCIA_FALHOU";
      detalhe: string;
      tentativas: number;
      /**
       * Sempre `false`. Existe para que nenhum chamador leia `pendente` como
       * "deu certo" por descuido de tipo.
       */
      concluido: false;
    }
  | {
      status: "dispensado";
      objectPath: string;
      /**
       * Os dois motivos de `retention.ts` para NÃO expurgar, escritos à mão.
       * Uma primeira versão tentou derivá-los de `PurgeVerdict` por tipo
       * condicional; `extends` sobre união nua não distribui nessa posição e o
       * resultado foi `never`, que o compilador aceitou calado até o teste
       * tentar atribuir um literal. Explícito é mais longo e não mente.
       */
      reason: "ALREADY_PURGED" | "WITHIN_RETENTION";
    };

/**
 * Quem aparece na trilha quando o expurgo roda sozinho.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM UUID RESERVADO, E NÃO UM RÓTULO
 *
 * A primeira versão usava `"system:retention"` como `actorId`. O banco recusou:
 * `document_audit.actor_id` é `uuid not null`, e o expurgo automático não tem
 * usuário para pôr ali. Foi a homologação integrada que descobriu — os testes
 * com portas falsas aceitavam qualquer string.
 *
 * A saída é um UUID reservado, de zeros, com `actor_role = 'system'` carregando
 * o sentido. Alternativas descartadas: afrouxar a coluna para `text` perderia o
 * tipo em toda a trilha; deixá-la nula tornaria "quem agiu" opcional para todo
 * evento, inclusive os de pessoa.
 *
 * O banco AMARRA as duas pontas: o `check document_audit_ator_de_sistema`
 * garante que `actor_role = 'system'` e este UUID são a mesma condição —
 * nenhuma pessoa recebe o papel de sistema, e nenhum evento de sistema aparece
 * com ator de pessoa.
 */
export const ATOR_DE_SISTEMA_UUID = "00000000-0000-0000-0000-000000000000";

export const ATOR_DO_EXPURGO = {
  actorId: ATOR_DE_SISTEMA_UUID,
  actorRole: "system",
} as const;

/**
 * Expurga UM documento, se for a hora.
 *
 * `tentativasMaximas` repete apenas os passos 2 e 3 — pedir e conferir. Não
 * repete a decisão, que é pura e não muda no meio da chamada.
 */
export async function expurgarDocumento(
  doc: PurgeableDocument,
  policy: RetentionPolicy,
  ports: PurgePorts,
  now: Date,
  tentativasMaximas = 1,
): Promise<PurgeResult> {
  const veredito = avaliarExpurgo(doc, policy, now);
  if (!veredito.purge) {
    return { status: "dispensado", objectPath: doc.objectPath, reason: veredito.reason };
  }

  let tentativas = 0;
  let ultimaFalha: { falha: "REMOCAO_FALHOU" | "ARQUIVO_PERSISTE" | "CONFERENCIA_FALHOU"; detalhe: string } = {
    falha: "REMOCAO_FALHOU",
    detalhe: "nenhuma tentativa executada",
  };

  while (tentativas < Math.max(1, tentativasMaximas)) {
    tentativas += 1;

    // 2. Pedir a remoção.
    try {
      await ports.remover(doc.objectPath);
    } catch (e) {
      ultimaFalha = { falha: "REMOCAO_FALHOU", detalhe: mensagem(e) };
      continue;
    }

    // 3. Conferir a ausência por consulta SEPARADA. A resposta do passo 2 não
    //    vale como prova: um 200 que não removeu nada é indistinguível, daqui,
    //    de um 200 que removeu.
    let aindaExiste: boolean;
    try {
      aindaExiste = await ports.existe(doc.objectPath);
    } catch (e) {
      ultimaFalha = { falha: "CONFERENCIA_FALHOU", detalhe: mensagem(e) };
      continue;
    }

    if (aindaExiste) {
      ultimaFalha = {
        falha: "ARQUIVO_PERSISTE",
        detalhe: "a remoção respondeu sem erro, mas o objeto continua no bucket",
      };
      continue;
    }

    // 4. Agora, e só agora, o expurgo pode ser declarado.
    await ports.marcarExpurgado(doc.objectPath, now);
    await ports.registrarTrilha({
      action: "purge",
      subjectId: doc.subjectId,
      actorId: ATOR_DO_EXPURGO.actorId,
      actorRole: ATOR_DO_EXPURGO.actorRole,
      purpose: doc.purpose,
      kind: doc.kind,
      objectPath: doc.objectPath,
      reasonCode: veredito.reason,
      occurredAt: now.toISOString(),
    });

    return {
      status: "expurgado",
      objectPath: doc.objectPath,
      reason: veredito.reason,
      tentativas,
    };
  }

  // Esgotou as tentativas. A falha é registrada em DOIS lugares, com papéis
  // diferentes: no registro do documento, para que `purged_at is null` deixe
  // de ser ambíguo; e no log operacional, para que alguém veja sem consultar o
  // banco. Nenhum dos dois recebe dado pessoal.
  const ocorridoEm = now.toISOString();
  if (ports.marcarTentativaFalha) {
    await ports.marcarTentativaFalha(doc.objectPath, now, ultimaFalha.falha);
  }
  if (ports.registrarFalhaOperacional) {
    ports.registrarFalhaOperacional(
      conferirFalhaParaLog({
        documentId: doc.documentId,
        motivo: ultimaFalha.falha,
        tentativas,
        ocorridoEm,
      }),
    );
  }

  return {
    status: "pendente",
    objectPath: doc.objectPath,
    falha: ultimaFalha.falha,
    detalhe: ultimaFalha.detalhe,
    tentativas,
    concluido: false,
  };
}

/**
 * Expurga um lote, sem deixar uma falha interromper o resto.
 *
 * Um documento pendente não impede os outros: cada um tem o próprio resultado,
 * e quem chama vê exatamente quais ficaram para trás.
 */
export async function expurgarLote(
  docs: PurgeableDocument[],
  policy: RetentionPolicy,
  ports: PurgePorts,
  now: Date,
  tentativasMaximas = 1,
): Promise<PurgeResult[]> {
  const saida: PurgeResult[] = [];
  for (const doc of docs) {
    saida.push(await expurgarDocumento(doc, policy, ports, now, tentativasMaximas));
  }
  return saida;
}

/** Resumo para relatório e para alarme. */
export function resumirExpurgo(rs: PurgeResult[]): {
  expurgados: number;
  pendentes: number;
  dispensados: number;
  /** `true` quando há arquivo que devia ter saído e não saiu. */
  exigeAtencao: boolean;
} {
  const expurgados = rs.filter((r) => r.status === "expurgado").length;
  const pendentes = rs.filter((r) => r.status === "pendente").length;
  const dispensados = rs.filter((r) => r.status === "dispensado").length;
  return { expurgados, pendentes, dispensados, exigeAtencao: pendentes > 0 };
}

function mensagem(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
