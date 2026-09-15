import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Landmark,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { formatBRL } from "@/lib/steel";
import { cn } from "@/lib/utils";
import {
  ATTESTATION_NOTICE,
  paymentStatusMeta,
  type PaymentInternalStatus,
} from "@/lib/paymentStatus";
import {
  counterpartyLabel,
  computeLedgerKpis,
  fetchIntentDetail,
  fetchLedgerIntents,
  fetchPendingReconciliations,
  fetchUnlinkedEvidence,
  routeLabel,
  type LedgerIntent,
  type ReconciliationRow,
  type TransactionRow,
} from "@/lib/paymentLedger";
import { AttestationModal, type AttestationKind } from "./AttestationModal";
import {
  OpenReconciliationModal,
  PaymentFailureModal,
  ResolveReconciliationModal,
  RetryPaymentModal,
} from "./PaymentActionModals";

// Operacao financeira administrativa. Le o LEDGER (nunca public.payments) e
// escreve exclusivamente por RPC. Toda confirmacao aqui e atestacao humana.

type Queue = "funding" | "release" | "failed" | "reconciliation" | "done" | "all";

const QUEUES: { id: Queue; label: string }[] = [
  { id: "funding", label: "Aporte aguardando atestação" },
  { id: "release", label: "Liberação aguardando atestação" },
  { id: "failed", label: "Falhas" },
  { id: "reconciliation", label: "Reconciliação pendente" },
  { id: "done", label: "Concluídos" },
  { id: "all", label: "Todos" },
];

const shell = "border-[#E6EAF0] bg-white text-[#16263F] shadow-[0_8px_24px_rgba(16,28,48,0.06)]";
const muted = "text-[#5B6B80]";
const divider = "border-[#E6EAF0]";

