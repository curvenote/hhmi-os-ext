#!/usr/bin/env bash
#
# post-test-render.sh - POST a render-only smoke test to /test-render.
#
# Requires the container to be started with PROOFIG_PDF_RENDER_ONLY=1 (see local.sh / .env).
# Exercises Playwright PDF generation only — no SCMS job callbacks, upload, or hooks.
#
# Usage:
#   ./scripts/post-test-render.sh "https://proofig.example.com/report?token=abc"
#
# Optional:
#   PORT=8088
#   TARGET=http://127.0.0.1:8088/test-render
#   RENDER_OUTPUT_DIR=./output  (mount this in Docker to retrieve the PDF on the host)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ -f "${SERVICE_DIR}/.env" ]]; then
  # shellcheck source=/dev/null
  source "${SERVICE_DIR}/.env"
fi

REPORT_URL="${1:-}"
if [[ -z "$REPORT_URL" ]]; then
  echo "Usage: $0 \"https://proofig.example.com/report?token=...\"" >&2
  exit 1
fi

PORT="${PORT:-8088}"
TARGET="${TARGET:-http://127.0.0.1:${PORT}/test-render}"

BODY="$(node -p "JSON.stringify({ reportUrl: process.argv[1] })" "$REPORT_URL")"

echo "POST ${TARGET}"
curl -sS -X POST "${TARGET}" \
  -H 'Content-Type: application/json' \
  -d "${BODY}" \
  -w "\n\nHTTP status: %{http_code}\n"
