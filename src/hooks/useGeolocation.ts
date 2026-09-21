import { useEffect, useState } from "react";
import { tripTracker, type TrackerStatus } from "@/lib/geoTracker";

export type GeoState = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  isLoading: boolean;
};

export type GeoOpts = {
  /** mantido por compatibilidade; nao ha mais leitura propria do GPS */
  watch?: boolean;
  /** mantido por compatibilidade; a posicao de disponibilidade nao e mais coletada aqui */
  availabilityId?: string | null;
  upsertEveryMs?: number;
};

// Modulo 3: este hook NAO chama navigator.geolocation. Ele apenas expoe a ultima
// posicao autorizada do rastreador da viagem (lib/geoTracker), que e a UNICA
// autoridade capaz de pedir localizacao - e so dentro do gate operacional
// (designacao aceita + aviso reconhecido + tracking_required + estado rastreavel
// + app em primeiro plano). Fora de uma viagem rastreada, lat/lng ficam nulos e
// `error` explica; nenhuma tela provoca o dialogo de permissao ao montar.
const NO_POSITION = "Posição do aparelho indisponível: só é coletada durante uma viagem rastreada.";

export function trackerToGeoState(s: TrackerStatus): GeoState {
  if (s.last)
    return {
      lat: s.last.lat,
      lng: s.last.lng,
      accuracy: s.last.accuracy_m,
      error: null,
      loading: false,
      isLoading: false,
    };
  return {
    lat: null,
    lng: null,
    accuracy: null,
    error: s.error ?? (s.active ? null : NO_POSITION),
    loading: s.active, // ativo e ainda sem ponto: aguardando o primeiro fix
    isLoading: s.active,
  };
}

export function useGeolocation(_opts: GeoOpts | boolean = false): GeoState {
  const [state, setState] = useState<GeoState>(() => trackerToGeoState(tripTracker.getStatus()));
  useEffect(() => tripTracker.subscribe((s) => setState(trackerToGeoState(s))), []);
  return state;
}
