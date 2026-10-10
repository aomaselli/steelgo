# Migration do #13 — prova em banco limpo

Executada em 09/10/2026. Prova duas coisas que o histórico de migrations não
prova:

1. o arquivo **final** aplica numa base limpa, de uma vez;
2. o descartável de trabalho **corresponde** a esse arquivo.

A segunda precisava de prova porque o arquivo mudou *depois* da primeira
aplicação — ganhou o `check` do ator de sistema e as duas colunas de falha de
expurgo, aplicadas em separado. A linha de `supabase_migrations.schema_migrations`
continua dizendo "20261009090000 aplicada" e não distingue um estado do outro.

## O arquivo

```
supabase/migrations/20261009090000_validation_documents.sql
16.014 bytes
sha256  3b6b11360de41973394f95e29012458f08c05c0fc5294242f07e22dc6df001e5
```

## A pilha de prova

Nova, exclusiva, com projeto, diretório, volumes e portas próprios. Nenhuma
pilha existente foi alterada e nenhum volume removido.

| | |
|---|---|
| projeto | `fcgprova13` |
| diretório | `C:\Users\aomas\SteelGo-Fase0\prova-migration13-20261009` |
| volumes | `supabase_db_fcgprova13`, `supabase_storage_fcgprova13` |
| portas | 57326 shadow · 57327 api · 57328 banco |
| contêiner | `4c4ddfb564803884c8162d666a4179549934f7962162e60facdee9524d4d746e` |
| `system_identifier` | `7694775194689908774` |
| apelido no validador | `prova13` |

Registrada em `destinos.local` com a identidade completa. As seis barreiras do
validador passam, e a negação permanente da instância proibida continua
valendo — ela é lida do `project_id` do `supabase/config.toml` deste
repositório e recusada em duas conferências independentes, por apelido e por
contêiner.

## A sequência, reproduzível

```bash
# 1. pilha nova, com config própria
mkdir -p "$DIR" && cd "$DIR"
npx supabase init --workdir .
# config.toml: project_id=fcgprova13, api=57327, db=57328, shadow=57326,
#              auth.site_url=http://127.0.0.1:57327

# 2. a base: TODAS as migrations anteriores, MENOS a candidata
cp <repo>/supabase/migrations/*.sql supabase/migrations/
rm -f supabase/migrations/20261009090000_validation_documents.sql   # 87 restantes
npx supabase start --workdir .

# 3. conferir que a base está limpa
#    87 versões · candidata ausente · nenhuma das 5 tabelas do #13

# 4. atores sintéticos que a bateria exige (os mesmos UUIDs do `simulacao`)

# 5. a candidata, UMA vez, com o registro no histórico, na MESMA transação
bash scripts/banco/destino-autorizado.sh prova13 -1 -At \
     --sql-arquivo <migration + insert no schema_migrations>

# 6. a bateria
bash scripts/banco/destino-autorizado.sh prova13 -1 \
     --sql-arquivo supabase/tests/validation_documents_matriz.sql

# 7. a impressão estrutural das duas instâncias, e o diff
for d in prova13 simulacao; do
  bash scripts/banco/destino-autorizado.sh "$d" \
       --sql-arquivo scripts/homologacao/impressao-estrutural.sql > estrutura-$d.txt
done
diff estrutura-prova13.txt estrutura-simulacao.txt
```

## Resultados

**Aplicação.** Exit 0. Histórico 87 → 88. A migration e o registro no histórico
entraram na mesma transação: se qualquer coisa falhasse, não ficaria nem o
esquema nem a linha dizendo que ele existe — que é o estado que mais custa a
depurar depois. O bloco *fail-closed* no fim do arquivo executou.

**Bateria de acesso e invariantes: 37 de 37**, as mesmas que passam no
descartável de trabalho. Cobre bucket privado, matriz de acesso por papel,
trilha append-only, amarra do ator de sistema, consentimento por versão e
sha256, retenção sem prazo inventado, e a distinção entre expurgo que falhou e
tarefa não executada.

**Comparação por definição: 104 linhas, idênticas.**

```
 1 BUCKET      43 COLUNA     5 COMENTARIO   21 CONSTRAINT
 1 FUNCAO       8 GRANT     10 INDICE        9 POLICY
 5 RLS          1 TRIGGER
```

Não é comparação de nomes. `scripts/homologacao/impressao-estrutural.sql`
emite, para cada objeto, o texto que o próprio Postgres devolve:
`pg_get_constraintdef`, `qual` e `with_check` das policies com os papéis a que
se aplicam, `pg_get_functiondef` inteiro, `pg_get_triggerdef`, `indexdef`, tipo
e default de cada coluna, privilégios de `anon` e `authenticated`, e os
comentários de tabela. Duas instâncias com uma policy de mesmo nome e `using`
diferente apareceriam no `diff`; nenhuma apareceu.

## O que isto não cobre

A comparação é entre a pilha de prova e o descartável de trabalho. Prova que o
arquivo final produz o estado que o descartável tem — não diz nada sobre
produção, que segue sem esta migration e sem autorização para recebê-la.

Os atores sintéticos do passo 4 são pré-requisito da bateria, não da migration:
a migration aplica numa base sem nenhum usuário. Foram criados com os mesmos
UUIDs do `simulacao` de propósito, para tirar uma variável da comparação.
