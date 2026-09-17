// Modulo 3 (Control Tower operacional): vocabulario de estados da viagem, num
// unico lugar. Os rotulos sao HONESTOS: "estimativa" nunca vira "chegada",
// "alerta critico em homologacao" nunca vira "central 24h".
import type { Database } from "@/integrations/supabase/types";

export type TripStatus = Database["public"]["Enums"]["trip_status"];
export type TripExceptionKind = Database["public"]["Enums"]["trip_exception_kind"];
export type TripExceptionSeverity = Database["public"]["Enums"]["trip_exception_severity"];
export type TripAlertKind = Database["public"]["Enums"]["trip_alert_kind"];
export type PodOutcome = Database["public"]["Enums"]["pod_outcome"];
export type CargoDisposition = Database["public"]["Enums"]["cargo_disposition"];

export const TRIP_STATUS_META: Record<
  TripStatus,
  { label: string; short: string; cls: string; active: boolean }
> = {
  planned: {
    label: "Planejada",
    short: "Planejada",
    cls: "bg-graphite-700 text-graphite-100",
    active: false,
  },
  assigned: {
    label: "Motorista designado",
    short: "Designada",
    cls: "bg-amber/20 text-amber-400",
    active: false,
  },
  driver_accepted: {
    label: "Aceita pelo motorista",
    short: "Aceita",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: false,
  },
  en_route_to_pickup: {
    label: "A caminho da coleta",
    short: "P/ coleta",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: true,
  },
  at_pickup: {
    label: "No local de coleta",
    short: "Na coleta",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: true,
  },
  loading: {
    label: "Carregando",
    short: "Carregando",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: true,
  },
  in_transit: {
    label: "Em trânsito",
    short: "Em trânsito",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: true,
  },
  at_delivery: {
    label: "No local de entrega",
    short: "Na entrega",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: true,
  },
  unloading: {
    label: "Descarregando",
    short: "Descarga",
    cls: "bg-steel-blue/20 text-steel-blue-200",
    active: true,
  },
  returning: {
    label: "Retornando à origem",
    short: "Retorno",
    cls: "bg-amber/20 text-amber-400",
    active: true,
  },
  delivered: {
    label: "Entregue (comprovante registrado)",
    short: "Entregue",
    cls: "bg-esg-green/20 text-esg-green-400",
    active: false,
  },
  returned: {
    label: "Devolvida à origem",
    short: "Devolvida",
    cls: "bg-amber/20 text-amber-400",
    active: false,
  },
  completed: {
    label: "Concluída",
    short: "Concluída",
    cls: "bg-esg-green/20 text-esg-green-400",
    active: false,
  },
  cancelled: {
    label: "Cancelada",
    short: "Cancelada",
    cls: "bg-red-900/30 text-red-400",
    active: false,
  },
};

export const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  "en_route_to_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
  "returning",
];
export const LIVE_TRIP_STATUSES: TripStatus[] = [
  "planned",
  "assigned",
  "driver_accepted",
  ...ACTIVE_TRIP_STATUSES,
  "delivered",
];
export const TERMINAL_TRIP_STATUSES: TripStatus[] = ["completed", "cancelled", "returned"];

/** Proxima transicao que o MOTORISTA pode comandar (espelho da allowlist de transition_trip). */
export const DRIVER_NEXT_STEP: Partial<
  Record<TripStatus, { to: TripStatus; label: string; hint: string }>
> = {
  driver_accepted: {
    to: "en_route_to_pickup",
    label: "Iniciar deslocamento",
    hint: "O rastreamento comeca agora.",
  },
  en_route_to_pickup: {
    to: "at_pickup",
    label: "Cheguei na coleta",
    hint: "Confirmado pelo geofence da origem.",
  },
  at_pickup: {
    to: "loading",
    label: "Iniciar carregamento",
    hint: "Registre a foto da carga carregada em seguida.",
  },
  loading: {
    to: "in_transit",
    label: "Sair carregado",
    hint: "Exige o checkpoint de carga (foto).",
  },
  in_transit: {
    to: "at_delivery",
    label: "Cheguei na entrega",
    hint: "Confirmado pelo geofence do destino.",
  },
  at_delivery: {
    to: "unloading",
    label: "Iniciar descarga",
    hint: "Depois, registre o comprovante de entrega.",
  },
};

