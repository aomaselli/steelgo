// Mapa da viagem (transportadora/embarcador/SteelGo): trilha via
// list_trip_positions (leitura AUDITADA em trip_access_log), geofences e ultima
// posicao. Sem chave do Google Maps, mostra a lista textual das ultimas posicoes.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { Card } from "@/components/steel";
import { loadGoogleMaps } from "@/pages/driver/DriverMap";
import { fetchTripPositions, type TripDetail } from "@/lib/trips";
import { fmtDateTime, tripStatusMeta } from "@/lib/tripStatus";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

export function TripTrackMap({ trip }: { trip: TripDetail }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlays = useRef<(google.maps.Marker | google.maps.Polyline | google.maps.Circle)[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(
    KEY ? "loading" : "no-key",
  );
  const active = tripStatusMeta(trip.status).active;
  const { data: positions = [] } = useQuery({
    queryKey: ["trip-positions", trip.id],
    queryFn: () => fetchTripPositions(trip.id, null),
    refetchInterval: active ? 30_000 : false,
  });

  useEffect(() => {
    if (!KEY) return;
    let alive = true;
    loadGoogleMaps()
      .then((g) => {
        if (!alive || !ref.current) return;
        mapRef.current = new g.maps.Map(ref.current, {
          center: { lat: -15.78, lng: -47.93 },
          zoom: 4,
          disableDefaultUI: true,
          zoomControl: true,
        });
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const g = window.google;
    const map = mapRef.current;
    if (status !== "ready" || !g?.maps || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const bounds = new g.maps.LatLngBounds();
    const pts = positions
      .filter(
        (p) => p.accepted && !(p.flags ?? []).some((f) => f === "impossible_speed" || f === "jump"),
      )
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    if (pts.length > 1) {
      const line = new g.maps.Polyline({
        path: pts,
        map,
        strokeColor: "#1B6CB8",
        strokeOpacity: 0.9,
        strokeWeight: 3,
      });
      overlays.current.push(line);
      pts.forEach((p) => bounds.extend(p));
    }
    for (const gf of trip.geofences) {
      if (gf.lat == null || gf.lng == null || gf.radius_m == null) continue;
      const c = new g.maps.Circle({
        map,
        center: { lat: gf.lat, lng: gf.lng },
        radius: gf.radius_m,
        strokeColor:
          gf.kind === "pickup" ? "#2FA98A" : gf.kind === "delivery" ? "#E0A23A" : "#7A8AA0",
        strokeWeight: 1.5,
        fillOpacity: 0.08,
      });
      overlays.current.push(c);
      bounds.extend({ lat: gf.lat, lng: gf.lng });
    }
    if (trip.last_location) {
      const m = new g.maps.Marker({
        map,
        position: trip.last_location,
        title: `Última posição ${fmtDateTime(trip.last_location_at)}`,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: active ? "#2FA98A" : "#7A8AA0",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      overlays.current.push(m);
      bounds.extend(trip.last_location);
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
  }, [status, positions, trip.geofences, trip.last_location, trip.last_location_at, active]);

  return (
    <Card variant="light" className="overflow-hidden p-0">
      <div className="px-4 py-3 border-b border-[#DDE7F2] flex items-center justify-between">
        <h2 className="text-sm font-medium text-[#10274A] flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Trilha e geofences
        </h2>
        <span className="text-xs text-[#54657C]">
          {positions.length} posições aceitas · leitura auditada
        </span>
      </div>
      {status === "no-key" ? (
        <div className="p-4 text-xs text-[#54657C] space-y-1">
          <div>Mapa indisponível (VITE_GOOGLE_MAPS_KEY não configurada). Últimas posições:</div>
          {positions
            .slice(-8)
            .reverse()
            .map((p, i) => (
              <div key={i}>
                {fmtDateTime(p.captured_at)} · {Number(p.lat).toFixed(4)},{" "}
                {Number(p.lng).toFixed(4)} · ±{Math.round(Number(p.accuracy_m))} m
                {p.flags?.length ? ` · ${p.flags.join(", ")}` : ""}
              </div>
            ))}
          {!positions.length && <div>Sem posições registradas.</div>}
        </div>
      ) : (
        <div className="relative h-[340px] bg-[#F3F6FA]">
          <div ref={ref} className="absolute inset-0" />
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-[#54657C]">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center text-[#54657C] text-sm">
              Não foi possível carregar o mapa.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
