#!/usr/bin/env bash
# =============================================================================
# Regressoes do procedimento de publicacao (02-aplicar.sh)
# =============================================================================
# NAO conecta a banco nenhum e nao precisa de rede. Todos os casos param nas
# barreiras de shell, antes de qualquer psql, ou param em --conferir, que por
# definicao nao envia nada.
#
# Cada caso roda numa ARVORE TEMPORARIA, com seu proprio supabase/config.toml e
# sua propria copia dos scripts. Assim da para mexer no `project_id` -- que e o
# ponto central desta suite -- sem tocar no repositorio.
#
# A PERGUNTA QUE ESTA SUITE RESPONDE: trocar o `project_id` de config.toml
# libera o destino proibido? Tem de ser NAO. Uma versao anterior do script
# derivava a negacao so daquele arquivo, entao bastava editar uma linha.
#
# USO
#   bash scripts/banco/publicacao/testes/publicacao.test.sh
# =============================================================================
set -uo pipefail

PROIBIDO="iaabxrclxpsagdijkrcx"
PRODUCAO="lnzgddbnvrbjfvkzbmgf"
SHA_REVISADO="93a99336b579447eeafa6456e3bdb9bcb9ea2c8b535362440e7145b454ebaaf2"

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGEM="$(cd "$AQUI/.." && pwd)"

PASSOU=0
FALHOU=0

# --- arvore temporaria --------------------------------------------------------
# $1 = project_id a declarar em config.toml, ou a string "SEM-ARQUIVO"
montar() {
  local project_id="$1"
  local raiz; raiz="$(mktemp -d)"
  mkdir -p "$raiz/scripts/banco/publicacao" "$raiz/supabase/migrations"
  cp "$ORIGEM/02-aplicar.sh" "$ORIGEM/01-precondicoes.sql" "$raiz/scripts/banco/publicacao/"
  if [ "$project_id" != "SEM-ARQUIVO" ]; then
    printf 'project_id = "%s"\n' "$project_id" > "$raiz/supabase/config.toml"
  fi
  printf '%s' "$raiz"
}

destino() {  # $1=raiz $2=ref $3=system_identifier $4=marcador
  printf 'ref=%s\nsystem_identifier=%s\nmarcador_identidade=%s\n' "$2" "$3" "$4" \
    > "$1/scripts/banco/publicacao/destino-producao.local"
}

migracao() {  # $1=raiz $2=conteudo
  printf '%s' "$2" > "$1/supabase/migrations/20261008120000_list_carrier_driver_invitations_rpc.sql"
}

# $1=nome $2=raiz $3=url $4=esperado(recusar|passar) $5=trecho que a saida deve conter
caso() {
  local nome="$1" raiz="$2" url="$3" esperado="$4" trecho="${5:-}"
  local saida codigo
  saida="$(cd "$raiz/scripts/banco/publicacao" && SUPABASE_DB_URL="$url" bash 02-aplicar.sh --conferir 2>&1)"
  codigo=$?
  local ok=1
  if [ "$esperado" = "recusar" ] && [ "$codigo" -eq 0 ]; then ok=0; fi
  if [ "$esperado" = "passar" ] && [ "$codigo" -ne 0 ]; then ok=0; fi
  if [ -n "$trecho" ] && ! printf '%s' "$saida" | grep -qF "$trecho"; then ok=0; fi
  if [ "$ok" -eq 1 ]; then
    PASSOU=$((PASSOU + 1))
    printf 'ok     %s\n' "$nome"
  else
    FALHOU=$((FALHOU + 1))
    printf 'FALHOU %s\n       esperado=%s codigo=%s trecho=%s\n       saida: %s\n' \
      "$nome" "$esperado" "$codigo" "${trecho:-<nenhum>}" "$(printf '%s' "$saida" | tr '\n' ' ' | cut -c1-200)"
  fi
  rm -rf "$raiz"
}

echo "== A. NEGACAO PERMANENTE: mexer em config.toml NAO libera o proibido"

# O coracao da suite. Em todos estes casos o config.toml declara OUTRA coisa --
# ou nem existe -- e ainda assim o destino proibido tem de ser recusado.
r="$(montar "$PRODUCAO")"; destino "$r" "$PROIBIDO" "123" ""
caso "A1 config.toml aponta para producao, destino declara o proibido" \
  "$r" "postgresql://u@db.$PROIBIDO.supabase.co:5432/postgres" recusar "ref negado ($PROIBIDO)"

r="$(montar "zzzzzzzzzzzzzzzzzzzz")"; destino "$r" "$PROIBIDO" "123" ""
caso "A2 config.toml trocado por um id qualquer" \
  "$r" "postgresql://u@db.$PROIBIDO.supabase.co:5432/postgres" recusar "ref negado ($PROIBIDO)"

