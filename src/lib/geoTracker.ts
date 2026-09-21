// Rastreamento de viagem (Modulo 3): abstracao LocationProvider + lote de
// pontos para ingest_trip_locations, SOMENTE durante viagem ativa (o servidor
// recusa fora dela e sem aviso de privacidade reconhecido).
//
// Provedores:
//   web            navigator.geolocation (primeiro plano; PWA/navegador e WebView)
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
//
// AUTORIDADE UNICA de localizacao: este modulo e o UNICO lugar do app que chama
// navigator.geolocation e, portanto, o unico capaz de abrir o dialogo de permissao
// do Android. Nenhum componente possui watch paralelo.
//
// SERIALIZACAO: toda mutacao do TripTracker (start, callback de posicao, flush,
// background/foreground, stop, logout, troca de viagem, unmount, inicio atomico)
// passa por UMA fila serial (this.run). stop() e idempotente e compartilha a mesma
// Promise entre chamadores simultaneos. No inicio do stop: captura imutavel de
// tripId/sessionId/deviceId/buffer, watch desligado e epoch incrementado (callbacks
// antigos sao ignorados), buffer PERSISTIDO na outbox antes de limpar a memoria.
// Nenhum ponto e descartado por rede, tela, HOME, unmount ou corrida.
//
// INICIO ATOMICO ("Iniciar deslocamento"): preflight no estado mais recente do
// servidor -> captura explicita do primeiro fix (o dialogo aparece aqui) ->
// UMA chamada a start_trip_tracking (sessao + tracking_state + transicao + primeiro
// ponto na mesma transacao) -> watch. command_id persistido enquanto o resultado
// for desconhecido (retry de rede reutiliza command_id E o mesmo fix); rejeicao
// conhecida consome o command_id (nova tentativa = novo command_id).
//
// AMOSTRAGEM (politica congelada, servidor e a autoridade): ver lib/trackingPolicy.
// Opcoes efetivas do watch: navigator.geolocation.watchPosition NAO tem cadencia
// minima configuravel (WebView/Chrome entrega cada fix do GNSS, ~1 Hz em movimento);
// `maximumAge` so permite reutilizar fix em cache e `timeout` limita a espera. Por
// isso a reducao e feita aqui (sampleVerdict descarta o callback sem armazenar).
// Alternativa futura documentada: @capacitor/geolocation.watchPosition com
// `minimumUpdateInterval` (somente Android) - mudaria a autoridade e o teste
// estrutural; nao adotada nesta rodada.
import { getDeviceId, isNativePlatform, platformName } from "@/lib/device";
import { resolveAppVersion } from "@/lib/appInfo";
import {
  deleteMeta,
  enqueueLocationBatch,
  flushOutbox,
  getMeta,
  lastQueuedPoint,
  nextSeqRange,
  setMeta,
  type OutboxPoint,
} from "@/lib/outbox";
import {
  fetchMyDriverTrip,
  rpcIngestLocations,
  rpcStartTrackingSession,
  rpcStartTripTracking,
  type StartTripTrackingResult,
} from "@/lib/trips";
import { isRetryableError } from "@/lib/outbox";
import {
  evaluateLocationGate,
  isDocumentForeground,
  type AssignmentState,
  type LocationGateInput,
  type TripStatus,
} from "@/lib/locationGate";
import { parseTrackingPolicy, sampleVerdict, type TrackingPolicy } from "@/lib/trackingPolicy";

/**
 * Motivo tipado de uma captura PONTUAL (sem watch, sem sessao). Cada motivo tem o
 * seu gate; nenhum deles roda ao montar uma tela - sempre depois de acao explicita
 * do motorista e da explicacao contextual na UI.
 */
export type CaptureReason = "trip_start" | "capacity_availability" | "command";
export type ExplicitCaptureInput =
  | { reason: "trip_start"; gate: TripStartGate }
  | { reason: "capacity_availability"; noticeAcknowledged: boolean }
  | { reason: "command" };

