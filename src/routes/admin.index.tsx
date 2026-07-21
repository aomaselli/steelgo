import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Badge } from "@/components/steel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLanguage, type Language } from "@/lib/i18n";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

const LOCALE_MAP: Record<Language, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
};

function fmtBRL(n: number, locale: string) {
  return n.toLocaleString(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function useClock(language: Language) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString(LOCALE_MAP[language]);
}

function AdminDashboardPage() {
  const { t, language } = useLanguage();
  const locale = LOCALE_MAP[language];
  const time = useClock(language);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1F2933]">{t("admin.title")}</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-[#D8DFE8] bg-white px-3 py-1.5 font-mono text-sm tabular-nums text-[#5B6B80]">
            {time}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="border border-[#D8DFE8] bg-white text-[#1F2933] hover:bg-[#F3F6FA]"
            onClick={() => toast.success(`${t("admin.exportData")} ${t("admin.started")}`)}
          >
            <Download className="mr-2 h-4 w-4" /> {t("admin.exportData")}
          </Button>
        </div>
      </div>

      <MetricsRow locale={locale} />
      <div className="grid gap-4 lg:grid-cols-2">
        <GMVChart locale={locale} />
        <StatusPie />
      </div>
      <AlertsFeed locale={locale} />
      <VerificationQueue />
    </div>
  );
}

// ─────────────── Metrics ───────────────
function MetricsRow({ locale }: { locale: string }) {
  const { t } = useLanguage();
  const { data } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [freightsToday, gmvToday, fees, bidsWeek, alerts, carriersPending] = await Promise.all([
        supabase.from("freights").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("freights").select("final_price_brl").gte("created_at", todayIso).not("status", "in", "(cancelled,draft)"),
        supabase.from("contracts").select("platform_fee_brl").gte("created_at", todayIso),
        supabase.from("bids").select("status").gte("submitted_at", weekAgo),
        supabase.from("security_alerts").select("id", { count: "exact", head: true }).is("resolved_at", null),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_verified", false),
      ]);

      const gmv = (gmvToday.data ?? []).reduce((s, r) => s + Number(r.final_price_brl ?? 0), 0);
      const platformRev = (fees.data ?? []).reduce((s, r) => s + Number(r.platform_fee_brl ?? 0), 0);
      const bidsArr = bidsWeek.data ?? [];
      const accepted = bidsArr.filter((b) => b.status === "accepted").length;
      const matchRate = bidsArr.length ? (100 * accepted) / bidsArr.length : 0;

      return {
        freightsToday: freightsToday.count ?? 0,
        gmv,
        platformRev,
        matchRate,
        alerts: alerts.count ?? 0,
        carriersPending: carriersPending.count ?? 0,
      };
    },
  });

  const cards = [
    { label: t("admin.freightsToday"), value: data?.freightsToday ?? 0, delta: "-", color: "text-[#16263F]" },
    { label: t("admin.gmvToday"), value: fmtBRL(data?.gmv ?? 0, locale), delta: "-", color: "text-[#16263F]" },
    { label: t("admin.platformRevenue"), value: fmtBRL(data?.platformRev ?? 0, locale), delta: "-", color: "text-[#2FA98A]" },
    { label: t("admin.matchRate"), value: `${(data?.matchRate ?? 0).toFixed(1)}%`, delta: t("admin.last7d"), color: "text-[#16263F]" },
    {
      label: t("admin.activeAlerts"),
      value: data?.alerts ?? 0,
      delta: `${data?.alerts ?? 0} ${t("admin.unresolved")}`,
      color: (data?.alerts ?? 0) > 0 ? "text-red-400" : "text-graphite-50",
      danger: (data?.alerts ?? 0) > 0,
    },
    {
      label: t("admin.pendingCarriers"),
      value: data?.carriersPending ?? 0,
      delta: t("admin.awaitingKyc"),
      color: (data?.carriersPending ?? 0) > 0 ? "text-[#E0A23A]" : "text-[#16263F]",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={cn(
            "rounded-[14px] border bg-white p-4 shadow-[0_8px_24px_rgba(16,28,48,0.06)]",
            c.danger ? "border-red-300" : "border-[#E6EAF0]",
          )}
        >
          <div className="text-xs uppercase tracking-wide text-[#5B6B80]">{c.label}</div>
          <div className={cn("mt-1 text-3xl font-bold tabular-nums", c.color)}>{c.value}</div>
          <div className="mt-1 text-xs text-[#5B6B80]">{c.delta}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────── Charts ───────────────
function GMVChart({ locale }: { locale: string }) {
  const { t } = useLanguage();
  const { data = [] } = useQuery({
    queryKey: ["admin-gmv-30d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("freights")
        .select("created_at, final_price_brl, status")
        .gte("created_at", since);
      const byDay = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        byDay.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of data ?? []) {
        if (r.status === "cancelled" || r.status === "draft") continue;
        const key = (r.created_at ?? "").slice(0, 10);
        if (byDay.has(key)) byDay.set(key, byDay.get(key)! + Number(r.final_price_brl ?? 0));
      }
      return Array.from(byDay, ([date, value]) => ({
        date: date.slice(8, 10) + "/" + date.slice(5, 7),
        value,
      }));
    },
  });

  return (
    <div className="rounded-[14px] border border-[#E6EAF0] bg-white p-4 shadow-[0_8px_24px_rgba(16,28,48,0.06)]">
      <h3 className="mb-3 text-sm font-semibold text-[#1F2933]">{t("admin.gmvLast30Days")}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <CartesianGrid stroke="#E6EAF0" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#5B6B80" fontSize={11} />
          <YAxis stroke="#5B6B80" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ background: "#FFFFFF", border: "1px solid #E6EAF0", borderRadius: 10 }}
            formatter={(v: number) => fmtBRL(v, locale)}
          />
          <Area type="monotone" dataKey="value" stroke="#2FA98A" fill="#2FA98A" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  published: "#16263F",
  bidding: "#5B6B80",
  contracted: "#E0A23A",
  in_transit: "#E0A23A",
  completed: "#2FA98A",
  delivered: "#2FA98A",
  cancelled: "#B74545",
  disputed: "#B74545",
  draft: "#C1C9D6",
};

