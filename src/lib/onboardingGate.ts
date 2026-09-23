// Portao de onboarding (P1): antes desta correcao o desvio para /onboarding
// acontecia apenas no pos-login. Quem digitasse /carrier/trips direto, ou
// apenas recarregasse a pagina, entrava no shell da empresa com o cadastro
// incompleto e via menus e botoes que dependem de dados que ainda nao existem.
//
// A autoridade sobre DADOS continua sendo o RLS no servidor; este portao e de
// navegacao: leva a pessoa ao unico passo que faz sentido enquanto o cadastro
// da empresa nao existe.

/** Somente a transportadora: o achado aprovado e o fluxo do embarcador nao foi auditado. */
export type PapelComPortao = "carrier";

export type EstadoOnboarding = {
  /** papel resolvido do usuario autenticado */
  role: string | null;
  /** profiles.is_onboarded */
  isOnboarded: boolean | null | undefined;
  /** empresas que o usuario possui/participa (AuthContext.companies) */
  companies: unknown[];
  /** rota atual */
  pathname: string;
};

/** Rotas que continuam acessiveis com cadastro incompleto. */
// Liberadas: a propria conclusao do cadastro, autenticacao e saida.
const LIBERADAS = [
  "/onboarding",
  "/login",
  "/logout",
  "/register",
  "/forgot-password",
  "/reset-password",
];

function liberada(pathname: string): boolean {
  return LIBERADAS.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/**
 * Devolve "/onboarding" quando a rota atual exige cadastro concluido, ou null
 * quando pode seguir. Sem empresa E sem onboarding concluido = incompleto;
 * quem ja tem empresa passa mesmo com a flag antiga desmarcada (bases legadas).
 */
export function onboardingRedirect(estado: EstadoOnboarding): "/onboarding" | null {
  const { role, isOnboarded, companies, pathname } = estado;
  if (role !== "carrier") return null; // embarcador e admin ficam fora deste portao
  if (liberada(pathname)) return null;
  const temEmpresa = Array.isArray(companies) && companies.length > 0;
  if (temEmpresa) return null;
  if (isOnboarded === true) return null;
  return "/onboarding";
}

/** Cadastro da empresa pendente (usado para avisos na propria tela). */
export function cadastroIncompleto(estado: Omit<EstadoOnboarding, "pathname">): boolean {
  return onboardingRedirect({ ...estado, pathname: "/" }) !== null;
}
