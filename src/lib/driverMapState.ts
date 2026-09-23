// Estado do mapa do motorista (P1).
//
// Diagnostico que motivou este modulo: quando o Google Maps nao carregava
// (sem chave no build, ou script inalcancavel por falta de rede — foi o caso
// do APK de homologacao no emulador sem rota default), a tela desenhava um
// MAPA FALSO: grade decorativa, um caminhao e uma rota tracejada que nao
// correspondem a nada, com um rotulo minusculo "Mapa indisponivel". Alem de
// nao explicar o que aconteceu, a imagem sugeria posicao e trajeto reais.
// O mesmo acontecia quando o mapa carregava mas ainda nao havia posicao: mapa
// cinza centrado em Sao Paulo, sem explicacao.
//
// Aqui o estado e decidido de forma explicita e testavel; a UI so desenha mapa
// de verdade quando ha mapa de verdade.

export type LatLng = { lat: number; lng: number };

export type MapLoadStatus = "loading" | "ready" | "error" | "no-key";

export type DriverMapState =
  /** carregando a biblioteca do mapa */
  | { kind: "loading" }
  /** mapa vivo: posicao do motorista conhecida */
  | { kind: "live"; center: LatLng; hasRoute: boolean }
  /** mapa carregado, rota conhecida, mas ainda sem posicao do motorista */
  | { kind: "awaiting_position"; center: LatLng; hasRoute: boolean }
  /** mapa carregado, porem a viagem nao tem coordenadas para desenhar */
  | { kind: "no_coordinates" }
  /** mapa indisponivel: sem chave de build */
  | { kind: "unavailable"; reason: "no-key" }
  /** mapa indisponivel: biblioteca nao carregou (rede/bloqueio) */
  | { kind: "unavailable"; reason: "load-error" };

export function driverMapState(input: {
  status: MapLoadStatus;
  driver: LatLng | null;
  origin: LatLng | null;
  dest: LatLng | null;
}): DriverMapState {
  const { status, driver, origin, dest } = input;
  if (status === "no-key") return { kind: "unavailable", reason: "no-key" };
  if (status === "error") return { kind: "unavailable", reason: "load-error" };
  if (status === "loading") return { kind: "loading" };
  const hasRoute = Boolean(origin && dest);
  if (driver) return { kind: "live", center: driver, hasRoute };
  const center = origin ?? dest;
  if (center) return { kind: "awaiting_position", center, hasRoute };
  return { kind: "no_coordinates" };
}

/** Chave de i18n do texto principal de cada estado sem mapa vivo. */
export function driverMapMessageKey(state: DriverMapState): string | null {
  switch (state.kind) {
    case "loading":
      return "driverMap.loading";
    case "awaiting_position":
      return "driverMap.awaitingPosition";
    case "no_coordinates":
      return "driverMap.noCoordinates";
    case "unavailable":
      return state.reason === "no-key"
        ? "driverMap.unavailableNoKey"
        : "driverMap.unavailableOffline";
    case "live":
      return null;
  }
}
