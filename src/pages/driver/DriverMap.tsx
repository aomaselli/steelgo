/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Truck as TruckIcon, Loader2 } from "lucide-react";

type LatLng = { lat: number; lng: number };

type Props = {
  driver: LatLng | null;
  origin: LatLng | null;
  dest: LatLng | null;
  eta?: string;
};

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY ?? "";
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID ?? "";

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#21262d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#161b22" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

type Status = "loading" | "ready" | "error" | "no-key";

let loaderPromise: Promise<typeof google> | null = null;
function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const cbName = "__steelgoInitMap";
    (window as any)[cbName] = () => resolve((window as any).google);
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: "async",
      callback: cbName,
      libraries: "maps,marker",
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loaderPromise;
}

function truckSvg() {
  return {
    url:
      "data:image/svg+xml;utf-8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'>
          <circle cx='18' cy='18' r='17' fill='#1B6CB8' stroke='white' stroke-width='2'/>
          <path d='M10 15h10v6H10z M20 17h4l2 3v1h-6z M13 23a2 2 0 100-4 2 2 0 000 4z M23 23a2 2 0 100-4 2 2 0 000 4z' fill='white'/>
        </svg>`,
      ),
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  } satisfies google.maps.Icon;
}

export function DriverMap({ driver, origin, dest, eta }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeMetaRef = useRef<{ durationSecs: number; totalKm: number } | null>(null);
  const [mapEta, setMapEta] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(BROWSER_KEY ? "loading" : "no-key");

  const recomputeEta = useCallback((driverPos: LatLng, destPos: LatLng) => {
    const meta = routeMetaRef.current;
    if (!meta || meta.totalKm === 0) return;
    const remainKm = haversineKm(driverPos, destPos);
    const ratio = Math.min(1, Math.max(0, remainKm / meta.totalKm));
    const secs = meta.durationSecs * ratio;
    const arrival = new Date(Date.now() + secs * 1_000);
    setMapEta(arrival.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  }, []);

  useEffect(() => {
    if (!BROWSER_KEY) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !ref.current) return;
        try {
          const center = driver ?? origin ?? { lat: -23.55, lng: -46.63 };
          const map = new g.maps.Map(ref.current, {
            center,
            zoom: 12,
            disableDefaultUI: true,
            styles: DARK_STYLES,
            backgroundColor: "#0d1117",
            gestureHandling: "greedy",
          });
          mapRef.current = map;

          if (origin && dest) {
            const destMarker = new g.maps.Marker({
              position: dest,
              map,
              icon: {
                url:
                  "data:image/svg+xml;utf-8," +
                  encodeURIComponent(
                    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='36' viewBox='0 0 28 36'>
                      <path d='M14 0C6.3 0 0 6.1 0 13.7 0 24 14 36 14 36s14-12 14-22.3C28 6.1 21.7 0 14 0z' fill='#E5484D'/>
                      <circle cx='14' cy='14' r='5' fill='#fff'/>
                    </svg>`,
                  ),
                scaledSize: new g.maps.Size(28, 36),
                anchor: new g.maps.Point(14, 36),
              },
              zIndex: 10,
            });

            const renderer = new g.maps.DirectionsRenderer({
              map,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: "#1B6CB8",
                strokeWeight: 4,
                strokeOpacity: 0.85,
              },
            });

            new g.maps.DirectionsService().route(
              { origin, destination: dest, travelMode: g.maps.TravelMode.DRIVING },
              (result, routeStatus) => {
                if (routeStatus === g.maps.DirectionsStatus.OK && result) {
                  renderer.setDirections(result);
                  const leg = result.routes[0].legs[0];
                  routeMetaRef.current = {
                    durationSecs: leg.duration?.value ?? 0,
                    totalKm: (leg.distance?.value ?? 0) / 1_000,
                  };
                  if (driver) recomputeEta(driver, dest);
                  const bounds = new g.maps.LatLngBounds();
                  result.routes[0].overview_path.forEach((p) => bounds.extend(p));
                  if (driver) bounds.extend(driver);
                  map.fitBounds(bounds, 32);
                } else {
                  // fallback: straight dashed line
                  new g.maps.Polyline({
                    path: [origin, dest],
                    geodesic: true,
                    strokeColor: "#1B6CB8",
                    strokeOpacity: 0,
                    icons: [
                      {
                        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3, strokeColor: "#1B6CB8" },
                        offset: "0",
                        repeat: "12px",
                      },
                    ],
                    map,
                  });
                  const bounds = new g.maps.LatLngBounds();
                  bounds.extend(origin);
                  bounds.extend(dest);
                  if (driver) bounds.extend(driver);
                  map.fitBounds(bounds, 32);
                }
                destMarker.setMap(map);
              },
            );
          }

          if (driver) {
            driverMarkerRef.current = new g.maps.Marker({
              position: driver,
              map,
              icon: truckSvg(),
            });
          }
          setStatus("ready");
        } catch (err) {
          console.error("Map init failed:", err);
          setStatus("error");
        }
      })
      .catch((err) => {
        console.error("Google Maps load failed:", err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!driver || !driverMarkerRef.current || !mapRef.current) return;
    driverMarkerRef.current.setPosition(driver);
    if (dest) recomputeEta(driver, dest);
  }, [driver?.lat, driver?.lng, dest?.lat, dest?.lng, recomputeEta]);

  if (status === "loading") {
    return (
      <div
        className="relative w-full flex flex-col items-center justify-center gap-2"
        style={{ height: 200, background: "#0F1923", color: "#8B949E" }}
      >
        <Loader2 size={20} className="animate-spin" />
        <div className="text-[13px]">Carregando mapa...</div>
        <EtaBadge eta={eta} />
      </div>
    );
  }

  if (status === "no-key" || status === "error") {
    return (
      <div
        className="relative w-full"
        style={{ height: 200, background: "linear-gradient(135deg, #0d1b2a, #16213e)" }}
      >
        <svg viewBox="0 0 400 200" className="absolute inset-0 w-full h-full opacity-40">
          <defs>
            <pattern id="dgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1B6CB8" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="200" fill="url(#dgrid)" />
          <path d="M 40 160 Q 200 50, 360 100" stroke="#1B6CB8" strokeWidth="3" strokeDasharray="8 6" fill="none" />
        </svg>
        <div className="absolute" style={{ left: 30, bottom: 32 }}>
          <div
            className="rounded-full flex items-center justify-center"
            style={{ width: 36, height: 36, background: "#1B6CB8", boxShadow: "0 0 0 4px rgba(27,108,184,0.3)" }}
          >
            <TruckIcon size={18} className="text-white" />
          </div>
        </div>
        <div className="absolute" style={{ right: 30, top: 80 }}>
          <MapPin size={32} className="text-red-500 fill-red-500" />
        </div>
        <EtaBadge eta={eta} />
        <div className="absolute bottom-2 left-2 text-[10px] text-graphite-400 px-2 py-0.5 rounded bg-black/60">
          {status === "error" ? "Mapa indisponível" : "Mapa não configurado"}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: 200, background: "#0d1117" }}>
      <div ref={ref} className="absolute inset-0" />
      <EtaBadge eta={mapEta ?? eta} />
    </div>
  );
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.sqrt(x));
}

function EtaBadge({ eta }: { eta?: string }) {
  return (
    <div
      className="absolute top-2 right-2 rounded-[10px] px-3 py-1.5 border"
      style={{ background: "rgba(13,17,23,0.85)", borderColor: "#30363D" }}
    >
      <div className="text-[10px] text-graphite-200 uppercase">Chegada</div>
      <div className="text-[15px] text-graphite-50 font-medium tabular-nums">{eta ?? "--:--"}</div>
    </div>
  );
}
