#!/usr/bin/env bash
# =============================================================================
# Validador de destino — destino explícito, conexão fixa
# =============================================================================
# LEIA O README DESTE DIRETÓRIO ANTES DE USAR. Em resumo: este script só deve
# receber SQL REVISADO e só alcança destinos EXPLICITAMENTE AUTORIZADOS, listados
# à mão num arquivo local que não é versionado. Ele não é um atalho para "rodar
# qualquer coisa no banco".
#
# POR QUE ELE EXISTE. Em 05/10/2026, durante um levantamento, dois laços sobre
# `docker ps | grep "^supabase_db_"` alcançaram a instância local do projeto
# principal — a protegida — com quatro SELECTs de contagem. Nenhuma escrita, mas
# acesso que não deveria ter havido. A causa foi VARRER em vez de NOMEAR o
# destino.
#
# A partir daqui: nada de laço sobre `docker ps`. Toda consulta declara UM
# destino, por apelido, e este script prova que o apelido corresponde à
# instância esperada antes de deixar qualquer comando rodar.
#
# SEIS CONFERÊNCIAS, todas obrigatórias. As cinco primeiras são sobre metadados
# do Docker e NÃO abrem conexão com banco nenhum. Só depois de todas passarem é
# que a sexta abre uma conexão, e ela faz exatamente uma consulta de identidade.
#
#   0. o id protegido é recusado antes de qualquer outra coisa
#   1. ID COMPLETO do contêiner PostgreSQL (64 hex)    == autorizado
#   2. rótulo `com.supabase.cli.project`               == esperado
#   3. rótulo `com.supabase.cli.workdir`               == esperado
#   4. PORTA publicada do PostgreSQL (5432/tcp)        == esperada
#   5. porta publicada do kong (8000/tcp)              == esperada
#   6. `system_identifier` do cluster PostgreSQL       == esperado
#
# POR QUE O ID COMPLETO E O system_identifier, SE JÁ HÁ RÓTULOS. Rótulo e nome
# de contêiner são texto que quem cria o contêiner escolhe: dois contêineres
# podem carregar o mesmo rótulo, e um `docker run --label` reproduz qualquer um
# deles. O ID completo é atribuído pelo Docker e identifica UM contêiner; o
# `system_identifier` é gravado pelo `initdb` no cluster e identifica UM
# diretório de dados — não acompanha um relabel nem uma recriação do contêiner.
# Juntos respondem "é esta instância?"; os rótulos respondem só "alguém disse
# que é".
#
# Um ID completo que difere do esperado significa contêiner recriado. Nesse caso
# o script RECUSA e pede atualização manual da lista: reconhecer sozinho o
# substituto seria voltar a confiar no nome.
#
# OS ARGUMENTOS DE QUEM CHAMA NÃO MANDAM NA CONEXÃO. Passam por lista de
# permissão; `-h -p -U -d -w -W -l --service`, URI de conexão e `-f` são
# recusados pelo nome. O SQL entra só por `-c` ou `--sql-arquivo`, e é
# inspecionado: `\connect`, `\!`, canos para shell, inclusão de arquivo
# (`\i`, `\ir`, `\include`) e afrouxamento de ON_ERROR_STOP/AUTOCOMMIT são
# recusados. A conexão é montada aqui e aplicada DEPOIS dos argumentos de quem
# chama, de modo que a última palavra seja sempre do script.
#
# USO
#   ./destino-autorizado.sh <apelido> -c "select 1;"
#   ./destino-autorizado.sh <apelido> --sql-arquivo ./migration.sql -1
#   ./destino-autorizado.sh --listar
#   ./destino-autorizado.sh --conferir <apelido>     (só as seis barreiras)
#
# CONFIGURAÇÃO
#   Os destinos vivem em `destinos.local`, ao lado deste arquivo, que **não é
#   versionado** — ele contém caminhos e identificadores da máquina de quem
#   executa. Veja `destinos.exemplo`. A variável DESTINO_AUTORIZADO_CONFIG
#   aponta para outro arquivo, se preciso (é o que a suíte de testes usa).
# =============================================================================
set -euo pipefail

# Git Bash no Windows converte argumentos que parecem caminho POSIX antes de
# entregá-los a um executável nativo: `-h /var/run/postgresql` chegaria ao
# docker.exe como `C:/Program Files/Git/var/...` e a conexão fixa falharia em
# silêncio. Sem efeito em Linux e macOS.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"

