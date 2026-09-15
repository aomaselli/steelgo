import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  Download,
  Landmark,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { paymentStatusMeta, type PaymentInternalStatus } from "@/lib/paymentStatus";
import {
  counterpartyLabel,
  computeLedgerKpis,
  fetchLedgerIntents,
  type LedgerIntent,
} from "@/lib/paymentLedger";

// Central financeira do EMBARCADOR e da TRANSPORTADORA, lendo o ledger
// (payment_intents). O escopo admin vive em AdminFinanceOps. A tabela legada
// public.payments nao e mais consultada em lugar nenhum.
//
// KPIs honestos: nenhum indicador soma tudo como se fosse dinheiro movimentado.
//   contratado  = Σ de todas as intents (custo/receita contratada)
//   protegido   = aporte confirmado ainda nao repassado (funding_confirmed +
//                 release_requested)
//   pago/recebido = repasse confirmado (released_confirmed)
//   pendencia   = falha, reconciliacao, disputa e (para o embarcador) aporte
//                 solicitado sem confirmacao

type FinanceScope = "shipper" | "carrier";

const STATUS_FILTERS: { id: "all" | PaymentInternalStatus; labelKey: string }[] = [
  { id: "all", labelKey: "statusAll" },
  { id: "pending_provider", labelKey: "statusPendingProvider" },
  { id: "awaiting_funding", labelKey: "statusAwaitingFunding" },
  { id: "funding_confirmed", labelKey: "statusFundingConfirmed" },
  { id: "release_requested", labelKey: "statusReleaseRequested" },
  { id: "released_confirmed", labelKey: "statusReleasedConfirmed" },
  { id: "failed", labelKey: "statusFailed" },
  { id: "reconciliation_required", labelKey: "statusReconciliation" },
];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

