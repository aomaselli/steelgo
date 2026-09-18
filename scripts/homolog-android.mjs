// Gera os assets web do build type Android "homolog" (Modulo 3), apontando para
// o Supabase LOCAL visto pelo emulador (http://10.0.2.2:54321).
//
// Fonte unica da chave local: `supabase status -o json` (PUBLISHABLE_KEY), lida
// aqui e passada SOMENTE ao processo filho do Vite. O valor nunca e impresso nem
// gravado em arquivo rastreado: so tipo, comprimento e SHA-256 abreviado.
//
// Nunca chama `cap sync`, nunca toca dist/ nem android/app/src/main/assets
// (producao). Escreve apenas em dist-homolog/ e android/app/src/homolog/assets/
// (ambos ignorados pelo git). 10.0.2.2 aparece neste arquivo rastreado de
// proposito: e o endereco padrao do host no emulador, nao um segredo.
//
// Uso:  node scripts/homolog-android.mjs
//       (opcional) VITE_SUPABASE_URL=http://10.0.2.2:54321 para sobrescrever a URL
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist-homolog");
const MAIN_ASSETS = join(ROOT, "android", "app", "src", "main", "assets");
const HOMOLOG_ASSETS = join(ROOT, "android", "app", "src", "homolog", "assets");
const LOCAL_URL = process.env.VITE_SUPABASE_URL || "http://10.0.2.2:54321";
// Qualquer projeto hospedado (<ref>.supabase.co) e proibido no bundle de homologacao:
// o destino local e sempre 10.0.2.2/127.0.0.1. Sem project-ref literal neste arquivo.
const HOSTED_SUPABASE_RE = /[a-z0-9]{20}\.supabase\.co/;
const EXPECTED_PLUGINS = [
  "@capacitor/app",
  "@capacitor/device",
  "@capacitor/geolocation",
  "@capacitor/network",
  "@capacitor/preferences",
  "@capacitor/push-notifications",
];

const abbrev = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 12);
const fail = (msg) => {
  console.error("[homolog] ABORTADO: " + msg);
  process.exit(1);
};

// 1) URL local obrigatoria (nada de escrita antes desta validacao)
if (!/^http:\/\/(10\.0\.2\.2|127\.0\.0\.1|localhost):\d+$/.test(LOCAL_URL))
  fail(`VITE_SUPABASE_URL nao e local: ${LOCAL_URL}`);

