// Orquestracao PURA de "Estou disponivel" (sem React, sem Supabase direto), para
// ser testada. Ordem fail-closed:
//   1) aviso de privacidade vigente reconhecido (senao abre o aviso; recusa => fim)
//   2) explicacao contextual (Cancelar => fim, nenhuma leitura)
//   3) UMA captura pontual pela autoridade unica (motivo capacity_availability)
//   4) precisao aceitavel => set_capacity_available
// Nunca cria watch, sessao de rastreamento nem trip_location; nunca inventa posicao.
import type { LocationPoint } from "@/lib/geoTracker";
import type { PrivacyNotice } from "@/lib/trips";

export type AvailabilityPosition = { lat: number; lng: number; accuracy: number };

export type AvailabilityDeps = {
  /** get_current_privacy_notice (fonte da verdade sobre reconhecimento). */
  fetchNotice: () => Promise<PrivacyNotice>;
  /** Abre o aviso; resolve true somente se o motorista reconheceu. */
  requestAcknowledgement: () => Promise<boolean>;
  /** Explicacao contextual; resolve true somente em "Continuar". */
  explain: () => Promise<boolean>;
  /** tripTracker.captureOnce({ reason: "capacity_availability", noticeAcknowledged }) */
  capture: (noticeAcknowledged: boolean) => Promise<LocationPoint | null>;
  /** set_capacity_available com a posicao capturada. */
  setAvailable: (pos: AvailabilityPosition) => Promise<void>;
  isOnline: () => boolean;
};

export type AvailabilityOutcome =
  | { ok: true; position: AvailabilityPosition }
  | {
      ok: false;
      reason:
        | "offline"
        | "notice_unpublished"
        | "notice_not_acknowledged"
        | "cancelled"
        | "no_position"
        | "accuracy_rejected"
        | "server_error";
      message: string;
    };

export const AVAILABILITY_MAX_ACCURACY_M = 200;

export async function activateAvailability(
  deps: AvailabilityDeps,
  opts: { maxAccuracyM?: number } = {},
): Promise<AvailabilityOutcome> {
  const fail = (reason: Extract<AvailabilityOutcome, { ok: false }>["reason"], message: string) =>
    ({ ok: false, reason, message }) as const;
  if (!deps.isOnline()) return fail("offline", "Sem conexão para sincronizar a disponibilidade.");

  const notice = await deps.fetchNotice();
  if (!notice.published)
    return fail(
      "notice_unpublished",
      "O aviso de privacidade ainda não foi publicado. A disponibilidade com posição não pode ser ativada.",
    );
  if (!notice.acknowledged) {
    const ack = await deps.requestAcknowledgement();
    if (!ack)
      return fail(
        "notice_not_acknowledged",
        "Reconheça o aviso de privacidade para ativar a disponibilidade.",
      );
  }

  const go = await deps.explain();
  if (!go) return fail("cancelled", "Ativação cancelada. Nenhuma localização foi lida.");

  const p = await deps.capture(true);
  if (!p)
    return fail(
      "no_position",
      "Não foi possível obter sua localização. Verifique a permissão e tente novamente.",
    );
  const maxAcc = opts.maxAccuracyM ?? AVAILABILITY_MAX_ACCURACY_M;
  if (p.accuracy_m > maxAcc)
    return fail("accuracy_rejected", "GPS pouco preciso. Afaste-se de prédios e tente novamente.");

  const position = { lat: p.lat, lng: p.lng, accuracy: p.accuracy_m };
  try {
    await deps.setAvailable(position);
  } catch (e) {
    return fail("server_error", e instanceof Error ? e.message : String(e));
  }
  return { ok: true, position };
}
