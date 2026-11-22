#!/usr/bin/env bash
# Fixed, read-only checks after a deploy. Run it inside the repo that was deployed.
# Usage: prod-check.sh [commit]            (default: origin/main)
# Grafana access comes from an env file with GRAFANA_URL and GRAFANA_TOKEN (and, behind Cloudflare
# Access, CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET). Point VERA_GRAFANA_ENV at it.
# The queries are the ones the alert rules use: the agent passes a commit, never a query.
set -uo pipefail

COMMIT="${1:-origin/main}"
SHA="$(git rev-parse "$COMMIT" 2>/dev/null)" || { echo "prod-check: commit desconhecido: $COMMIT" >&2; exit 2; }
SHORT="${SHA:0:7}"
ENV_FILE="${VERA_GRAFANA_ENV:-$HOME/.secrets/vera-grafana.env}"
SERVICES='vera-.*'
ENVIRONMENT='prod'

echo "== commit $SHORT ($(git log -1 --format='%s' "$SHA" | cut -c1-90))"

echo "== pipeline deste commit"
RUNS="$(gh run list --commit "$SHA" --limit 20 --json workflowName,status,conclusion,updatedAt 2>/dev/null)" || RUNS='[]'
if [ "$(jq length <<<"$RUNS")" = 0 ]; then
  echo "nenhuma execução do GitHub Actions para este commit"
else
  jq -r '.[] | "\(.workflowName): \(if .status == "completed" then .conclusion else .status end) (\(.updatedAt))"' <<<"$RUNS"
fi

if [ ! -r "$ENV_FILE" ]; then
  echo "== sem acesso ao Grafana ($ENV_FILE não existe): só o pipeline foi conferido"
  exit 0
fi
set -a; . "$ENV_FILE"; set +a
BASE="${GRAFANA_URL%/}"
AUTH=(-H "Authorization: Bearer ${GRAFANA_TOKEN}")
[ -n "${CF_ACCESS_CLIENT_ID:-}" ] && AUTH+=(-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET:-}")

grafana() { curl -fsS --max-time 30 "${AUTH[@]}" --get "$BASE$1" "${@:2}"; }
uid_of() { grafana /api/datasources | jq -r --arg type "$1" '[.[] | select(.type == $type)][0].uid // empty'; }

PROM="${GRAFANA_PROM_UID:-$(uid_of prometheus)}"
LOKI="${GRAFANA_LOKI_UID:-$(uid_of loki)}"
[ -n "$PROM" ] && [ -n "$LOKI" ] || { echo "== não achei as fontes de métricas e de logs no Grafana"; exit 1; }

prom() { grafana "/api/datasources/proxy/uid/$PROM/api/v1/query" --data-urlencode "query=$1"; }
loki() { grafana "/api/datasources/proxy/uid/$LOKI/loki/api/v1/query" --data-urlencode "query=$1"; }

echo "== versão que está atendendo (requisições por segundo, últimos 10 min)"
SERVING="$(prom "sum by (service_name, service_version) (rate(http_server_request_duration_seconds_count{service_name=~\"$SERVICES\", deployment_environment_name=\"$ENVIRONMENT\"}[10m]))")"
jq -r '.data.result[] | "\(.metric.service_name) \(.metric.service_version): \(.value[1] | tonumber | . * 100 | round / 100)"' <<<"$SERVING" | sort
LIVE="$(jq -r --arg v "$SHORT" '[.data.result[] | select(.metric.service_version | startswith($v))] | length' <<<"$SERVING")"

echo "== taxa de respostas 5xx por serviço (últimos 10 min; o alerta dispara acima de 1%)"
prom "(sum by (service_name) (rate(http_server_request_duration_seconds_count{service_name=~\"$SERVICES\", deployment_environment_name=\"$ENVIRONMENT\", http_response_status_code=~\"5..\"}[10m])) or sum by (service_name) (rate(http_server_request_duration_seconds_count{service_name=~\"$SERVICES\", deployment_environment_name=\"$ENVIRONMENT\"}[10m])) * 0) / sum by (service_name) (rate(http_server_request_duration_seconds_count{service_name=~\"$SERVICES\", deployment_environment_name=\"$ENVIRONMENT\"}[10m]))" \
  | jq -r '.data.result[] | "\(.metric.service_name): \(.value[1] | tonumber | . * 10000 | round / 100)%"' | sort

echo "== linhas de log de erro por versão (últimos 30 min)"
loki "sum by (service_name, service_version) (count_over_time({service_name=~\"$SERVICES\", deployment_environment_name=\"$ENVIRONMENT\"} | detected_level=\"error\" [30m]))" \
  | jq -r 'if (.data.result | length) == 0 then "nenhuma" else (.data.result[] | "\(.metric.service_name) \(.metric.service_version): \(.value[1])") end' | sort

echo "== erros mais frequentes da versão $SHORT (últimos 30 min, até 200 linhas)"
NOW="$(date +%s)"
grafana "/api/datasources/proxy/uid/$LOKI/loki/api/v1/query_range" \
  --data-urlencode "query={service_name=~\"$SERVICES\", deployment_environment_name=\"$ENVIRONMENT\"} | detected_level=\"error\" | service_version=~\"$SHORT.*\"" \
  --data-urlencode "start=$((NOW - 1800))000000000" --data-urlencode "end=${NOW}000000000" --data-urlencode 'limit=200' \
  | jq -r '[.data.result[].values[][1] | (. as $line | try (fromjson | (.message // .msg // .body // tostring)) catch $line) | tostring | .[0:140]] | if length == 0 then "nenhum" else (group_by(.) | map({n: length, m: .[0]}) | sort_by(-.n) | .[0:6][] | "\(.n)x \(.m)") end'

echo "== resultado"
if [ -z "$SERVING" ] || ! jq -e '.data.result' >/dev/null 2>&1 <<<"$SERVING"; then
  echo "a consulta de métricas falhou: não dá para dizer se a versão $SHORT está atendendo"
elif [ "${LIVE:-0}" -gt 0 ]; then
  echo "a versão $SHORT está atendendo em $LIVE serviço(s)"
else
  echo "a versão $SHORT ainda NÃO aparece atendendo: o deploy não terminou, falhou ou este repo não publica um serviço com métricas"
fi
