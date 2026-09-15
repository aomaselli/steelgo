import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, Input, Modal, Select, Textarea } from "@/components/steel";
import { formatBRL } from "@/lib/steel";
import { FAILURE_CODES, type FailureCode } from "@/lib/paymentStatus";
import type { ReconciliationRow } from "@/lib/paymentLedger";

// Modais de acao administrativa. Regras comuns:
//   * request_id em useRef, cunhado uma vez por abertura e reutilizado em
//     retry (replay idempotente no servidor);
//   * busy bloqueia clique duplo;
//   * NENHUM toast de sucesso sem verificar o retorno da RPC; erro mostra a
//     mensagem do servidor e forca refetch (concorrencia);
//   * nenhuma escrita direta em tabela financeira.

function useRequestId(open: boolean) {
  const ref = useRef<string | null>(null);
  useEffect(() => {
    if (open) ref.current = crypto.randomUUID();
    else ref.current = null;
  }, [open]);
  return ref;
}

// ---------------------------------------------------------------------------
// FALHA
// ---------------------------------------------------------------------------
export function PaymentFailureModal({
  open,
  onClose,
  contractId,
  contractNumber,
  stage,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractNumber: string;
  stage: "funding" | "release";
  onDone: () => void;
}) {
  const requestId = useRequestId(open);
  const [code, setCode] = useState<FailureCode>("provider_rejected");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setCode("provider_rejected");
      setReason("");
      setError(null);
    }
  }, [open]);
  const minLen = code === "other" ? 20 : 10;
  const canSubmit = reason.trim().length >= minLen && !busy;

  async function submit() {
    if (!canSubmit || !requestId.current) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("fail_payment_transaction", {
      p_contract_id: contractId,
      p_failure_code: code,
      p_failure_reason: reason.trim(),
      p_request_id: requestId.current,
    });
    setBusy(false);
    if (rpcErr) {
      setError(`A falha NÃO foi registrada. ${rpcErr.message}`);
      toast.error("A falha não foi registrada");
      onDone();
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(
      row?.was_replayed
        ? "Falha já estava registrada."
        : "Falha registrada. A solicitação pode ser refeita pela ação “Refazer solicitação”.",
    );
    onDone();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={`Registrar falha — ${stage === "funding" ? "aporte" : "liberação"}`}
    >
      <div className="space-y-4">
        <p className="text-sm text-graphite-200">
          Contrato <span className="font-mono text-graphite-50">{contractNumber}</span>. A
          solicitação pendente será marcada como falhada e preservada na trilha; nada é apagado.
        </p>
        <label className="block text-sm text-graphite-100">
          Código da falha
          <Select
            value={code}
            onChange={(e) => setCode(e.target.value as FailureCode)}
            disabled={busy}
            className="mt-1"
          >
            {FAILURE_CODES.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm text-graphite-100">
          Motivo (mínimo {minLen} caracteres{code === "other" ? " — descreva claramente" : ""})
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={submit} disabled={!canSubmit}>
            {busy ? "Registrando…" : "Registrar falha"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RETRY
// ---------------------------------------------------------------------------
export function RetryPaymentModal({
  open,
  onClose,
  contractId,
  contractNumber,
  failedKind,
  amount,
  blockedByDispute,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractNumber: string;
  failedKind: string | null;
  amount: number;
  blockedByDispute: boolean;
  onDone: () => void;
}) {
  const requestId = useRequestId(open);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setNote("");
      setError(null);
    }
  }, [open]);
  const canSubmit =
    note.trim().length >= 10 && !busy && !(failedKind === "release" && blockedByDispute);

  async function submit() {
    if (!canSubmit || !requestId.current) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("retry_failed_payment_transaction", {
      p_contract_id: contractId,
      p_note: note.trim(),
      p_request_id: requestId.current,
    });
    setBusy(false);
    if (rpcErr) {
      setError(`A solicitação NÃO foi refeita. ${rpcErr.message}`);
      toast.error("A solicitação não foi refeita");
      onDone();
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(
      row?.was_replayed
        ? "Solicitação já havia sido refeita."
        : `Nova solicitação de ${row?.retried_kind === "release" ? "liberação" : "aporte"} registrada. Aguardando confirmação.`,
    );
    onDone();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Refazer solicitação após falha"
    >
      <div className="space-y-4">
        <p className="text-sm text-graphite-200">
          Contrato <span className="font-mono text-graphite-50">{contractNumber}</span> ·{" "}
          {formatBRL(amount)}. A etapa a refazer (
          {failedKind === "release" ? "liberação" : "aporte"}) é derivada no servidor a partir da
          transação falhada, que permanece intacta na trilha.
        </p>
        {failedKind === "release" && blockedByDispute && (
          <p role="alert" className="text-sm text-red-400">
            Liberação suspensa por disputa aberta. O servidor recusa o retry até a disputa ser
            resolvida.
          </p>
        )}
        <label className="block text-sm text-graphite-100">
          Nota (mínimo 10 caracteres — o que mudou para tentar de novo)
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Registrando…" : "Refazer solicitação"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RECONCILIACAO: abrir
// ---------------------------------------------------------------------------
export function OpenReconciliationModal({
  open,
  onClose,
  contractId,
  contractNumber,
  expectedAmount,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractNumber: string;
  expectedAmount: number;
  onDone: () => void;
}) {
  const requestId = useRequestId(open);
  const [source, setSource] = useState<"manual_review" | "bank_statement">("manual_review");
  const [note, setNote] = useState("");
  const [observed, setObserved] = useState("");
  const [statementRef, setStatementRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSource("manual_review");
      setNote("");
      setObserved("");
      setStatementRef("");
      setError(null);
    }
  }, [open]);
  const observedNum = observed.trim() === "" ? undefined : Number(observed.replace(",", "."));
  const canSubmit =
    note.trim().length >= 10 &&
    !busy &&
    (observedNum === undefined || (Number.isFinite(observedNum) && observedNum >= 0));

  async function submit() {
    if (!canSubmit || !requestId.current) return;
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("open_payment_reconciliation", {
      p_contract_id: contractId,
      p_source: source,
      p_note: note.trim(),
      p_expected_amount: expectedAmount,
      p_request_id: requestId.current,
      ...(observedNum !== undefined ? { p_observed_amount: observedNum } : {}),
      ...(statementRef.trim() ? { p_statement_ref: statementRef.trim() } : {}),
    });
    setBusy(false);
    if (rpcErr) {
      setError(`A reconciliação NÃO foi aberta. ${rpcErr.message}`);
      toast.error("A reconciliação não foi aberta");
      onDone();
      return;
    }
    toast.success("Reconciliação aberta. O pagamento fica pausado até a resolução.");
    onDone();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Abrir reconciliação manual"
    >
      <div className="space-y-4">
        <p className="text-sm text-graphite-200">
          Contrato <span className="font-mono text-graphite-50">{contractNumber}</span> · valor
          esperado {formatBRL(expectedAmount)}. Enquanto houver reconciliação pendente, o pagamento
          fica em “Em reconciliação” e nenhuma confirmação é aceita.
        </p>
        <label className="block text-sm text-graphite-100">
          Origem
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as "manual_review" | "bank_statement")}
            disabled={busy}
            className="mt-1"
          >
            <option value="manual_review">Revisão manual</option>
            <option value="bank_statement">Extrato bancário</option>
          </Select>
        </label>
        <label className="block text-sm text-graphite-100">
          Valor observado (opcional)
          <Input
            value={observed}
            onChange={(e) => setObserved(e.target.value)}
            disabled={busy}
            inputMode="decimal"
            placeholder="ex.: 950,00"
            className="mt-1"
          />
        </label>
        <label className="block text-sm text-graphite-100">
          Referência do extrato/lançamento (opcional)
          <Input
            value={statementRef}
            onChange={(e) => setStatementRef(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </label>
        <label className="block text-sm text-graphite-100">
          Motivo (mínimo 10 caracteres)
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="amber" onClick={submit} disabled={!canSubmit}>
            {busy ? "Abrindo…" : "Abrir reconciliação"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RECONCILIACAO: resolver
// ---------------------------------------------------------------------------
export function ResolveReconciliationModal({
  open,
  onClose,
  reconciliation,
  contractNumber,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  reconciliation: ReconciliationRow | null;
  contractNumber: string;
  onDone: () => void;
}) {
  const requestId = useRequestId(open);
  const [status, setStatus] = useState<"matched" | "mismatch" | "written_off">("matched");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setStatus("matched");
      setNote("");
      setError(null);
    }
  }, [open]);
  const canSubmit = !!reconciliation && note.trim().length >= 10 && !busy;

  async function submit() {
    if (!canSubmit || !requestId.current || !reconciliation) return;
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("resolve_payment_reconciliation", {
      p_reconciliation_id: reconciliation.id,
      p_status: status,
      p_note: note.trim(),
      p_request_id: requestId.current,
    });
    setBusy(false);
    if (rpcErr) {
      setError(`A reconciliação NÃO foi resolvida. ${rpcErr.message}`);
      toast.error("A reconciliação não foi resolvida");
      onDone();
      return;
    }
    toast.success(
      "Reconciliação resolvida. O estado anterior do pagamento foi restaurado (nada foi confirmado por esta ação).",
    );
    onDone();
    onClose();
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title="Resolver reconciliação">
      <div className="space-y-4">
        {reconciliation && (
          <div className="rounded-[12px] bg-bg-elevated p-3 text-sm text-graphite-200 space-y-1">
            <div className="flex justify-between">
              <span>Contrato</span>
              <span className="font-mono text-graphite-50">{contractNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Origem</span>
              <span className="text-graphite-50">{reconciliation.source}</span>
            </div>
            <div className="flex justify-between">
              <span>Esperado / observado</span>
              <span className="tabular-nums text-graphite-50">
                {formatBRL(Number(reconciliation.expected_amount))} /{" "}
                {reconciliation.observed_amount == null
                  ? "—"
                  : formatBRL(Number(reconciliation.observed_amount))}
              </span>
            </div>
            {reconciliation.statement_ref && (
              <div className="flex justify-between">
                <span>Referência</span>
                <span className="font-mono text-xs text-graphite-50">
                  {reconciliation.statement_ref}
                </span>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-graphite-400">
          Resolver <strong>não confirma dinheiro</strong>: restaura o estado anterior do pagamento.
          Em <em>mismatch</em> sobre solicitação pendente, a solicitação é marcada como falhada e
          pode ser refeita. Um pagamento já repassado nunca regride.
        </p>
        <label className="block text-sm text-graphite-100">
          Resultado
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            disabled={busy}
            className="mt-1"
          >
            <option value="matched">Confere (matched)</option>
            <option value="mismatch">Diverge (mismatch)</option>
            <option value="written_off">Baixado sem efeito (written_off)</option>
          </Select>
        </label>
        <label className="block text-sm text-graphite-100">
          Nota de resolução (mínimo 10 caracteres)
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Resolvendo…" : "Resolver"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
