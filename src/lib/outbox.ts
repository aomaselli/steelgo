// Outbox offline-first do motorista (Modulo 3). Substitui offlineQueue.ts.
//
// Cada comando nasce com command_id (uuid do cliente), seq por aparelho e
// captured_at REAL do momento em que o motorista agiu; o servidor grava
// received_at separadamente. Reenvio e idempotente: a RPC devolve
// duplicate=true e o comando sai da fila; recusa por estado (applied=false com
// rejection_code) tambem sai da fila e fica visivel ao motorista - nunca
// re-tentada em loop. Midia sobe ANTES do comando, no caminho canonico; 409
// (Duplicate) com o mesmo sha256 e sucesso.
//
// LOTES DE LOCALIZACAO (durabilidade, migration 82):
//   * cada ponto tem identidade estavel trip_id + device_id + captured_at + seq;
//     seq vem de nextSeq() (monotona por aparelho, persistida em IndexedDB, sobrevive
//     a reload/restart). Retentativas reenviam os MESMOS valores: nada e recriado.
//   * antes de enviar: ordena por (captured_at, seq) e elimina duplicatas locais
//     (mesmo captured_at) dentro e entre lotes.
//   * so sai da fila o que o servidor classificou de forma TERMINAL: inserido
//     (accepted/stored_flagged), duplicate, downsampled ou rejeicao permanente por
//     ponto (rejected[] com seq: malformed/accuracy_rejected/too_old). Erro
//     transitorio (rede, 5xx, 40001/40P01, resposta ambigua) mantem tudo.
//   * excecao tracking_inactive (22023) e do LOTE, nao do ponto: o lote fica
//     bloqueado (blocked_reason) e so e descartado quando get_my_driver_trip mostra
//     que a viagem nao e mais a viagem ativa do motorista (estado terminal no
//     servidor) - nunca por decisao local.
//   * downsampled NAO e erro: e telemetria (nada e mostrado como alerta ao motorista).
import { openDB, type IDBPDatabase } from "idb";
import { getDeviceId } from "@/lib/device";
import {
  fetchMyDriverTrip,
  rpcIngestLocations,
  rpcOpenSos,
  rpcOpenTripException,
  rpcRecordCheckpoint,
  rpcSubmitPod,
  rpcSubmitReturnReceipt,
  rpcTransitionTrip,
  uploadTripMedia,
  type CaptureCtx,
  type PodInput,
  type TripMediaKind,
} from "@/lib/trips";
import type { TripStatus } from "@/lib/tripStatus";
import type { Database } from "@/integrations/supabase/types";

const DB_NAME = "steelgo-driver-outbox";
const CMD_STORE = "commands";
const LOC_STORE = "location-batches";
const META_STORE = "meta";

export type OutboxMedia = {
  key: string;
  kind: TripMediaKind;
  blob: Blob;
  sha256: string;
  path: string;
};

export type OutboxCommand = {
  id?: number;
  command_id: string;
  trip_id: string;
  seq: number;
  captured_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  device_id: string;
  kind: "transition" | "checkpoint" | "pod" | "sos" | "exception" | "return_receipt";
  payload: Record<string, unknown>;
  media: OutboxMedia[];
  attempts: number;
  last_error: string | null;
  /** resultado final quando o servidor recusou por estado (nao volta a fila) */
  outcome: null | {
    status: "applied" | "duplicate" | "rejected" | "failed";
    rejection_code?: string | null;
    at: string;
    detail?: string;
  };
  created_at: number;
};

/** Ponto durável: identidade estavel (trip_id + device_id + captured_at + seq). */
export type OutboxPoint = {
  seq: number;
  captured_at: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  speed_mps?: number | null;
  heading?: number | null;
  altitude_m?: number | null;
  is_moving?: boolean | null;
  battery_pct?: number | null;
};

export type LocationBatch = {
  id?: number;
  batch_id: string;
  trip_id: string;
  device_id: string;
  points: OutboxPoint[];
  attempts: number;
  created_at: number;
  last_error?: string | null;
  /** lote bloqueado por excecao do LOTE (ex.: tracking_inactive); aguarda estado terminal da viagem */
  blocked_reason?: string | null;
};

