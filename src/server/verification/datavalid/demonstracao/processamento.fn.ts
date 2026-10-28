/**
 * Server function do processamento de demonstração.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA FUNÇÃO PROCESSA, E O QUE ELA NÃO PROCESSA
 *
 * Ela processa um registro da **massa oficial fictícia**, escolhido por
 * índice. Ela **não** processa o documento que o motorista enviou, e não tem
 * como processá-lo: a entrada é `{ indiceDaMassa }`, e não há caminho desta
 * função até os bytes do bucket.
 *
 * Isso é deliberado e é o ponto mais importante do arquivo. O endpoint de
 * demonstração do SERPRO é público e compartilhado; mandar para lá um
 * documento recebido pela tela seria publicar dado de uma pessoa num serviço
 * de terceiro para ver o que volta. A tela não tem como saber se o que subiu é
 * sintético — então a decisão não fica com a tela.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO HÁ EVENTO DE TRILHA AQUI
 *
 * `document_audit` tem a ação `validation_started`, e seria fácil gravá-la.
 * Seria errado: a trilha amarra todo evento ao caminho do objeto no bucket, e
 * o evento afirmaria que **aquele documento** entrou em validação. Não entrou
 * — quem entrou foi um registro fictício. Trilha que afirma o que não
 * aconteceu é pior que trilha ausente.
 *
 * Quando houver validação de verdade, ela terá documento de verdade e aí o
 * evento descreve um fato. Até lá, não.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONSENTIMENTO ≠ AUTORIZAÇÃO DA GCC
 *
 * O consentimento interno continua sendo exigido para chegar até aqui — ele é
 * a base do nosso tratamento. Ele **não** autoriza a consulta: quem autoriza é
 * a GCC, por operação, e nesta etapa ela é **simulada**. As duas coisas
 * aparecem separadas no retorno, de propósito.
 */

import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { consentStatus } from "@/server/documents/access";
import { conferirAmbienteSintetico } from "@/server/documents/ambiente";
import { comoClienteDeDocumentos } from "@/server/documents/cliente";
import { assertAmbienteDeDemonstracao, TIMEOUT_PADRAO_MS } from "./ambiente";
import { registrarTemplate } from "./cliente";
import {
  carregarMassaOficial,
  registroPorIndice,
  resumirMassa,
  MassaOficialIndisponivelError,
  type ResumoDoRegistro,
} from "./massa-oficial";
import {
  blocosParaTela,
  composicaoDaDemonstracao,
  executarDemonstracao,
  type BlocoParaTela,
} from "./orquestracao";

const FINALIDADE = "identity_validation" as const;

/** Rótulo fixo, para a tela e para quem ler o retorno sem contexto. */
export const PROCEDENCIA = {
  origem: "massa oficial ficticia do SERPRO",
  autorizacao: "GCC SIMULADA — nao e autorizacao de entidade credenciada",
  readonly: true,
  aprovaCadastroReal: false,
  liberaViagem: false,
} as const;

export type EstadoDoProcessamento =
  | { pronto: false; motivo: "SEM_CONSENTIMENTO" | "MASSA_INDISPONIVEL" | "SEM_CREDENCIAL"; detalhe: string }
  | { pronto: true; registros: ResumoDoRegistro[] };

export type ResultadoDoProcessamento =
  | {
      executado: true;
      procedencia: typeof PROCEDENCIA;
      blocos: BlocoParaTela[];
      composicao: "sem_impedimento_aparente" | "divergencia" | "inconclusivo";
      parametrosPedidos: string[];
      camposOmitidos: Array<{ campo: string; motivo: string }>;
      duracaoMs: number;
    }
  | {
      executado: false;
      procedencia: typeof PROCEDENCIA;
      motivo:
        | "SEM_CONSENTIMENTO"
        | "MASSA_INDISPONIVEL"
        | "SEM_CREDENCIAL"
        | "AUTORIZACAO_INDEFINIDA"
        | "RECUSADO"
        | "DESFECHO_DESCONHECIDO";
      detalhe: string;
      /** Verdadeiro quando o desfecho é desconhecido: ninguém repete sozinho. */
      repeticaoAutomaticaBloqueada: boolean;
    };

/** Credenciais da demonstração. Só do servidor, nunca do cliente. */
function credenciais(env: Record<string, string | undefined>): {
  bearer: string;
  idTemplate: string | null;
} | null {
  const bearer = (env.DATAVALID_DEMO_BEARER ?? "").trim();
  if (!bearer) return null;
  return { bearer, idTemplate: (env.DATAVALID_DEMO_TEMPLATE_ID ?? "").trim() || null };
}

/**
 * O template de tratamento é registrado uma vez por processo quando não vier
 * configurado. Registrar a cada clique seria criar lixo no ambiente de
 * demonstração por conta de uma decisão de implementação nossa.
 */
let templateDoProcesso: string | null = null;

async function idDeTemplate(bearer: string, configurado: string | null): Promise<string> {
  if (configurado) return configurado;
  if (templateDoProcesso) return templateDoProcesso;

  const { id } = await registrarTemplate({
    bearer,
    operationId: randomUUID(),
    corpo: {
      // Corpo sintético. `agente_tratamento` e a lista de enum seguem o
      // OpenAPI, que diverge do artigo em prosa — ver as questões ao SERPRO.
      agente_tratamento: "SteelGo (demonstracao)",
      finalidade: "Validacao de identidade de motorista — ambiente de demonstracao",
      como_exercer_direitos: ["REQUISICAO_ELETRONICA"],
    },
  });
  templateDoProcesso = id;
  return id;
}

