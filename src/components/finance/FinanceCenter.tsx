import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  Landmark,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";

type FinanceScope = "admin" | "shipper" | "carrier";

type FinanceRow = {
  id: string;
  contractId: string;
  status: string;
  gross: number;
  carrierPayout: number;
  platformFee: number;
  createdAt: string | null;
  releasedAt: string | null;
};

const STATUS_KEY: Record<string, string> = {
  pending: "statusPending",
  escrow_held: "statusEscrowHeld",
  released: "statusReleased",
  refunded: "statusRefunded",
  disputed: "statusDisputed",
  failed: "statusFailed",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[#E0A23A]/15 text-[#A66B0A]",
  escrow_held: "bg-[#1B6CB8]/10 text-[#1B6CB8]",
  released: "bg-[#2FA98A]/10 text-[#1A7D60]",
  refunded: "bg-[#5B6B80]/10 text-[#5B6B80]",
  disputed: "bg-[#B74545]/10 text-[#B74545]",
  failed: "bg-[#B74545]/10 text-[#B74545]",
};

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

function metricLabelKeys(scope: FinanceScope) {
  if (scope === "carrier") {
    return ["metricCarrierContracted", "metricCarrierReceivable", "metricCarrierReceived", "metricCarrierPending"];
  }
  if (scope === "shipper") {
    return ["metricShipperContracted", "metricShipperProtected", "metricShipperPaid", "metricShipperPending"];
  }
  return ["metricAdminMoved", "metricAdminProtected", "metricAdminRevenue", "metricAdminPending"];
}

export function FinanceCenter({ scope }: { scope: FinanceScope }) {
  const { company } = useAuth();
  const { t } = useLanguage();
  const companyId = company?.id;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const light = scope === "admin" || scope === "carrier";

  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ["finance-center", scope, companyId],
    enabled: scope === "admin" || Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<FinanceRow[]> => {
      let query = supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);

      if (scope === "shipper") query = query.eq("shipper_company_id", companyId!);
      if (scope === "carrier") query = query.eq("carrier_company_id", companyId!);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((payment: any) => {
        const gross = Number(payment.amount_brl ?? payment.total_amount_brl ?? 0);
        const carrierPayout = Number(payment.carrier_payout_brl ?? 0);
        const explicitFee = Number(payment.platform_fee_brl ?? 0);
        return {
          id: payment.id,
          contractId: payment.contract_id ?? "",
          status: payment.status ?? "pending",
          gross,
          carrierPayout,
          platformFee: explicitFee || Math.max(0, gross - carrierPayout),
          createdAt: payment.created_at ?? null,
          releasedAt: payment.released_at ?? null,
        };
      });
    },
  });

  const metrics = useMemo(() => {
    const gross = rows.reduce((sum, row) => sum + row.gross, 0);
    const held = rows.filter((row) => row.status === "escrow_held").reduce((sum, row) => sum + row.gross, 0);
    const releasedGross = rows.filter((row) => row.status === "released").reduce((sum, row) => sum + row.gross, 0);
    const releasedPayout = rows.filter((row) => row.status === "released").reduce((sum, row) => sum + row.carrierPayout, 0);
    const platformRevenue = rows.filter((row) => row.status === "released").reduce((sum, row) => sum + row.platformFee, 0);
    const issueValue = rows.filter((row) => row.status === "disputed" || row.status === "failed").reduce((sum, row) => sum + row.gross, 0);
    return {
      first: scope === "carrier" ? rows.reduce((sum, row) => sum + row.carrierPayout, 0) : gross,
      second: scope === "carrier" ? rows.filter((row) => row.status === "escrow_held" || row.status === "pending").reduce((sum, row) => sum + row.carrierPayout, 0) : held,
      third: scope === "admin" ? platformRevenue : scope === "carrier" ? releasedPayout : releasedGross,
      fourth: issueValue,
    };
  }, [rows, scope]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!term) return true;
      return (row.id + " " + row.contractId + " " + row.status).toLowerCase().includes(term);
    });
  }, [rows, search, status]);

  const labels = metricLabelKeys(scope).map((key) => t(`financeCenter.${key}`));
  const metricValues = [metrics.first, metrics.second, metrics.third, metrics.fourth];
  const metricIcons = [WalletCards, ShieldCheck, Landmark, AlertTriangle];
  const metricColors = ["text-[#16263F]", "text-[#1B6CB8]", "text-[#2FA98A]", "text-[#B74545]"];
  const shell = light
    ? "border-[#E6EAF0] bg-white text-[#16263F] shadow-[0_8px_24px_rgba(16,28,48,0.06)]"
    : "border-[#30363D] bg-[#161B22] text-[#E6EDF3]";
  const muted = light ? "text-[#5B6B80]" : "text-[#8B949E]";
  const divider = light ? "border-[#E6EAF0]" : "border-[#30363D]";

  function exportCsv() {
    const header = ["pagamento", "contrato", "status", "valor_bruto", "repasse_transportadora", "taxa_plataforma", "criado_em", "liberado_em"];
    const body = filtered.map((row) => [row.id, row.contractId, row.status, row.gross, row.carrierPayout, row.platformFee, row.createdAt ?? "", row.releasedAt ?? ""]);
    const csv = [header, ...body].map((line) => line.map((value) => JSON.stringify(value)).join(",")).join("\n");
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
          <h1 className={"text-2xl font-bold " + (light ? "text-[#16263F]" : "text-[#E6EDF3]")}>{t("financeCenter.title")}</h1>
          <p className={"mt-1 text-sm " + muted}>{t("financeCenter.subtitle")}</p>
        </div>
        <button type="button" onClick={exportCsv} className={"inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium " + divider}>
          <Download className="h-4 w-4" /> {t("financeCenter.exportCsv")}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {labels.map((label, index) => {
          const Icon = metricIcons[index];
          return (
            <div key={label} className={"rounded-[14px] border p-5 " + shell}>
              <div className="flex items-center justify-between gap-3">
                <span className={"text-xs uppercase tracking-wide " + muted}>{label}</span>
                <Icon className={"h-5 w-5 " + metricColors[index]} />
              </div>
              <div className={"mt-3 text-2xl font-bold tabular-nums " + metricColors[index]}>{formatBRL(metricValues[index])}</div>
            </div>
          );
        })}
      </div>

      <section className={"overflow-hidden rounded-[16px] border " + shell}>
        <div className={"border-b p-5 " + divider}>
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <Search className={"absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 " + muted} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("financeCenter.searchPlaceholder")} className={"h-10 w-full rounded-[10px] border bg-transparent pl-9 pr-3 text-sm outline-none focus:border-[#1B6CB8] " + divider} />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={"h-10 rounded-[10px] border bg-transparent px-3 text-sm outline-none " + divider}>
              <option value="all">{t("financeCenter.statusAll")}</option>
              <option value="pending">{t("financeCenter.statusPending")}</option>
              <option value="escrow_held">{t("financeCenter.statusEscrowHeld")}</option>
              <option value="released">{t("financeCenter.statusReleased")}</option>
              <option value="disputed">{t("financeCenter.statusDisputed")}</option>
              <option value="failed">{t("financeCenter.statusFailed")}</option>
              <option value="refunded">{t("financeCenter.statusRefunded")}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={"border-b text-[11px] uppercase tracking-wide " + divider + " " + muted}>
              <tr><th className="px-5 py-3">{t("financeCenter.colPayment")}</th><th className="px-3 py-3">{t("financeCenter.colContract")}</th><th className="px-3 py-3">{t("financeCenter.colStatus")}</th><th className="px-3 py-3">{t("financeCenter.colCreated")}</th><th className="px-3 py-3">{t("financeCenter.colReleased")}</th><th className="px-3 py-3 text-right">{t("financeCenter.colPayout")}</th><th className="px-5 py-3 text-right">{t("financeCenter.colValue")}</th></tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className={"border-b last:border-b-0 " + divider}>
                  <td className="px-5 py-4 font-mono text-xs text-[#1B6CB8]">#{row.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-3 py-4 font-mono text-xs">#{row.contractId.slice(0, 8).toUpperCase()}</td>
                  <td className="px-3 py-4"><span className={"rounded-full px-2 py-1 text-xs font-medium " + (STATUS_STYLE[row.status] ?? STATUS_STYLE.pending)}>{t(`financeCenter.${STATUS_KEY[row.status] ?? "statusPending"}`)}</span></td>
                  <td className={"px-3 py-4 " + muted}>{dateLabel(row.createdAt)}</td>
                  <td className={"px-3 py-4 " + muted}>{dateLabel(row.releasedAt)}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{formatBRL(row.carrierPayout)}</td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums">{formatBRL(row.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && !isError && filtered.length === 0 && (
          <div className={"flex min-h-56 flex-col items-center justify-center gap-2 px-6 py-12 text-center " + muted}>
            <Banknote className="h-8 w-8" />
            <p className="font-medium">{t("financeCenter.emptyTitle")}</p>
            <p className="text-xs">{t("financeCenter.emptyDesc")}</p>
          </div>
        )}
        {isLoading && <div className={"px-6 py-12 text-center text-sm " + muted}>{t("financeCenter.loading")}</div>}
        {isError && <div className="px-6 py-12 text-center text-sm text-[#B74545]">{t("financeCenter.error")}</div>}
      </section>
    </div>
  );
}
