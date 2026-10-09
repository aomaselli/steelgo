// Destination resolution for every link on the homepage.
// Existing MVP routes (verified in aomaselli/steelgo src/routes) use the router <Link>.
// Public information pages are integrated using the approved prototype.
// Unknown destinations remain pending and are never presented as implemented tools.

export const EXISTING_ROUTES: Record<string, string> = {
  "": "/",
  login: "/login",
  register: "/register",
  "forgot-password": "/forgot-password",
  termos: "/terms",
  privacidade: "/privacy",
  cookies: "/cookies",
};

export const PUBLIC_PAGE_PATHS = ["contato", "contato/comercial", "esg", "esg/calculadora", "esg/eficiencia", "esg/indicadores", "esg/steelgo-green", "industrias", "industrias/distribuidores", "industrias/industria", "industrias/siderurgicas", "industrias/varejo", "recursos", "recursos/guias", "recursos/integracoes", "sobre", "sobre/pilares", "sobre/visao", "solucoes", "solucoes/control-tower", "solucoes/managed-logistics", "solucoes/steelgo-network", "solucoes/steelgo-pay", "solucoes/steelgo-platform", "suporte", "suporte/ajuda", "suporte/canais", "tecnologia", "tecnologia/ai-orchestration-engine", "tecnologia/compliance-suite", "tecnologia/driver-app", "tecnologia/open-api-ecosystem", "tecnologia/steel-cargo-passport", "transportadoras", "transportadoras/homologacao", "transportadoras/viagens"] as const;

export type Destination = { href: string; pending: boolean };

/** `path` is the prototype key (e.g. "solucoes/steelgo-pay", "login", "termos"). */
export function destination(path: string): Destination {
  if ((PUBLIC_PAGE_PATHS as readonly string[]).includes(path)) return { href: "/" + path, pending: false };
  if (path in EXISTING_ROUTES) return { href: EXISTING_ROUTES[path], pending: false };
  return { href: "/" + path, pending: true };
}

/**
 * Set VITE_HOME_HIDE_PENDING_LINKS=true to hide menu items / cards whose
 * destination does not exist yet (recommended for a production build until
 * the inner pages are implemented). Local review keeps them visible.
 */
export const HIDE_PENDING: boolean = import.meta.env.VITE_HOME_HIDE_PENDING_LINKS === "true";

export const WHATSAPP_URL = "https://wa.me/5511984339109";

// Official store listings — replace with the published IDs (pending).
export const STORE = {
  iosAppId: "", // e.g. "1234567890" → https://apps.apple.com/{cc}/app/steelgo-driver/id{iosAppId}
  androidPackage: "", // e.g. "br.com.steelgo.driver"
};
