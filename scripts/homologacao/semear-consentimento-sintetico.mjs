/**
 * Publica um texto de consentimento SINTÉTICO num destino descartável.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM SCRIPT, E NÃO UMA TELA
 *
 * Publicar o texto é ato de operação, não de uso. `document_consent_texts` não
 * tem policy de insert — só o titular grava o próprio aceite, e ninguém
 * publica texto pelo cliente. Isso é deliberado: um texto de consentimento que
 * qualquer sessão pudesse publicar não seria um texto de consentimento.
 *
 * O corpo aqui é marcado como sintético no próprio corpo, de propósito. Se
 * algum dia este texto aparecer onde não devia, ele se denuncia.
 *
 * Uso:
 *   node scripts/homologacao/semear-consentimento-sintetico.mjs <apelido>
 *
 * O apelido é o do `destinos.local`. O validador de destino é quem decide se
 * ele pode receber escrita — este script não tem conexão própria.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DESTINO = process.argv[2];
if (!DESTINO) {
  console.error("uso: node scripts/homologacao/semear-consentimento-sintetico.mjs <apelido>");
  process.exit(2);
}

/** Admin sintético do destino de trabalho. Só ele publica. */
const PUBLICADOR = process.env.PUBLICADOR_SINTETICO ?? "5340d6e8-fadb-479d-8421-dc29ca44c606";

const VERSAO = `sintetica-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

const CORPO = `# Termo de consentimento — validação de identidade

**TEXTO SINTÉTICO DE TESTE.** Não é o termo de produção, não foi revisado pelo
jurídico e não vale como base legal para tratamento de dado de pessoa real.

## O que coletamos

Imagem da sua CNH (frente e verso) e uma selfie, para uma única finalidade:
conferir que você é quem diz ser e que está habilitado a dirigir.

## O que fazemos com isso

- guardamos em armazenamento privado, a que só você e o revisor da SteelGo
  alcançam;
- registramos cada acesso numa trilha que não guarda o documento;
- apagamos conforme o prazo de retenção aprovado.

## O que NÃO fazemos

- não compartilhamos com a transportadora nem com o embarcador — eles recebem o
  **resultado** da validação, não o seu rosto e o seu documento;
- não usamos para outra finalidade sem um novo consentimento seu.

## Nesta versão de demonstração

Nenhuma consulta a base oficial é feita. Este ambiente **não** aprova cadastro
e **não** libera viagem. O aceite registrado aqui é a base do tratamento que a
SteelGo faz — ele **não** é, e não substitui, a autorização que uma Gestora de
Consentimento Credenciada emite para consultar base oficial.

## Seus direitos

Você pode retirar o consentimento a qualquer momento. A retirada impede novas
emissões de acesso ao documento; ela não é, por si só, ordem de apagar — o que
acontece com o arquivo depende da finalidade e do prazo de retenção aprovado.
`;

const SHA = createHash("sha256").update(CORPO, "utf8").digest("hex");

const TMP = mkdtempSync(join(tmpdir(), "semente-"));
const arquivo = join(TMP, "semear.sql");

/** `$semente$` em vez de aspas: o corpo tem crases, aspas e markdown. */
writeFileSync(
  arquivo,
  `insert into public.document_consent_texts
     (purpose, version, body_md, body_sha256, published_by)
   values ('identity_validation', '${VERSAO}', $semente$${CORPO}$semente$,
           '${SHA}', '${PUBLICADOR}')
   on conflict (purpose, version) do update
     set body_md = excluded.body_md,
         body_sha256 = excluded.body_sha256,
         effective_from = now();

   -- Confere que o que ficou gravado é o que foi calculado aqui. O fluxo
   -- recalcula o sha256 do corpo a cada leitura e recusa divergência; melhor
   -- descobrir agora do que na tela.
   do $conferir$
   begin
     if not exists (
       select 1 from public.document_consent_texts
        where purpose = 'identity_validation' and version = '${VERSAO}'
          and encode(digest(body_md, 'sha256'), 'hex') = '${SHA}'
     ) then
       raise exception 'o sha256 gravado nao confere com o corpo';
     end if;
   end $conferir$;
`,
  "utf8",
);

const saida = execFileSync(
  "bash",
  ["scripts/banco/destino-autorizado.sh", DESTINO, "-1", "--sql-arquivo", arquivo],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

console.log(saida.trim());
console.log(`\n  versao .......... ${VERSAO}`);
console.log(`  sha256 do corpo . ${SHA}`);
console.log(`  bytes do corpo .. ${Buffer.byteLength(CORPO, "utf8")}`);
console.log("\n  Texto SINTETICO. Nao vale como base legal para dado real.");
