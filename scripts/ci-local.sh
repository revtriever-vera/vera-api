#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
steps=()
container=""
started=$SECONDS

cleanup() {
  [ -n "$container" ] && docker rm -f "$container" >/dev/null 2>&1
  return 0
}
trap cleanup EXIT

summary() {
  echo
  echo "== resumo do ci:local =="
  printf '%s\n' "${steps[@]}"
  echo "total: $((SECONDS - started))s"
}

run() {
  local name=$1
  shift
  local t=$SECONDS
  echo
  echo "== $name =="
  if "$@"; then
    steps+=("PASSOU  $name ($((SECONDS - t))s)")
  else
    steps+=("FALHOU  $name ($((SECONDS - t))s)")
    summary
    exit 1
  fi
}

drift_guard() {
  command -v docker >/dev/null || { echo "docker é necessário para o drift guard"; return 1; }
  container=$(docker run -d --rm -e POSTGRES_USER=vera -e POSTGRES_PASSWORD=vera -e POSTGRES_DB=vera \
    -p 127.0.0.1::5432 postgres:16) || return 1
  local port
  port=$(docker port "$container" 5432/tcp | head -1 | sed 's/.*://')
  local i
  for i in $(seq 1 30); do
    docker exec "$container" pg_isready -U vera >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://vera:vera@127.0.0.1:${port}/vera"
  npm run migrate:latest || return 1
  npm run codegen || return 1
  git diff --exit-code src/core/database/generated/database.types.ts \
    || { echo "Tipos gerados estão desatualizados. Rode 'npm run codegen' e comite."; return 1; }
}

run "Format" npm run format:check
run "Lint" npm run lint
run "Typecheck" npm run typecheck
run "Migration names" npm run check:migrations
run "Migration drift guard" drift_guard
run "Unit tests" npm run test:cov
run "Integration tests" npm run test:int:cov
run "Coverage gate (85%)" npm run coverage:gate

summary
echo "ci:local passou"
