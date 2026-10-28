/**
 * Revisão documental — tela do revisor.
 *
 * Três coisas que a tela precisa deixar impossíveis de confundir:
 *
 *   1. o documento aparece porque a autorização foi conferida AGORA, não
 *      porque alguém abriu a tela há dez minutos;
 *   2. o que se registra é observação, divergência ou pedido de novo envio —
 *      não existe botão de aprovar, e a ausência é a decisão;
 *   3. a revisão desta fase é sobre DEMONSTRAÇÃO, e fica registrada como tal.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileSearch, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  lerDocumentoFn,
  listarParaRevisaoFn,
  listarRevisoesFn,
  registrarRevisaoFn,
} from "@/server/documents/revisao.fn";
import { TIPOS_DE_REVISAO, type TipoDeRevisao } from "@/server/documents/leitura";

export const Route = createFileRoute("/admin/validacao-documental")({ component: RevisaoPage });

const ROTULO_DO_TIPO: Record<TipoDeRevisao, string> = {
  observacao: "Observação",
  divergencia: "Divergência",
  novo_envio_solicitado: "Pedir novo envio",
};

const MOTIVO: Record<string, string> = {
  SESSAO_EXPIRADA: "Sessão expirada. Entre de novo.",
  SEM_PERMISSAO: "Seu papel não alcança este documento.",
  CONSENTIMENTO_NAO_VIGENTE: "O consentimento do titular não está vigente.",
  DOCUMENTO_INEXISTENTE: "Documento inexistente ou já expurgado.",
  ARQUIVO_AUSENTE: "O registro existe, o arquivo não. Avise o suporte.",
  SERVICO_INDISPONIVEL: "Serviço indisponível. Tente de novo em instantes.",
  NOTA_INVALIDA: "A nota foi recusada.",
  TIPO_NAO_PREVISTO: "Tipo de revisão não previsto.",
};

function RevisaoPage() {
  const [aberto, setAberto] = useState<string | null>(null);

  const fila = useQuery({
    queryKey: ["fila-de-revisao"],
    queryFn: () => listarParaRevisaoFn(),
    retry: false,
  });

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-[20px] font-medium text-graphite-50">Revisão documental</h1>

      <div
        className="mt-3 rounded-[14px] p-3.5 flex items-start gap-2.5"
        style={{ background: "#1F1500", border: "1px solid #CC8800" }}
      >
        <ShieldAlert size={22} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[13px] text-amber-400">
          Revisão de <strong>demonstração</strong>, sobre documentos sintéticos.
          <div className="text-[12px] text-graphite-200 mt-1">
            A revisão registra observação, divergência ou pedido de novo envio. Ela{" "}
            <strong>não aprova</strong> cadastro, não libera viagem e não substitui identidade,
            habilitação ou biometria por decisão manual.
          </div>
        </div>
      </div>

      {fila.isLoading && (
        <div className="mt-4 text-[13px] text-graphite-200 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}

      {fila.isError && (
        <div
          className="mt-4 rounded-[14px] p-3.5 flex items-start gap-2.5"
          style={{ background: "#2A1215", border: "1px solid #B3353F" }}
        >
          <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-[13px] text-red-300">{(fila.error as Error).message}</div>
        </div>
      )}

      {fila.data?.length === 0 && (
        <div className="mt-4 text-[13px] text-graphite-200">Nenhum documento registrado.</div>
      )}

      <ul className="mt-4 space-y-2">
        {(fila.data ?? []).map((d) => (
          <li key={d.id} className="rounded-[14px] bg-bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] text-graphite-50">{d.kind}</div>
                <div className="text-[12px] text-graphite-200">
                  {new Date(d.uploadedAt).toLocaleString("pt-BR")} · titular{" "}
                  {d.subjectRef.slice(0, 8)}… · {d.revisoes} revisão(ões)
                </div>
              </div>
              <button
                onClick={() => setAberto(aberto === d.id ? null : d.id)}
                className="rounded-[10px] px-3 py-1.5 text-[13px] shrink-0"
                style={{ background: "#0D2744", border: "1px solid #1B6CB8", color: "#79B8F8" }}
              >
                {aberto === d.id ? "Fechar" : "Abrir"}
              </button>
            </div>

            {aberto === d.id && <Documento documentId={d.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Documento({ documentId }: { documentId: string }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoDeRevisao>("observacao");
  const [nota, setNota] = useState("");

  // A leitura é um POST: cada abertura reconfere a autorização e deixa um
  // evento de acesso. Não há cache, por isso `staleTime` zero e `gcTime` curto.
  const documento = useQuery({
    queryKey: ["documento", documentId],
    queryFn: () => lerDocumentoFn({ data: { documentId } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const revisoes = useQuery({
    queryKey: ["revisoes", documentId],
    queryFn: () => listarRevisoesFn({ data: { documentId } }),
    retry: false,
  });

  const registrar = useMutation({
    mutationFn: () => registrarRevisaoFn({ data: { documentId, tipo, nota: nota || undefined } }),
    onSuccess: (r) => {
      if (r.registrada) {
        toast.success("Revisão registrada (demonstração)");
        setNota("");
        qc.invalidateQueries({ queryKey: ["revisoes", documentId] });
        qc.invalidateQueries({ queryKey: ["fila-de-revisao"] });
      } else {
        toast.error(MOTIVO[r.motivo] ?? r.detalhe);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = documento.data;

  return (
    <div className="mt-3 border-t border-graphite-800 pt-3">
      {documento.isLoading && (
        <div className="text-[13px] text-graphite-200 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Abrindo…
        </div>
      )}

      {d && !d.ok && <div className="text-[13px] text-amber-400">{MOTIVO[d.motivo]}</div>}

      {d?.ok && (
        <>
          <img
            src={`data:${d.contentType};base64,${d.conteudoBase64}`}
            alt="documento de validação"
            className="rounded-[10px] max-h-80"
          />
          <div className="text-[11px] text-graphite-400 mt-1 flex items-center gap-1">
            <FileSearch size={12} />
            Servido por rota autenticada, sem URL assinada. Esta abertura ficou na trilha.
          </div>
        </>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {TIPOS_DE_REVISAO.map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className="rounded-[10px] py-2 text-[12px]"
            style={{
              background: tipo === t ? "#0D2744" : "#21262D",
              border: `1px solid ${tipo === t ? "#1B6CB8" : "#30363D"}`,
              color: tipo === t ? "#79B8F8" : "#C9D1D9",
            }}
          >
            {ROTULO_DO_TIPO[t]}
          </button>
        ))}
      </div>

      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Observação (sem CPF, sem link, sem credencial)"
        rows={2}
        className="mt-2 w-full rounded-[10px] p-2 text-[13px] bg-bg-base text-graphite-50"
        style={{ border: "1px solid #30363D" }}
      />

      <button
        onClick={() => registrar.mutate()}
        disabled={registrar.isPending}
        className="mt-2 w-full rounded-[10px] py-2 text-[13px] disabled:opacity-60"
        style={{ background: "#0D2744", border: "1px solid #1B6CB8", color: "#79B8F8" }}
      >
        {registrar.isPending ? "Registrando…" : "Registrar revisão"}
      </button>

      {(revisoes.data ?? []).length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {(revisoes.data ?? []).map((r) => (
            <li key={r.id} className="text-[12px] text-graphite-200">
              <span className="text-graphite-100">{ROTULO_DO_TIPO[r.tipo] ?? r.tipo}</span> ·{" "}
              {r.contexto} · {new Date(r.createdAt).toLocaleString("pt-BR")}
              {r.nota && <div className="text-graphite-300">{r.nota}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
