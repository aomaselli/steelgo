/**
 * Barreira de ambiente do fluxo de documentos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA BARREIRA EXISTE
 *
 * O fluxo de consentimento e envio está ligado a um destino SINTÉTICO. O risco
 * não é alguém decidir apontá-lo para produção — é ele apontar sozinho, porque
 * `SUPABASE_URL` é variável de ambiente e o mesmo código roda em todo lugar.
 * Um preview publicado com as variáveis de produção já seria um caminho até a
 * base real, sem ninguém ter decidido nada.
 *
 * Duas barreiras, pela mesma razão de sempre: cada uma é frágil de um jeito
 * diferente.
 *
 *  - a PRIMEIRA é declarativa: `DOCUMENTOS_FLUXO_MODO` precisa dizer
 *    `demonstracao`. Pega o caso de deixar a variável de fora por engano, que
 *    é o caso real;
 *  - a SEGUNDA é o DESTINO: o endereço precisa ser laço local. Pega o caso de
 *    alguém declarar `demonstracao` e apontar para uma base hospedada —
 *    inclusive por copiar um `.env` inteiro.
 *
 * A segunda é a que importa quando a primeira mente.
 */

/** Único valor aceito enquanto não houver fornecedor real homologado. */
export const MODO_EXIGIDO = "demonstracao";

export type MotivoDeRecusaDeAmbiente =
  | "RUNTIME_DE_PRODUCAO"
  | "MODO_AUSENTE_OU_INVALIDO"
  | "DESTINO_AUSENTE"
  | "DESTINO_NAO_E_LOCAL"
  | "DESTINO_HOSPEDADO";

export class AmbienteNaoSinteticoError extends Error {
  readonly motivo: MotivoDeRecusaDeAmbiente;
  constructor(motivo: MotivoDeRecusaDeAmbiente, detalhe: string) {
    super(
      `Fluxo de documentos recusou iniciar (${motivo}): ${detalhe} ` +
        `Enquanto nao houver fornecedor real homologado, este fluxo so roda ` +
        `contra destino sintetico local.`,
    );
    this.name = "AmbienteNaoSinteticoError";
    this.motivo = motivo;
  }
}

/**
 * Nomes que contam como laço local.
 *
 * Lista fechada e curta de propósito. `0.0.0.0` não entra: é endereço de
 * escuta, não de destino, e aceitar o que parece local sem ser é justamente o
 * buraco que esta função fecha.
 */
const HOSPEDEIROS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Sufixos que denunciam base hospedada, mesmo que alguém jure que é teste. */
const SUFIXOS_HOSPEDADOS = [".supabase.co", ".supabase.in", ".supabase.net"];

export interface AmbienteDoFluxo {
  destino: string;
  modo: string;
}

function ehRuntimeDeProducao(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * Confere o ambiente e devolve o que foi aceito. Lança quando algo não bate.
 *
 * Devolve o destino em vez de apenas aprovar para que quem chama registre
 * contra o que rodou, sem reler a variável e sem poder registrar outra coisa.
 */
export function conferirAmbienteSintetico(
  env: Record<string, string | undefined>,
): AmbienteDoFluxo {
  // 1. Runtime. Vem antes de tudo: num runtime de produção nenhuma declaração
  //    de modo deveria bastar.
  if (ehRuntimeDeProducao(env)) {
    throw new AmbienteNaoSinteticoError(
      "RUNTIME_DE_PRODUCAO",
      "o processo esta em runtime de producao.",
    );
  }

  // 2. Declaração explícita. Ausência não é permissão.
  const modo = (env.DOCUMENTOS_FLUXO_MODO ?? "").trim().toLowerCase();
  if (modo !== MODO_EXIGIDO) {
    throw new AmbienteNaoSinteticoError(
      "MODO_AUSENTE_OU_INVALIDO",
      `DOCUMENTOS_FLUXO_MODO=${modo || "(ausente)"}; exigido "${MODO_EXIGIDO}".`,
    );
  }

  // 3. Destino. É aqui que a barreira pega quem declarou o modo e apontou para
  //    outro lugar.
  const bruto = (env.SUPABASE_URL ?? "").trim();
  if (!bruto) {
    throw new AmbienteNaoSinteticoError("DESTINO_AUSENTE", "SUPABASE_URL ausente.");
  }

  let hospedeiro: string;
  try {
    hospedeiro = new URL(bruto).hostname.toLowerCase();
  } catch {
    throw new AmbienteNaoSinteticoError(
      "DESTINO_NAO_E_LOCAL",
      "SUPABASE_URL nao e um endereco valido.",
    );
  }

  for (const sufixo of SUFIXOS_HOSPEDADOS) {
    if (hospedeiro.endsWith(sufixo)) {
      throw new AmbienteNaoSinteticoError(
        "DESTINO_HOSPEDADO",
        `o destino "${hospedeiro}" e uma base hospedada.`,
      );
    }
  }

  if (!HOSPEDEIROS_LOCAIS.has(hospedeiro)) {
    throw new AmbienteNaoSinteticoError(
      "DESTINO_NAO_E_LOCAL",
      `o destino "${hospedeiro}" nao e laco local.`,
    );
  }

  return { destino: bruto, modo };
}

/**
 * Rótulo de estado, para a tela e para a trilha de quem lê o resultado.
 *
 * Fica aqui, e não na tela, porque a tela é o lugar mais fácil de esquecer de
 * atualizar quando o estado mudar.
 */
export const ESTADO_DE_DEMONSTRACAO = {
  modo: MODO_EXIGIDO,
  /** O que este fluxo FAZ hoje. */
  faz: "coleta consentida de documento sintetico em destino local",
  /** O que ele explicitamente NÃO faz, e não deve parecer fazer. */
  naoFaz: [
    "nao consulta base oficial",
    "nao emite autorizacao de GCC",
    "nao aprova cadastro",
    "nao libera viagem",
  ],
} as const;