function dateTime(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

type ModalState =
  | { kind: "attest"; intent: LedgerIntent; stage: AttestationKind; tx: TransactionRow }
  | { kind: "fail"; intent: LedgerIntent; stage: AttestationKind }
  | { kind: "retry"; intent: LedgerIntent; failedKind: string | null }
  | { kind: "open-rec"; intent: LedgerIntent }
  | { kind: "resolve-rec"; intent: LedgerIntent; reconciliation: ReconciliationRow }
  | null;

export function AdminFinanceOps() {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<Queue>("funding");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const intents = useQuery({
    queryKey: ["ledger-intents", "admin"],
    queryFn: () => fetchLedgerIntents("admin"),
    refetchInterval: 60_000,
  });
  const pendingRec = useQuery({
    queryKey: ["ledger-reconciliations-pending"],
    queryFn: fetchPendingReconciliations,
    refetchInterval: 60_000,
  });
  const unlinked = useQuery({
    queryKey: ["ledger-unlinked-evidence"],
    queryFn: fetchUnlinkedEvidence,
    refetchInterval: 120_000,
  });

  const rows = useMemo(() => intents.data ?? [], [intents.data]);
  const kpis = useMemo(() => computeLedgerKpis(rows), [rows]);
  const pendingByContract = useMemo(() => {
    const m = new Map<string, ReconciliationRow[]>();
    for (const r of pendingRec.data ?? [])
      if (r.contract_id) m.set(r.contract_id, [...(m.get(r.contract_id) ?? []), r]);
    return m;
  }, [pendingRec.data]);

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["ledger-intents"] });
    qc.invalidateQueries({ queryKey: ["ledger-reconciliations-pending"] });
    qc.invalidateQueries({ queryKey: ["ledger-intent-detail"] });
    qc.invalidateQueries({ queryKey: ["ledger-unlinked-evidence"] });
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = r.internal_status as PaymentInternalStatus;
      const inQueue =
        queue === "all" ||
        (queue === "funding" && s === "awaiting_funding") ||
        (queue === "release" && s === "release_requested") ||
        (queue === "failed" && s === "failed") ||
        (queue === "reconciliation" &&
          (s === "reconciliation_required" || pendingByContract.has(r.contract_id))) ||
        (queue === "done" && (s === "released_confirmed" || s === "funding_confirmed"));
      if (!inQueue) return false;
      if (!term) return true;
      const hay = [
        r.contracts.contract_number,
        r.contract_id,
        counterpartyLabel(r, "shipper"),
        counterpartyLabel(r, "carrier"),
        r.internal_status,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, queue, search, pendingByContract]);

  const counts = useMemo(() => {
    const c: Record<Queue, number> = {
      funding: 0,
      release: 0,
      failed: 0,
      reconciliation: 0,
      done: 0,
      all: rows.length,
    };
    for (const r of rows) {
      const s = r.internal_status as PaymentInternalStatus;
      if (s === "awaiting_funding") c.funding++;
      if (s === "release_requested") c.release++;
      if (s === "failed") c.failed++;
      if (s === "reconciliation_required" || pendingByContract.has(r.contract_id))
        c.reconciliation++;
      if (s === "released_confirmed" || s === "funding_confirmed") c.done++;
    }
    return c;
  }, [rows, pendingByContract]);

  const kpiCards = [
    {
      label: "Aporte aguardando atestação",
      value: kpis.awaitingFundingGross,
      sub: `${kpis.awaitingFundingCount} solicitação(ões)`,
      icon: WalletCards,
      color: "text-[#A66B0A]",
    },
    {
      label: "Liberação aguardando atestação",
      value: kpis.awaitingReleaseGross,
      sub: `${kpis.awaitingReleaseCount} solicitação(ões)`,
      icon: Banknote,
      color: "text-[#A66B0A]",
    },
    {
      label: "Em custódia (aporte confirmado)",
      value: kpis.protectedGross,
      sub: "funding_confirmed + release_requested",
      icon: Landmark,
      color: "text-[#1B6CB8]",
    },
    {
      label: "Repasses confirmados",
      value: kpis.confirmedGross,
      sub: `Receita SteelGo confirmada ${formatBRL(kpis.confirmedFee)}`,
      icon: FileCheck2,
      color: "text-[#1A7D60]",
    },
    {
      label: "Com pendência",
      value: kpis.issueGross,
      sub: `${kpis.issueCount} pagamento(s): falha, reconciliação ou disputa`,
      icon: AlertTriangle,
      color: "text-[#B74545]",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#16263F]">Operação financeira</h1>
          <p className={"mt-1 text-sm " + muted}>
            Atestação de aportes e repasses, falhas, retries e reconciliação — tudo por RPC, com
            trilha append-only.
          </p>
        </div>
        <button
          type="button"
          onClick={refetchAll}
          className={
            "inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium " +
            divider
          }
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <div className="rounded-[12px] border border-[#E0A23A]/40 bg-[#FDF6E9] px-4 py-3 flex gap-3">
        <ShieldAlert className="h-5 w-5 flex-shrink-0 text-[#A66B0A]" />
        <p className="text-sm text-[#5A3E0A]">{ATTESTATION_NOTICE}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((k) => (
          <div key={k.label} className={"rounded-[14px] border p-5 " + shell}>
            <div className="flex items-center justify-between gap-3">
              <span className={"text-xs uppercase tracking-wide " + muted}>{k.label}</span>
              <k.icon className={"h-5 w-5 " + k.color} />
            </div>
            <div className={"mt-3 text-2xl font-bold tabular-nums " + k.color}>
              {formatBRL(k.value)}
            </div>
            <div className={"mt-1 text-xs " + muted}>{k.sub}</div>
          </div>
        ))}
      </div>

      <section className={"overflow-hidden rounded-[16px] border " + shell}>
        <div className={"border-b p-4 " + divider}>
          <div className="flex flex-wrap gap-2">
            {QUEUES.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQueue(q.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  queue === q.id
                    ? "border-[#1B6CB8] bg-[#1B6CB8]/10 text-[#1B6CB8]"
                    : "border-[#E6EAF0] text-[#5B6B80] hover:bg-[#F5F7FA]",
                )}
              >
                {q.label} <span className="ml-1 tabular-nums">{counts[q.id]}</span>
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contrato, empresa, estado…"
              className={
                "ml-auto h-9 min-w-[240px] rounded-[10px] border bg-transparent px-3 text-sm outline-none focus:border-[#1B6CB8] " +
                divider
              }
            />
          </div>
        </div>

        {intents.isLoading && (
          <div className={"px-6 py-12 text-center text-sm " + muted}>Carregando ledger…</div>
        )}
        {intents.isError && (
          <div className="px-6 py-12 text-center text-sm text-[#B74545]">
            Não foi possível consultar o ledger: {(intents.error as Error).message}
          </div>
        )}
        {!intents.isLoading && !intents.isError && filtered.length === 0 && (
          <div
            className={
              "flex min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center " +
              muted
            }
          >
            <Banknote className="h-8 w-8" />
            <p className="font-medium">Nenhum pagamento nesta fila.</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead
                className={"border-b text-[11px] uppercase tracking-wide " + divider + " " + muted}
              >
                <tr>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-3 py-3">Embarcadora → Transportadora</th>
                  <th className="px-3 py-3">Rota</th>
                  <th className="px-3 py-3 text-right">Bruto / taxa / líquido</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Solicitado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <IntentRow
                    key={r.id}
                    intent={r}
                    expanded={expanded === r.id}
                    onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                    pendingRecs={pendingByContract.get(r.contract_id) ?? []}
                    onAction={setModal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={"rounded-[16px] border p-5 " + shell}>
        <h2 className="text-base font-semibold">
          Comprovantes retidos para revisão administrativa
        </h2>
        <p className={"mt-1 text-xs " + muted}>
          Objetos enviados ao bucket <span className="font-mono">payment-evidence</span> que nenhuma
          transação confirmada referencia (ex.: atestação abandonada após o upload). Ficam retidos:
          nenhum cliente apaga ou sobrescreve comprovantes. A limpeza, quando houver, é procedimento
          administrativo com service_role, só para objetos com mais de 7 dias e sem referência.
        </p>
        {unlinked.isLoading && <p className={"mt-3 text-xs " + muted}>Verificando…</p>}
        {unlinked.isError && (
          <p className="mt-3 text-xs text-[#B74545]">
            Não foi possível listar: {(unlinked.error as Error).message}
          </p>
        )}
        {unlinked.data && unlinked.data.length === 0 && (
          <p className={"mt-3 text-xs " + muted}>Nenhum comprovante retido.</p>
        )}
        {unlinked.data && unlinked.data.length > 0 && (
          <ul className="mt-3 space-y-1">
            {unlinked.data.map((o) => (
              <li
                key={o.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#F5F7FA] px-3 py-2 text-xs"
              >
                <span className="font-mono break-all">{o.name}</span>
                <span className={muted}>
                  {o.size != null ? `${(o.size / 1024).toFixed(0)} KB · ` : ""}
                  {dateTime(o.created_at)} · retido
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal?.kind === "attest" && (
        <AttestationModal
          open
          onClose={() => setModal(null)}
          kind={modal.stage}
          contractId={modal.intent.contract_id}
          contractNumber={
            modal.intent.contracts.contract_number ?? modal.intent.contract_id.slice(0, 8)
          }
          transactionId={modal.tx.id}
          amount={Number(modal.intent.gross_amount)}
          onDone={refetchAll}
        />
      )}
      {modal?.kind === "fail" && (
        <PaymentFailureModal
          open
          onClose={() => setModal(null)}
          contractId={modal.intent.contract_id}
          contractNumber={
            modal.intent.contracts.contract_number ?? modal.intent.contract_id.slice(0, 8)
          }
          stage={modal.stage}
          onDone={refetchAll}
        />
      )}
      {modal?.kind === "retry" && (
        <RetryPaymentModal
          open
          onClose={() => setModal(null)}
          contractId={modal.intent.contract_id}
          contractNumber={
            modal.intent.contracts.contract_number ?? modal.intent.contract_id.slice(0, 8)
          }
          failedKind={modal.failedKind}
          amount={Number(modal.intent.gross_amount)}
          blockedByDispute={modal.intent.release_blocked_by_dispute}
          onDone={refetchAll}
        />
      )}
      {modal?.kind === "open-rec" && (
        <OpenReconciliationModal
          open
          onClose={() => setModal(null)}
          contractId={modal.intent.contract_id}
          contractNumber={
            modal.intent.contracts.contract_number ?? modal.intent.contract_id.slice(0, 8)
          }
          expectedAmount={Number(modal.intent.gross_amount)}
          onDone={refetchAll}
        />
      )}
      {modal?.kind === "resolve-rec" && (
        <ResolveReconciliationModal
          open
          onClose={() => setModal(null)}
          reconciliation={modal.reconciliation}
          contractNumber={
            modal.intent.contracts.contract_number ?? modal.intent.contract_id.slice(0, 8)
          }
          onDone={refetchAll}
        />
      )}
    </div>
  );
}

function IntentRow({
  intent,
  expanded,
  onToggle,
  pendingRecs,
  onAction,
}: {
  intent: LedgerIntent;
  expanded: boolean;
  onToggle: () => void;
  pendingRecs: ReconciliationRow[];
  onAction: (m: ModalState) => void;
}) {
  const s = intent.internal_status as PaymentInternalStatus;
  const meta = paymentStatusMeta(s);
  const detail = useQuery({
    queryKey: ["ledger-intent-detail", intent.id],
    queryFn: () => fetchIntentDetail(intent.id),
    enabled: expanded || s === "awaiting_funding" || s === "release_requested" || s === "failed",
  });
  const txs = detail.data?.transactions ?? [];
  const pendingTx = [...txs].reverse().find((t) => t.status === "requested");
  const lastTx = txs.length ? txs[txs.length - 1] : undefined;
  const num = intent.contracts.contract_number ?? intent.contract_id.slice(0, 8).toUpperCase();

  return (
    <>
      <tr className={"border-b align-top " + divider}>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 font-mono text-xs text-[#1B6CB8]"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {num}
          </button>
          <div className={"mt-1 text-[11px] " + muted}>
            contrato {intent.contracts.status ?? "—"}
            {intent.contracts.delivery_completed_at ? " · entrega concluída" : ""}
          </div>
        </td>
        <td className="px-3 py-3 text-xs">
          {counterpartyLabel(intent, "shipper")} → {counterpartyLabel(intent, "carrier")}
        </td>
        <td className={"px-3 py-3 text-xs " + muted}>{routeLabel(intent.contracts.freights)}</td>
        <td className="px-3 py-3 text-right tabular-nums text-xs">
          <div className="font-semibold">{formatBRL(Number(intent.gross_amount))}</div>
          <div className={muted}>
            {formatBRL(Number(intent.platform_fee_amount))} /{" "}
            {formatBRL(Number(intent.carrier_net_amount))}
          </div>
        </td>
        <td className="px-3 py-3">
          <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + meta.cls}>
            {meta.label}
          </span>
          {intent.release_blocked_by_dispute && (
            <div className="mt-1 text-[11px] text-[#B74545]">liberação suspensa por disputa</div>
          )}
          {pendingRecs.length > 0 && (
            <div className="mt-1 text-[11px] text-[#B74545]">
              {pendingRecs.length} reconciliação(ões) pendente(s)
            </div>
          )}
        </td>
        <td className={"px-3 py-3 text-xs " + muted}>
          <div>
            {dateTime(
              s === "release_requested" ? intent.release_requested_at : intent.requested_at,
            )}
          </div>
          {intent.funding_confirmed_at && (
            <div>aporte confirmado {dateTime(intent.funding_confirmed_at)}</div>
          )}
          {intent.released_confirmed_at && (
            <div>repasse confirmado {dateTime(intent.released_confirmed_at)}</div>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex flex-wrap justify-end gap-1">
            {s === "awaiting_funding" && pendingTx && (
              <button
                type="button"
                className="rounded-md bg-[#1A7D60] px-2.5 py-1 text-xs font-medium text-white"
                onClick={() =>
                  onAction({ kind: "attest", intent, stage: "funding", tx: pendingTx })
                }
              >
                Atestar aporte
              </button>
            )}
            {s === "release_requested" && pendingTx && !intent.release_blocked_by_dispute && (
              <button
                type="button"
                className="rounded-md bg-[#1A7D60] px-2.5 py-1 text-xs font-medium text-white"
                onClick={() =>
                  onAction({ kind: "attest", intent, stage: "release", tx: pendingTx })
                }
              >
                Atestar repasse
              </button>
            )}
            {(s === "awaiting_funding" || s === "release_requested") && (
              <button
                type="button"
                className="rounded-md border border-[#B74545]/40 px-2.5 py-1 text-xs font-medium text-[#B74545]"
                onClick={() =>
                  onAction({
                    kind: "fail",
                    intent,
                    stage: s === "awaiting_funding" ? "funding" : "release",
                  })
                }
              >
                Registrar falha
              </button>
            )}
            {s === "failed" && (
              <button
                type="button"
                className="rounded-md bg-[#1B6CB8] px-2.5 py-1 text-xs font-medium text-white"
                onClick={() =>
                  onAction({ kind: "retry", intent, failedKind: lastTx?.kind ?? null })
                }
              >
                Refazer solicitação
              </button>
            )}
            {(s === "awaiting_funding" ||
              s === "funding_confirmed" ||
              s === "release_requested" ||
              s === "released_confirmed") &&
              pendingRecs.length === 0 && (
                <button
                  type="button"
                  className="rounded-md border border-[#E6EAF0] px-2.5 py-1 text-xs font-medium text-[#5B6B80]"
                  onClick={() => onAction({ kind: "open-rec", intent })}
                >
                  Abrir reconciliação
                </button>
              )}
            {pendingRecs.map((rec) => (
              <button
                key={rec.id}
                type="button"
                className="rounded-md bg-[#A66B0A] px-2.5 py-1 text-xs font-medium text-white"
                onClick={() => onAction({ kind: "resolve-rec", intent, reconciliation: rec })}
              >
                Resolver reconciliação
              </button>
            ))}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className={"border-b bg-[#F9FAFC] " + divider}>
          <td colSpan={7} className="px-6 py-4">
            {detail.isLoading && <p className={"text-xs " + muted}>Carregando trilha…</p>}
            {detail.isError && (
              <p className="text-xs text-[#B74545]">
                Não foi possível carregar a trilha: {(detail.error as Error).message}
              </p>
            )}
            {detail.data && <IntentDetail data={detail.data} />}
          </td>
        </tr>
      )}
    </>
  );
}

function IntentDetail({ data }: { data: Awaited<ReturnType<typeof fetchIntentDetail>> }) {
  const allocByTx = new Map<string, typeof data.allocations>();
  for (const a of data.allocations)
    allocByTx.set(a.transaction_id, [...(allocByTx.get(a.transaction_id) ?? []), a]);
  return (
    <div className="grid gap-4 lg:grid-cols-2 text-xs">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Transações e alocações</h4>
        {data.transactions.length === 0 && <p className={muted}>Nenhuma transação.</p>}
        <ul className="space-y-2">
          {data.transactions.map((t) => (
            <li key={t.id} className="rounded-md border border-[#E6EAF0] bg-white p-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-semibold">{t.kind}</span> · {t.status} ·{" "}
                  {formatBRL(Number(t.amount))}
                </span>
                <span className={muted}>{dateTime(t.requested_at)}</span>
              </div>
              {t.status === "confirmed" && (
                <div className={"mt-1 " + muted}>
                  confirmado {dateTime(t.confirmed_at)} · método{" "}
                  <span className="font-mono">{t.confirmation_method}</span> · ref. externa{" "}
                  <span className="font-mono">{t.external_reference}</span>
                  {t.confirmation_method === "manual_admin" && (
                    <div className="mt-1 space-y-0.5">
                      <div>
                        comprovante:{" "}
                        <span className="font-mono break-all">{t.confirmation_evidence_ref}</span>
                      </div>
                      <div>
                        sha-256 declarado pelo administrador:{" "}
                        <span className="font-mono">
                          {t.confirmation_evidence_hash?.slice(0, 24)}…
                        </span>
                      </div>
                      <div>
                        registrado pelo Storage — tipo {t.confirmation_evidence_mime} ·{" "}
                        {t.confirmation_evidence_size_bytes} bytes · id opaco{" "}
                        <span className="font-mono">
                          {t.confirmation_evidence_etag?.slice(0, 18)}…
                        </span>
                      </div>
                      <div>nota: {t.confirmation_note}</div>
                    </div>
                  )}
                </div>
              )}
              {t.status === "failed" && (
                <div className="mt-1 text-[#B74545]">
                  falha {t.failure_code}: {t.failure_reason}
                </div>
              )}
              {(allocByTx.get(t.id) ?? []).length > 0 && (
                <div className={"mt-1 " + muted}>
                  alocações:{" "}
                  {(allocByTx.get(t.id) ?? [])
                    .map((a) => `${a.party_kind} ${formatBRL(Number(a.amount))}`)
                    .join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
        {data.reconciliations.length > 0 && (
          <>
            <h4 className="mb-2 mt-4 text-sm font-semibold">Reconciliações</h4>
            <ul className="space-y-1">
              {data.reconciliations.map((r) => (
                <li key={r.id} className="rounded-md border border-[#E6EAF0] bg-white p-2">
                  <span className="font-semibold">{r.source}</span> · {r.status} · esperado{" "}
                  {formatBRL(Number(r.expected_amount))}
                  {r.observed_amount != null
                    ? ` · observado ${formatBRL(Number(r.observed_amount))}`
                    : ""}
                  <div className={muted}>
                    aberta {dateTime(r.opened_at)}
                    {r.resolved_at
                      ? ` · resolvida ${dateTime(r.resolved_at)}: ${r.resolution_note}`
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">Histórico (append-only)</h4>
        <ol className="space-y-1">
          {data.events.map((e) => (
            <li key={e.id} className="rounded-md border border-[#E6EAF0] bg-white p-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-semibold">{e.event_type}</span> → {e.new_status}
                </span>
                <span className={muted}>{dateTime(e.created_at)}</span>
              </div>
              <div className={muted}>
                {e.source} · {e.actor_kind}
                {e.confirmation_method ? ` · ${e.confirmation_method}` : ""}
                {e.external_reference ? ` · ${e.external_reference}` : ""}
              </div>
              {e.note && <div className="mt-0.5">{e.note}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