erro() { echo "RECUSADO: $*" >&2; exit 2; }

# -----------------------------------------------------------------------------
# Instância protegida: NÃO é uma lista escrita à mão. É o `project_id` deste
# repositório — por definição, a pilha local do projeto principal. Assim ela não
# pode ficar desatualizada em relação ao que o repositório aponta, e esquecer de
# atualizar uma lista não vira permissão.
# -----------------------------------------------------------------------------
CONFIG_TOML="${DESTINO_AUTORIZADO_TOML:-$RAIZ/supabase/config.toml}"
[ -r "$CONFIG_TOML" ] || erro "não encontrei $CONFIG_TOML para descobrir qual é a instância protegida"
PROTEGIDO=$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$CONFIG_TOML" | head -1)
[ -n "$PROTEGIDO" ] || erro "não consegui ler project_id de $CONFIG_TOML"

# -----------------------------------------------------------------------------
# Destinos autorizados, de um arquivo local não versionado.
# Formato, um por linha:
#   apelido|id do projeto|diretório|porta pg|porta api|ID completo|system_identifier
# -----------------------------------------------------------------------------
DESTINOS_ARQUIVO="${DESTINO_AUTORIZADO_CONFIG:-$AQUI/destinos.local}"
[ -r "$DESTINOS_ARQUIVO" ] || erro "não há lista de destinos em '$DESTINOS_ARQUIVO'.
         Copie destinos.exemplo para destinos.local e preencha à mão.
         Sem lista explícita este script não alcança nada — é o ponto."

declare -A DESTINOS=()
linha_n=0
while IFS= read -r l || [ -n "$l" ]; do
  linha_n=$((linha_n+1))
  case "$l" in ""|\#*) continue ;; esac
  apel="${l%%|*}"; resto="${l#*|}"
  [ "$apel" != "$l" ] || erro "$DESTINOS_ARQUIVO linha $linha_n: formato inválido"
  campos=$(printf '%s' "$resto" | awk -F'|' '{print NF}')
  [ "$campos" -eq 6 ] || erro "$DESTINOS_ARQUIVO linha $linha_n: esperados 6 campos após o apelido, vieram $campos"
  DESTINOS["$apel"]="$resto"
done < "$DESTINOS_ARQUIVO"
[ "${#DESTINOS[@]}" -gt 0 ] || erro "$DESTINOS_ARQUIVO não lista nenhum destino"

# Conexão FIXA. Nada no comando de quem chama altera estes quatro valores.
PG_USUARIO="postgres"
PG_BASE="postgres"
PG_SOCKET="/var/run/postgresql"   # socket local DENTRO do contêiner validado
PG_PORTA_INTERNA="5432"

if [ "${1:-}" = "--listar" ]; then
  echo "destinos autorizados (de $DESTINOS_ARQUIVO):"
  for k in "${!DESTINOS[@]}"; do
    IFS='|' read -r id dir pgporta porta ctid sysid <<< "${DESTINOS[$k]}"
    printf '  %-12s id=%-24s pg=%s api=%s\n' "$k" "$id" "$pgporta" "$porta"
    printf '               contêiner=%s\n' "$ctid"
    printf '               cluster  =%s\n' "$sysid"
  done
  echo "protegida, sempre recusada: $PROTEGIDO  (project_id de $CONFIG_TOML)"
  exit 0
fi

SO_CONFERIR=0
if [ "${1:-}" = "--conferir" ]; then SO_CONFERIR=1; shift; fi

apelido="${1:-}"; shift || true
[ -n "$apelido" ] || erro "informe o apelido do destino (veja --listar)"
[ -n "${DESTINOS[$apelido]+x}" ] || erro "'$apelido' não está na lista de destinos autorizados"

IFS='|' read -r ID_ESPERADO DIR_ESPERADO PGPORTA_ESPERADA PORTA_ESPERADA CTID_ESPERADO SYSID_ESPERADO \
  <<< "${DESTINOS[$apelido]}"

# =============================================================================
# Argumentos de quem chama: lista de permissão
# =============================================================================
CONEXAO_RE='^(-h|--host|--host=|-p|--port|--port=|-U|--username|--username=|-d|--dbname|--dbname=|-w|--no-password|-W|--password|-l|--list|--service|--service=|postgres(ql)?://|.*=.*)$'

