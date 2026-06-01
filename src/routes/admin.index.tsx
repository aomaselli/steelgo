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

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString("pt-BR");
}

function AdminDashboardPage() {
  const time = useClock();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-graphite-50">Painel Administrativo</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-graphite-700 bg-bg-elevated px-3 py-1.5 font-mono text-sm tabular-nums text-graphite-200">
            {time}
          </span>
          <Button variant="ghost" size="sm" onClick={() => toast.success("Exportação iniciada")}>
            <Download className="mr-2 h-4 w-4" /> Exportar dados
          </Button>
        </div>
      </div>

      <MetricsRow />
      <div className="grid gap-4 lg:grid-cols-2">
        <GMVChart />
        <StatusPie />
      </div>
      <AlertsFeed />
      <VerificationQueue />
    </div>
  );
}

// ─────────────── Metrics ───────────────
function MetricsRow() {
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
    { label: "Fretes hoje", value: data?.freightsToday ?? 0, delta: "+0 vs ontem", color: "text-steel-blue-200" },
    { label: "GMV hoje", value: fmtBRL(data?.gmv ?? 0), delta: "—", color: "text-graphite-50" },
    { label: "Receita plataforma", value: fmtBRL(data?.platformRev ?? 0), delta: "—", color: "text-esg-green" },
    { label: "Taxa de match", value: `${(data?.matchRate ?? 0).toFixed(1)}%`, delta: "últimos 7d", color: "text-steel-blue-200" },
    {
      label: "Alertas ativos",
      value: data?.alerts ?? 0,
      delta: `${data?.alerts ?? 0} não resolvidos`,
      color: (data?.alerts ?? 0) > 0 ? "text-red-400" : "text-graphite-50",
      danger: (data?.alerts ?? 0) > 0,
    },
    {
      label: "Transp. pendentes",
      value: data?.carriersPending ?? 0,
      delta: "aguardando KYC",
      color: (data?.carriersPending ?? 0) > 0 ? "text-amber-400" : "text-graphite-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={cn(
            "rounded-[12px] border bg-bg-surface p-4",
            c.danger ? "border-red-700/50" : "border-graphite-600",
          )}
        >
          <div className="text-xs uppercase tracking-wide text-graphite-400">{c.label}</div>
          <div className={cn("mt-1 text-3xl font-bold tabular-nums", c.color)}>{c.value}</div>
          <div className="mt-1 text-xs text-graphite-400">{c.delta}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────── Charts ───────────────
function GMVChart() {
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
    <div className="rounded-[12px] border border-graphite-600 bg-bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-graphite-50">GMV — Últimos 30 dias</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <CartesianGrid stroke="#30363D" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#8B949E" fontSize={11} />
          <YAxis stroke="#8B949E" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 8 }}
            formatter={(v: number) => fmtBRL(v)}
          />
          <Area type="monotone" dataKey="value" stroke="#3B89D4" fill="#1B6CB8" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  published: "#1B6CB8",
  bidding: "#1B6CB8",
  contracted: "#CC8800",
  in_transit: "#CC8800",
  completed: "#1A9B5E",
  delivered: "#1A9B5E",
  cancelled: "#C23333",
  disputed: "#C23333",
  draft: "#484F58",
};

function StatusPie() {
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
    <div className="rounded-[12px] border border-graphite-600 bg-bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-graphite-50">Fretes por status (30d)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
            {data.map((e) => (
              <Cell key={e.name} fill={STATUS_COLORS[e.name] ?? "#484F58"} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────── Alerts feed ───────────────
type Severity = "critical" | "high" | "medium" | "low";
const SEV_LABEL: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};
const SEV_BORDER: Record<Severity, string> = {
  critical: "border-l-[#C23333]",
  high: "border-l-[#CC8800]",
  medium: "border-l-[#1B6CB8]",
  low: "border-l-[#484F58]",
};

function AlertsFeed() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Severity | "all">("all");

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
    toast.success("Alerta resolvido");
    qc.invalidateQueries({ queryKey: ["admin-alerts"] });
  }

  return (
    <div className="rounded-[12px] border border-graphite-600 bg-bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-graphite-50">Alertas de segurança ativos</h3>
        <div className="flex gap-1.5">
          {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                filter === s
                  ? "border-red-700/30 bg-red-900/20 text-red-400"
                  : "border-graphite-700 text-graphite-300 hover:bg-bg-elevated",
              )}
            >
              {s === "all" ? "Todos" : SEV_LABEL[s as Severity]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-esg-green-400">
          <CheckCircle2 className="h-8 w-8" />
          <p className="text-sm">Nenhum alerta ativo no momento</p>
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
                    {SEV_LABEL[(a.severity ?? "medium") as Severity]}
                  </Badge>
                  <span className="text-sm font-medium text-graphite-50">{a.title ?? a.type}</span>
                </div>
                {a.description && <p className="mt-1 text-xs text-graphite-400">{a.description}</p>}
                <p className="mt-1 text-[10px] text-graphite-500">
                  {new Date(a.created_at!).toLocaleString("pt-BR")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => resolve(a.id)}>
                Resolver
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
    toast.success("Transportadora aprovada");
    qc.invalidateQueries({ queryKey: ["admin-verif-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-metrics"] });
  }

  async function reject(companyId: string) {
    toast.info("Notificação de rejeição enviada");
    await supabase.from("companies").update({ is_verified: false }).eq("id", companyId);
    qc.invalidateQueries({ queryKey: ["admin-verif-queue"] });
  }

  return (
    <div className="rounded-[12px] border border-graphite-600 bg-bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-lg font-semibold text-graphite-50">Transportadoras aguardando verificação</h3>
        <Badge variant="amber">{data.length}</Badge>
      </div>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-graphite-400">Nenhuma transportadora na fila.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-graphite-400">
                <th className="py-2">Empresa</th>
                <th className="py-2">CNPJ</th>
                <th className="py-2">ANTT</th>
                <th className="py-2">Aguardando</th>
                <th className="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-800">
              {data.map((row) => {
                const days = Math.floor(
                  (Date.now() - new Date(row.created_at ?? Date.now()).getTime()) / 86400000,
                );
                return (
                  <tr key={row.id}>
                    <td className="py-3">
                      <div className="font-medium text-graphite-50">{row.name}</div>
                      <div className="text-xs text-graphite-400">{row.address_city ?? "—"}</div>
                    </td>
                    <td className="py-3 font-mono text-xs text-graphite-200">{row.cnpj ?? "—"}</td>
                    <td className="py-3 text-graphite-200">{row.carrier?.antt_rntrc ?? "—"}</td>
                    <td
                      className={cn(
                        "py-3 text-xs",
                        days > 2 ? "text-red-400" : days > 1 ? "text-amber-400" : "text-graphite-400",
                      )}
                    >
                      {days} {days === 1 ? "dia" : "dias"}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => approve(row.id)}>
                          <CheckCircle2 className="mr-1 h-3 w-3 text-esg-green-400" /> Aprovar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => reject(row.id)}>
                          <AlertTriangle className="mr-1 h-3 w-3 text-red-400" /> Rejeitar
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