r="$(montar "SEM-ARQUIVO")"; destino "$r" "$PROIBIDO" "123" ""
caso "A3 config.toml apagado" \
  "$r" "postgresql://u@db.$PROIBIDO.supabase.co:5432/postgres" recusar "ref negado ($PROIBIDO)"

r="$(montar "$PROIBIDO")"; destino "$r" "$PROIBIDO" "123" ""
caso "A4 config.toml declara o proprio proibido" \
  "$r" "postgresql://u@db.$PROIBIDO.supabase.co:5432/postgres" recusar "ref negado ($PROIBIDO)"

# A URL tambem nao pode mencionar o proibido, mesmo com o destino declarado certo.
r="$(montar "zzzzzzzzzzzzzzzzzzzz")"; destino "$r" "$PRODUCAO" "123" ""
caso "A5 URL cita o proibido, config.toml trocado" \
  "$r" "postgresql://u@db.$PROIBIDO.supabase.co:5432/postgres" recusar "URL menciona um projeto negado ($PROIBIDO)"

r="$(montar "SEM-ARQUIVO")"; destino "$r" "$PRODUCAO" "123" ""
caso "A6 URL cita o proibido, config.toml apagado" \
  "$r" "postgresql://u@db.$PROIBIDO.supabase.co:5432/postgres" recusar "URL menciona um projeto negado ($PROIBIDO)"

# O id de config.toml continua negado por cima da lista permanente.
r="$(montar "wwwwwwwwwwwwwwwwwwww")"; destino "$r" "wwwwwwwwwwwwwwwwwwww" "123" ""
caso "A7 o id de config.toml tambem e negado (soma, nao substitui)" \
  "$r" "postgresql://u@db.wwwwwwwwwwwwwwwwwwww.supabase.co:5432/postgres" recusar "ref negado (wwwwwwwwwwwwwwwwwwww)"

echo
echo "== B. IDENTIDADE"

r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "" ""
caso "B1 sem identidade pinada recusa" \
  "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" recusar "identidade insuficiente"

# datid saiu: um campo com esse nome nao e mais lido, entao nao vale de nada.
r="$(montar "$PROIBIDO")"
printf 'ref=%s\nsystem_identifier=\nmarcador_identidade=\ndatid=5\n' "$PRODUCAO" \
  > "$r/scripts/banco/publicacao/destino-producao.local"
caso "B2 datid nao e mais aceito como identidade" \
  "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" recusar "identidade insuficiente"

r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "" "outroprojeto:nonce"
caso "B3 marcador que nao nomeia o projeto recusa" \
  "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" recusar "nao comeca por"

echo
echo "== C. DEMAIS BARREIRAS"

r="$(montar "$PROIBIDO")"
rm -f "$r/scripts/banco/publicacao/destino-producao.local"
caso "C1 sem destino-producao.local" \
  "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" recusar "falta"

r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "123" ""
caso "C2 URL de outro projeto" \
  "$r" "postgresql://u@db.yyyyyyyyyyyyyyyyyyyy.supabase.co:5432/postgres" recusar "nao menciona o projeto de producao"

r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "123" ""
caso "C3 URL local" \
  "$r" "postgresql://u.$PRODUCAO@localhost:65322/postgres" recusar "destino local"

r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "123" ""
caso "C4 migration ausente" \
  "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" recusar "ela vem do PR #4"

r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "123" ""
migracao "$r" "-- conteudo diferente do revisado"
caso "C5 migration adulterada (SHA diverge)" \
  "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" recusar "nao e o revisado"

echo
echo "== D. CAMINHO FELIZ (so --conferir; nada e enviado)"

# O conteudo real da migration vem do PR #4. Quando ele esta presente na arvore
# deste checkout, o caso roda; quando nao, e anunciado como ignorado -- nunca
# como aprovado.
REAL="$ORIGEM/../../../supabase/migrations/20261008120000_list_carrier_driver_invitations_rpc.sql"
if [ -r "$REAL" ]; then
  r="$(montar "$PROIBIDO")"; destino "$r" "$PRODUCAO" "7690680126094364709" ""
  cp "$REAL" "$r/supabase/migrations/"
  caso "D1 tudo certo, --conferir nao envia" \
    "$r" "postgresql://u@db.$PRODUCAO.supabase.co:5432/postgres" passar "sha256    : $SHA_REVISADO"
else
  echo "ignorado D1 (a migration do PR #4 nao esta nesta arvore; ver README, 'Checkout reproduzivel')"
fi

echo
echo "================================================"
printf 'passaram: %s   falharam: %s\n' "$PASSOU" "$FALHOU"
[ "$FALHOU" -eq 0 ] || exit 1