ARGS=()
SQL_DIRETO=""
SQL_ARQUIVO=""
TEM_PAYLOAD=0
PARADA_DESLIGADA_OK=0
PEDIU_TRANSACAO=0

recusa_conexao() {
  erro "parâmetro '$1' pode alterar a conexão (servidor, porta, usuário, base ou senha).
         O destino é fixado pelo apelido e não se negocia por linha de comando.
         SQL entra por -c \"…\" ou --sql-arquivo <arquivo no host>."
}

curtas_permitidas="tAXxqeE1"   # -t -A -X -x -q -e -E -1

while [ $# -gt 0 ]; do
  a="$1"
  case "$a" in
    -h|--host|-p|--port|-U|--username|-d|--dbname|-w|--no-password|-W|--password|-l|--list)
      recusa_conexao "$a" ;;
    --host=*|--port=*|--username=*|--dbname=*|--service=*|--service)
      recusa_conexao "${a%%=*}" ;;
    postgres://*|postgresql://*)
      recusa_conexao "URI de conexão" ;;
    -c|--command)
      [ $# -ge 2 ] || erro "'$a' sem SQL"
      SQL_DIRETO="$2"; TEM_PAYLOAD=1; shift 2 ;;
    --command=*)
      SQL_DIRETO="${a#--command=}"; TEM_PAYLOAD=1; shift ;;
    --sql-arquivo)
      [ $# -ge 2 ] || erro "'--sql-arquivo' sem caminho"
      SQL_ARQUIVO="$2"; TEM_PAYLOAD=1; shift 2 ;;
    --sql-arquivo=*)
      SQL_ARQUIVO="${a#--sql-arquivo=}"; TEM_PAYLOAD=1; shift ;;
    -f|--file|--file=*)
      erro "'-f' lê um arquivo DENTRO do contêiner, cujo conteúdo este script não
         inspeciona. Use --sql-arquivo <caminho no host>: o conteúdo é lido,
         conferido e enviado pela entrada padrão." ;;
    -v|--set|--set=*|--variable|--variable=*)
      erro "'$a' não é permitido: variáveis do psql mudam o tratamento de erro.
         ON_ERROR_STOP=1 é imposto por este script." ;;
    --permitir-parada-desligada)
      # Opção do OPERADOR, nunca do payload. Ver conferir_payload().
      PARADA_DESLIGADA_OK=1; shift ;;
    -1|--single-transaction)
      PEDIU_TRANSACAO=1; ARGS+=("$a"); shift ;;
    -t|--tuples-only|-A|--no-align|-x|--expanded|-q|--quiet|-X|--no-psqlrc|-e|--echo-queries|-E|--echo-hidden|--csv)
      ARGS+=("$a"); shift ;;
    -F|--field-separator|-R|--record-separator|-P|--pset)
      [ $# -ge 2 ] || erro "'$a' sem valor"
      ARGS+=("$a" "$2"); shift 2 ;;
    -[a-zA-Z][a-zA-Z]*)
      # Curtas agrupadas, por exemplo -tAX. Cada letra tem de estar na lista.
      letras="${a#-}"
      for (( i=0; i<${#letras}; i++ )); do
        c="${letras:$i:1}"
        case "$c" in
          [hpUdwWlfvF]) recusa_conexao "-$c (em '$a')" ;;
        esac
        [[ "$curtas_permitidas" == *"$c"* ]] \
          || erro "parâmetro '-$c' (em '$a') não está na lista de permissão"
        [ "$c" = "1" ] && PEDIU_TRANSACAO=1
      done
      ARGS+=("$a"); shift ;;
    *)
      if [[ "$a" =~ $CONEXAO_RE ]]; then recusa_conexao "$a"; fi
      erro "parâmetro '$a' não está na lista de permissão.
         Permitidos: -c/--command, --sql-arquivo, -1, -t, -A, -X, -x, -q, -e, -E,
         --csv, -F, -R, -P." ;;
  esac
done

# -----------------------------------------------------------------------------
# Inspeção do SQL: os metacomandos do psql são a mesma fuga por outro caminho.
# -----------------------------------------------------------------------------
conferir_payload() {
  local texto="$1" origem="$2"

  # --- desvio de conexão
  if printf '%s' "$texto" | grep -qiE '(^|[[:space:];])\\(c|connect)([[:space:]]|$)'; then
    erro "o SQL de $origem contém '\\connect', que reabre a conexão em outro
         servidor ou base. O destino é fixo."
  fi
  # --- fuga para o shell
  if printf '%s' "$texto" | grep -qE '(^|[[:space:];])\\!'; then
    erro "o SQL de $origem contém '\\!', que executa shell dentro do contêiner."
  fi
  if printf '%s' "$texto" | grep -qE '\\(o|g|copy)[[:space:]]+\|'; then
    erro "o SQL de $origem canaliza saída para shell ('\\o |', '\\g |', '\\copy |')."
  fi

  # --- INCLUSÃO DE ARQUIVO
  # `\i`, `\ir`, `\include`, `\include_relative` mandam o psql ler OUTRO arquivo,
  # de dentro do contêiner, que este script não viu. É o mesmo furo do `-f`, por
  # dentro do payload: o que foi inspecionado deixa de ser o que vai rodar.
  if printf '%s' "$texto" | grep -qiE '(^|[[:space:];])\\(i|ir|include|include_relative)([[:space:]]|$)'; then
    erro "o SQL de $origem inclui outro arquivo ('\\i', '\\ir', '\\include').
         O conteúdo incluído não passa por esta inspeção. Junte o SQL num
         arquivo só e passe por --sql-arquivo."
  fi

  # --- VARIÁVEIS DE SEGURANÇA
  # ON_ERROR_STOP=1 é o que faz uma falha no meio abortar a transação em vez de
  # seguir adiante. Desligá-lo por metacomando desfaz a garantia depois de todas
  # as barreiras terem passado. AUTOCOMMIT fora de 'on' muda o momento do commit
  # e esconde trabalho não confirmado.
  if printf '%s' "$texto" | grep -qiE '(^|[[:space:];])\\unset[[:space:]]+AUTOCOMMIT([[:space:]]|$)' \
     || printf '%s' "$texto" | grep -qiE '(^|[[:space:];])\\set[[:space:]]+AUTOCOMMIT([[:space:]]|$)'; then
    erro "o SQL de $origem altera AUTOCOMMIT por metacomando."
  fi
  if [ "$PARADA_DESLIGADA_OK" = "0" ] \
     && printf '%s' "$texto" | grep -qiE '(^|[[:space:];])\\unset[[:space:]]+ON_ERROR_STOP([[:space:]]|$)'; then
    erro "o SQL de $origem usa '\\unset ON_ERROR_STOP'.
         Se é uma bateria de diagnóstico que precisa seguir após erro, passe
         --permitir-parada-desligada (e não use -1)."
  fi
  # `\set ON_ERROR_STOP on` é legítimo e aparece nas migrations e nos testes:
  # diz a mesma coisa que o script já impôs. Qualquer outro valor é afrouxamento,
  # e só passa com a autorização EXPLÍCITA de quem chama — nunca por decisão do
  # próprio SQL.
  local v val
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    val=$(printf '%s' "$v" | sed -E 's/.*[Ss][Tt][Oo][Pp][[:space:]]*//' | tr 'A-Z' 'a-z')
    case "$val" in
      on|1|true|yes) : ;;
      *)
        [ "$PARADA_DESLIGADA_OK" = "1" ] || erro \
          "o SQL de $origem faz '\\set ON_ERROR_STOP ${val:-<vazio>}', que afrouxa a
         parada no primeiro erro imposta por este script.
         As baterias de diagnóstico de supabase/tests fazem isso de propósito:
         elas querem rodar todas as verificações e relatar, em vez de parar na
         primeira. Para essas, passe --permitir-parada-desligada — a decisão fica
         de quem chama, visível na linha de comando, e nunca do próprio SQL."
        ;;
    esac
  done < <(printf '%s' "$texto" | grep -oiE '\\set[[:space:]]+ON_ERROR_STOP[[:space:]]*[^[:space:];]*' || true)
}

