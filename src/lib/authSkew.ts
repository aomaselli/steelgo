// Defasagem de relogio entre o emissor do JWT e o PostgREST: a primeira leitura
// autenticada logo apos o login pode voltar 401 com "JWT issued at future" ate
// o relogio do servidor alcancar o `iat` do token. Observado em producao em
// 2026-09-22 (2 de 3 logins), com recuperacao espontanea em 1-7 s.
//
// Tratamento LIMITADO e explicito:
//   * so este erro e retentado (qualquer outro 401 continua sendo erro real);
//   * no maximo MAX_TENTATIVAS_SKEW retentativas, com espera curta e crescente;
//   * esgotadas as tentativas, o erro sobe normalmente para a UI.
// Nao mascara falha de permissao, RLS, credencial ou rede.

export const MAX_TENTATIVAS_SKEW = 3;

const PADROES = [/jwt issued at future/i, /issued in the future/i, /token used before issued/i];

function textoDoErro(erro: unknown): string {
  if (!erro) return "";
  if (typeof erro === "string") return erro;
  if (erro instanceof Error) return `${erro.message}`;
  if (typeof erro === "object") {
    const e = erro as { message?: unknown; error_description?: unknown; hint?: unknown };
    return [e.message, e.error_description, e.hint].filter((v) => typeof v === "string").join(" ");
  }
  return "";
}

/** true apenas para o 401 transitorio de relogio adiantado. */
export function isClockSkewAuthError(erro: unknown): boolean {
  const texto = textoDoErro(erro);
  if (!texto) return false;
  return PADROES.some((p) => p.test(texto));
}

/** Espera antes da proxima tentativa: 600 ms, 1,8 s, 4 s. 0 = nao retentar mais. */
export function skewRetryDelayMs(tentativaJaFeita: number): number {
  const escala = [600, 1_800, 4_000];
  if (tentativaJaFeita < 0 || tentativaJaFeita >= MAX_TENTATIVAS_SKEW) return 0;
  return escala[tentativaJaFeita] ?? 0;
}

/** Decide se vale nova tentativa para este erro/ordem de tentativa. */
export function shouldRetryAuthError(erro: unknown, tentativaJaFeita: number): boolean {
  return isClockSkewAuthError(erro) && skewRetryDelayMs(tentativaJaFeita) > 0;
}