export function tripStatusMeta(status: string | null | undefined) {
  return (
    TRIP_STATUS_META[(status ?? "planned") as TripStatus] ?? {
      label: status ?? "—",
      short: status ?? "—",
      cls: "bg-graphite-700 text-graphite-100",
      active: false,
    }
  );
}

export const EXCEPTION_KIND_LABEL: Record<string, string> = {
  delay: "Atraso",
  vehicle_breakdown: "Pane do veículo",
  accident: "Acidente",
  theft: "Furto/roubo",
  cargo_damage: "Avaria na carga",
  cargo_refusal: "Recusa da carga",
  delivery_mismatch: "Divergência na entrega",
  document_issue: "Problema documental",
  long_stop: "Parada longa",
  comm_loss: "Perda de comunicação",
  route_deviation: "Desvio de rota",
  sos: "Alerta crítico",
  cargo_disposition_required: "Disposição da carga pendente",
  other: "Outra ocorrência",
};

export const ALERT_KIND_LABEL: Record<string, string> = {
  no_update: "Sem atualização de posição",
  long_stop: "Parada longa fora de pátio",
  moving_away: "Afastando-se do destino",
  no_progress: "Sem progresso ao destino",
  late_eta: "Estimativa após o prazo",
  route_deviation: "Fora do corredor cadastrado",
  gps_anomaly: "Anomalia de GPS",
  pod_outside_geofence: "Comprovante fora do geofence",
  sos: "Alerta crítico",
};

export const SEVERITY_CLS: Record<string, string> = {
  low: "bg-graphite-700 text-graphite-100",
  medium: "bg-amber/20 text-amber-400",
  high: "bg-orange-900/30 text-orange-300",
  critical: "bg-red-900/30 text-red-400",
};

/** Mensagens para os codigos de recusa devolvidos pelas RPCs de comando (sem excecao SQL). */
export const REJECTION_MESSAGE: Record<string, string> = {
  assignment_not_accepted: "Aceite a viagem antes de registrar comandos.",
  trip_paused_by_contract:
    "Viagem pausada pelo contrato (disputa ou cancelamento). Aguarde a retomada.",
  trip_paused_by_exception: "Viagem pausada por uma ocorrência aberta.",
  critical_exception_open: "Há um alerta crítico aberto. A entrega só segue após o encerramento.",
  invalid_transition: "Esta etapa não pode ser registrada a partir do estado atual.",
  loaded_checkpoint_required: "Registre o checkpoint de carga (foto) antes de sair carregado.",
  outside_geofence: "Você está fora do raio do local. Informe o motivo para continuar.",
  tracking_inactive: "Rastreamento inativo: a viagem não está em andamento.",
  sos_already_open: "Já existe um alerta crítico aberto para esta viagem.",
  delivery_exception_open: "Há uma divergência de entrega aberta. Aguarde a decisão da SteelGo.",
  photo_required: "A foto é obrigatória para este registro.",
};

export function rejectionMessage(code: string | null | undefined) {
  if (!code) return "Comando recusado.";
  if (code.startsWith("invalid_state:"))
    return `Viagem já está em "${tripStatusMeta(code.split(":")[1]).label}".`;
  return REJECTION_MESSAGE[code] ?? `Comando recusado (${code}).`;
}

export const CARGO_DISPOSITION_LABEL: Record<string, string> = {
  delivered_by_resolution: "Entregue por resolução administrativa",
  returned_to_origin: "Devolvida à origem",
  transferred_to_custodian: "Transferida a custodiante",
  transshipped: "Transbordada para outro veículo",
  emergency_release: "Liberação de emergência",
};

export function relativeMinutes(value: string | null | undefined): string {
  if (!value) return "sem sinal";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

export function fmtDateTime(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";
}