# A permissão é para bateria de diagnóstico, que roda tudo e relata. Juntá-la a
# --single-transaction seria o pior dos dois mundos: segue depois do erro E tenta
# confirmar no fim. Aplicação de migration usa -1 e NÃO usa esta permissão.
if [ "$PARADA_DESLIGADA_OK" = "1" ] && [ "$PEDIU_TRANSACAO" = "1" ]; then
  erro "--permitir-parada-desligada não se combina com --single-transaction.
         Uma é para bateria de diagnóstico que segue após erro; a outra é para
         aplicação atômica, que tem de parar no primeiro erro."
fi

SQL=""
if [ -n "$SQL_DIRETO" ]; then
  conferir_payload "$SQL_DIRETO" "-c"
  SQL="$SQL_DIRETO"
fi
if [ -n "$SQL_ARQUIVO" ]; then
  [ -r "$SQL_ARQUIVO" ] || erro "não consigo ler '$SQL_ARQUIVO' no host"
  conteudo="$(cat "$SQL_ARQUIVO")"
  conferir_payload "$conteudo" "--sql-arquivo"
  SQL="${SQL:+$SQL$'\n'}$conteudo"
fi

if [ "$SO_CONFERIR" = "0" ] && [ "$TEM_PAYLOAD" = "0" ]; then
  erro "sem SQL. Use -c \"…\", --sql-arquivo <arquivo> ou --conferir."
