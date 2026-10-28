/**
 * Validação de identidade — consentimento e envio.
 *
 * Tela do fluxo SINTÉTICO. Dois pontos que ela precisa dizer o tempo todo, e
 * não só no rodapé:
 *
 *   1. o que está em curso é coleta de documento em ambiente de demonstração;
 *   2. nada aqui aprova cadastro nem libera viagem.
 *
 * O aviso fica fixo no topo de propósito. Banner que some depois de alguns
 * segundos é banner que ninguém viu.
 */

import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { DriverShell } from "@/components/driver/DriverShell";
import {
  aceitarConsentimentoFn,
  enviarDocumentoFn,
  obterEstadoDoFluxoFn,
} from "@/server/documents/fluxo.fn";
import type { DocumentKind } from "@/server/documents/types";

export const Route = createFileRoute("/driver/validacao")({ component: ValidacaoPage });

const ESPECIES: Array<{ kind: DocumentKind; rotulo: string }> = [
  { kind: "cnh_front", rotulo: "CNH — frente" },
  { kind: "cnh_back", rotulo: "CNH — verso" },
  { kind: "selfie", rotulo: "Selfie" },
];

const RECUSA: Record<string, string> = {
  FINALIDADE_INVALIDA: "Finalidade não prevista.",
  ESPECIE_INVALIDA: "Espécie de documento não prevista.",
  NAO_E_TITULAR: "Este envio não pertence a você.",
  ARQUIVO_VAZIO: "O arquivo está vazio.",
  ARQUIVO_GRANDE_DEMAIS: "O arquivo passa de 5 MB.",
  FORMATO_NAO_RECONHECIDO: "O arquivo não é JPEG nem PNG.",
  FORMATO_DIVERGE_DO_DECLARADO: "O conteúdo não confere com o tipo declarado.",
  CONSENTIMENTO_AUSENTE: "Aceite o termo antes de enviar.",
  CONSENTIMENTO_DESATUALIZADO: "O termo mudou. Leia e aceite a versão vigente.",
  CONSENTIMENTO_RETIRADO: "O consentimento foi retirado.",
  FALHA_NO_REGISTRO: "O envio não foi registrado. Nada ficou guardado.",
  OBJETO_SEM_REGISTRO:
    "O envio não foi registrado e o arquivo não pôde ser removido. Avise o suporte.",
};

function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onerror = () => erro(new Error("não foi possível ler o arquivo"));
    fr.onload = () => {
      const r = String(fr.result ?? "");
      ok(r.slice(r.indexOf(",") + 1));
    };
    fr.readAsDataURL(arquivo);
  });
}

function ValidacaoPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [especie, setEspecie] = useState<DocumentKind>("cnh_front");

  const estado = useQuery({
    queryKey: ["fluxo-validacao"],
    queryFn: () => obterEstadoDoFluxoFn(),
    retry: false,
  });

  const aceitar = useMutation({
    mutationFn: async () => {
      const t = estado.data?.texto;
      if (!t) throw new Error("não há termo publicado");
      return aceitarConsentimentoFn({ data: { version: t.version, textSha256: t.textSha256 } });
    },
    onSuccess: () => {
      toast.success("Termo aceito");
      qc.invalidateQueries({ queryKey: ["fluxo-validacao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      const conteudoBase64 = await lerComoBase64(arquivo);
      return enviarDocumentoFn({
        data: { kind: especie, contentType: arquivo.type, conteudoBase64 },
      });
    },
    onSuccess: (r) => {
      if (r.enviado) {
        toast.success("Documento registrado — ambiente de demonstração");
        qc.invalidateQueries({ queryKey: ["fluxo-validacao"] });
      } else {
        toast.error(RECUSA[r.motivo] ?? "Envio recusado.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aoEscolher = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) enviar.mutate(f);
    },
    [enviar],
  );

  const d = estado.data;
  const podeEnviar = d?.situacao === "current";

  return (
    <DriverShell activeTab="docs">
      <header className="px-4 pt-5 pb-3">
        <h1 className="text-[18px] font-medium text-graphite-50">Validação de identidade</h1>
      </header>

      {/* Aviso fixo. Não some, não fecha. */}
      <div
        className="mx-4 rounded-[14px] p-3.5 flex items-start gap-2.5"
        style={{ background: "#1F1500", border: "1px solid #CC8800" }}
      >
        <ShieldAlert size={24} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <div className="text-[13px] text-amber-400 font-medium">
            Ambiente de demonstração — dados sintéticos
          </div>
          <ul className="text-[12px] text-graphite-200 mt-1 space-y-0.5">
            {(d?.demonstracao.naoFaz ?? [
              "nao consulta base oficial",
              "nao aprova cadastro",
              "nao libera viagem",
            ]).map((linha) => (
              <li key={linha}>· {linha}</li>
            ))}
          </ul>
        </div>
      </div>

      {estado.isLoading && (
        <div className="mx-4 mt-4 text-[13px] text-graphite-200 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}

      {estado.isError && (
        <div
          className="mx-4 mt-4 rounded-[14px] p-3.5 flex items-start gap-2.5"
          style={{ background: "#2A1215", border: "1px solid #B3353F" }}
        >
          <AlertTriangle size={22} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-[13px] text-red-300">{(estado.error as Error).message}</div>
        </div>
      )}

      {d && (
        <>
          {/* Termo */}
          <section className="mx-4 mt-4 rounded-[14px] bg-bg-surface p-4">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-graphite-200" />
              <h2 className="text-[15px] text-graphite-50">Termo de consentimento</h2>
            </div>

            {!d.texto && (
              <p className="text-[13px] text-graphite-200 mt-2">
                Nenhum termo publicado para esta finalidade. Sem termo não há coleta.
              </p>
            )}

            {d.texto && (
              <>
                <div className="text-[12px] text-graphite-200 mt-1">
                  versão {d.texto.version} · sha256 {d.texto.textSha256.slice(0, 12)}…
                </div>
                <pre className="text-[12px] text-graphite-100 whitespace-pre-wrap mt-3 max-h-56 overflow-auto">
                  {d.texto.bodyMd}
                </pre>

                {d.situacao === "current" ? (
                  <div className="mt-3 text-[13px] text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={16} /> Aceite vigente para esta versão
                  </div>
                ) : (
                  <>
                    {d.situacao === "outdated" && (
                      <div className="mt-3 text-[12px] text-amber-400">
                        O termo mudou desde o seu aceite anterior.
                      </div>
                    )}
                    {d.situacao === "withdrawn" && (
                      <div className="mt-3 text-[12px] text-amber-400">
                        Você retirou o consentimento. Aceitar de novo registra um novo aceite.
                      </div>
                    )}
                    <button
                      onClick={() => aceitar.mutate()}
                      disabled={aceitar.isPending}
                      className="mt-3 w-full rounded-[10px] py-2.5 text-[14px] disabled:opacity-60"
                      style={{ background: "#0D2744", border: "1px solid #1B6CB8", color: "#79B8F8" }}
                    >
                      {aceitar.isPending ? "Registrando…" : "Li e aceito esta versão"}
                    </button>
                  </>
                )}
              </>
            )}
          </section>

          {/* Envio */}
          <section className="mx-4 mt-4 rounded-[14px] bg-bg-surface p-4">
            <h2 className="text-[15px] text-graphite-50">Enviar documento</h2>
            <div className="text-[12px] text-graphite-200 mt-1">JPEG ou PNG, até 5 MB.</div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              {ESPECIES.map((e) => (
                <button
                  key={e.kind}
                  onClick={() => setEspecie(e.kind)}
                  className="rounded-[10px] py-2 text-[12px]"
                  style={{
                    background: especie === e.kind ? "#0D2744" : "#21262D",
                    border: `1px solid ${especie === e.kind ? "#1B6CB8" : "#30363D"}`,
                    color: especie === e.kind ? "#79B8F8" : "#C9D1D9",
                  }}
                >
                  {e.rotulo}
                </button>
              ))}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={aoEscolher}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={!podeEnviar || enviar.isPending}
              className="mt-3 w-full rounded-[14px] p-6 flex flex-col items-center disabled:opacity-50"
              style={{ background: "#21262D", border: "2px dashed #30363D" }}
            >
              {enviar.isPending ? (
                <Loader2 size={30} className="text-graphite-200 animate-spin" />
              ) : (
                <Camera size={30} className="text-graphite-200" />
              )}
              <div className="text-[14px] text-graphite-50 mt-2">
                {enviar.isPending ? "Enviando…" : "Escolher arquivo"}
              </div>
              {!podeEnviar && (
                <div className="text-[12px] text-amber-400 mt-1">Aceite o termo primeiro</div>
              )}
            </button>
          </section>

          {/* Enviados */}
          <section className="mx-4 mt-4 mb-6 rounded-[14px] bg-bg-surface p-4">
            <h2 className="text-[15px] text-graphite-50">Enviados</h2>
            {d.documentos.length === 0 ? (
              <div className="text-[13px] text-graphite-200 mt-2">Nenhum documento registrado.</div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {d.documentos.map((doc) => (
                  <li key={doc.id} className="text-[13px] text-graphite-100 flex justify-between">
                    <span>{ESPECIES.find((e) => e.kind === doc.kind)?.rotulo ?? doc.kind}</span>
                    <span className="text-graphite-200">
                      {new Date(doc.uploadedAt).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-[12px] text-graphite-200 mt-3">
              A visualização do documento será por rota autenticada, com autorização revalidada a
              cada leitura. Ela não faz parte desta etapa.
            </div>
          </section>
        </>
      )}
    </DriverShell>
  );
}
