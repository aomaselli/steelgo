// Rastreamento de viagem (Modulo 3): abstracao LocationProvider + lote de
// pontos para ingest_trip_locations, SOMENTE durante viagem ativa (o servidor
// recusa fora dela e sem aviso de privacidade reconhecido).
//
// Provedores:
//   web            navigator.geolocation (primeiro plano; PWA/navegador)
//   community-dev  adaptador para @capacitor-community/background-geolocation
//                  (MIT), APENAS builds de desenvolvimento nativas. O pacote NAO
//                  esta instalado: a versao 1.2.26 nao compila com o AGP 9.3 deste
//                  projeto (getDefaultProguardFile('proguard-android.txt')). Sem o
//                  plugin, o adaptador reporta erro explicito e nada e coletado.
//   transistorsoft provedor comercial para producao - NAO instalado, NAO
//                  comprado, NAO homologado (decisao pendente da fundadora)
//
// Regra sem fallback silencioso: build nativa de PRODUCAO sem provedor
// homologado -> rastreamento em segundo plano DESLIGADO e a interface diz isso.
// A identidade do provedor vai na sessao (start_tracking_session) e no catalogo
// tracking_provider do servidor.
import { appVersion, getDeviceId, isNativePlatform, platformName } from "@/lib/device";
import { enqueueLocationBatch, flushOutbox, nextSeq } from "@/lib/outbox";
import { rpcIngestLocations, rpcStartTrackingSession } from "@/lib/trips";
import type { Database } from "@/integrations/supabase/types";

export type TrackingProvider = Database["public"]["Enums"]["tracking_provider"];

export type LocationPoint = {
  lat: number;
  lng: number;
  accuracy_m: number;
  speed_mps?: number | null;
  heading?: number | null;
  altitude_m?: number | null;
  captured_at: string;
  is_moving?: boolean | null;
  battery_pct?: number | null;
};

export interface LocationProvider {
  readonly id: TrackingProvider;
  readonly label: string;
  /** true se roda em segundo plano (app minimizado) - so os nativos */
  readonly background: boolean;
  /** true se este provedor e aceito em builds de PRODUCAO */
  readonly homologated: boolean;
  /** true se a coleta realmente comecou; false = nada esta sendo coletado (motivo em onError) */
  /** onError(msg, fatal=true) significa que a coleta PAROU (ex.: permissao negada) */
  start(
    onPoint: (p: LocationPoint) => void,
    onError: (msg: string, fatal?: boolean) => void,
  ): Promise<boolean>;
  stop(): Promise<void>;
}