export type TripStartGate = {
  assignmentState: AssignmentState | null | undefined;
  noticeAcknowledged: boolean;
  tripStatus: TripStatus | null | undefined;
};

/** Resultado tipado do inicio atomico (para a UI decidir a mensagem/acao). */
export type TripStartResult =
  | { ok: true; sessionId: string | null; duplicate: boolean; sessionWasExisting: boolean }
  | {
      ok: false;
      reason:
        | "designacao_nao_aceita"
        | "aviso_nao_reconhecido"
        | "aviso_nao_publicado"
        | "estado_invalido"
        | "viagem_pausada"
        | "app_em_segundo_plano"
        | "sem_posicao"
        | "precisao_insuficiente"
        | "sem_provedor"
        | "sem_rede"
        | "session_context_mismatch"
        | "assignment_not_accepted"
        | "invalid_state"
        | "accuracy_rejected"
        | "rejeitado"
        | "erro";
      message: string;
      /** codigo bruto do servidor, quando houver */
      code?: string | null;
      /** true quando a mesma tentativa (command_id) pode ser reenviada sem novo fix */
      retryable: boolean;
    };

/** Comando de inicio persistido enquanto o resultado for desconhecido. */
type PendingStart = {
  trip_id: string;
  command_id: string;
  seq: number;
  point: OutboxPoint;
  provider: TrackingProvider;
  platform: string;
  created_at: number;
};
const startKey = (tripId: string) => `start_cmd:${tripId}`;

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
  readonly label = "GPS em primeiro plano (app aberto)";
  readonly background = false;
  readonly homologated = true; // legitimo em primeiro plano: navegador/PWA e WebView nativo
  private watchId: number | null = null;
  /** Leitura pontual para um COMANDO; so e chamada com o watch ativo (permissao ja decidida). */
  captureOnce(timeoutMs: number): Promise<LocationPoint | null> {
    if (this.watchId == null) return Promise.resolve(null);
    return WebGeolocationProvider.readOnce(timeoutMs);
  }
  /**
   * Leitura pontual EXPLICITA (pode abrir o dialogo do sistema). Nao cria watch nem
   * sessao. Chamada somente por tripTracker.captureOnce() apos o gate do motivo.
   */
  static readOnce(timeoutMs: number): Promise<LocationPoint | null> {
    if (typeof navigator === "undefined" || !("geolocation" in navigator))
      return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy ?? 9999,
            captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 },
      );
    });
  }
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
  // Producao nativa: coleta SOMENTE em primeiro plano (WebView -> permissao do
  // Android "durante o uso"). Segundo plano continua DESLIGADO: nenhum provedor
  // nativo homologado nesta build (Transistorsoft não instalado/licenciado).
  return {
    provider: new WebGeolocationProvider(),
    reason:
      "Rastreamento apenas com o app aberto. Rastreamento em segundo plano DESLIGADO: nenhum provedor nativo homologado nesta build (Transistorsoft não instalado/licenciado).",
    backgroundCapable: false,
  };
}

const TRACKING_STATUSES_SET = new Set<string>([
  "en_route_to_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
  "returning",
]);

export type SamplingStats = {
  kept: number;
  dropped_min_interval: number;
  dropped_no_movement: number;
  dropped_duplicate_fix: number;
  dropped_accuracy: number;
};

export type TrackerStatus = {
  active: boolean;
  provider: TrackingProvider | null;
  providerLabel: string;
  background: boolean;
  reason: string;
  sessionId: string | null;
  /** ultimo ponto ACEITO pela amostragem (referencia; e o que vai para o servidor) */
  last: LocationPoint | null;
  /** ultimo callback bruto do watch (so para exibicao) */
  lastFix: LocationPoint | null;
  buffered: number;
  sentPoints: number;
  lastSync: string | null;
  error: string | null;
  sampling: SamplingStats;
  policyVersion: number | null;
};

type Listener = (s: TrackerStatus) => void;

const emptySampling = (): SamplingStats => ({
  kept: 0,
  dropped_min_interval: 0,
  dropped_no_movement: 0,
  dropped_duplicate_fix: 0,
  dropped_accuracy: 0,
});

