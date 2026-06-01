import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "./imageUtils";

const DB_NAME = "steelgo-driver";
const STORE = "pending-checkpoints";

export type PendingCheckpoint = {
  id?: number;
  contract_id: string;
  driver_id: string;
  type: string;
  lat: number | null;
  lng: number | null;
  qr_seal_code: string | null;
  qr_verified: boolean;
  photo_blob: Blob | null;
  photo_name: string;
  createdAt: number;
};

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      },
    });
  }
  return dbp;
}

export async function queueCheckpoint(cp: PendingCheckpoint) {
  const d = await db();
  return d.add(STORE, cp);
}

export async function pendingCount() {
  const d = await db();
  return d.count(STORE);
}

export async function flushQueue(): Promise<number> {
  const d = await db();
  const all = (await d.getAll(STORE)) as PendingCheckpoint[];
  let sent = 0;
  for (const cp of all) {
    try {
      let photo_url: string | null = null;
      if (cp.photo_blob) {
        const path = `${cp.driver_id}/${cp.photo_name}`;
        const { error: upErr } = await supabase.storage
          .from("cargo-photos")
          .upload(path, cp.photo_blob, { contentType: "image/jpeg", upsert: true });
        if (!upErr) {
          const { data } = await supabase.storage.from("cargo-photos").createSignedUrl(path, 60 * 60 * 24 * 30);
          photo_url = data?.signedUrl ?? null;
        }
      }
      const { error } = await supabase.from("checkpoints").insert({
        contract_id: cp.contract_id,
        driver_id: cp.driver_id,
        type: cp.type as never,
        lat: cp.lat,
        lng: cp.lng,
        qr_seal_code: cp.qr_seal_code,
        qr_verified: cp.qr_verified,
        photo_url,
        recorded_at: new Date(cp.createdAt).toISOString(),
      });
      if (!error && cp.id !== undefined) {
        await d.delete(STORE, cp.id);
        sent++;
      }
    } catch (e) {
      console.warn("flush error", e);
    }
  }
  return sent;
}

export { compressImage };
