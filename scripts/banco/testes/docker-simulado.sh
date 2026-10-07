#!/usr/bin/env bash
# Docker SIMULADO. Serve só para exercitar o validador sem tocar em contêiner ou
# banco de verdade. Cada valor devolvido vem de uma variável de ambiente, para
# que cada caso de teste altere UM atributo por vez e a recusa não possa ser
# atribuída a outro.
#
#   SIM_ID        ID completo devolvido por `docker inspect --format {{.Id}}`
#   SIM_PROJECT   rótulo com.supabase.cli.project
#   SIM_WORKDIR   rótulo com.supabase.cli.workdir
#   SIM_PGPORT    porta publicada de 5432/tcp
#   SIM_APIPORT   porta publicada de 8000/tcp do kong
#   SIM_SYSID     system_identifier devolvido pelo psql simulado
#   SIM_EXISTE    0 faz `docker inspect <nome>` falhar
#   SIM_ARGV      arquivo onde cada invocação registra a linha de comando
set -u

if [ -n "${SIM_ARGV:-}" ]; then
  printf 'docker' >> "$SIM_ARGV"
  for a in "$@"; do printf ' [%s]' "$a" >> "$SIM_ARGV"; done
  printf '\n' >> "$SIM_ARGV"
fi

sub="${1:-}"; shift || true

case "$sub" in
  inspect)
    ref="${1:-}"; shift || true
    if [ "${SIM_EXISTE:-1}" = "0" ]; then echo "No such object: $ref" >&2; exit 1; fi
    formato=""
    while [ $# -gt 0 ]; do
      case "$1" in --format) formato="${2:-}"; shift 2 ;; --format=*) formato="${1#--format=}"; shift ;; *) shift ;; esac
    done
    case "$formato" in
      "")                     echo "[{}]" ;;
      *".Id"*)                echo "${SIM_ID:-}" ;;
      *"cli.project"*)        echo "${SIM_PROJECT:-}" ;;
      *"cli.workdir"*)        echo "${SIM_WORKDIR:-}" ;;
      *)                      echo "" ;;
    esac
    ;;
  port)
    ref="${1:-}"; porta="${2:-}"
    case "$ref:$porta" in
      *kong*:8000/tcp) [ -n "${SIM_APIPORT:-}" ] && echo "0.0.0.0:${SIM_APIPORT}" || exit 1 ;;
      *:5432/tcp)      [ -n "${SIM_PGPORT:-}"  ] && echo "0.0.0.0:${SIM_PGPORT}"  || exit 1 ;;
      *) exit 1 ;;
    esac
    ;;
  exec)
    # `docker exec -i <ref> psql …`. A barreira 6 pede system_identifier; para
    # qualquer outro comando, o psql simulado só confirma que foi chamado.
    todos="$*"
    case "$todos" in
      *pg_control_system*) echo "${SIM_SYSID:-}" ;;
      *)
        # SIM_STDIN guarda o que o psql REALMENTE recebeu, para a suite poder
        # provar que o texto executado e o mesmo que foi autorizado.
        if [ -n "${SIM_STDIN:-}" ]; then cat > "$SIM_STDIN"; else cat > /dev/null; fi
        # No modo de parada desligada o validador deriva o veredito da SAÍDA.
        # SIM_VEREDITO escolhe o que a "suíte" relata: ok (padrão), falhou, ou
        # mudo — nenhum marcador, para provar que ausência de veredito reprova.
        # SIM_NOTICES  quantas linhas de veredito emitir (padrao 1)
        # SIM_ULTIMA   o rotulo da ultima delas
        n="${SIM_NOTICES:-1}"
        ult="${SIM_ULTIMA:-1. verificacao simulada}"
        case "${SIM_VEREDITO:-ok}" in
          falhou)     echo "NOTICE:  $ult ......... FALHOU" ;;
          mudo)       echo "PSQL-SIMULADO-EXECUTOU" ;;
          # Parou antes do fim: emite veredito, mas NAO o ultimo declarado.
          incompleto) echo "NOTICE:  0. preparacao ......... OK" ;;
          # Uma assercao sem o que verificar, mais a ultima declarada em OK.
          # Isola a regra de inconclusivo: contagem e marcador final continuam
          # satisfeitos, so o SEM DADOS reprova.
          semdados)
            echo "NOTICE:  0. contrato presente ......... SEM DADOS"
            echo "NOTICE:  $ult ......... OK"
            ;;
          *)
            i=1
            while [ "$i" -lt "$n" ]; do
              echo "NOTICE:  $i. intermediaria ......... OK"
              i=$((i+1))
            done
            echo "NOTICE:  $ult ......... OK"
            ;;
        esac
        ;;
    esac
    ;;
  *)
    echo "docker simulado: subcomando '$sub' nao previsto" >&2; exit 90 ;;
esac
