import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

type DriverRecord = {
  id: string;
  carrier_id: string | null;
  profile_id: string | null;
  full_name: string | null;
  cpf: string | null;
  license_number: string | null;
  license_category: string | null;
  license_expiry: string | null;
  license_issuer_country: string | null;
  license_verification_status: string | null;
  country_code: string | null;
};

type CarrierSuggestion = {
  carrier_id: string;
  company_name: string | null;
  trade_name: string | null;
  city: string | null;
  subdivision: string | null;
  country_code: string | null;
  verified: boolean;
};

type PendingRequest = {
  id: string;
  carrier_id: string | null;
  status: string | null;
  message: string | null;
  created_at: string | null;
  carriers?: { company_name?: string | null; trade_name?: string | null } | null;
};

type AvailabilityRecord = {
  id: string;
  status: string | null;
  truck_id: string | null;
  carrier_id: string | null;
  driver_id: string | null;
  max_pickup_radius_km: number | null;
  available_from: string | null;
  available_until: string | null;
  preferred_destination_countries: string[] | null;
  preferred_destination_subdivisions: string[] | null;
  accepts_backhaul: boolean | null;
};

type TruckRecord = {
  id: string;
  carrier_id: string | null;
  plate: string | null;
  type: string | null;
  is_active: boolean | null;
};

const CACHE_KEY = "steelgo_active_delivery";
const CHECKPOINT_ORDER: Array<{ key: string; label: string }> = [
  { key: "pickup", label: "Coleta" },
  { key: "in_transit", label: "Em rota" },
  { key: "toll", label: "Pedágio" },
  { key: "delivery", label: "Destino" },
];

