#!/usr/bin/env bash
# =============================================================================
# Regressões do validador de destino — com Docker e psql SIMULADOS
# =============================================================================
# Nenhum contêiner é tocado e nenhuma conexão de banco é aberta. Um `docker`
# simulado entra na frente do PATH e devolve valores vindos de variáveis de
# ambiente, de modo que cada caso altere UM atributo por vez: assim a recusa
# observada só pode ser atribuída à barreira em teste.
#
# A lista de destinos usada aqui é SINTÉTICA, escrita num diretório temporário.
# Não depende do `destinos.local` de ninguém e não carrega identificador de
# máquina nenhuma.
#
#   bash scripts/banco/testes/validador.test.sh
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDADOR="$AQUI/../destino-autorizado.sh"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cp "$AQUI/docker-simulado.sh" "$TMP/bin/docker"
chmod +x "$TMP/bin/docker"
export PATH="$TMP/bin:$PATH"

# --- lista de destinos sintética -------------------------------------------
CT_FALSO="aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff00000000111111111"
CT_FALSO="${CT_FALSO:0:64}"
SYSID_FALSO="1234567890123456789"
PROJETO_FALSO="projetodeteste"
DIR_FALSO="/pilha/de/teste"

# O id da instância protegida é lido do mesmo lugar que o validador lê: o
# project_id deste repositório. A armadilha abaixo existe para provar que um
# destino APONTANDO para ela é recusado na barreira 0.
PROTEGIDO=$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' \
  "$RAIZ/supabase/config.toml" | head -1)

cat > "$TMP/destinos.local" <<EOF
# lista sintética, só para os testes
teste|$PROJETO_FALSO|$DIR_FALSO|65322|65321|$CT_FALSO|$SYSID_FALSO
armadilha|$PROTEGIDO|$DIR_FALSO|65322|65321|$CT_FALSO|$SYSID_FALSO
EOF
export DESTINO_AUTORIZADO_CONFIG="$TMP/destinos.local"

# Valores CORRETOS do destino 'teste'. Cada caso sobrescreve um só.
export SIM_ID="$CT_FALSO"
export SIM_PROJECT="$PROJETO_FALSO"
export SIM_WORKDIR="$DIR_FALSO"
export SIM_PGPORT="65322"
export SIM_APIPORT="65321"
export SIM_SYSID="$SYSID_FALSO"
export SIM_EXISTE="1"
export SIM_ARGV="$TMP/argv.log"

# Os casos da seção D rodam em subshell, para isolar a variável de ambiente
# alterada em cada um. Contador em variável NÃO atravessa subshell: uma falha ali
# seria impressa e sumiria da conta, e a suíte terminaria verde mesmo tendo
# falhado. Por isso o placar vive em arquivo.
PLACAR_OK="$TMP/placar-ok"; PLACAR_FALHA="$TMP/placar-falha"
: > "$PLACAR_OK"; : > "$PLACAR_FALHA"
ok_()    { echo x >> "$PLACAR_OK"; }
falha_() { echo x >> "$PLACAR_FALHA"; }

# recusa <descrição> <trecho esperado em stderr> -- <argumentos do validador>
recusa() {
  local desc="$1" esperado="$2"; shift 3
  : > "$SIM_ARGV"
  local saida rc
  saida="$("$VALIDADOR" "$@" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "  FALHOU  $desc -> ACEITOU (deveria recusar)"; falha_; return
  fi
  if ! printf '%s' "$saida" | grep -qiF "$esperado"; then
    echo "  FALHOU  $desc -> recusou, mas sem '$esperado'"
    printf '%s\n' "$saida" | sed 's/^/            /' | head -4
    falha_; return
  fi
  if grep -q 'docker \[exec\]' "$SIM_ARGV" 2>/dev/null && [ "${PERMITE_EXEC:-0}" = "0" ]; then
    echo "  FALHOU  $desc -> recusou, mas chegou a executar comando no contêiner"
    falha_; return
  fi
  echo "  ok      $desc"; ok_
}

aceita() {
  local desc="$1"; shift
  : > "$SIM_ARGV"
  local saida rc
  saida="$("$VALIDADOR" "$@" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "  FALHOU  $desc -> RECUSOU (deveria aceitar), rc=$rc"
    printf '%s\n' "$saida" | sed 's/^/            /' | head -6
    falha_; return
  fi
  echo "  ok      $desc"; ok_
}

