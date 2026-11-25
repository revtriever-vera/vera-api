#!/usr/bin/env bash
set -uo pipefail

STACK="${1:?stack}"
OUTPUTS_FILE="$(mktemp)"

npx cdk deploy "$STACK" --require-approval never --outputs-file "$OUTPUTS_FILE" 2>&1 \
  | awk '
      /^Outputs:/ || /^Stack ARN:/ {skip=1; blank=0; next}
      skip && /^[[:space:]]*$/ {blank=1; next}
      skip && (/^[[:space:]]*(✅|❌)/ || /^[A-Za-z0-9-]+: /) {skip=0}
      skip && blank {skip=0}
      !skip {print}'
STATUS="${PIPESTATUS[0]}"

if [ -s "$OUTPUTS_FILE" ]; then
  jq -r '.. | strings | select(length >= 6)' "$OUTPUTS_FILE" | while IFS= read -r VALUE; do
    echo "::add-mask::$VALUE"
  done
fi
rm -f "$OUTPUTS_FILE"
exit "$STATUS"
