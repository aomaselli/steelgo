import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Radio, TriangleAlert } from "lucide-react";
import { fetchAdminPositions } from "@/lib/trips";
import { tripStatusMeta } from "@/lib/tripStatus";

// Modulo 3: posicoes vem de list_trip_positions_admin (ultima posicao por
// viagem ativa, RPC de admin); a tabela legada driver_positions foi congelada.
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
const BR_CENTER = { lat: -15.7801, lng: -47.9292 };

type MapStatus = "loading" | "ready" | "missing-key" | "error";

export function AdminOperationsMap() {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [status, setStatus] = useState<MapStatus>(MAPS_KEY ? "loading" : "missing-key");

  const { data: positions = [], isError } = useQuery({
    queryKey: ["admin-live-trip-positions"],
    enabled: status === "ready",
    refetchInterval: 30_000,
    queryFn: fetchAdminPositions,
  });

  useEffect(() => {
    if (!MAPS_KEY) return;
    let attempts = 0;
    const checkMaps = () => {
      if (window.google?.maps) {
        setStatus("ready");
        return true;
      }
      attempts += 1;
      if (attempts >= 60) setStatus("error");
      return false;
    };
    if (checkMaps()) return;
    const id = window.setInterval(() => {
      if (checkMaps() || attempts >= 60) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (status !== "ready" || !containerRef.current || mapRef.current) return;
    mapRef.current = new window.google.maps.Map(containerRef.current, {
      center: BR_CENTER,
      zoom: 4,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
  }, [status]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    for (const position of positions) {
      if (position.lat == null || position.lng == null) continue;
      const point = { lat: Number(position.lat), lng: Number(position.lng) };
      const danger = position.has_open_sos || (position.open_alerts ?? 0) > 0;
      const marker = new window.google.maps.Marker({
        position: point,
        map: mapRef.current,
        title: position.trip_number,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: position.has_open_sos ? "#C23333" : danger ? "#E0A23A" : "#2FA98A",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3,
        },
      });
      const updatedAt = position.last_location_at
        ? new Date(position.last_location_at).toLocaleString("pt-BR")
        : "Sem horário";
      const eta = position.eta_at ? new Date(position.eta_at).toLocaleString("pt-BR") : "—";
      const info = new window.google.maps.InfoWindow({
        content: `<div style="color:#16263F;font:13px sans-serif"><strong>${position.trip_number}</strong> · ${tripStatusMeta(position.status).label}<br/>${position.carrier_company_name ?? ""} · ${position.driver_label ?? ""}<br/>Última posição: ${updatedAt}<br/>ETA (estimativa): ${eta}<br/>Alertas abertos: ${position.open_alerts ?? 0}${position.has_open_sos ? " · <b style='color:#C23333'>ALERTA CRÍTICO</b>" : ""}</div>`,
      });
      marker.addListener("click", () => info.open({ map: mapRef.current, anchor: marker }));
      markersRef.current.push(marker);
      bounds.extend(point);
    }

    if (markersRef.current.length === 1) {
      const p = markersRef.current[0].getPosition();
      if (p) mapRef.current.setCenter(p);
      mapRef.current.setZoom(12);
    } else if (markersRef.current.length > 1) {
      mapRef.current.fitBounds(bounds, 56);
    }
  }, [positions]);

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E6EAF0] bg-white shadow-[0_8px_24px_rgba(16,28,48,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6EAF0] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#1B6CB8]" />
            <h2 className="font-semibold text-[#16263F]">{t("controlTower.title")}</h2>
          </div>
          <p className="mt-1 text-sm text-[#5B6B80]">
            Viagens ativas com última posição conhecida (estimativas, não rota exata)
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#2FA98A]/10 px-3 py-1.5 text-sm font-medium text-[#1A7D60]">
          <Radio className="h-4 w-4" />
          {positions.length} viagens com posição
        </div>
      </div>

      <div className="relative h-[420px] bg-[#F3F6FA]">
        <div ref={containerRef} className="absolute inset-0" />
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#F7F9FB] text-[#5B6B80]">
            <Loader2 className="h-7 w-7 animate-spin text-[#1B6CB8]" />
            Carregando mapa operacional…
          </div>
        )}
        {status === "missing-key" && <MapMessage text={t("controlTower.mapUnavailable")} />}
        {(status === "error" || isError) && (
          <MapMessage text="Não foi possível carregar o mapa ou consultar as posições." />
        )}
        {status === "ready" && !isError && positions.length === 0 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[#D8DFE8] bg-white/95 px-4 py-2 text-sm text-[#5B6B80] shadow-lg">
            Mapa conectado — nenhuma viagem transmitindo posição agora.
          </div>
        )}
      </div>
    </section>
  );
}

function MapMessage({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#F7F9FB] px-6 text-center text-[#5B6B80]">
      <TriangleAlert className="h-7 w-7 text-[#E0A23A]" />
      <p className="max-w-md text-sm">{text}</p>
    </div>
  );
}
