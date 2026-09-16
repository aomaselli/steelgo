import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Modal, Select, Textarea } from "@/components/steel";
import {
  buildDisputeEvidencePath,
  detectEvidenceType,
  EVIDENCE_MAX_BYTES,
  sha256HexOfBuffer,
  type DisputeEvidenceKind,
  type EvidenceType,
} from "@/lib/sha256";
import { EVIDENCE_KIND } from "@/lib/disputeStatus";
import { newRequestId, rpcErrorMessage } from "@/lib/disputes";

interface Props {
  open: boolean;
  onClose: () => void;
  caseId: string;
  /** quando presente, a evidencia atende ESTE pedido (add_dispute_evidence_for_request) */
  evidenceRequestId?: string | null;
  /** quando presente, a evidencia complementa ESTA alegacao (add_dispute_evidence_for_claim) */
  claimId?: string | null;
  onDone: () => void;
}

type Attempt = {
  bytes: ArrayBuffer;
  type: EvidenceType;
  sha256: string;
  path: string;
  requestId: string;
  uploaded: boolean;
};

const FILE_KINDS: DisputeEvidenceKind[] = ["photo", "document", "invoice", "message", "other"];

/**
 * Evidencia de disputa. Sem arquivo: so descricao + hash declarado de um texto.
 * Com arquivo: magic bytes -> sha-256 no navegador -> upload UNICO (upsert:false)
 * em dispute-evidence -> RPC. Retry apos falha da RPC reutiliza objeto, hash e
 * request_id. O caminho nao carrega o uuid de quem envia.
 */
export function DisputeEvidenceModal({
  open,
  onClose,
  caseId,
  evidenceRequestId,
  claimId,
  onDone,
}: Props) {
  const attempt = useRef<Attempt | null>(null);
  const requestId = useRef<string | null>(null);
  const [kind, setKind] = useState<string>("photo");
  const [description, setDescription] = useState("");
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      attempt.current = null;
      requestId.current = null;
      setKind("photo");
      setDescription("");
      setFileLabel(null);
      setFileError(null);
      setError(null);
    }
  }, [open]);

  const withFile = FILE_KINDS.includes(kind as DisputeEvidenceKind);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    attempt.current = null;
    setFileLabel(null);
    setFileError(null);
    if (!f) return;
    if (f.size > EVIDENCE_MAX_BYTES) {
      setFileError("Arquivo acima de 10 MB.");
      return;
    }
    const bytes = await f.arrayBuffer();
    const type = detectEvidenceType(bytes);
    if (!type) {
      setFileError("Conteúdo não é PDF, JPEG nem PNG.");
      return;
    }
    const sha256 = await sha256HexOfBuffer(bytes);
    attempt.current = {
      bytes,
      type,
      sha256,
      path: buildDisputeEvidencePath({
        caseId,
        kind: kind as DisputeEvidenceKind,
        sha256,
        ext: type.ext,
        folderUuid: crypto.randomUUID(),
        objectUuid: crypto.randomUUID(),
      }),
      requestId: newRequestId(),
      uploaded: false,
    };
    setFileLabel(
      `${f.name} · ${type.mime} · ${(f.size / 1024).toFixed(0)} KB · sha-256 ${sha256.slice(0, 16)}…`,
    );
  }

  const canSubmit = !busy && description.trim().length > 0 && (!withFile || !!attempt.current);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      let ref: string | null = null;
      let hash: string;
      if (withFile && attempt.current) {
        const a = attempt.current;
        if (!a.uploaded) {
          const { error: upErr } = await supabase.storage
            .from("dispute-evidence")
            .upload(a.path, a.bytes, {
              contentType: a.type.mime,
              upsert: false,
              metadata: { sha256: a.sha256, case_id: caseId, kind },
            });
          if (upErr) throw new Error(`Upload recusado: ${upErr.message}`);
          a.uploaded = true;
        }
        ref = a.path;
        hash = a.sha256;
        requestId.current = a.requestId;
      } else {
        // sem arquivo: o hash declarado e o sha-256 do texto da descricao
        hash = await sha256HexOfBuffer(
          new TextEncoder().encode(`${caseId}|${kind}|${description.trim()}`),
        );
        if (requestId.current === null) requestId.current = newRequestId();
      }
      // p_artifact_ref nulo = evidencia sem arquivo; o tipo gerado nao e nullable, o JSON null e aceito pela RPC
      const common = {
        p_case_id: caseId,
        p_kind: kind,
        p_description: description.trim(),
        p_artifact_ref: ref as unknown as string,
        p_content_hash: hash,
        p_request_id: requestId.current,
      };
      const res = evidenceRequestId
        ? await supabase.rpc("add_dispute_evidence_for_request", {
            ...common,
            p_evidence_request_id: evidenceRequestId,
          })
        : claimId
          ? await supabase.rpc("add_dispute_evidence_for_claim", { ...common, p_claim_id: claimId })
          : await supabase.rpc("add_dispute_evidence", common);
      if (res.error) throw res.error;
      toast.success(
        evidenceRequestId ? "Evidência apresentada e pedido atendido." : "Evidência apresentada.",
      );
      onDone();
      onClose();
    } catch (e) {
      setError(`A evidência NÃO foi registrada. ${rpcErrorMessage(e)}`);
      toast.error("A evidência não foi registrada");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={evidenceRequestId ? "Atender pedido de evidência" : "Apresentar evidência"}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <label className="block text-sm text-graphite-100">
          Tipo
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              attempt.current = null;
              setFileLabel(null);
            }}
            disabled={busy}
            className="mt-1"
          >
            {Object.entries(EVIDENCE_KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm text-graphite-100">
          Descrição (obrigatória — visível à outra parte e à SteelGo)
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
          />
        </label>
        {withFile ? (
          <label className="block text-sm text-graphite-100">
            Arquivo (PDF, JPEG ou PNG, até 10 MB)
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={onPickFile}
              disabled={busy}
              className="mt-1 block w-full text-xs text-graphite-300"
            />
          </label>
        ) : (
          <p className="text-xs text-graphite-400">
            Checkpoint: evidência sem arquivo; descreva o registro (data, local, ocorrência).
          </p>
        )}
        {fileLabel && <p className="break-all font-mono text-xs text-graphite-400">{fileLabel}</p>}
        {fileError && (
          <p role="alert" className="text-xs text-red-400">
            {fileError}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-start gap-2 text-[11px] text-graphite-400">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Evidência apresentada é imutável: não pode ser alterada nem apagada por ninguém. O
            SHA-256 é calculado no seu navegador e declarado; a outra parte e a SteelGo podem
            recalculá-lo ao baixar. Se a confirmação falhar depois do upload, clique de novo — o
            mesmo arquivo é reutilizado.
          </span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Registrando…" : "Registrar evidência"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
