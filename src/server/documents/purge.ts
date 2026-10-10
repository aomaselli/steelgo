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
  RetencaoNaoConfiguradaError,
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
/**
  * Motivo da falha. Lista fechada, igual ao `check` do banco.
  *
  * `CONCLUSAO_FALHOU` entrou depois: e a transacao que grava `purged_at`,
  * limpa a falha anterior e insere o evento, e que nao confirmou. O arquivo
  * ja nao esta la; o registro ainda diz que esta. E o estado que a
  * recuperacao do passo 3 existe para desfazer.
  */
export type MotivoDeFalha =
  | "REMOCAO_FALHOU"
  | "ARQUIVO_PERSISTE"
  | "CONFERENCIA_FALHOU"
  | "CONCLUSAO_FALHOU";

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
/** Os motivos aceitos, em runtime. O tipo sozinho não vale em borda. */
const MOTIVOS_VALIDOS: ReadonlySet<string> = new Set([
  "REMOCAO_FALHOU",
  "ARQUIVO_PERSISTE",
  "CONFERENCIA_FALHOU",
  "CONCLUSAO_FALHOU",
]);

export class CampoInvalidoEmLogDeExpurgoError extends Error {
  constructor(campo: string, porque: string) {
    super(`Log operacional de expurgo recusou a entrada: "${campo}" ${porque}.`);
    this.name = "CampoInvalidoEmLogDeExpurgoError";
  }
}

/**
 * Confere a entrada e CONSTRÓI a saída, campo a campo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO `{ ...f }`
 *
 * O spread copiava tudo que viesse no objeto, incluindo propriedade que o tipo
 * não declara. Tipo é verificação de compilação; o log recebe objeto que
 * atravessou borda — JSON de fila, resposta de serviço, `any` em algum ponto
 * do caminho — e ali o tipo não existe mais. Bastava alguém anexar
 * `{ ...falha, subjectId, objectPath }` para o caminho do objeto e o titular
 * irem junto para um serviço de terceiro, sem nenhuma barreira disparar: os
 * campos extras nem eram CONFERIDOS, quanto mais bloqueados.
 *
 * Agora só os quatro campos permitidos são lidos do objeto de entrada, e a
 * saída é construída com eles. O que vier a mais fica de fora por construção —
 * não por lembrança de quem escreveu.
 *
 * Os valores também são validados em runtime, pelo mesmo motivo: um
 * `motivo` vindo de fora pode não ser nenhum dos quatro.
 */
