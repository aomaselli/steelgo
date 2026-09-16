import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Input, Select, Textarea } from "@/components/steel";
import { OUTCOME, type DisputeOutcome } from "@/lib/disputeStatus";
import {
  INSTRUCTION_OPEN,
  newRequestId,
  rpcErrorMessage,
  settlementPreview,
  type DisputeCase,
  brl,
} from "@/lib/disputes";
import { FinancialAttestationModal } from "@/components/finance/FinancialAttestationModal";

/**
 * Acoes do administrador sobre um caso. Toda escrita e RPC; a matematica da
 * decisao e apenas PRE-VISUALIZADA aqui (settlementPreview) - o servidor
 * recalcula e recusa parcelas divergentes. Nenhum valor e afirmado como
 * confirmado sem atestacao com comprovante.
 */
export function DisputeAdminActions({ data, onDone }: { data: DisputeCase; onDone: () => void }) {
  const { user } = useAuth();
  const c = data.case;
  const v = data.viewer;
  const [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState<string>("");
  const [reqTarget, setReqTarget] = useState<"claimant" | "respondent" | "both">("both");
  const [reqText, setReqText] = useState("");
  const [reqDays, setReqDays] = useState("3");
  const [outcome, setOutcome] = useState<DisputeOutcome>("split");
  const [shipperAmt, setShipperAmt] = useState("");
  const [rationale, setRationale] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [waiveNote, setWaiveNote] = useState<Record<string, string>>({});
  const [writeOffNote, setWriteOffNote] = useState<Record<string, string>>({});
  const [failNote, setFailNote] = useState<Record<string, string>>({});
  const [attest, setAttest] = useState<{
    kind: "refund" | "release" | "recovery";
    subjectId: string;
    amount: number;
    subtitle: string;
  } | null>(null);

  const { data: admins = [] } = useQuery({
    queryKey: ["dispute-admins"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("list_dispute_admins");
      if (error) throw error;
      return rows ?? [];
    },
  });

  const terminal = c.status === "closed" || c.status === "withdrawn";
  const instruction = INSTRUCTION_OPEN.includes(c.status);
  const current = data.decisions.find((d) => d.is_current);
  const intent = data.settlement.intent;
  const G = intent?.gross_amount ?? data.contract.total_amount_brl ?? 0;
  const F = intent?.platform_fee_amount ?? data.contract.platform_fee_brl ?? 0;
  const D = c.disputed_amount;
  const S = useMemo(() => {
    if (outcome === "release_to_carrier" || outcome === "dismissed") return 0;
    if (outcome === "refund_to_shipper") return D;
    const n = Number(shipperAmt.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }, [outcome, shipperAmt, D]);
  const preview = useMemo(
    () => (G > 0 && Number.isFinite(S) && S >= 0 && S <= D ? settlementPreview(G, F, D, S) : null),
    [G, F, D, S],
  );
  const splitOk = outcome !== "split" || (Number.isFinite(S) && S > 0 && S < D);
  const canDecide =
    v.is_assignee &&
    (instruction || (c.status === "decided" && !!current)) &&
    rationale.trim().length >= 20 &&
    !!preview &&
    splitOk &&
    !busy;
  const openRequests = data.evidence_requests.filter((r) => r.status === "open");
  const openRequestsInDue = openRequests.filter((r) => new Date(r.due_at).getTime() >= Date.now());
  const canSupersede =
    c.status === "decided" &&
    current &&
    ["not_required", "pending_funding", "settlement_pending"].includes(c.settlement_state) &&
    data.settlement.transactions.every((t) => t.dispute_decision_id !== current.id) &&
    data.settlement.recoveries.length === 0;

  async function call<T>(
    label: string,
    fn: () => PromiseLike<{ data: T; error: unknown }>,
    okMsg: (d: T) => string,
  ) {
    if (busy) return;
    setBusy(true);
    const { data: d, error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(`${label} NÃO registrado. ${rpcErrorMessage(error)}`);
      onDone();
      return;
    }
    toast.success(okMsg(d));
    onDone();
  }

  const row = <T,>(d: T) =>
    Array.isArray(d) ? (d[0] as Record<string, unknown>) : (d as Record<string, unknown>);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-graphite-50">Ações da Equipe SteelGo</h3>
      {!c.assigned && !terminal && (
        <p className="mt-1 text-xs text-amber-200">
          O caso ainda não tem analista. Assuma-o para pedir evidência, decidir, liquidar ou
          encerrar.
        </p>
      )}
      {c.assigned && !v.is_assignee && !terminal && (
        <p className="mt-1 text-xs text-amber-200">
          Atribuído a {c.assignee?.label}. Somente o analista atribuído decide, liquida e encerra;
          você pode reatribuir.
        </p>
      )}

      {/* atribuicao */}
      {!terminal && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-graphite-300">
            {c.assigned ? "Reatribuir a" : "Atribuir a"}
            <Select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1"
              disabled={busy}
            >
              <option value="">selecione…</option>
              {admins.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.display_name}
                  {a.user_id === user?.id ? " (você)" : ""}
                </option>
              ))}
            </Select>
          </label>
          {!c.assigned && (
            <Button
              size="sm"
              onClick={() =>
                user &&
                call(
                  "Atribuição",
                  () =>
                    supabase.rpc("assign_dispute_case", {
                      p_case_id: c.id,
                      p_assignee: user.id,
                      p_note: "Autoatribuição.",
                      p_request_id: newRequestId(),
                    }),
                  () => "Você assumiu o caso.",
                )
              }
              disabled={busy || !user}
            >
              Assumir o caso
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              call(
                "Atribuição",
                () =>
                  supabase.rpc("assign_dispute_case", {
                    p_case_id: c.id,
                    p_assignee: assignee,
                    p_note: "Atribuição pela Central de disputas.",
                    p_request_id: newRequestId(),
                  }),
                (d) =>
                  (row(d)?.was_reassigned as boolean) ? "Caso reatribuído." : "Caso atribuído.",
              )
            }
            disabled={busy || !assignee}
          >
            {c.assigned ? "Reatribuir" : "Atribuir"}
          </Button>
        </div>
      )}

      {/* pedido de evidencia */}
      {v.is_assignee && instruction && (
        <div className="mt-4 rounded-[12px] border border-graphite-700 p-3">
          <div className="text-xs font-semibold text-graphite-200">
            Pedir evidência (prazo futuro; um pedido aberto por parte)
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <Select
              value={reqTarget}
              onChange={(e) => setReqTarget(e.target.value as typeof reqTarget)}
              disabled={busy}
            >
              <option value="claimant">Ao requerente</option>
              <option value="respondent">Ao requerido</option>
              <option value="both">A ambas as partes (atômico)</option>
            </Select>
            <Input
              value={reqDays}
              onChange={(e) => setReqDays(e.target.value)}
              placeholder="prazo em dias"
              inputMode="numeric"
              disabled={busy}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || reqText.trim().length < 20 || !(Number(reqDays) > 0)}
              onClick={() =>
                call(
                  "Pedido",
                  () =>
                    supabase.rpc("request_dispute_evidence", {
                      p_case_id: c.id,
                      p_target_role: reqTarget,
                      p_description: reqText.trim(),
                      p_due_at: new Date(Date.now() + Number(reqDays) * 86400000).toISOString(),
                      p_request_id: newRequestId(),
                    }),
                  (d) => `${Array.isArray(d) ? d.length : 1} pedido(s) registrado(s).`,
                )
              }
            >
              Pedir evidência
            </Button>
          </div>
          <Textarea
            className="mt-2"
            rows={2}
            value={reqText}
            onChange={(e) => setReqText(e.target.value)}
            placeholder="O que deve ser apresentado (mínimo 20 caracteres)"
            disabled={busy}
          />
          {openRequests.length > 0 && (
            <div className="mt-2 space-y-2">
              {openRequests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 text-xs text-graphite-300"
                >
                  <span>
                    Pedido a {r.target_role === "claimant" ? "requerente" : "requerido"} — aberto
                  </span>
                  <Input
                    className="max-w-xs"
                    value={waiveNote[r.id] ?? ""}
                    onChange={(e) => setWaiveNote({ ...waiveNote, [r.id]: e.target.value })}
                    placeholder="justificativa da dispensa (≥ 20)"
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || (waiveNote[r.id] ?? "").trim().length < 20}
                    onClick={() =>
                      call(
                        "Dispensa",
                        () =>
                          supabase.rpc("waive_dispute_evidence_request", {
                            p_case_id: c.id,
                            p_evidence_request_id: r.id,
                            p_note: (waiveNote[r.id] ?? "").trim(),
                            p_request_id: newRequestId(),
                          }),
                        () => "Pedido dispensado.",
                      )
                    }
                  >
                    Dispensar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* decisao */}
      {v.is_assignee && (instruction || (c.status === "decided" && canSupersede)) && (
        <div className="mt-4 rounded-[12px] border border-graphite-700 p-3">
          <div className="text-xs font-semibold text-graphite-200">
            {c.status === "decided"
              ? "Corrigir a decisão (nova decisão que cita a anterior)"
              : "Decidir"}
          </div>
          {openRequestsInDue.length > 0 && (
            <p className="mt-1 text-xs text-amber-200">
              Há pedido de evidência aberto dentro do prazo: a decisão será recusada até o
              atendimento, a dispensa ou o vencimento.
            </p>
          )}
          {intent?.internal_status === "reconciliation_required" && (
            <p className="mt-1 text-xs text-amber-200">
              Pagamento em reconciliação: resolva-a antes de decidir.
            </p>
          )}
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {(Object.keys(OUTCOME) as DisputeOutcome[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                disabled={busy}
                className={`rounded-md border p-2 text-left text-xs ${outcome === o ? "border-steel-blue-400 bg-steel-blue-100" : "border-graphite-700 hover:bg-bg-elevated"}`}
              >
                <div className="font-semibold text-graphite-50">{OUTCOME[o].label}</div>
              </button>
            ))}
          </div>
          {outcome === "split" && (
            <label className="mt-2 block text-xs text-graphite-300">
              Valor devolvido ao embarcador (S), entre 0,01 e {brl(D - 0.01)}
              <Input
                className="mt-1 max-w-xs"
                value={shipperAmt}
                onChange={(e) => setShipperAmt(e.target.value)}
                inputMode="decimal"
                disabled={busy}
              />
            </label>
          )}
          {preview && (
            <div className="mt-2 rounded-[8px] bg-bg-elevated p-3 text-xs text-graphite-300">
              <div className="font-semibold text-graphite-100">
                Pré-visualização (fórmula do servidor; parcelas divergentes são recusadas)
              </div>
              <div className="mt-1 grid gap-1 md:grid-cols-2">
                <div>
                  Bruto G {brl(G)} · taxa original F {brl(F)} · em disputa D {brl(D)}
                </div>
                <div>
                  Devolvido ao embarcador S: <span className="text-graphite-100">{brl(S)}</span>
                </div>
                <div>
                  Liberado à transportadora: {brl(preview.carrierFinal)} (taxa proporcional{" "}
                  {brl(preview.feeFinal)})
                </div>
                <div>
                  Parcelas da disputa: transportadora {brl(preview.carrierDelta)} · SteelGo{" "}
                  {brl(preview.platformDelta)}
                </div>
                {intent?.internal_status === "released_confirmed" && S > 0 && (
                  <div className="md:col-span-2 text-amber-200">
                    Pagamento já repassado: obrigações de recuperação — transportadora{" "}
                    {brl(preview.carrierRecovery)}, SteelGo {brl(preview.platformRecovery)}. O valor
                    NÃO volta automaticamente.
                  </div>
                )}
                {(!intent || !intent.funding_confirmed_at) &&
                  intent?.internal_status !== "released_confirmed" &&
                  S > 0 &&
                  preview.R > 0 && (
                    <div className="md:col-span-2 text-amber-200">
                      Sem custódia: o embarcador deverá aportar apenas {brl(preview.R)} em 7 dias;
                      após o prazo o contrato pode ser cancelado por inadimplência.
                    </div>
                  )}
              </div>
            </div>
          )}
          <Textarea
            className="mt-2"
            rows={3}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Fundamentação (mínimo 20 caracteres — visível às partes)"
            disabled={busy}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={!canDecide}
              onClick={() =>
                preview &&
                call(
                  "Decisão",
                  () =>
                    supabase.rpc("decide_dispute_case", {
                      p_case_id: c.id,
                      p_outcome: outcome,
                      p_decided_amount: D,
                      p_carrier_amount: preview.carrierDelta,
                      p_shipper_amount: S,
                      p_platform_amount: preview.platformDelta,
                      p_rationale: rationale.trim(),
                      p_request_id: newRequestId(),
                      p_supersedes_decision_id: c.status === "decided" ? current?.id : undefined,
                    }),
                  () => "Decisão registrada.",
                )
              }
            >
              {c.status === "decided" ? "Registrar correção" : "Registrar decisão"}
            </Button>
          </div>
        </div>
      )}

      {/* liquidacao */}
      {v.is_assignee &&
        c.status === "decided" &&
        ["settlement_pending", "pending_funding"].includes(c.settlement_state) && (
          <div className="mt-4 rounded-[12px] border border-graphite-700 p-3 text-xs text-graphite-300">
            <div className="font-semibold text-graphite-200">Liquidação</div>
            {c.settlement_state === "pending_funding" ? (
              <p className="mt-1">
                Aguardando o aporte do embarcador (
                {intent?.settlement_funding_amount != null
                  ? brl(intent.settlement_funding_amount)
                  : "—"}
                ) até{" "}
                {c.settlement_due_at ? new Date(c.settlement_due_at).toLocaleString("pt-BR") : "—"}.
                Após o aporte atestado, solicite a liquidação.
              </p>
            ) : (
              <p className="mt-1">
                Há custódia. Solicitar a liquidação cria as transações de devolução e/ou liberação
                (nada é confirmado até a atestação).
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  busy ||
                  (c.settlement_state === "pending_funding" &&
                    intent?.internal_status !== "funding_confirmed")
                }
                onClick={() =>
                  call(
                    "Liquidação",
                    () =>
                      supabase.rpc("settle_dispute_decision", {
                        p_case_id: c.id,
                        p_request_id: newRequestId(),
                      }),
                    (d) =>
                      `Liquidação solicitada: devolução ${brl(Number(row(d)?.refund_amount ?? 0))}, liberação ${brl(Number(row(d)?.release_amount ?? 0))}.`,
                  )
                }
              >
                Solicitar liquidação
              </Button>
              {c.settlement_state === "pending_funding" &&
                c.settlement_overdue &&
                c.previous_contract_status === "active" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="max-w-xs"
                      value={cancelNote}
                      onChange={(e) => setCancelNote(e.target.value)}
                      placeholder="nota do cancelamento (≥ 20)"
                      disabled={busy}
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || cancelNote.trim().length < 20}
                      onClick={() =>
                        window.confirm(
                          `Cancelar o contrato ${data.contract.contract_number ?? c.contract_id} por falta de aporte da decisão?\n\n` +
                            "Consequências: contrato e pagamento passam a CANCELADOS; aportes solicitados e não " +
                            "confirmados são cancelados; o caso é encerrado SEM liquidação (nenhum valor é " +
                            "devolvido ou liberado); as duas partes são notificadas. Irreversível.",
                        ) &&
                        call(
                          "Cancelamento",
                          () =>
                            supabase.rpc("cancel_contract_for_unpaid_settlement", {
                              p_case_id: c.id,
                              p_note: cancelNote.trim(),
                              p_request_id: newRequestId(),
                            }),
                          () =>
                            "Contrato cancelado por inadimplência; caso encerrado sem liquidação.",
                        )
                      }
                    >
                      Cancelar contrato por inadimplência
                    </Button>
                  </div>
                )}
            </div>
          </div>
        )}

      {/* atestacao das transacoes de liquidacao */}
      {c.status === "decided" && c.settlement_state === "requested" && (
        <div className="mt-4 rounded-[12px] border border-graphite-700 p-3 text-xs text-graphite-300">
          <div className="font-semibold text-graphite-200">
            Atestar transações da liquidação (qualquer administrador, com comprovante)
          </div>
          {data.settlement.transactions
            .filter((t) => t.dispute_decision_id === current?.id)
            .map((t) => (
              <div key={t.id} className="mt-2 flex flex-wrap items-center gap-2">
                <span>
                  {t.kind === "refund" ? "Devolução ao embarcador" : "Liberação à transportadora"}{" "}
                  {brl(t.amount)} —{" "}
                  {t.status === "requested"
                    ? "solicitada"
                    : t.status === "confirmed"
                      ? "atestada"
                      : t.status}
                </span>
                {t.status === "requested" && (
                  <>
                    <Button
                      size="sm"
                      variant="green"
                      disabled={busy}
                      onClick={() =>
                        setAttest({
                          kind: t.kind as "refund" | "release",
                          subjectId: t.id,
                          amount: t.amount,
                          subtitle: "Transação da liquidação",
                        })
                      }
                    >
                      Atestar
                    </Button>
                    <Input
                      className="max-w-[14rem]"
                      value={failNote[t.id] ?? ""}
                      onChange={(e) => setFailNote({ ...failNote, [t.id]: e.target.value })}
                      placeholder="motivo da falha (≥ 10)"
                      disabled={busy}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || (failNote[t.id] ?? "").trim().length < 10}
                      onClick={() =>
                        call(
                          "Falha",
                          () =>
                            supabase.rpc("fail_dispute_settlement_transaction", {
                              p_contract_id: c.contract_id,
                              p_transaction_id: t.id,
                              p_failure_code: "other",
                              p_failure_reason: (failNote[t.id] ?? "").trim(),
                              p_request_id: newRequestId(),
                            }),
                          () => "Falha registrada; refaça a solicitação.",
                        )
                      }
                    >
                      Registrar falha
                    </Button>
                  </>
                )}
                {t.status === "failed" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      call(
                        "Retry",
                        () =>
                          supabase.rpc("retry_dispute_settlement_transaction", {
                            p_contract_id: c.contract_id,
                            p_failed_transaction_id: t.id,
                            p_note: "Nova solicitação após falha.",
                            p_request_id: newRequestId(),
                          }),
                        () => "Nova solicitação criada.",
                      )
                    }
                  >
                    Refazer solicitação
                  </Button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* recuperacoes */}
      {data.settlement.recoveries.some((r) => r.status === "open") && (
        <div className="mt-4 rounded-[12px] border border-graphite-700 p-3 text-xs text-graphite-300">
          <div className="font-semibold text-graphite-200">
            Obrigações de recuperação (pagamento já repassado)
          </div>
          {data.settlement.recoveries
            .filter((r) => r.status === "open")
            .map((r) => (
              <div key={r.id} className="mt-2 flex flex-wrap items-center gap-2">
                <span>
                  {r.debtor_label} deve {brl(r.expected_amount)} a {r.creditor_label}
                </span>
                <Button
                  size="sm"
                  variant="green"
                  disabled={busy}
                  onClick={() =>
                    setAttest({
                      kind: "recovery",
                      subjectId: r.id,
                      amount: r.expected_amount,
                      subtitle: `Obrigação de recuperação (${r.debtor_label})`,
                    })
                  }
                >
                  Confirmar com comprovante
                </Button>
                <Input
                  className="max-w-[16rem]"
                  value={writeOffNote[r.id] ?? ""}
                  onChange={(e) => setWriteOffNote({ ...writeOffNote, [r.id]: e.target.value })}
                  placeholder="justificativa da baixa (≥ 20)"
                  disabled={busy}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || (writeOffNote[r.id] ?? "").trim().length < 20}
                  onClick={() =>
                    window.confirm(
                      "Baixar a obrigação SEM devolução do valor? Irreversível e registrado como baixa.",
                    ) &&
                    call(
                      "Baixa",
                      () =>
                        supabase.rpc("write_off_dispute_recovery", {
                          p_recovery_id: r.id,
                          p_note: (writeOffNote[r.id] ?? "").trim(),
                          p_request_id: newRequestId(),
                        }),
                      () => "Obrigação baixada sem devolução (registrado como baixa).",
                    )
                  }
                >
                  Baixar sem devolução
                </Button>
              </div>
            ))}
        </div>
      )}

      {/* encerramento */}
      {v.is_assignee && c.status === "decided" && (
        <div className="mt-4 rounded-[12px] border border-graphite-700 p-3 text-xs text-graphite-300">
          <div className="font-semibold text-graphite-200">Encerrar o caso</div>
          <p className="mt-1">
            Só com liquidação concluída (sem movimento, liquidada, ou recuperações
            confirmadas/baixadas). O contrato volta exatamente a {c.previous_contract_status}.
          </p>
          <Textarea
            className="mt-2"
            rows={2}
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            placeholder="Nota de encerramento (mínimo 20 caracteres, visível às partes)"
            disabled={busy}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={
                busy ||
                closeNote.trim().length < 20 ||
                !["not_required", "settled", "recovery_closed"].includes(c.settlement_state)
              }
              onClick={() =>
                call(
                  "Encerramento",
                  () =>
                    supabase.rpc("close_dispute_case", {
                      p_case_id: c.id,
                      p_note: closeNote.trim(),
                      p_request_id: newRequestId(),
                    }),
                  (d) =>
                    `Caso encerrado; contrato em ${String(row(d)?.new_contract_status ?? "")}.`,
                )
              }
            >
              Encerrar caso
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 flex items-start gap-1 text-[11px] text-graphite-500">
        <Info className="mt-0.5 h-3 w-3 flex-shrink-0" /> Decidir, pedir/dispensar evidência,
        liquidar, cancelar e encerrar exigem ser o analista atribuído. Atestações de comprovante
        podem ser feitas por qualquer administrador.
      </p>

      {attest && (
        <FinancialAttestationModal
          open
          onClose={() => setAttest(null)}
          kind={attest.kind}
          contractId={c.contract_id}
          contractNumber={data.contract.contract_number ?? c.contract_id.slice(0, 8)}
          subjectId={attest.subjectId}
          amount={attest.amount}
          subtitle={attest.subtitle}
          onDone={onDone}
        />
      )}
    </Card>
  );
}