afirma_argv() {
  local desc="$1" padrao="$2"
  if grep -qF "$padrao" "$SIM_ARGV"; then
    echo "  ok      $desc"; ok_
  else
    echo "  FALHOU  $desc -> '$padrao' ausente da linha de comando registrada"
    sed 's/^/            /' "$SIM_ARGV" | tail -3
    falha_
  fi
}

echo "=============================================================="
echo "A. Parâmetros capazes de alterar a conexão"
echo "=============================================================="
recusa "-h host alternativo"      "alterar a conexão" -- teste -c "select 1;" -h 10.0.0.9
recusa "-p outra porta"           "alterar a conexão" -- teste -c "select 1;" -p 5432
recusa "-U outro usuário"         "alterar a conexão" -- teste -c "select 1;" -U postgres2
recusa "-d outra base"            "alterar a conexão" -- teste -c "select 1;" -d outra
recusa "--dbname= outra base"     "alterar a conexão" -- teste -c "select 1;" --dbname=outra
recusa "URI de conexão"           "alterar a conexão" -- teste -c "select 1;" postgresql://u@h/db
recusa "-W pede senha"            "alterar a conexão" -- teste -c "select 1;" -W
recusa "-l lista bases"           "alterar a conexão" -- teste -c "select 1;" -l
recusa "curtas agrupadas -tAh"    "alterar a conexão" -- teste -c "select 1;" -tAh
recusa "--service"                "alterar a conexão" -- teste -c "select 1;" --service=prod

echo
echo "=============================================================="
echo "B. Outros parâmetros e payloads fora da lista de permissão"
echo "=============================================================="
recusa "-f lê arquivo no contêiner" "inspeciona"       -- teste -f /tmp/x.sql
recusa "-v muda ON_ERROR_STOP"      "não é permitido"  -- teste -c "select 1;" -v ON_ERROR_STOP=0
recusa "opção desconhecida"         "lista de permissão" -- teste -c "select 1;" --amanha
recusa "sem SQL nenhum"             "sem SQL"          -- teste
recusa "SQL com \\connect"          "connect"          -- teste -c '\connect outra'
recusa "SQL com \\c"                "connect"          -- teste -c 'select 1; \c outra'
recusa "SQL com \\! shell"          "executa shell"    -- teste -c 'select 1; \! id'
recusa "SQL canalizado para shell"  "canaliza"         -- teste -c 'select 1; \o | sh'

echo
echo "=============================================================="
echo "C. Destino: apelido e instância protegida"
echo "=============================================================="
recusa "apelido inexistente"               "não está na lista" -- producao -c "select 1;"
recusa "id protegido usado como apelido"   "não está na lista" -- "$PROTEGIDO" -c "select 1;"
recusa "destino que APONTA para a protegida" "instância protegida" -- armadilha -c "select 1;"

echo
echo "=============================================================="
echo "D. Barreiras, uma alteração por vez"
echo "=============================================================="
( export SIM_EXISTE=0;            recusa "contêiner ausente"       "não existe"          -- teste -c "select 1;" )
( export SIM_ID="${SIM_ID%1}0";   recusa "ID completo diferente"   "ID completo"         -- teste -c "select 1;" )
( export SIM_PROJECT="outro";     recusa "rótulo de projeto"       "id do projeto"       -- teste -c "select 1;" )
( export SIM_WORKDIR="/outro";    recusa "rótulo de diretório"     "diretório"           -- teste -c "select 1;" )
( export SIM_PGPORT="65399";      recusa "porta do PostgreSQL"     "porta do PostgreSQL" -- teste -c "select 1;" )
( export SIM_APIPORT="65399";     recusa "porta da API"            "porta da API"        -- teste -c "select 1;" )
( export SIM_SYSID="999";  PERMITE_EXEC=1 \
                                  recusa "system_identifier"       "system_identifier"   -- teste -c "select 1;" )

echo
echo "=============================================================="
echo "E. Caminho aprovado, e o que vai de fato para o contêiner"
echo "=============================================================="
aceita "--conferir passa as seis barreiras" --conferir teste
aceita "-c com SQL aceito"                  teste -c "select 1;"
afirma_argv "o exec usa o ID COMPLETO validado" "[exec] [-i] [$SIM_ID]"
afirma_argv "ON_ERROR_STOP=1 imposto"           "[-v] [ON_ERROR_STOP=1]"
afirma_argv "usuário fixo"                      "[-U] [postgres]"
afirma_argv "base fixa"                         "[-d] [postgres]"
afirma_argv "socket local fixo"                 "[-h] [/var/run/postgresql]"
afirma_argv "psqlrc desligado"                  "[-X]"