export function FinanceCenter({ scope }: { scope: FinanceScope }) {
  const { company } = useAuth();
  const { t } = useLanguage();
  const companyId = company?.id;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const light = scope === "carrier";

  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["ledger-intents", scope, companyId],
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: () => fetchLedgerIntents(scope, companyId),
  });

  const kpis = useMemo(() => computeLedgerKpis(rows), [rows]);
  const metrics =
    scope === "carrier"
      ? [kpis.contractedNet, kpis.protectedNet, kpis.confirmedNet, kpis.issueGross]
      : [
          kpis.contractedGross,
          kpis.protectedGross,
          kpis.confirmedGross,
          kpis.issueGross + kpis.awaitingFundingGross,
        ];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.internal_status !== status) return false;
      if (!term) return true;
      const hay = [
        row.id,
        row.contract_id,
        row.contracts.contract_number,
        row.internal_status,
        counterpartyLabel(row, "shipper"),
        counterpartyLabel(row, "carrier"),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search, status]);

  const labelKeys =
    scope === "carrier"
      ? [
          "metricCarrierContracted",
          "metricCarrierReceivable",
          "metricCarrierReceived",
          "metricCarrierPending",
        ]
      : [
          "metricShipperContracted",
          "metricShipperProtected",
          "metricShipperPaid",
          "metricShipperPending",
        ];
  const labels = labelKeys.map((key) => t(`financeCenter.${key}`));
  const metricIcons = [WalletCards, ShieldCheck, Landmark, AlertTriangle];
  const metricColors = ["text-[#16263F]", "text-[#1B6CB8]", "text-[#2FA98A]", "text-[#B74545]"];
  const shell = light
    ? "border-[#E6EAF0] bg-white text-[#16263F] shadow-[0_8px_24px_rgba(16,28,48,0.06)]"
    : "border-[#30363D] bg-[#161B22] text-[#E6EDF3]";
  const muted = light ? "text-[#5B6B80]" : "text-[#8B949E]";
  const divider = light ? "border-[#E6EAF0]" : "border-[#30363D]";

  function counterpart(row: LedgerIntent) {
    return scope === "carrier"
      ? counterpartyLabel(row, "shipper")
      : counterpartyLabel(row, "carrier");
  }

  function exportCsv() {
    const header = [
      "contrato",
      "contraparte",
      "estado",
      "valor_bruto",
      "repasse_transportadora",
      "taxa_plataforma",
      "solicitado_em",
      "aporte_confirmado_em",
      "repasse_confirmado_em",
    ];
    const body = filtered.map((row) => [
      row.contracts.contract_number ?? row.contract_id,
      counterpart(row),
      row.internal_status,
      Number(row.gross_amount),
      Number(row.carrier_net_amount),
      Number(row.platform_fee_amount),
      row.requested_at ?? "",
      row.funding_confirmed_at ?? "",
      row.released_confirmed_at ?? "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((value) => JSON.stringify(value)).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "steelgo-financeiro.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={"text-2xl font-bold " + (light ? "text-[#16263F]" : "text-[#E6EDF3]")}>
            {t("financeCenter.title")}
          </h1>
          <p className={"mt-1 text-sm " + muted}>{t("financeCenter.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className={
            "inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium " +
            divider
          }
        >
          <Download className="h-4 w-4" /> {t("financeCenter.exportCsv")}
        </button>
      </div>

      <p className={"text-xs " + muted}>{t("financeCenter.honestyNote")}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {labels.map((label, index) => {
          const Icon = metricIcons[index];
          return (
            <div key={label} className={"rounded-[14px] border p-5 " + shell}>
              <div className="flex items-center justify-between gap-3">
                <span className={"text-xs uppercase tracking-wide " + muted}>{label}</span>
                <Icon className={"h-5 w-5 " + metricColors[index]} />
              </div>
              <div className={"mt-3 text-2xl font-bold tabular-nums " + metricColors[index]}>
                {formatBRL(metrics[index])}
              </div>
            </div>
          );
        })}
      </div>

      <section className={"overflow-hidden rounded-[16px] border " + shell}>
        <div className={"border-b p-5 " + divider}>
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <Search className={"absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 " + muted} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("financeCenter.searchPlaceholder")}
                className={
                  "h-10 w-full rounded-[10px] border bg-transparent pl-9 pr-3 text-sm outline-none focus:border-[#1B6CB8] " +
                  divider
                }
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={
                "h-10 rounded-[10px] border bg-transparent px-3 text-sm outline-none " + divider
              }
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {t(`financeCenter.${f.labelKey}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead
              className={"border-b text-[11px] uppercase tracking-wide " + divider + " " + muted}
            >
              <tr>
                <th className="px-5 py-3">{t("financeCenter.colContract")}</th>
                <th className="px-3 py-3">{t("financeCenter.colCounterpart")}</th>
                <th className="px-3 py-3">{t("financeCenter.colStatus")}</th>
                <th className="px-3 py-3">{t("financeCenter.colRequested")}</th>
                <th className="px-3 py-3">{t("financeCenter.colReleased")}</th>
                <th className="px-3 py-3 text-right">{t("financeCenter.colPayout")}</th>
                <th className="px-5 py-3 text-right">{t("financeCenter.colValue")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const meta = paymentStatusMeta(row.internal_status);
                return (
                  <tr key={row.id} className={"border-b last:border-b-0 " + divider}>
                    <td className="px-5 py-4 font-mono text-xs text-[#1B6CB8]">
                      {row.contracts.contract_number ??
                        "#" + row.contract_id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-3 py-4 text-xs">{counterpart(row)}</td>
                    <td className="px-3 py-4">
                      <span className={"rounded-full px-2 py-1 text-xs font-medium " + meta.cls}>
                        {meta.label}
                      </span>
                    </td>
                    <td className={"px-3 py-4 " + muted}>{dateLabel(row.requested_at)}</td>
                    <td className={"px-3 py-4 " + muted}>{dateLabel(row.released_confirmed_at)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {formatBRL(Number(row.carrier_net_amount))}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">
                      {formatBRL(Number(row.gross_amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && !isError && filtered.length === 0 && (
          <div
            className={
              "flex min-h-56 flex-col items-center justify-center gap-2 px-6 py-12 text-center " +
              muted
            }
          >
            <Banknote className="h-8 w-8" />
            <p className="font-medium">{t("financeCenter.emptyTitle")}</p>
            <p className="text-xs">{t("financeCenter.emptyDesc")}</p>
          </div>
        )}
        {isLoading && (
          <div className={"px-6 py-12 text-center text-sm " + muted}>
            {t("financeCenter.loading")}
          </div>
        )}
        {isError && (
          <div className="px-6 py-12 text-center text-sm text-[#B74545]">
            {t("financeCenter.error")}
          </div>
        )}
      </section>
    </div>
  );
}