export function conferirFalhaParaLog(f: FalhaDeExpurgoParaLog): FalhaDeExpurgoParaLog {
  const entrada = f as unknown as Record<string, unknown>;

  const documentId = entrada.documentId;
  const motivo = entrada.motivo;
  const tentativas = entrada.tentativas;
  const ocorridoEm = entrada.ocorridoEm;

  if (typeof documentId !== "string" || documentId.trim() === "") {
    throw new CampoInvalidoEmLogDeExpurgoError("documentId", "não é texto não vazio");
  }
  if (typeof motivo !== "string" || !MOTIVOS_VALIDOS.has(motivo)) {
    throw new CampoInvalidoEmLogDeExpurgoError(
      "motivo",
      `não está na lista fechada (${[...MOTIVOS_VALIDOS].join(", ")})`,
    );
  }
  if (typeof tentativas !== "number" || !Number.isInteger(tentativas) || tentativas < 0) {
    throw new CampoInvalidoEmLogDeExpurgoError("tentativas", "não é inteiro não negativo");
  }
  if (typeof ocorridoEm !== "string" || Number.isNaN(Date.parse(ocorridoEm))) {
    throw new CampoInvalidoEmLogDeExpurgoError("ocorridoEm", "não é um instante legível");
  }

  // A varredura por dado pessoal vale para TODOS os campos textuais do objeto
  // de entrada — inclusive os que não vão para a saída. Um campo extra com
  // CPF não pode passar em silêncio só por não ser copiado: quem o anexou
  // precisa saber que estava prestes a vazá-lo.
  for (const [campo, valor] of Object.entries(entrada)) {
    if (typeof valor !== "string") continue;
    for (const { nome, re } of PROIBIDOS_NO_LOG) {
      if (re.test(valor)) throw new DadoPessoalEmLogDeExpurgoError(campo, nome);
    }
  }

  // Construção explícita: só estes quatro saem daqui.
  return {
    documentId,
    motivo: motivo as FalhaDeExpurgoParaLog["motivo"],
    tentativas,
    ocorridoEm,
  };
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
   * Conclui o expurgo: `purged_at`, limpeza da falha e trilha, ATOMICAMENTE.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * POR QUE UMA PORTA SÓ, E NÃO DUAS
   *
   * Antes eram duas — `marcarExpurgado` e depois `registrarTrilha`. Entre uma
   * e outra cabe uma falha, e o estado que ela deixa é o pior possível:
   * `purged_at` preenchido, nenhum evento na trilha. O documento sai da
   * seleção para sempre e não há registro de que foi apagado — exatamente a
   * prova que a trilha existe para dar.
   *
   * Agora é uma chamada só, e quem a implementa tem de fazer as três coisas na
   * MESMA transação de banco. Se a trilha falhar, `purged_at` não é gravado.
   *
   * A limpeza da falha anterior entra junto: um registro com `purged_at`
   * preenchido e `last_purge_failure` apontando falha é estado que não existe,
   * e o `check validation_documents_purge_coerente` o recusa.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * CONCORRÊNCIA
   *
   * Duas execuções podem alcançar o mesmo documento. Quem implementa condiciona
   * a gravação a `purged_at is null` e devolve `"ja_concluido"` quando outra
   * execução chegou antes — sem gravar segundo evento. O banco sustenta isso
   * com índice único parcial sobre os eventos `purge`.
   */
  concluirExpurgo(conclusao: {
    objectPath: string;
    quando: Date;
    evento: {
      action: DocumentAuditAction;
      subjectId: string;
      actorId: string;
      actorRole: string;
      purpose: DocumentPurpose;
      kind: DocumentKind;
      objectPath: string;
      reasonCode: string;
      occurredAt: string;
    };
  }): Promise<"concluido" | "ja_concluido">;
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
      /**
       * Outra execução concorrente concluiu antes desta. O desfecho é o
       * mesmo; quem lê o relatório é que merece saber de onde veio.
       */
      concluidoPorOutraExecucao: boolean;
    }
  | {
      status: "pendente";
      objectPath: string;
      /** Por que não se pôde concluir. */
      falha: MotivoDeFalha;
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
  let ultimaFalha: { falha: MotivoDeFalha; detalhe: string } = {
    falha: "REMOCAO_FALHOU",
    detalhe: "nenhuma tentativa executada",
  };

  while (tentativas < Math.max(1, tentativasMaximas)) {
    tentativas += 1;

    // 2. Pedir a remoção.
    //
    //    Uma falha AQUI não decide nada sozinha. O passo 3 é que decide, e por
    //    um motivo que só aparece na segunda tentativa: se a remoção já tiver
    //    acontecido numa execução anterior cuja transação falhou, a Storage
    //    API responde 400 para o objeto ausente — e tratar isso como
    //    `REMOCAO_FALHOU` prenderia o documento para sempre, com o arquivo já
    //    apagado e o registro dizendo que não.
    let remocaoFalhou: string | null = null;
    try {
      await ports.remover(doc.objectPath);
    } catch (e) {
      remocaoFalhou = mensagem(e);
    }

    // 3. Conferir a ausência por consulta SEPARADA. A resposta do passo 2 não
    //    vale como prova — nem o sucesso, nem a falha. Ausência comprovada é
    //    o que autoriza concluir; presença é o que impede.
    let aindaExiste: boolean;
    try {
      aindaExiste = await ports.existe(doc.objectPath);
    } catch (e) {
      ultimaFalha = {
        falha: "CONFERENCIA_FALHOU",
        detalhe:
          mensagem(e) + (remocaoFalhou ? ` (a remoção antes disso falhou: ${remocaoFalhou})` : ""),
      };
      continue;
    }

    if (aindaExiste) {
      ultimaFalha = {
        falha: remocaoFalhou ? "REMOCAO_FALHOU" : "ARQUIVO_PERSISTE",
        detalhe: remocaoFalhou ?? "a remoção respondeu sem erro, mas o objeto continua no bucket",
      };
      continue;
    }

    // 4. Objeto comprovadamente ausente. Agora, e só agora, o expurgo pode ser
    //    declarado — e as três gravações vão na MESMA transação.
    //
    //    Vale também quando o passo 2 falhou: o arquivo não está lá, e é isso
    //    que importa. É este caminho que recupera a execução anterior que
    //    apagou o arquivo e perdeu a transação.
    let conclusao: "concluido" | "ja_concluido";
    try {
      conclusao = await ports.concluirExpurgo({
        objectPath: doc.objectPath,
        quando: now,
        evento: {
          action: "purge",
          subjectId: doc.subjectId,
          actorId: ATOR_DO_EXPURGO.actorId,
          actorRole: ATOR_DO_EXPURGO.actorRole,
          purpose: doc.purpose,
          kind: doc.kind,
          objectPath: doc.objectPath,
          reasonCode: veredito.reason,
          occurredAt: now.toISOString(),
        },
      });
    } catch (e) {
      // A transação não confirmou. O arquivo já não está lá, mas o registro e
      // a trilha não foram gravados — e é PRECISO que a próxima tentativa
      // consiga concluir. Ela consegue: `purged_at` continua nulo, o
      // documento volta a ser selecionado, a remoção falha com o objeto
      // ausente e o passo 3 prova a ausência.
      ultimaFalha = { falha: "CONCLUSAO_FALHOU", detalhe: mensagem(e) };
      continue;
    }

    return {
      status: "expurgado",
      objectPath: doc.objectPath,
      reason: veredito.reason,
      tentativas,
      // Outra execução chegou antes e já havia concluído. O resultado é o
      // mesmo — documento expurgado, um único evento na trilha —, mas quem lê
      // o relatório merece saber que não foi esta chamada que concluiu.
      concluidoPorOutraExecucao: conclusao === "ja_concluido",
    };
  }

  // Esgotou as tentativas. A falha é registrada em DOIS lugares, com papéis
  // diferentes: no registro do documento, para que `purged_at is null` deixe
  // de ser ambíguo; e no log operacional, para que alguém veja sem consultar o
  // banco. Nenhum dos dois recebe dado pessoal.
  //
  // As duas gravações são ACESSÓRIAS: se falharem, o documento continua
  // pendente e recuperável, e derrubar a chamada por causa delas custaria o
  // resto do lote. O motivo original é preservado.
  const ocorridoEm = now.toISOString();
  if (ports.marcarTentativaFalha) {
    try {
      await ports.marcarTentativaFalha(doc.objectPath, now, ultimaFalha.falha);
    } catch (e) {
      ultimaFalha = {
        ...ultimaFalha,
        detalhe: `${ultimaFalha.detalhe} | registro da tentativa também falhou: ${mensagem(e)}`,
      };
    }
  }
  if (ports.registrarFalhaOperacional) {
    try {
      ports.registrarFalhaOperacional(
        conferirFalhaParaLog({
          documentId: doc.documentId,
          motivo: ultimaFalha.falha,
          tentativas,
          ocorridoEm,
        }),
      );
    } catch (e) {
      ultimaFalha = {
        ...ultimaFalha,
        detalhe: `${ultimaFalha.detalhe} | log operacional também falhou: ${mensagem(e)}`,
      };
    }
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
    try {
      saida.push(await expurgarDocumento(doc, policy, ports, now, tentativasMaximas));
    } catch (e) {
      // ────────────────────────────────────────────────────────────────────
      // UM DOCUMENTO NÃO DERRUBA O LOTE
      //
      // `expurgarDocumento` já trata as falhas que conhece. O que chega aqui é
      // o que ele não previu — uma porta que lança de um jeito novo, por
      // exemplo. Deixar propagar interromperia os documentos seguintes, e os
      // não processados ficariam indistinguíveis dos que não precisavam de
      // nada.
      //
      // O erro vira resultado pendente, com motivo da lista fechada, e o
      // documento segue recuperável: `purged_at` continua nulo.
      if (e instanceof RetencaoNaoConfiguradaError) throw e;
      saida.push({
        status: "pendente",
        objectPath: doc.objectPath,
        falha: "CONCLUSAO_FALHOU",
        detalhe: `falha não prevista ao expurgar: ${mensagem(e)}`,
        tentativas: 0,
        concluido: false,
      });
    }
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