type StartGate = Omit<LocationGateInput, "appForeground">;

/** Rastreador singleton: um por app, uma viagem por vez. Toda mutacao passa por `run` (fila serial). */
class TripTracker {
  private status: TrackerStatus = {
    active: false,
    provider: null,
    providerLabel: "",
    background: false,
    reason: "",
    sessionId: null,
    last: null,
    lastFix: null,
    buffered: 0,
    sentPoints: 0,
    lastSync: null,
    error: null,
    sampling: emptySampling(),
    policyVersion: null,
  };
  private listeners = new Set<Listener>();
  private provider: LocationProvider | null = null;
  private tripId: string | null = null;
  private buffer: OutboxPoint[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private policy: TrackingPolicy = parseTrackingPolicy(null);
  private batchMax = 100;
  private flushEveryMs = 30_000;
  /** incrementado a cada start/stop: callbacks de epocas antigas sao ignorados */
  private epoch = 0;
  /** fila serial de mutacoes */
  private queue: Promise<unknown> = Promise.resolve();
  private stopping: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private startInFlight: Promise<TripStartResult> | null = null;
  private sessionOpening: Promise<void> | null = null;
  private preOpenedSession: { tripId: string; id: string | null } | null = null;
  /** ultimo pedido de start (para retomar ao voltar ao primeiro plano) */
  private resumeGate: { tripId: string; gate: StartGate; policyRaw: unknown } | null = null;
  private visibilityBound = false;
  /** viagem a que se referem last/lastFix/sampling */
  private lastTrip: string | null = null;

  // ------------------------------------------------------------------ infra
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }
  private onVisibility = () => {
    if (!isDocumentForeground()) {
      // Sair de primeiro plano => watch PARA, buffer PERSISTE, nenhuma rede.
      if (this.status.active || this.provider) void this.stop("background");
    } else {
      void this.run(() => this._onForeground());
    }
  };
  private bindVisibility() {
    if (!this.visibilityBound && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
      this.visibilityBound = true;
    }
  }
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
  /** Politica em vigor no rastreador (para telas que precisem dos limites; sem numeros magicos). */
  getPolicy(): TrackingPolicy {
    return this.policy;
  }

  // ------------------------------------------------------------------ start / resume
  /**
   * Liga (ou mantem) o watch para uma viagem JA em estado rastreavel. Unico
   * caminho que pode disparar o dialogo de localizacao fora do inicio atomico.
   * `gate` descreve o estado operacional; qualquer condicao falsa => nada e pedido.
   */
  start(tripId: string, gate: StartGate, policy?: unknown): Promise<void> {
    return this.run(() => this._start(tripId, gate, policy));
  }

  private async _start(tripId: string, gate: StartGate, policyRaw?: unknown): Promise<void> {
    this.bindVisibility();
    this.resumeGate = { tripId, gate, policyRaw };
    const verdict = evaluateLocationGate({ ...gate, appForeground: isDocumentForeground() });
    if (!verdict.allowed) {
      if (this.status.active || this.provider) await this._stop(verdict.reason);
      else if (this.status.reason !== verdict.reason) this.emit({ reason: verdict.reason });
      return;
    }
    if (this.provider && this.tripId === tripId) return; // ja coletando para esta viagem
    await this._stop("restart");
    const sel = selectLocationProvider();
    this.emit({
      reason: sel.reason,
      background: sel.backgroundCapable,
      providerLabel: sel.provider?.label ?? "nenhum",
      provider: sel.provider?.id ?? null,
      error: null,
    });
    if (!sel.provider) return; // sem provedor: fica desligado e a UI mostra o motivo
    this.applyPolicy(policyRaw);
    if (this.lastTrip !== tripId) {
      this.lastTrip = tripId;
      this.emit({ last: null, lastFix: null, sampling: emptySampling(), sentPoints: 0 });
    }
    this.tripId = tripId;
    this.provider = sel.provider;
    const providerId = sel.provider.id;
    const epoch = ++this.epoch;
    if (this.preOpenedSession?.tripId === tripId) {
      this.emit({ sessionId: this.preOpenedSession.id });
      this.preOpenedSession = null;
    }
    // referencia de amostragem: ultimo aceito desta viagem (memoria) ou ultimo persistido (reload)
    if (!this.status.last) {
      const q = await lastQueuedPoint(tripId).catch(() => null);
      if (q) this.emit({ last: q });
    }
    const started = await sel.provider.start(
      (p) => {
        if (epoch !== this.epoch) return; // parado nesse meio-tempo
        void this.run(() => this._onPoint(epoch, p, providerId));
      },
      (msg, fatal) => {
        if (epoch !== this.epoch) return;
        this.emit({ error: msg });
        if (fatal) void this.stop("provider_fatal");
      },
    );
    if (epoch !== this.epoch) return; // stop chegou durante o start do provedor
    if (!started) {
      this.provider = null;
      this.tripId = null;
      this.emit({ active: false });
      return;
    }
    this.timer = setInterval(() => void this.flush(), this.flushEveryMs);
    this.emit({ active: true });
  }

