#!/usr/bin/env bash
set -euo pipefail

# Directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default target URL from root .env if present
API_URL="https://labyrithm-api.nayantha.me"
if [[ -f "${ROOT_DIR}/.env" ]]; then
    ENV_URL=$(grep -E "^API_URL=" "${ROOT_DIR}/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)
    if [[ -n "${ENV_URL}" ]]; then
        API_URL="${ENV_URL}"
    fi
fi

# If user provided -url in arguments, don't inject default
HAS_URL=false
for arg in "$@"; do
    if [[ "${arg}" == "-url" || "${arg}" == "--url" || "${arg}" == -url=* ]]; then
        HAS_URL=true
        break
    fi
done

EXTRA_ARGS=()
if [[ "${HAS_URL}" == false ]]; then
    EXTRA_ARGS+=("-url" "${API_URL}")
fi

cd "${SCRIPT_DIR}"
exec go run . "${EXTRA_ARGS[@]}" "$@"
