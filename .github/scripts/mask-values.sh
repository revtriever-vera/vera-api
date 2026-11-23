#!/usr/bin/env bash
set -uo pipefail

# Mascara só identificadores (ids, ARNs, subnets...). Zonas de disponibilidade
# (availabilityZones) não são sensíveis e mascará-las esconde o log à toa.
for NAME in "$@"; do
  VALUE="${!NAME:-}"
  [ -n "$VALUE" ] || continue
  echo "::add-mask::$VALUE"
  if printf '%s' "$VALUE" | jq -e . >/dev/null 2>&1; then
    printf '%s' "$VALUE" | jq -r 'del(.availabilityZones) | .. | strings | select(length >= 6)' | while IFS= read -r LEAF; do
      echo "::add-mask::$LEAF"
    done
  fi
done
exit 0
