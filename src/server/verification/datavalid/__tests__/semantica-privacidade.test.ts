/**
 * Semântica dos retornos do Datavalid V5 e separação das credenciais.
 *
 * Sem rede, sem banco, sem documento real. Todos os valores são os do exemplo
 * oficial da documentação, ou sintéticos.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  avaliarSimilaridade,
  compararCampo,
  comporVereditos,
  exigirCampo,
  lerImpedimento,
  lerQrCode,
  sondarSituacao,
  type FieldComparison,
  type FieldVerdict,
} from "../semantics";
import {
  assertSemToken,
  chaveDeIdempotencia,
  classificarFase,
  decidirRetry,
  evidenciaDeProcessamento,
  montarPrivacidade,
  privacidadeParaLog,
  TokenDeOutraOperacaoError,
  TokenEmLogError,
  type GccAuthorizationToken,
  type RfbTemplateRef,
} from "../privacy";
import { avaliarHabilitacao, decideDriverVerification } from "../../rules";
import type { DriverStatusResult, IdentityValidationResult } from "../../types";

// ════════════ 1. o caso do exemplo oficial: possui_impedimento ═════════════

test("possui_impedimento=true enviado E confirmado significa HÁ impedimento", () => {
  // É o exemplo literal da documentação: a requisição envia `true` e a
  // resposta devolve `true`. Ler isso como aprovação é exatamente ao contrário.
  const doExemploOficial: FieldComparison<boolean> = { sent: true, matches: true };
  assert.equal(lerImpedimento(doExemploOficial), "com_impedimento");
});

test("possui_impedimento: as quatro leituras possíveis", () => {
  assert.equal(lerImpedimento({ sent: true, matches: true }), "com_impedimento");
  assert.equal(lerImpedimento({ sent: false, matches: true }), "sem_impedimento");
  // A base não confirma o que declaramos, e não diz qual é a verdade.
  assert.equal(lerImpedimento({ sent: true, matches: false }), "inconclusivo");
  assert.equal(lerImpedimento({ sent: false, matches: false }), "inconclusivo");
  assert.equal(lerImpedimento(null), "inconclusivo");
});

const identidadeBoa: IdentityValidationResult = {
  matched: true,
  confidence: "high",
  fields: { nome: "match" },
  providerReference: "ref",
  resultCode: "ok",
};

function statusCom(parcial: Partial<DriverStatusResult>): DriverStatusResult {
  return {
    licenseValid: true,
    licenseExpiresAt: "2030-01-01",
    category: "E",
    restrictions: [],
    hasImpediment: false,
    providerReference: "ref",
    resultCode: "ok",
    ...parcial,
  };
}

const entradaBase = {
  now: new Date("2026-10-09T12:00:00.000Z"),
  licenseNumber: "12345678901",
  licenseExpiry: "2030-01-01",
  consentGranted: true,
  identity: identidadeBoa,
  drivingLicenseSourceConfigured: true,
};

test("motor: impedimento confirmado IMPEDE a aprovação", () => {
  const bloco = avaliarHabilitacao({
    ...entradaBase,
    driverStatus: statusCom({ hasImpediment: true }),
  });
  assert.equal(bloco.status, "rejected");
  assert.equal(bloco.reasonCode, "LICENSE_IMPEDIMENT");

  const r = decideDriverVerification({
    ...entradaBase,
    driverStatus: statusCom({ hasImpediment: true }),
  });
  assert.notEqual(r.decision, "approved");
  assert.equal(r.decision, "rejected");
  assert.equal(r.reasonCode, "LICENSE_IMPEDIMENT");
});

test("motor: impedimento inconclusivo também não aprova", () => {
  const r = decideDriverVerification({
    ...entradaBase,
    driverStatus: statusCom({ hasImpediment: null }),
  });
  assert.notEqual(r.decision, "approved");
  assert.equal(r.reasonCode, "LICENSE_STATUS_UNCONFIRMED");
});

test("motor: sem impedimento e com tudo mais em ordem, aprova", () => {
  const r = decideDriverVerification({
    ...entradaBase,
    driverStatus: statusCom({ hasImpediment: false }),
  });
  assert.equal(r.decision, "approved");
});

// ═══════ 2. valor enviado, comparação, extração e probabilístico ═══════════

test("comparação exige o valor enviado junto — não há booleano solto", () => {
  // O tipo não permite construir uma comparação sem `sent`; o teste registra a
  // intenção para quem for mexer no tipo depois.
  const c: FieldComparison<string> = { sent: "REGULAR", matches: true };
  assert.equal(compararCampo(c), "satisfied");
  assert.equal(compararCampo({ sent: "REGULAR", matches: false }), "refuted");
  assert.equal(compararCampo(null), "inconclusive");
});

test("sondagem de situação: confirmar a hipótese satisfaz; refutar é inconclusivo", () => {
  // Refutar só diz que a situação é OUTRA, não qual. Nunca vira reprovação.
  assert.equal(sondarSituacao({ sent: "EMITIDA", matches: true }, "EMITIDA"), "satisfied");
  assert.equal(sondarSituacao({ sent: "EMITIDA", matches: false }, "EMITIDA"), "inconclusive");
  // Sondou outra coisa que não a desejada: não serve.
  assert.equal(sondarSituacao({ sent: "CASSADA", matches: true }, "EMITIDA"), "inconclusive");
  assert.equal(sondarSituacao(null, "EMITIDA"), "inconclusive");
});

test("extração do QR Code devolve valor, e NÃO prova ausência de restrição posterior", () => {
  const leitura = lerQrCode({
    categoria: { decoded: "E" },
    dataValidade: { decoded: "2030-01-01" },
    numeroRegistro: { decoded: "00000000" },
  });
  assert.equal(leitura.categoria, "E");
  assert.equal(leitura.dataValidade, "2030-01-01");
  // O campo é literal `false`: o QR Code carrega o que está no documento, e
  // uma suspensão posterior à emissão não está lá.
  assert.equal(leitura.provaAusenciaDeRestricaoPosterior, false);
});

test("extração ausente vira null, não um valor inventado", () => {
  const leitura = lerQrCode({});
  assert.equal(leitura.categoria, null);
  assert.equal(leitura.dataValidade, null);
});

test("similaridade exige limiar explícito; sem valor é inconclusivo", () => {
  assert.equal(avaliarSimilaridade({ similarity: 1, probability: null }, 0.9), "satisfied");
  assert.equal(avaliarSimilaridade({ similarity: 0.5, probability: null }, 0.9), "refuted");
  assert.equal(avaliarSimilaridade({ similarity: null, probability: "ALTA" }, 0.9), "inconclusive");
  assert.equal(avaliarSimilaridade(null, 0.9), "inconclusive");
});

// ═══════════ 3. omissão, negativa e inconclusivo nunca satisfazem ══════════

test("campo obrigatório omitido não satisfaz", () => {
  assert.equal(exigirCampo(undefined, "cnh.situacao"), null);
  assert.equal(exigirCampo(null, "cnh.situacao"), null);
  assert.equal(exigirCampo(false, "cnh.possui_impedimento"), false);
  assert.equal(exigirCampo(0, "x"), 0);
});

test("composição: nenhum caminho leva de inconclusivo ou refutado a satisfeito", () => {
  const estados: FieldVerdict[] = ["satisfied", "refuted", "inconclusive"];
  for (const a of estados) {
    for (const b of estados) {
      const r = comporVereditos([a, b]);
      assert.equal(
        r === "satisfied",
        a === "satisfied" && b === "satisfied",
        `${a} + ${b} produziu ${r}`,
      );
      if (a === "refuted" || b === "refuted") assert.equal(r, "refuted");
    }
  }
  assert.equal(comporVereditos([]), "inconclusive");
});

// ═══════════════ 4. id_template e token GCC, separados ═════════════════════

const template: RfbTemplateRef = {
  idTemplate: "6a0b47bcc4af527c3b13681d",
  finalidade: "validacao_identidade_motorista",
};

function tokenDe(operationId: string): GccAuthorizationToken {
  return { token: `hash-gcc-sintetico-${operationId}`, operationId, cnpjAnuente: "37115342004154" };
}

test("privacidade: id_template e token GCC vão em campos distintos", () => {
  const op = "op-1";
  const p = montarPrivacidade(template, tokenDe(op), op);
  assert.equal(p.rfb.id_template, template.idTemplate);
  assert.equal(p.senatran.token, "hash-gcc-sintetico-op-1");
  assert.equal(p.senatran.cnpj_anuente, "37115342004154");
});

test("privacidade: token de OUTRA operação é recusado", () => {
  // "Cada token emitido pela GCC é vinculado a uma operação específica."
  assert.throws(
    () => montarPrivacidade(template, tokenDe("op-1"), "op-2"),
    TokenDeOutraOperacaoError,
  );
});

test("fase 1 — falha comprovadamente ANTES do envio: repete, com token novo", () => {
  // Nada saiu, então não há duplicidade possível do outro lado.
  for (const httpStatus of [null, 0 as number | null]) {
    const d = decidirRetry({ httpStatus, possivelmenteEnviado: false });
    assert.equal(d.retry, true);
    assert.equal(d.retry && d.requiresNewGccToken, true);
    assert.equal(d.reason, "NAO_ENVIADO");
  }
  assert.equal(classificarFase({ httpStatus: null, possivelmenteEnviado: false }), "nao_enviado");
});

test("fase 2 — recusa explícita do fornecedor: NÃO repete, em nenhum status", () => {
  // Inclui o 429. A versão anterior o repetia dizendo que "não foi
  // processado" — presunção sem documento, para um status que a referência da
  // API sequer lista entre as respostas deste endpoint.
  for (const httpStatus of [400, 401, 403, 404, 413, 422, 429]) {
    const d = decidirRetry({ httpStatus, possivelmenteEnviado: true });
    assert.equal(d.retry, false, `status ${httpStatus} não deveria repetir sozinho`);
    assert.equal(d.reason, "RECUSA_DEFINITIVA");
  }
});

test("só o 422 tem evidência documentada de não processamento", () => {
  // "A requisição não pode ser processada" — é o único que afirma isso.
  const e422 = evidenciaDeProcessamento({ httpStatus: 422, possivelmenteEnviado: true });
  assert.equal(e422.processado, "nao_processado");
  assert.equal(
    e422.processado === "nao_processado" && /não pode ser processada/.test(e422.fonte),
    true,
    "a evidência precisa citar a fonte",
  );

  // Todo o resto é desconhecido — inclusive os que "parecem óbvios".
  for (const httpStatus of [400, 401, 403, 404, 413, 429, 500, 502, 503, null]) {
    const e = evidenciaDeProcessamento({ httpStatus, possivelmenteEnviado: true });
    assert.equal(
      e.processado,
      "desconhecido",
      `HTTP ${httpStatus} não tem evidência documentada e não pode ser afirmado`,
    );
  }
});

test("não ter saído é a única afirmação de não processamento que fazemos sozinhos", () => {
  const e = evidenciaDeProcessamento({ httpStatus: null, possivelmenteEnviado: false });
  assert.equal(e.processado, "nao_processado");
  assert.equal(
    e.processado === "nao_processado" && /nosso lado/.test(e.fonte),
    true,
    "a fonte precisa deixar claro que a constatação é nossa, não do fornecedor",
  );
});

test("fase 3 — timeout ou conexão interrompida após possível envio: NÃO repete sozinho", () => {
  // O caso que mais importa. Token novo não resolve duplicidade externa: são
  // problemas diferentes, e o endpoint não documenta reconciliação.
  const casos: Array<number | null> = [500, 502, 503, 504, null];
  for (const httpStatus of casos) {
    const d = decidirRetry({ httpStatus, possivelmenteEnviado: true });
    assert.equal(d.retry, false, `status ${httpStatus} NÃO pode repetir automaticamente`);
    assert.equal(d.reason, "DESFECHO_DESCONHECIDO");
    assert.equal(!d.retry && d.reason === "DESFECHO_DESCONHECIDO" && d.requerReconciliacao, true);
    assert.equal(
      !d.retry && d.reason === "DESFECHO_DESCONHECIDO" && d.registrarResultadoDesconhecido,
      true,
    );
    assert.equal(classificarFase({ httpStatus, possivelmenteEnviado: true }), "desfecho_desconhecido");
  }
});

test("na dúvida sobre o envio, a fase é a mais conservadora", () => {
  // Mesmo erro de rede: se não se pode PROVAR que nada saiu, trata-se como
  // desfecho desconhecido, não como "não enviado".
  assert.equal(classificarFase({ httpStatus: null, possivelmenteEnviado: true }), "desfecho_desconhecido");
  assert.equal(decidirRetry({ httpStatus: null, possivelmenteEnviado: true }).retry, false);
});

test("idempotência ancora no NOSSO identificador, não no token", () => {
  const a = chaveDeIdempotencia("driver-1", "op-1");
  const b = chaveDeIdempotencia("driver-1", "op-1");
  assert.equal(a, b);
  // Tokens diferentes na mesma operação não produzem chaves diferentes: é o
  // que permite repetir com token novo sem parecer operação nova.
  assert.notEqual(chaveDeIdempotencia("driver-1", "op-2"), a);
  assert.equal(a.includes("hash-gcc"), false);
});

test("idempotência local NÃO é garantia de processamento único no SERPRO", () => {
  // Ela evita que NÓS gravemos ou cobremos duas vezes. Nada do nosso lado
  // alcança o que já foi processado do outro. O desenho reconhece isso ao
  // recusar repetição automática em desfecho desconhecido.
  const d = decidirRetry({ httpStatus: 502, possivelmenteEnviado: true });
  assert.equal(d.retry, false);
  assert.equal(
    !d.retry && d.reason === "DESFECHO_DESCONHECIDO" && d.requerReconciliacao,
    true,
    "ter chave local nao autoriza repetir: a duplicidade seria externa",
  );
});

// ═════════════════════ 5. o token nunca vai para log ═══════════════════════

test("log: o token da GCC é omitido, o id_template não", () => {
  const op = "op-1";
  const p = montarPrivacidade(template, tokenDe(op), op);
  const log = privacidadeParaLog(p);
  assert.equal(log.gcc_token, "[omitido]");
  assert.equal(log.id_template, template.idTemplate);
  assert.equal(JSON.stringify(log).includes("hash-gcc-sintetico"), false);
});

test("barreira: qualquer estrutura que ainda carregue o token é recusada", () => {
  const op = "op-1";
  const tok = tokenDe(op);
  const p = montarPrivacidade(template, tok, op);

  // Conferência por VALOR: renomear a chave não contorna.
  assert.throws(() => assertSemToken(p, tok.token, "trilha"), TokenEmLogError);
  assert.throws(
    () => assertSemToken({ campo_inocente: tok.token }, tok.token, "log"),
    TokenEmLogError,
  );
  assert.throws(() => assertSemToken(`erro: ${tok.token}`, tok.token, "mensagem"), TokenEmLogError);

  // A projeção de log passa.
  assert.doesNotThrow(() => assertSemToken(privacidadeParaLog(p), tok.token, "log"));
});
