#!/bin/bash

# build.sh - Build Proofig PDF service Docker image remotely (GCP Cloud Build)
# Runs build:service first so the bundled index.js is in this directory.

set -e

if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo ""
    echo "Please create a .env file:"
    echo "1. Copy .env.sample to .env:"
    echo "   cp .env.sample .env"
    echo ""
    echo "2. Edit .env with your actual values"
    echo ""
    echo "3. Run this script again"
    exit 1
fi

echo "📋 Loading environment variables from .env file..."
source .env

if [ -z "$GCP_PROJECT" ]; then
    echo "❌ Error: Missing required environment variables!"
    echo "Please ensure these variables are set in your .env file:"
    echo "- GCP_PROJECT"
    exit 1
fi

echo "🚀 Building Proofig PDF service remotely on Google Cloud Build..."
echo "Project: $GCP_PROJECT"
echo "Region: ${GCP_REGION:-us-central1}"

echo "Running build:service (proofig-pdf-service esbuild bundle → index.js)..."
bun run build:service

if [ ! -f "index.js" ]; then
    echo "❌ Error: index.js not found after build:service"
    exit 1
fi

gcloud builds submit \
  --project "$GCP_PROJECT" \
  --tag "gcr.io/$GCP_PROJECT/proofig-pdf-service:$(git rev-parse --short HEAD)" \
  --timeout 30m \
  .
