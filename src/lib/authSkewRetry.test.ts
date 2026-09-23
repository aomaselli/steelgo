// Prova COMPORTAMENTAL do cancelamento da retentativa de defasagem de relogio.
// Cobre a sequencia completa: bootstrap -> "JWT issued at future" -> backoff ->
// logout/cleanup no meio da espera -> a promessa termina (nao fica pendente) ->
// single-flight limpo -> novo login com o mesmo uid conclui -> nenhum estado
// tocado depois do logout.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthBootstrap } from "./authBootstrap";
import { createCancellableDelay, retryOnClockSkew } from "./authSkewRetry";
import { shouldRetryAuthError, skewRetryDelayMs } from "./authSkew";

const SKEW = "JWT issued at future";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Marca se uma promessa ja terminou, sem bloquear o teste. */
function rastrear<T>(p: Promise<T>) {
  const estado = { terminou: false, valor: undefined as T | undefined };
  void p.then((v) => {
    estado.terminou = true;
    estado.valor = v;
  });
  return estado;
}

describe("espera cancelavel", () => {
  it("cancelar RESOLVE a espera com 'cancelled' (nao deixa promessa pendente)", async () => {
    const delay = createCancellableDelay();
    const e = rastrear(delay.wait(4_000));
    await Promise.resolve();
    expect(e.terminou).toBe(false);
    expect(delay.pending()).toBe(true);

    delay.cancel();
    await Promise.resolve();
    expect(e.terminou).toBe(true);
    expect(e.valor).toBe("cancelled");
    expect(delay.pending()).toBe(false);
  });

  it("sem cancelamento, termina com 'elapsed' no tempo previsto", async () => {
    const delay = createCancellableDelay();
    const e = rastrear(delay.wait(600));
    await vi.advanceTimersByTimeAsync(599);
    expect(e.terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(e.valor).toBe("elapsed");
  });

  it("cancelar depois de terminado e inofensivo; nova espera nao herda a anterior", async () => {
    const delay = createCancellableDelay();
    const e1 = rastrear(delay.wait(100));
    await vi.advanceTimersByTimeAsync(100);
    expect(e1.valor).toBe("elapsed");
    delay.cancel();
    const e2 = rastrear(delay.wait(100));
    await vi.advanceTimersByTimeAsync(100);
    expect(e2.valor).toBe("elapsed");
  });
});

describe("sequencia completa: skew -> backoff -> logout -> novo login", () => {
  it("cumpre os nove pontos", async () => {
    // --- estado observavel (equivalente aos setters do AuthContext)
    const estado: string[] = [];
    let uidAtivo: string | null = null;
    const delay = createCancellableDelay();

    // leituras autenticadas: as duas primeiras falham por relogio adiantado
    let tentativasDeLeitura = 0;
    const loadRole = vi.fn(async () => {
      tentativasDeLeitura += 1;
      if (tentativasDeLeitura <= 2) throw new Error(SKEW);
      return "driver" as const;
    });
    const loadProfile = vi.fn(async (uid: string) => ({ id: uid }));
    const bootstrap = createAuthBootstrap({
      getAccessToken: async () => "jwt",
      loadProfile,
      loadRole,
    });

    const carregar = (uid: string) =>
      retryOnClockSkew({
        run: async () => {
          const r = await bootstrap.ensure(uid);
          return r.status === "error"
            ? ({ ok: false, error: r.message } as const)
            : ({ ok: true, value: r } as const);
        },
        delay,
        shouldRetry: shouldRetryAuthError,
        delayMs: skewRetryDelayMs,
        beforeRetry: () => bootstrap.invalidate(uid),
        stillActive: () => uidAtivo === uid,
      }).then((res) => {
        // "aplicar estado" so acontece aqui — igual ao AuthContext
        if (res.status === "cancelled") return res;
        estado.push(res.status === "ok" ? `pronto:${uid}` : `erro:${uid}`);
        return res;
      });

    // 1) inicia o bootstrap
    uidAtivo = "u1";
    const primeiro = rastrear(carregar("u1"));
    await vi.advanceTimersByTimeAsync(0);

    // 2/3) primeiro erro de skew -> entrou no backoff de 600 ms
    expect(loadRole).toHaveBeenCalledTimes(1);
    expect(delay.pending()).toBe(true);
    expect(primeiro.terminou).toBe(false);

    // 4) logout antes do timer: exatamente o que o AuthContext faz
    uidAtivo = null;
    bootstrap.invalidate();
    delay.cancel();

    // 5) a promessa TERMINA de forma controlada (nao fica pendente)
    await vi.advanceTimersByTimeAsync(0);
    expect(primeiro.terminou).toBe(true);
    expect(primeiro.valor).toEqual({ status: "cancelled" });

    // 9) nenhuma atualizacao de estado apos o logout — nem naquele instante
    expect(estado).toEqual([]);
    // e nem quando o tempo do backoff original passa
    await vi.advanceTimersByTimeAsync(10_000);
    expect(estado).toEqual([]);
    expect(loadRole).toHaveBeenCalledTimes(1); // nao retentou apos o cancelamento

    // 6) single-flight/memoizacao limpos
    expect(bootstrap.isReady("u1")).toBe(false);

    // 7/8) novo login com o MESMO uid executa e conclui normalmente
    uidAtivo = "u1";
    const segundo = rastrear(carregar("u1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadRole).toHaveBeenCalledTimes(2); // nova leitura de verdade
    expect(delay.pending()).toBe(true); // segundo skew -> backoff
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(0);
    expect(segundo.terminou).toBe(true);
    expect(segundo.valor).toMatchObject({ status: "ok" });
    expect(estado).toEqual(["pronto:u1"]);
    expect(bootstrap.isReady("u1")).toBe(true);
  });

  it("erro real nao entra em backoff e aplica o estado de erro na primeira vez", async () => {
    const delay = createCancellableDelay();
    const bootstrap = createAuthBootstrap({
      getAccessToken: async () => "jwt",
      loadProfile: async (uid: string) => ({ id: uid }),
      loadRole: async () => {
        throw new Error("permission denied for table user_roles");
      },
    });
    const r = await retryOnClockSkew({
      run: async () => {
        const res = await bootstrap.ensure("u2");
        return res.status === "error"
          ? ({ ok: false, error: res.message } as const)
          : ({ ok: true, value: res } as const);
      },
      delay,
      shouldRetry: shouldRetryAuthError,
      delayMs: skewRetryDelayMs,
    });
    expect(r.status).toBe("error");
    expect(delay.pending()).toBe(false);
  });

  it("teto de tentativas: 3 esperas (600/1800/4000) e entao erro visivel", async () => {
    const delay = createCancellableDelay();
    const esperas: number[] = [];
    const run = vi.fn(async () => ({ ok: false as const, error: new Error(SKEW) }));
    const p = rastrear(
      retryOnClockSkew({
        run,
        delay,
        shouldRetry: shouldRetryAuthError,
        delayMs: skewRetryDelayMs,
        onRetry: (ms) => esperas.push(ms),
      }),
    );
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1_800);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(esperas).toEqual([600, 1_800, 4_000]);
    expect(run).toHaveBeenCalledTimes(4); // 1 inicial + 3 retentativas
    expect(p.valor).toMatchObject({ status: "error" });
  });

  it("troca de usuario durante a espera encerra como cancelada", async () => {
    const delay = createCancellableDelay();
    let uidAtivo = "u1";
    const p = rastrear(
      retryOnClockSkew({
        run: async () => ({ ok: false as const, error: new Error(SKEW) }),
        delay,
        shouldRetry: shouldRetryAuthError,
        delayMs: skewRetryDelayMs,
        stillActive: () => uidAtivo === "u1",
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    uidAtivo = "u2"; // outro usuario assumiu
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.valor).toEqual({ status: "cancelled" });
  });
});
