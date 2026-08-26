#!/bin/sh

# run.sh - Run an already-built local Docker image.
# Honours PORT from the environment or .env (default 8088).

set -e

if [ -f ".env" ]; then
  # shellcheck source=/dev/null
  . ./.env
fi

PORT="${PORT:-8088}"

docker run \
  -p "${PORT}:8080" \
  --name proofig-pdf-local \
  --rm \
  proofig-pdf-local
