// Prova estrutural: fora de lib/geoTracker.ts nenhum arquivo do app chama a API
// de geolocalizacao. Assim, a home do motorista (montagem, rerender, viagem apenas
// visualizada) e as rotas operacionais nao conseguem abrir o dialogo de
// permissao; so o tripTracker, dentro do gate ou por captura explicita, pode.
// Idem para push: so lib/pushClient toca o plugin e a permissao so e pedida por
// acao explicita apos a explicacao contextual.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const AUTHORITY = "lib/geoTracker.ts";
const FORBIDDEN =
  /navigator\.geolocation\b|\.getCurrentPosition\(|\.watchPosition\(|Geolocation\.(requestPermissions|getCurrentPosition|watchPosition)\(/;
// corpo de cada useEffect(() => { ... }, [deps]);
const EFFECT_RE = /useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(SRC, f).replace(/\\/g, "/");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function read(relPath: string): string {
  return stripComments(readFileSync(join(SRC, relPath), "utf8"));
}

describe("autoridade unica de localizacao", () => {
  it("apenas lib/geoTracker.ts chama a API de geolocalizacao", () => {
    const offenders = walk(SRC)
      .filter((f) => FORBIDDEN.test(stripComments(readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders).toEqual([AUTHORITY]);
  });

  it("nenhum componente/hook possui watch paralelo (watchPosition/clearWatch so na autoridade)", () => {
    for (const f of walk(SRC)) {
      if (rel(f) === AUTHORITY || rel(f).startsWith("lib/testing/")) continue;
      expect(stripComments(readFileSync(f, "utf8"))).not.toMatch(/watchPosition|clearWatch/);
    }
  });

  it("DriverHomePage nao importa useGeolocation nem chama geolocalizacao", () => {
    const src = read("pages/driver/DriverHomePage.tsx");
    expect(src).not.toMatch(/useGeolocation|navigator\.geolocation|getCurrentPosition/);
  });

  it("useGeolocation (rotas do motorista) nao chama geolocalizacao: so le o rastreador", () => {
    const src = read("hooks/useGeolocation.ts");
    expect(src).not.toMatch(/navigator\.geolocation|getCurrentPosition|watchPosition/);
    expect(src).toMatch(/tripTracker\.subscribe/);
  });

  it("DriverHomePage: nenhuma captura ao montar; captureOnce so dentro de activateAvailability (Estou disponivel continua pontual)", () => {
    const src = read("pages/driver/DriverHomePage.tsx");
    const effects = src.match(EFFECT_RE) ?? [];
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects)
      expect(e).not.toMatch(/tripTracker|captureOnce|activateAvailability|enablePush|registerPush/);
    expect(src.match(/tripTracker\.captureOnce\(/g) ?? []).toHaveLength(1);
    const idxAct = src.indexOf("activateAvailability({");
    const idxCap = src.indexOf("tripTracker.captureOnce(");
    expect(idxAct).toBeGreaterThan(0);
    expect(idxCap).toBeGreaterThan(idxAct);
    expect(src).toMatch(/reason: "capacity_availability"/);
    expect(src).not.toMatch(/tripTracker\.start\(|tripTracker\.startTrip\(/); // nunca inicia rastreamento/sessao
    const statusFn = src.slice(
      src.indexOf("const setCapacityStatus"),
      src.indexOf("const createAvailability"),
    );
    expect(statusFn.length).toBeGreaterThan(0);
    expect(statusFn).not.toMatch(/captureOnce|activateAvailability|tripTracker/);
  });

  it("rotas operacionais (checkpoint/exception/panic/pod/return-receipt): zero geolocalizacao ao montar", () => {
    for (const r of ["checkpoint", "exception", "panic", "pod", "return-receipt"]) {
      const src = read(`routes/driver.${r}.tsx`);
      expect(src).not.toMatch(
        /navigator\.geolocation|getCurrentPosition|watchPosition|captureOnce|startTrip/,
      );
      for (const e of src.match(EFFECT_RE) ?? [])
        expect(e).not.toMatch(/getCommandPosition|tripTracker/);
    }
  });

  it("DriverTripPanel: 'Iniciar deslocamento' = explicacao + tripTracker.startTrip (uma RPC atomica), nunca outbox/RPCs antigas", () => {
    const src = read("components/trip/DriverTripPanel.tsx");
    expect(src).toMatch(/if \(to === "en_route_to_pickup"\)/);
    expect(src).toMatch(/setExplainer\("trip_start"\)/);
    expect(src).toMatch(/tripTracker\.startTrip\(\{ tripId: trip\.id \}\)/);
    expect(src).not.toMatch(/onClick=\{\(\) => void transition\(next\.to/);
    expect(src).not.toMatch(/start_tracking_session|rpcStartTrackingSession|rpcStartTripTracking/);
    // o start do rastreador nao e re-disparado por visibilidade (o tracker cuida disso)
    const startEffect = (src.match(EFFECT_RE) ?? []).find((e) => /tripTracker\.start\(/.test(e));
    expect(startEffect).toBeDefined();
    expect(startEffect!).not.toMatch(/foreground/);
  });

  it("inicio novo no tracker: so start_trip_tracking (sem start_tracking_session/transition_trip/ingest no caminho)", () => {
    const tracker = read(AUTHORITY);
    const a = tracker.indexOf("private async _startTrip(");
    const b = tracker.indexOf("flush(): Promise<void> {", a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const startTrip = tracker.slice(a, b);
    expect(startTrip).toMatch(/rpcStartTripTracking\(/);
    expect(startTrip).not.toMatch(
      /rpcStartTrackingSession\(|rpcTransitionTrip\(|rpcIngestLocations\(/,
    );
    expect(tracker).not.toMatch(/rpcTransitionTrip/); // a transicao de inicio nunca e feita a parte
  });

  it("push: so lib/pushClient toca o plugin; loader nunca devolve o Proxy; permissao so apos explicacao; nada em mount/effect", () => {
    const touching = walk(SRC)
      .filter((f) =>
        /@capacitor\/push-notifications|PushNotifications\./.test(
          stripComments(readFileSync(f, "utf8")),
        ),
      )
      .map(rel);
    expect(touching).toEqual(["lib/pushClient.ts"]);
    const pc = read("lib/pushClient.ts");
    expect(pc).toMatch(/handle = \{ plugin \}/);
    expect(pc).not.toMatch(/return mod\.PushNotifications|return plugin;/);
    for (const f of [
      "pages/driver/DriverHomePage.tsx",
      "components/trip/DriverTripPanel.tsx",
      "components/trip/PushSection.tsx",
      "components/trip/DriverPrivacyCard.tsx",
      "routes/driver.profile.tsx",
      "hooks/useTripTracker.ts",
    ]) {
      const src = read(f);
      expect(src).not.toMatch(/\bregisterPush\(|requestPermissions\(/);
      for (const e of src.match(EFFECT_RE) ?? []) expect(e).not.toMatch(/enablePush/);
    }
    for (const f of ["components/trip/PushSection.tsx", "components/trip/DriverPrivacyCard.tsx"]) {
      const src = read(f);
      expect(src).toMatch(/enablePush\(\)/);
      expect(src).toMatch(/kind=\{[^}]*"push"[^}]*\}/);
      expect(src).toMatch(/onClick=\{\(\) => set\w*[Ee]xplain\w*\(true\)\}/); // o botao so abre a explicacao
    }
  });

  it("nenhuma escrita direta nas tabelas operacionais (so RPCs)", () => {
    const ops =
      /from\("(operational_trips|trip_assignments|trip_tracking_sessions|trip_locations|trip_events|trip_checkpoints|proof_of_delivery|trip_exceptions|operational_alerts|push_devices|push_outbox)"\)\s*\.(insert|update|upsert|delete)/;
    for (const f of walk(SRC)) expect(stripComments(readFileSync(f, "utf8"))).not.toMatch(ops);
  });

  it("o tracker exige o gate antes de selecionar provedor", () => {
    const src = read(AUTHORITY);
    const gateIdx = src.indexOf("evaluateLocationGate({ ...gate");
    const selIdx = src.indexOf("selectLocationProvider();", gateIdx);
    expect(gateIdx).toBeGreaterThan(0);
    expect(selIdx).toBeGreaterThan(gateIdx);
  });
});
