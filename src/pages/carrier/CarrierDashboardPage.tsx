import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, MapPin, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Button, Card, EmptyState, Spinner } from "@/components/steel";
import { GreenFreightTag } from "@/components/steel/GreenFreightTag";
import { StatusPill } from "@/components/steel/StatusPill";
import { steelLabel, formatBRL, formatNum } from "@/lib/steel";
import { OperationsBoard } from "@/components/operations/OperationsBoard";

export function CarrierDashboardPage() {
  const { profile, company } = useAuth();
  const { t } = useLanguage();
  const firstName = profile?.full_name?.split(" ")[0] ?? "transportadora";

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("carriers")
        .select("*")
        .eq("company_id", company!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: score } = useQuery({
    queryKey: ["carrier-score", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("carrier_scores")
        .select("*")
        .eq("carrier_id", carrier!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: metrics } = useQuery({
    queryKey: ["carrier-dashboard-metrics", carrier?.id, company?.id],
    enabled: !!carrier?.id && !!company?.id,
    queryFn: async () => {
      const monthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();
      const [bidsRes, activeRes, payoutRes] = await Promise.all([
        supabase
          .from("bids")
          .select("id", { count: "exact", head: true })
          .eq("carrier_id", carrier!.id)
          .gte("submitted_at", monthStart),
        supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("carrier_company_id", company!.id)
          .eq("status", "active"),
        supabase
          .from("payments")
          .select("carrier_payout_brl")
          .eq("carrier_company_id", company!.id)
          .eq("status", "escrow_held"),
      ]);
      return {
        bidsCount: bidsRes.count ?? 0,
        activeCount: activeRes.count ?? 0,
        payout: (payoutRes.data ?? []).reduce(
          (s, r) => s + Number(r.carrier_payout_brl ?? 0),
          0,
        ),
      };
    },
  });

  const { data: availableFreights, isLoading: loadingFreights } = useQuery({
    queryKey: ["carrier-available-freights", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      let q = supabase
        .from("freights")
        .select("*")
        .in("status", ["published", "bidding"])
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(3);
      if (carrier?.operating_states?.length) {
        q = q.in("origin_state", carrier.operating_states);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: activeDeliveries } = useQuery({
    queryKey: ["carrier-active-deliveries", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select(
          "*, freights(origin_city, origin_state, dest_city, dest_state, steel_type), drivers(full_name)",
        )
        .eq("carrier_company_id", company!.id)
        .eq("status", "active")
        .limit(5);
      return data ?? [];
    },
  });

  const { data: recentPayouts } = useQuery({
    queryKey: ["carrier-recent-payouts", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, carrier_payout_brl, released_at, contract_id")
        .eq("carrier_company_id", company!.id)
        .eq("status", "released")
        .order("released_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const overall = Number(score?.overall_score ?? 0);
  const scoreColor =
    overall >= 8.5
      ? "text-[#2ECC8A]"
      : overall >= 7
        ? "text-[#3B89D4]"
        : "text-[#F0A500]";

  return (
    <div className="space-y-8 bg-[#F4F7FB]">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10274A]">
            {t("carrierDashboard.greeting")} {firstName}!
          </h1>
          <p className="mt-1 text-sm text-[#5B6B80]">
            {t("carrierDashboard.subtitle")}
          </p>
        </div>
        <Link to="/carrier/marketplace">
          <Button>
            {t("carrierDashboard.viewMarketplace")} <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border border-[#E3EAF3] bg-white p-5 shadow-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#5B6B80]">
            {t("carrierDashboard.bidsSent")}
          </div>
          <div className="text-3xl font-bold tabular-nums text-[#1B6CB8]">
            {formatNum(metrics?.bidsCount ?? 0)}
          </div>
        </Card>
        <Card className="border border-[#E3EAF3] bg-white p-5 shadow-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#5B6B80]">
            {t("carrierDashboard.activeFreights")}
          </div>
          <div className="text-3xl font-bold tabular-nums text-[#E0A23A]">
            {formatNum(metrics?.activeCount ?? 0)}
          </div>
        </Card>
        <Card className="border border-[#E3EAF3] bg-white p-5 shadow-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#5B6B80]">
            {t("carrierDashboard.receivable")}
          </div>
          <div className="text-3xl font-bold tabular-nums text-[#1A9B5E]">
            {formatBRL(metrics?.payout ?? 0)}
          </div>
        </Card>
        <Card className="border border-[#E3EAF3] bg-white p-5 shadow-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#5B6B80]">
            {t("carrierDashboard.myScore")}
          </div>
          <div className={`text-3xl font-bold tabular-nums ${scoreColor}`}>
            {score ? overall.toFixed(1) : "—"}
          </div>
          <div className="mt-1 text-xs capitalize text-[#5B6B80]">
            {score?.badge_tier ?? "standard"}
          </div>
        </Card>
      </div>

      <OperationsBoard scope="carrier" companyId={company?.id} />

      {/* Available Freights */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold text-[#10274A]">
            {t("carrierDashboard.availableFreightsHeading")}
          </h2>
          <Link
            to="/carrier/marketplace"
            className="text-xs text-[#3B89D4] hover:underline"
          >
            {t("carrierDashboard.viewAll")}
          </Link>
        </div>
        {loadingFreights ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : !availableFreights?.length ? (
          <Card className="p-6 border-[#E3EAF3] bg-white">
            <EmptyState
              icon={Truck}
              title={t("carrierDashboard.emptyFreightsTitle")}
              description={t("carrierDashboard.emptyFreightsDesc")}
              action={
                <Link to="/carrier/marketplace">
                  <Button>{t("carrierDashboard.goToMarketplace")}</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {availableFreights.map((f) => (
              <Link
                key={f.id}
                to="/carrier/marketplace"
                className="block bg-white border border-[#E3EAF3] hover:border-[#B7C6DA] rounded-[12px] p-4 transition"
              >
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-[#10274A] flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#3B89D4]" />
                      {f.origin_state ?? "—"} → {f.dest_state ?? "—"}
                    </div>
                    <div className="text-xs text-[#5B6B80] mt-1">
                      {steelLabel(f.steel_type)} · {formatNum(f.weight_tons)} t
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <GreenFreightTag category={f.category} />
                    {f.pickup_date && (
                      <div className="text-xs text-[#5B6B80]">
                        {t("carrierDashboard.collectDate")}{" "}
                        {new Date(f.pickup_date).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-medium text-[#2ECC8A] tabular-nums">
                        {f.budget_brl
                          ? formatBRL(f.budget_brl)
                          : t("carrierDashboard.open")}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      {t("carrierDashboard.view")}
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Active Deliveries */}
      <section>
        <h2 className="text-base font-semibold text-[#10274A] mb-3">
          {t("carrierDashboard.activeDeliveriesHeading")}
        </h2>
        {!activeDeliveries?.length ? (
          <Card className="p-6 border-[#E3EAF3] bg-white">
            <EmptyState
              icon={CheckCircle2}
              title={t("carrierDashboard.emptyDeliveriesTitle")}
              description={t("carrierDashboard.emptyDeliveriesDesc")}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {activeDeliveries.map((c) => {
              const f = (
                c as {
                  freights?: {
                    origin_city?: string;
                    dest_city?: string;
                    steel_type?: string;
                  };
                  drivers?: { full_name?: string };
                }
              ).freights;
              const d = (c as { drivers?: { full_name?: string } }).drivers;
              return (
                <Card
                  key={c.id}
                  className="p-4 flex items-center gap-4 flex-wrap border-[#E3EAF3] bg-white"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#10274A]">
                      {f?.origin_city ?? "—"} → {f?.dest_city ?? "—"}
                    </div>
                    <div className="text-xs text-[#5B6B80] mt-1 flex items-center gap-2">
                      {steelLabel(f?.steel_type)}
                      <StatusPill status={c.status ?? "active"} />
                    </div>
                  </div>
                  <div className="text-xs text-[#5B6B80]">
                    <div>{d?.full_name ?? "—"}</div>
                  </div>
                  <Link
                    to="/carrier/trips/$id"
                    params={{ id: String(c.id) }}
                  >
                    <Button size="sm">{t("carrierDashboard.track")}</Button>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Payouts */}
      <section>
        <h2 className="text-base font-semibold text-[#10274A] mb-3">
          {t("carrierDashboard.recentPayoutsHeading")}
        </h2>
        {!recentPayouts?.length ? (
          <Card className="p-6 border-[#E3EAF3] bg-white">
            <EmptyState
              title={t("carrierDashboard.emptyPayoutsTitle")}
              description={t("carrierDashboard.emptyPayoutsDesc")}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden border-[#E3EAF3] bg-white">
            {recentPayouts.map((p, i) => (
              <div
                key={p.id}
                className={`flex justify-between items-center px-4 py-3 ${
                  i > 0 ? "border-t border-[#E3EAF3]" : ""
                }`}
              >
                <div>
                  <div className="font-mono text-xs text-[#1B6CB8]">
                    #{String(p.contract_id).slice(0, 8).toUpperCase()}
                  </div>
                  <div className="text-xs text-[#5B6B80] mt-0.5">
                    {p.released_at
                      ? new Date(p.released_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </div>
                </div>
                <div className="font-medium tabular-nums text-[#2ECC8A]">
                  +{formatBRL(p.carrier_payout_brl)}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