/** Telemetria local do envio de pontos (por flush). */
export type LocationFlushStats = {
  batches_sent: number;
  accepted: number;
  stored_flagged: number;
  duplicates: number;
  downsampled: number;
  rejected: number;
  retryable_failures: number;
  dropped_terminal_trip: number;
};

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(CMD_STORE))
          d.createObjectStore(CMD_STORE, { keyPath: "id", autoIncrement: true });
        if (!d.objectStoreNames.contains(LOC_STORE))
          d.createObjectStore(LOC_STORE, { keyPath: "id", autoIncrement: true });
        if (!d.objectStoreNames.contains(META_STORE)) d.createObjectStore(META_STORE);
      },
    });
  }
  return dbp;
}

/** Sequencia monotona por aparelho (compartilhada entre comandos e pontos). */
export async function nextSeq(): Promise<number> {
  const d = await db();
  const tx = d.transaction(META_STORE, "readwrite");
  const cur = ((await tx.store.get("seq")) as number | undefined) ?? 0;
  const next = cur + 1;
  await tx.store.put(next, "seq");
  await tx.done;
  return next;
}

export async function newCaptureCtx(pos: {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}): Promise<CaptureCtx> {
  return {
    commandId: crypto.randomUUID(),
    seq: await nextSeq(),
    capturedAt: new Date().toISOString(),
    lat: pos.lat,
    lng: pos.lng,
    accuracyM: pos.accuracy,
    deviceId: getDeviceId(),
  };
}

export async function enqueueCommand(
  cmd: Omit<OutboxCommand, "id" | "attempts" | "last_error" | "outcome" | "created_at">,
): Promise<number> {
  const d = await db();
  return (await d.add(CMD_STORE, {
    ...cmd,
    attempts: 0,
    last_error: null,
    outcome: null,
    created_at: Date.now(),
  })) as number;
}

export async function listCommands(): Promise<OutboxCommand[]> {
  const d = await db();
  return (await d.getAll(CMD_STORE)) as OutboxCommand[];
}

export async function pendingCommandCount(): Promise<number> {
  const all = await listCommands();
  return all.filter((c) => c.outcome === null).length;
}

export async function dismissCommand(id: number) {
  const d = await db();
  await d.delete(CMD_STORE, id);
}

/** Aloca N seqs em UMA transacao (ordem preservada, sem awaits intercalados). */
export async function nextSeqRange(n: number): Promise<number[]> {
  if (n <= 0) return [];
  const d = await db();
  const tx = d.transaction(META_STORE, "readwrite");
  const cur = ((await tx.store.get("seq")) as number | undefined) ?? 0;
  await tx.store.put(cur + n, "seq");
  await tx.done;
  return Array.from({ length: n }, (_, i) => cur + 1 + i);
}

/** Valor generico persistido (ex.: comando de inicio pendente). */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return (await d.get(META_STORE, key)) as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  const d = await db();
  await d.put(META_STORE, value, key);
}
export async function deleteMeta(key: string): Promise<void> {
  const d = await db();
  await d.delete(META_STORE, key);
}

/**
 * Persiste pontos ja capturados (com seq ja alocado). Chamado pelo rastreador ao
 * parar (HOME/background/unmount/troca de viagem) e quando o envio direto falha.
 * Nunca descarta: e o unico caminho de saida do buffer em memoria.
 */
export async function enqueueLocationBatch(
  tripId: string,
  points: OutboxPoint[],
  deviceId: string = getDeviceId(),
): Promise<void> {
  if (!tripId || points.length === 0) return;
  const d = await db();
  await d.add(LOC_STORE, {
    batch_id: crypto.randomUUID(),
    trip_id: tripId,
    device_id: deviceId,
    points: sortPoints(points),
    attempts: 0,
    created_at: Date.now(),
    last_error: null,
    blocked_reason: null,
  } satisfies LocationBatch);
}

export async function pendingLocationBatches(): Promise<number> {
  const d = await db();
  return d.count(LOC_STORE);
}