  private applyPolicy(raw: unknown) {
    this.policy = parseTrackingPolicy(raw);
    this.batchMax = Math.min(this.policy.location_batch_max_points, 100);
    this.flushEveryMs = (this.policy.location_flush_interval_s ?? 30) * 1000;
    this.emit({ policyVersion: this.policy.version });
  }

  /** Callback do watch (na fila): amostragem no cliente; so pontos aceitos ganham seq e entram no buffer. */
  private async _onPoint(epoch: number, p: LocationPoint, providerId: TrackingProvider) {
    const tripId = this.tripId;
    if (epoch !== this.epoch || !tripId) return;
    this.emit({ lastFix: p });
    const v = sampleVerdict(this.status.last, p, this.policy);
    const s = { ...this.status.sampling };
    if (!v.keep) {
      if (v.why === "min_interval") s.dropped_min_interval++;
      else if (v.why === "no_movement") s.dropped_no_movement++;
      else if (v.why === "duplicate_fix") s.dropped_duplicate_fix++;
      else s.dropped_accuracy++;
      this.emit({ sampling: s });
      return;
    }
    const [seq] = await nextSeqRange(1);
    if (epoch !== this.epoch || this.tripId !== tripId) {
      // parou enquanto alocava o seq: persiste em vez de perder
      await enqueueLocationBatch(tripId, [{ ...p, seq }]).catch(() => undefined);
      return;
    }
    this.buffer.push({ ...p, seq });
    s.kept++;
    this.emit({ last: p, buffered: this.buffer.length, error: null, sampling: s });
    // Retomada sem sessao conhecida: reutiliza/abre a sessao do aparelho (idempotente
    // no servidor: uma sessao aberta por aparelho). Nunca no inicio atomico.
    if (!this.status.sessionId && !this.sessionOpening) this.openSession(tripId, providerId);
    if (this.buffer.length >= this.batchMax) void this.flush();
  }

  private openSession(tripId: string, providerId: TrackingProvider) {
    this.sessionOpening = (async () => {
      try {
        // versao real do pacote (resolvida no inicio atomico e reutilizada aqui)
        const appVersion = await resolveAppVersion();
        const s = await rpcStartTrackingSession(
          tripId,
          getDeviceId(),
          platformName(),
          providerId,
          appVersion,
        );
        if (this.tripId === tripId) this.emit({ sessionId: s?.session_id ?? null });
      } catch (e) {
        this.emit({ error: e instanceof Error ? e.message : String(e) });
        // sem sessao (aviso, vinculo, estado): coleta PARA; o buffer e persistido pelo stop
        void this.stop("session_refused");
      } finally {
        this.sessionOpening = null;
      }
    })();
  }