class WebGeolocationProvider implements LocationProvider {
  readonly id = "web" as const;
  readonly label = "GPS do navegador (primeiro plano)";
  readonly background = false;
  readonly homologated = true; // legitimo para uso web/PWA em primeiro plano
  private watchId: number | null = null;
  async start(
    onPoint: (p: LocationPoint) => void,
    onError: (msg: string, fatal?: boolean) => void,
  ) {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onError("Geolocalização não disponível neste dispositivo.");
      return false;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        onPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? 9999,
          speed_mps: pos.coords.speed,
          heading: pos.coords.heading,
          altitude_m: pos.coords.altitude,
          captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
        }),
      (err) => {
        const denied = err.code === 1;
        if (denied && this.watchId != null) {
          navigator.geolocation.clearWatch(this.watchId);
          this.watchId = null;
        }
        onError(
          denied
            ? "Permissão de localização negada: rastreamento DESLIGADO."
            : err.code === 2
              ? "GPS indisponível no momento."
              : "Erro ao obter localização.",
          denied,
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );
    return true;
  }
  async stop() {
    if (this.watchId != null && typeof navigator !== "undefined")
      navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

/** Adaptador de DESENVOLVIMENTO para @capacitor-community/background-geolocation (carregamento dinamico). */
class CommunityDevProvider implements LocationProvider {
  readonly id = "community-dev" as const;
  readonly label = "Background Geolocation (community, build de desenvolvimento)";
  readonly background = true;
  readonly homologated = false;
  private watcherId: string | null = null;
  private plugin: {
    addWatcher: (
      o: Record<string, unknown>,
      cb: (
        loc: Record<string, number | null> | undefined,
        err?: { code?: string; message?: string },
      ) => void,
    ) => Promise<string>;
    removeWatcher: (o: { id: string }) => Promise<void>;
  } | null = null;
  async start(
    onPoint: (p: LocationPoint) => void,
    onError: (msg: string, fatal?: boolean) => void,
  ) {
    try {
      // Somente builds de DESENVOLVIMENTO (import.meta.env.DEV). O plugin nao tem
      // modulo JS: e registrado pelo nome (registerPlugin). A parte NATIVA so existe
      // se o pacote estiver instalado e sincronizado (cap sync) - hoje NAO esta.
      if (!import.meta.env.DEV) throw new Error("community-dev indisponivel em producao");
      const { registerPlugin } = await import("@capacitor/core");
      this.plugin = registerPlugin("BackgroundGeolocation") as CommunityDevProvider["plugin"];
    } catch {
      onError("Provedor community-dev indisponível nesta build.");
      return false;
    }
    try {
      this.watcherId = await this.plugin!.addWatcher(
        {
          backgroundMessage:
            "SteelGo está registrando a posição da viagem ativa (build de desenvolvimento).",
          backgroundTitle: "Viagem em andamento — rastreamento de desenvolvimento",
          requestPermissions: true,
          stale: false,
          distanceFilter: 25,
        },
        (loc, err) => {
          if (err) {
            onError(err.message ?? err.code ?? "erro do provedor");
            return;
          }
          if (!loc || loc.latitude == null || loc.longitude == null) return;
          onPoint({
            lat: loc.latitude,
            lng: loc.longitude,
            accuracy_m: loc.accuracy ?? 9999,
            speed_mps: loc.speed ?? null,
            heading: loc.bearing ?? null,
            altitude_m: loc.altitude ?? null,
            captured_at: new Date(loc.time ?? Date.now()).toISOString(),
          });
        },
      );
      return true;
    } catch (e) {
      // "not implemented": plugin nativo ausente. Nada e coletado; a UI mostra o motivo.
      this.plugin = null;
      this.watcherId = null;
      onError(
        `Plugin nativo community-dev NÃO instalado nesta build: nenhuma posição é coletada em segundo plano (${e instanceof Error ? e.message : String(e)}).`,
      );
      return false;
    }
  }
  async stop() {
    if (this.watcherId && this.plugin) await this.plugin.removeWatcher({ id: this.watcherId });
    this.watcherId = null;
  }
}

export type ProviderSelection = {
  provider: LocationProvider | null;
  reason: string;
  backgroundCapable: boolean;
};

/** Seleciona o provedor conforme plataforma e build. Nunca faz fallback silencioso. */
export function selectLocationProvider(): ProviderSelection {
  const native = isNativePlatform();
  if (!native)
    return {
      provider: new WebGeolocationProvider(),
      reason: "Navegador: GPS em primeiro plano. Ao minimizar o app, a coleta para.",
      backgroundCapable: false,
    };
  if (import.meta.env.DEV) {
    return {
      provider: new CommunityDevProvider(),
      reason:
        "Build de desenvolvimento: provedor community-dev (rastreamento de DESENVOLVIMENTO, não homologado; exige o plugin nativo instalado).",
      backgroundCapable: true,
    };
  }
  return {
    provider: null,
    reason:
      "Rastreamento em segundo plano DESLIGADO: nenhum provedor nativo homologado nesta build (Transistorsoft não instalado/licenciado).",
    backgroundCapable: false,
  };
}

export type TrackerStatus = {
  active: boolean;
  provider: TrackingProvider | null;
  providerLabel: string;
  background: boolean;
  reason: string;
  sessionId: string | null;
  last: LocationPoint | null;
  buffered: number;
  sentPoints: number;
  lastSync: string | null;
  error: string | null;
};

type Listener = (s: TrackerStatus) => void;

/** Rastreador singleton: um por app, uma viagem por vez. */
class TripTracker {
  private status: TrackerStatus = {
    active: false,
    provider: null,
    providerLabel: "",
    background: false,
    reason: "",
    sessionId: null,
    last: null,
    buffered: 0,
    sentPoints: 0,
    lastSync: null,
    error: null,
  };
  private listeners = new Set<Listener>();
  private provider: LocationProvider | null = null;
  private tripId: string | null = null;
  private buffer: LocationPoint[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private batchMax = 50;
  private flushEveryMs = 30_000;

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.status);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit(patch: Partial<TrackerStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }
  getStatus() {
    return this.status;
  }

  async start(tripId: string, policy?: { location_batch_max_points?: number }) {
    if (this.status.active && this.tripId === tripId) return;
    await this.stop("restart");
    const sel = selectLocationProvider();
    this.emit({
      reason: sel.reason,
      background: sel.backgroundCapable,
      providerLabel: sel.provider?.label ?? "nenhum",
      provider: sel.provider?.id ?? null,
      error: null,
    });
    if (!sel.provider) return; // sem provedor homologado: fica desligado e a UI mostra o motivo
    if (policy?.location_batch_max_points)
      this.batchMax = Math.min(policy.location_batch_max_points, 100);
    try {
      const s = await rpcStartTrackingSession(
        tripId,
        getDeviceId(),
        platformName(),
        sel.provider.id,
        appVersion(),
      );
      this.emit({ sessionId: s?.session_id ?? null });
    } catch (e) {
      this.emit({ error: e instanceof Error ? e.message : String(e), active: false });
      return; // sem sessao (ex.: aviso de privacidade nao reconhecido) NAO ha coleta
    }
    this.tripId = tripId;
    this.provider = sel.provider;
    const started = await sel.provider.start(
      (p) => {
        this.buffer.push(p);
        this.emit({ last: p, buffered: this.buffer.length, error: null });
        if (this.buffer.length >= this.batchMax) void this.flush();
      },
      (msg, fatal) => {
        this.emit({ error: msg });
        if (fatal) void this.stop("provider_fatal");
      },
    );
    if (!started) {
      // provedor nao coletou nada: fica DESLIGADO, sem fingir rastreamento
      this.provider = null;
      this.tripId = null;
      this.emit({ active: false });
      return;
    }
    this.timer = setInterval(() => void this.flush(), this.flushEveryMs);
    this.emit({ active: true });
  }

  /** Envia o lote atual; sem rede, grava no outbox (IndexedDB) e o flush do outbox reenvia. */
  async flush() {
    if (!this.tripId || this.buffer.length === 0) return;
    const pts = this.buffer.splice(0, this.batchMax);
    const points: Record<string, unknown>[] = [];
    for (const p of pts) points.push({ ...p, seq: await nextSeq() });
    this.emit({ buffered: this.buffer.length });
    const online = typeof navigator === "undefined" || navigator.onLine;
    if (!online) {
      await enqueueLocationBatch(this.tripId, points);
      return;
    }
    try {
      const r = await rpcIngestLocations(this.tripId, getDeviceId(), crypto.randomUUID(), points);
      this.emit({
        sentPoints: this.status.sentPoints + (r?.accepted ?? 0) + (r?.stored_flagged ?? 0),
        lastSync: new Date().toISOString(),
      });
      if (r && !r.tracking_active) await this.stop("server_inactive");
      void flushOutbox();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "22023" || code === "42501") {
        await this.stop("server_refused");
        this.emit({ error: e instanceof Error ? e.message : String(e) });
        return;
      }
      await enqueueLocationBatch(this.tripId, points);
    }
  }

  async stop(reason: string) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.provider) {
      try {
        await this.provider.stop();
      } catch {
        /* ignore */
      }
    }
    if (this.tripId && this.buffer.length) {
      await this.flush().catch(() => undefined);
    }
    this.provider = null;
    this.tripId = null;
    this.buffer = [];
    this.emit({
      active: false,
      sessionId: null,
      buffered: 0,
      reason: this.status.reason || reason,
    });
  }
}

export const tripTracker = new TripTracker();