export async function listLocationBatches(): Promise<LocationBatch[]> {
  const d = await db();
  return ((await d.getAll(LOC_STORE)) as LocationBatch[]).sort(
    (a, b) => a.created_at - b.created_at,
  );
}

/** Ultimo ponto persistido de uma viagem (referencia de amostragem apos reload). */
export async function lastQueuedPoint(tripId: string): Promise<OutboxPoint | null> {
  const all = (await listLocationBatches()).filter((b) => b.trip_id === tripId);
  let best: OutboxPoint | null = null;
  for (const b of all)
    for (const p of b.points) if (!best || p.captured_at > best.captured_at) best = p;
  return best;
}

export function sortPoints<T extends { seq: number; captured_at: string }>(pts: T[]): T[] {
  return [...pts].sort((a, b) =>
    a.captured_at < b.captured_at ? -1 : a.captured_at > b.captured_at ? 1 : a.seq - b.seq,
  );
}

/** Erros que NAO sao terminais: rede, servidor indisponivel, serializacao/deadlock, resposta ambigua. */
export function isRetryableError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code === "40001" || code === "40P01" || code === "57014" || code === "57P01") return true;
  if (code && /^(08|53|57|XX)/.test(code)) return true; // conexao, recursos, operador, interno
  if (
    code === "42501" ||
    code === "22023" ||
    code === "22004" ||
    code === "23505" ||
    code === "P0002"
  )
    return false;
  return true; // sem SQLSTATE (fetch falhou, timeout, 5xx do gateway): transitorio
}

const rejectedSeqs = (r: unknown): Map<number, string> => {
  const m = new Map<number, string>();
  if (Array.isArray(r))
    for (const x of r as Array<{ seq?: unknown; code?: unknown }>)
      if (typeof x?.seq === "number" && typeof x?.code === "string") m.set(x.seq, x.code);
  return m;
};

function ctxOf(c: OutboxCommand): CaptureCtx {
  return {
    commandId: c.command_id,
    seq: c.seq,
    capturedAt: c.captured_at,
    lat: c.lat,
    lng: c.lng,
    accuracyM: c.accuracy_m,
    deviceId: c.device_id,
  };
}

async function uploadAllMedia(c: OutboxCommand) {
  const out: Record<string, { path: string; sha256: string }> = {};
  for (const m of c.media) {
    const r = await uploadTripMedia({
      tripId: c.trip_id,
      commandId: c.command_id,
      kind: m.kind,
      blob: m.blob,
      path: m.path,
      sha256: m.sha256,
    });
    out[m.key] = { path: r.path, sha256: r.sha256 };
  }
  return out;
}

let flushing = false;
export type FlushReport = {
  sent: number;
  duplicates: number;
  rejected: number;
  failed: number;
  /** lotes de localizacao enviados (compat.) */
  locations: number;
  /** telemetria dos pontos deste flush */
  points: LocationFlushStats;
};

