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

# Faz o psql simulado emitir EXATAMENTE o que a lista versionada declara para
# aquela suíte: tantas linhas de veredito, terminando no marcador final. É o que
# permite exercitar, sob simulação, a checagem de asserções executadas e de
# saída completa contra os valores de verdade da lista.
prepara_sim_para() {
  local arq="$1" rel linha
  rel=${arq#"$RAIZ/"}
  linha=$(grep -F "  $rel  " "$RAIZ/scripts/banco/suites-permitidas.txt" 2>/dev/null | head -1)
  if [ -z "$linha" ]; then unset SIM_NOTICES SIM_ULTIMA; return; fi
  export SIM_NOTICES=$(printf '%s' "$linha" | awk '{print $4}')
  export SIM_ULTIMA=$(printf '%s' "$linha" | awk '{ for (i=5;i<=NF;i++) printf "%s%s", $i, (i<NF?OFS:"") }')
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
    prepara_sim_para "$arq"
    PERMITE_EXEC=1 aceita "aceita $(basename "$arq") (bateria)" teste --sql-arquivo "$arq" --permitir-parada-desligada
    unset SIM_NOTICES SIM_ULTIMA
  else
    aceita "aceita $(basename "$arq")" teste --sql-arquivo "$arq" -1
  fi
done < <(ls "$RAIZ"/supabase/migrations/*.sql 2>/dev/null | tail -5; ls "$RAIZ"/supabase/tests/*.sql 2>/dev/null)
if [ "$encontrados" -eq 0 ]; then
  echo "  FALHOU  nenhum SQL do repositório foi encontrado para testar"; falha_
fi

echo
echo "=============================================================="
echo "I. A autorização é por LISTA REVISADA, não por texto"
echo "=============================================================="
# Bateria mínima, com a forma das de supabase/tests: desliga a parada, relata
# por `raise notice` com OK/FALHOU, e desfaz tudo.
bateria() {
  printf '\\set ON_ERROR_STOP off\nbegin;\n%s\ndo $x$ begin raise notice $$1. verificacao ... OK$$; end $x$;\nrollback;\n' "$1"
}
bateria "select 1;" > "$TMP/bateria.sql"
export DESTINO_AUTORIZADO_SUITES="$TMP/suites.txt"
: > "$TMP/suites.txt"

recusa "não listada: recusada"                    "não está na lista" \
  -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada

# Cinco campos: hash, caminho, erros esperados, asserções mínimas, marcador final.
MARCADOR="1. verificacao simulada"
# O hash é o do texto CANÔNICO — fim de linha normalizado — que é o mesmo que o
# validador calcula e o mesmo que ele manda para o psql.
HASH_BAT=$(printf '%s\n' "$(sed 's/\r$//' "$TMP/bateria.sql")" | sha256sum | awk '{print $1}')
printf '%s  %s  0  1  %s\n' "$HASH_BAT" "bateria.sql" "$MARCADOR" > "$TMP/suites.txt"
PERMITE_EXEC=1 aceita "listada: aceita"           teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada

# CONTRATO DE ERROS: obrigatório e numérico. O curinga saiu do caminho de
# aprovação — ele deixava a suíte rodar com essa conferência desligada, que é o
# mesmo que aprovar sem contrato.
printf '%s  %s  *  1  %s\n' "$HASH_BAT" "bateria.sql" "$MARCADOR" > "$TMP/suites-curinga.txt"
( export DESTINO_AUTORIZADO_SUITES="$TMP/suites-curinga.txt"
  recusa "curinga em erros esperados"              "campo 3" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )
printf '%s  %s\n' "$HASH_BAT" "bateria.sql" > "$TMP/suites-sem-erros.txt"
( export DESTINO_AUTORIZADO_SUITES="$TMP/suites-sem-erros.txt"
  recusa "sem contrato de erros revisado"          "campo 3" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

# A lista tem de declarar os dois campos novos; sem eles a suíte não roda.
printf '%s  %s  0\n' "$HASH_BAT" "bateria.sql" > "$TMP/suites-sem-campos.txt"
( export DESTINO_AUTORIZADO_SUITES="$TMP/suites-sem-campos.txt"
  recusa "lista sem quantas asserções"            "campo 4" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )
printf '%s  %s  0  1\n' "$HASH_BAT" "bateria.sql" > "$TMP/suites-sem-marcador.txt"
( export DESTINO_AUTORIZADO_SUITES="$TMP/suites-sem-marcador.txt"
  recusa "lista sem marcador final"               "campo 5" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

# FIM DE LINHA NÃO É MUDANÇA DE CONTEÚDO. A mesma suíte revisada, conferida em
# CRLF, tem de continuar autorizada — senão a autorização depende de como o
# repositório foi clonado. Foi a própria suíte que acusou isso, recusando as
# oito suítes reais quando o disco tinha LF e a lista guardava outro hash.
# Mesmo nome de arquivo, noutro diretório, só que em CRLF — a lista autoriza
# pelo caminho declarado, então o nome tem de ser o mesmo.
mkdir -p "$TMP/crlf"
sed 's/$/\r/' "$TMP/bateria.sql" > "$TMP/crlf/bateria.sql"
PERMITE_EXEC=1 aceita "mesma suíte em CRLF: continua autorizada" \
  teste --sql-arquivo "$TMP/crlf/bateria.sql" --permitir-parada-desligada

# A LISTA também chega em CRLF numa conferência no Windows. Sem tirar o CR, o
# marcador final carregaria um `\r` invisível e a suíte reprovaria por "saída
# incompleta" sem nada de errado.
sed 's/$/\r/' "$TMP/suites.txt" > "$TMP/suites-crlf.txt"
( export DESTINO_AUTORIZADO_SUITES="$TMP/suites-crlf.txt"
  PERMITE_EXEC=1 aceita "lista em CRLF: marcador final ainda casa" \
    teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

# EXECUTA EXATAMENTE O QUE FOI AUTORIZADO. O psql simulado guarda o que
# recebeu; o sha disso tem de ser o sha que a lista autoriza. Normalizar para
# validar e mandar outra coisa para o banco seria o buraco que a lista fechou.
export SIM_STDIN="$TMP/recebido.sql"
PERMITE_EXEC=1 aceita "(preparo) execução a partir do arquivo em CRLF" \
  teste --sql-arquivo "$TMP/crlf/bateria.sql" --permitir-parada-desligada
sha_recebido=$(sha256sum "$SIM_STDIN" | awk '{print $1}')
if [ "$sha_recebido" = "$HASH_BAT" ]; then
  echo "  ok      o psql recebeu exatamente o conteúdo autorizado"; ok_
else
  echo "  FALHOU  o psql recebeu conteúdo diferente do autorizado"
  echo "            autorizado: $HASH_BAT"
  echo "            recebido:   $sha_recebido"
  falha_
fi
unset SIM_STDIN

# CR NO MEIO DA LINHA É CONTEÚDO, não fim de linha. Dois arquivos que diferem
# só por isso são arquivos diferentes, e o segundo não está autorizado.
sed 's/select 1;/select 1;\r-- resto/' "$TMP/bateria.sql" > "$TMP/cr-no-meio.sql" 2>/dev/null \
  || printf '\\set ON_ERROR_STOP off\nbegin;\nselect 1;\r-- resto\ndo $x$ begin raise notice $$1. verificacao ... OK$$; end $x$;\nrollback;\n' > "$TMP/cr-no-meio.sql"
mkdir -p "$TMP/meio"; cp "$TMP/cr-no-meio.sql" "$TMP/meio/bateria.sql"
recusa "CR no meio da linha é mudança de conteúdo" "não está na lista" \
  -- teste --sql-arquivo "$TMP/meio/bateria.sql" --permitir-parada-desligada

cp "$TMP/bateria.sql" "$TMP/bateria-editada.sql"
printf -- '-- comentario acrescentado depois da revisao\n' >> "$TMP/bateria-editada.sql"
recusa "editada depois da revisão: caduca"        "não está na lista" \
  -- teste --sql-arquivo "$TMP/bateria-editada.sql" --permitir-parada-desligada

mkdir -p "$TMP/outro"; cp "$TMP/bateria.sql" "$TMP/outro/bateria-mesma.sql"
recusa "mesmo conteúdo, outro caminho"            "outro caminho" \
  -- teste --sql-arquivo "$TMP/outro/bateria-mesma.sql" --permitir-parada-desligada

recusa "-c com a permissão"                       "por ARQUIVO" \
  -- teste -c 'select 1;' --permitir-parada-desligada
recusa "permissão junto de --single-transaction"  "não se combina" \
  -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada -1
( export DESTINO_AUTORIZADO_SUITES="$TMP/nao-existe.txt"
  recusa "lista ausente"                          "Não há lista" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

printf '\\unset ON_ERROR_STOP\nselect 1;\n' > "$TMP/unset.sql"
recusa "\\unset ON_ERROR_STOP sem a permissão"    "unset"          -- teste --sql-arquivo "$TMP/unset.sql"
recusa "AUTOCOMMIT barrado mesmo com a permissão" "AUTOCOMMIT" \
  -- teste -c '\set AUTOCOMMIT off' --permitir-parada-desligada

echo
echo "=============================================================="
echo "J. A permissão NUNCA alcança migration"
echo "=============================================================="
# Seguir depois do erro é exatamente o que NÃO se pode fazer ao aplicar
# migration: metade aplicada e registrada como inteira seria o pior estado
# possível. Nada de nomear arquivos que podem não existir na branch — um `for`
# sobre glob vazio passa calado, e caso que não roda parece caso que passou.
migracoes=0
while IFS= read -r m; do
  [ -r "$m" ] || continue
  migracoes=$((migracoes+1))
  recusa "migration real: $(basename "$m" | cut -c1-26)" "supabase/migrations" \
    -- teste --sql-arquivo "$m" --permitir-parada-desligada
done < <(ls "$RAIZ"/supabase/migrations/*.sql 2>/dev/null | tail -2)

if [ "$migracoes" -eq 0 ]; then
  echo "  FALHOU  nenhuma migration encontrada para testar a recusa"; falha_
else
  # Mesmo copiada para fora da pasta: continua fora da lista.
  ultima=$(ls "$RAIZ"/supabase/migrations/*.sql | tail -1)
  { printf '\\set ON_ERROR_STOP off\n'; cat "$ultima"; } > "$TMP/disfarce.sql"
  recusa "migration copiada para fora da pasta"   "não está na lista" \
    -- teste --sql-arquivo "$TMP/disfarce.sql" --permitir-parada-desligada
fi

# E as suítes revisadas de verdade, com a lista versionada do repositório.
( export DESTINO_AUTORIZADO_SUITES="$RAIZ/scripts/banco/suites-permitidas.txt"
  listadas=0
  while IFS= read -r linha; do
    case "$linha" in ""|\#*) continue ;; esac
    arq=$(printf '%s' "$linha" | awk '{print $2}')
    [ -r "$RAIZ/$arq" ] || continue
    listadas=$((listadas+1))
    prepara_sim_para "$RAIZ/$arq"
    PERMITE_EXEC=1 aceita "suíte revisada: $(basename "$arq")" \
      teste --sql-arquivo "$RAIZ/$arq" --permitir-parada-desligada
  done < "$RAIZ/scripts/banco/suites-permitidas.txt"
  if [ "$listadas" -eq 0 ]; then
    echo "  FALHOU  a lista versionada não trouxe nenhuma suíte"; falha_
  fi )

echo
echo "=============================================================="
echo "K. O veredito vem da SAÍDA, não do código de saída do psql"
echo "=============================================================="
# Com ON_ERROR_STOP desligado o psql termina em 0 mesmo com instrução que
# falhou, e as baterias relatam por `raise notice`, que não muda código nenhum.
# Quem converte relatório em veredito é o validador.
export DESTINO_AUTORIZADO_SUITES="$TMP/suites.txt"
( export SIM_VEREDITO=ok
  PERMITE_EXEC=1 aceita "suíte relata OK -> aprovado" \
    teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )
( export SIM_VEREDITO=falhou
  PERMITE_EXEC=1 recusa "suíte relata FALHOU -> REPROVADO" "REPROVADO" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )
( export SIM_VEREDITO=mudo
  PERMITE_EXEC=1 recusa "suíte sem marcador -> REPROVADO" "não chegou a julgar" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

# SAÍDA INCOMPLETA: a suíte emitiu veredito, mas parou antes da última asserção.
( export SIM_VEREDITO=incompleto
  PERMITE_EXEC=1 recusa "última asserção não é a declarada -> REPROVADO" "saída incompleta" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

# INCONCLUSIVO: "SEM DADOS" não é aprovação. A contagem e o marcador final
# continuam satisfeitos nesse caso — só o inconclusivo reprova.
( export SIM_VEREDITO=semdados
  PERMITE_EXEC=1 recusa "asserção SEM DADOS -> REPROVADO" "inconclusiva" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

# ASSERÇÕES APROVADAS: a lista declara três, a saída trouxe uma.
printf '%s  %s  0  3  %s\n' "$HASH_BAT" "bateria.sql" "$MARCADOR" > "$TMP/suites-tres.txt"
( export DESTINO_AUTORIZADO_SUITES="$TMP/suites-tres.txt"
  export SIM_VEREDITO=ok
  PERMITE_EXEC=1 recusa "menos asserções que o declarado -> REPROVADO" "a lista declara 3" \
    -- teste --sql-arquivo "$TMP/bateria.sql" --permitir-parada-desligada )

echo
echo "=============================================================="
passou=$(wc -l < "$PLACAR_OK"); falhou=$(wc -l < "$PLACAR_FALHA")
printf 'RESULTADO: %d passaram, %d falharam\n' "$passou" "$falhou"
echo "=============================================================="
[ "$falhou" -eq 0 ]
