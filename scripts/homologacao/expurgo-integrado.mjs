/**
 * Homologação do expurgo INTEGRADO — Storage API + banco + trilha.
 *
 * Os testes de `src/server/documents/__tests__/expurgo.test.ts` exercitam
 * `purge.ts` com portas falsas. Isto exercita o MESMO módulo contra o Storage
 * de verdade e contra o banco de verdade, pelo destino descartável autorizado.
 * Falsificar as portas prova a lógica; só o serviço de verdade prova que a
 * lógica está ligada no lugar certo.
 *
 * O QUE SE PROVA AQUI
 *
 *   1. prazo EXCLUSIVO de teste, aprovado e depois desfeito. O prazo de
 *      produção continua sem valor aprovado — é conferido no fim;
 *   2. falha real da Storage API: o expurgo NÃO se declara concluído, o
 *      arquivo continua lá, `purged_at` fica nulo e não há linha `purge`;
 *   3. nova tentativa conclui, e só então aparece a linha `purge`;
 *   4. repetir é inofensivo: nenhuma segunda linha;
 *   5. a trilha SOBREVIVE ao expurgo.
 *
 * O banco é sempre alcançado por `scripts/banco/destino-autorizado.sh`, nunca
 * por conexão direta: as seis barreiras valem também para a homologação.
 *
 * USO
 *   node scripts/homologacao/expurgo-integrado.mjs
 *
 * Deixa atrás, de propósito, as linhas de trilha e o registro do documento com
 * `purged_at` preenchido: são a evidência. Imprime a contagem exata.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const REPO = process.cwd();
const DESTINO = "simulacao";
const WORKDIR = "C:\\Users\\aomas\\SteelGo-Fase0\\sintetico-m1-20261001";
const API = "http://127.0.0.1:57324";
const BUCKET = "validation-documents";

// Ator sintético já existente na instância.
const TITULAR = "efa78aef-cfae-4263-a6fc-3a802e65cdbd";
const ADMIN = "5340d6e8-fadb-479d-8421-dc29ca44c606";

// Cada execução usa um caminho PRÓPRIO.
//
// A primeira versão usava um caminho fixo e contava linhas da trilha em
// números absolutos. Na segunda execução isso reprovou três asserções: a
// trilha é append-only de propósito, então a linha `upload` da execução
// anterior continua lá e a contagem vira 2. Não era defeito do produto --
// era o harness supondo trilha limpa, num lugar em que limpar é proibido
// pelo próprio desenho. Caminho por execução resolve sem apagar nada.
const EXECUCAO = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const MARCA = `selfie-expurgo-integrado-${EXECUCAO}`;
const CAMINHO = `identity_validation/${TITULAR}/${MARCA}.png`;
const CAMINHO_INEXISTENTE = `identity_validation/${TITULAR}/${MARCA}-que-nao-existe.png`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const TMP = mkdtempSync(join(tmpdir(), "expurgo-"));
const resultados = [];
function reg(ok, texto) {
  resultados.push((ok ? "OK     | " : "FALHOU | ") + texto);
  console.log("  " + (ok ? "OK     | " : "FALHOU | ") + texto);
}

// ───────────────────────────── banco, pelo validador ───────────────────────

let seqSql = 0;
function sql(texto, { transacao = true } = {}) {
  seqSql += 1;
  const arq = join(TMP, `q${seqSql}.sql`);
  writeFileSync(arq, texto.endsWith("\n") ? texto : texto + "\n", "utf8");
  const args = ["scripts/banco/destino-autorizado.sh", DESTINO, "-At"];
  if (transacao) args.push("-1");
  args.push("--sql-arquivo", arq);
  return execFileSync("bash", args, {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// ────────────────────────── Storage, por HTTP ──────────────────────────────

function chaveDeServico() {
  const bruto = execFileSync("npx", ["supabase", "status", "-o", "json", "--workdir", WORKDIR], {
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 10 * 1024 * 1024,
  });
  const j = JSON.parse(bruto.slice(bruto.indexOf("{")));
  if (!j.SERVICE_ROLE_KEY) throw new Error("chave de servico ausente");
  return j.SERVICE_ROLE_KEY;
}

function cabecalhos(chave) {
  return { Authorization: "Bearer " + chave, apikey: chave };
}

async function removerNoStorage(chave, caminho) {
  const r = await fetch(`${API}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "DELETE",
    headers: cabecalhos(chave),
  });
  if (!r.ok) throw new Error(`Storage DELETE respondeu HTTP ${r.status}`);
}

/** Consulta INDEPENDENTE da remoção: lista o prefixo e procura o nome. */
async function existeNoStorage(chave, caminho) {
  const prefixo = caminho.slice(0, caminho.lastIndexOf("/"));
  const nome = caminho.slice(caminho.lastIndexOf("/") + 1);
  const r = await fetch(`${API}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...cabecalhos(chave), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: prefixo, limit: 200 }),
  });
  if (!r.ok) throw new Error(`Storage list respondeu HTTP ${r.status}`);
  const itens = await r.json();
  return Array.isArray(itens) && itens.some((i) => i.name === nome);
}

// ─────────────── compila o módulo real e o importa ─────────────────────────

/**
 * Compila o módulo de verdade, com a configuração do PRÓPRIO repositório.
 *
 * Uma primeira versão chamava `tsc` com opções soltas na linha de comando.
 * Sem `strict`, a redução do discriminante `purge: false` degrada e o
 * compilador reprovou código que o `tsc --noEmit` do projeto aceita. Herdar o
 * `tsconfig.json` é a correção certa: a alternativa seria contorcer o código
 * de produção para agradar uma configuração que não é a do projeto.
 */
function compilarModulo() {
  const saida = join(TMP, "compilado");
  mkdirSync(saida, { recursive: true });
  const tsconfig = join(TMP, "tsconfig.homologacao.json");
  writeFileSync(
    tsconfig,
    JSON.stringify(
      {
        extends: join(REPO, "tsconfig.json").replace(/\\/g, "/"),
        compilerOptions: {
          noEmit: false,
          outDir: saida.replace(/\\/g, "/"),
          // `allowImportingTsExtensions` só vale com `noEmit`; aqui há emissão.
          allowImportingTsExtensions: false,
          // CommonJS de proposito: o ESM emitido mantem `from "./retention"`
          // sem extensao, e o Node nao resolve isso. Carregado por
          // `createRequire`, abaixo.
          module: "commonjs",
          moduleResolution: "node10",
          verbatimModuleSyntax: false,
          declaration: false,
          types: [],
        },
        // `include: []` é obrigatório: `extends` herda o `include` do projeto,
        // e sem isto o compilador varre todo o `src` e para nos diagnósticos
        // pré-existentes de telas que não têm nada a ver com o expurgo.
        include: [],
        files: [
          "src/server/documents/purge.ts",
          "src/server/documents/retention.ts",
          "src/server/documents/types.ts",
        ].map((p) => join(REPO, p).replace(/\\/g, "/")),
      },
      null,
      2,
    ),
    "utf8",
  );
  execFileSync("npx", ["tsc", "-p", tsconfig], {
    cwd: REPO,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Com `files` apontando os três arquivos do mesmo diretório, o `rootDir`
  // inferido é esse diretório e a saída fica plana no `outDir`.
  return saida;
}

// ────────────────────────────── preparo ────────────────────────────────────

function registroDoDocumento(campo) {
  return sql(
    `select coalesce(${campo}::text, 'NULO') from public.validation_documents
      where object_path = '${CAMINHO}';`,
  );
}

function contarTrilha(acao) {
  return Number(
    sql(
      `select count(*) from public.document_audit
        where object_path = '${CAMINHO}' and action = '${acao}';`,
    ),
  );
}

async function main() {
  console.log("Homologação do expurgo integrado — destino `simulacao`\n");

  const chave = chaveDeServico();
  const dirCompilado = compilarModulo();
  const purge = createRequire(import.meta.url)(join(dirCompilado, "purge.js"));

  console.log(`  execução ${EXECUCAO}, caminho próprio: .../${MARCA}.png\n`);

  // 1. Prazo EXCLUSIVO de teste, com aprovador registrado.
  sql(
    `update public.document_retention_policy
        set biometric_days = 1, document_image_days = 2, abandoned_upload_hours = 1,
            approved_by = '${ADMIN}', approved_at = now(), updated_at = now();`,
  );
  const prazoDeTeste = sql(
    `select biometric_days || '/' || document_image_days || '/' || abandoned_upload_hours
       from public.document_retention_policy;`,
  );
  reg(prazoDeTeste === "1/2/1", `P1. prazo exclusivo de teste aprovado (${prazoDeTeste} dias/dias/horas)`);

  // 2. Documento sintético: arquivo no Storage, registro no banco, trilha de upload.
  const up = await fetch(`${API}/storage/v1/object/${BUCKET}/${CAMINHO}`, {
    method: "POST",
    headers: { ...cabecalhos(chave), "Content-Type": "image/png", "x-upsert": "true" },
    body: PNG,
  });
  reg(up.ok, `P2. documento sintético no Storage (HTTP ${up.status})`);

  sql(
    `insert into public.validation_documents
       (subject_id, purpose, kind, object_path, uploaded_at, validation_started_at)
     values ('${TITULAR}', 'identity_validation', 'selfie', '${CAMINHO}',
             now() - interval '10 days', now() - interval '10 days');
     insert into public.document_audit
       (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
     values ('upload', '${TITULAR}', '${TITULAR}', 'driver', 'identity_validation',
             'selfie', '${CAMINHO}');`,
  );
  reg(contarTrilha("upload") === 1, "P3. trilha de upload registrada");

  const doc = {
    objectPath: CAMINHO,
    kind: "selfie",
    subjectId: TITULAR,
    purpose: "identity_validation",
    uploadedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    validationStartedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    purgedAt: null,
  };
  const politica = { biometricDays: 1, documentImageDays: 2, abandonedUploadHours: 1 };

  // Portas de verdade. `marcarExpurgado` e `registrarTrilha` passam pelo
  // validador, como todo o resto.
  function portas({ chaveParaRemover }) {
    return {
      remover: (p) => removerNoStorage(chaveParaRemover, p),
      existe: (p) => existeNoStorage(chave, p),
      marcarExpurgado: async (p, quando) => {
        sql(
          `update public.validation_documents
              set purged_at = '${quando.toISOString()}'
            where object_path = '${p}';`,
        );
      },
      registrarTrilha: async (e) => {
        sql(
          `insert into public.document_audit
             (action, subject_id, actor_id, actor_role, purpose, kind, object_path,
              reason_code, occurred_at)
           values ('${e.action}', '${e.subjectId}', '${e.actorId}', '${e.actorRole}',
                   '${e.purpose}', '${e.kind}', '${e.objectPath}',
                   '${e.reasonCode}', '${e.occurredAt}');`,
        );
      },
    };
  }

  // ─── 3. FALHA REAL DA STORAGE API ────────────────────────────────────────
  console.log("\n  -- primeira passada: credencial inválida no DELETE --");
  const r1 = await purge.expurgarDocumento(
    doc,
    politica,
    portas({ chaveParaRemover: "credencial-invalida-de-proposito" }),
    new Date(),
    1,
  );
  reg(r1.status === "pendente", `F1. a passada com falha devolveu '${r1.status}' (esperado pendente)`);
  reg(r1.status === "pendente" && r1.falha === "REMOCAO_FALHOU",
    `F2. a falha é da remoção: ${r1.status === "pendente" ? r1.falha : "-"}`);
  reg(r1.status === "pendente" && r1.concluido === false, "F3. o resultado nega explicitamente a conclusão");

  const persiste = await existeNoStorage(chave, CAMINHO);
  reg(persiste, "F4. o arquivo CONTINUA no bucket depois da falha");
  reg(registroDoDocumento("purged_at") === "NULO", "F5. purged_at segue NULO — expurgo não declarado");
  reg(contarTrilha("purge") === 0, "F6. nenhuma linha `purge` na trilha");
  reg(contarTrilha("upload") === 1, "F7. a trilha de upload está preservada");

  // ─── 4. Sucesso aparente: DELETE de caminho que não existe ───────────────
  console.log("\n  -- o que a Storage API responde a DELETE de objeto ausente --");
  let respostaAusente;
  try {
    await removerNoStorage(chave, CAMINHO_INEXISTENTE);
    respostaAusente = "sucesso";
  } catch (e) {
    respostaAusente = e.message;
  }
  console.log(`  nota   | DELETE de objeto ausente -> ${respostaAusente}`);

  // ─── 5. NOVA TENTATIVA ──────────────────────────────────────────────────
  console.log("\n  -- segunda passada: credencial correta --");
  const r2 = await purge.expurgarDocumento(doc, politica, portas({ chaveParaRemover: chave }), new Date(), 1);
  reg(r2.status === "expurgado", `N1. a nova tentativa devolveu '${r2.status}' (esperado expurgado)`);
  reg(r2.status === "expurgado" && r2.reason === "BIOMETRIC_EXPIRED",
    `N2. motivo da decisão: ${r2.status === "expurgado" ? r2.reason : "-"}`);
  reg(!(await existeNoStorage(chave, CAMINHO)), "N3. o arquivo SAIU do bucket");
  reg(registroDoDocumento("purged_at") !== "NULO", "N4. purged_at preenchido só agora");
  reg(contarTrilha("purge") === 1, "N5. exatamente uma linha `purge`");
  reg(contarTrilha("upload") === 1, "N6. a trilha SOBREVIVEU ao expurgo");

  // ─── 6. Repetir é inofensivo ────────────────────────────────────────────
  console.log("\n  -- terceira passada: idempotência --");
  const r3 = await purge.expurgarDocumento(
    { ...doc, purgedAt: new Date().toISOString() },
    politica,
    portas({ chaveParaRemover: chave }),
    new Date(),
    1,
  );
  reg(r3.status === "dispensado" && r3.reason === "ALREADY_PURGED",
    `I1. repetição dispensada: ${r3.status}/${r3.status === "dispensado" ? r3.reason : "-"}`);
  reg(contarTrilha("purge") === 1, "I2. nenhuma segunda linha `purge`");

  // ─── 7. Desfaz o prazo de teste ─────────────────────────────────────────
  console.log("\n  -- retenção de produção volta a NÃO aprovada --");
  sql(
    `update public.document_retention_policy
        set biometric_days = null, document_image_days = null, abandoned_upload_hours = null,
            approved_by = null, approved_at = null, updated_at = now();`,
  );
  const prazoFinal = sql(
    `select coalesce(biometric_days::text,'nulo') || '/' ||
            coalesce(document_image_days::text,'nulo') || '/' ||
            coalesce(abandoned_upload_hours::text,'nulo') || ' aprovador=' ||
            coalesce(approved_by::text,'nulo')
       from public.document_retention_policy;`,
  );
  reg(prazoFinal === "nulo/nulo/nulo aprovador=nulo",
    `R1. prazo de produção sem valor aprovado (${prazoFinal})`);

  // ─── evidência deixada atrás, contada ───────────────────────────────────
  const trilhaFinal = sql(
    `select string_agg(action || '=' || n, ' ') from (
       select action, count(*) n from public.document_audit group by action order by action) t;`,
  );
  const docsFinal = sql(`select count(*) from public.validation_documents;`);
  const objetosFinal = sql(
    `select count(*) from storage.objects where bucket_id = '${BUCKET}';`,
  );

  const desteRun = sql(
    `select string_agg(action || '=' || n, ' ') from (
       select action, count(*) n from public.document_audit
        where object_path = '${CAMINHO}' group by action order by action) t;`,
  );
  console.log("\n  Evidência desta execução (preservada, não apagável):");
  console.log(`    trilha do caminho desta execução ... ${desteRun}`);
  console.log("  Acumulado da instância sintética:");
  console.log(`    document_audit ......... ${trilhaFinal}`);
  console.log(`    validation_documents ... ${docsFinal}`);
  console.log(`    objetos no bucket ...... ${objetosFinal}`);

  const falhou = resultados.filter((l) => l.startsWith("FALHOU")).length;
  console.log(`\n  TOTAL OK=${resultados.length - falhou}  FALHOU=${falhou}`);
  return falhou;
}

main()
  .then((falhou) => {
    rmSync(TMP, { recursive: true, force: true });
    process.exit(falhou > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("\nERRO: " + (e.stderr || e.message));
    rmSync(TMP, { recursive: true, force: true });
    process.exit(2);
  });
