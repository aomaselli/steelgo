#!/usr/bin/env bash
# =============================================================================
# 20261008120000 — APLICACAO TRANSACIONAL + REGISTRO NO HISTORICO
# =============================================================================
# Uma transacao so: ou a funcao passa a existir E a versao fica registrada em
# supabase_migrations.schema_migrations, ou nada acontece. Nao existe estado
# intermediario em que a funcao exista sem registro -- foi assim que a instancia
# de simulacao ficou inconsistente, quando o arquivo foi aplicado por psql e
# ninguem escreveu o historico.
#
# O texto aplicado e o texto registrado sao O MESMO: o arquivo e lido uma vez,
# normalizado so no fim de linha, usado para gerar o SQL combinado e guardado
# inteiro na coluna `statements`. O sha256 desse texto vai no `name`, de modo que
# o historico prove o que foi executado.
#
# -----------------------------------------------------------------------------
# POR QUE O DESTINO NAO E LIDO DE supabase/config.toml
# -----------------------------------------------------------------------------
# O `project_id` declarado la **nao e o projeto de producao** -- isso ja estava
# escrito em docs/fcg/procedimento-interrupcao-retomada.md, e uma versao
# anterior deste procedimento errou exatamente por tomar aquele id como
# producao. Aquele id esta na lista de NEGACAO deste script.
#
# O destino vem de destino-producao.local, com ref e identidade pinados. Sem
# esse arquivo, ou sem identidade, o script RECUSA: identidade insuficiente
# bloqueia a execucao.
#
# -----------------------------------------------------------------------------
# POR QUE NAO SE USA scripts/banco/destino-autorizado.sh
# -----------------------------------------------------------------------------
# Aquele validador serve a destinos DESCARTAVEIS e recusa o id de
# supabase/config.toml na barreira 0. Producao e outro destino, com outras
# barreiras -- as deste arquivo, explicitas e todas obrigatorias.
#
# USO
#   export SUPABASE_DB_URL='postgresql://...'
#   ./02-aplicar.sh --capturar-identidade   # le a identidade do destino e sai
#   ./02-aplicar.sh --conferir              # gera e mostra, nao envia nada
#   ./02-aplicar.sh --aplicar
# =============================================================================
set -euo pipefail

VERSAO="20261008120000"

# SHA256 do texto da migration, com o fim de linha normalizado. Fixado aqui para
# que o procedimento aplique EXATAMENTE o arquivo revisado -- qualquer edicao,
# intencional ou nao, muda o SHA e o script recusa.
#
# Medido em 08/10/2026 sobre
# supabase/migrations/20261008120000_list_carrier_driver_invitations_rpc.sql,
# na cabeca 364d54336ae2234ee2302f316394a6705dd26b03 do PR #4.
SHA_ESPERADO="93a99336b579447eeafa6456e3bdb9bcb9ea2c8b535362440e7145b454ebaaf2"

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
MIGRACAO="$RAIZ/supabase/migrations/${VERSAO}_list_carrier_driver_invitations_rpc.sql"
CONFIG="$AQUI/destino-producao.local"
CONFIG_TOML="$RAIZ/supabase/config.toml"
TAG="migracao_${VERSAO}"

erro() { printf '[publicacao] ERRO: %s\n' "$*" >&2; exit 1; }
info() { printf '[publicacao] %s\n' "$*"; }

MODO="${1:---conferir}"
case "$MODO" in
  --capturar-identidade|--conferir|--aplicar) ;;
  *) erro "use --capturar-identidade, --conferir ou --aplicar" ;;
esac

# --- 1. destino declarado -----------------------------------------------------
[ -r "$CONFIG" ] || erro "falta $CONFIG. Copie destino-producao.exemplo, preencha e tente de novo."

ler() { sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*([^[:space:]#]*).*/\1/p" "$CONFIG" | head -1; }
REF="$(ler ref)"
SYSID="$(ler system_identifier)"
DATID="$(ler datid)"

[ -n "$REF" ] || erro "destino-producao.local nao declara 'ref'"

# Lista de negacao. O id de supabase/config.toml entra por leitura, nao a mao:
# se alguem trocar o arquivo, a negacao acompanha.
NEGADO="$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$CONFIG_TOML" | head -1)"
[ -n "$NEGADO" ] || erro "nao consegui ler project_id de $CONFIG_TOML para montar a lista de negacao"

if [ "$REF" = "$NEGADO" ]; then
  erro "destino-producao.local declara o ref de supabase/config.toml ($NEGADO), que NAO e producao e e proibido. Recusado."
fi

# --- 2. a URL -----------------------------------------------------------------
[ -n "${SUPABASE_DB_URL:-}" ] || erro "defina SUPABASE_DB_URL com a conexao de producao"

case "$SUPABASE_DB_URL" in
  *"$NEGADO"*) erro "a URL menciona o projeto proibido ($NEGADO). Recusado." ;;
esac
case "$SUPABASE_DB_URL" in
  *"$REF"*) ;;
  *) erro "a URL nao menciona o projeto de producao declarado ($REF). Recusado." ;;
