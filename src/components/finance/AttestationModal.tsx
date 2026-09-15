import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Input, Modal, Textarea } from "@/components/steel";
import { formatBRL } from "@/lib/steel";
import { ATTESTATION_NOTICE } from "@/lib/paymentStatus";
import {
  buildEvidencePath,
  detectEvidenceType,
  EVIDENCE_MAX_BYTES,
  sha256HexOfBuffer,
  type EvidenceType,
} from "@/lib/sha256";

export type AttestationKind = "funding" | "release";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: AttestationKind;
  contractId: string;
  contractNumber: string;
  transactionId: string; // transacao 'requested' que esta sendo confirmada
  amount: number;
  onDone: () => void; // refetch (sucesso, replay ou concorrencia)
}

/**
 * Estado de UMA tentativa de atestacao. Criado quando o arquivo e escolhido e
 * validado; preservado em retries. Objeto, hash, referencia e request_id so
 * mudam se o administrador trocar o arquivo. Nunca upsert.
 */
type Attempt = {
  file: File;
  bytes: ArrayBuffer;
  type: EvidenceType;
  sha256: string;
  objectUuid: string;
  requestId: string;
  evidenceRef: string;
  uploaded: boolean;
};

export function AttestationModal({
  open,
  onClose,
  kind,
  contractId,
  contractNumber,
  transactionId,
  amount,
  onDone,
}: Props) {
  const attempt = useRef<Attempt | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [externalRef, setExternalRef] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      attempt.current = null;
      setFileLabel(null);
      setFileError(null);
      setExternalRef("");
      setNote("");
      setChecked(false);
      setError(null);
    }
  }, [open]);

  const title =
    kind === "funding" ? "Atestar recebimento do aporte" : "Atestar repasse à transportadora";
  const rpc = kind === "funding" ? "confirm_escrow_funding" : "confirm_escrow_release";

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    attempt.current = null;
    setFileLabel(null);
    setFileError(null);
    setError(null);
    if (!f) return;
    if (f.size > EVIDENCE_MAX_BYTES) {
      setFileError("Arquivo acima de 10 MB. O bucket recusa e a atestação não seria registrada.");
      return;
    }
    const bytes = await f.arrayBuffer();
    const type = detectEvidenceType(bytes);
    if (!type) {
      setFileError("Conteúdo não é PDF, JPEG nem PNG (assinatura inicial do arquivo não confere).");
      return;
    }
    const sha256 = await sha256HexOfBuffer(bytes);
    const objectUuid = crypto.randomUUID();
    attempt.current = {
      file: f,
      bytes,
      type,
      sha256,
      objectUuid,
      requestId: crypto.randomUUID(),
      evidenceRef: buildEvidencePath({
        contractId,
        transactionId,
        kind,
        sha256,
        ext: type.ext,
        objectUuid,
      }),
      uploaded: false,
    };
    setFileLabel(
      `${f.name} · ${type.mime} · ${(f.size / 1024).toFixed(0)} KB · sha-256 ${sha256.slice(0, 16)}…`,
    );
  }

  const canSubmit =
    !!attempt.current &&
    externalRef.trim().length > 0 &&
    note.trim().length >= 10 &&
    checked &&
    !busy;

  async function submit() {
    const a = attempt.current;
    if (!a || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1. upload UMA vez por tentativa. Retry apos falha da RPC reutiliza o
      //    mesmo objeto, hash, referencia e request_id.
      if (!a.uploaded) {
        const { error: upErr } = await supabase.storage
          .from("payment-evidence")
          .upload(a.evidenceRef, a.bytes, {
            contentType: a.type.mime,
            upsert: false,
            metadata: {
              sha256: a.sha256,
              contract_id: contractId,
              transaction_id: transactionId,
              kind,
            },
          });
        if (upErr) {
          // 409 (nome ja existe) e improvavel com uuid aleatorio; descarta a tentativa
          if (/exists/i.test(upErr.message)) attempt.current = null;
          throw new Error(`Upload do comprovante recusado: ${upErr.message}`);
        }
        a.uploaded = true;
      }
      // 2. RPC. Nao ha UPDATE direto em tabela financeira.
      const { data, error: rpcErr } = await supabase.rpc(rpc, {
        p_contract_id: contractId,
        p_external_reference: externalRef.trim(),
        p_note: note.trim(),
        p_evidence_ref: a.evidenceRef,
        p_evidence_hash: a.sha256,
        p_request_id: a.requestId,
      });
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("A RPC não devolveu resultado.");
      if (row.was_replayed) {
        toast.success("Atestação já estava registrada (replay idempotente).");
      } else if (kind === "release" && "contract_completed" in row && row.contract_completed) {
        toast.success(
          "Repasse atestado. Entrega já concluída: contrato CONCLUÍDO nesta transação.",
        );
      } else {
        toast.success(
          kind === "funding"
            ? "Aporte atestado pela SteelGo."
            : "Repasse atestado. Contrato segue ativo até a entrega.",
        );
      }
      onDone();
      onClose();
    } catch (e) {
      const detail = (e as { message?: string })?.message ?? "erro desconhecido";
      // Concorrencia (22023/40001) ou estado ja mudado: a tela refaz a leitura.
      setError(`A atestação NÃO foi registrada. ${detail}`);
      toast.error("A atestação não foi registrada");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex gap-2">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <p className="text-xs text-amber-200">{ATTESTATION_NOTICE}</p>
        </div>

        <div className="rounded-[12px] bg-bg-elevated p-3 text-sm text-graphite-200 space-y-1">
          <div className="flex justify-between">
            <span>Contrato</span>
            <span className="font-mono text-graphite-50">{contractNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Transação pendente</span>
            <span className="font-mono text-xs text-graphite-50">{transactionId.slice(0, 8)}…</span>
          </div>
          <div className="flex justify-between">
            <span>
              {kind === "funding" ? "Valor aportado (bruto)" : "Valor a repassar (bruto)"}
            </span>
            <span className="font-semibold tabular-nums text-graphite-50">{formatBRL(amount)}</span>
          </div>
        </div>

        <label className="block text-sm text-graphite-100">
          Comprovante (PDF, JPEG ou PNG, até 10 MB)
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={onPickFile}
            disabled={busy}
            className="mt-1 block w-full text-xs text-graphite-300"
          />
        </label>
        {fileLabel && <p className="text-xs text-graphite-400 font-mono break-all">{fileLabel}</p>}
        {fileError && (
          <p role="alert" className="text-xs text-red-400">
            {fileError}
          </p>
        )}

        <label className="block text-sm text-graphite-100">
          Referência externa (id da TED/PIX, número do lançamento)
          <Input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            disabled={busy}
            placeholder="ex.: TED-2026-000123"
            className="mt-1"
          />
        </label>
        <label className="block text-sm text-graphite-100">
          Nota da atestação (mínimo 10 caracteres — fica na trilha)
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
            placeholder="O que foi conferido, onde e por quem."
          />
        </label>

        <label className="flex items-start gap-2 text-sm text-graphite-100 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            Declaro que verifiquei o comprovante e que o valor confere. Esta é uma atestação humana,
            registrada em meu nome.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-start gap-2 text-[11px] text-graphite-400">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Se a confirmação falhar depois do upload, clique de novo: o mesmo comprovante, hash e
            identificador de pedido são reutilizados (sem novo upload, sem duplicidade).
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="green" onClick={submit} disabled={!canSubmit}>
            {busy
              ? "Registrando…"
              : kind === "funding"
                ? "Registrar atestação do aporte"
                : "Registrar atestação do repasse"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
