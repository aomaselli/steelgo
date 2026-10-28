/**
 * Server functions do fluxo de consentimento e envio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TRÊS DECISÕES DE DESENHO, E A RAZÃO DE CADA UMA
 *
 * 1. NENHUMA CREDENCIAL DE STORAGE CHEGA AO CLIENTE.
 *    Os bytes sobem por aqui, com a sessão de quem pede. A alternativa — dar
 *    ao navegador uma URL assinada de upload — devolveria ao cliente uma
 *    credencial que sobrevive à retirada do consentimento, que é exatamente a
 *    lacuna medida em `url-assinada-como-credencial.mjs`. Custa um salto a
 *    mais por byte; é o preço combinado.
 *
 * 2. A SESSÃO É A DO TITULAR, NÃO A DO SERVIDOR.
 *    `context.supabase` carrega o bearer de quem chamou. As policies do bucket
 *    e das tabelas continuam valendo — são a segunda barreira, e service role
 *    aqui a apagaria.
 *
 * 3. O CONSENTIMENTO É CONFERIDO A CADA ENVIO, não uma vez por sessão.
 *    `consentStatus` decide em função pura; aqui só se lê o estado e se
 *    obedece.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE FLUXO NÃO É
 *
 * Aceite registrado aqui é a base do NOSSO tratamento: coletar, guardar,
 * exibir ao revisor, expurgar. Ele **não** é a autorização que a GCC emite,
 * sem a qual não há consulta a base oficial. Nenhum retorno deste módulo pode
 * ser lido como aprovação de cadastro ou liberação de viagem.
 */

import { createServerFn } from "@tanstack/react-start";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comoClienteDeDocumentos, type ClienteDeDocumentos } from "./cliente";
import { consentStatus, type ConsentState } from "./access";
import { buildDocumentAuditEvent } from "./audit";
import {
  ESTADO_DE_DEMONSTRACAO,
  conferirAmbienteSintetico,
  AmbienteNaoSinteticoError,
} from "./ambiente";
import { montarCaminhoDoObjeto, validarEnvio, type MotivoDeRecusa } from "./envio";
import { DOCUMENT_KINDS, type DocumentKind } from "./types";

const FINALIDADE = "identity_validation" as const;
const BUCKET = "validation-documents";

/** O que sai para o navegador. Sem URL, sem caminho de objeto, sem bytes. */
export interface EstadoDoFluxo {
  demonstracao: typeof ESTADO_DE_DEMONSTRACAO;
  texto: { version: string; textSha256: string; bodyMd: string; effectiveFrom: string } | null;
  situacao: "current" | "missing" | "outdated" | "withdrawn";
  documentos: Array<{ id: string; kind: DocumentKind; uploadedAt: string }>;
}

function sha256Hex(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Papel do solicitante. Mesma resolução do fluxo de verificação: admin ganha
 * de driver quando a pessoa tem os dois.
 */
async function papelDe(
  db: ClienteDeDocumentos,
  userId: string,
): Promise<"driver" | "admin" | null> {
  const { data, error } = await db
    .from<{ role: string }>("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Unauthorized: could not resolve role");
  const papeis = (data ?? []).map((r) => r.role);
  if (papeis.includes("admin")) return "admin";
  if (papeis.includes("driver")) return "driver";
  return null;
}

interface LinhaDeTexto {
  version: string;
  body_md: string;
  body_sha256: string;
  effective_from: string;
  purpose: string;
}

interface LinhaDeAceite {
  purpose: string;
  version: string;
  text_sha256: string;
  accepted_at: string;
  withdrawn_at: string | null;
}

/** Texto vigente + aceite do titular, no formato que `access.ts` espera. */
async function lerConsentimento(
  db: ClienteDeDocumentos,
  subjectId: string,
): Promise<{ estado: ConsentState; bodyMd: string | null }> {
  const { data: textos } = await db
    .from<LinhaDeTexto>("document_consent_texts")
    .select("version, body_md, body_sha256, effective_from, purpose")
    .eq("purpose", FINALIDADE)
    .order("effective_from", { ascending: false })
    .limit(1);

  const t = (textos ?? [])[0] ?? null;

  const { data: aceites } = await db
    .from<LinhaDeAceite>("document_consents")
    .select("purpose, version, text_sha256, accepted_at, withdrawn_at")
    .eq("subject_id", subjectId)
    .eq("purpose", FINALIDADE)
    .order("accepted_at", { ascending: false })
    .limit(1);

  const a = (aceites ?? [])[0] ?? null;

  return {
    bodyMd: t?.body_md ?? null,
    estado: {
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
            subjectId,
            purpose: FINALIDADE,
            version: a.version,
            textSha256: a.text_sha256,
            acceptedAt: a.accepted_at,
            withdrawnAt: a.withdrawn_at,
          }
        : null,
    },
  };
}

