/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPinOff, Navigation, WifiOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { driverMapState, type MapLoadStatus } from "@/lib/driverMapState";

type LatLng = { lat: number; lng: number };

type Props = {
  driver: LatLng | null;
  origin: LatLng | null;
  dest: LatLng | null;
  eta?: string;
};

const BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "";

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b949e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#21262d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#161b22" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

type Status = MapLoadStatus;

type JanelaComMapa = Window & {
  google?: typeof google;
  __steelgoInitMap?: () => void;
};

let loaderPromise: Promise<typeof google> | null = null;
export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const janela = window as JanelaComMapa;
  if (janela.google?.maps) return Promise.resolve(janela.google);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    janela.__steelgoInitMap = () => resolve(janela.google as typeof google);
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: "async",
      callback: "__steelgoInitMap",
      libraries: "maps,marker",
    });

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
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeMetaRef = useRef<{ durationSecs: number; totalKm: number } | null>(null);
  const [mapEta, setMapEta] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(
    (() => {
      if (!BROWSER_KEY) {
        console.warn("[SteelGo] VITE_GOOGLE_MAPS_KEY is not set. Map will not load.");
        return "no-key";
      }
      return "loading";
    })(),
  );

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
                        icon: {
                          path: "M 0,-1 0,1",
                          strokeOpacity: 1,
                          scale: 3,
                          strokeColor: "#1B6CB8",
                        },
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

  const state = driverMapState({ status, driver, origin, dest });

  // O container precisa existir ANTES de o script resolver: antes desta correcao
  // ele so era montado em "ready", e "ready" so era atingido depois de criar o
  // mapa dentro dele — o mapa nunca aparecia (ficava em "Carregando mapa...").
  const mostrarContainer = status !== "no-key";

  return (
    <div className="relative w-full" style={{ height: 200, background: "#0d1117" }}>
      {mostrarContainer && <div ref={ref} className="absolute inset-0" />}

      {state.kind === "loading" && <MapNotice icon={Loader2} spin text={t("driverMap.loading")} />}

      {state.kind === "unavailable" && (
        <MapNotice
          icon={state.reason === "no-key" ? MapPinOff : WifiOff}
          text={
            state.reason === "no-key"
              ? t("driverMap.unavailableNoKey")
              : t("driverMap.unavailableOffline")
          }
          hint={state.reason === "no-key" ? undefined : t("driverMap.unavailableOfflineHint")}
        />
      )}

      {state.kind === "no_coordinates" && (
        <MapNotice
          icon={MapPinOff}
          text={t("driverMap.noCoordinates")}
          hint={t("driverMap.noCoordinatesHint")}
        />
      )}

      {state.kind === "awaiting_position" && (
        <div
          className="absolute inset-x-2 bottom-2 rounded-[10px] border px-3 py-2 flex items-start gap-2"
          style={{ background: "rgba(13,17,23,0.9)", borderColor: "#30363D" }}
        >
          <Navigation size={14} className="mt-0.5 shrink-0" style={{ color: "#8B949E" }} />
          <div>
            <div className="text-[12px]" style={{ color: "#E6EDF3" }}>
              {t("driverMap.awaitingPosition")}
            </div>
            <div className="text-[11px]" style={{ color: "#8B949E" }}>
              {t("driverMap.awaitingPositionHint")}
            </div>
          </div>
        </div>
      )}

      <EtaBadge eta={mapEta ?? eta} />
    </div>
  );
}

/** Aviso honesto no lugar do mapa: sem caminhao, sem rota e sem grade falsos. */
function MapNotice({
  icon: Icon,
  text,
  hint,
  spin,
}: {
  icon: typeof Loader2;
  text: string;
  hint?: string;
  spin?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
      style={{ background: "#0F1923" }}
    >
      <Icon size={20} className={spin ? "animate-spin" : undefined} style={{ color: "#8B949E" }} />
      <div className="text-[13px]" style={{ color: "#E6EDF3" }}>
        {text}
      </div>
      {hint && (
        <div className="text-[11px] leading-snug" style={{ color: "#8B949E" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
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
