/**
 * DatavalidProvider — validação de identidade (SERPRO Datavalid V5).
 *
 * Pré-requisitos regulatórios confirmados:
 *   - Datavalid V5 exige credenciamento SENATRAN;
 *   - a SteelGo contrata o SERPRO;
 *   - antes de CADA requisição, uma autorização precisa ser obtida da GCC.
 *
 * O provider recebe `authorizationRef` já resolvido pelo Service. O bearer do
 * SERPRO é obtido por requisição e descartado — nunca persistido, nunca logado.
 * A resposta bruta NUNCA sai desta classe.
 */

import type {
  FieldMatch,
  IdentityValidationResult,
  MatchConfidence,
  ProviderFailure,
  ProviderOutcome,
} from "../types";

export interface DatavalidIdentityRequest {
  /** Identificador interno do motorista. Nunca CPF. */
  subjectRef: string;
  /** Referência opaca da GCC. Não é o token. */
  authorizationRef: string;
}

export interface DatavalidProvider {
  readonly name: "datavalid";
  validateIdentity(
    input: DatavalidIdentityRequest,
  ): Promise<ProviderOutcome<IdentityValidationResult>>;
}

// ─────────────────────────────── FAKE ────────────────────────────────────

export type FakeDatavalidScenario =
  | "match_high"
  | "match_medium"
  | "field_mismatch"
  | "no_match"
  | "low_confidence"
  | "unavailable"
  | "timeout"
  | "unauthorized";

export class FakeDatavalidProvider implements DatavalidProvider {
  readonly name = "datavalid" as const;

  private readonly scenario: FakeDatavalidScenario;

  constructor(scenario: FakeDatavalidScenario = "match_high") {
    this.scenario = scenario;
  }

  async validateIdentity(
    input: DatavalidIdentityRequest,
  ): Promise<ProviderOutcome<IdentityValidationResult>> {
    const failures: Partial<Record<FakeDatavalidScenario, ProviderFailure>> = {
      unavailable: { kind: "unavailable", resultCode: "DATAVALID_UNAVAILABLE", retryable: true },
      timeout: { kind: "timeout", resultCode: "DATAVALID_TIMEOUT", retryable: true },
      unauthorized: { kind: "unauthorized", resultCode: "DATAVALID_UNAUTHORIZED", retryable: false },
    };
    const failure = failures[this.scenario];
    if (failure) return { ok: false, failure };

    const providerReference = `fake-datavalid-${input.subjectRef.slice(0, 8)}`;
    const allMatch: Record<string, FieldMatch> = {
      full_name: "match",
      birth_date: "match",
      mother_name: "match",
      license_number: "match",
    };

    const build = (
      matched: boolean,
      confidence: MatchConfidence,
      fields: Record<string, FieldMatch>,
      resultCode: string,
    ): ProviderOutcome<IdentityValidationResult> => ({
      ok: true,
      value: { matched, confidence, fields, providerReference, resultCode },
    });

    switch (this.scenario) {
      case "match_medium":
        return build(true, "medium", { ...allMatch, mother_name: "unavailable" }, "DATAVALID_PARTIAL");
      case "low_confidence":
        return build(true, "low", { ...allMatch, birth_date: "unavailable", mother_name: "unavailable" }, "DATAVALID_LOW_CONFIDENCE");
      case "field_mismatch":
        return build(true, "high", { ...allMatch, birth_date: "mismatch" }, "DATAVALID_FIELD_MISMATCH");
      case "no_match":
        return build(false, "high", { ...allMatch, full_name: "mismatch", birth_date: "mismatch" }, "DATAVALID_NO_MATCH");
      default:
        return build(true, "high", allMatch, "DATAVALID_MATCH");
    }
  }
}

// ────────────────────────── SERPRO (ESTRUTURA) ───────────────────────────

export interface DatavalidSerproConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Template de comparação contratado junto ao SERPRO. */
  rfbTemplateId: string;
  timeoutMs: number;
}

/**
 * Estrutura pronta para a integração real. NÃO habilitada.
 *
 * O que já está resolvido aqui: leitura de configuração server-side, timeout
 * com AbortController, e a normalização de status HTTP para códigos internos.
 * O que falta é exatamente o que depende de documentação e credenciais
 * oficiais — marcado com TODO.
 */
export class DatavalidSerproProvider implements DatavalidProvider {
  readonly name = "datavalid" as const;

  private readonly config: DatavalidSerproConfig;

  constructor(config: DatavalidSerproConfig) {
    this.config = config;
  }

  /** Normaliza status HTTP para falha interna. Sem corpo de resposta. */
  static normalizeHttpStatus(status: number): ProviderFailure {
    if (status === 401) return { kind: "unauthorized", resultCode: "DATAVALID_HTTP_401", retryable: false };
    if (status === 403) return { kind: "forbidden", resultCode: "DATAVALID_HTTP_403", retryable: false };
    if (status === 422) return { kind: "invalid_request", resultCode: "DATAVALID_HTTP_422", retryable: false };
    if (status === 429) return { kind: "rate_limited", resultCode: "DATAVALID_HTTP_429", retryable: true };
    if (status >= 500) return { kind: "unavailable", resultCode: `DATAVALID_HTTP_${status}`, retryable: true };
    return { kind: "unknown", resultCode: `DATAVALID_HTTP_${status}`, retryable: false };
  }

  async validateIdentity(
    _input: DatavalidIdentityRequest,
  ): Promise<ProviderOutcome<IdentityValidationResult>> {
    // Guarda-trilho: enquanto a integração real não estiver homologada, esta
    // classe recusa explicitamente em vez de simular sucesso silencioso.
    return {
      ok: false,
      failure: {
        kind: "unavailable",
        resultCode: "DATAVALID_NOT_IMPLEMENTED",
        retryable: true,
      },
    };

    /*
     * TODO(DATAVALID-REAL): habilitar após contrato SERPRO + credenciamento
     * SENATRAN + GCC contratada. Passos, na ordem:
     *
     * 1. Obter bearer no endpoint de autenticação do SERPRO usando
     *    config.clientId / config.clientSecret. Manter em variável local,
     *    NUNCA em banco, cache compartilhado, log ou retorno.
     *
     * 2. Montar a requisição de comparação com config.rfbTemplateId.
     *    O formato exato do corpo vem da documentação oficial do Datavalid V5
     *    — NÃO inventar payload aqui.
     *    A autorização da GCC (_input.authorizationRef) acompanha a chamada
     *    conforme o contrato da GCC.
     *
     * 3. Timeout estrutural, já resolvido:
     *      const ac = new AbortController();
     *      const t = setTimeout(() => ac.abort(), this.config.timeoutMs);
     *      try { await fetch(url, { signal: ac.signal, ... }) }
     *      catch (e) { if (e.name === "AbortError")
     *        return { ok:false, failure:{ kind:"timeout",
     *          resultCode:"DATAVALID_TIMEOUT", retryable:true } }; }
     *      finally { clearTimeout(t); }
     *
     * 4. Erro HTTP: usar DatavalidSerproProvider.normalizeHttpStatus(res.status).
     *
     * 5. Sucesso: traduzir a resposta para IdentityValidationResult AQUI
     *    DENTRO. Só sai desta classe: matched, confidence, fields (veredito
     *    por campo, sem valores), providerReference e resultCode interno.
     *    O corpo bruto do SERPRO não é retornado, não é logado e não é
     *    persistido em nenhuma hipótese.
     */
  }
}