export default function DriverHomePage() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const online = useOnlineStatus();
  const firstName = (profile?.full_name ?? "Motorista").split(" ")[0];
  const lastName = (profile?.full_name ?? "").split(" ").slice(-1)[0] ?? "";
  const initials = (firstName[0] ?? "M") + (lastName[0] ?? "");
  const [inviteToken, setInviteToken] = useState("");
  const [carrierQuery, setCarrierQuery] = useState("");
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState("");
  const [prelinkCpf, setPrelinkCpf] = useState("");
  const [prelinkLicenseNumber, setPrelinkLicenseNumber] = useState("");
  const [prelinkLicenseCountry, setPrelinkLicenseCountry] = useState("BR");
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [radius, setRadius] = useState(80);
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [preferredCountries, setPreferredCountries] = useState<string[]>([]);
  const [preferredStates, setPreferredStates] = useState<string[]>([]);
  const [acceptsBackhaul, setAcceptsBackhaul] = useState(true);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);

  const { data: driverRecord } = useQuery<DriverRecord | null>({
    queryKey: ["driver-record", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").eq("profile_id", user!.id).maybeSingle();
      if (data) return data as DriverRecord;

      // Motorista sem linha em public.drivers: cria de forma idempotente.
      // A RPC valida a role e nasce sem carrier_id (motorista independente).
      const { error: ensureError } = await supabase.rpc("ensure_driver_record");
      if (ensureError) return null;

      const { data: created } = await supabase.from("drivers").select("*").eq("profile_id", user!.id).maybeSingle();
      return (created as DriverRecord | null) ?? null;
    },
  });

  const { data: pendingRequests = [] } = useQuery<PendingRequest[]>({
    queryKey: ["driver-pending-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("driver_carrier_requests")
        .select("id, carrier_id, status, message, created_at, carriers(company_name, trade_name)")
        .eq("profile_id", user!.id)
        .in("status", ["pending", "review", "submitted"])
        .order("created_at", { ascending: false });
      return (data ?? []) as PendingRequest[];
    },
  });

  const { data: fleet = [] } = useQuery<TruckRecord[]>({
    queryKey: ["driver-fleet", driverRecord?.carrier_id],
    enabled: !!driverRecord?.carrier_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trucks")
        .select("id, carrier_id, plate, type, is_active")
        .eq("carrier_id", driverRecord!.carrier_id!)
        .order("created_at", { ascending: false });
      return (data ?? []) as TruckRecord[];
    },
  });

  const { data: availability } = useQuery<AvailabilityRecord | null>({
    queryKey: ["driver-availability", driverRecord?.id],
    enabled: !!driverRecord?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("capacity_availability")
        .select("*")
        .eq("driver_id", driverRecord!.id)
        .in("status", ["available", "paused", "offline", "reserved"])
        .maybeSingle();
      return (data as AvailabilityRecord | null) ?? null;
    },
  });

  const { data: suggestions = [] } = useQuery<CarrierSuggestion[]>({
    queryKey: ["driver-carrier-search", carrierQuery],
    enabled: carrierQuery.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.rpc("search_carriers_for_driver", {
        p_query: carrierQuery,
        p_country_code: undefined,
        p_limit: 10,
      });
      return (data ?? []) as CarrierSuggestion[];
    },
  });

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
    availabilityId: availability?.id ?? null,
  });

  const normalizeCpf = (value: string) => value.replace(/\D/g, "").slice(0, 11);

  const getIdentityForRequest = () => {
    const cpf = normalizeCpf((profile as { cpf?: string | null } | undefined)?.cpf ?? driverRecord?.cpf ?? prelinkCpf ?? "");
    const rawLicenseNumber = (driverRecord?.license_number ?? prelinkLicenseNumber ?? "").trim();
    const licenseNumber = rawLicenseNumber.replace(/\s+/g, " ");
    const licenseCountry = driverRecord?.license_issuer_country ?? driverRecord?.country_code ?? (prelinkLicenseCountry || "BR");
    return { cpf, licenseNumber, licenseCountry };
  };

  const licenseApproved = driverRecord?.license_verification_status === "approved";
  const hasCarrierLink = !!driverRecord?.carrier_id;

  const getLiveLocation = async () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      throw new Error("Geolocalização não disponível neste dispositivo.");
    }
    return new Promise<{ lat: number; lng: number; accuracy: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 }),
        (err) => reject(new Error(err.message || "Não foi possível obter o GPS.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  };

  const acceptInvitation = async () => {
    const token = inviteToken.trim();
    if (!token) {
      toast.error("Informe o token do convite");
      return;
    }

    const { cpf: payloadCpf, licenseNumber: payloadLicenseNumber, licenseCountry: payloadCountry } = getIdentityForRequest();
    if (!payloadCpf || payloadCpf.length < 11) {
      toast.error("Informe um CPF válido antes de aceitar o convite.");
      return;
    }
    if (!payloadLicenseNumber) {
      toast.error("Informe o número da CNH ou licença antes de aceitar o convite.");
      return;
    }

    const { error } = await supabase.rpc("accept_driver_invitation", {
      p_token: token,
      p_cpf: payloadCpf,
      p_license_number: payloadLicenseNumber,
      p_license_country: payloadCountry,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Vínculo realizado com sucesso");
    setInviteToken("");
    qc.invalidateQueries({ queryKey: ["driver-record", user?.id] });
  };

  const requestLink = async () => {
    if (!selectedCarrierId) {
      toast.error("Selecione uma transportadora");
      return;
    }

    const { cpf: payloadCpf, licenseNumber: payloadLicenseNumber, licenseCountry: payloadCountry } = getIdentityForRequest();
    if (!payloadCpf || payloadCpf.length < 11) {
      toast.error("Informe um CPF válido antes de solicitar o vínculo.");
      return;
    }
    if (!payloadLicenseNumber) {
      toast.error("Informe o número da CNH ou licença antes de solicitar o vínculo.");
      return;
    }

    const { error } = await supabase.rpc("request_driver_carrier_link", {
      p_carrier_id: selectedCarrierId,
      p_cpf: payloadCpf,
      p_license_number: payloadLicenseNumber,
      p_license_country: payloadCountry,
      p_license_category: driverRecord?.license_category ?? undefined,
      p_license_expiry: driverRecord?.license_expiry ?? undefined,
      p_message: linkMessage.trim() || undefined,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitação enviada para revisão");
    setSelectedCarrierId(null);
    setLinkMessage("");
    setCarrierQuery("");
    qc.invalidateQueries({ queryKey: ["driver-pending-requests", user?.id] });
  };

  const cancelRequest = async (requestId: string) => {
    const { error } = await supabase.rpc("cancel_driver_carrier_request", { p_request_id: requestId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitação cancelada");
    qc.invalidateQueries({ queryKey: ["driver-pending-requests", user?.id] });
  };

  const setCapacityStatus = async (targetStatus: "available" | "paused" | "offline") => {
    if (!driverRecord?.id || !availability?.id) {
      toast.error("Não existe disponibilidade ativa para alterar.");
      return;
    }
    const { error } = await supabase.rpc("set_capacity_status", {
      p_availability_id: availability.id,
      p_status: targetStatus,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(targetStatus === "available" ? "Disponibilidade retomada" : targetStatus === "paused" ? "Disponibilidade pausada" : "Disponibilidade encerrada");
    qc.invalidateQueries({ queryKey: ["driver-availability", driverRecord.id] });
  };

  const createAvailability = async () => {
    if (!driverRecord?.id || !selectedTruckId) {
      toast.error("Selecione um caminhão antes de ativar a disponibilidade.");
      return;
    }
    if (!hasCarrierLink || !licenseApproved) {
      toast.error("Vínculo e licença aprovados são obrigatórios para estar disponível.");
      return;
    }
    if (geo.lat == null || geo.lng == null) {
      toast.error("GPS real não encontrado. Aguarde a localização do celular antes de ativar.");
      return;
    }
    if (radius < 10 || radius > 500) {
      toast.error("O raio deve estar entre 10 e 500 km.");
      return;
    }
    if (!navigator.onLine) {
      toast.error("Sem conexão para sincronizar a disponibilidade.");
      return;
    }
    setAvailabilityBusy(true);
    try {
      const loc = await getLiveLocation();
      const nextFrom = availableFrom ? new Date(availableFrom) : new Date();
      const nextUntil = availableUntil ? new Date(availableUntil) : null;
      if (nextUntil && nextUntil <= new Date()) {
        toast.error("A janela de disponibilidade precisa ser no futuro.");
        return;
      }
      if (loc.accuracy > 200) {
        toast.error("GPS pouco preciso. Afaste-se de prédios e tente novamente.");
        return;
      }
      const { error } = await supabase.rpc("set_capacity_available", {
        p_driver_id: driverRecord.id,
        p_truck_id: selectedTruckId,
        p_lat: loc.lat,
        p_lng: loc.lng,
        p_accuracy_m: loc.accuracy,
        p_available_from: nextFrom.toISOString(),
        p_available_until: nextUntil ? nextUntil.toISOString() : undefined,
        p_max_pickup_radius_km: radius,
        p_preferred_destination_countries: preferredCountries.length ? preferredCountries : [],
        p_preferred_destination_subdivisions: preferredStates.length ? preferredStates : [],
        p_accepts_backhaul: acceptsBackhaul,
        p_min_rate_per_loaded_km: undefined,
        p_min_total_amount: undefined,
        p_currency_code: "BRL",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Estou disponível");
      setSelectedTruckId(null);
      qc.invalidateQueries({ queryKey: ["driver-availability", driverRecord.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAvailabilityBusy(false);
    }
  };

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

  const driverPos = geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : null;
  const f = active?.freight ?? null;
  const origin = f?.origin_lat != null && f?.origin_lng != null ? { lat: Number(f.origin_lat), lng: Number(f.origin_lng) } : null;
  const dest = f?.dest_lat != null && f?.dest_lng != null ? { lat: Number(f.dest_lat), lng: Number(f.dest_lng) } : null;

  const eta = useMemo(() => {
    // Cheap ETA: 60 km/h straight-line from driver to dest
    if (!driverPos || !dest) return "--:--";
    const km = haversineKm(driverPos, dest);
    const minutes = Math.round((km / 60) * 60);
    const arr = new Date(Date.now() + minutes * 60_000);
    return arr.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [driverPos?.lat, driverPos?.lng, dest?.lat, dest?.lng]);

  return (
    <DriverShell activeTab="home">
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

      {!driverRecord ? (
        <div className="mx-4 mb-4 rounded-[16px] border border-[#30363D] bg-[#161B22] p-4 space-y-3">
          <div className="text-[18px] font-medium text-[#E6EDF3]">Vincular transportadora</div>
          <div className="text-sm text-[#8B949E]">Faça o vínculo com um token ou solicite associação à transportadora.</div>
          <div className="space-y-2">
            <input value={prelinkCpf} onChange={(e) => setPrelinkCpf(normalizeCpf(e.target.value))} placeholder="CPF obrigatório" inputMode="numeric" maxLength={11} className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
            <input value={prelinkLicenseNumber} onChange={(e) => setPrelinkLicenseNumber(e.target.value.trimStart())} placeholder="CNH ou número da licença obrigatório" className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
            <input value={prelinkLicenseCountry} onChange={(e) => setPrelinkLicenseCountry(e.target.value.toUpperCase() || "BR")} placeholder="País emissor" maxLength={3} className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
            <input value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Cole o token do convite" className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
            <button type="button" onClick={() => void acceptInvitation()} className="w-full rounded-[10px] bg-[#1B6CB8] px-3 py-2 text-sm font-medium text-white">Aceitar convite</button>
          </div>
          <div className="space-y-2">
            <input value={carrierQuery} onChange={(e) => setCarrierQuery(e.target.value)} placeholder="Buscar transportadora" className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
            {suggestions.length > 0 && (
              <div className="space-y-2">
                {suggestions.map((carrier) => (
                  <button key={carrier.carrier_id} type="button" onClick={() => setSelectedCarrierId(carrier.carrier_id)} className="w-full text-left rounded-[10px] border border-[#30363D] bg-[#0D1117] p-3">
                    <div className="font-medium text-[#E6EDF3]">{carrier.company_name ?? carrier.trade_name ?? "Transportadora"}</div>
                    <div className="text-xs text-[#8B949E]">{carrier.city ?? "—"} · {carrier.country_code ?? "BR"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea value={linkMessage} onChange={(e) => setLinkMessage(e.target.value)} placeholder="Mensagem para a transportadora" className="w-full min-h-[80px] rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
          <button type="button" onClick={() => void requestLink()} className="w-full rounded-[10px] bg-[#1A9B5E] px-3 py-2 text-sm font-medium text-white">Solicitar vínculo</button>
          {pendingRequests.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#8B949E]">Solicitações pendentes</div>
              {pendingRequests.map((req) => (
                <div key={req.id} className="rounded-[10px] border border-[#30363D] bg-[#0D1117] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-[#E6EDF3]">{req.carriers?.company_name ?? req.carriers?.trade_name ?? "Transportadora"}</div>
                    <span className="text-[10px] uppercase text-[#8B949E]">{req.status}</span>
                  </div>
                  {req.message && <div className="mt-1 text-xs text-[#8B949E]">{req.message}</div>}
                  <button type="button" onClick={() => void cancelRequest(req.id)} className="mt-2 text-xs text-[#F87171]">Cancelar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mx-4 mb-4 rounded-[16px] border border-[#30363D] bg-[#161B22] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#8B949E]">Status da CNH</div>
              <div className="text-[16px] font-medium text-[#E6EDF3]">{driverRecord.license_verification_status ?? "pending"}</div>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-xs ${licenseApproved ? "bg-emerald-500/20 text-emerald-400" : driverRecord.license_verification_status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
              {driverRecord.license_verification_status ?? "pending"}
            </div>
          </div>
          <div className="text-sm text-[#8B949E]">CNH: {driverRecord.license_number ?? "—"} · {driverRecord.license_issuer_country ?? driverRecord.country_code ?? "BR"}</div>
          {hasCarrierLink && licenseApproved && (
            <div className="space-y-3 pt-2">
              <div className="text-sm text-[#8B949E]">Disponibilidade de capacidade</div>
              <div className="space-y-2">
                <select value={selectedTruckId ?? ""} onChange={(e) => setSelectedTruckId(e.target.value || null)} className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]">
                  <option value="">Selecione um caminhão</option>
                  {fleet.map((truck) => (
                    <option key={truck.id} value={truck.id}>{truck.plate ?? "Caminhão"}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  <label className="block text-xs text-[#8B949E]">Raio de coleta (10–500 km)</label>
                  <input type="range" min={10} max={500} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" />
                  <div className="text-sm text-[#E6EDF3]">{radius} km</div>
                </div>
                <input type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
                <input type="datetime-local" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} className="w-full rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
                <div className="flex gap-2 flex-wrap">
                  <input value={preferredCountries.join(",")} onChange={(e) => setPreferredCountries(e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} placeholder="Países preferidos, ex.: BR,AR" className="flex-1 min-w-[130px] rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
                  <input value={preferredStates.join(",")} onChange={(e) => setPreferredStates(e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} placeholder="Estados preferidos" className="flex-1 min-w-[130px] rounded-[10px] bg-[#0D1117] border border-[#30363D] px-3 py-2 text-sm text-[#E6EDF3]" />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#C6CFD8]">
                  <input type="checkbox" checked={acceptsBackhaul} onChange={(e) => setAcceptsBackhaul(e.target.checked)} />
                  Aceita retorno / backhaul
                </label>
                {availability?.status ? (
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => void setCapacityStatus(availability.status === "available" ? "paused" : "available")} className="rounded-[10px] bg-[#1B6CB8] px-3 py-2 text-sm font-medium text-white">
                      {availability.status === "available" ? "Pausar disponibilidade" : "Retomar disponibilidade"}
                    </button>
                    <button type="button" onClick={() => void setCapacityStatus("offline")} className="rounded-[10px] border border-[#30363D] px-3 py-2 text-sm font-medium text-[#F87171]">Encerrar</button>
                  </div>
                ) : (
                  <button type="button" disabled={availabilityBusy} onClick={() => void createAvailability()} className="w-full rounded-[10px] bg-[#1A9B5E] px-3 py-2 text-sm font-medium text-white">
                    {availabilityBusy ? "Ativando..." : "Estou disponível"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