function StatusPie() {
  const { t } = useLanguage();
  const { data = [] } = useQuery({
    queryKey: ["admin-status-pie"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase.from("freights").select("status").gte("created_at", since);
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        const k = String(r.status ?? "draft");
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return Array.from(counts, ([name, value]) => ({ name, value }));
    },
  });

  return (
    <div className="rounded-[14px] border border-[#E6EAF0] bg-white p-4 shadow-[0_8px_24px_rgba(16,28,48,0.06)]">
      <h3 className="mb-3 text-sm font-semibold text-[#1F2933]">{t("admin.freightsByStatus30d")}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
            {data.map((e) => (
              <Cell key={e.name} fill={STATUS_COLORS[e.name] ?? "#484F58"} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E6EAF0" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#5B6B80" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────── Alerts feed ───────────────
type Severity = "critical" | "high" | "medium" | "low";
const SEV_BORDER: Record<Severity, string> = {
  critical: "border-l-[#B74545]",
  high: "border-l-[#E0A23A]",
  medium: "border-l-[#16263F]",
  low: "border-l-[#93A1B4]",
};

function AlertsFeed({ locale }: { locale: string }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Severity | "all">("all");

  const sevLabel: Record<Severity, string> = {
    critical: t("admin.critical"),
    high: t("admin.high"),
    medium: t("admin.medium"),
    low: t("admin.low"),
  };

  const { data = [] } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("security_alerts")
        .select("*")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "security_alerts" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-alerts"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const filtered = filter === "all" ? data : data.filter((a) => a.severity === filter);

  async function resolve(id: string) {
    await supabase.from("security_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", id);
    toast.success(t("admin.alertResolved"));
    qc.invalidateQueries({ queryKey: ["admin-alerts"] });
  }

  return (
    <div className="rounded-[14px] border border-[#E6EAF0] bg-white p-5 shadow-[0_8px_24px_rgba(16,28,48,0.06)]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-[#1F2933]">{t("admin.alertsFeedTitle")}</h3>
        <div className="flex gap-1.5">
          {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                filter === s
                  ? "border-[#E0A23A]/40 bg-[#E0A23A]/10 text-[#A5731D]"
                  : "border-[#D8DFE8] text-[#5B6B80] hover:bg-[#F3F6FA]",
              )}
            >
              {s === "all" ? t("admin.all") : sevLabel[s as Severity]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-[#2FA98A]">
          <CheckCircle2 className="h-8 w-8" />
          <p className="text-sm">{t("admin.noActiveAlerts")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start gap-3 rounded-r-[12px] border-l-4 bg-bg-elevated p-4 animate-in fade-in",
                SEV_BORDER[(a.severity ?? "medium") as Severity],
              )}
            >
              <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="amber" className="text-[10px]">
                    {sevLabel[(a.severity ?? "medium") as Severity]}
                  </Badge>
                  <span className="text-sm font-medium text-[#1F2933]">{a.title ?? a.type}</span>
                </div>
                {a.description && <p className="mt-1 text-xs text-[#5B6B80]">{a.description}</p>}
                <p className="mt-1 text-[10px] text-[#8190A4]">
                  {new Date(a.created_at!).toLocaleString(locale)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => resolve(a.id)}>
                {t("admin.resolve")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────── Verification queue ───────────────
function VerificationQueue() {
  const { t, language } = useLanguage();
  const locale = LOCALE_MAP[language];
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-verif-queue"],
    queryFn: async () => {
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, cnpj, address_city, created_at")
        .eq("is_verified", false)
        .limit(20);
      if (!companies?.length) return [];
      const ids = companies.map((c) => c.id);
      const { data: carriers } = await supabase
        .from("carriers")
        .select("id, company_id, antt_rntrc, rctr_c_active, insurance_expiry")
        .in("company_id", ids);
      return companies.map((c) => ({
        ...c,
        carrier: carriers?.find((ca) => ca.company_id === c.id),
      }));
    },
  });

  async function approve(companyId: string) {
    await supabase.from("companies").update({ is_verified: true }).eq("id", companyId);
    toast.success(t("admin.approvedCarrier"));
    qc.invalidateQueries({ queryKey: ["admin-verif-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-metrics"] });
  }

  async function reject(companyId: string) {
    toast.info(t("admin.rejectionSent"));
    await supabase.from("companies").update({ is_verified: false }).eq("id", companyId);
    qc.invalidateQueries({ queryKey: ["admin-verif-queue"] });
  }

  return (
    <div className="rounded-[14px] border border-[#E6EAF0] bg-white p-5 shadow-[0_8px_24px_rgba(16,28,48,0.06)]">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-lg font-semibold text-[#1F2933]">{t("admin.verificationTitle")}</h3>
        <Badge variant="amber">{data.length}</Badge>
      </div>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#5B6B80]">{t("admin.noCarrierQueue")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[#5B6B80]">
                <th className="py-2">{t("admin.company")}</th>
                <th className="py-2">{t("admin.cnpj")}</th>
                <th className="py-2">{t("admin.antt")}</th>
                <th className="py-2">{t("admin.waiting")}</th>
                <th className="py-2 text-right">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAF0]">
              {data.map((row) => {
                const days = Math.floor(
                  (Date.now() - new Date(row.created_at ?? Date.now()).getTime()) / 86400000,
                );
                return (
                  <tr key={row.id}>
                    <td className="py-3">
                      <div className="font-medium text-[#1F2933]">{row.name}</div>
                      <div className="text-xs text-[#5B6B80]">{row.address_city ?? "-"}</div>
                    </td>
                    <td className="py-3 font-mono text-xs text-[#1F2933]">{row.cnpj ?? "-"}</td>
                    <td className="py-3 text-[#1F2933]">{row.carrier?.antt_rntrc ?? "-"}</td>
                    <td
                      className={cn(
                        "py-3 text-xs",
                        days > 2 ? "text-red-500" : days > 1 ? "text-[#E0A23A]" : "text-[#5B6B80]",
                      )}
                    >
                      {days} {days === 1 ? t("admin.day") : t("admin.days")}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => approve(row.id)}>
                          <CheckCircle2 className="mr-1 h-3 w-3 text-[#2FA98A]" /> {t("admin.approve")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => reject(row.id)}>
                          <AlertTriangle className="mr-1 h-3 w-3 text-red-500" /> {t("admin.reject")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
