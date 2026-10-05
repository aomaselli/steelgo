/**
 * Estado do aviso de privacidade por viagem — para quem acompanha a viagem.
 *
 * Medido em 05/10/2026: quando um aviso novo entra em vigor, o aparelho do
 * motorista para de coletar posição em segundos, mas o status da viagem não
 * muda e a sessão de rastreamento continua aberta. Para a transportadora isso
 * aparecia como "sem sinal" — indistinguível de bateria acabada ou túnel.
 *
 * `list_trip_privacy_acknowledgement` (migration 20261005130000) devolve, por
 * viagem que o chamador já pode ver (`trip_visible`, a mesma regra de
 * `get_trip`), a versão em vigor e se o motorista designado já a reconheceu.
 * Nenhum dado pessoal, e `get_trip`/`list_my_trips` não foram alterados.
 *
 * Os três desfechos da consulta são distintos, pelo mesmo motivo do contrato:
 * falha de integração não pode se disfarçar de "está tudo bem".
 */
import { supabase } from "@/integrations/supabase/client";

export type TripPrivacyAck = {
  trip_id: string;
  notice_version: string | null;
  driver_assigned: boolean;
  driver_acknowledged: boolean;
};

export type TripPrivacyOutcome =
  | ({ status: "ok" } & TripPrivacyAck)
  | { status: "sem_visibilidade" }
  | { status: "falha"; detalhe: string };

const BATCH = 500;

export async function fetchTripPrivacyAcknowledgement(
  tripIds: string[],
): Promise<Map<string, TripPrivacyOutcome>> {
  const ids = Array.from(new Set(tripIds.filter(Boolean)));
  const out = new Map<string, TripPrivacyOutcome>();

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { data, error } = await supabase.rpc("list_trip_privacy_acknowledgement", {
      p_trip_ids: chunk,
    });
    if (error) {
      const detalhe = [error.code, error.message].filter(Boolean).join(" ");
      for (const id of chunk) out.set(id, { status: "falha", detalhe });
      continue;
    }
    const vistos = new Set<string>();
    for (const row of (data ?? []) as TripPrivacyAck[]) {
      vistos.add(row.trip_id);
      out.set(row.trip_id, { status: "ok", ...row });
    }
    for (const id of chunk) if (!vistos.has(id)) out.set(id, { status: "sem_visibilidade" });
  }
  return out;
}

/** A viagem está parada esperando o motorista reconhecer o aviso? */
export function aguardandoReconhecimento(o: TripPrivacyOutcome | undefined | null): boolean {
  return !!o && o.status === "ok" && o.driver_assigned && !o.driver_acknowledged;
}
