import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Button, Card, EmptyState, Spinner } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { formatBRL } from "@/lib/steel";

const FILTERS = [
  { id: "all", labelKey: "filterAll", statuses: null as string[] | null },
  { id: "signing", labelKey: "filterSigning", statuses: ["awaiting_shipper_signature", "awaiting_carrier_signature", "draft"] },
  { id: "active", labelKey: "filterActive", statuses: ["active"] },
  { id: "completed", labelKey: "filterCompleted", statuses: ["completed"] },
  { id: "disputed", labelKey: "filterDisputed", statuses: ["disputed"] },
];

export function CarrierContractsPage() {
  const { company } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const f = FILTERS.find((x) => x.id === filter)!;

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-contracts-page", company?.id, filter],
    enabled: !!company?.id,
    queryFn: async () => {
      let q = supabase
        .from("contracts")
        .select("*, freights(id, origin_city, dest_city), shipper_company:shipper_company_id (name)")
        .eq("carrier_company_id", company!.id)
        .order("created_at", { ascending: false });
      if (f.statuses) q = q.in("status", f.statuses as never);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <AppShell title={t("carrierContracts.pageTitle")}>
      <div className="p-6 space-y-6 bg-[#F4F7FB]">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((x) => (
            <button
              key={x.id}
              onClick={() => setFilter(x.id)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                filter === x.id
                  ? "bg-[#EAF1FF] text-[#154A8C] border border-[#C6D5E7]"
                  : "bg-white text-[#5B6B80] border border-[#DDE7F2] hover:text-[#10274A]"
              }`}
            >
              {t(`carrierContracts.${x.labelKey}`)}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden border-[#DDE7F2] bg-white shadow-[0_8px_22px_rgba(16,39,74,0.04)]">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : !data?.length ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 border border-[#E3EAF3] bg-[#F8FAFD] px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF2FF] text-[#1B6CB8]">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-[#10274A]">{t("carrierContracts.emptyTitle")}</h3>
              <p className="max-w-md text-sm text-[#5B6B80]">{t("carrierContracts.emptyDesc")}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#F4F7FB] text-xs uppercase text-[#5B6B80]">
                <tr>
                  <th className="text-left px-4 py-2">{t("carrierContracts.colNumber")}</th>
                  <th className="text-left px-4 py-2">{t("carrierContracts.colRoute")}</th>
                  <th className="text-left px-4 py-2">{t("carrierContracts.colShipper")}</th>
                  <th className="text-right px-4 py-2">{t("carrierContracts.colValue")}</th>
                  <th className="text-left px-4 py-2">{t("carrierContracts.colStatus")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const fr = c.freights as { id?: string; origin_city?: string; dest_city?: string } | null;
                  const sh = (c as { shipper_company?: { name?: string } | null }).shipper_company;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[#E6EAF0] hover:bg-[#F4F7FB] cursor-pointer"
                      onClick={() => navigate({ to: "/carrier/contracts/$id", params: { id: String(c.id) } })}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[#1B6CB8]">{c.contract_number ?? String(c.id).slice(0, 8)}</td>
                      <td className="px-4 py-3 text-[#10274A]">{fr?.origin_city ?? "—"} → {fr?.dest_city ?? "—"}</td>
                      <td className="px-4 py-3 text-[#2C3E50]">{sh?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatBRL(c.total_amount_brl)}</td>
                      <td className="px-4 py-3"><StatusPill status={c.status ?? "draft"} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm">{t("carrierContracts.viewCta")}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