// ───────────────────────────── estado do fluxo ─────────────────────────────

export const obterEstadoDoFluxoFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoDoFluxo> => {
    conferirAmbienteSintetico(process.env);
    const { userId } = context;
    const db = comoClienteDeDocumentos(context.supabase);

    if (!(await papelDe(db, userId))) {
      throw new Error("Forbidden: driver or admin role required");
    }

    const { estado, bodyMd } = await lerConsentimento(db, userId);

    const { data: docs } = await db
      .from<{ id: string; kind: DocumentKind; uploaded_at: string }>("validation_documents")
      .select("id, kind, uploaded_at")
      .eq("subject_id", userId)
      .is("purged_at", null)
      .order("uploaded_at", { ascending: false });

    return {
      demonstracao: ESTADO_DE_DEMONSTRACAO,
      texto:
        estado.published && bodyMd
          ? {
              version: estado.published.version,
              textSha256: estado.published.textSha256,
              bodyMd,
              effectiveFrom: estado.published.effectiveFrom,
            }
          : null,
      situacao: consentStatus(estado),
      documentos: (docs ?? []).map((d) => ({
        id: d.id,
        kind: d.kind,
        uploadedAt: d.uploaded_at,
      })),
    };
  });

// ─────────────────────────────── aceite ────────────────────────────────────

const aceiteSchema = z.object({
  /** O que a tela exibiu. Conferido contra o publicado, nunca acreditado. */
  version: z.string().min(1).max(200),
  textSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const aceitarConsentimentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => aceiteSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ situacao: "current" }> => {
    conferirAmbienteSintetico(process.env);
    const { userId } = context;
    const db = comoClienteDeDocumentos(context.supabase);

    if (!(await papelDe(db, userId))) {
      throw new Error("Forbidden: driver or admin role required");
    }

    const { estado, bodyMd } = await lerConsentimento(db, userId);
    if (!estado.published || bodyMd === null) {
      throw new Error("Nao ha texto de consentimento publicado para esta finalidade");
    }

    // O hash gravado é o do corpo que o servidor tem, recalculado agora. O que
    // o cliente mandou serve para conferir que ele viu ESTE texto -- se a
    // publicação tiver mudado entre a exibição e o aceite, a divergência
    // aparece aqui em vez de virar um aceite de outra coisa.
    const recalculado = sha256Hex(bodyMd);
    if (recalculado !== estado.published.textSha256) {
      throw new Error("Texto publicado inconsistente: o corpo nao confere com o sha256 gravado");
    }
    if (data.version !== estado.published.version || data.textSha256 !== recalculado) {
      throw new Error("O texto exibido nao e o vigente; recarregue e leia a versao atual");
    }

    const { error } = await db.from("document_consents").insert({
      subject_id: userId,
      purpose: FINALIDADE,
      version: estado.published.version,
      text_sha256: recalculado,
    });
    if (error) throw new Error("Nao foi possivel registrar o aceite");

    return { situacao: "current" };
  });

// ──────────────────────────────── envio ────────────────────────────────────

const envioSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS as unknown as [DocumentKind, ...DocumentKind[]]),
  contentType: z.string().min(1).max(100),
  /** Teto generoso: o limite real é o dos bytes, conferido depois de decodificar. */
  conteudoBase64: z.string().min(1).max(10 * 1024 * 1024),
});

export type ResultadoDoEnvio =
  | { enviado: true; documentId: string; kind: DocumentKind }
  | { enviado: false; motivo: MotivoDeRecusa | "CONSENTIMENTO_AUSENTE" | "CONSENTIMENTO_DESATUALIZADO" | "CONSENTIMENTO_RETIRADO" | "FALHA_NO_REGISTRO"; detalhe: string };

export const enviarDocumentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => envioSchema.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoDoEnvio> => {
    conferirAmbienteSintetico(process.env);
    const { supabase, userId } = context;
    const db = comoClienteDeDocumentos(supabase);

    const papel = await papelDe(db, userId);
    if (!papel) throw new Error("Forbidden: driver or admin role required");

    // 1. Consentimento vigente, conferido AGORA.
    const { estado } = await lerConsentimento(db, userId);
    const situacao = consentStatus(estado);
    if (situacao !== "current") {
      const motivo =
        situacao === "withdrawn"
          ? ("CONSENTIMENTO_RETIRADO" as const)
          : situacao === "outdated"
            ? ("CONSENTIMENTO_DESATUALIZADO" as const)
            : ("CONSENTIMENTO_AUSENTE" as const);
      return { enviado: false, motivo, detalhe: `consentimento ${situacao}` };
    }

    // 2. Formato, tamanho, titularidade e finalidade.
    const bytes = new Uint8Array(Buffer.from(data.conteudoBase64, "base64"));
    const v = validarEnvio({
      purpose: FINALIDADE,
      kind: data.kind,
      subjectId: userId,
      actorId: userId,
      contentTypeDeclarado: data.contentType,
      bytes,
    });
    if (!v.aceito) return { enviado: false, motivo: v.motivo, detalhe: v.detalhe };

    // 3. Caminho e subida, com a sessão do titular.
    const documentId = randomUUID();
    const objectPath = montarCaminhoDoObjeto({
      purpose: FINALIDADE,
      subjectId: userId,
      kind: data.kind,
      documentId,
      extensao: v.extensao,
    });

    const { error: erroUp } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: v.formato, upsert: false });
    if (erroUp) {
      return { enviado: false, motivo: "FALHA_NO_REGISTRO", detalhe: "o objeto nao foi aceito" };
    }

    // 4. Registro e trilha, na mesma transação do banco.
    //
    //    O evento passa pela barreira de `audit.ts` antes de ir, embora a
    //    função do banco confira de novo: a barreira daqui recusa montar, a
    //    de lá recusa gravar, e nenhuma das duas confia na outra.
    buildDocumentAuditEvent({
      action: "upload",
      subjectId: userId,
      actorId: userId,
      actorRole: papel,
      purpose: FINALIDADE,
      kind: data.kind,
      objectPath,
      occurredAt: new Date().toISOString(),
    });

    const { error: erroRpc } = await db.rpc("registrar_envio_de_documento", {
      p_document_id: documentId,
      p_purpose: FINALIDADE,
      p_kind: data.kind,
      p_object_path: objectPath,
    });

    if (erroRpc) {
      // Compensação: objeto no bucket sem linha no registro é exatamente o
      // estado órfão que o expurgo não alcança, porque o expurgo varre o
      // registro. Melhor apagar agora, enquanto se sabe o caminho.
      await supabase.storage.from(BUCKET).remove([objectPath]);
      return {
        enviado: false,
        motivo: "FALHA_NO_REGISTRO",
        detalhe: "o registro foi recusado; o objeto foi removido",
      };
    }

    return { enviado: true, documentId, kind: data.kind };
  });

export { AmbienteNaoSinteticoError };
