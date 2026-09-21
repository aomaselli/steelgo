// Login sem corrida: bootstrap so com token utilizavel, single-flight por uid,
// resultado unico (uma navegacao), erro real exposto; duplo clique = uma
// autenticacao. Reproduz a ordem problematica observada na homologacao:
//   1) evento de auth  2) sessao ainda nao hidratada  3) tentativa de bootstrap
//   4) token disponivel  5) exatamente UMA leitura autenticada e UMA "navegacao".
import { describe, expect, it, vi } from "vitest";
import { createAuthBootstrap, createSignInOnce } from "./authBootstrap";

type P = { id: string; is_onboarded: boolean };
type R = "driver" | "carrier";

function harness(opts: { token: () => string | null }) {
  const reads: string[] = [];
  const deps = {
    getAccessToken: vi.fn(async () => opts.token()),
    loadProfile: vi.fn(async (uid: string) => {
      reads.push("profiles:" + uid);
      return { id: uid, is_onboarded: true } as P;
    }),
    loadRole: vi.fn(async (uid: string) => {
      reads.push("user_roles:" + uid);
      return "driver" as R;
    }),
  };
  const b = createAuthBootstrap<P, R>(deps);
  // "navegacao": a UI navega quando o bootstrap fica pronto pela primeira vez
  const navigations: string[] = [];
  const onEvent = async (uid: string) => {
    const r = await b.ensure(uid);
    if (r.status === "ready" && !navigations.includes(uid)) navigations.push(uid);
    return r;
  };
  return { b, deps, reads, navigations, onEvent };
}

describe("authBootstrap — ordem problematica", () => {
  it("evento sem token -> nenhuma consulta; token disponivel -> UMA leitura autenticada e UMA navegacao", async () => {
    let token: string | null = null;
    const h = harness({ token: () => token });
    // 1-3) evento de auth com sessao ainda nao hidratada
    const r1 = await h.onEvent("u1");
    expect(r1).toEqual({ status: "waiting_token", uid: "u1" });
    expect(h.reads).toEqual([]); // nada saiu como anon
    expect(h.navigations).toEqual([]);
    // 4) token disponivel; eventos repetidos (INITIAL_SESSION + SIGNED_IN + TOKEN_REFRESHED)
    token = "jwt";
    const [a, b, c] = await Promise.all([h.onEvent("u1"), h.onEvent("u1"), h.onEvent("u1")]);
    expect(a.status).toBe("ready");
    expect(b).toBe(a); // single-flight: mesma Promise/resultado
    expect(c).toBe(a);
    // 5) exatamente uma leitura de cada tabela e uma navegacao
    expect(h.reads).toEqual(["profiles:u1", "user_roles:u1"]);
    expect(h.navigations).toEqual(["u1"]);
    // evento tardio (TOKEN_REFRESHED) nao repete nada
    await h.onEvent("u1");
    expect(h.reads).toHaveLength(2);
    expect(h.navigations).toHaveLength(1);
  });

  it("erro real (ex.: 401/RLS) -> status error com mensagem, nunca silencio; retry apos invalidate", async () => {
    const h = harness({ token: () => "jwt" });
    h.deps.loadRole.mockRejectedValueOnce(new Error("permission denied for table user_roles"));
    const r = await h.onEvent("u2");
    expect(r).toMatchObject({ status: "error", message: /permission denied/ });
    expect(h.navigations).toEqual([]);
    h.b.invalidate("u2");
    const r2 = await h.onEvent("u2");
    expect(r2.status).toBe("ready");
    expect(h.navigations).toEqual(["u2"]);
  });

  it("troca de usuario: bootstrap independente por uid; logout invalida tudo", async () => {
    const h = harness({ token: () => "jwt" });
    await h.onEvent("u1");
    await h.onEvent("u3");
    expect(h.reads).toEqual(["profiles:u1", "user_roles:u1", "profiles:u3", "user_roles:u3"]);
    h.b.invalidate();
    expect(h.b.isReady("u1")).toBe(false);
    expect(h.b.isReady("u3")).toBe(false);
  });
});

describe("signInOnce — duplo clique", () => {
  it("dois cliques simultaneos -> uma unica autenticacao efetiva, mesma Promise", async () => {
    let release: (v: { error: null }) => void = () => undefined;
    const raw = vi.fn(() => new Promise<{ error: null }>((r) => (release = r)));
    const signIn = createSignInOnce(raw);
    const p1 = signIn("D1@t.dev", "x");
    const p2 = signIn("d1@t.dev ", "x");
    expect(p2).toBe(p1);
    expect(raw).toHaveBeenCalledTimes(1);
    release({ error: null });
    await Promise.all([p1, p2]);
    // depois de concluir, um novo clique e uma nova autenticacao
    raw.mockImplementationOnce(async () => ({ error: null }));
    await signIn("d1@t.dev", "x");
    expect(raw).toHaveBeenCalledTimes(2);
  });
});

describe("AuthContext — estrutura (uma autoridade, sem consultas no callback de auth)", () => {
  it("o callback de onAuthStateChange so grava estado: sem supabase.from/loadUserData/setTimeout; bootstrap num efeito keyed pelo token", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "../contexts/AuthContext.tsx"), "utf8").replace(
      /\/\/.*$/gm,
      "",
    );
    const a = src.indexOf("supabase.auth.onAuthStateChange(");
    const b = src.indexOf("void supabase.auth.getSession()", a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const cb = src.slice(a, b);
    expect(cb).not.toMatch(/supabase\.from\(|loadUserData\(|setTimeout\(|discoverCompanies\(/);
    expect(src).toMatch(/\[uidForBootstrap, accessToken\]/); // efeito de bootstrap keyed pelo token
    expect(src).toMatch(/createAuthBootstrap</);
    expect(src).toMatch(/createSignInOnce\(/);
    // erros das consultas nunca sao engolidos
    expect(src).toMatch(/if \(error\) throw new Error\(`perfil/);
    expect(src).toMatch(/if \(error\) throw new Error\(`papel/);
  });
});