if grep '\[exec\]' "$SIM_ARGV" | grep -q "supabase_db_"; then
  echo "  FALHOU  o exec ainda cita o nome do contêiner"; falha_
else
  echo "  ok      nenhum exec pelo nome do contêiner"; ok_
fi

printf 'select 1;\n' > "$TMP/consulta.sql"
aceita "--sql-arquivo lido do host" teste --sql-arquivo "$TMP/consulta.sql" -1
afirma_argv "--sql-arquivo também impõe a conexão" "[-v] [ON_ERROR_STOP=1]"

printf 'select 1;\n\\c outra\n' > "$TMP/ruim.sql"
recusa "--sql-arquivo com \\connect" "connect" -- teste --sql-arquivo "$TMP/ruim.sql"

echo
echo "=============================================================="
echo "F. Inclusão de arquivo e variáveis de segurança por metacomando"
echo "=============================================================="
recusa "\\i inclui arquivo do contêiner"  "inclui outro arquivo" -- teste -c 'select 1; \i /tmp/outro.sql'
recusa "\\ir inclui caminho relativo"     "inclui outro arquivo" -- teste -c 'select 1; \ir outro.sql'
recusa "\\include"                        "inclui outro arquivo" -- teste -c 'select 1; \include /tmp/o.sql'
recusa "\\include_relative"               "inclui outro arquivo" -- teste -c 'select 1; \include_relative o.sql'
recusa "\\unset ON_ERROR_STOP"            "unset ON_ERROR_STOP"  -- teste -c '\unset ON_ERROR_STOP'
recusa "\\unset AUTOCOMMIT"               "AUTOCOMMIT"           -- teste -c '\unset AUTOCOMMIT'
recusa "\\set ON_ERROR_STOP off"          "afrouxa"              -- teste -c '\set ON_ERROR_STOP off'
recusa "\\set ON_ERROR_STOP 0"            "afrouxa"              -- teste -c '\set ON_ERROR_STOP 0'
recusa "\\set ON_ERROR_STOP sem valor"    "afrouxa"              -- teste -c '\set ON_ERROR_STOP'
recusa "\\set AUTOCOMMIT off"             "altera AUTOCOMMIT"    -- teste -c '\set AUTOCOMMIT off'

# O contrário também tem de valer: o que as migrations legítimas usam PASSA.
aceita "\\set ON_ERROR_STOP on (legítimo)" teste -c '\set ON_ERROR_STOP on'$'\n''select 1;'
aceita "\\set ON_ERROR_STOP 1 (legítimo)"  teste -c '\set ON_ERROR_STOP 1'$'\n''select 1;'

echo
echo "=============================================================="
echo "G. Entrada padrão compatível com --single-transaction"
echo "=============================================================="
aceita "-1 aceito junto do SQL" teste -1 -c "select 1;"
afirma_argv "o script acrescenta -f - internamente"  "[-f] [-]"
afirma_argv "-1 do chamador chega ao psql"           "[-1]"
afirma_argv "-f - vem DEPOIS da conexão fixa"        "[-v] [ON_ERROR_STOP=1] [-w] [-f] [-]"

echo
echo "=============================================================="
echo "H. Compatibilidade com o SQL legítimo das migrations"
echo "=============================================================="
# Uma lista de permissão que recusa o trabalho legítimo é tão inútil quanto uma
# que aceita tudo. Aqui passam os arquivos SQL de verdade deste repositório.
encontrados=0
while IFS= read -r arq; do
  encontrados=$((encontrados+1))
  if grep -qiE '\\set[[:space:]]+ON_ERROR_STOP[[:space:]]+(off|0|false)' "$arq"; then
    # Bateria de diagnóstico: desliga a parada de propósito, para rodar todas as
    # verificações e relatar. Precisa da permissão explícita de quem chama.
    aceita "aceita $(basename "$arq") (bateria)" teste --sql-arquivo "$arq" --permitir-parada-desligada
  else
    aceita "aceita $(basename "$arq")" teste --sql-arquivo "$arq" -1
  fi
