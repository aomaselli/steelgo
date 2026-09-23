// Testes estruturais do pacote de experiencia: garantem que as correcoes
// continuam ligadas nas telas (e nao apenas disponiveis em modulos puros).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const ler = (rel: string) => readFileSync(join(raiz, rel), "utf8");

describe("mapa do motorista", () => {
  const src = ler("pages/driver/DriverMap.tsx");
  it("o container do mapa nao depende de status ready (causa do mapa que nunca aparecia)", () => {
    // antes: <div ref={ref}> so existia no return final, alcancado apenas apos
    // setStatus("ready") — que por sua vez exigia o container. Impasse.
    expect(src).toMatch(/const mostrarContainer = status !== "no-key"/);
    expect(src).toMatch(/\{mostrarContainer && <div ref=\{ref\}/);
  });
  it("nao ha mais mapa decorativo falso (caminhao/rota inventados)", () => {
    expect(src).not.toMatch(/TruckIcon/);
    expect(src).not.toMatch(/strokeDasharray="8 6"/);
    expect(src).not.toMatch(/Mapa indisponível|Mapa não configurado/);
  });
  it("os estados vem do modulo testado e o texto e traduzido", () => {
    expect(src).toMatch(/driverMapState\(\{ status, driver, origin, dest \}\)/);
    for (const chave of [
      "driverMap.loading",
      "driverMap.unavailableNoKey",
      "driverMap.unavailableOffline",
      "driverMap.noCoordinates",
      "driverMap.awaitingPosition",
    ]) {
      expect(src).toContain(chave);
    }
  });
});

describe("portao de onboarding", () => {
  it("cobre toda a arvore da transportadora (uma so aplicacao, no topo)", () => {
    const src = ler("routes/carrier.tsx");
    expect(src).toContain("<OnboardingGate>");
    expect(src).toContain("</OnboardingGate>");
    // o portao envolve o shell inteiro, nao apenas uma pagina
    expect(src.indexOf("<OnboardingGate>")).toBeLessThan(src.indexOf("<AppShell"));
  });
  it("nao toca a arvore do embarcador (fora do achado aprovado)", () => {
    expect(ler("routes/shipper.tsx")).not.toContain("OnboardingGate");
  });
  it("usa a decisao pura, sem duplicar regra na UI", () => {
    const src = ler("components/shell/OnboardingGate.tsx");
    expect(src).toContain('from "@/lib/onboardingGate"');
    expect(src).toMatch(/onboardingRedirect\(\{/);
  });
});

describe("navegacao lateral", () => {
  const src = ler("components/shell/Sidebar.tsx");
  it("transportadora enxerga propostas, viagens, contratos, recebiveis e disputas", () => {
    for (const rota of [
      "/carrier",
      "/carrier/marketplace",
      "/carrier/bids",
      "/carrier/trips",
      "/carrier/contracts",
      "/carrier/payments",
      "/carrier/payouts",
      "/carrier/disputes",
      "/carrier/settings",
    ]) {
      expect(src).toContain(`to: "${rota}"`);
    }
  });
  it("nenhuma rota aparece duas vezes no mesmo menu", () => {
    const blocos = src.split(/\n {2}(?=shipper|carrier|admin): \[/);
    for (const bloco of blocos.slice(1)) {
      const rotas = [...bloco.matchAll(/to: "([^"]+)"/g)].map((m) => m[1]);
      expect(rotas.length).toBe(new Set(rotas).size);
    }
  });
});

describe("idioma e orientacao", () => {
  it("Torre de Controle deixou de ser titulo fixo em ingles", () => {
    const src = ler("routes/admin.operations.index.tsx");
    expect(src).toContain('t("controlTower.title")');
    expect(src).not.toMatch(/>Control Tower</);
  });
  it("Marketplace tem titulo e orientacao", () => {
    const src = ler("pages/carrier/MarketplacePage.tsx");
    expect(src).toContain('t("marketplacePage.title")');
    expect(src).toContain('t("marketplacePage.subtitle")');
  });
  it("saudacoes usam o nome normalizado", () => {
    for (const rel of [
      "pages/carrier/CarrierDashboardPage.tsx",
      "pages/shipper/DashboardPage.tsx",
      "components/trip/MemberDashboard.tsx",
      "pages/driver/DriverHomePage.tsx",
    ]) {
      expect(ler(rel)).toContain("displayFirstName(");
    }
  });
});

describe("traducoes PT/EN/ES", () => {
  const i18n = ler("lib/i18n.tsx");
  const chaves = [
    "driverMap:",
    "driverHome:",
    "emptyNext:",
    "marketplacePage:",
    "onboardingGate:",
    "authNotice:",
    "controlTower:",
  ];
  it("cada grupo novo existe nos tres idiomas", () => {
    for (const chave of chaves) {
      const ocorrencias = i18n.split(`    ${chave}`).length - 1;
      expect(`${chave} ${ocorrencias}`).toBe(`${chave} 3`);
    }
  });
  it("rotulo de propostas na navegacao existe nos tres idiomas", () => {
    expect(i18n.split("        bids: ").length - 1).toBe(3);
  });
});

describe("defasagem de relogio no login", () => {
  const src = ler("contexts/AuthContext.tsx");
  it("retentativa limitada, so para esse erro, sem esconder os demais", () => {
    expect(src).toContain('from "@/lib/authSkew"');
    expect(src).toMatch(/shouldRetryAuthError\(r\.message, tentativa\)/);
    expect(src).toMatch(/bootstrap\.invalidate\(uid\)/);
    // o caminho de erro continua existindo para os demais casos
    expect(src).toMatch(/\[Auth\] bootstrap falhou/);
  });
  it("o timer da retentativa e cancelavel e e cancelado no logout e no unmount", () => {
    expect(src).toMatch(/const skewTimerRef = useRef/);
    expect(src).toMatch(/const cancelSkewRetry = \(\) => \{/);
    expect(src).toMatch(/clearTimeout\(skewTimerRef\.current\)/);
    // logout
    const signOut = src.slice(src.indexOf("const signOut = async"));
    expect(signOut.slice(0, 400)).toContain("cancelSkewRetry()");
    // unmount do listener de auth
    expect(src).toMatch(/subscription\.unsubscribe\(\);\s*\n\s*cancelSkewRetry\(\);/);
  });
});
