import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  AlertTriangle,
  Truck as TruckIcon,
  MapPin,
  CheckCircle2,
  Star,
  WifiOff,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { DriverShell } from "@/components/driver/DriverShell";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { DriverMap } from "./DriverMap";

type Freight = {
  id: string;
  origin_city: string | null;
  origin_state: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_city: string | null;
  dest_state: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  steel_type: string | null;
  weight_tons: number | null;
};

type ActiveContract = {
  id: string;
  status: string | null;
  freight_id: string;
  total_amount_brl: number | null;
  carrier_payout_brl: number | null;
  freight?: Freight | null;
};

type Checkpoint = {
  id: string;
  type: string | null;
  recorded_at: string | null;
};

const CACHE_KEY = "steelgo_active_delivery";
const CHECKPOINT_ORDER: Array<{ key: string; label: string }> = [
  { key: "pickup", label: "Coleta" },
  { key: "in_transit", label: "Em rota" },
  { key: "toll", label: "Pedágio" },
  { key: "delivery", label: "Destino" },
];

export default function DriverHomePage() {
  const { user, profile } = useAuth();
  const online = useOnlineStatus();
  const firstName = (profile?.full_name ?? "Motorista").split(" ")[0];
  const lastName = (profile?.full_name ?? "").split(" ").slice(-1)[0] ?? "";
  const initials = (firstName[0] ?? "M") + (lastName[0] ?? "");

  const { data: active, isLoading } = useQuery<ActiveContract | null>({
    queryKey: ["driver-active", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, status, freight_id, total_amount_brl, carrier_payout_brl")
        .eq("driver_id", user!.id)
        .in("status", ["active"])
        .limit(1);
      const c = contracts?.[0];
      if (!c) {
        try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
        return null;
      }
      const { data: f } = await supabase
        .from("freights")
        .select("id, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, dest_lat, dest_lng, steel_type, weight_tons")
        .eq("id", c.freight_id)
        .maybeSingle();
      const merged: ActiveContract = { ...c, freight: f as Freight | null };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    },
    initialData: () => {
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
        return raw ? (JSON.parse(raw) as ActiveContract) : undefined;
      } catch { return undefined; }
    },
  });

  // Last completed delivery (only when no active)
  const { data: lastDelivery } = useQuery({
    queryKey: ["driver-last", user?.id],
    enabled: !!user && !active,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, total_amount_brl, completed_at, freight_id")
        .eq("driver_id", user!.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1);
      const c = data?.[0];
      if (!c) return null;
      const { data: f } = await supabase
        .from("freights")
        .select("origin_state, dest_state, weight_tons, steel_type")
        .eq("id", c.freight_id)
        .maybeSingle();
      return { ...c, freight: f };
    },
  });

  // Checkpoints for active contract
  const { data: checkpoints } = useQuery<Checkpoint[]>({
    queryKey: ["driver-checkpoints", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkpoints")
        .select("id, type, recorded_at")
        .eq("contract_id", active!.id)
        .order("recorded_at", { ascending: true });
      return (data ?? []) as Checkpoint[];
    },
  });

  // GPS tracking + position upsert when active contract exists
  const geo = useGeolocation({
    watch: true,
    contractId: active?.id ?? null,
    driverId: user?.id ?? null,
  });

  // Realtime: security alerts on this contract
  useEffect(() => {
    if (!active?.id) return;
    const ch = supabase
      .channel(`security-${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "security_alerts", filter: `contract_id=eq.${active.id}` },
        (payload) => {
          const a = payload.new as { severity?: string; title?: string; description?: string };
          if (a.severity === "critical" || a.severity === "high") {
            toast.error(`🚨 ${a.title ?? "Alerta de segurança"}\n${a.description ?? ""}`, {
              duration: 8000,
              style: { background: "#3a0d0d", color: "#fecaca", border: "1px solid #C23333" },
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active?.id]);

  const driverPos = geo.lat && geo.lng ? { lat: geo.lat, lng: geo.lng } : null;
  const f = active?.freight ?? null;
  const origin = f?.origin_lat && f?.origin_lng ? { lat: Number(f.origin_lat), lng: Number(f.origin_lng) } : null;
  const dest = f?.dest_lat && f?.dest_lng ? { lat: Number(f.dest_lat), lng: Number(f.dest_lng) } : null;

  const eta = useMemo(() => {
    // Cheap ETA: 60 km/h straight-line from driver to dest
    if (!driverPos || !dest) return "--:--";
    const km = haversineKm(driverPos, dest);
    const minutes = Math.round((km / 60) * 60);
    const arr = new Date(Date.now() + minutes * 60_000);
    return arr.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [driverPos?.lat, driverPos?.lng, dest?.lat, dest?.lng]);

  return (
    <DriverShell activeTab="trip">
      <Toaster position="top-center" />

      {!online && (
        <div
          className="mx-4 mt-3 rounded-[12px] flex items-center gap-2 px-3 py-2 text-[13px]"
          style={{ background: "#1F1500", border: "1px solid #CC8800", color: "#F0A500" }}
        >
          <WifiOff size={16} /> Sem internet — modo offline ativo
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <div>
          <div className="text-[13px]" style={{ color: "#8B949E" }}>Olá,</div>
          <div className="text-[22px] font-medium" style={{ color: "#E6EDF3" }}>{firstName}</div>
        </div>
        <div
          className="flex items-center justify-center rounded-full font-semibold uppercase"
          style={{
            width: 44, height: 44, fontSize: 15,
            background: "#0D2744", border: "2px solid #1B6CB8", color: "#3B89D4",
          }}
        >
          {initials}
        </div>
      </header>

      {isLoading && !active ? (
        <div className="px-4">
          <div className="rounded-[16px] animate-pulse" style={{ height: 200, background: "#161B22" }} />
        </div>
      ) : !active ? (
        <NoActiveState lastDelivery={lastDelivery} />
      ) : (
        <ActiveDelivery
          contract={active}
          driver={driverPos}
          origin={origin}
          dest={dest}
          eta={eta}
          checkpoints={checkpoints ?? []}
        />
      )}
    </DriverShell>
  );
}

function NoActiveState({ lastDelivery }: { lastDelivery: any }) {
  return (
    <div>
      <div className="mx-4 rounded-[16px] p-7 flex flex-col items-center text-center" style={{ background: "#161B22" }}>
        <TruckIcon size={56} strokeWidth={1.5} style={{ color: "#484F58" }} />
        <div className="text-[18px] font-medium mt-3" style={{ color: "#E6EDF3" }}>Sem entrega ativa</div>
        <div className="text-[14px] mt-1 leading-relaxed" style={{ color: "#8B949E" }}>
          Aguardando a transportadora atribuir um frete
        </div>
      </div>

      {lastDelivery && (
        <section className="pt-4">
          <div className="px-4 pb-2 text-[11px] uppercase tracking-wider" style={{ color: "#484F58", letterSpacing: "0.06em" }}>
            Última entrega
          </div>
          <div className="mx-4 rounded-[14px] p-3.5 flex items-center gap-3" style={{ background: "#161B22" }}>
            <div className="rounded-full flex items-center justify-center" style={{ width: 44, height: 44, background: "#0A2118" }}>
              <CheckCircle2 size={22} style={{ color: "#2ECC8A" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium" style={{ color: "#E6EDF3" }}>
                {lastDelivery.freight?.origin_state ?? "—"} → {lastDelivery.freight?.dest_state ?? "—"}
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: "#8B949E" }}>
                Ontem · {lastDelivery.freight?.weight_tons ?? "—"}t · {lastDelivery.freight?.steel_type ?? "Carga"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-medium tabular-nums" style={{ color: "#2ECC8A" }}>
                R$ {Number(lastDelivery.total_amount_brl ?? 0).toLocaleString("pt-BR")}
              </div>
              <div className="flex items-center gap-0.5 justify-end mt-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={11} style={{ color: "#F0A500", fill: "#F0A500" }} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="pt-4 pb-6">
        <div className="px-4 pb-2 text-[11px] uppercase tracking-wider" style={{ color: "#484F58", letterSpacing: "0.06em" }}>
          Meu score
        </div>
        <div className="mx-4 rounded-[14px] p-3.5 flex items-center gap-3.5" style={{ background: "#161B22" }}>
          <div
            className="rounded-full flex items-center justify-center tabular-nums font-medium"
            style={{ width: 52, height: 52, border: "3px solid #1A9B5E", color: "#2ECC8A", fontSize: 18 }}
          >
            9.4
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium" style={{ color: "#E6EDF3" }}>Motorista Ouro</div>
            <div className="h-[5px] mt-2 rounded-full overflow-hidden" style={{ background: "#21262D" }}>
              <div className="h-full" style={{ width: "94%", background: "#1A9B5E" }} />
            </div>
            <div className="text-[11px] mt-1" style={{ color: "#8B949E" }}>Top 8% da plataforma</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActiveDelivery({
  contract,
  driver,
  origin,
  dest,
  eta,
  checkpoints,
}: {
  contract: ActiveContract;
  driver: { lat: number; lng: number } | null;
  origin: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number } | null;
  eta: string;
  checkpoints: Checkpoint[];
}) {
  const f = contract.freight;
  const doneTypes = new Set(checkpoints.map((c) => c.type ?? ""));
  // Current = first not-yet-done in our predefined order
  const currentIdx = CHECKPOINT_ORDER.findIndex(({ key }) => !doneTypes.has(key));

  return (
    <div>
      <DriverMap driver={driver} origin={origin} dest={dest} eta={eta} />

      {/* Delivery card */}
      <div className="mx-4 mt-2.5 rounded-[16px] p-4" style={{ background: "#0D2744", border: "1px solid #1B6CB8" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase font-medium tracking-wide" style={{ color: "#3B89D4" }}>
              #{contract.id.slice(0, 8)}
            </div>
            <div className="text-[18px] font-medium mt-0.5" style={{ color: "#E6EDF3" }}>
              {f?.origin_state ?? "—"} → {f?.dest_state ?? "—"}
            </div>
            <div className="text-[13px] mt-0.5" style={{ color: "#8B949E" }}>
              {f?.weight_tons ?? "—"} t · {f?.steel_type ?? "Carga"}
            </div>
          </div>
          <span
            className="text-[11px] px-3 py-1 rounded-full font-medium whitespace-nowrap"
            style={{ background: "#0D2744", color: "#3B89D4", border: "1px solid #1B6CB8" }}
          >
            Em rota
          </span>
        </div>

        {/* Checkpoint dots */}
        <div className="flex items-center mt-4 px-1">
          {CHECKPOINT_ORDER.map((cp, i) => {
            const done = doneTypes.has(cp.key) || (currentIdx === -1 ? true : i < currentIdx);
            const current = currentIdx === i;
            const prevDone = i > 0 && (doneTypes.has(CHECKPOINT_ORDER[i - 1].key) || (currentIdx === -1 ? true : i - 1 < currentIdx));
            return (
              <div key={cp.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
                  <div
                    className="rounded-full relative z-10"
                    style={{
                      width: 10, height: 10,
                      background: done ? "#1A9B5E" : current ? "#1B6CB8" : "#21262D",
                      border: !done && !current ? "1.5px solid #30363D" : undefined,
                      boxShadow: current ? "0 0 0 3px rgba(27,108,184,0.25)" : undefined,
                    }}
                  />
                  <div
                    className="text-[10px] mt-1.5 whitespace-nowrap"
                    style={{ color: done || current ? "#E6EDF3" : "#8B949E" }}
                  >
                    {cp.label}
                  </div>
                </div>
                {i < CHECKPOINT_ORDER.length - 1 && (
                  <div
                    className="h-[2px] flex-1 mx-1"
                    style={{ background: prevDone && done ? "#1A9B5E" : "#21262D", marginBottom: 18 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Next checkpoint info */}
      <div className="px-4 py-1.5 flex items-center gap-2 mt-1">
        <MapPin size={16} style={{ color: "#1B6CB8" }} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px]" style={{ color: "#8B949E" }}>Próximo checkpoint</div>
          <div className="text-[14px] font-medium" style={{ color: "#E6EDF3" }}>
            {currentIdx >= 0 ? CHECKPOINT_ORDER[currentIdx].label : "Concluído"}
            {dest && driver && currentIdx >= 0 && (
              <span className="font-normal" style={{ color: "#8B949E" }}>
                {" "}· ~{Math.round(haversineKm(driver, dest))} km
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 pb-2">
        <Link
          to="/driver/checkpoint"
          className="flex items-center justify-center gap-2 rounded-[14px] font-medium"
          style={{
            height: 56, fontSize: 17, marginLeft: 16, marginRight: 16, marginBottom: 8,
            background: "#1B6CB8", color: "#fff", touchAction: "manipulation",
          }}
        >
          <Camera size={22} /> Registrar checkpoint
        </Link>
        <Link
          to="/driver/panic"
          className="flex items-center justify-center gap-2 rounded-[14px] font-medium"
          style={{
            height: 52, fontSize: 15, marginLeft: 16, marginRight: 16,
            background: "rgba(194,51,51,0.2)", border: "1.5px solid #C23333", color: "#F87171",
            touchAction: "manipulation",
          }}
        >
          <AlertTriangle size={20} /> Emergência
        </Link>
      </div>
    </div>
  );
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
