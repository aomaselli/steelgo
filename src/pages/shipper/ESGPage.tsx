import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Download,
  Leaf,
  Zap,
  BarChart3,
  TreePine,
  Cloud,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, Button, Spinner, EmptyState } from "@/components/steel";
import { formatNum } from "@/lib/steel";

const REPORT_ITEMS = [
  "CO₂ total emitido e evitado",
  "Distribuição entre fretes verdes e tradicionais",
  "Quilometragem percorrida por tipo de frota",
  "Equivalência em árvores preservadas",
  "Lista de transportadoras ESG-certificadas",
  "Comparativo com meses anteriores",
  "Metas atingidas vs planejadas",
  "Recomendações para o próximo ciclo",
];

function ratingFromPct(pct: number) {
  if (pct > 80) return { label: "A+", cls: "bg-esg-green-400/20 text-esg-green-400" };
  if (pct > 60) return { label: "A", cls: "bg-esg-green-400/15 text-esg-green-400" };
  if (pct > 40) return { label: "B+", cls: "bg-[#79B8F8]/15 text-[#79B8F8]" };
  if (pct > 20) return { label: "B", cls: "bg-[#F0A500]/15 text-[#F0A500]" };
  return { label: "C", cls: "bg-[#8B949E]/15 text-[#8B949E]" };
}

export function ESGPage() {
  const { company } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-esg", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("esg_logs")
        .select("*")
        .eq("company_id", company!.id);
      return data ?? [];
    },
  });

  const logs = data ?? [];
  const now = new Date();
  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = monthKey(now);
  const monthLogs = logs.filter((l) => l.logged_at && monthKey(new Date(l.logged_at)) === thisMonth);

  const co2Emitted = monthLogs.reduce((s, l) => s + Number(l.co2_emitted_kg ?? 0), 0);
  const co2Saved = monthLogs.reduce((s, l) => s + Number(l.co2_saved_kg ?? 0), 0);
  const greenCount = monthLogs.filter((l) => l.is_green).length;
  const greenPct = monthLogs.length ? (greenCount / monthLogs.length) * 100 : 0;
  const allGreen = logs.filter((l) => l.is_green).length;
  const allSaved = logs.reduce((s, l) => s + Number(l.co2_saved_kg ?? 0), 0);
  const trees = allSaved / 21.7;
  const allTotal = logs.length;
  const totalGreenPct = allTotal ? (allGreen / allTotal) * 100 : 0;
  const rating = ratingFromPct(totalGreenPct);

  const months = useMemo(() => {
    const arr: Array<{ month: string; emitido: number; evitado: number; greenPct: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = monthKey(d);
      const ms = logs.filter((l) => l.logged_at && monthKey(new Date(l.logged_at)) === k);
      const green = ms.filter((l) => l.is_green).length;
      arr.push({
        month: d.toLocaleDateString("pt-BR", { month: "short" }),
        emitido: Math.round(ms.reduce((s, l) => s + Number(l.co2_emitted_kg ?? 0), 0)),
        evitado: Math.round(ms.reduce((s, l) => s + Number(l.co2_saved_kg ?? 0), 0)),
        greenPct: ms.length ? Math.round((green / ms.length) * 100) : 0,
      });
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

  return (
    <AppShell title="Dashboard ESG">
      <div className="p-6">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#E6EDF3]">Dashboard ESG</h1>
            <span className={`text-xs px-2 py-1 rounded-full font-bold ${rating.cls}`}>
              {rating.label}
            </span>
          </div>
          <Button
            onClick={() => window.print()}
            className="bg-esg-green-400 hover:bg-esg-green-400/90 text-black"
          >
            <Download className="w-4 h-4" />
            Baixar relatório PDF
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center"><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Leaf}
            title="Nenhum dado ESG ainda"
            description="Publique fretes com categoria verde para gerar dados ESG"
            action={
              <Link to="/shipper/freights/new">
                <Button>Publicar frete verde →</Button>
              </Link>
            }
          />
        ) : (
          <>
            {/* Primary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              <EsgCard
                tone="green"
                icon={Leaf}
                label="CO₂ evitado este mês"
                value={`${formatNum(Math.round(co2Saved))} kg`}
              />
              <EsgCard
                tone="green"
                icon={Zap}
                label="Fretes verdes este mês"
                value={String(greenCount)}
              />
              <EsgCard
                tone="blue"
                icon={BarChart3}
                label="% fretes verdes"
                value={`${greenPct.toFixed(1)}%`}
              />
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              <EsgCard
                tone="amber"
                icon={Cloud}
                label="CO₂ emitido total"
                value={`${formatNum(Math.round(co2Emitted))} kg`}
              />
              <EsgCard
                tone="green"
                icon={Leaf}
                label="Fretes verdes (acumulado)"
                value={String(allGreen)}
              />
              <EsgCard
                tone="green"
                icon={TreePine}
                label="Árvores equivalentes"
                value={formatNum(Math.round(trees))}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">
                  CO₂ emitido vs evitado — 6 meses
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={months}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                    <XAxis dataKey="month" stroke="#8B949E" fontSize={11} />
                    <YAxis stroke="#8B949E" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="emitido" name="Emitido (kg)" fill="#CC8800" />
                    <Bar dataKey="evitado" name="Evitado (kg)" fill="#1A9B5E" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">
                  Fretes verdes vs tradicionais (%)
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={months}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                    <XAxis dataKey="month" stroke="#8B949E" fontSize={11} />
                    <YAxis stroke="#8B949E" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #30363D" }} />
                    <ReferenceLine y={50} stroke="#1B6CB8" strokeDasharray="4 4" label={{ value: "Meta 50%", fill: "#1B6CB8", fontSize: 11 }} />
                    <Line type="monotone" dataKey="greenPct" stroke="#1A9B5E" strokeWidth={2} dot={{ fill: "#1A9B5E" }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Report preview */}
            <Card className="p-6">
              <h3 className="text-base font-semibold text-[#E6EDF3] mb-4">
                📋 Próximo relatório ESG
              </h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {REPORT_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[#C9D1D9]">
                    <Check className="w-4 h-4 text-esg-green-400 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex justify-between items-center mt-6">
                <p className="text-xs text-[#484F58]">
                  Relatório gerado automaticamente no dia 1 de cada mês
                </p>
                <Button variant="ghost" size="sm">Baixar exemplo</Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EsgCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Leaf;
  label: string;
  value: string;
  tone: "green" | "blue" | "amber";
}) {
  const styles = {
    green: { wrap: "bg-[#0A2118] border-[#1A9B5E]/30", icon: "text-[#2ECC8A]", value: "text-[#2ECC8A]" },
    blue: { wrap: "bg-[#0D2744] border-[#1B6CB8]/30", icon: "text-[#79B8F8]", value: "text-[#79B8F8]" },
    amber: { wrap: "bg-[#2A1E08] border-[#CC8800]/30", icon: "text-[#F0A500]", value: "text-[#F0A500]" },
  }[tone];
  return (
    <div className={`border rounded-[14px] p-5 ${styles.wrap}`}>
      <Icon className={`w-6 h-6 mb-2 ${styles.icon}`} />
      <p className="text-xs uppercase text-[#484F58]">{label}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${styles.value}`}>{value}</p>
    </div>
  );
}
