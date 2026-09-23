// Espera cancelavel e laco de retentativa do 401 transitorio de relogio.
//
// Correcao: a primeira versao cancelava o timer com clearTimeout, mas a Promise
// da espera nunca era resolvida — o quadro assincrono ficava suspenso
// indefinidamente apos logout/unmount. Agora o cancelamento RESOLVE a espera
// com "cancelled", o laco encerra de forma controlada e quem chamou sabe que
// nao deve tocar em estado nenhum.

export type ResultadoEspera = "elapsed" | "cancelled";

export type EsperaCancelavel = {
  /** Espera `ms`; devolve "cancelled" se cancel() for chamado antes. */
  wait(ms: number): Promise<ResultadoEspera>;
  /** Encerra uma espera em curso (idempotente). */
  cancel(): void;
  /** true enquanto ha espera em curso (uso em testes/diagnostico). */
  pending(): boolean;
};

export function createCancellableDelay(): EsperaCancelavel {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolver: ((r: ResultadoEspera) => void) | null = null;

  const limpar = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    resolver = null;
  };

  return {
    wait(ms: number) {
      // uma espera por vez: a anterior e cancelada, nunca abandonada
      if (resolver) {
        const anterior = resolver;
        limpar();
        anterior("cancelled");
      }
      return new Promise<ResultadoEspera>((resolve) => {
        resolver = resolve;
        timer = setTimeout(() => {
          timer = null;
          resolver = null;
          resolve("elapsed");
        }, ms);
      });
    },
    cancel() {
      const pendente = resolver;
      limpar();
      if (pendente) pendente("cancelled");
    },
    pending() {
      return resolver !== null;
    },
  };
}

export type Tentativa<T> = { ok: true; value: T } | { ok: false; error: unknown };

export type ResultadoRetry<T> =
  | { status: "ok"; value: T }
  | { status: "error"; error: unknown }
  /** logout/unmount durante a espera ou entre tentativas: nada deve ser aplicado */
  | { status: "cancelled" };

/**
 * Executa `run` e, somente para a defasagem de relogio, repete com backoff
 * limitado. Qualquer outro erro volta imediatamente como "error".
 */
export async function retryOnClockSkew<T>(opts: {
  run: (tentativa: number) => Promise<Tentativa<T>>;
  delay: EsperaCancelavel;
  shouldRetry: (erro: unknown, tentativaJaFeita: number) => boolean;
  delayMs: (tentativaJaFeita: number) => number;
  /** limpa o single-flight/memoizacao antes de tentar de novo */
  beforeRetry?: (tentativa: number) => void;
  onRetry?: (ms: number, tentativa: number) => void;
  /** false = o contexto mudou (logout, troca de usuario, unmount) */
  stillActive?: () => boolean;
}): Promise<ResultadoRetry<T>> {
  const { run, delay, shouldRetry, delayMs, beforeRetry, onRetry, stillActive } = opts;
  const ativo = () => (stillActive ? stillActive() : true);

  for (let tentativa = 0; ; tentativa++) {
    if (!ativo()) return { status: "cancelled" };
    const r = await run(tentativa);
    if (!ativo()) return { status: "cancelled" };
    if (r.ok) return { status: "ok", value: r.value };
    if (!shouldRetry(r.error, tentativa)) return { status: "error", error: r.error };

    const espera = delayMs(tentativa);
    beforeRetry?.(tentativa);
    onRetry?.(espera, tentativa);
    const fim = await delay.wait(espera);
    if (fim === "cancelled" || !ativo()) return { status: "cancelled" };
  }
}