done < <(ls "$RAIZ"/supabase/migrations/*.sql 2>/dev/null | tail -5; ls "$RAIZ"/supabase/tests/*.sql 2>/dev/null)
if [ "$encontrados" -eq 0 ]; then
  echo "  FALHOU  nenhum SQL do repositório foi encontrado para testar"; falha_
fi

echo
echo "=============================================================="
echo "I. A permissão de parada desligada é do OPERADOR, não do SQL"
echo "=============================================================="
# Bateria mínima, com a forma das de supabase/tests: desliga a parada, julga a
# si mesma e desfaz tudo.
bateria() {
  printf '\\set ON_ERROR_STOP off\nbegin;\n%s\ndo $x$ begin raise notice $$VEREDITO: ok$$; end $x$;\nrollback;\n' "$1"
}
bateria "select 1;" > "$TMP/bateria.sql"

recusa "bateria SEM a permissão"                  "afrouxa"        -- teste --sql-arquivo "$TMP/bateria.sql"
aceita "bateria COM a permissão"                  teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada
recusa "permissão junto de --single-transaction"  "não se combina" \
  -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada -1
printf '\\unset ON_ERROR_STOP\nselect 1;\n' > "$TMP/unset.sql"
recusa "\\unset ON_ERROR_STOP sem a permissão"    "unset"          -- teste --sql-arquivo "$TMP/unset.sql"
recusa "AUTOCOMMIT barrado mesmo com a permissão" "AUTOCOMMIT" \
  -- teste -c '\set AUTOCOMMIT off' --permitir-parada-desligada

echo
echo "=============================================================="
echo "J. A permissão NUNCA alcança migration"
echo "=============================================================="
# Este é o ponto todo: seguir depois do erro é exatamente o que NÃO se pode
# fazer ao aplicar migration. Metade aplicada e registrada como inteira seria o
# pior estado possível.
# Migrations REAIS desta árvore, sejam quais forem. Nada de nomear arquivos que
# podem não existir na branch: um `for` sobre um glob vazio passa calado, e um
# caso que não roda parece um caso que passou.
migracoes=0
while IFS= read -r m; do
  [ -r "$m" ] || continue
  migracoes=$((migracoes+1))
  recusa "migration real + permissão: $(basename "$m" | cut -c1-26)" "supabase/migrations" \
    -- teste --sql-arquivo "$m" --permitir-parada-desligada
done < <(ls "$RAIZ"/supabase/migrations/*.sql 2>/dev/null | tail -2)

if [ "$migracoes" -eq 0 ]; then
  echo "  FALHOU  nenhuma migration encontrada para testar a recusa"; falha_
else
  # Mesmo disfarçada: conteúdo de migration copiado para fora da pasta.
  ultima=$(ls "$RAIZ"/supabase/migrations/*.sql | tail -1)
  { printf '\\set ON_ERROR_STOP off\n'; cat "$ultima"; } > "$TMP/disfarce.sql"
  recusa "migration disfarçada fora da pasta"     "rollback"       -- teste --sql-arquivo "$TMP/disfarce.sql" --permitir-parada-desligada
fi

bateria "insert into supabase_migrations.schema_migrations(version) values ('20261005120000');" > "$TMP/registra.sql"
recusa "escreve no registro de migrations"        "schema_migrations" -- teste --sql-arquivo "$TMP/registra.sql" --permitir-parada-desligada

printf '\\set ON_ERROR_STOP off\nbegin;\nselect 1;\ndo $x$ begin raise notice $$x$$; end $x$;\ncommit;\n' > "$TMP/comcommit.sql"
recusa "confirma transação (commit)"              "commit"         -- teste --sql-arquivo "$TMP/comcommit.sql" --permitir-parada-desligada

printf '\\set ON_ERROR_STOP off\nbegin;\nselect 1;\nrollback;\n' > "$TMP/semveredito.sql"
recusa "sem veredito próprio (nenhum raise)"      "veredito"       -- teste --sql-arquivo "$TMP/semveredito.sql" --permitir-parada-desligada

printf 'select 1;\n' > "$TMP/semoff.sql"
recusa "permissão em SQL que nem desliga a parada" "nem desliga"   -- teste --sql-arquivo "$TMP/semoff.sql" --permitir-parada-desligada

# E as baterias de verdade continuam passando, uma a uma.
for b in "$RAIZ"/supabase/tests/fcg_*.sql; do
  [ -r "$b" ] || continue
  if grep -qiE '\\set[[:space:]]+ON_ERROR_STOP[[:space:]]+(off|0|false)' "$b"; then
    aceita "bateria real: $(basename "$b")" teste --sql-arquivo "$b" --permitir-parada-desligada
  fi
done

echo
echo "=============================================================="
passou=$(wc -l < "$PLACAR_OK"); falhou=$(wc -l < "$PLACAR_FALHA")
printf 'RESULTADO: %d passaram, %d falharam\n' "$passou" "$falhou"
echo "=============================================================="
[ "$falhou" -eq 0 ]
