// Camada de dados do Modulo 3 (Control Tower operacional). TODA leitura passa
// por RPC sanitizada (list_my_trips / get_trip / list_trip_positions ...) e
// TODA escrita passa por RPC. Nenhum SELECT nas tabelas operacionais (elas nao
// tem grant para authenticated). Midia fica no bucket PRIVADO trip-media e so
// e lida apos request_trip_media_access (acesso auditado).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { sha256HexOfBuffer, utcStamp } from "@/lib/sha256";
import type { CargoDisposition, PodOutcome, TripStatus } from "@/lib/tripStatus";

type Fn = Database["public"]["Functions"];
type Json = Database["public"]["Tables"]["trip_events"]["Row"]["payload"];
// Parametros SQL sem DEFAULT saem do gerador como obrigatorios e nao-nulos; o
// PostgREST, porem, exige a chave presente (undefined a omitiria -> 404) e
// aceita null. Este wrapper deixa passar null de forma tipada e mantem o
// retorno tipado por nome da funcao.
type NullableArgs<N extends keyof Fn> =
  Fn[N]["Args"] extends Record<string, never>
    ? Record<string, never>
    : { [K in keyof Fn[N]["Args"]]: Fn[N]["Args"][K] | null };
function call<N extends keyof Fn>(
  name: N,
  args?: NullableArgs<N>,
): Promise<{ data: Fn[N]["Returns"] | null; error: { message: string; code?: string } | null }> {
  return supabase.rpc(name, (args ?? {}) as never) as unknown as Promise<{
    data: Fn[N]["Returns"] | null;
    error: { message: string; code?: string } | null;
  }>;
}
export type TripListRow = Fn["list_my_trips"]["Returns"][number];
export type OperationalAlertRow = Fn["list_operational_alerts"]["Returns"][number];
export type SosQueueRow = Fn["list_sos_queue"]["Returns"][number];
export type TripPositionRow = Fn["list_trip_positions"]["Returns"][number];
export type AdminPositionRow = Fn["list_trip_positions_admin"]["Returns"][number];
export type CompanyMemberRow = Fn["list_company_members"]["Returns"][number];
export type SchedulerHealthRow = Fn["scheduler_health"]["Returns"][number];

export type TripMediaKind = "photo" | "signature" | "document" | "evidence" | "receiver_id";

export type CommandResult = {
  applied: boolean;
  duplicate: boolean;
  rejection_code: string | null;
  trip_status: TripStatus;
};

