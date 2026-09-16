import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/disputes";
import { Button, Input, Modal, Textarea } from "@/components/steel";
import { ATTESTATION_NOTICE } from "@/lib/paymentStatus";
import {
  buildEvidencePath,
  detectEvidenceType,
  EVIDENCE_MAX_BYTES,
  sha256HexOfBuffer,
  type EvidenceType,
  type FinancialEvidenceKind,
} from "@/lib/sha256";

type SettlementKind = Exclude<FinancialEvidenceKind, "funding">;

interface Props {
  open: boolean;
  onClose: () => void;
  /** refund | release: transacao da liquidacao de disputa; recovery: obrigacao de recuperacao */
  kind: SettlementKind;
  contractId: string;
  contractNumber: string;
  /** id da transacao (refund/release) ou da obrigacao (recovery): segundo segmento do caminho */
  subjectId: string;
  amount: number;
  subtitle: string;
  onDone: () => void;
}

type Attempt = {
  bytes: ArrayBuffer;
  type: EvidenceType;
  sha256: string;
  requestId: string;
  evidenceRef: string;
  uploaded: boolean;
};

const TITLE: Record<SettlementKind, string> = {
  refund: "Atestar devolução ao embarcador",
  release: "Atestar repasse à transportadora (liquidação)",
  recovery: "Atestar recuperação de valor já repassado",
};

/**
 * Atestacao das operacoes financeiras do Modulo 2 (liquidacao e recuperacao),
 * com o MESMO padrao do Modulo 1: magic bytes -> sha-256 no navegador -> upload
 * unico em payment-evidence (upsert:false) -> RPC. Retry reutiliza tudo.
 */
export function FinancialAttestationModal({
  open,
  onClose,
  kind,
  contractId,
  contractNumber,
  subjectId,
  amount,
  subtitle,
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

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    attempt.current = null;
    setFileLabel(null);
    setFileError(null);
    setError(null);
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
      requestId: crypto.randomUUID(),
      evidenceRef: buildEvidencePath({
        contractId,
        transactionId: subjectId,
        kind,
        sha256,
        ext: type.ext,
        objectUuid: crypto.randomUUID(),
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
      if (!a.uploaded) {
        const { error: upErr } = await supabase.storage
          .from("payment-evidence")
          .upload(a.evidenceRef, a.bytes, {
            contentType: a.type.mime,
            upsert: false,
            metadata: { sha256: a.sha256, contract_id: contractId, subject_id: subjectId, kind },
          });
        if (upErr) throw new Error(`Upload do comprovante recusado: ${upErr.message}`);
        a.uploaded = true;
      }
      const res =
        kind === "recovery"
          ? await supabase.rpc("confirm_dispute_recovery", {
              p_recovery_id: subjectId,
              p_external_reference: externalRef.trim(),
              p_note: note.trim(),
              p_evidence_ref: a.evidenceRef,
              p_evidence_hash: a.sha256,
              p_request_id: a.requestId,
            })
          : await supabase.rpc("confirm_dispute_settlement", {
              p_contract_id: contractId,
              p_transaction_id: subjectId,
              p_external_reference: externalRef.trim(),
              p_note: note.trim(),
              p_evidence_ref: a.evidenceRef,
              p_evidence_hash: a.sha256,
              p_request_id: a.requestId,
            });
      if (res.error) throw res.error;
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!row) throw new Error("A RPC não devolveu resultado.");
      if (row.was_replayed) toast.success("Atestação já estava registrada (replay idempotente).");
      else if (kind === "recovery")
        toast.success(
          (row as { all_recoveries_closed?: boolean }).all_recoveries_closed
            ? "Recuperação confirmada. Todas as obrigações do caso estão encerradas."
            : "Recuperação confirmada. Ainda há obrigação pendente.",
        );
      else
        toast.success(
          (row as { settlement_complete?: boolean }).settlement_complete
            ? "Liquidação CONFIRMADA integralmente."
            : "Transação atestada. A liquidação ainda tem transação pendente.",
        );
      onDone();
      onClose();
    } catch (e) {
      setError(
        `A atestação NÃO foi registrada. ${(e as { message?: string })?.message ?? "erro desconhecido"}`,
      );
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
      title={TITLE[kind]}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200">{ATTESTATION_NOTICE}</p>
        </div>
        <div className="space-y-1 rounded-[12px] bg-bg-elevated p-3 text-sm text-graphite-200">
          <div className="flex justify-between">
            <span>Contrato</span>
            <span className="font-mono text-graphite-50">{contractNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>{subtitle}</span>
            <span className="font-mono text-xs text-graphite-50">{subjectId.slice(0, 8)}…</span>
          </div>
          <div className="flex justify-between">
            <span>Valor</span>
            <span className="font-semibold tabular-nums text-graphite-50">{brl(amount)}</span>
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
        {fileLabel && <p className="break-all font-mono text-xs text-graphite-400">{fileLabel}</p>}
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
          />
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-graphite-100">
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
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Se a confirmação falhar depois do upload, clique de novo: o mesmo comprovante, hash e
            identificador de pedido são reutilizados.
          </span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="green" onClick={submit} disabled={!canSubmit}>
            {busy ? "Registrando…" : "Registrar atestação"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