fi

# -----------------------------------------------------------------------------
# O modo de parada desligada: LISTA EXPLÍCITA, não heurística de texto
# -----------------------------------------------------------------------------
# A versão anterior decidia por grep: tem `rollback`? tem `raise`? Isso não
# prova nada. Presença textual de `rollback` não garante que a transação seja
# desfeita (o caminho pode nem ser alcançado), e presença de `raise` não garante
# veredito nenhum — as baterias de supabase/tests usam `raise notice`, que
# **não muda o código de saída do psql**. Uma bateria podia imprimir FALHOU
# quinze vezes e terminar em 0.
#
# Duas trocas:
#
#   AUTORIZAÇÃO  deixa de ser inferida do texto e passa a ser uma LISTA de
#                suítes revisadas, por sha256 + caminho. Editar uma suíte
#                invalida a autorização até alguém revisar de novo.
#
#   VEREDITO     deixa de ser suposto e passa a ser derivado da SAÍDA de
#                execução: o script conta os marcadores que a suíte imprimiu e
#                TERMINA EM CÓDIGO NÃO ZERO se houver falha. A garantia passa a
#                ser do script, não da boa vontade do SQL.
SUITES_ARQUIVO="${DESTINO_AUTORIZADO_SUITES:-$AQUI/suites-permitidas.txt}"