esac
case "$SUPABASE_DB_URL" in
  *localhost*|*127.0.0.1*|*"[::1]"*)
    erro "a URL aponta para destino local. Para destinos descartaveis use scripts/banco/destino-autorizado.sh." ;;
esac

# --- 3. identidade ------------------------------------------------------------
if [ "$MODO" = "--capturar-identidade" ]; then
  info "lendo a identidade do destino (somente leitura)..."
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
select '  datid            = ' || (select oid::text from pg_database where datname = current_database());
select '  banco            = ' || current_database();
select '  usuario          = ' || current_user;
do $$
declare v text;
begin
  begin
    select system_identifier::text into v from pg_control_system();
    raise notice '  system_identifier= %', v;
  exception when others then
    raise notice '  system_identifier= (sem permissao de leitura: %)', sqlstate;
  end;
end $$;
SQL
  info "CONFIRA no painel do Supabase que isto e o projeto $REF, e so entao preencha destino-producao.local."
  exit 0
fi

if [ -z "$SYSID" ] && [ -z "$DATID" ]; then
  erro "identidade insuficiente: destino-producao.local nao tem system_identifier nem datid.
         Rode ./02-aplicar.sh --capturar-identidade, confira no painel e preencha.
         Sem identidade conferida de dentro do banco este procedimento nao executa."
fi

# --- 4. o conteudo ------------------------------------------------------------
# A migration vem do PR #4, nao desta alteracao. Rode este procedimento a partir
# de um checkout que a contenha (a cabeca do #4, ou a main depois do merge --
# mas a ordem correta e aplicar ANTES do merge, entao na pratica e a cabeca do
# #4).
[ -r "$MIGRACAO" ] || erro "nao consigo ler $MIGRACAO
         Este procedimento nao carrega a migration: ela vem do PR #4. Faca o
         checkout de um ref que a contenha e tente de novo."

CONTEUDO="$(sed 's/\r$//' "$MIGRACAO")"
SHA="$(printf '%s\n' "$CONTEUDO" | sha256sum | awk '{print $1}')"

if [ "$SHA" != "$SHA_ESPERADO" ]; then
  erro "o conteudo da migration nao e o revisado.
         esperado: $SHA_ESPERADO
         lido    : $SHA
         Alguem editou o arquivo, ou o checkout nao e o revisado. Recusado."
fi

case "$CONTEUDO" in
  *"\$$TAG\$"*) erro "o delimitador \$$TAG\$ aparece no proprio arquivo; troque a TAG" ;;
esac

COMBINADO="$(mktemp)"
trap 'rm -f "$COMBINADO"' EXIT
{
  printf '%s\n' "$CONTEUDO"
  printf '\n'
  printf -- '-- ---------------------------------------------------------------\n'
  printf -- '-- registro no historico, na MESMA transacao do DDL acima\n'
  printf -- '-- ---------------------------------------------------------------\n'
  printf 'insert into supabase_migrations.schema_migrations (version, name, statements)\n'
  printf "values ('%s',\n" "$VERSAO"
  printf "        'list_carrier_driver_invitations_rpc sha256=%s',\n" "$SHA"
  printf '        array[$%s$%s$%s$]);\n' "$TAG" "$CONTEUDO" "$TAG"
  printf "do \$guarda\$\nbegin\n"
  printf "  if (select count(*) from supabase_migrations.schema_migrations where version = '%s') <> 1 then\n" "$VERSAO"
  printf "    raise exception 'historico nao ficou com exatamente uma linha para %s';\n" "$VERSAO"
  printf "  end if;\nend \$guarda\$;\n"
} > "$COMBINADO"

info "migration : ${MIGRACAO#"$RAIZ/"}"
info "sha256    : $SHA"
info "destino   : projeto $REF  (proibido e recusado: $NEGADO)"
info "identidade: system_identifier=${SYSID:-(nao pinado)}  datid=${DATID:-(nao pinado)}"

if [ "$MODO" = "--conferir" ]; then
  info "modo --conferir: nada foi enviado. Trecho do registro de historico:"
  sed -n '/registro no historico/,$p' "$COMBINADO" | head -6
  info "(para aplicar: ./02-aplicar.sh --aplicar)"
  exit 0
fi

# --- 5. pre-condicoes, com a identidade -------------------------------------
info "conferindo pre-condicoes e identidade no destino..."
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -v ref_esperado="$REF" \
  -v identidade_esperada="$SYSID" \
  -v datid_esperado="$DATID" \
  -f "$AQUI/01-precondicoes.sql"

# --- 6. aplicacao -------------------------------------------------------------
# --single-transaction + ON_ERROR_STOP=1: qualquer erro aborta tudo, inclusive o
# registro no historico. Nada fica pela metade.
info "aplicando em uma transacao..."
psql "$SUPABASE_DB_URL" \
  --single-transaction \
  -v ON_ERROR_STOP=1 \
  -f "$COMBINADO"

info "aplicada e registrada. Rode agora 03-verificar.sql."
