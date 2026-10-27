/**
 * URL assinada é CREDENCIAL, não consulta autorizada.
 *
 * A matriz de acesso controla a EMISSÃO. Quem já tem uma URL válida usa até
 * expirar — e isso não é opinião de arquitetura, é comportamento do Storage,
 * medido aqui.
 *
 * O QUE SE MEDE
 *
 *   1. a URL emitida continua funcionando depois de o consentimento ser
 *      RETIRADO no banco. Retirar consentimento NÃO revoga nada;
 *   2. a URL emitida continua funcionando depois de o registro em
 *      `validation_documents` ser apagado;
 *   3. a única revogação efetiva ao alcance de uma operação é apagar o
 *      OBJETO. Feito isso, a mesma URL para de servir;
 *   4. não existe revogação por URL: o token é um JWT assinado pelo segredo do
 *      projeto, sem lista de revogados. Invalidar todas de uma vez exigiria
 *      trocar o segredo, o que derruba toda a aplicação.
 *
 * USO
 *   node scripts/homologacao/url-assinada-como-credencial.mjs
 *
 * Só dados sintéticos. O objeto e as linhas de apoio saem ao final; a trilha,
 * se houver, permanece.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const WORKDIR = "C:\\Users\\aomas\\SteelGo-Fase0\\sintetico-m1-20261001";
const API = "http://127.0.0.1:57324";
const BUCKET = "validation-documents";
const TITULAR = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const ADMIN = "5340d6e8-fadb-479d-8421-dc29ca44c606";

const EXECUCAO = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const CAMINHO = `identity_validation/${TITULAR}/credencial-${EXECUCAO}.png`;
const VERSAO = `v-credencial-${EXECUCAO}`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const TMP = mkdtempSync(join(tmpdir(), "credencial-"));
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
    ["scripts/banco/destino-autorizado.sh", "simulacao", "-At", "-1", "--sql-arquivo", arq],
    { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function chaveDeServico() {
  const bruto = execFileSync("npx", ["supabase", "status", "-o", "json", "--workdir", WORKDIR], {
    encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 10 * 1024 * 1024,
  });
  const j = JSON.parse(bruto.slice(bruto.indexOf("{")));
  if (!j.SERVICE_ROLE_KEY) throw new Error("chave de servico ausente");
  return j.SERVICE_ROLE_KEY;
}

async function main() {
  console.log("URL assinada como credencial — destino `simulacao`");
  console.log(`  execução ${EXECUCAO}\n`);

  const chave = chaveDeServico();
  const h = { Authorization: "Bearer " + chave, apikey: chave };

  // Preparo: texto de consentimento, aceite vigente, documento e arquivo.
  sql(
    `insert into public.document_consent_texts
       (purpose, version, body_md, body_sha256, published_by)
     values ('identity_validation', '${VERSAO}', 'corpo sintetico', repeat('c', 64), '${ADMIN}');
     insert into public.document_consents
       (subject_id, purpose, version, text_sha256)
     values ('${TITULAR}', 'identity_validation', '${VERSAO}', repeat('c', 64));
     insert into public.validation_documents
       (subject_id, purpose, kind, object_path, validation_started_at)
     values ('${TITULAR}', 'identity_validation', 'selfie', '${CAMINHO}', now());`,
  );
  const up = await fetch(`${API}/storage/v1/object/${BUCKET}/${CAMINHO}`, {
    method: "POST",
    headers: { ...h, "Content-Type": "image/png", "x-upsert": "true" },
    body: PNG,
  });
  reg(up.ok, `P1. preparo: documento com consentimento vigente (HTTP ${up.status})`);

  // Emite a credencial, com o TTL padrão do nosso código.
  const sign = await fetch(`${API}/storage/v1/object/sign/${BUCKET}/${CAMINHO}`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const j = await sign.json();
  const url = API + "/storage/v1" + j.signedURL;
  reg(sign.ok && !!j.signedURL, `P2. credencial emitida (HTTP ${sign.status})`);

  const inicial = await fetch(url);
  reg(inicial.ok, `P3. a credencial serve o objeto (HTTP ${inicial.status})`);

  // 1. Retirar o consentimento.
  console.log("\n  -- consentimento RETIRADO no banco --");
  sql(
    `update public.document_consents set withdrawn_at = now()
      where subject_id = '${TITULAR}' and version = '${VERSAO}';`,
  );
  const retirado = sql(
    `select coalesce(withdrawn_at::text, 'NULO') from public.document_consents
      where version = '${VERSAO}';`,
  );
  reg(retirado !== "NULO", "C1. o consentimento está registrado como retirado");
  const aposRetirada = await fetch(url);
  reg(aposRetirada.ok,
    `C2. a credencial AINDA SERVE depois da retirada (HTTP ${aposRetirada.status})` +
    " — retirar consentimento NÃO revoga");

  // 2. Apagar o registro do documento.
  console.log("\n  -- registro em validation_documents APAGADO --");
  sql(`delete from public.validation_documents where object_path = '${CAMINHO}';`);
  const aposRegistro = await fetch(url);
  reg(aposRegistro.ok,
    `R1. a credencial AINDA SERVE sem o registro (HTTP ${aposRegistro.status})` +
    " — o Storage não consulta nossas tabelas");

  // 3. Apagar o OBJETO.
  console.log("\n  -- OBJETO apagado pela Storage API --");
  const del = await fetch(`${API}/storage/v1/object/${BUCKET}/${CAMINHO}`, {
    method: "DELETE", headers: h,
  });
  reg(del.ok, `O1. objeto removido (HTTP ${del.status})`);
  const aposObjeto = await fetch(url);
  reg(!aposObjeto.ok,
    `O2. agora a credencial NÃO serve mais (HTTP ${aposObjeto.status})` +
    " — apagar o objeto é a revogação ao alcance da operação");

  // 4. O token é um JWT do projeto, sem lista de revogados.
  console.log("\n  -- anatomia do token --");
  const tok = new URL(url).searchParams.get("token") || "";
  const partes = tok.split(".");
  const cab = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
  const corpo = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  reg(partes.length === 3 && cab.alg === "HS256",
    `T1. o token é JWT ${cab.alg} assinado pelo segredo do projeto`);
  reg(Object.keys(corpo).join(",") === "url,iat,exp" || "exp" in corpo,
    `T2. o corpo carrega ${Object.keys(corpo).join(", ")} — nenhum identificador de revogação`);
  reg(!("jti" in corpo),
    "T3. não há `jti`: sem identificador, não há lista de revogados possível");

  // Limpeza do que dá para limpar.
  sql(
    `delete from public.document_consents where version = '${VERSAO}';
     delete from public.document_consent_texts where version = '${VERSAO}';`,
  );
  const sobrou = sql(
    `select 'consentimentos=' || (select count(*) from public.document_consents)
         || ' textos=' || (select count(*) from public.document_consent_texts)
         || ' objetos=' || (select count(*) from storage.objects where bucket_id = '${BUCKET}');`,
  );
  console.log(`\n  Instância depois da medição: ${sobrou}`);

  const falhou = resultados.filter((r) => !r).length;
  console.log(`\n  TOTAL OK=${resultados.length - falhou}  FALHOU=${falhou}`);
  return falhou;
}

main()
  .then((f) => { rmSync(TMP, { recursive: true, force: true }); process.exit(f > 0 ? 1 : 0); })
  .catch((e) => {
    console.error("\nERRO: " + (e.stderr || e.message));
    rmSync(TMP, { recursive: true, force: true });
    process.exit(2);
  });
