#!/bin/bash

# deploy.sh - Deploy Proofig PDF service to Google Cloud Run using .env config

set -e  # Exit on any error

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

echo "🚀 Deploying Proofig PDF service to Google Cloud Run..."
echo "Project: $GCP_PROJECT"
echo "Region: ${GCP_REGION:-us-central1}"

gcloud run deploy proofig-pdf-service \
  --project "$GCP_PROJECT" \
  --image "gcr.io/$GCP_PROJECT/proofig-pdf-service:$(git rev-parse --short HEAD)" \
  --platform managed \
  --ingress internal \
  --memory "${MEMORY:-2G}" \
  --cpu "${CPU:-2}" \
  --concurrency 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --region "${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

echo "✅ Deployment complete!"
