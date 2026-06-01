import { useQuery } from "@tanstack/react-query";
import { Leaf, TreePine, Truck, Trophy } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, Spinner, Badge } from "@/components/steel";

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");

export function AdminESGPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-esg"],
    queryFn: async () => {
      const since = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data: logs } = await supabase
        .from("esg_logs")
        .select("*")
        .gte("logged_at", since)
        .order("logged_at", { ascending: true });

      const all = logs ?? [];
      const totalSaved = all.reduce((s, r) => s + Number(r.co2_saved_kg ?? 0), 0);
      const totalEmitted = all.reduce((s, r) => s + Number(r.co2_emitted_kg ?? 0), 0);
      const greenCount = all.filter((r) => r.is_green).length;
      const trees = totalSaved / 21.7;

      // 6 month bars
      const months = new Map<string, { month: string; emitted: number; saved: number }>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i, 1);
        const k = d.toISOString().slice(0, 7);
        months.set(k, { month: d.toLocaleDateString("pt-BR", { month: "short" }), emitted: 0, saved: 0 });
      }
      for (const r of all) {
        const k = (r.logged_at ?? "").slice(0, 7);
        const m = months.get(k);
        if (m) {
          m.emitted += Number(r.co2_emitted_kg ?? 0);
          m.saved += Number(r.co2_saved_kg ?? 0);
        }
      }

      // Top companies by CO2 saved
      const byCompany = new Map<string, number>();
      for (const r of all) {
        if (!r.company_id) continue;
        byCompany.set(r.company_id, (byCompany.get(r.company_id) ?? 0) + Number(r.co2_saved_kg ?? 0));
      }
      const topCoIds = Array.from(byCompany.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const { data: companies } = topCoIds.length
        ? await supabase.from("companies").select("id, name, cnpj").in("id", topCoIds.map(([id]) => id))
        : { data: [] };

      // Top carriers by ESG score
      const { data: carrierScores } = await supabase
        .from("carrier_scores")
        .select("carrier_id, esg_score, overall_score, total_freights")
        .order("esg_score", { ascending: false })
        .limit(10);
      const carrierIds = (carrierScores ?? []).map((c) => c.carrier_id);
      const { data: carriers } = carrierIds.length
        ? await supabase.from("carriers").select("id, company_id").in("id", carrierIds)
        : { data: [] };
      const carrierCompanyIds = (carriers ?? []).map((c) => c.company_id);
      const { data: carrierCompanies } = carrierCompanyIds.length
        ? await supabase.from("companies").select("id, name").in("id", carrierCompanyIds)
        : { data: [] };

      return {
        totalSaved,
        totalEmitted,
        greenCount,
        totalLogs: all.length,
        trees,
        chartData: Array.from(months.values()),
        topCompanies: topCoIds.map(([id, saved]) => ({
          id,
          name: companies?.find((c) => c.id === id)?.name ?? "—",
          cnpj: companies?.find((c) => c.id === id)?.cnpj ?? "",
          saved,
        })),
        topCarriers: (carrierScores ?? []).map((s) => {
          const car = carriers?.find((c) => c.id === s.carrier_id);
          const co = carrierCompanies?.find((c) => c.id === car?.company_id);
          return {
            id: s.carrier_id,
            name: co?.name ?? "—",
            score: Number(s.esg_score ?? 0),
            overall: Number(s.overall_score ?? 0),
            freights: s.total_freights ?? 0,
          };
        }),
      };
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Spinner /></div>;
  const greenPct = data && data.totalLogs ? (100 * data.greenCount) / data.totalLogs : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-graphite-50">ESG — Plataforma</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Leaf className="h-5 w-5" />} label="CO₂ evitado total" value={`${fmtN(data?.totalSaved ?? 0)} kg`} color="text-esg-green-400" />
        <MetricCard icon={<Truck className="h-5 w-5" />} label="Fretes verdes" value={fmtN(data?.greenCount ?? 0)} sub={`${greenPct.toFixed(1)}% do total`} color="text-steel-blue-200" />
        <MetricCard icon={<TreePine className="h-5 w-5" />} label="Árvores equivalentes" value={fmtN(data?.trees ?? 0)} color="text-esg-green-400" />
        <MetricCard icon={<Trophy className="h-5 w-5" />} label="CO₂ emitido" value={`${fmtN(data?.totalEmitted ?? 0)} kg`} color="text-graphite-50" />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-graphite-50">CO₂ emitido vs evitado — últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data?.chartData ?? []}>
            <CartesianGrid stroke="#30363D" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="#8B949E" fontSize={11} />
            <YAxis stroke="#8B949E" fontSize={11} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="emitted" name="Emitido (kg)" fill="#C23333" />
            <Bar dataKey="saved" name="Evitado (kg)" fill="#2ECC8A" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-graphite-50">🏭 Top embarcadores por CO₂ evitado</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-graphite-400">
                <th className="py-2">#</th>
                <th className="py-2">Empresa</th>
                <th className="py-2 text-right">CO₂ evitado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-800">
              {data?.topCompanies.length ? data.topCompanies.map((c, i) => (
                <tr key={c.id}>
                  <td className="py-2 text-graphite-400">{i + 1}</td>
                  <td className="py-2 text-graphite-100">{c.name}</td>
                  <td className="py-2 text-right tabular-nums text-esg-green-400">{fmtN(c.saved)} kg</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="py-6 text-center text-graphite-400">Sem dados</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-graphite-50">🚛 Top transportadoras por score ESG</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-graphite-400">
                <th className="py-2">#</th>
                <th className="py-2">Empresa</th>
                <th className="py-2 text-right">ESG</th>
                <th className="py-2 text-right">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-800">
              {data?.topCarriers.length ? data.topCarriers.map((c, i) => (
                <tr key={c.id}>
                  <td className="py-2 text-graphite-400">{i + 1}</td>
                  <td className="py-2 text-graphite-100">{c.name}</td>
                  <td className="py-2 text-right"><Badge variant="green">{c.score.toFixed(1)}</Badge></td>
                  <td className="py-2 text-right tabular-nums text-graphite-200">{c.overall.toFixed(1)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-6 text-center text-graphite-400">Sem dados</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-graphite-400">{icon}<span className="text-xs uppercase">{label}</span></div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-graphite-400">{sub}</div>}
    </Card>
  );
}
