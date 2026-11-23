#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${EVALS_SECRETS_FILE:-}" ] || [ ! -f "$EVALS_SECRETS_FILE" ]; then
    echo "defina EVALS_SECRETS_FILE com o caminho de um arquivo local, fora do repositório, com a chave do gateway" >&2
    exit 2
fi
LLM_DRIVER=live exec npm run eval -- --mode live "$@"
