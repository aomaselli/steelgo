/**
 * Leitura auditada e revisão documental, com sessões de verdade.
 *
 * Não repete o que já passou. O que se mede aqui é só o que E4 acrescentou:
 *
 *   A. a leitura confere autorização A CADA chamada e deixa um evento
 *      `access` — um por leitura, não um por sessão;
 *   B. transportadora e embarcador NÃO alcançam, e a ausência deles é a
 *      decisão, não um esquecimento;
 *   C. consentimento retirado derruba a leitura, inclusive a do titular;
 *   D. documento inexistente e expurgado têm motivo próprio;
 *   E. a revisão registra observação, divergência e pedido de novo envio, e
 *      não existe tipo que aprove;
 *   F. o titular LÊ as revisões do próprio documento e não as ESCREVE;
 *   G. a trilha e a revisão são append-only de verdade.
 *
 * Uso:
 *   node scripts/homologacao/revisao-documental.mjs <apelido>
 */

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DESTINO = process.argv[2] ?? "simulacao";
const API = process.env.API_SINTETICA ?? "http://127.0.0.1:57324";
const WORKDIR =
  process.env.WORKDIR_SINTETICO ?? "C:\\Users\\aomas\\SteelGo-Fase0\\sintetico-m1-20261001";
const BUCKET = "validation-documents";

const TITULAR = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const OUTRO_MOTORISTA = "3b017ae9-b74a-4c1a-87d7-e796ad2a7feb";
const ADMIN = "5340d6e8-fadb-479d-8421-dc29ca44c606";
const TRANSPORTADORA = "bea14780-db1e-4dc0-9847-693f8076ba14";
const EMBARCADOR = "5ef1a0ba-670b-4217-97d2-b1814970203e";