export type TripDetail = {
  id: string;
  trip_number: string;
  attempt_number: number;
  status: TripStatus;
  previous_status: TripStatus | null;
  my_role: string;
  sos_mode: "operational" | "homologation";
  contract: {
    id: string;
    contract_number: string | null;
    status: string;
    escrow_status: string | null;
    delivery_completed_at: string | null;
  };
  freight: {
    id: string;
    origin: string;
    destination: string;
    origin_lat: number | null;
    origin_lng: number | null;
    dest_lat: number | null;
    dest_lng: number | null;
    steel_type: string | null;
    weight_tons: number | null;
    status: string;
  };
  shipper: { name: string } | null;
  carrier: { name: string } | null;
  driver: {
    assigned: boolean;
    assignment_state?: string;
    driver_label?: string;
    driver_name?: string | null;
    driver_verification?: string | null;
    truck_plate?: string | null;
    truck?: {
      type: string | null;
      brand: string | null;
      model: string | null;
      year: number | null;
      body_type: string | null;
      is_ev: boolean | null;
    } | null;
    carrier_operational_contact?: {
      email: string | null;
      phone: string | null;
      name: string | null;
    } | null;
    accepted_at?: string | null;
    assigned_at?: string | null;
  };
  planned_pickup_at: string | null;
  planned_delivery_at: string | null;
  planned_distance_km: number | null;
  eta: {
    at: string | null;
    source: string | null;
    updated_at: string | null;
    basis: Record<string, unknown> | null;
    label: string;
  };
  tracking_state: string;
  last_location_at: string | null;
  last_location: { lat: number; lng: number } | null;
  paused_by_contract: boolean;
  paused_by_exception_id: string | null;
  has_open_critical_exception: boolean;
  delivery_exception: boolean;
  loaded_at: string | null;
  departed_pickup_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  terminal_reason: string | null;
  cargo_disposition: CargoDisposition | null;
  cargo_disposition_at: string | null;
  policy_version: number;
  policy: Record<string, unknown> | null;
  retention: {
    retention_until: string | null;
    summary_retention_until: string | null;
    legal_hold_reason: string | null;
    legal_hold_until: string | null;
    raw_locations_purged_at: string | null;
  } | null;
  geofences: {
    kind: string;
    lat: number | null;
    lng: number | null;
    radius_m: number | null;
    source: string;
  }[];
  assignments: {
    id: string;
    state: string;
    driver_label: string;
    truck_plate: string | null;
    assigned_at: string;
    accepted_at: string | null;
    declined_at: string | null;
    decline_reason: string | null;
    revoked_at: string | null;
    revoke_reason: string | null;
    assigned_by_kind: string;
    is_mine: boolean;
  }[];
  checkpoints: {
    id: string;
    kind: string;
    seq: number;
    captured_at: string;
    received_at: string;
    lat: number | null;
    lng: number | null;
    accuracy_m: number | null;
    inside_geofence: boolean | null;
    distance_to_target_m: number | null;
    geofence_override_reason: string | null;
    photo_path: string | null;
    photo_sha256: string | null;
    seal_code: string | null;
    seal_verified: boolean | null;
    note: string | null;
    actor_kind: string;
  }[];
  documents: {
    id: string;
    kind: string;
    number: string | null;
    path: string;
    sha256: string;
    size_bytes: number | null;
    mime: string | null;
    issued_at: string | null;
    uploaded_by_kind: string;
    visibility: string;
    superseded: boolean;
    created_at: string;
  }[];
  exceptions: {
    id: string;
    kind: string;
    severity: string;
    status: string;
    opened_by_kind: string;
    captured_at: string;
    description: string;
    acknowledged_at: string | null;
    acknowledged_by_kind: string | null;
    ack_target_at: string | null;
    escalation_level: number;
    resolved_at: string | null;
    resolution_kind: string | null;
    resolution_note: string | null;
    dispute_case_id: string | null;
    blocks_delivery: boolean;
    pauses_trip: boolean;
    lat: number | null;
    lng: number | null;
    evidence: { path: string; sha256: string; mime: string | null }[];
  }[];
  alerts: {
    id: string;
    kind: string;
    severity: string;
    status: string;
    detected_at: string;
    details: Record<string, unknown> | null;
    acknowledged_at: string | null;
    closed_at: string | null;
  }[];
  pod: {
    id: string;
    version: number;
    outcome: PodOutcome;
    receiver_name: string;
    receiver_document_kind: string | null;
    receiver_document_last4: string | null;
    signature_path: string | null;
    signature_sha256: string | null;
    photos: { path: string; sha256: string }[];
    quantity_declared: number | null;
    quantity_received: number | null;
    notes: string | null;
    delivered_at: string;
    inside_geofence: boolean | null;
    geofence_override_reason: string | null;
    submitted_by_kind: string;
    derived_from_attempt: boolean;
    supersedes_id: string | null;
    supersede_reason: string | null;
  } | null;
  pod_versions: number;
  pod_attempts: {
    id: string;
    attempt_seq: number;
    outcome: PodOutcome;
    receiver_name: string | null;
    photos: { path: string; sha256: string }[];
    notes: string | null;
    captured_at: string;
    inside_geofence: boolean | null;
    exception_id: string | null;
    quantity_declared: number | null;
    quantity_received: number | null;
  }[];
  cargo_dispositions: {
    disposition: CargoDisposition;
    reason: string;
    note: string;
    occurred_at: string;
    location_text: string | null;
    custodian_label: string | null;
    is_emergency: boolean;
    evidence: { path: string; sha256: string }[];
  }[];
  events: {
    seq: number;
    type: string;
    from: TripStatus | null;
    to: TripStatus | null;
    actor_kind: string;
    captured_at: string | null;
    received_at: string;
    note: string | null;
    internal_note: string | null;
    payload: Record<string, unknown> | null;
    lat: number | null;
    lng: number | null;
  }[];
  facts: {
    gps_distance_km: number | null;
    aggregated_distance_km: number | null;
    planned_distance_km: number | null;
    distance_source: string;
    duration_min: number | null;
    moving_min: number | null;
    stops_count: number | null;
    sample_quality: string;
  } | null;
  access_log_count: number;
};

