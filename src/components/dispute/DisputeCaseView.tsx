import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Button, Card, Spinner, Textarea } from "@/components/steel";
import {
  DISPUTE_NOTICE,
  DISPUTE_STATUS,
  EVENT_LABEL,
  EVIDENCE_KIND,
  OUTCOME,
  PARTY_ROLE,
  REASON,
  RECOVERY_STATUS,
  REQUEST_STATUS,
  SETTLEMENT_STATE,
  dueLabel,
} from "@/lib/disputeStatus";
import {
  INSTRUCTION_OPEN,
  TERMINAL,
  fetchDisputeCase,
  newRequestId,
  rpcErrorMessage,
  type DisputeCase,
  brl,
} from "@/lib/disputes";
import { DisputeEvidenceModal } from "./DisputeEvidenceModal";
import { DisputeAdminActions } from "./DisputeAdminActions";

interface Props {
  caseId: string;
  /** link tipado de volta ao contrato desta persona (cada rota fornece o seu) */
  contractLink: (contractId: string, label: React.ReactNode) => React.ReactNode;
}

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

export function DisputeCaseView({ caseId, contractLink }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dispute-case", caseId],
    queryFn: () => fetchDisputeCase(caseId),
    refetchInterval: 60_000,
  });
  const [evidenceFor, setEvidenceFor] = useState<{ requestId?: string; claimId?: string } | null>(
    null,
  );
  const [claimText, setClaimText] = useState("");
  const [comment, setComment] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dispute-case", caseId] });
    qc.invalidateQueries({ queryKey: ["dispute-list"] });
    qc.invalidateQueries({ queryKey: ["notifications-unread"] });
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  if (error || !data)
    return (
      <div className="p-12 text-center text-graphite-300">
        Caso não encontrado ou sem acesso. {error ? rpcErrorMessage(error) : ""}
      </div>
    );

  const c = data.case;
  const v = data.viewer;
  const terminal = TERMINAL.includes(c.status);
  const instruction = INSTRUCTION_OPEN.includes(c.status);
  const isParty = !v.is_admin && (v.role === "claimant" || v.role === "respondent");
  const st = DISPUTE_STATUS[c.status];
  const ss = SETTLEMENT_STATE[c.settlement_state];
  const claimant = data.parties.find((p) => p.role === "claimant");
  const respondent = data.parties.find((p) => p.role === "respondent");
  const intent = data.settlement.intent;
  const shipperIsViewer =
    isParty && data.parties.some((p) => p.is_you && p.company_kind === "shipper");

  async function addClaim() {
    if (claimText.trim().length < 20 || busy) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("add_dispute_claim", {
      p_case_id: caseId,
      p_reason_code: c.reason_code,
      p_statement: claimText.trim(),
      p_claimed_amount: null as unknown as number,
      p_request_id: newRequestId(),
    }); // null explicito: a RPC aceita valor ausente; o tipo gerado nao e nullable
    setBusy(false);
    if (e) {
      toast.error(`Alegação NÃO registrada. ${rpcErrorMessage(e)}`);
      return;
    }
    setClaimText("");
    toast.success("Alegação registrada.");
    refresh();
  }
  async function addComment(internal: boolean) {
    if (comment.trim().length === 0 || busy) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("add_dispute_comment", {
      p_case_id: caseId,
      p_body: comment.trim(),
      p_internal: internal,
      p_request_id: newRequestId(),
    });
    setBusy(false);
    if (e) {
      toast.error(`Comentário NÃO registrado. ${rpcErrorMessage(e)}`);
      return;
    }
    setComment("");
    toast.success(
      internal ? "Nota interna registrada (invisível às partes)." : "Comentário registrado.",
    );
    refresh();
  }
  async function withdraw() {
    if (withdrawNote.trim().length < 20 || busy) return;
    if (
      !window.confirm(
        "Retirar a disputa? O contrato volta ao estado anterior e nenhuma nova disputa poderá ser aberta neste contrato.",
      )
    )
      return;
    setBusy(true);
    const { error: e } = await supabase.rpc("withdraw_dispute_case", {
      p_case_id: caseId,
      p_note: withdrawNote.trim(),
      p_request_id: newRequestId(),
    });
    setBusy(false);
    if (e) {
      toast.error(`Retirada NÃO registrada. ${rpcErrorMessage(e)}`);
      return;
    }
    toast.success("Disputa retirada.");
    refresh();
  }
  async function download(path: string) {
    const { data: s, error: e } = await supabase.storage
      .from("dispute-evidence")
      .createSignedUrl(path, 60);
    if (e || !s) {
      toast.error(`Não foi possível gerar o link. ${e?.message ?? ""}`);
      return;
    }
    window.open(s.signedUrl, "_blank", "noopener");
  }
  async function fundSettlement() {
    if (!intent?.settlement_funding_amount || busy) return;
    setBusy(true);
    const { data: r, error: e } = await supabase.rpc("request_escrow_funding", {
      p_contract_id: c.contract_id,
      p_request_id: newRequestId(),
    });
    setBusy(false);
    if (e) {
      toast.error(`Aporte NÃO solicitado. ${rpcErrorMessage(e)}`);
      return;
    }
    const row = Array.isArray(r) ? r[0] : r;
    toast.success(
      row?.was_replayed
        ? "Solicitação já registrada."
        : "Aporte da decisão solicitado. A SteelGo confirma com comprovante.",
    );
    refresh();
  }

  const tone = (t: string) =>
    (t === "danger"
      ? "danger"
      : t === "amber"
        ? "amber"
        : t === "green"
          ? "green"
          : t === "blue"
            ? "blue"
            : t === "gray"
              ? "gray"
              : "default") as "danger" | "amber" | "green" | "blue" | "gray" | "default";

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold text-graphite-50">{c.case_number}</span>
              <Badge variant={tone(st.tone)}>{st.label}</Badge>
              {!terminal && (
                <span className={`text-xs ${c.overdue ? "text-red-400" : "text-graphite-400"}`}>
                  SLA da SteelGo: {dueLabel(c.due_at, terminal)}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-graphite-400">
              Aberta em {fmt(c.opened_at)} por {c.opened_by.label} (
              {PARTY_ROLE[c.opened_by.role] ?? c.opened_by.role}) · Motivo: {REASON[c.reason_code]}{" "}
              · Valor em disputa{" "}
              <span className="font-semibold text-graphite-200">{brl(c.disputed_amount)}</span>
            </div>
            <div className="mt-1 text-xs text-graphite-400">
              Contrato{" "}
              {contractLink(
                c.contract_id,
                <span className="font-mono text-steel-blue-300 hover:underline">
                  {data.contract.contract_number ?? c.contract_id.slice(0, 8)}
                </span>,
              )}{" "}
              · estado {data.contract.status} (antes da disputa: {c.previous_contract_status})
            </div>
          </div>
          <div className="text-right text-xs text-graphite-300">
            <div>
              <span className="text-graphite-400">Requerente:</span> {claimant?.company_name ?? "—"}
              {claimant?.is_you && " (você)"}
            </div>
            <div>
              <span className="text-graphite-400">Requerido:</span>{" "}
              {respondent?.company_name ?? "—"}
              {respondent?.is_you && " (você)"}
            </div>
            <div>
              <span className="text-graphite-400">Analista:</span>{" "}
              {c.assignee ? c.assignee.label : "ainda não atribuído"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-graphite-200">{c.description}</p>
        <div className="mt-3 flex gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200">{DISPUTE_NOTICE}</p>
        </div>
      </Card>

      {/* EFEITO FINANCEIRO */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-graphite-50">Efeito financeiro</h3>
          <Badge variant={tone(ss.tone)}>{ss.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-graphite-400">{ss.hint}</p>
        {intent ? (
          <div className="mt-3 grid gap-2 text-xs text-graphite-300 md:grid-cols-3">
            <div>
              Pagamento: <span className="text-graphite-100">{intent.internal_status}</span>
              {intent.release_blocked_by_dispute && (
                <span className="ml-1 text-red-400">· liberação suspensa</span>
              )}
            </div>
            <div>
              Bruto {brl(intent.gross_amount)} · taxa original {brl(intent.platform_fee_amount)}
            </div>
            <div>
              {intent.settlement_refund_amount != null && (
                <>
                  Devolução {brl(intent.settlement_refund_amount)} · liberação{" "}
                  {brl(intent.settlement_release_amount ?? 0)}
                  {intent.settlement_funding_amount != null && (
                    <> · aporte devido {brl(intent.settlement_funding_amount)}</>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-graphite-400">
            Sem intenção de pagamento registrada para este contrato.
          </p>
        )}
        {c.settlement_state === "pending_funding" && (
          <div className="mt-3 rounded-[12px] border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            Prazo para o aporte da decisão: {fmt(c.settlement_due_at)}{" "}
            {c.settlement_overdue && <span className="font-semibold text-red-300">— vencido</span>}.
            {intent?.settlement_funding_amount != null && (
              <>
                {" "}
                Valor a aportar:{" "}
                <span className="font-semibold">{brl(intent.settlement_funding_amount)}</span>{" "}
                (somente o valor a liberar; a parcela devolvida nunca saiu do embarcador).
              </>
            )}
            {shipperIsViewer && intent?.internal_status === "pending_provider" && (
              <div className="mt-2">
                <Button size="sm" onClick={fundSettlement} disabled={busy}>
                  Aportar para cumprir decisão
                </Button>
              </div>
            )}
            {intent?.internal_status === "awaiting_funding" && (
              <div className="mt-1">Aporte solicitado — aguardando atestação da SteelGo.</div>
            )}
          </div>
        )}
        {data.settlement.transactions.length > 0 && (
          <table className="mt-3 w-full text-xs">
            <thead className="text-graphite-400">
              <tr>
                <th className="py-1 text-left">Transação</th>
                <th className="py-1 text-left">Estado</th>
                <th className="py-1 text-right">Valor</th>
                <th className="py-1 text-left">Composição</th>
              </tr>
            </thead>
            <tbody>
              {data.settlement.transactions.map((t) => (
                <tr key={t.id} className="border-t border-graphite-700 text-graphite-200">
                  <td className="py-1">
                    {t.kind === "refund"
                      ? "Devolução ao embarcador"
                      : t.kind === "release"
                        ? "Liberação à transportadora"
                        : t.kind === "funding"
                          ? "Aporte da decisão"
                          : t.kind}
                  </td>
                  <td className="py-1">
                    {t.status === "confirmed"
                      ? "atestada"
                      : t.status === "requested"
                        ? "solicitada — sem confirmação"
                        : t.status === "failed"
                          ? `falhou (${t.failure_code ?? ""})`
                          : t.status}
                  </td>
                  <td className="py-1 text-right tabular-nums">{brl(t.amount)}</td>
                  <td className="py-1 text-graphite-400">
                    {t.allocations
                      .map(
                        (a) =>
                          `${a.party_kind === "platform" ? "SteelGo" : a.party_kind === "carrier" ? "transportadora" : "embarcador"} ${brl(a.amount)}`,
                      )
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.settlement.recoveries.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-xs font-semibold text-graphite-200">
              Obrigações de recuperação (pagamento já repassado — o valor NÃO voltou por este
              registro)
            </div>
            {data.settlement.recoveries.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-bg-elevated px-3 py-2 text-xs text-graphite-200"
              >
                <span>
                  {r.debtor_label} deve {brl(r.expected_amount)} a {r.creditor_label}
                </span>
                <Badge variant={tone(RECOVERY_STATUS[r.status].tone)}>
                  {RECOVERY_STATUS[r.status].label}
                </Badge>
                {r.status === "written_off" && (
                  <span className="w-full text-[11px] text-graphite-400">
                    Baixa: {r.write_off_note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* DECISAO */}
      {data.decisions.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-graphite-50">Decisão</h3>
          {data.decisions.map((d) => (
            <div
              key={d.id}
              className={`mt-2 rounded-[12px] border p-3 text-xs ${d.is_current ? "border-esg-green-400/40" : "border-graphite-700 opacity-70"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={d.is_current ? "green" : "gray"}>
                  {d.is_current ? "vigente" : "superada"}
                </Badge>
                <span className="font-semibold text-graphite-100">{OUTCOME[d.outcome].label}</span>
                <span className="text-graphite-400">
                  · {fmt(d.decided_at)} · {d.decided_by.label}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-graphite-300 md:grid-cols-2">
                <div>
                  Valor em disputa: {brl(d.decided_amount)} (bruto {brl(d.gross_amount)}, taxa
                  original {brl(d.original_platform_fee)})
                </div>
                <div>
                  Devolvido ao embarcador:{" "}
                  <span className="text-graphite-100">{brl(d.shipper_amount)}</span>
                </div>
                <div>
                  Liberado à transportadora:{" "}
                  <span className="text-graphite-100">{brl(d.carrier_final)}</span> (parcela da
                  disputa {brl(d.carrier_delta)})
                </div>
                <div>
                  Taxa SteelGo proporcional:{" "}
                  <span className="text-graphite-100">{brl(d.platform_fee_final)}</span> (parcela da
                  disputa {brl(d.platform_delta)})
                </div>
              </div>
              <p className="mt-2 text-graphite-200">{d.rationale}</p>
            </div>
          ))}
        </Card>
      )}

      {/* PEDIDOS DE EVIDENCIA */}
      {data.evidence_requests.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-graphite-50">
            Pedidos de evidência da SteelGo
          </h3>
          <ul className="mt-2 space-y-2">
            {data.evidence_requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-bg-elevated px-3 py-2 text-xs text-graphite-200"
              >
                <span>
                  <span className="text-graphite-400">Para {PARTY_ROLE[r.target_role]}:</span>{" "}
                  {r.description} · prazo {fmt(r.due_at)}
                  {r.waive_note && (
                    <span className="block text-graphite-400">Dispensa: {r.waive_note}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={tone(REQUEST_STATUS[r.status].tone)}>
                    {REQUEST_STATUS[r.status].label}
                  </Badge>
                  {r.status === "open" && r.addressed_to_you && isParty && (
                    <Button size="sm" onClick={() => setEvidenceFor({ requestId: r.id })}>
                      Atender
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ALEGACOES */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-graphite-50">Alegações</h3>
        <ul className="mt-2 space-y-2">
          {data.claims.map((cl) => (
            <li
              key={cl.id}
              className="rounded-[8px] bg-bg-elevated px-3 py-2 text-xs text-graphite-200"
            >
              <div className="text-graphite-400">
                {cl.actor.label} ({PARTY_ROLE[cl.role] ?? cl.role}) · {fmt(cl.created_at)} ·{" "}
                {REASON[cl.reason_code]}
                {cl.claimed_amount != null && <> · {brl(cl.claimed_amount)}</>}
              </div>
              <div className="mt-1">{cl.statement}</div>
              {isParty && instruction && (
                <button
                  type="button"
                  className="mt-1 text-[11px] text-steel-blue-300 hover:underline"
                  onClick={() => setEvidenceFor({ claimId: cl.id })}
                >
                  anexar evidência a esta alegação
                </button>
              )}
            </li>
          ))}
        </ul>
        {isParty && instruction && (
          <div className="mt-3">
            <Textarea
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              rows={2}
              placeholder="Nova alegação (mínimo 20 caracteres)"
              disabled={busy}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={addClaim}
                disabled={busy || claimText.trim().length < 20}
              >
                Registrar alegação
              </Button>
            </div>
          </div>
        )}
        {c.status === "decided" && (
          <p className="mt-2 text-[11px] text-graphite-400">
            Instrução encerrada após a decisão: alegações e evidências não são mais aceitas.
          </p>
        )}
      </Card>

      {/* EVIDENCIAS */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-graphite-50">Evidências</h3>
          {(isParty || v.is_admin) && instruction && (
            <Button size="sm" variant="secondary" onClick={() => setEvidenceFor({})}>
              Apresentar evidência
            </Button>
          )}
        </div>
        {data.evidence.length === 0 ? (
          <p className="mt-2 text-xs text-graphite-400">Nenhuma evidência apresentada.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.evidence.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-bg-elevated px-3 py-2 text-xs text-graphite-200"
              >
                <span>
                  <span className="text-graphite-400">
                    {e.actor.label} ({PARTY_ROLE[e.role] ?? e.role}) · {fmt(e.submitted_at)} ·{" "}
                    {EVIDENCE_KIND[e.kind] ?? e.kind}
                  </span>
                  <span className="block">{e.description}</span>
                  <span className="block font-mono text-[10px] text-graphite-500">
                    sha-256 declarado {e.content_hash.slice(0, 16)}…{" "}
                    {e.artifact_mime &&
                      `· ${e.artifact_mime} · ${((e.artifact_size_bytes ?? 0) / 1024).toFixed(0)} KB (registrados pelo Storage)`}
                  </span>
                </span>
                {e.artifact_ref && (
                  <Button size="sm" variant="ghost" onClick={() => void download(e.artifact_ref!)}>
                    <Download className="mr-1 h-3.5 w-3.5" /> baixar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex items-start gap-1 text-[11px] text-graphite-500">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" /> Evidências são imutáveis. O hash é
          declarado por quem envia; confira-o ao baixar.
        </p>
      </Card>

      {/* COMENTARIOS */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-graphite-50">Comentários</h3>
        {data.comments.length === 0 ? (
          <p className="mt-2 text-xs text-graphite-400">Nenhum comentário.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.comments.map((cm) => (
              <li
                key={cm.id}
                className={`rounded-[8px] px-3 py-2 text-xs ${cm.visibility === "internal_admin" ? "border border-amber-500/30 bg-amber-500/5 text-amber-100" : "bg-bg-elevated text-graphite-200"}`}
              >
                <div className="text-graphite-400">
                  {cm.actor.label} ({PARTY_ROLE[cm.role] ?? cm.role}) · {fmt(cm.created_at)}
                  {cm.visibility === "internal_admin" && " · nota interna (invisível às partes)"}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{cm.body}</div>
              </li>
            ))}
          </ul>
        )}
        {!terminal && (isParty || v.is_admin) && (
          <div className="mt-3">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Comentário visível às partes"
              disabled={busy}
            />
            <div className="mt-2 flex justify-end gap-2">
              {v.is_admin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addComment(true)}
                  disabled={busy || comment.trim().length === 0}
                >
                  Nota interna
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addComment(false)}
                disabled={busy || comment.trim().length === 0}
              >
                Comentar
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* RETIRADA */}
      {isParty && v.role === "claimant" && instruction && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-graphite-50">Retirar a disputa</h3>
          <p className="mt-1 text-xs text-graphite-400">
            Só o requerente retira, e só antes da decisão. O contrato volta exatamente ao estado
            anterior; nenhuma nova disputa poderá ser aberta neste contrato.
          </p>
          <Textarea
            className="mt-2"
            value={withdrawNote}
            onChange={(e) => setWithdrawNote(e.target.value)}
            rows={2}
            placeholder="Justificativa (mínimo 20 caracteres)"
            disabled={busy}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="danger"
              onClick={withdraw}
              disabled={busy || withdrawNote.trim().length < 20}
            >
              Retirar disputa
            </Button>
          </div>
        </Card>
      )}

      {v.is_admin && <DisputeAdminActions data={data} onDone={refresh} />}

      {/* TRILHA */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-graphite-50">Histórico</h3>
        <ol className="mt-2 space-y-1">
          {data.events.map((ev) => (
            <li key={ev.id} className="text-xs text-graphite-300">
              <span className="text-graphite-500">{fmt(ev.created_at)}</span> ·{" "}
              <span className="text-graphite-100">
                {EVENT_LABEL[ev.event_type] ?? ev.event_type}
              </span>{" "}
              · {ev.actor.label}
              {ev.note && ev.event_type !== "opened" && (
                <span className="block pl-4 text-graphite-400">{ev.note}</span>
              )}
            </li>
          ))}
        </ol>
      </Card>

      {evidenceFor && (
        <DisputeEvidenceModal
          open
          onClose={() => setEvidenceFor(null)}
          caseId={caseId}
          evidenceRequestId={evidenceFor.requestId ?? null}
          claimId={evidenceFor.claimId ?? null}
          onDone={refresh}
        />
      )}
    </div>
  );
}
