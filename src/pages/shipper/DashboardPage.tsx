import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Package,
  MapPin,
  AlertTriangle,
  FileText,
  Coins,
  Bell,
  Map as MapIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { StatusPill } from "@/components/steel/StatusPill";
import { EmptyState } from "@/components/steel";
import { steelLabel, formatBRL } from "@/lib/steel";
import { cn } from "@/lib/utils";

const BR_CENTER = { lat: -15.7801, lng: -47.9292 };
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;


const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#21262d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#161b22" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

type Activity = {
  id: string;
  kind: "checkpoint" | "payment" | "alert" | "contract";
  msg: string;
  at: string;
};

export function DashboardPage() {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const companyId = company?.id;

  // ─── Metrics ───
  const { data: metrics } = useQuery({
    queryKey: ["shipper-metrics", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [active, prevActive, monthly, transit, esg] = await Promise.all([
        supabase.from("freights").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .in("status", ["contracted", "in_transit", "matched", "contract_pending"]),
        supabase.from("freights").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!).lt("created_at", weekAgo)
          .in("status", ["contracted", "in_transit", "matched", "contract_pending"]),
        supabase.from("freights").select("weight_tons")
          .eq("company_id", companyId!).gte("created_at", monthStart),
        supabase.from("freights").select("final_price_brl")
          .eq("company_id", companyId!).eq("status", "in_transit"),
        supabase.from("esg_logs").select("co2_saved_kg")
          .eq("company_id", companyId!).gte("logged_at", monthStart),
      ]);
      return {
        active: active.count ?? 0,
        activeDelta: (active.count ?? 0) - (prevActive.count ?? 0),
        weight: (monthly.data ?? []).reduce((s, r) => s + Number(r.weight_tons ?? 0), 0),
        transit: (transit.data ?? []).reduce((s, r) => s + Number(r.final_price_brl ?? 0), 0),
        co2: (esg.data ?? []).reduce((s, r) => s + Number(r.co2_saved_kg ?? 0), 0),
      };
    },
  });

  // ─── Recent freights ───
  const { data: freights, isLoading: freightsLoading } = useQuery({
    queryKey: ["shipper-freights", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("freights")
        .select("*").eq("company_id", companyId!)
        .order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });

  // ─── Active contracts for map + realtime filter ───
  const { data: activeContracts } = useQuery({
    queryKey: ["shipper-active-contracts", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("contracts")
        .select("id, contract_number, status, driver_id, freight_id")
        .eq("shipper_company_id", companyId!)
        .in("status", ["activated", "in_transit"] as any);
      return data ?? [];
    },
  });

  const activeContractIds = useMemo(
    () => (activeContracts ?? []).map((c) => c.id),
    [activeContracts],
  );

  // ─── Realtime activity ───
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel(`shipper-activity-${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkpoints" }, (p) => {
        const r = p.new as any;
        if (activeContractIds.length && !activeContractIds.includes(r.contract_id)) return;
        const item: Activity = {
          id: r.id,
          kind: "checkpoint",
          msg: `Checkpoint ${r.type ?? ""} registrado`,
          at: r.recorded_at ?? new Date().toISOString(),
        };
        setActivity((a) => [item, ...a].slice(0, 30));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "security_alerts" }, (p) => {
        const r = p.new as any;
        const item: Activity = {
          id: r.id,
          kind: "alert",
          msg: `⚠️ ${r.title ?? "Alerta de segurança"}`,
          at: r.created_at ?? new Date().toISOString(),
        };
        setActivity((a) => [item, ...a].slice(0, 30));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, (p) => {
        const r = p.new as any;
        if (r.shipper_company_id !== companyId) return;
        const item: Activity = {
          id: r.id,
          kind: "payment",
          msg: `Pagamento ${formatBRL(r.amount_brl)} processado`,
          at: r.created_at ?? new Date().toISOString(),
        };
        setActivity((a) => [item, ...a].slice(0, 30));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" }, (p) => {
        const r = p.new as any;
        if (r.shipper_company_id !== companyId) return;
        if (r.status === "activated") {
          const item: Activity = {
            id: `c-${r.id}`,
            kind: "contract",
            msg: `Contrato ${r.contract_number ?? ""} assinado por ambas as partes`,
            at: r.activated_at ?? new Date().toISOString(),
          };
          setActivity((a) => [item, ...a].slice(0, 30));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, activeContractIds]);

  return (
    <AppShell title="Dashboard">
      <div className="text-[#E6EDF3]">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E6EDF3]">
              Olá, {firstName || "bem-vindo"}!
            </h1>
            <p className="mt-1 text-sm text-[#8B949E]">
              Bem-vindo ao seu painel de logística
            </p>
          </div>
          <button
            type="button"
            onClick={() => void navigate({ to: "/shipper/freights/new" })}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#1B6CB8] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#1E7AC6]"
          >
            <Plus className="h-4 w-4" /> Publicar novo frete
          </button>
        </div>

        {/* Metrics row */}
        <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Fretes ativos"
            value={String(metrics?.active ?? 0)}
            valueColor="#79B8F8"
            delta={metrics ? `${metrics.activeDelta >= 0 ? "↑" : "↓"} ${Math.abs(metrics.activeDelta)} vs 7 dias` : undefined}
            deltaColor="#8B949E"
          />
          <Metric
            label="Volume este mês (t)"
            value={(metrics?.weight ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            valueColor="#E6EDF3"
          />
          <Metric
            label="Em trânsito (R$)"
            value={formatBRL(metrics?.transit ?? 0)}
            valueColor="#F0A500"
          />
          <Metric
            label="CO₂ evitado mês (kg)"
            value={(metrics?.co2 ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            valueColor="#2ECC8A"
            delta="↓ via fretes verdes"
            deltaColor="#2ECC8A"
          />
        </div>

        {/* Live map */}
        <div className="mb-8 overflow-hidden rounded-[16px] border border-[#30363D] bg-[#161B22]">
          <div className="flex items-center justify-between border-b border-[#30363D] p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-[#E6EDF3]">
                Rastreamento em tempo real
              </span>
              <span className="rounded-full bg-[#1B6CB8]/20 px-2 py-0.5 text-xs font-medium text-[#79B8F8]">
                {(freights ?? []).filter((f) => f.status === "in_transit").length} em trânsito
              </span>
            </div>
            <Link
              to="/shipper/freights"
              className="cursor-pointer text-sm text-[#3B89D4] hover:underline"
            >
              Ver mapa completo →
            </Link>
          </div>
          <LiveMap contractIds={activeContractIds} />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Freights table */}
          <div className="overflow-hidden rounded-[16px] border border-[#30363D] bg-[#161B22] lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[#30363D] p-4">
              <h2 className="text-base font-semibold text-[#E6EDF3]">Meus fretes</h2>
              <Link to="/shipper/freights" className="text-sm text-[#3B89D4] hover:underline">
                Ver todos →
              </Link>
            </div>

            {freightsLoading ? (
              <div className="divide-y divide-[#30363D]/50">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-4">
                    <div className="h-4 w-full animate-pulse rounded bg-[#21262D]" />
                  </div>
                ))}
              </div>
            ) : !freights?.length ? (
              <div className="p-6">
                <EmptyState
                  icon={Package}
                  title="Nenhum frete publicado"
                  description="Publique seu primeiro frete para começar"
                  action={
                    <button
                      type="button"
                      onClick={() => void navigate({ to: "/shipper/freights/new" })}
                      className="rounded-[10px] bg-[#1B6CB8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E7AC6]"
                    >
                      Publicar frete →
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#30363D] text-xs uppercase tracking-wide text-[#484F58]">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Rota</th>
                      <th className="px-4 py-3 text-left font-medium">Tipo</th>
                      <th className="px-4 py-3 text-right font-medium">Peso</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Valor</th>
                      <th className="px-4 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freights.map((f) => (
                      <tr
                        key={f.id}
                        className="border-b border-[#30363D]/50 transition hover:bg-[#161B22]/50"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-[#79B8F8]">
                          {String(f.id).slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-[#C9D1D9]">
                          {f.origin_city ?? "—"} → {f.dest_city ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#8B949E]">
                          {steelLabel(f.steel_type)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#C9D1D9]">
                          {Number(f.weight_tons ?? 0).toLocaleString("pt-BR")}t
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={f.status ?? "draft"} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-[#E6EDF3]">
                          {formatBRL(f.final_price_brl ?? f.budget_brl)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              to="/shipper/freights/$id"
                              params={{ id: String(f.id) }}
                              className="rounded-md px-2 py-1 text-xs text-[#C9D1D9] hover:bg-[#21262D]"
                            >
                              Ver
                            </Link>
                            {f.status === "in_transit" && (
                              <Link
                                to="/shipper/freights/$id"
                                params={{ id: String(f.id) }}
                                className="rounded-md bg-[#1B6CB8] px-2 py-1 text-xs text-white hover:bg-[#1E7AC6]"
                              >
                                Rastrear
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="rounded-[16px] border border-[#30363D] bg-[#161B22] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#E6EDF3]">
              Atividade recente
            </h3>
            {activity.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Bell className="mb-2 h-6 w-6 text-[#484F58]" />
                <p className="text-xs text-[#484F58]">Nenhuma atividade recente</p>
              </div>
            ) : (
              <div className="flex max-h-96 flex-col overflow-y-auto">
                {activity.map((a) => (
                  <ActivityItem key={a.id} item={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Sub-components ───

function Metric({
  label,
  value,
  valueColor,
  delta,
  deltaColor,
}: {
  label: string;
  value: string;
  valueColor: string;
  delta?: string;
  deltaColor?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[#30363D] bg-[#161B22] p-5">
      <div className="mb-2 text-xs uppercase tracking-wide text-[#484F58]">{label}</div>
      <div className="text-3xl font-bold tabular-nums" style={{ color: valueColor }}>
        {value}
      </div>
      {delta && (
        <div className="mt-1.5 text-xs" style={{ color: deltaColor ?? "#8B949E" }}>
          {delta}
        </div>
      )}
    </div>
  );
}

function ActivityItem({ item }: { item: Activity }) {
  const cfg = {
    checkpoint: { bg: "bg-[#1B6CB8]/20", Icon: MapPin, color: "#3B89D4" },
    payment: { bg: "bg-[#1A9B5E]/20", Icon: Coins, color: "#2ECC8A" },
    alert: { bg: "bg-red-900/20", Icon: AlertTriangle, color: "#f87171" },
    contract: { bg: "bg-purple-900/20", Icon: FileText, color: "#c084fc" },
  }[item.kind];
  const Icon = cfg.Icon;
  return (
    <div className="flex items-start gap-3 border-b border-[#30363D]/50 py-3 last:border-0">
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", cfg.bg)}>
        <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-xs leading-relaxed text-[#C9D1D9]"
          style={item.kind === "alert" ? { color: "#f87171" } : undefined}
        >
          {item.msg}
        </p>
        <p className="mt-0.5 text-[10px] text-[#484F58]">{timeAgo(item.at)}</p>
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ─── Google Maps widget ───
declare global {
  interface Window {
    __steelGoMapsInit?: () => void;
    google?: any;
  }
}

function LiveMap({ contractIds }: { contractIds: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  // Load script
  useEffect(() => {
    if (!MAPS_KEY) { console.warn('[SteelGo] VITE_GOOGLE_MAPS_KEY is not set. Map will not load.'); return; }
    if (window.google?.maps) { setReady(true); return; }
    if (document.getElementById("steelgo-maps-script")) {
      window.__steelGoMapsInit = () => setReady(true);
      return;
    }
    window.__steelGoMapsInit = () => setReady(true);
    const s = document.createElement("script");
    s.id = "steelgo-maps-script";
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&loading=async&callback=__steelGoMapsInit`;
    document.head.appendChild(s);
  }, []);

  // Init map
  useEffect(() => {
    if (!ready || !ref.current || mapRef.current) return;
    mapRef.current = new window.google.maps.Map(ref.current, {
      center: BR_CENTER,
      zoom: 5,
      styles: DARK_MAP_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
    });
  }, [ready]);

  // Fetch positions and draw markers
  const { data: positions } = useQuery({
    queryKey: ["map-positions", contractIds],
    enabled: ready && contractIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("driver_positions")
        .select("contract_id, lat, lng, updated_at")
        .in("contract_id", contractIds);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    (positions ?? []).forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const marker = new window.google.maps.Marker({
        position: { lat: Number(p.lat), lng: Number(p.lng) },
        map: mapRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1B6CB8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);
    });
  }, [positions]);

  if (!MAPS_KEY) {
    return (
      <div className="flex h-[260px] items-center justify-center bg-[#0F1923]">
        <div className="flex flex-col items-center gap-2">
          <MapIcon className="h-10 w-10 text-[#484F58]" />
          <p className="text-sm text-[#484F58]">
            Mapa disponível após conectar Google Maps
          </p>
        </div>
      </div>
    );
  }

  return <div ref={ref} className="h-[260px] w-full bg-[#0F1923]" />;
}

export default DashboardPage;
