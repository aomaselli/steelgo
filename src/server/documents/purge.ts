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
}

/**
 * As dependências externas, injetadas.
 *
 * São quatro portas separadas de propósito. `remover` e `existe` em especial:
 * fundi-las numa só faria a conferência usar a resposta da remoção, que é o
 * erro que este módulo existe para não cometer.
 */
export interface PurgePorts {
  /** Pede a remoção ao Storage. Pode lançar ou devolver falha. */
  remover(objectPath: string): Promise<void>;
  /** Consulta INDEPENDENTE: o objeto ainda está lá? */
  existe(objectPath: string): Promise<boolean>;
  /** Marca o registro do documento como expurgado. */
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