async function consentimentoVigente(
  context: { supabase: unknown; userId: string },
): Promise<boolean> {
  const db = comoClienteDeDocumentos(context.supabase);

  const { data: textos } = await db
    .from<{ version: string; body_sha256: string; effective_from: string }>(
      "document_consent_texts",
    )
    .select("version, body_sha256, effective_from")
    .eq("purpose", FINALIDADE)
    .order("effective_from", { ascending: false })
    .limit(1);

  const { data: aceites } = await db
    .from<{ version: string; text_sha256: string; accepted_at: string; withdrawn_at: string | null }>(
      "document_consents",
    )
    .select("version, text_sha256, accepted_at, withdrawn_at")
    .eq("subject_id", context.userId)
    .eq("purpose", FINALIDADE)
    .order("accepted_at", { ascending: false })
    .limit(1);

  const t = (textos ?? [])[0];
  const a = (aceites ?? [])[0];

  return (
    consentStatus({
      published: t
        ? {
            purpose: FINALIDADE,
            version: t.version,
            textSha256: t.body_sha256,
            effectiveFrom: t.effective_from,
          }
        : null,
      record: a
        ? {
            subjectId: context.userId,
            purpose: FINALIDADE,
            version: a.version,
            textSha256: a.text_sha256,
            acceptedAt: a.accepted_at,
            withdrawnAt: a.withdrawn_at,
          }
        : null,
    }) === "current"
  );
}

// ──────────────────────── estado: o que dá para rodar ──────────────────────

export const obterEstadoDoProcessamentoFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoDoProcessamento> => {
    conferirAmbienteSintetico(process.env);
    assertAmbienteDeDemonstracao();

    if (!(await consentimentoVigente(context))) {
      return {
        pronto: false,
        motivo: "SEM_CONSENTIMENTO",
        detalhe: "aceite o termo antes de processar",
      };
    }

    if (!credenciais(process.env)) {
      return {
        pronto: false,
        motivo: "SEM_CREDENCIAL",
        detalhe: "DATAVALID_DEMO_BEARER nao configurado no servidor",
      };
    }

    try {
      return { pronto: true, registros: resumirMassa(carregarMassaOficial(process.env)) };
    } catch (e) {
      return {
        pronto: false,
        motivo: "MASSA_INDISPONIVEL",
        detalhe:
          e instanceof MassaOficialIndisponivelError ? e.motivo : "massa oficial indisponivel",
      };
    }
  });

// ───────────────────────────── processamento ───────────────────────────────

const entradaSchema = z.object({
  /**
   * Índice na massa oficial. É a ÚNICA entrada.
   *
   * Não há campo para bytes, caminho de objeto ou identificador de documento,
   * e a ausência é a barreira: nenhum documento recebido pela tela alcança o
   * endpoint público de demonstração porque não existe por onde.
   */
  indiceDaMassa: z.number().int().min(0).max(99),
});

export const processarDemonstracaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => entradaSchema.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoDoProcessamento> => {
    conferirAmbienteSintetico(process.env);
    assertAmbienteDeDemonstracao();

    const recusa = (
      motivo: Exclude<ResultadoDoProcessamento, { executado: true }>["motivo"],
      detalhe: string,
      repeticaoAutomaticaBloqueada = false,
    ): ResultadoDoProcessamento => ({
      executado: false,
      procedencia: PROCEDENCIA,
      motivo,
      detalhe,
      repeticaoAutomaticaBloqueada,
    });

    if (!(await consentimentoVigente(context))) {
      return recusa("SEM_CONSENTIMENTO", "aceite o termo antes de processar");
    }

    const cred = credenciais(process.env);
    if (!cred) return recusa("SEM_CREDENCIAL", "DATAVALID_DEMO_BEARER nao configurado");

    let registro;
    try {
      registro = registroPorIndice(carregarMassaOficial(process.env), data.indiceDaMassa);
    } catch (e) {
      return recusa(
        "MASSA_INDISPONIVEL",
        e instanceof MassaOficialIndisponivelError ? e.motivo : "massa oficial indisponivel",
      );
    }

    const idTemplate = await idDeTemplate(cred.bearer, cred.idTemplate);

    const r = await executarDemonstracao({
      registro,
      bearer: cred.bearer,
      idTemplate,
      operationId: randomUUID(),
      timeoutMs: TIMEOUT_PADRAO_MS,
    });

    if (r.situacao === "autorizacao_indefinida") {
      return recusa(
        "AUTORIZACAO_INDEFINIDA",
        `${r.detalhe} (emissoes possivelmente orfas: ${r.emissoesPossivelmenteOrfas})`,
        true,
      );
    }
    if (r.situacao === "recusado") return recusa("RECUSADO", r.detalhe);
    if (r.situacao === "desfecho_desconhecido") {
      return recusa("DESFECHO_DESCONHECIDO", r.detalhe, true);
    }

    const blocos = blocosParaTela(r.leitura);
    return {
      executado: true,
      procedencia: PROCEDENCIA,
      blocos,
      composicao: composicaoDaDemonstracao(blocos),
      parametrosPedidos: r.parametrosPedidos,
      // Só campo e motivo. O `codigo` recusado é dado da massa e não precisa
      // sair daqui para a tela dizer o que não foi avaliado.
      camposOmitidos: r.camposOmitidos.map((c) => ({ campo: c.campo, motivo: c.motivo })),
      duracaoMs: r.duracaoMs,
    };
  });