if [ "$PARADA_DESLIGADA_OK" = "1" ]; then
  nega_modo() {
    erro "--permitir-parada-desligada só vale para suíte REVISADA e listada em
         $(basename "$SUITES_ARQUIVO"). $1
         Para aplicar migration, use -1 (que para no primeiro erro e desfaz)."
  }

  [ -n "$SQL_ARQUIVO" ] \
    || nega_modo "A autorização é por ARQUIVO revisado; com -c não há o que listar."

  # Guarda explícita, antes do hash, só para a mensagem ser a certa: uma
  # migration também seria recusada por não estar na lista, mas aí a causa
  # ficaria parecendo esquecimento de cadastro.
  case "$(printf '%s' "$SQL_ARQUIVO" | tr '\\' '/')" in
    */supabase/migrations/*|supabase/migrations/*)
      nega_modo "O arquivo vem de supabase/migrations/. Migration se aplica com -1,
         que para no primeiro erro e desfaz o que já tinha feito." ;;
  esac
  [ -r "$SUITES_ARQUIVO" ] \
    || nega_modo "Não há lista de suítes revisadas em '$SUITES_ARQUIVO'."

  HASH_REAL=$(sha256sum "$SQL_ARQUIVO" | awk '{print $1}')
  LINHA_SUITE=$(grep -iE "^${HASH_REAL}[[:space:]]" "$SUITES_ARQUIVO" | head -1 || true)
  if [ -z "$LINHA_SUITE" ]; then
    echo "  arquivo: $SQL_ARQUIVO" >&2
    echo "  sha256:  $HASH_REAL" >&2
    nega_modo "Este conteúdo não está na lista — ou a suíte foi editada desde a
         revisão, e nesse caso a autorização caduca de propósito."
  fi
  CAMINHO_LISTADO=$(printf '%s' "$LINHA_SUITE" | awk '{print $2}')
  # Campo 3: quantos erros de SQL a suíte produz legitimamente.
  # Campo 4: quantas asserções a suíte APROVA quando roda inteira.
  # Campo 5 (resto da linha): o rótulo da última linha de veredito.
  ERROS_ESPERADOS=$(printf '%s' "$LINHA_SUITE" | awk '{print $3}')
  ASSERCOES_MINIMAS=$(printf '%s' "$LINHA_SUITE" | awk '{print $4}')
  MARCADOR_FINAL=$(printf '%s' "$LINHA_SUITE" | awk '{ for (i=5;i<=NF;i++) printf "%s%s", $i, (i<NF?OFS:"") }')

  # Os três são obrigatórios e numéricos onde cabe. Não há valor padrão nem
  # curinga: havia um `*` em erros_esperados para dizer "não conferido", e ele
  # deixava a suíte rodar com essa conferência DESLIGADA — o que é aprovar sem
  # contrato. Suíte sem contrato de erros revisado não roda neste modo.
  case "$ERROS_ESPERADOS" in
    ''|*[!0-9]*) nega_modo "A linha da lista não declara quantos erros de SQL a
         suíte produz legitimamente (campo 3), ou declara um curinga. Esse
         contrato é revisado e medido, não suposto." ;;
  esac
  case "$ASSERCOES_MINIMAS" in
    ''|*[!0-9]*) nega_modo "A linha da lista não declara quantas asserções a suíte
         aprova (campo 4). Sem isso não há como distinguir 'rodou inteira' de
         'parou no meio'." ;;
  esac
  [ -n "$MARCADOR_FINAL" ] || nega_modo "A linha da lista não declara o marcador
         final da suíte (campo 5). Sem ele, saída truncada passaria por completa."
  case "$(printf '%s' "$SQL_ARQUIVO" | tr '\\' '/')" in
    *"/$CAMINHO_LISTADO"|"$CAMINHO_LISTADO") : ;;
    *) nega_modo "O conteúdo confere com '$CAMINHO_LISTADO', mas o arquivo veio de
         outro caminho. A lista autoriza arquivo, não conteúdo solto." ;;
  esac
fi

# =============================================================================
# Barreiras
# =============================================================================
# --- Barreira 0 — a protegida nunca pode ser alvo, nem por engano de lista.
[ "$ID_ESPERADO" != "$PROTEGIDO" ] || erro "o destino '$apelido' aponta para a instância protegida ($PROTEGIDO)"

CT="supabase_db_${ID_ESPERADO}"
docker inspect "$CT" >/dev/null 2>&1 || erro "contêiner $CT não existe"

# --- Barreira 1 — ID COMPLETO do contêiner, atribuído pelo Docker.
CTID_REAL=$(docker inspect "$CT" --format '{{.Id}}')
if [ "$CTID_REAL" != "$CTID_ESPERADO" ]; then
  echo "  esperado: $CTID_ESPERADO" >&2
  echo "  presente: $CTID_REAL"    >&2
  erro "ID completo do contêiner PostgreSQL não é o autorizado (contêiner recriado? atualize a lista à mão)"
fi

# A partir daqui, NADA usa o nome. Só o ID validado.
ALVO="$CTID_REAL"

# --- Barreira 2 — id do projeto gravado pelo Supabase CLI.
ID_REAL=$(docker inspect "$ALVO" --format '{{index .Config.Labels "com.supabase.cli.project"}}')
[ "$ID_REAL" = "$ID_ESPERADO" ] || erro "id do projeto é '$ID_REAL', esperado '$ID_ESPERADO'"
[ "$ID_REAL" != "$PROTEGIDO" ] || erro "o contêiner é a instância protegida"

# --- Barreira 3 — diretório de trabalho de origem.
DIR_REAL=$(docker inspect "$ALVO" --format '{{index .Config.Labels "com.supabase.cli.workdir"}}')
[ "$DIR_REAL" = "$DIR_ESPERADO" ] || erro "diretório é '$DIR_REAL', esperado '$DIR_ESPERADO'"

# --- Barreira 4 — porta publicada do PRÓPRIO PostgreSQL.
PGPORTA_REAL=$(docker port "$ALVO" 5432/tcp 2>/dev/null | head -1 | sed 's/.*://')
[ "$PGPORTA_REAL" = "$PGPORTA_ESPERADA" ] \
  || erro "porta do PostgreSQL é '${PGPORTA_REAL:-nenhuma}', esperada '$PGPORTA_ESPERADA'"

# --- Barreira 5 — porta publicada da API.
PORTA_REAL=$(docker port "supabase_kong_${ID_ESPERADO}" 8000/tcp 2>/dev/null | head -1 | sed 's/.*://')
[ "$PORTA_REAL" = "$PORTA_ESPERADA" ] \
  || erro "porta da API é '${PORTA_REAL:-nenhuma}', esperada '$PORTA_ESPERADA'"

# Conexão fixa, montada pelo script. Vem DEPOIS de "${ARGS[@]}" na linha de
# comando: no psql, a última ocorrência de uma opção é a que vale.
#
# `-f -` diz explicitamente "o script vem da entrada padrão". A documentação do
# psql condiciona `--single-transaction` a ser usado junto de `-c` ou `-f`; sem
# `-f -`, usar `-1` com SQL vindo de um cano fica fora do contrato documentado.
# Com `-f -` a mensagem de erro também passa a trazer a linha
# (`psql:<stdin>:130: ERROR …`), que é o que permite achar onde a migration parou.
CONEXAO_FIXA=(-h "$PG_SOCKET" -p "$PG_PORTA_INTERNA" -U "$PG_USUARIO" -d "$PG_BASE"
              -X -v ON_ERROR_STOP=1 -w)
ENTRADA_FIXA=(-f -)

# --- Barreira 6 — identidade do cluster, lida de dentro. Primeira e única
# conexão antes do comando pedido; uma consulta, sem tabela de aplicação.
# O erro do psql é preservado: barreira que falha calada vira "destino errado"
# quando na verdade foi a própria consulta que não rodou.
ERRO_SYSID=$(mktemp)
SYSID_REAL=$(docker exec -i "$ALVO" psql "${CONEXAO_FIXA[@]}" -tA \
  -c "select system_identifier from pg_control_system();" 2>"$ERRO_SYSID" | tr -d ' \r\n') || true
if [ "$SYSID_REAL" != "$SYSID_ESPERADO" ]; then
  echo "  esperado: $SYSID_ESPERADO" >&2
  echo "  presente: ${SYSID_REAL:-nenhum}" >&2
  if [ -s "$ERRO_SYSID" ]; then
    echo "  erro da consulta de identidade:" >&2
    sed 's/^/    /' "$ERRO_SYSID" >&2
  fi
  rm -f "$ERRO_SYSID"
  erro "system_identifier do cluster não é o autorizado (ou a consulta de identidade não rodou)"
fi
rm -f "$ERRO_SYSID"

echo "[destino] $apelido -> $CT" >&2
echo "  1 contêiner  ${CTID_REAL:0:12}… (ID completo confere)" >&2
echo "  2 projeto    $ID_REAL" >&2
echo "  3 diretório  $DIR_REAL" >&2
echo "  4 pg         $PGPORTA_REAL" >&2
echo "  5 api        $PORTA_REAL" >&2
echo "  6 cluster    $SYSID_REAL" >&2
echo "[destino] seis conferências passaram; conexão fixa em $PG_USUARIO@$PG_SOCKET/$PG_BASE, ON_ERROR_STOP=1" >&2
if [ "$PARADA_DESLIGADA_OK" = "1" ]; then
  echo "[destino] ATENÇÃO: --permitir-parada-desligada em uso, para a suíte revisada" >&2
  echo "          $CAMINHO_LISTADO" >&2
  echo "          sha256 $HASH_REAL" >&2
  echo "          erros de SQL esperados: $ERROS_ESPERADOS" >&2
fi

if [ "$SO_CONFERIR" = "1" ]; then exit 0; fi

# O SQL vai pela ENTRADA PADRÃO: nada de caminho de arquivo interpretado dentro
# do contêiner, e o conteúdo é o mesmo que foi inspecionado acima.
if [ "$PARADA_DESLIGADA_OK" = "0" ]; then
  printf '%s\n' "$SQL" | docker exec -i "$ALVO" psql "${ARGS[@]}" "${CONEXAO_FIXA[@]}" "${ENTRADA_FIXA[@]}"
  exit $?
fi

# ---------------------------------------------------------------------------
# Modo de parada desligada: o VEREDITO vem da saída, não do código do psql
# ---------------------------------------------------------------------------
# Com ON_ERROR_STOP desligado o psql termina em 0 mesmo quando instruções
# falharam, e as baterias relatam por `raise notice` — que não muda código de
# saída nenhum. Quem converte o relatório em veredito, aqui, é este script.
SAIDA=$(mktemp)
set +e
printf '%s\n' "$SQL" \
  | docker exec -i "$ALVO" psql "${ARGS[@]}" "${CONEXAO_FIXA[@]}" "${ENTRADA_FIXA[@]}" 2>&1 \
  | tee "$SAIDA"
RC_PSQL=${PIPESTATUS[1]}
set -e

FALHOU=$(grep -cE '(^|[^A-Za-z])FALHOU([^A-Za-z]|$)' "$SAIDA" || true)
OKS=$(grep -cE '(^|[^A-Za-z])OK([^A-Za-z]|$)' "$SAIDA" || true)
ERROS=$(grep -cE '^(psql:[^:]*:[0-9]+: )?(ERROR|FATAL|PANIC):' "$SAIDA" || true)
# INCONCLUSIVO. Uma asserção que termina em "SEM DADOS" não reprovou — mas
# também não aprovou nada: ela diz que não havia o que verificar. Contar isso
# como passagem seria aprovar por ausência de prova, que é o oposto de verificar.
INCONCLUSIVAS=$(grep -ciE '(^|[^A-Za-z])SEM DADOS([^A-Za-z]|$)' "$SAIDA" || true)
NOTICES=$(grep -cE '^(psql:[^:]*:[0-9]+: )?NOTICE:' "$SAIDA" || true)
ULTIMA_NOTICE=$(grep -E '^(psql:[^:]*:[0-9]+: )?NOTICE:' "$SAIDA" | tail -1 || true)
rm -f "$SAIDA"

echo "[veredito] psql=$RC_PSQL  aprovadas=$OKS (mínimo $ASSERCOES_MINIMAS)  FALHOU=$FALHOU  inconclusivas=$INCONCLUSIVAS  linhas de veredito=$NOTICES  erros de SQL=$ERROS (esperados $ERROS_ESPERADOS)" >&2

# `[ ... ] && { ...; }` encadeado sairia do script sob `set -e` quando o teste
# fosse falso. Aqui cada conferência é um `if` próprio, de propósito.
ruim=0
if [ "$RC_PSQL" -ne 0 ]; then
  echo "[veredito] o psql terminou em $RC_PSQL" >&2; ruim=1
fi
if [ "$FALHOU" -gt 0 ]; then
  echo "[veredito] a suíte declarou $FALHOU falha(s)" >&2; ruim=1
fi
# Veredito que não aparece na saída não existe: zero marcador significa que a
# bateria não chegou a julgar nada — não que estava tudo bem.
if [ $(( OKS + FALHOU )) -eq 0 ]; then
  echo "[veredito] nenhum marcador OK/FALHOU na saída: a suíte não chegou a julgar" >&2; ruim=1
fi
# INCONCLUSIVO REPROVA. "SEM DADOS" é a bateria dizendo que não havia o que
# verificar. Rodar a suíte inteira e não ter verificado nada não é aprovação.
if [ "$INCONCLUSIVAS" -gt 0 ]; then
  echo "[veredito] $INCONCLUSIVAS asserção(ões) inconclusiva(s) (SEM DADOS): não verificaram nada" >&2
  ruim=1
fi
# ASSERÇÕES APROVADAS. A comparação é com o número de OK, não com o de linhas
# de veredito: uma linha "SEM DADOS" foi executada mas não aprovou, e contá-la
# aqui deixaria uma bateria sem dado nenhum passar por bateria completa.
if [ "$OKS" -lt "$ASSERCOES_MINIMAS" ]; then
  echo "[veredito] só $OKS asserção(ões) aprovada(s); a lista declara $ASSERCOES_MINIMAS" >&2
  ruim=1
fi
# MARCADOR FINAL. Com a parada desligada, uma suíte interrompida no meio ainda
# imprime vereditos e ainda termina em 0. A última linha de veredito tem de ser
# a que a revisão registrou como última; se não for, a saída está incompleta.
if ! printf '%s' "$ULTIMA_NOTICE" | grep -qF "$MARCADOR_FINAL"; then
  echo "[veredito] a última asserção não é a declarada — saída incompleta" >&2
  echo "           esperada: $MARCADOR_FINAL" >&2
  echo "           obtida:   ${ULTIMA_NOTICE:-<nenhuma>}" >&2
  ruim=1
fi
if [ "$ERROS" -ne "$ERROS_ESPERADOS" ]; then
  echo "[veredito] $ERROS erro(s) de SQL, $ERROS_ESPERADOS esperado(s) pela lista" >&2
  ruim=1
fi

if [ "$ruim" = "1" ]; then
  echo "[veredito] REPROVADO" >&2
  exit 1
fi
echo "[veredito] aprovado" >&2
