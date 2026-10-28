/**
 * As duas lacunas do banco, achadas na auditoria do envio.
 *
 * NÃO repete as 25 verificações de acesso entre usuários, que já passaram.
 * Só o que a auditoria encontrou e só o que exige sessão de verdade:
 *
 *   L1. a função do banco não exigia consentimento vigente. Quem chamasse a
 *       RPC direto -- por script, por engano, por um caminho novo que
 *       esquecesse a conferência -- registrava documento sem aceite nenhum.
 *
 *   L2. não havia idempotência. Clique duplo, resposta perdida na rede ou nova
 *       tentativa produziam dois registros e DOIS eventos `upload` para o
 *       mesmo envio.
 *
 * Uso:
 *   node scripts/homologacao/lacunas-do-envio.mjs <apelido>
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

/** Terceiro motorista sintético: entra sem aceite nenhum, de propósito. */
const SEM_ACEITE = "155ccf43-bdbb-47c4-a662-753ed4a36a2b";
const SEM_ACEITE_EMAIL = "motorista3.sim@steelgo.invalid";
const COM_ACEITE = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const COM_ACEITE_EMAIL = "motorista.sim@steelgo.invalid";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const TMP = mkdtempSync(join(tmpdir(), "lacunas-"));
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
  console.log(`Lacunas do envio — destino \`${DESTINO}\``);
  console.log(`  execução ${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}\n`);

  const anon = chaveAnonima();

  const senhas = {};
  for (const id of [COM_ACEITE, SEM_ACEITE]) senhas[id] = randomBytes(18).toString("base64url");
  sql(
    `create extension if not exists pgcrypto with schema extensions;
     update auth.users set encrypted_password = extensions.crypt('${senhas[COM_ACEITE]}', extensions.gen_salt('bf'))
       where id = '${COM_ACEITE}';
     update auth.users set encrypted_password = extensions.crypt('${senhas[SEM_ACEITE]}', extensions.gen_salt('bf'))
       where id = '${SEM_ACEITE}';
     -- Garante o estado do cenário: o terceiro motorista NÃO tem aceite.
     delete from public.document_consents where subject_id = '${SEM_ACEITE}';`,
  );

  const comAceite = await entrar(anon, COM_ACEITE_EMAIL, senhas[COM_ACEITE]);
  const semAceite = await entrar(anon, SEM_ACEITE_EMAIL, senhas[SEM_ACEITE]);

  async function registrar(sessao, corpo) {
    const r = await fetch(`${API}/rest/v1/rpc/registrar_envio_de_documento`, {
      method: "POST",
      headers: { ...sessao, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return { ok: r.ok, status: r.status, corpo: await r.text() };
  }

  // ─── L1: consentimento exigido pelo BANCO, não só pela aplicação ─────────
  console.log("  -- L1. a funcao exige consentimento vigente --");

  const idSem = randomUUID();
  const caminhoSem = `identity_validation/${SEM_ACEITE}/selfie-${idSem}.png`;
  const subiuSem = await fetch(`${API}/storage/v1/object/${BUCKET}/${caminhoSem}`, {
    method: "POST",
    headers: { ...semAceite, "Content-Type": "image/png" },
    body: PNG,
  });
  reg(
    subiuSem.ok,
    `A1. o bucket aceita o objeto de quem não consentiu (HTTP ${subiuSem.status}) — a policy ` +
      `confere caminho, não consentimento; é a função que precisa conferir`,
  );

  const semConsentimento = await registrar(semAceite, {
    p_document_id: idSem,
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: caminhoSem,
  });
  reg(
    !semConsentimento.ok && /DV014|consentimento/i.test(semConsentimento.corpo),
    `A2. sem consentimento o registro é RECUSADO pelo banco (HTTP ${semConsentimento.status})`,
  );

  const linhaFantasma = sql(
    `select count(*) from public.validation_documents where id = '${idSem}';`,
  );
  reg(linhaFantasma === "0", `A3. nada foi registrado (${linhaFantasma} linha)`);

  const trilhaFantasma = sql(
    `select count(*) from public.document_audit where object_path = '${caminhoSem}';`,
  );
  reg(trilhaFantasma === "0", `A4. nada entrou na trilha (${trilhaFantasma} evento)`);

  // Retirada de consentimento também recusa.
  sql(
    `update public.document_consents set withdrawn_at = now()
      where subject_id = '${COM_ACEITE}' and withdrawn_at is null
        and accepted_at = (select max(accepted_at) from public.document_consents
                            where subject_id = '${COM_ACEITE}');`,
  );
  const idRetirado = randomUUID();
  const aposRetirada = await registrar(comAceite, {
    p_document_id: idRetirado,
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: `identity_validation/${COM_ACEITE}/selfie-${idRetirado}.png`,
  });
  reg(
    !aposRetirada.ok && /DV014|retirado/i.test(aposRetirada.corpo),
    `A5. consentimento retirado também recusa (HTTP ${aposRetirada.status})`,
  );

  // Devolve o aceite para os cenários seguintes.
  const versao = sql(
    `select version from public.document_consent_texts
      where purpose = 'identity_validation' order by effective_from desc limit 1;`,
  );
  const sha = sql(
    `select body_sha256 from public.document_consent_texts
      where purpose = 'identity_validation' and version = '${versao}';`,
  );
  sql(
    `insert into public.document_consents (subject_id, purpose, version, text_sha256)
     values ('${COM_ACEITE}', 'identity_validation', '${versao}', '${sha}');`,
  );

  // ─── L2: idempotência ────────────────────────────────────────────────────
  console.log("\n  -- L2. repetir o mesmo envio nao duplica --");

  const id = randomUUID();
  const caminho = `identity_validation/${COM_ACEITE}/selfie-${id}.png`;
  await fetch(`${API}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: { ...comAceite, "Content-Type": "image/png" },
    body: PNG,
  });

  const corpo = {
    p_document_id: id,
    p_purpose: "identity_validation",
    p_kind: "selfie",
    p_object_path: caminho,
  };

  const primeira = await registrar(comAceite, corpo);
  reg(primeira.ok, `B1. primeira chamada registra (HTTP ${primeira.status})`);

  const segunda = await registrar(comAceite, corpo);
  reg(segunda.ok, `B2. a repetição NÃO é erro — devolve o mesmo id (HTTP ${segunda.status})`);

  const terceira = await registrar(comAceite, corpo);
  reg(terceira.ok, "B3. e a terceira também");

  const registros = sql(`select count(*) from public.validation_documents where id = '${id}';`);
  reg(registros === "1", `B4. existe UM registro, não três (${registros})`);

  const eventos = sql(
    `select count(*) from public.document_audit
      where object_path = '${caminho}' and action = 'upload';`,
  );
  reg(eventos === "1", `B5. existe UM evento \`upload\`, não três (${eventos})`);

  // Mesmo id descrevendo outro envio é erro explícito, não repetição.
  const outroEnvio = await registrar(comAceite, {
    ...corpo,
    p_kind: "cnh_front",
    p_object_path: `identity_validation/${COM_ACEITE}/cnh_front-${id}.png`,
  });
  reg(
    !outroEnvio.ok && /DV015|ja descreve/i.test(outroEnvio.corpo),
    `B6. o mesmo id com dados diferentes é RECUSADO (HTTP ${outroEnvio.status})`,
  );

  // ─── as mensagens não devolvem o que o cliente mandou ────────────────────
  console.log("\n  -- L3. a recusa do banco nao ecoa a entrada --");

  const eco = await registrar(comAceite, {
    p_document_id: randomUUID(),
    p_purpose: "eyJhbGciOiJIUzI1NiJ9.marcador-de-eco",
    p_kind: "selfie",
    p_object_path: `x/${COM_ACEITE}/selfie-y.png`,
  });
  reg(
    !eco.ok && !eco.corpo.includes("marcador-de-eco"),
    "C1. a mensagem de recusa não devolve o texto recebido",
  );

  console.log("\n  Evidência desta execução:");
  console.log(`    registros do titular ... ${sql(
    `select count(*) from public.validation_documents where subject_id = '${COM_ACEITE}';`,
  )}`);
  console.log(`    eventos na trilha ...... ${sql(`select count(*) from public.document_audit;`)}`);

  const ok = resultados.filter(Boolean).length;
  console.log(`\n  TOTAL OK=${ok}  FALHOU=${resultados.length - ok}`);
  if (ok !== resultados.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("erro:", e.message);
  process.exitCode = 1;
});