/** Envia comandos pendentes em ordem de seq; depois os lotes de localizacao. */
export async function flushOutbox(): Promise<FlushReport> {
  const rep: FlushReport = {
    sent: 0,
    duplicates: 0,
    rejected: 0,
    failed: 0,
    locations: 0,
    points: {
      batches_sent: 0,
      accepted: 0,
      stored_flagged: 0,
      duplicates: 0,
      downsampled: 0,
      rejected: 0,
      retryable_failures: 0,
      dropped_terminal_trip: 0,
    },
  };
  // nunca em segundo plano (nenhuma chamada de rede com o app escondido) nem offline
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return rep;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return rep;
  flushing = true;
  try {
    const d = await db();
    const cmds = ((await d.getAll(CMD_STORE)) as OutboxCommand[])
      .filter((c) => c.outcome === null)
      .sort((a, b) => a.seq - b.seq);
    for (const c of cmds) {
      try {
        const media = await uploadAllMedia(c);
        const ctx = ctxOf(c);
        let res: { applied: boolean; duplicate: boolean; rejection_code: string | null };
        if (c.kind === "transition") {
          const p = c.payload as {
            to: TripStatus;
            note?: string | null;
            override_reason?: string | null;
          };
          res = await rpcTransitionTrip(
            c.trip_id,
            p.to,
            ctx,
            p.note ?? null,
            p.override_reason ?? null,
          );
        } else if (c.kind === "checkpoint") {
          const p = c.payload as {
            kind: Database["public"]["Enums"]["trip_checkpoint_kind"];
            seal_code?: string | null;
            note?: string | null;
            override_reason?: string | null;
          };
          const photo = media["photo"];
          res = await rpcRecordCheckpoint(c.trip_id, p.kind, ctx, {
            sealCode: p.seal_code ?? null,
            photoPath: photo?.path ?? null,
            photoSha256: photo?.sha256 ?? null,
            note: p.note ?? null,
            overrideReason: p.override_reason ?? null,
          });
        } else if (c.kind === "pod") {
          const p = c.payload as Omit<PodInput, "signaturePath" | "signatureSha256" | "photos"> & {
            photo_keys: string[];
          };
          const sig = media["signature"];
          const photos = p.photo_keys.map((k) => media[k]).filter(Boolean);
          res = await rpcSubmitPod(c.trip_id, ctx, {
            ...p,
            signaturePath: sig?.path ?? null,
            signatureSha256: sig?.sha256 ?? null,
            photos,
          });
        } else if (c.kind === "return_receipt") {
          const p = c.payload as {
            receiver_name: string;
            note?: string | null;
            override_reason?: string | null;
          };
          const photo = media["photo"];
          if (!photo)
            throw Object.assign(new Error("recibo de retorno sem foto"), { code: "22023" });
          res = await rpcSubmitReturnReceipt(c.trip_id, ctx, {
            photoPath: photo.path,
            photoSha256: photo.sha256,
            receiverName: p.receiver_name,
            note: p.note ?? null,
            overrideReason: p.override_reason ?? null,
          });
        } else if (c.kind === "sos") {
          const p = c.payload as { note?: string | null };
          res = await rpcOpenSos(c.trip_id, ctx, p.note ?? null);
        } else {
          const p = c.payload as {
            kind: Database["public"]["Enums"]["trip_exception_kind"];
            severity: Database["public"]["Enums"]["trip_exception_severity"] | null;
            description: string;
            evidence_keys: string[];
          };
          const evidence = p.evidence_keys.map((k) => media[k]).filter(Boolean);
          res = await rpcOpenTripException(
            c.trip_id,
            p.kind,
            p.severity,
            p.description,
            ctx,
            evidence,
          );
        }
        const outcome: OutboxCommand["outcome"] = res.applied
          ? { status: "applied", at: new Date().toISOString() }
          : res.duplicate
            ? { status: "duplicate", at: new Date().toISOString() }
            : {
                status: "rejected",
                rejection_code: res.rejection_code,
                at: new Date().toISOString(),
              };
        if (outcome.status === "applied") rep.sent++;
        else if (outcome.status === "duplicate") rep.duplicates++;
        else rep.rejected++;
        // aplicado/duplicado: sai da fila. Recusado por estado: fica registrado (sem retentativa) ate o motorista dispensar.
        if (outcome.status === "rejected")
          await d.put(CMD_STORE, { ...c, media: [], outcome, attempts: c.attempts + 1 });
        else await d.delete(CMD_STORE, c.id!);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const code = (e as { code?: string }).code;
        // 42501/22023/23505 sao recusas definitivas do servidor: nao ficam em loop
        const definitive =
          code === "42501" || code === "22023" || code === "23505" || code === "P0002";
        rep.failed++;
        await d.put(CMD_STORE, {
          ...c,
          attempts: c.attempts + 1,
          last_error: msg,
          outcome: definitive
            ? { status: "failed", at: new Date().toISOString(), detail: msg }
            : null,
        });
        if (!definitive) break; // rede/servidor indisponivel: preserva a ordem, tenta depois
      }
    }
    rep.points = await flushLocationBatches(d);
    rep.locations = rep.points.batches_sent;
  } finally {
    flushing = false;
  }
  return rep;
}

/**
 * Envia os lotes de localizacao (ordem de criacao; pontos ordenados; duplicatas
 * locais eliminadas entre lotes). Remove SOMENTE o que o servidor classificou de
 * forma terminal. Devolve telemetria por classe.
 */
