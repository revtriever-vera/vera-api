#!/usr/bin/env bash
set -uo pipefail

for NAME in "$@"; do
  VALUE="${!NAME:-}"
  [ -n "$VALUE" ] || continue
  echo "::add-mask::$VALUE"
  if printf '%s' "$VALUE" | jq -e . >/dev/null 2>&1; then
    printf '%s' "$VALUE" | jq -r '.. | strings | select(length >= 6)' | while IFS= read -r LEAF; do
      echo "::add-mask::$LEAF"
    done
  fi
done
exit 0
