#!/usr/bin/env bash
#
# post-message.sh - POST a Pub/Sub-shaped message to a locally running service.
#
# Usage:
#   ./scripts/post-message.sh "https://proofig.example.com/report?token=abc"
#
# Sends a message in the Pub/Sub push envelope with base64-encoded JSON data.
# jobUrl/handshake/userId point at loopback stubs; the container will attempt the
# job callbacks against them (expected to fail locally unless you run a stub API).
#
# Optional:
#   PORT=8088
#   TARGET=http://127.0.0.1:8088/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ -f "${SERVICE_DIR}/.env" ]]; then
  # shellcheck source=/dev/null
  source "${SERVICE_DIR}/.env"
fi

REPORT_URL="${1:-https://example.com/}"
PORT="${PORT:-8088}"
TARGET="${TARGET:-http://127.0.0.1:${PORT}/}"
JOB_URL="${JOB_URL:-http://127.0.0.1:3031/v1/jobs/local-test}"
HANDSHAKE="${HANDSHAKE:-local-handshake}"
USER_ID="${USER_ID:-local-user}"

DATA_JSON=$(cat <<EOF
{
  "reportUrl": "${REPORT_URL}",
  "work_version_id": "wv-local",
  "check_service_run_id": "run-local",
  "cdn": "cdn-local",
  "cdn_key": "key/local"
}
EOF
)

DATA_B64=$(printf '%s' "$DATA_JSON" | base64 | tr -d '\n')

BODY=$(cat <<EOF
{
  "message": {
    "attributes": {
      "jobUrl": "${JOB_URL}",
      "handshake": "${HANDSHAKE}",
      "userId": "${USER_ID}"
    },
    "data": "${DATA_B64}"
  }
}
EOF
)

echo "POST ${TARGET}"
curl -sS -X POST "${TARGET}" \
  -H 'Content-Type: application/json' \
  -d "${BODY}"
echo ""
