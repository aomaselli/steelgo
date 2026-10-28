/**
 * Acesso entre usuários — a segunda barreira, medida com sessões de verdade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE HARNESS MEDE, E POR QUE NÃO BASTA TESTE DE UNIDADE
 *
 * `authorizeDocumentAccess` decide em função pura, e já tem bateria própria.
 * Mas a decisão da aplicação é a PRIMEIRA barreira. A segunda são as policies
 * do banco e do bucket, e elas só respondem a um JWT de verdade — RLS não roda
 * em teste de unidade.
 *
 * Então aqui há três sessões reais: dois motoristas e um admin. As asserções
 * são sobre o que cada um ALCANÇA, não sobre o que o código pretendia.
 *
 * As senhas sintéticas são sorteadas a cada execução, usadas e descartadas.
 * Nenhuma é impressa.
 *
 * Uso:
 *   node scripts/homologacao/acesso-entre-usuarios.mjs <apelido>
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

const MOTORISTA_A = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const MOTORISTA_B = "3b017ae9-b74a-4c1a-87d7-e796ad2a7feb";
const ADMIN = "5340d6e8-fadb-479d-8421-dc29ca44c606";

const EMAIL = {
  [MOTORISTA_A]: "motorista.sim@steelgo.invalid",
  [MOTORISTA_B]: "motorista2.sim@steelgo.invalid",
  [ADMIN]: "admin.sim@steelgo.invalid",
};

const EXECUCAO = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);

/** PNG de 1x1. Bytes de verdade, para o número mágico conferir. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const TMP = mkdtempSync(join(tmpdir(), "acesso-"));
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

async function main() {
  console.log(`Acesso entre usuários — destino \`${DESTINO}\``);
  console.log(`  execução ${EXECUCAO}\n`);

  const anon = chaveAnonima();

  // Senhas sintéticas, sorteadas agora e nunca impressas.
  const senhas = {};
  for (const id of [MOTORISTA_A, MOTORISTA_B, ADMIN]) {
    senhas[id] = randomBytes(18).toString("base64url");
  }
  sql(
    `create extension if not exists pgcrypto with schema extensions;
     update auth.users set encrypted_password = extensions.crypt('${senhas[MOTORISTA_A]}', extensions.gen_salt('bf'))
       where id = '${MOTORISTA_A}';
     update auth.users set encrypted_password = extensions.crypt('${senhas[MOTORISTA_B]}', extensions.gen_salt('bf'))
       where id = '${MOTORISTA_B}';
     update auth.users set encrypted_password = extensions.crypt('${senhas[ADMIN]}', extensions.gen_salt('bf'))
       where id = '${ADMIN}';`,
  );

  const a = await entrar(anon, EMAIL[MOTORISTA_A], senhas[MOTORISTA_A]);
  const b = await entrar(anon, EMAIL[MOTORISTA_B], senhas[MOTORISTA_B]);
  const adm = await entrar(anon, EMAIL[ADMIN], senhas[ADMIN]);
  reg(true, "três sessões reais obtidas (motorista A, motorista B, admin)");

  // Aceite vigente para A, sobre o texto publicado.
  const versao = sql(
    `select version from public.document_consent_texts
      where purpose = 'identity_validation' order by effective_from desc limit 1;`,
  );
  const sha = sql(
    `select body_sha256 from public.document_consent_texts
      where purpose = 'identity_validation' and version = '${versao}';`,
  );
  if (!versao) throw new Error("nenhum texto de consentimento publicado; semeie primeiro");

  // ─── aceite: cada um grava o seu, ninguém grava pelo outro ───────────────
  console.log("\n  -- aceite do consentimento --");

  const aceiteProprio = await fetch(`${API}/rest/v1/document_consents`, {
    method: "POST",
    headers: { ...a, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      subject_id: MOTORISTA_A,
      purpose: "identity_validation",
      version: versao,
      text_sha256: sha,
    }),
  });
  reg(aceiteProprio.ok, `C1. A grava o próprio aceite (HTTP ${aceiteProprio.status})`);

  const aceitePeloOutro = await fetch(`${API}/rest/v1/document_consents`, {
    method: "POST",
    headers: { ...b, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      subject_id: MOTORISTA_A,
      purpose: "identity_validation",
      version: versao,
      text_sha256: sha,
    }),
  });
  reg(!aceitePeloOutro.ok, `C2. B NÃO aceita em nome de A (HTTP ${aceitePeloOutro.status})`);

  const leituraDoAceiteAlheio = await fetch(
    `${API}/rest/v1/document_consents?subject_id=eq.${MOTORISTA_A}&select=id`,
    { headers: b },
  );
  const linhasAceite = leituraDoAceiteAlheio.ok ? await leituraDoAceiteAlheio.json() : [];
  reg(linhasAceite.length === 0, `C3. B não lê o aceite de A (${linhasAceite.length} linha(s))`);

  // ─── envio: o objeto ──────────────────────────────────────────────────────
  console.log("\n  -- envio do documento --");

  const docId = randomUUID();
  const caminhoA = `identity_validation/${MOTORISTA_A}/selfie-${docId}.png`;

  const subiu = await fetch(`${API}/storage/v1/object/${BUCKET}/${caminhoA}`, {
    method: "POST",
    headers: { ...a, "Content-Type": "image/png" },
    body: PNG,
  });
  reg(subiu.ok, `E1. A sobe no próprio caminho (HTTP ${subiu.status})`);

  const caminhoInvadido = `identity_validation/${MOTORISTA_A}/selfie-${randomUUID()}.png`;
  const subiuNoAlheio = await fetch(`${API}/storage/v1/object/${BUCKET}/${caminhoInvadido}`, {
    method: "POST",
    headers: { ...b, "Content-Type": "image/png" },
    body: PNG,
  });
  reg(!subiuNoAlheio.ok, `E2. B NÃO sobe no caminho de A (HTTP ${subiuNoAlheio.status})`);

  // ─── registro: a função definidora ───────────────────────────────────────
  console.log("\n  -- registro pela função definidora --");

  async function registrar(sessao, corpo) {
    const r = await fetch(`${API}/rest/v1/rpc/registrar_envio_de_documento`, {
      method: "POST",
      headers: { ...sessao, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return { ok: r.ok, status: r.status, corpo: await r.text() };
  }

  const r1 = await registrar(a, {
    p_document_id: docId,
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: caminhoA,
  });
  reg(r1.ok, `R1. A registra o próprio envio (HTTP ${r1.status})`);

  const r2 = await registrar(b, {
    p_document_id: randomUUID(),
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: `identity_validation/${MOTORISTA_A}/selfie-${randomUUID()}.png`,
  });
  reg(
    !r2.ok && /DV012|nao pertence/i.test(r2.corpo),
    `R2. B NÃO registra no caminho de A (HTTP ${r2.status})`,
  );

  const r3 = await registrar(a, {
    p_document_id: randomUUID(),
    p_purpose: "marketing",
    p_kind: "selfie",
    p_object_path: `marketing/${MOTORISTA_A}/selfie-x.png`,
  });
  reg(!r3.ok && /DV011|finalidade/i.test(r3.corpo), `R3. finalidade fora da lista é recusada`);

  const r4 = await registrar(a, {
    p_document_id: randomUUID(),
    p_purpose: "identity_validation",
    p_kind: "passaporte",
    p_object_path: `identity_validation/${MOTORISTA_A}/passaporte-x.png`,
  });
  reg(!r4.ok, `R4. espécie fora da lista é recusada`);

  const r5 = await registrar(a, {
    p_document_id: randomUUID(),
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: `identity_validation/${MOTORISTA_A}/selfie-x.png?token=abc`,
  });
  reg(
    !r5.ok && /DV012|DV013|credencial|forma/i.test(r5.corpo),
    `R5. caminho com credencial é recusado`,
  );

  // ─── leitura do registro ─────────────────────────────────────────────────
  console.log("\n  -- leitura do registro --");

  async function linhas(sessao, filtro) {
    const r = await fetch(`${API}/rest/v1/validation_documents?${filtro}&select=id`, {
      headers: sessao,
    });
    return r.ok ? await r.json() : [];
  }

  reg((await linhas(a, `id=eq.${docId}`)).length === 1, "L1. A lê o próprio registro");
  reg((await linhas(b, `id=eq.${docId}`)).length === 0, "L2. B NÃO lê o registro de A");
  reg((await linhas(adm, `id=eq.${docId}`)).length === 1, "L3. admin lê, para revisar");

  const semSessao = await fetch(
    `${API}/rest/v1/validation_documents?id=eq.${docId}&select=id`,
    { headers: { apikey: anon } },
  );
  const linhasAnon = semSessao.ok ? await semSessao.json() : [];
  reg(linhasAnon.length === 0, `L4. sem sessão não lê nada (${linhasAnon.length} linha(s))`);

  // ─── inserção direta continua fechada ────────────────────────────────────
  const diretoNaTabela = await fetch(`${API}/rest/v1/validation_documents`, {
    method: "POST",
    headers: { ...a, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      subject_id: MOTORISTA_A,
      purpose: "identity_validation",
      kind: "selfie",
      object_path: `identity_validation/${MOTORISTA_A}/selfie-${randomUUID()}.png`,
    }),
  });
  reg(
    !diretoNaTabela.ok,
    `L5. A NÃO insere direto na tabela — só pela função (HTTP ${diretoNaTabela.status})`,
  );

  // ─── leitura do objeto ───────────────────────────────────────────────────
  console.log("\n  -- leitura do objeto --");

  async function baixar(sessao) {
    const r = await fetch(`${API}/storage/v1/object/${BUCKET}/${caminhoA}`, { headers: sessao });
    return r.status;
  }

  reg((await baixar(a)) === 200, "O1. A lê o próprio objeto");
  const statusB = await baixar(b);
  reg(statusB !== 200, `O2. B NÃO lê o objeto de A (HTTP ${statusB})`);
  reg((await baixar(adm)) === 200, "O3. admin lê o objeto, para revisar");
  const statusAnon = (
    await fetch(`${API}/storage/v1/object/${BUCKET}/${caminhoA}`, { headers: { apikey: anon } })
  ).status;
  reg(statusAnon !== 200, `O4. sem sessão não lê o objeto (HTTP ${statusAnon})`);

  // ─── a trilha não se lê pelo cliente ─────────────────────────────────────
  console.log("\n  -- trilha --");

  for (const [nome, sessao] of [
    ["A", a],
    ["B", b],
    ["admin", adm],
  ]) {
    const r = await fetch(`${API}/rest/v1/document_audit?select=id&limit=1`, { headers: sessao });
    reg(!r.ok, `T1.${nome}. ${nome} não lê a trilha pelo cliente (HTTP ${r.status})`);
  }

  const evento = sql(
    `select count(*) from public.document_audit
      where object_path = '${caminhoA}' and action = 'upload';`,
  );
  reg(evento === "1", `T2. o envio deixou exatamente um evento \`upload\` (${evento})`);

  const papel = sql(
    `select actor_role from public.document_audit
      where object_path = '${caminhoA}' and action = 'upload';`,
  );
  reg(papel === "driver", `T3. o evento registra o papel real do ator (${papel})`);

  // ─── evidência ───────────────────────────────────────────────────────────
  console.log("\n  Evidência desta execução:");
  console.log(`    registros de A ......... ${sql(
    `select count(*) from public.validation_documents where subject_id = '${MOTORISTA_A}';`,
  )}`);
  console.log(`    eventos na trilha ...... ${sql(
    `select count(*) from public.document_audit;`,
  )}`);

  const ok = resultados.filter(Boolean).length;
  console.log(`\n  TOTAL OK=${ok}  FALHOU=${resultados.length - ok}`);
  if (ok !== resultados.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("erro:", e.message);
  process.exitCode = 1;
});