// 2) chave local: unica fonte = supabase status (nunca .env.local, nunca argumento)
let status;
try {
  const raw = execFileSync("cmd", ["/c", "npx --yes supabase@2.117.0 status -o json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  status = JSON.parse(raw.slice(raw.indexOf("{")));
} catch {
  fail("nao foi possivel ler `supabase status -o json` (stack local parada?)");
}
if (!status.API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL))
  fail(`API_URL do status nao e local: ${status.API_URL}`);
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
const keyType = String(key).startsWith("sb_publishable_")
  ? "sb_publishable"
  : String(key).startsWith("eyJ")
    ? "jwt-anon"
    : "desconhecido";
if (!key || keyType === "desconhecido")
  fail("PUBLISHABLE_KEY/ANON_KEY local ausente ou em formato inesperado");
if (keyType === "jwt-anon") {
  const payload = JSON.parse(Buffer.from(String(key).split(".")[1], "base64url").toString("utf8"));
  if (payload.role !== "anon" || payload.ref)
    fail("a chave lida nao e anon local (tem ref de projeto hospedado)");
}
const mapsKey = process.env.VITE_GOOGLE_MAPS_KEY ?? readEnvLocal("VITE_GOOGLE_MAPS_KEY");

console.log(`[homolog] Supabase local: ${LOCAL_URL} (status API_URL ${status.API_URL})`);
console.log(
  `[homolog] chave: tipo=${keyType} comprimento=${String(key).length} sha256=${abbrev(key)}…`,
);
console.log(
  mapsKey
    ? `[homolog] VITE_GOOGLE_MAPS_KEY: presente (tipo=${mapsKey.startsWith("AIza") ? "AIza*" : "outro"} sha256=${abbrev(mapsKey)}…)`
    : "[homolog] AVISO: VITE_GOOGLE_MAPS_KEY ausente - teste de mapa fica pendente",
);

// 3) bundle local (Vite le .env.local, mas variaveis de processo tem precedencia)
rmSync(DIST, { recursive: true, force: true });
const env = {
  ...process.env,
  VITE_SUPABASE_URL: LOCAL_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: String(key),
};
if (mapsKey) env.VITE_GOOGLE_MAPS_KEY = mapsKey;
const build = spawnSync(
  "cmd",
  ["/c", "npx vite build --config vite.mobile.config.ts --outDir dist-homolog"],
  { cwd: ROOT, env, stdio: "inherit" },
);
if (build.status !== 0) fail(`vite build saiu com ${build.status}`);
cpSync(join(DIST, "mobile", "index.html"), join(DIST, "index.html"));

// 4) verificacoes do bundle ANTES de copiar para a variante
const assetsDir = join(DIST, "assets");
const bundles = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
const main = bundles
  .map((f) => ({ f, size: readFileSync(join(assetsDir, f)).length }))
  .sort((a, b) => b.size - a.size)[0];
const js = readFileSync(join(assetsDir, main.f), "utf8");
const expectedHost = LOCAL_URL.replace(/^http:\/\//, "");
if (!js.includes(expectedHost)) fail(`bundle nao contem ${expectedHost}`);
const hosted = js.match(HOSTED_SUPABASE_RE);
if (hosted) fail(`bundle contem host Supabase hospedado: ${hosted[0]}`);
// chave secreta nova (sb_secret_) ou JWT com role service_role: proibidos. A palavra
// "service_role" solta aparece em texto de UI e nao e segredo.
if (/sb_secret_[A-Za-z0-9_-]{6,}/.test(js)) fail("bundle contem chave sb_secret_");
for (const m of js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
  const p = JSON.parse(Buffer.from(m.split(".")[1], "base64url").toString("utf8"));
  if (p.role === "service_role") fail("bundle contem JWT service_role");
  if (p.role !== "anon" || p.ref) fail("bundle contem JWT que nao e anon local");
}
if (/BackgroundGeolocation"\)|@capacitor-community\/background-geolocation/.test(js))
  fail("bundle contem implementacao de background geolocation");

// 5) plugins e config: allowlist a partir dos arquivos de producao (sem valores arbitrarios)
const pluginsPath = join(MAIN_ASSETS, "capacitor.plugins.json");
if (!existsSync(pluginsPath))
  fail(
    "android/app/src/main/assets/capacitor.plugins.json ausente (rode `npx cap sync android` para producao antes)",
  );
const plugins = JSON.parse(readFileSync(pluginsPath, "utf8"));
const pkgs = plugins.map((p) => p.pkg).sort();
if (JSON.stringify(pkgs) !== JSON.stringify([...EXPECTED_PLUGINS].sort()))
  fail(`plugins diferentes dos seis homologados: ${pkgs.join(", ")}`);
const prodConfig = JSON.parse(readFileSync(join(MAIN_ASSETS, "capacitor.config.json"), "utf8"));
if (prodConfig.server?.url) fail("capacitor.config.json de producao contem server.url");
const homologConfig = {
  appId: "com.steelgo.app.homolog",
  appName: "SteelGo HOMOLOG",
  webDir: "public",
  bundledWebRuntime: prodConfig.bundledWebRuntime === true,
  android: { allowMixedContent: true },
};
if (homologConfig.server) fail("config homolog nao pode ter server");

// 6) escrita SOMENTE em android/app/src/homolog/assets (ignorado)
rmSync(HOMOLOG_ASSETS, { recursive: true, force: true });
mkdirSync(join(HOMOLOG_ASSETS, "public"), { recursive: true });
cpSync(DIST, join(HOMOLOG_ASSETS, "public"), { recursive: true });
writeFileSync(join(HOMOLOG_ASSETS, "capacitor.plugins.json"), readFileSync(pluginsPath));
writeFileSync(
  join(HOMOLOG_ASSETS, "capacitor.config.json"),
  JSON.stringify(homologConfig, null, "\t") + "\n",
);

const bundleSha = createHash("sha256")
  .update(readFileSync(join(assetsDir, main.f)))
  .digest("hex");
console.log(`[homolog] bundle principal: ${main.f} (${main.size} bytes) sha256=${bundleSha}`);
console.log(`[homolog] plugins (${pkgs.length}): ${pkgs.join(", ")}`);
console.log(
  `[homolog] hosts *.supabase.co no bundle: 0; ocorrencias de ${expectedHost}: ${js.split(expectedHost).length - 1}`,
);
console.log(
  `[homolog] assets gravados em android/app/src/homolog/assets (public + capacitor.config.json + capacitor.plugins.json)`,
);

function readEnvLocal(name) {
  try {
    const line = readFileSync(join(ROOT, ".env.local"), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(name + "="));
    return line
      ? line
          .slice(name.length + 1)
          .trim()
          .replace(/^["']|["']$/g, "")
      : undefined;
  } catch {
    return undefined;
  }
}