const EMAIL = {
  [TITULAR]: "motorista.sim@steelgo.invalid",
  [OUTRO_MOTORISTA]: "motorista2.sim@steelgo.invalid",
  [ADMIN]: "admin.sim@steelgo.invalid",
  [TRANSPORTADORA]: "transportadora.sim@steelgo.invalid",
  [EMBARCADOR]: "embarcador.sim@steelgo.invalid",
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const TMP = mkdtempSync(join(tmpdir(), "revisao-"));
const resultados = [];
function reg(ok, texto) {
  resultados.push(ok);
  console.log("  " + (ok ? "OK     | " : "FALHOU | ") + texto);
}

let seq = 0;
function sql(texto) {
  seq += 1;
  const arq = join(TMP, `q${seq}.sql`);
  writeFileSync(arq, texto.endsWith("\n") ? texto : texto + "\n", "utf8");
  return execFileSync(
    "bash",
    ["scripts/banco/destino-autorizado.sh", DESTINO, "-At", "-1", "--sql-arquivo", arq],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function chaveAnonima() {
  const bruto = execFileSync("npx", ["supabase", "status", "-o", "json", "--workdir", WORKDIR], {
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 10 * 1024 * 1024,
  });
  const j = JSON.parse(bruto.slice(bruto.indexOf("{")));
  if (!j.ANON_KEY) throw new Error("chave anonima ausente");
  return j.ANON_KEY;
}

async function entrar(anon, email, senha) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`login falhou para ${email}: HTTP ${r.status}`);
  return { Authorization: "Bearer " + j.access_token, apikey: anon };
}

async function chamar(sessao, funcao, corpo) {
  const r = await fetch(`${API}/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: { ...sessao, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { ok: r.ok, status: r.status, corpo: await r.text() };
}

async function main() {
  console.log(`Revisão documental — destino \`${DESTINO}\``);
  console.log(`  execução ${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}\n`);

  const anon = chaveAnonima();
  const todos = [TITULAR, OUTRO_MOTORISTA, ADMIN, TRANSPORTADORA, EMBARCADOR];
  const senhas = {};
  for (const id of todos) senhas[id] = randomBytes(18).toString("base64url");

  sql(
    `create extension if not exists pgcrypto with schema extensions;` +
      todos
        .map(
          (id) =>
            `update auth.users set encrypted_password = extensions.crypt('${senhas[id]}', extensions.gen_salt('bf')) where id = '${id}';`,
        )
        .join("\n"),
  );

  const sessoes = {};
  for (const id of todos) sessoes[id] = await entrar(anon, EMAIL[id], senhas[id]);
  reg(true, "cinco sessões reais: titular, outro motorista, admin, transportadora, embarcador");

  // Preparo: consentimento vigente e um documento do titular.
  const versao = sql(
    `select version from public.document_consent_texts
      where purpose = 'identity_validation' order by effective_from desc limit 1;`,
  );
  const sha = sql(
    `select body_sha256 from public.document_consent_texts
      where purpose = 'identity_validation' and version = '${versao}';`,
  );
  sql(
    `update public.document_consents set withdrawn_at = now()
      where subject_id = '${TITULAR}' and withdrawn_at is null;
     insert into public.document_consents (subject_id, purpose, version, text_sha256)
     values ('${TITULAR}', 'identity_validation', '${versao}', '${sha}');`,
  );

  const docId = randomUUID();
  const caminho = `identity_validation/${TITULAR}/selfie-${docId}.png`;
  await fetch(`${API}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: { ...sessoes[TITULAR], "Content-Type": "image/png" },
    body: PNG,
  });
  await chamar(sessoes[TITULAR], "registrar_envio_de_documento", {
    p_document_id: docId,
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: caminho,
  });

  const acessosAntes = Number(
    sql(`select count(*) from public.document_audit where action = 'access';`),
  );

  // ─── A. leitura autorizada deixa UM evento por leitura ───────────────────
  console.log("\n  -- A. a leitura e conferida e auditada a cada chamada --");

  const l1 = await chamar(sessoes[TITULAR], "registrar_acesso_a_documento", {
    p_document_id: docId,
  });
  reg(l1.ok, `A1. o titular lê o próprio documento (HTTP ${l1.status})`);
  reg(
    l1.ok && l1.corpo.includes(caminho),
    "A2. a função devolve o caminho para o servidor — não uma URL assinada",
  );
  reg(
    !/token=|signature=|https?:\/\//i.test(l1.corpo),
    "A3. a resposta não carrega URL nem credencial",
  );

  const l2 = await chamar(sessoes[ADMIN], "registrar_acesso_a_documento", {
    p_document_id: docId,
  });
  reg(l2.ok, `A4. o revisor lê (HTTP ${l2.status})`);

  const acessosDepois = Number(
    sql(`select count(*) from public.document_audit where action = 'access';`),
  );
  reg(
    acessosDepois - acessosAntes === 2,
    `A5. duas leituras deixaram DOIS eventos (${acessosDepois - acessosAntes})`,
  );

  const papeis = sql(
    `select string_agg(actor_role, ',' order by occurred_at) from public.document_audit
      where action = 'access' and object_path = '${caminho}';`,
  );
  reg(papeis === "driver,admin", `A6. a trilha registra o papel real de cada leitor (${papeis})`);

  // ─── B. transportadora e embarcador não alcançam ─────────────────────────
  console.log("\n  -- B. o acesso nao se amplia para quem nao precisa --");

  for (const [nome, id] of [
    ["transportadora", TRANSPORTADORA],
    ["embarcador", EMBARCADOR],
    ["outro motorista", OUTRO_MOTORISTA],
  ]) {
    const r = await chamar(sessoes[id], "registrar_acesso_a_documento", { p_document_id: docId });
    reg(
      !r.ok && /DV022|papel sem acesso/i.test(r.corpo),
      `B. ${nome} NÃO alcança o documento (HTTP ${r.status})`,
    );
  }

  const semEvento = sql(
    `select count(*) from public.document_audit
      where action = 'access' and object_path = '${caminho}'
        and actor_role not in ('driver', 'admin');`,
  );
  reg(semEvento === "0", `B4. recusa não deixa evento de acesso (${semEvento})`);

  // ─── C. consentimento retirado derruba a leitura ─────────────────────────
  console.log("\n  -- C. consentimento retirado derruba a leitura, inclusive a do titular --");

  sql(
    `update public.document_consents set withdrawn_at = now()
      where subject_id = '${TITULAR}' and withdrawn_at is null;`,
  );

  for (const [nome, id] of [
    ["titular", TITULAR],
    ["revisor", ADMIN],
  ]) {
    const r = await chamar(sessoes[id], "registrar_acesso_a_documento", { p_document_id: docId });
    reg(
      !r.ok && /DV023|consentimento/i.test(r.corpo),
      `C. ${nome} não lê com consentimento retirado (HTTP ${r.status})`,
    );
  }

  // Devolve o aceite para o resto da bateria.
  sql(
    `insert into public.document_consents (subject_id, purpose, version, text_sha256)
     values ('${TITULAR}', 'identity_validation', '${versao}', '${sha}');`,
  );

  // ─── D. documento inexistente e expurgado ────────────────────────────────
  console.log("\n  -- D. inexistente e expurgado tem motivo proprio --");

  const inexistente = await chamar(sessoes[ADMIN], "registrar_acesso_a_documento", {
    p_document_id: randomUUID(),
  });
  reg(
    !inexistente.ok && /DV021|inexistente/i.test(inexistente.corpo),
    `D1. documento inexistente (HTTP ${inexistente.status})`,
  );

  const idExpurgado = randomUUID();
  sql(
    `insert into public.validation_documents
       (id, subject_id, purpose, kind, object_path, purged_at)
     values ('${idExpurgado}', '${TITULAR}', 'identity_validation', 'selfie',
             'identity_validation/${TITULAR}/selfie-${idExpurgado}.png', now());`,
  );
  const expurgado = await chamar(sessoes[TITULAR], "registrar_acesso_a_documento", {
    p_document_id: idExpurgado,
  });
  reg(
    !expurgado.ok && /DV021|expurgado/i.test(expurgado.corpo),
    `D2. documento expurgado não é servido (HTTP ${expurgado.status})`,
  );

  // ─── E. a revisão registra, e não aprova ─────────────────────────────────
  console.log("\n  -- E. a revisao registra observacao, divergencia e pedido --");

  for (const tipo of ["observacao", "divergencia", "novo_envio_solicitado"]) {
    const r = await chamar(sessoes[ADMIN], "registrar_revisao_de_documento", {
      p_document_id: docId,
      p_tipo: tipo,
      p_contexto: "demonstracao",
      p_nota: `nota sintetica de ${tipo}`,
    });
    reg(r.ok, `E. o revisor registra "${tipo}" (HTTP ${r.status})`);
  }

  const aprovar = await chamar(sessoes[ADMIN], "registrar_revisao_de_documento", {
    p_document_id: docId,
    p_tipo: "aprovado",
    p_contexto: "demonstracao",
    p_nota: null,
  });
  reg(
    !aprovar.ok && /DV024|tipo nao previsto/i.test(aprovar.corpo),
    `E4. NÃO existe tipo que aprove (HTTP ${aprovar.status})`,
  );

  const notaComCpf = await chamar(sessoes[ADMIN], "registrar_revisao_de_documento", {
    p_document_id: docId,
    p_tipo: "observacao",
    p_contexto: "demonstracao",
    p_nota: "titular 123.456.789-09",
  });
  reg(
    !notaComCpf.ok && /DV025|CPF/i.test(notaComCpf.corpo),
    `E5. a nota com CPF é recusada pelo banco (HTTP ${notaComCpf.status})`,
  );

  const contexto = sql(
    `select distinct contexto from public.document_review_events where document_id = '${docId}';`,
  );
  reg(contexto === "demonstracao", `E6. as revisões ficam marcadas como demonstração (${contexto})`);

  // ─── F. quem escreve e quem lê ───────────────────────────────────────────
  console.log("\n  -- F. o titular le as proprias revisoes e nao as escreve --");

  const titularEscreve = await chamar(sessoes[TITULAR], "registrar_revisao_de_documento", {
    p_document_id: docId,
    p_tipo: "observacao",
    p_contexto: "demonstracao",
    p_nota: "eu mesmo me revisando",
  });
  reg(
    !titularEscreve.ok && /DV022|sem permissao/i.test(titularEscreve.corpo),
    `F1. o titular NÃO registra revisão (HTTP ${titularEscreve.status})`,
  );

  async function lerRevisoes(id) {
    const r = await fetch(
      `${API}/rest/v1/document_review_events?document_id=eq.${docId}&select=id`,
      { headers: sessoes[id] },
    );
    return r.ok ? (await r.json()).length : -1;
  }

  reg((await lerRevisoes(TITULAR)) === 3, "F2. o titular lê as revisões do próprio documento");
  reg((await lerRevisoes(ADMIN)) === 3, "F3. o revisor lê");
  reg((await lerRevisoes(OUTRO_MOTORISTA)) === 0, "F4. outro motorista não lê");
  reg((await lerRevisoes(TRANSPORTADORA)) === 0, "F5. a transportadora não lê");

  // ─── G. append-only de verdade ───────────────────────────────────────────
  console.log("\n  -- G. append-only --");

  const alterar = await fetch(
    `${API}/rest/v1/document_review_events?document_id=eq.${docId}`,
    {
      method: "PATCH",
      headers: { ...sessoes[ADMIN], "Content-Type": "application/json" },
      body: JSON.stringify({ nota: "reescrita" }),
    },
  );
  reg(!alterar.ok, `G1. revisão não se altera pelo cliente (HTTP ${alterar.status})`);

  const apagar = await fetch(`${API}/rest/v1/document_review_events?document_id=eq.${docId}`, {
    method: "DELETE",
    headers: sessoes[ADMIN],
  });
  reg(!apagar.ok, `G2. revisão não se apaga pelo cliente (HTTP ${apagar.status})`);

  console.log("\n  Evidência desta execução:");
  console.log(`    eventos \`access\` ....... ${sql(
    `select count(*) from public.document_audit where action = 'access';`,
  )}`);
  console.log(`    revisões registradas ... ${sql(
    `select count(*) from public.document_review_events;`,
  )}`);

  const ok = resultados.filter(Boolean).length;
  console.log(`\n  TOTAL OK=${ok}  FALHOU=${resultados.length - ok}`);
  if (ok !== resultados.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("erro:", e.message);
  process.exitCode = 1;
});
