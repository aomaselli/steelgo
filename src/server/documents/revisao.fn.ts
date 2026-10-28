/**
 * Leitura autenticada e revisão documental.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A ROTA É ESTA, E ELA É AUTENTICADA
 *
 * `lerDocumentoFn` é a única porta para os bytes. Ela exige sessão (o
 * middleware recusa sem bearer), reconfere a autorização **a cada leitura** na
 * função do banco, registra o evento `access` na mesma transação dessa
 * conferência, e devolve os bytes com `Cache-Control: no-store`.
 *
 * Não redireciona. Não emite URL assinada. Não entrega credencial de Storage.
 * A autorização decidida uma vez e guardada é exatamente o que a medição de
 * `url-assinada-como-credencial.mjs` mostrou não funcionar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUEM ALCANÇA
 *
 * Titular e revisor. Transportadora e embarcador não aparecem, e a ausência é
 * a decisão: eles precisam do RESULTADO da validação, não do rosto e do
 * documento do motorista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE A REVISÃO NÃO FAZ
 *
 * Não aprova. Não existe tipo "aprovado" — nem aqui, nem no `check` do banco.
 * Revisão registra observação, divergência ou pedido de novo envio, e nunca
 * substitui identidade, habilitação ou biometria por decisão manual.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { conferirAmbienteSintetico } from "./ambiente";
import { comoClienteDeDocumentos, type ClienteDeDocumentos } from "./cliente";
import {
  aplicarCabecalhosDeLeitura,
  CONTEXTOS_DE_REVISAO,
  TIPOS_DE_REVISAO,
  classificarFalhaDeLeitura,
  conferirNotaDeRevisao,
  NotaDeRevisaoInvalidaError,
  type MotivoDeFalhaDeLeitura,
  type TipoDeRevisao,
} from "./leitura";
import type { DocumentKind } from "./types";

const BUCKET = "validation-documents";

/**
 * Enquanto o adaptador real não existir, toda revisão é sobre demonstração.
 *
 * O valor não vem do cliente de propósito: deixá-lo escolher permitiria
 * marcar como "real" uma revisão feita contra simulação.
 */
const CONTEXTO_DESTA_FASE = "demonstracao" as const;

async function ehRevisor(db: ClienteDeDocumentos, userId: string): Promise<boolean> {
  const { data } = await db
    .from<{ role: string }>("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data ?? []).some((r) => r.role === "admin");
}

// ──────────────────────── leitura auditada ─────────────────────────────────

export type ResultadoDaLeitura =
  | { ok: true; kind: DocumentKind; contentType: string; conteudoBase64: string }
  | { ok: false; motivo: MotivoDeFalhaDeLeitura };

const leituraSchema = z.object({ documentId: z.string().uuid() });

export const lerDocumentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => leituraSchema.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoDaLeitura> => {
    conferirAmbienteSintetico(process.env);

    // Os cabeçalhos vão em TODA resposta, inclusive nas de recusa: o motivo da
    // recusa também não deve ficar em cache de proxy.
    aplicarCabecalhosDeLeitura((n, v) => setResponseHeader(n as never, v));

    const { supabase, userId } = context;
    const db = comoClienteDeDocumentos(supabase);

    // Autorização + auditoria na mesma transação. Se o evento não puder ser
    // gravado, a leitura não acontece -- acesso sem trilha é o estado que
    // esta etapa inteira existe para evitar.
    const { data: linhas, error } = await db.rpc<{
      object_path: string;
      kind: DocumentKind;
      subject_id: string;
    }>("registrar_acesso_a_documento", { p_document_id: data.documentId });

    if (error) return { ok: false, motivo: classificarFalhaDeLeitura(error.code) };

    const alvo = (linhas ?? [])[0];
    if (!alvo) return { ok: false, motivo: "DOCUMENTO_INEXISTENTE" };

    // Os bytes vêm com a sessão de quem pediu: as policies do bucket
    // continuam valendo, e são a segunda barreira.
    const { data: arquivo, error: erroStorage } = await supabase.storage
      .from(BUCKET)
      .download(alvo.object_path);

    if (erroStorage || !arquivo) {
      // O registro existe e o objeto não. É estado real -- expurgo em curso,
      // ou o órfão que E5 vai varrer -- e merece motivo próprio em vez de
      // virar "indisponível".
      return { ok: false, motivo: "ARQUIVO_AUSENTE" };
    }

    const bytes = Buffer.from(await arquivo.arrayBuffer());
    return {
      ok: true,
      kind: alvo.kind,
      // O tipo sai da EXTENSÃO do caminho, que foi escrita por nós a partir
      // do número mágico na entrada. O tipo que o Storage devolve veio do
      // cabeçalho do upload, e `nosniff` só ajuda se o que declaramos agora
      // for o que conferimos lá atrás.
      contentType: alvo.object_path.endsWith(".jpg") ? "image/jpeg" : "image/png",
      conteudoBase64: bytes.toString("base64"),
    };
  });