async function flushLocationBatches(d: IDBPDatabase): Promise<LocationFlushStats> {
  const st: LocationFlushStats = {
    batches_sent: 0,
    accepted: 0,
    stored_flagged: 0,
    duplicates: 0,
    downsampled: 0,
    rejected: 0,
    retryable_failures: 0,
    dropped_terminal_trip: 0,
  };
  const batches = ((await d.getAll(LOC_STORE)) as LocationBatch[]).sort(
    (a, b) => a.created_at - b.created_at,
  );
  const seen = new Set<string>(); // trip|device|captured_at ja enviado neste flush
  let activeTrip: { fetched: boolean; tripId: string | null } = { fetched: false, tripId: null };
  const resolveActiveTrip = async () => {
    if (!activeTrip.fetched) {
      try {
        const t = await fetchMyDriverTrip();
        activeTrip = { fetched: true, tripId: t.has_trip ? t.trip.id : null };
      } catch {
        activeTrip = { fetched: false, tripId: null }; // sem resposta: nao decide
      }
    }
    return activeTrip;
  };
  for (const b of batches) {
    // dedup local: mesmo captured_at do mesmo aparelho/viagem so vai uma vez
    const pts = sortPoints(b.points).filter((p) => {
      const k = b.trip_id + "|" + b.device_id + "|" + p.captured_at;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (pts.length === 0) {
      await d.delete(LOC_STORE, b.id!); // so continha duplicatas locais de outro lote
      continue;
    }
    if (b.blocked_reason === "tracking_inactive") {
      // lote de viagem sem rastreamento ativo: so descarta se o servidor diz que a viagem nao e mais a ativa
      const a = await resolveActiveTrip();
      if (a.fetched && a.tripId !== b.trip_id) {
        await d.delete(LOC_STORE, b.id!);
        st.dropped_terminal_trip += pts.length;
      }
      continue; // senao, continua bloqueado (sera retentado quando a viagem voltar a rastrear)
    }
    try {
      const r = await rpcIngestLocations(
        b.trip_id,
        b.device_id,
        b.batch_id,
        pts as unknown as Record<string, unknown>[],
      );
      if (!r)
        throw Object.assign(new Error("ingest_trip_locations: resposta vazia"), { code: "XX000" });
      const rej = rejectedSeqs(r.rejected);
      st.batches_sent++;
      st.accepted += r.accepted ?? 0;
      st.stored_flagged += r.stored_flagged ?? 0;
      st.duplicates += r.duplicates ?? 0;
      st.downsampled += r.downsampled ?? 0;
      st.rejected += rej.size;
      // tudo classificado (inserido/duplicate/downsampled/rejeitado por ponto): lote sai
      await d.delete(LOC_STORE, b.id!);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "22023" && /tracking_inactive/.test(msg)) {
        await d.put(LOC_STORE, {
          ...b,
          attempts: b.attempts + 1,
          last_error: msg,
          blocked_reason: "tracking_inactive",
        });
        continue;
      }
      if (!isRetryableError(e)) {
        // recusa definitiva do LOTE sem classificacao por ponto (ex.: chamador nao vinculado): fica bloqueado, visivel, sem loop
        await d.put(LOC_STORE, {
          ...b,
          attempts: b.attempts + 1,
          last_error: msg,
          blocked_reason: code ?? "definitive",
        });
        continue;
      }
      st.retryable_failures += pts.length;
      await d.put(LOC_STORE, { ...b, attempts: b.attempts + 1, last_error: msg });
      break; // rede/servidor: preserva a ordem, tenta depois
    }
  }
  return st;
}

/** Limpa TUDO (logout / troca de motorista). A sequencia por aparelho NAO e zerada. */
export async function clearOutbox() {
  const d = await db();
  await Promise.all([d.clear(CMD_STORE), d.clear(LOC_STORE)]);
  const keys = (await d.getAllKeys(META_STORE)) as string[];
  for (const k of keys) if (String(k).startsWith("start_cmd:")) await d.delete(META_STORE, k);
}
