// Bootstrap da sessao (perfil + papel) com UMA autoridade e sem corrida.
//
// Causa do 401 intermitente no login (homologacao 21/09/2026): as consultas
// protegidas (profiles/user_roles) eram disparadas a partir do callback de
// onAuthStateChange (setTimeout 0) e o `error` era ignorado; quando a leitura
// saia antes de o cliente ter um access token utilizavel, ela ia como anon
// (user_roles sem grant => 401), o papel ficava nulo e a tela de login esperava
// em silencio - so um segundo clique "resolvia".
//
// Regras deste modulo (puro, testavel):
//  * nenhuma consulta protegida sem access token: `getAccessToken()` primeiro;
//    sem token => `waiting_token` (o proximo evento de auth com token reexecuta);
//  * single-flight por uid: eventos repetidos (INITIAL_SESSION, SIGNED_IN,
//    TOKEN_REFRESHED) nao duplicam bootstrap;
//  * resultado memorizado por uid: `ready` uma unica vez => uma navegacao;
//  * erro real (RLS/rede) vira `error` com mensagem, nunca silencio;
//  * `signInOnce` deduplica cliques simultaneos: uma unica autenticacao efetiva.
export type BootstrapResult<P, R> =
  | { status: "ready"; uid: string; profile: P | null; role: R | null }
  | { status: "waiting_token"; uid: string }
  | { status: "error"; uid: string; message: string };

export type BootstrapDeps<P, R> = {
  /** access token utilizavel da sessao atual (null enquanto nao hidratada) */
  getAccessToken: () => Promise<string | null>;
  /** consultas protegidas; DEVEM lancar em caso de erro (nunca engolir) */
  loadProfile: (uid: string) => Promise<P | null>;
  loadRole: (uid: string) => Promise<R | null>;
};

export function createAuthBootstrap<P, R>(deps: BootstrapDeps<P, R>) {
  const done = new Map<string, BootstrapResult<P, R>>();
  let inflight: { uid: string; promise: Promise<BootstrapResult<P, R>> } | null = null;

  async function run(uid: string): Promise<BootstrapResult<P, R>> {
    const token = await deps.getAccessToken();
    if (!token) return { status: "waiting_token", uid };
    try {
      const [profile, role] = await Promise.all([deps.loadProfile(uid), deps.loadRole(uid)]);
      const r: BootstrapResult<P, R> = { status: "ready", uid, profile, role };
      done.set(uid, r);
      return r;
    } catch (e) {
      return { status: "error", uid, message: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    /** Garante o bootstrap do uid: memorizado, single-flight, fail-closed sem token. */
    ensure(uid: string): Promise<BootstrapResult<P, R>> {
      const d = done.get(uid);
      if (d) return Promise.resolve(d);
      if (inflight && inflight.uid === uid) return inflight.promise;
      const promise = run(uid).finally(() => {
        if (inflight && inflight.uid === uid) inflight = null;
      });
      inflight = { uid, promise };
      return promise;
    },
    /** Esquece o resultado (refresh/updateProfile/logout). */
    invalidate(uid?: string) {
      if (uid) done.delete(uid);
      else done.clear();
    },
    isReady(uid: string) {
      return done.has(uid);
    },
  };
}

/** Deduplica autenticacoes simultaneas (duplo clique): a segunda chamada recebe a mesma Promise. */
export function createSignInOnce<T>(
  signIn: (email: string, password: string) => Promise<T>,
): (email: string, password: string) => Promise<T> {
  let inflight: { key: string; promise: Promise<T> } | null = null;
  return (email, password) => {
    const key = email.trim().toLowerCase();
    if (inflight && inflight.key === key) return inflight.promise;
    const promise = signIn(email, password).finally(() => {
      if (inflight && inflight.key === key) inflight = null;
    });
    inflight = { key, promise };
    return promise;
  };
}