  /** Volta ao primeiro plano: outbox primeiro, depois retoma o watch se a viagem continuar elegivel. */
  private async _onForeground() {
    if (!isDocumentForeground()) return;
    try {
      const r = await flushOutbox();
      if (r.points.batches_sent > 0)
        this.emit({
          sentPoints: this.status.sentPoints + r.points.accepted + r.points.stored_flagged,
          lastSync: new Date().toISOString(),
        });
    } catch {
      /* rede: tenta no proximo retorno/online */
    }
    const g = this.resumeGate;
    if (!g || this.status.active) return;
    let fresh: Awaited<ReturnType<typeof fetchMyDriverTrip>>;
    try {
      fresh = await fetchMyDriverTrip();
    } catch {
      return; // sem servidor: nao retoma as cegas
    }
    if (!fresh.has_trip || fresh.trip.id !== g.tripId) {
      this.resumeGate = null;
      this.emit({ reason: "viagem_nao_ativa" });
      return;
    }
    await this._start(
      g.tripId,
      {
        assignmentState: fresh.assignment.state,
        noticeAcknowledged: fresh.privacy_notice.acknowledged,
        trackingRequired: fresh.tracking_required,
        tripStatus: fresh.trip.status,
      },
      fresh.policy,
    );
  }

  // ------------------------------------------------------------------ captura pontual
  /**
   * Captura PONTUAL (sem watch, sem sessao). O motivo define o gate:
   *  - "command": nunca abre dialogo - ultimo ponto fresco (< 60 s) ou leitura pelo
   *    watch ja ativo; sem rastreador ativo devolve null.
   *  - "trip_start": acao explicita "Iniciar deslocamento" - exige designacao aceita,
   *    aviso reconhecido, viagem em driver_accepted e app em primeiro plano.
   *  - "capacity_availability": acao explicita "Estou disponivel" - exige aviso
   *    reconhecido e app em primeiro plano.
   * Nao entra na fila (nao muta estado; pode esperar ate 20 s pelo GNSS).
   */
  async captureOnce(
    input: ExplicitCaptureInput | number = { reason: "command" },
    timeoutMs = 12_000,
  ): Promise<LocationPoint | null> {
    const req: ExplicitCaptureInput = typeof input === "number" ? { reason: "command" } : input;
    const t = typeof input === "number" ? input : timeoutMs;
    if (req.reason === "command") {
      const last = this.status.lastFix ?? this.status.last;
      if (last && Date.now() - new Date(last.captured_at).getTime() < 60_000) return last;
      if (!this.status.active || !this.provider) return null;
      if (this.provider instanceof WebGeolocationProvider) return this.provider.captureOnce(t);
      return null;
    }
    if (!isDocumentForeground()) return null;
    if (req.reason === "trip_start") {
      const g = req.gate;
      if (
        g.assignmentState !== "accepted" ||
        !g.noticeAcknowledged ||
        g.tripStatus !== "driver_accepted"
      )
        return null;
    } else if (!req.noticeAcknowledged) return null;
    // leitura explicita: unico ponto em que o dialogo pode aparecer fora do watch
    return WebGeolocationProvider.readOnce(t);
  }

  // ------------------------------------------------------------------ inicio atomico
  /**
   * "Iniciar deslocamento" (fail-closed, atomico no servidor):
   *   1) preflight no estado MAIS RECENTE do servidor (get_my_driver_trip)
   *   2) command_id pendente? reenvia a MESMA tentativa (mesmo fix), sem novo dialogo
   *   3) senao: captura explicita do primeiro fix (o dialogo aparece aqui), precisao <= policy
   *   4) persiste {command_id, seq, fix} ANTES da RPC (resultado desconhecido => retry igual)
   *   5) UMA chamada a start_trip_tracking; 40001/40P01 => uma retentativa automatica
   *   6) applied (ou duplicate de inicio ja aplicado) => watch com a sessao devolvida
   * Negada/sem fix/precisao => nenhuma RPC, nenhuma sessao, nada na outbox.
   * Rejeicao de negocio consome o command_id (proxima tentativa = novo command_id).
   * session_context_mismatch NUNCA abre outra sessao.
   */
  startTrip(i: { tripId: string; timeoutMs?: number }): Promise<TripStartResult> {
    if (this.startInFlight) return this.startInFlight; // duplo clique: mesma tentativa
    this.startInFlight = this._startTrip(i).finally(() => {
      this.startInFlight = null;
    });
    return this.startInFlight;
  }

