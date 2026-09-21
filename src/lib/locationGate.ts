// Gate UNICO para pedir localizacao em primeiro plano (Modulo 3).
//
// A permissao de localizacao do Android so pode ser solicitada pelo fluxo
// operacional de rastreamento (lib/geoTracker -> tripTracker.start), e somente
// quando TODAS as condicoes abaixo valem ao mesmo tempo. A home do motorista, o
// mapa e qualquer outra tela NUNCA pedem localizacao (ver useGeolocation).
//
// O reconhecimento do aviso de privacidade NAO e consentimento de localizacao:
// ele satisfaz o requisito informacional; a autorizacao efetiva continua sendo
// o dialogo do sistema, que aparece uma unica vez, dentro deste gate.
import type { Database } from "@/integrations/supabase/types";

export type TripStatus = Database["public"]["Enums"]["trip_status"];
export type AssignmentState = Database["public"]["Enums"]["trip_assignment_state"];

/** Estados em que o servidor aceita pontos (espelho de tracking_required em get_trip). */
export const TRACKING_STATUSES: readonly TripStatus[] = [
  "en_route_to_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
  "returning",
];

export type LocationGateInput = {
  assignmentState: AssignmentState | null | undefined;
  noticeAcknowledged: boolean;
  trackingRequired: boolean;
  tripStatus: TripStatus | null | undefined;
  appForeground: boolean;
};

export type LocationGateResult = { allowed: true } | { allowed: false; reason: string };

export function evaluateLocationGate(i: LocationGateInput): LocationGateResult {
  if (i.assignmentState !== "accepted") return { allowed: false, reason: "designacao_nao_aceita" };
  if (!i.noticeAcknowledged) return { allowed: false, reason: "aviso_nao_reconhecido" };
  if (!i.trackingRequired) return { allowed: false, reason: "rastreamento_nao_exigido" };
  if (!i.tripStatus || !TRACKING_STATUSES.includes(i.tripStatus))
    return { allowed: false, reason: "estado_nao_admite_rastreamento" };
  if (!i.appForeground) return { allowed: false, reason: "app_em_segundo_plano" };
  return { allowed: true };
}

export const canStartForegroundTracking = (i: LocationGateInput): boolean =>
  evaluateLocationGate(i).allowed;

/** Primeiro plano segundo o documento (WebView/Capacitor pausam a pagina quando o app sai de cena). */
export function isDocumentForeground(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}