// ───────────────────────── fila de revisão ─────────────────────────────────

export interface DocumentoParaRevisao {
  id: string;
  kind: DocumentKind;
  uploadedAt: string;
  /** Identificador interno do titular. Nunca CPF, nunca nome. */
  subjectRef: string;
  revisoes: number;
}

export const listarParaRevisaoFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DocumentoParaRevisao[]> => {
    conferirAmbienteSintetico(process.env);
    aplicarCabecalhosDeLeitura((n, v) => setResponseHeader(n as never, v));

    const db = comoClienteDeDocumentos(context.supabase);
    if (!(await ehRevisor(db, context.userId))) {
      throw new Error("Forbidden: reviewer role required");
    }

    const { data: docs } = await db
      .from<{ id: string; kind: DocumentKind; uploaded_at: string; subject_id: string }>(
        "validation_documents",
      )
      .select("id, kind, uploaded_at, subject_id")
      .is("purged_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(100);

    const { data: revisoes } = await db
      .from<{ document_id: string }>("document_review_events")
      .select("document_id")
      .limit(1000);

    const contagem = new Map<string, number>();
    for (const r of revisoes ?? []) {
      contagem.set(r.document_id, (contagem.get(r.document_id) ?? 0) + 1);
    }

    return (docs ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      uploadedAt: d.uploaded_at,
      subjectRef: d.subject_id,
      revisoes: contagem.get(d.id) ?? 0,
    }));
  });

// ──────────────────────── registro da revisão ──────────────────────────────

export interface RevisaoRegistrada {
  id: string;
  tipo: TipoDeRevisao;
  contexto: string;
  nota: string | null;
  createdAt: string;
}

const revisaoSchema = z.object({
  documentId: z.string().uuid(),
  tipo: z.enum(TIPOS_DE_REVISAO),
  nota: z.string().max(2000).optional(),
});

export type ResultadoDaRevisao =
  | { registrada: true; contexto: typeof CONTEXTO_DESTA_FASE }
  | {
      registrada: false;
      motivo: MotivoDeFalhaDeLeitura | "NOTA_INVALIDA" | "TIPO_NAO_PREVISTO";
      detalhe: string;
    };

export const registrarRevisaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => revisaoSchema.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoDaRevisao> => {
    conferirAmbienteSintetico(process.env);
    aplicarCabecalhosDeLeitura((n, v) => setResponseHeader(n as never, v));

    const db = comoClienteDeDocumentos(context.supabase);

    let nota: string | null;
    try {
      nota = conferirNotaDeRevisao(data.nota);
    } catch (e) {
      return {
        registrada: false,
        motivo: "NOTA_INVALIDA",
        detalhe: e instanceof NotaDeRevisaoInvalidaError ? e.message : "nota recusada",
      };
    }

    const { error } = await db.rpc("registrar_revisao_de_documento", {
      p_document_id: data.documentId,
      p_tipo: data.tipo,
      // Não vem do cliente: deixá-lo escolher permitiria marcar como "real"
      // uma revisão feita contra simulação.
      p_contexto: CONTEXTO_DESTA_FASE,
      p_nota: nota,
    });

    if (error) {
      if (error.code === "DV024") {
        return { registrada: false, motivo: "TIPO_NAO_PREVISTO", detalhe: "tipo ou contexto" };
      }
      if (error.code === "DV025") {
        return { registrada: false, motivo: "NOTA_INVALIDA", detalhe: "o banco recusou a nota" };
      }
      return {
        registrada: false,
        motivo: classificarFalhaDeLeitura(error.code),
        detalhe: "a revisao nao foi registrada",
      };
    }

    return { registrada: true, contexto: CONTEXTO_DESTA_FASE };
  });

export const listarRevisoesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => leituraSchema.parse(d))
  .handler(async ({ data, context }): Promise<RevisaoRegistrada[]> => {
    conferirAmbienteSintetico(process.env);
    aplicarCabecalhosDeLeitura((n, v) => setResponseHeader(n as never, v));

    const db = comoClienteDeDocumentos(context.supabase);

    // Sem conferência de papel aqui de propósito: as policies decidem. O
    // titular lê as revisões do próprio documento, o revisor lê todas, e
    // quem não é nem um nem outro recebe lista vazia.
    const { data: linhas } = await db
      .from<{
        id: string;
        tipo: TipoDeRevisao;
        contexto: string;
        nota: string | null;
        created_at: string;
      }>("document_review_events")
      .select("id, tipo, contexto, nota, created_at")
      .eq("document_id", data.documentId)
      .order("created_at", { ascending: false });

    return (linhas ?? []).map((l) => ({
      id: l.id,
      tipo: l.tipo,
      contexto: l.contexto,
      nota: l.nota,
      createdAt: l.created_at,
    }));
  });

export { CONTEXTOS_DE_REVISAO };