export type DriverTripPayload =
  | {
      has_trip: false;
      driver_record: boolean;
      privacy_notice: {
        published: boolean;
        version: string | null;
        sha256: string | null;
        acknowledged: boolean;
      };
      sos_mode: "operational" | "homologation";
    }
  | {
      has_trip: true;
      trip: TripDetail;
      assignment: { id: string; state: "offered" | "accepted"; assigned_at: string };
      policy: Record<string, unknown>;
      privacy_notice: {
        published: boolean;
        version: string | null;
        sha256: string | null;
        acknowledged: boolean;
      };
      tracking_required: boolean;
      sos_mode: "operational" | "homologation";
    };

export type PrivacyNotice =
  | { published: false }
  | {
      published: true;
      version: string;
      sha256: string;
      effective_from: string;
      url: string | null;
      body_md: string;
      legal_basis: string | null;
      acknowledged: boolean;
      acknowledged_at: string | null;
    };

function firstRow<T>(data: T | T[] | null): T | null {
  if (data == null) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function raise(error: { message: string; code?: string } | null): never {
  const e = new Error(error?.message ?? "Falha na chamada") as Error & { code?: string };
  e.code = error?.code;
  throw e;
}

// ----------------------------------------------------------------------------- leituras
// Escopos da RPC: "mine" (viagens visiveis ao chamador: transportadora,
// embarcador, membro ou motorista) e, somente para admin, "all" | "active" | "attention".
export type TripScope = "mine" | "all" | "active" | "attention";
export async function fetchMyTrips(scope: TripScope, statuses?: TripStatus[], limit = 100) {
  const { data, error } = await call("list_my_trips", {
    p_scope: scope,
    p_status: statuses ?? null,
    p_limit: limit,
  });
  if (error) raise(error);
  return (data ?? []) as TripListRow[];
}

export async function fetchTrip(tripId: string): Promise<TripDetail> {
  const { data, error } = await call("get_trip", { p_trip_id: tripId });
  if (error) raise(error);
  return data as unknown as TripDetail;
}

export async function fetchMyDriverTrip(): Promise<DriverTripPayload> {
  const { data, error } = await call("get_my_driver_trip");
  if (error) raise(error);
  return data as unknown as DriverTripPayload;
}

export async function fetchTripPositions(tripId: string, since?: string | null) {
  const { data, error } = await call("list_trip_positions", {
    p_trip_id: tripId,
    p_since: since ?? null,
  });
  if (error) raise(error);
  return (data ?? []) as TripPositionRow[];
}

export async function fetchAdminPositions() {
  const { data, error } = await call("list_trip_positions_admin");
  if (error) raise(error);
  return (data ?? []) as AdminPositionRow[];
}

export async function fetchOperationalAlerts(
  status: "open" | "acknowledged" | "closed" | "all" = "open",
  limit = 200,
) {
  const { data, error } = await call("list_operational_alerts", {
    p_status: status,
    p_limit: limit,
  });
  if (error) raise(error);
  return (data ?? []) as OperationalAlertRow[];
}

export async function fetchSosQueue() {
  const { data, error } = await call("list_sos_queue");
  if (error) raise(error);
  return (data ?? []) as SosQueueRow[];
}

export async function fetchCurrentPrivacyNotice(): Promise<PrivacyNotice> {
  const { data, error } = await call("get_current_privacy_notice");
  if (error) raise(error);
  return data as unknown as PrivacyNotice;
}

export async function acknowledgePrivacyNotice(version: string, sha256: string) {
  const { data, error } = await call("acknowledge_privacy_notice", {
    p_version: version,
    p_sha256: sha256,
  });
  if (error) raise(error);
  return firstRow(data);
}

export async function exportMyTripData() {
  const { data, error } = await call("export_my_trip_data");
  if (error) raise(error);
  return data;
}

export async function fetchSchedulerHealth() {
  const { data, error } = await call("scheduler_health");
  if (error) raise(error);
  return (data ?? []) as SchedulerHealthRow[];
}

export async function fetchPushActivationGates() {
  const { data, error } = await call("get_push_activation_gates");
  if (error) raise(error);
  return data as Record<string, unknown>;
}

export async function fetchLegacyRecords(
  kind: "checkpoints" | "driver_positions" | "security_alerts" | "security_alerts_tracking",
  limit = 100,
) {
  const { data, error } = await call("list_legacy_operational_records", {
    p_kind: kind,
    p_limit: limit,
  });
  if (error) raise(error);
  return (data ?? []) as Record<string, unknown>[];
}

// ----------------------------------------------------------------------------- midia (bucket privado trip-media)
export function buildTripMediaPath(
  tripId: string,
  commandId: string,
  kind: TripMediaKind,
  sha256: string,
  ext: "jpg" | "png" | "pdf",
) {
  return `${tripId}/${commandId}/${kind}-${utcStamp()}-${crypto.randomUUID()}-${sha256.slice(0, 16)}.${ext}`;
}

/**
 * Envia um arquivo ao bucket trip-media no caminho canonico. Reenvio do MESMO
 * caminho devolve 409 (Duplicate): tratado como sucesso somente quando o objeto
 * existente tem o mesmo sha256 declarado (compatibilidade) - o Storage nunca
 * sobrescreve (nao ha policy de UPDATE/DELETE).
 */
export async function uploadTripMedia(args: {
  tripId: string;
  commandId: string;
  kind: TripMediaKind;
  blob: Blob;
  path?: string;
  sha256?: string;
}) {
  const buf = await args.blob.arrayBuffer();
  const sha256 = args.sha256 ?? (await sha256HexOfBuffer(buf));
  const mime = args.blob.type || "image/jpeg";
  const ext = mime === "image/png" ? "png" : mime === "application/pdf" ? "pdf" : "jpg";
  const path = args.path ?? buildTripMediaPath(args.tripId, args.commandId, args.kind, sha256, ext);
  const { error } = await supabase.storage.from("trip-media").upload(path, args.blob, {
    contentType:
      mime === "image/jpeg" || mime === "image/png" || mime === "application/pdf"
        ? mime
        : "image/jpeg",
    upsert: false,
    metadata: { sha256 },
  });
  if (error) {
    const msg = (error as { message?: string; statusCode?: string }).message ?? "";
    const code = (error as { statusCode?: string | number }).statusCode;
    const duplicate = String(code) === "409" || /already exists|Duplicate/i.test(msg);
    if (!duplicate) throw new Error(`Falha no envio da mídia: ${msg}`);
    // 409: compativel se o caminho ja carrega os 16 primeiros hex do MESMO sha256
    if (!path.includes(`-${sha256.slice(0, 16)}.`))
      throw new Error("Objeto existente incompatível no mesmo caminho.");
  }
  return { path, sha256, size: args.blob.size, mime };
}

/** Acesso auditado a um objeto de midia: registra em trip_access_log e devolve URL assinada curta. */
export async function openTripMedia(path: string): Promise<string> {
  const { data, error } = await call("request_trip_media_access", { p_object_path: path });
  if (error) raise(error);
  const row = firstRow(data);
  if (!row?.granted) throw new Error("Acesso à mídia não concedido.");
  const { data: signed, error: sErr } = await supabase.storage
    .from("trip-media")
    .createSignedUrl(path, Math.min(row.expires_in_seconds ?? 120, 120));
  if (sErr || !signed?.signedUrl)
    throw new Error(sErr?.message ?? "Não foi possível gerar o link.");
  return signed.signedUrl;
}

// ----------------------------------------------------------------------------- comandos do motorista (offline-first: command_id do cliente)
export type CaptureCtx = {
  commandId: string;
  seq: number;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  deviceId: string;
};

export async function rpcRespondAssignment(
  assignmentId: string,
  accept: boolean,
  reason: string | null,
  commandId: string,
  capturedAt: string,
) {
  const { data, error } = await call("respond_trip_assignment", {
    p_assignment_id: assignmentId,
    p_accept: accept,
    p_reason: reason ?? null,
    p_command_id: commandId,
    p_captured_at: capturedAt,
  });
  if (error) raise(error);
  return firstRow(data) as CommandResult;
}

export async function rpcStartTrackingSession(
  tripId: string,
  deviceId: string,
  platform: string,
  provider: Database["public"]["Enums"]["tracking_provider"],
  appVersion: string,
) {
  const { data, error } = await call("start_tracking_session", {
    p_trip_id: tripId,
    p_device_id: deviceId,
    p_platform: platform,
    p_provider: provider,
    p_app_version: appVersion,
  });
  if (error) raise(error);
  return firstRow(data);
}

export async function rpcTransitionTrip(
  tripId: string,
  to: TripStatus,
  c: CaptureCtx,
  note?: string | null,
  overrideReason?: string | null,
) {
  const { data, error } = await call("transition_trip", {
    p_trip_id: tripId,
    p_to: to,
    p_command_id: c.commandId,
    p_seq: c.seq,
    p_captured_at: c.capturedAt,
    p_lat: c.lat ?? null,
    p_lng: c.lng ?? null,
    p_accuracy_m: c.accuracyM ?? null,
    p_note: note ?? null,
    p_device_id: c.deviceId,
    p_geofence_override_reason: overrideReason ?? null,
  });
  if (error) raise(error);
  return firstRow(data) as CommandResult & { alert_kind: string | null };
}

export async function rpcRecordCheckpoint(
  tripId: string,
  kind: Database["public"]["Enums"]["trip_checkpoint_kind"],
  c: CaptureCtx,
  args: {
    sealCode?: string | null;
    photoPath?: string | null;
    photoSha256?: string | null;
    note?: string | null;
    overrideReason?: string | null;
  },
) {
  const { data, error } = await call("record_trip_checkpoint", {
    p_trip_id: tripId,
    p_kind: kind,
    p_command_id: c.commandId,
    p_seq: c.seq,
    p_captured_at: c.capturedAt,
    p_lat: c.lat ?? null,
    p_lng: c.lng ?? null,
    p_accuracy_m: c.accuracyM ?? null,
    p_seal_code: args.sealCode ?? null,
    p_photo_path: args.photoPath ?? null,
    p_photo_sha256: args.photoSha256 ?? null,
    p_note: args.note ?? null,
    p_device_id: c.deviceId,
    p_geofence_override_reason: args.overrideReason ?? null,
  });
  if (error) raise(error);
  return firstRow(data) as CommandResult & { checkpoint_id: string | null };
}

export type PodInput = {
  outcome: PodOutcome;
  receiverName: string;
  receiverDocumentKind: string | null;
  receiverDocumentLast4: string | null;
  signaturePath: string | null;
  signatureSha256: string | null;
  photos: { path: string; sha256: string }[];
  qtyDeclared: number | null;
  qtyReceived: number | null;
  notes: string | null;
  overrideReason: string | null;
};

export async function rpcSubmitPod(tripId: string, c: CaptureCtx, pod: PodInput) {
  const { data, error } = await call("submit_proof_of_delivery", {
    p_trip_id: tripId,
    p_command_id: c.commandId,
    p_seq: c.seq,
    p_captured_at: c.capturedAt,
    p_lat: c.lat ?? null,
    p_lng: c.lng ?? null,
    p_accuracy_m: c.accuracyM ?? null,
    p_outcome: pod.outcome,
    p_receiver_name: pod.receiverName,
    p_receiver_document_kind: pod.receiverDocumentKind ?? null,
    p_receiver_document_last4: pod.receiverDocumentLast4 ?? null,
    p_signature_path: pod.signaturePath ?? null,
    p_signature_sha256: pod.signatureSha256 ?? null,
    p_photos: pod.photos as unknown as Json,
    p_qty_declared: pod.qtyDeclared ?? null,
    p_qty_received: pod.qtyReceived ?? null,
    p_notes: pod.notes ?? null,
    p_device_id: c.deviceId,
    p_geofence_override_reason: pod.overrideReason ?? null,
  });
  if (error) raise(error);
  return firstRow(data) as CommandResult & {
    outcome: PodOutcome;
    pod_id: string | null;
    attempt_id: string | null;
    delivery_completed: boolean;
    contract_completed: boolean;
  };
}

export async function rpcSubmitReturnReceipt(
  tripId: string,
  c: CaptureCtx,
  args: {
    photoPath: string;
    photoSha256: string;
    receiverName: string;
    note: string | null;
    overrideReason: string | null;
  },
) {
  const { data, error } = await call("submit_return_receipt", {
    p_trip_id: tripId,
    p_command_id: c.commandId,
    p_seq: c.seq,
    p_captured_at: c.capturedAt,
    p_lat: c.lat ?? null,
    p_lng: c.lng ?? null,
    p_accuracy_m: c.accuracyM ?? null,
    p_photo_path: args.photoPath,
    p_photo_sha256: args.photoSha256,
    p_receiver_name: args.receiverName,
    p_note: args.note ?? null,
    p_device_id: c.deviceId,
    p_geofence_override_reason: args.overrideReason ?? null,
  });
  if (error) raise(error);
  return firstRow(data) as CommandResult;
}

export async function rpcOpenSos(tripId: string, c: CaptureCtx, note: string | null) {
  const { data, error } = await call("open_sos", {
    p_trip_id: tripId,
    p_command_id: c.commandId,
    p_captured_at: c.capturedAt,
    p_lat: c.lat ?? null,
    p_lng: c.lng ?? null,
    p_accuracy_m: c.accuracyM ?? null,
    p_device_id: c.deviceId,
    p_note: note ?? null,
  });
  if (error) raise(error);
  return firstRow(data) as {
    applied: boolean;
    duplicate: boolean;
    rejection_code: string | null;
    exception_id: string | null;
    sos_mode: string;
    ack_target_at: string | null;
  };
}

export async function rpcOpenTripException(
  tripId: string,
  kind: Database["public"]["Enums"]["trip_exception_kind"],
  severity: Database["public"]["Enums"]["trip_exception_severity"] | null,
  description: string,
  c: CaptureCtx,
  evidence: { path: string; sha256: string }[],
) {
  const { data, error } = await call("open_trip_exception", {
    p_trip_id: tripId,
    p_kind: kind,
    p_severity: severity ?? null,
    p_description: description,
    p_command_id: c.commandId,
    p_captured_at: c.capturedAt,
    p_lat: c.lat ?? null,
    p_lng: c.lng ?? null,
    p_accuracy_m: c.accuracyM ?? null,
    p_evidence: evidence as unknown as Json,
    p_device_id: c.deviceId,
  });
  if (error) raise(error);
  return firstRow(data) as {
    applied: boolean;
    duplicate: boolean;
    rejection_code: string | null;
    exception_id: string | null;
  };
}

export async function rpcIngestLocations(
  tripId: string,
  deviceId: string,
  batchId: string,
  points: Record<string, unknown>[],
) {
  const { data, error } = await call("ingest_trip_locations", {
    p_trip_id: tripId,
    p_device_id: deviceId,
    p_batch_id: batchId,
    p_points: points as unknown as Json,
  });
  if (error) raise(error);
  return firstRow(data) as {
    accepted: number;
    stored_flagged: number;
    duplicates: number;
    rejected: unknown;
    tracking_active: boolean;
    trip_status: TripStatus;
  };
}

// ----------------------------------------------------------------------------- transportadora / embarcador / admin (request_id idempotente)
export async function rpcCreateTrip(contractId: string, requestId: string) {
  const { data, error } = await call("create_trip_for_contract", {
    p_contract_id: contractId,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcAssignTrip(
  tripId: string,
  driverId: string,
  truckId: string,
  note: string | null,
  requestId: string,
) {
  const { data, error } = await call("assign_trip", {
    p_trip_id: tripId,
    p_driver_id: driverId,
    p_truck_id: truckId,
    p_note: note ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcReassignTrip(
  tripId: string,
  driverId: string,
  truckId: string,
  reason: string,
  requestId: string,
) {
  const { data, error } = await call("reassign_trip", {
    p_trip_id: tripId,
    p_driver_id: driverId,
    p_truck_id: truckId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcCancelTrip(tripId: string, reason: string, requestId: string) {
  const { data, error } = await call("cancel_trip", {
    p_trip_id: tripId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcReportEta(
  tripId: string,
  etaAt: string,
  note: string | null,
  requestId: string,
) {
  const { data, error } = await call("report_trip_eta", {
    p_trip_id: tripId,
    p_eta_at: etaAt,
    p_note: note ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcAcknowledgeException(
  exceptionId: string,
  note: string | null,
  requestId: string,
) {
  const { data, error } = await call("acknowledge_trip_exception", {
    p_exception_id: exceptionId,
    p_note: note ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcResolveException(
  exceptionId: string,
  resolutionKind: string,
  note: string,
  requestId: string,
) {
  const { data, error } = await call("resolve_trip_exception", {
    p_exception_id: exceptionId,
    p_resolution_kind: resolutionKind,
    p_note: note,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcAcknowledgeSos(
  exceptionId: string,
  note: string | null,
  requestId: string,
) {
  const { data, error } = await call("acknowledge_sos", {
    p_exception_id: exceptionId,
    p_note: note ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcEscalateSos(exceptionId: string, note: string | null, requestId: string) {
  const { data, error } = await call("escalate_sos", {
    p_exception_id: exceptionId,
    p_note: note ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcResolveSos(
  exceptionId: string,
  outcome: string,
  note: string,
  requestId: string,
) {
  const { data, error } = await call("resolve_sos", {
    p_exception_id: exceptionId,
    p_outcome: outcome,
    p_note: note,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcResolveDeliveryException(
  exceptionId: string,
  resolution: Database["public"]["Enums"]["delivery_exception_resolution"],
  note: string,
  newLat: number | null,
  newLng: number | null,
  requestId: string,
) {
  const { data, error } = await call("resolve_delivery_exception", {
    p_exception_id: exceptionId,
    p_resolution: resolution,
    p_note: note,
    p_new_delivery_lat: newLat ?? null,
    p_new_delivery_lng: newLng ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcResolveCargoDisposition(args: {
  tripId: string;
  disposition: CargoDisposition;
  reason: string;
  note: string;
  occurredAt: string;
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  custodianLabel: string | null;
  evidence: { path: string; sha256: string }[];
  isEmergency: boolean;
  requestId: string;
}) {
  const { data, error } = await call("resolve_cargo_disposition", {
    p_trip_id: args.tripId,
    p_disposition: args.disposition,
    p_reason: args.reason,
    p_note: args.note,
    p_occurred_at: args.occurredAt,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
    p_location_text: args.locationText ?? null,
    p_custodian_label: args.custodianLabel ?? null,
    p_evidence: args.evidence as unknown as Json,
    p_is_emergency: args.isEmergency,
    p_request_id: args.requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcPauseTrip(
  tripId: string,
  exceptionId: string | null,
  reason: string,
  requestId: string,
) {
  const { data, error } = await call("pause_trip", {
    p_trip_id: tripId,
    p_exception_id: exceptionId ?? null,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcResumeTrip(tripId: string, reason: string, requestId: string) {
  const { data, error } = await call("resume_trip", {
    p_trip_id: tripId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcForceTransition(
  tripId: string,
  to: TripStatus,
  reason: string,
  requestId: string,
) {
  const { data, error } = await call("force_trip_transition", {
    p_trip_id: tripId,
    p_to: to,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcSetLegalHold(tripId: string, note: string, requestId: string) {
  const { data, error } = await call("set_trip_legal_hold", {
    p_trip_id: tripId,
    p_note: note,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcReleaseLegalHold(tripId: string, note: string, requestId: string) {
  const { data, error } = await call("release_trip_legal_hold", {
    p_trip_id: tripId,
    p_note: note,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcPurgeRawLocations(tripId: string, requestId: string) {
  const { data, error } = await call("purge_trip_raw_locations", {
    p_trip_id: tripId,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcSupersedePod(args: {
  tripId: string;
  reason: string;
  receiverName: string | null;
  receiverDocumentKind: string | null;
  receiverDocumentLast4: string | null;
  signaturePath: string | null;
  signatureSha256: string | null;
  photos: { path: string; sha256: string }[] | null;
  qtyDeclared: number | null;
  qtyReceived: number | null;
  notes: string | null;
  requestId: string;
}) {
  const { data, error } = await call("supersede_proof_of_delivery", {
    p_trip_id: args.tripId,
    p_reason: args.reason,
    p_receiver_name: args.receiverName ?? null,
    p_receiver_document_kind: args.receiverDocumentKind ?? null,
    p_receiver_document_last4: args.receiverDocumentLast4 ?? null,
    p_signature_path: args.signaturePath ?? null,
    p_signature_sha256: args.signatureSha256 ?? null,
    p_photos: (args.photos ?? null) as unknown as Json,
    p_qty_declared: args.qtyDeclared ?? null,
    p_qty_received: args.qtyReceived ?? null,
    p_notes: args.notes ?? null,
    p_request_id: args.requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcAddTripDocument(args: {
  tripId: string;
  kind: string;
  number: string | null;
  path: string;
  sha256: string;
  issuedAt: string | null;
  visibility: Database["public"]["Enums"]["trip_visibility"];
  note: string | null;
  requestId: string;
}) {
  const { data, error } = await call("add_trip_document", {
    p_trip_id: args.tripId,
    p_kind: args.kind,
    p_number: args.number ?? null,
    p_object_path: args.path,
    p_sha256: args.sha256,
    p_issued_at: args.issuedAt ?? null,
    p_visibility: args.visibility,
    p_note: args.note ?? null,
    p_request_id: args.requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcPlaceBid(args: {
  freightId: string;
  amount: number;
  toll: number;
  estimatedHours: number;
  evCertified: boolean;
  driverId: string | null;
  truckId: string | null;
  requestId: string;
}) {
  const { data, error } = await call("place_bid", {
    p_freight_id: args.freightId,
    p_amount: args.amount,
    p_toll: args.toll,
    p_estimated_hours: args.estimatedHours,
    p_ev_certified: args.evCertified,
    p_driver_id: args.driverId ?? null,
    p_truck_id: args.truckId ?? null,
    p_request_id: args.requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}

// ----------------------------------------------------------------------------- membros da empresa (alternativa B)
export async function fetchCompanyMembers(companyId: string) {
  const { data, error } = await call("list_company_members", { p_company_id: companyId });
  if (error) raise(error);
  return (data ?? []) as CompanyMemberRow[];
}
export async function rpcInviteCompanyMember(
  companyId: string,
  email: string,
  role: "operator" | "viewer",
  hours: number,
  requestId: string,
) {
  const { data, error } = await call("invite_company_member", {
    p_company_id: companyId,
    p_email: email,
    p_role: role,
    p_expires_in_hours: hours,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcAcceptCompanyInvitation(token: string) {
  const { data, error } = await call("accept_company_member_invitation", { p_token: token });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcChangeCompanyMemberRole(
  memberId: string,
  role: "operator" | "viewer",
  reason: string,
  requestId: string,
) {
  const { data, error } = await call("change_company_member_role", {
    p_member_id: memberId,
    p_role: role,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcRevokeCompanyMember(memberId: string, reason: string, requestId: string) {
  const { data, error } = await call("revoke_company_member", {
    p_member_id: memberId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcSetCompanyOperationalContact(
  companyId: string,
  email: string | null,
  phone: string | null,
  requestId: string,
) {
  const { data, error } = await call("set_company_operational_contact", {
    p_company_id: companyId,
    p_email: email ?? null,
    p_phone: phone ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}

// ----------------------------------------------------------------------------- push (registro do aparelho e homologacao ponta a ponta)
export async function rpcRegisterPushDevice(
  deviceId: string,
  platform: string,
  token: string,
  appVersion: string,
  build: string,
) {
  const { data, error } = await call("register_push_device", {
    p_device_id: deviceId,
    p_platform: platform,
    p_token: token,
    p_app_version: appVersion,
    p_build: build,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcRevokePushDevice(deviceId: string, reason: string) {
  const { data, error } = await call("revoke_push_device", {
    p_device_id: deviceId,
    p_reason: reason,
  });
  if (error) raise(error);
  return data;
}
export async function rpcRequestPushHomologation(deviceId: string) {
  const { data, error } = await call("request_push_homologation", { p_device_id: deviceId });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcAckPushHomologation(
  homologationId: string,
  nonce: string,
  deviceId: string,
) {
  const { data, error } = await call("ack_push_homologation", {
    p_homologation_id: homologationId,
    p_nonce: nonce,
    p_device_id: deviceId,
  });
  if (error) raise(error);
  return firstRow(data);
}

// ----------------------------------------------------------------------------- governanca (admin)
export async function rpcPublishPrivacyNotice(
  version: string,
  bodyMd: string,
  effectiveFrom: string,
  url: string | null,
  requestId: string,
) {
  const { data, error } = await call("publish_privacy_notice", {
    p_version: version,
    p_body_md: bodyMd,
    p_effective_from: effectiveFrom,
    p_url: url ?? null,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcPublishOperationalPolicy(
  values: Record<string, unknown>,
  reason: string,
  requestId: string,
) {
  const { data, error } = await call("publish_operational_policy", {
    p_values: values as unknown as Json,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcEnablePushDispatch(requestId: string) {
  const { data, error } = await call("enable_push_dispatch", { p_request_id: requestId });
  if (error) raise(error);
  return firstRow(data);
}
export async function rpcSetOperationalFlag(
  key: string,
  value: boolean,
  reason: string,
  requestId: string,
) {
  const { data, error } = await call("set_operational_flag", {
    p_key: key,
    p_value: value,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) raise(error);
  return firstRow(data);
}
