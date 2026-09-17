// Outbox offline-first do motorista (Modulo 3). Substitui offlineQueue.ts.
//
// Cada comando nasce com command_id (uuid do cliente), seq por aparelho e
// captured_at REAL do momento em que o motorista agiu; o servidor grava
// received_at separadamente. Reenvio e idempotente: a RPC devolve
// duplicate=true e o comando sai da fila; recusa por estado (applied=false com
// rejection_code) tambem sai da fila e fica visivel ao motorista - nunca
// re-tentada em loop. Midia sobe ANTES do comando, no caminho canonico; 409
// (Duplicate) com o mesmo sha256 e sucesso.
import { openDB, type IDBPDatabase } from "idb";
import { getDeviceId } from "@/lib/device";
import {
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

export type LocationBatch = {
  id?: number;
  batch_id: string;
  trip_id: string;
  device_id: string;
  points: Record<string, unknown>[];
  attempts: number;
  created_at: number;
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

export async function enqueueLocationBatch(tripId: string, points: Record<string, unknown>[]) {
  const d = await db();
  await d.add(LOC_STORE, {
    batch_id: crypto.randomUUID(),
    trip_id: tripId,
    device_id: getDeviceId(),
    points,
    attempts: 0,
    created_at: Date.now(),
  } satisfies LocationBatch);
}

export async function pendingLocationBatches(): Promise<number> {
  const d = await db();
  return d.count(LOC_STORE);
}

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
  locations: number;
};

/** Envia comandos pendentes em ordem de seq; depois os lotes de localizacao. */
export async function flushOutbox(): Promise<FlushReport> {
  const rep: FlushReport = { sent: 0, duplicates: 0, rejected: 0, failed: 0, locations: 0 };
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return rep;
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
    const batches = ((await d.getAll(LOC_STORE)) as LocationBatch[]).sort(
      (a, b) => a.created_at - b.created_at,
    );
    for (const b of batches) {
      try {
        await rpcIngestLocations(b.trip_id, b.device_id, b.batch_id, b.points);
        await d.delete(LOC_STORE, b.id!);
        rep.locations++;
      } catch (e) {
        const code = (e as { code?: string }).code;
        // tracking_inactive / sem vinculo: o lote nunca sera aceito - descarta
        if (code === "22023" || code === "42501" || code === "P0002")
          await d.delete(LOC_STORE, b.id!);
        else {
          await d.put(LOC_STORE, { ...b, attempts: b.attempts + 1 });
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
  return rep;
}

/** Limpa TUDO (logout / troca de motorista). */
export async function clearOutbox() {
  const d = await db();
  await Promise.all([d.clear(CMD_STORE), d.clear(LOC_STORE)]);
}
