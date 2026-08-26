#!/bin/bash

# local.sh - Build and run the Proofig PDF service container locally.
# Bundles the proofig-pdf-service package, builds the Docker image, and starts it.

set -e  # Exit on any error

echo "🔨 Building proofig-pdf-service package..."

# Navigate to the service package and build it
cd ../../packages/proofig-pdf-service
bun run build

echo "📦 Copying built assets to cloudrun directory..."

# Copy the bundled JavaScript into the cloudrun directory
cp dist/* ../../services/proofig-pdf-cloudrun/

# Navigate back to cloudrun directory
cd ../../services/proofig-pdf-cloudrun

echo "🐳 Building local Docker image..."

docker build --tag proofig-pdf-local .

echo "✅ Local build complete!"
echo ""

DOCKER_ENV=()
if [[ -f ".env" ]]; then
  # shellcheck source=/dev/null
  source .env
fi

PORT="${PORT:-8088}"
echo "🚀 Starting container on port ${PORT}..."

if [[ "${PROOFIG_PDF_RENDER_ONLY:-}" == "1" ]]; then
  echo "🧪 Render-only test mode enabled (POST /test-render)"
  DOCKER_ENV+=(-e "PROOFIG_PDF_RENDER_ONLY=1")
fi

if [[ -n "${RENDER_OUTPUT_DIR:-}" ]]; then
  # Docker bind mounts require absolute paths. Allow relative values in .env
  # (e.g. ./output) — resolve against the service directory on the host, and
  # mount into a fixed absolute path inside the container.
  HOST_OUTPUT_DIR="${RENDER_OUTPUT_DIR}"
  if [[ "${HOST_OUTPUT_DIR}" != /* ]]; then
    HOST_OUTPUT_DIR="$(cd "$(dirname "${HOST_OUTPUT_DIR}")" && pwd)/$(basename "${HOST_OUTPUT_DIR}")"
  fi
  mkdir -p "${HOST_OUTPUT_DIR}"
  CONTAINER_OUTPUT_DIR="/render-output"
  echo "📁 Render output: ${HOST_OUTPUT_DIR} → ${CONTAINER_OUTPUT_DIR}"
  DOCKER_ENV+=(-e "RENDER_OUTPUT_DIR=${CONTAINER_OUTPUT_DIR}" -v "${HOST_OUTPUT_DIR}:${CONTAINER_OUTPUT_DIR}")
fi

docker run -p "${PORT}:8080" \
    "${DOCKER_ENV[@]}" \
    --name proofig-pdf-local \
    --rm \
    proofig-pdf-local
