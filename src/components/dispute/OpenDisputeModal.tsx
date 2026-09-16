import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Input, Modal, Select, Textarea } from "@/components/steel";
import { DISPUTE_NOTICE, REASON, type DisputeReason } from "@/lib/disputeStatus";
import { newRequestId, rpcErrorMessage, brl } from "@/lib/disputes";

interface Props {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractNumber: string;
  contractTotal: number;
  contractStatus: string;
  completedAt: string | null;
  escrowStatus: string | null;
  onOpened: (caseId: string) => void;
}

/**
 * Abertura de disputa pelo proprietario da empresa (embarcadora ou
 * transportadora). Tudo passa por open_dispute_case; o servidor e quem decide
 * prazo, papel e unicidade. request_id estavel por tentativa.
 */
export function OpenDisputeModal({
  open,
  onClose,
  contractId,
  contractNumber,
  contractTotal,
  contractStatus,
  completedAt,
  escrowStatus,
  onOpened,
}: Props) {
  const requestId = useRef<string | null>(null);
  const [reason, setReason] = useState<DisputeReason>("cargo_damage");
  const [description, setDescription] = useState("");
  const [statement, setStatement] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      requestId.current = null;
      setReason("cargo_damage");
      setDescription("");
      setStatement("");
      setAmount("");
      setError(null);
    }
  }, [open]);

  const amountNum = Number(amount.replace(",", "."));
  const amountOk =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    amountNum <= contractTotal &&
    /^\d+([.,]\d{1,2})?$/.test(amount.trim());
  const canSubmit =
    !busy && description.trim().length >= 20 && statement.trim().length >= 20 && amountOk;

  const deadline = completedAt ? new Date(new Date(completedAt).getTime() + 7 * 86400000) : null;
  const releasedAlready = escrowStatus === "released_confirmed" || escrowStatus === "settled";

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    if (requestId.current === null) requestId.current = newRequestId();
    const { data, error: rpcErr } = await supabase.rpc("open_dispute_case", {
      p_contract_id: contractId,
      p_reason_code: reason,
      p_description: description.trim(),
      p_disputed_amount: Math.round(amountNum * 100) / 100,
      p_statement: statement.trim(),
      p_request_id: requestId.current,
    });
    setBusy(false);
    if (rpcErr) {
      setError(`A disputa NÃO foi aberta. ${rpcErrorMessage(rpcErr)}`);
      toast.error("A disputa não foi aberta");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setError("A RPC não devolveu resultado.");
      return;
    }
    toast.success(
      row.was_replayed
        ? "A disputa já estava registrada."
        : row.release_suspended
          ? "Disputa aberta. A liberação do pagamento ficou suspensa até a decisão."
          : "Disputa aberta. O pagamento já repassado não é alterado; eventual devolução será obrigação registrada.",
    );
    onOpened(row.case_id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Abrir disputa"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200">{DISPUTE_NOTICE}</p>
        </div>
        <div className="space-y-1 rounded-[12px] bg-bg-elevated p-3 text-sm text-graphite-200">
          <div className="flex justify-between">
            <span>Contrato</span>
            <span className="font-mono text-graphite-50">{contractNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Valor do contrato (limite do valor em disputa)</span>
            <span className="font-semibold tabular-nums text-graphite-50">
              {brl(contractTotal)}
            </span>
          </div>
          {contractStatus === "completed" && deadline && (
            <div className="flex justify-between">
              <span>Prazo para disputar (7 dias após a conclusão)</span>
              <span className="text-graphite-50">{deadline.toLocaleString("pt-BR")}</span>
            </div>
          )}
          {releasedAlready && (
            <p className="text-xs text-amber-200">
              O pagamento deste contrato já foi repassado. Uma decisão favorável ao embarcador gera
              obrigação de recuperação (transportadora e SteelGo), não devolução automática.
            </p>
          )}
        </div>

        <label className="block text-sm text-graphite-100">
          Motivo
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as DisputeReason)}
            disabled={busy}
            className="mt-1"
          >
            {(Object.keys(REASON) as DisputeReason[]).map((k) => (
              <option key={k} value={k}>
                {REASON[k]}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm text-graphite-100">
          Valor em disputa (R$, até duas casas)
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            placeholder="ex.: 1500.00"
            className="mt-1"
            inputMode="decimal"
          />
          {amount && !amountOk && (
            <span className="text-xs text-red-400">
              Informe um valor positivo, com no máximo duas casas decimais, até {brl(contractTotal)}
              .
            </span>
          )}
        </label>
        <label className="block text-sm text-graphite-100">
          Descrição do problema (mínimo 20 caracteres)
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            rows={3}
            className="mt-1"
          />
        </label>
        <label className="block text-sm text-graphite-100">
          Sua alegação (mínimo 20 caracteres — fica registrada e é visível à outra parte)
          <Textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
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
        <p className="text-[11px] text-graphite-400">
          Uma única disputa por contrato, permanente. A abertura suspende a liberação de pagamento
          ainda não confirmada e notifica a outra parte e a Equipe SteelGo.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={submit} disabled={!canSubmit}>
            {busy ? "Abrindo…" : "Abrir disputa"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