  private async _startTrip(i: { tripId: string; timeoutMs?: number }): Promise<TripStartResult> {
    const fail = (
      reason: Extract<TripStartResult, { ok: false }>["reason"],
      message: string,
      retryable = false,
      code: string | null = null,
    ): TripStartResult => ({ ok: false, reason, message, retryable, code });
    this.bindVisibility();
    if (!isDocumentForeground())
      return fail("app_em_segundo_plano", "Mantenha o app aberto para iniciar o deslocamento.");

    // 1) estado mais recente do servidor
    let fresh: Awaited<ReturnType<typeof fetchMyDriverTrip>>;
    try {
      fresh = await fetchMyDriverTrip();
    } catch (e) {
      return fail(
        "sem_rede",
        "Sem conexão com o servidor. Verifique a internet e tente de novo.",
        true,
        (e as { code?: string }).code ?? null,
      );
    }
    if (!fresh.has_trip || fresh.trip.id !== i.tripId)
      return fail("estado_invalido", "Esta viagem não é mais a sua viagem ativa.");
    if (!fresh.privacy_notice.published)
      return fail(
        "aviso_nao_publicado",
        "O aviso de privacidade ainda não foi publicado. O rastreamento não pode começar.",
      );
    if (!fresh.privacy_notice.acknowledged)
      return fail("aviso_nao_reconhecido", "Reconheça o aviso de privacidade antes de iniciar.");
    if (fresh.assignment.state !== "accepted")
      return fail("designacao_nao_aceita", "A designação ainda não foi aceita.");
    const t = fresh.trip;
    const pending = await getMeta<PendingStart>(startKey(i.tripId)).catch(() => undefined);
    if (!pending) {
      if (t.status !== "driver_accepted")
        return fail(
          "estado_invalido",
          `A viagem está em "${t.status}" e não em "aceita pelo motorista".`,
        );
      if (t.paused_by_contract || t.paused_by_exception_id || t.has_open_critical_exception)
        return fail(
          "viagem_pausada",
          "A viagem está pausada ou bloqueada por uma ocorrência. Aguarde a liberação.",
        );
    }
    const policyRaw = fresh.policy;
    const policy = parseTrackingPolicy(policyRaw);
    const gate: TripStartGate = {
      assignmentState: "accepted",
      noticeAcknowledged: true,
      tripStatus: "driver_accepted",
    };

    // 2/3) tentativa pendente (mesmo command_id + mesmo fix) ou novo fix
    let attempt: PendingStart;
    if (pending && pending.trip_id === i.tripId) {
      attempt = pending;
    } else {
      const pos = await this.captureOnce({ reason: "trip_start", gate }, i.timeoutMs ?? 20_000);
      if (!pos)
        return fail(
          "sem_posicao",
          "Não foi possível obter sua localização. Verifique a permissão e tente novamente.",
        );
      if (!isDocumentForeground())
        return fail(
          "app_em_segundo_plano",
          "O app foi para segundo plano durante a leitura. Tente novamente.",
        );
      if (pos.accuracy_m > policy.accuracy_reject_m)
        return fail(
          "precisao_insuficiente",
          `Precisão do GPS insuficiente (±${Math.round(pos.accuracy_m)} m; limite ${policy.accuracy_reject_m} m). Tente ao ar livre.`,
        );
      const sel = selectLocationProvider();
      if (!sel.provider) return fail("sem_provedor", sel.reason);
      const [seq] = await nextSeqRange(1);
      attempt = {
        trip_id: i.tripId,
        command_id: crypto.randomUUID(),
        seq,
        point: { ...pos, seq },
        provider: sel.provider.id,
        platform: platformName(),
        created_at: Date.now(),
      };
      await setMeta(startKey(i.tripId), attempt); // 4) resultado desconhecido => retry identico
    }

    // versao/build reais do pacote: resolvidos ANTES da RPC (falha => "native:unknown", nao bloqueia)
    const appVersion = await resolveAppVersion();

    // 5) RPC unica (na fila: nenhum stop/start intercalado)
    return this.run(async () => {
      const p = attempt.point;
      const callOnce = () =>
        rpcStartTripTracking({
          tripId: attempt.trip_id,
          commandId: attempt.command_id,
          deviceId: getDeviceId(),
          platform: attempt.platform,
          provider: attempt.provider,
          appVersion,
          seq: attempt.seq,
          capturedAt: p.captured_at,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracy_m,
          speedMps: p.speed_mps ?? null,
          heading: p.heading ?? null,
          altitudeM: p.altitude_m ?? null,
        });
      let r: StartTripTrackingResult;
      try {
        try {
          r = await callOnce();
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === "40001" || code === "40P01") {
            await new Promise((res) => setTimeout(res, 300));
            r = await callOnce(); // mesmo command_id: idempotente
          } else throw e;
        }
      } catch (e) {
        const code = (e as { code?: string }).code ?? null;
        const msg = e instanceof Error ? e.message : String(e);
        if (isRetryableError(e))
          return fail(
            "sem_rede",
            "Falha de rede ao iniciar. Toque de novo para reenviar a mesma tentativa.",
            true,
            code,
          );
        await deleteMeta(startKey(i.tripId)).catch(() => undefined); // excecao dura: nada foi gravado; proxima = novo fix
        if (/session_context_mismatch/.test(msg))
          return fail(
            "session_context_mismatch",
            "Há uma sessão de rastreamento aberta com outro contexto (aparelho/provedor). Não é possível iniciar outra automaticamente; fale com a transportadora.",
            false,
            code,
          );
        if (/privacy_notice_unpublished/.test(msg))
          return fail(
            "aviso_nao_publicado",
            "O aviso de privacidade ainda não foi publicado.",
            false,
            code,
          );
        if (/privacy_notice_required/.test(msg))
          return fail(
            "aviso_nao_reconhecido",
            "Reconheça o aviso de privacidade vigente antes de iniciar.",
            false,
            code,
          );
        return fail("erro", `Início recusado: ${msg}`, false, code);
      }

      if (r.applied || (r.duplicate && TRACKING_STATUSES_SET.has(r.trip_status))) {
        await deleteMeta(startKey(i.tripId)).catch(() => undefined);
        this.preOpenedSession = { tripId: i.tripId, id: r.session_id };
        // o primeiro fix e a referencia de amostragem desta viagem (o watch repete o mesmo fix em cache)
        if (this.lastTrip !== i.tripId) {
          this.lastTrip = i.tripId;
          this.emit({ last: null, lastFix: null, sampling: emptySampling(), sentPoints: 0 });
        }
        this.emit({ last: p, sentPoints: this.status.sentPoints + (r.point_accepted ? 1 : 0) });
        await this._start(
          i.tripId,
          {
            assignmentState: "accepted",
            noticeAcknowledged: true,
            trackingRequired: fresh.tracking_required,
            tripStatus: r.trip_status as TripStatus,
          },
          r.policy ?? policyRaw,
        );
        return {
          ok: true,
          sessionId: r.session_id,
          duplicate: r.duplicate,
          sessionWasExisting: r.session_was_existing,
        };
      }
      // duplicate de um comando REJEITADO, ou rejeicao de negocio: command_id consumido
      await deleteMeta(startKey(i.tripId)).catch(() => undefined);
      if (r.duplicate)
        return fail(
          "rejeitado",
          "A tentativa anterior foi recusada pelo servidor. Toque de novo para uma nova tentativa.",
          false,
          "duplicate",
        );
      const code = r.rejection_code ?? "rejeitado";
      if (code === "assignment_not_accepted")
        return fail("assignment_not_accepted", "A designação não está aceita.", false, code);
      if (code.startsWith("invalid_state"))
        return fail(
          "invalid_state",
          `A viagem mudou de estado (${code.split(":")[1] ?? "?"}). Atualize a tela.`,
          false,
          code,
        );
      if (code === "accuracy_rejected")
        return fail(
          "accuracy_rejected",
          "Precisão do GPS recusada pelo servidor. Tente de novo ao ar livre.",
          false,
          code,
        );
      return fail("rejeitado", `Início recusado (${code}).`, false, code);
    });
  }

  // ------------------------------------------------------------------ flush / stop
  /** Envia o buffer (so em primeiro plano); qualquer falha persiste os pontos na outbox. Nunca descarta. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.run(() => this._flush()).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
  private async _flush() {
    if (!this.tripId || this.buffer.length === 0) return;
    if (!isDocumentForeground()) return; // nenhuma rede em segundo plano (o stop persiste)
    if (this.sessionOpening) await this.sessionOpening;
    const tripId = this.tripId;
    const deviceId = getDeviceId();
    if (!this.status.sessionId) return; // sem sessao aberta ainda: fica no buffer
    const pts = this.buffer.splice(0, this.batchMax);
    this.emit({ buffered: this.buffer.length });
    const online = typeof navigator === "undefined" || navigator.onLine;
    if (!online) {
      await enqueueLocationBatch(tripId, pts, deviceId);
      return;
    }
    try {
      const r = await rpcIngestLocations(
        tripId,
        deviceId,
        crypto.randomUUID(),
        pts as unknown as Record<string, unknown>[],
      );
      this.emit({
        sentPoints: this.status.sentPoints + (r?.accepted ?? 0) + (r?.stored_flagged ?? 0),
        lastSync: new Date().toISOString(),
      });
      if (r && !r.tracking_active) await this._stop("server_inactive");
    } catch (e) {
      // persiste SEMPRE; a outbox classifica (terminal vs transitorio)
      await enqueueLocationBatch(tripId, pts, deviceId).catch(() => {
        this.buffer.unshift(...pts);
      });
      const code = (e as { code?: string }).code;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "22023" && /tracking_inactive/.test(msg)) {
        this.emit({ error: "Rastreamento inativo no servidor." });
        await this._stop("server_inactive");
      } else if (!isRetryableError(e)) {
        this.emit({ error: msg });
        await this._stop("server_refused");
      }
    }
  }

  /**
   * Desliga de vez (logout / desmontagem do app): stop + remove o listener de
   * visibilidade e esquece a viagem a retomar. Idempotente.
   */
  dispose(reason = "dispose"): Promise<void> {
    if (this.visibilityBound && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.visibilityBound = false;
    }
    this.resumeGate = null;
    return this.stop(reason);
  }

  /** Idempotente; chamadores simultaneos compartilham a mesma Promise. */
  stop(reason: string): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.run(() => this._stop(reason)).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }
  private async _stop(reason: string) {
    // captura imutavel ANTES de qualquer await
    const tripId = this.tripId;
    const deviceId = getDeviceId();
    const pts = this.buffer;
    this.epoch++; // callbacks antigos passam a ser ignorados
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const prov = this.provider;
    this.provider = null;
    if (prov) {
      try {
        await prov.stop();
      } catch {
        /* ignore */
      }
    }
    this.emit({ active: false });
    if (tripId && pts.length) {
      // persiste ANTES de limpar a memoria; falha de persistencia mantem o buffer
      try {
        await enqueueLocationBatch(tripId, pts, deviceId);
        this.buffer = [];
      } catch (e) {
        this.emit({
          error: `Falha ao guardar ${pts.length} ponto(s): ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } else this.buffer = [];
    this.tripId = null;
    this.emit({
      sessionId: null,
      buffered: this.buffer.length,
      reason: reason === "restart" ? this.status.reason : reason,
    });
    if (reason === "logout" || reason === "not_required") this.resumeGate = null;
  }
}

export const tripTracker = new TripTracker();
