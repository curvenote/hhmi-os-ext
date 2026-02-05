#!/bin/bash

# deploy-env.sh - Deploy PMC FTP service using environment variables from .env file
# This script loads configuration from .env and deploys to Google Cloud Run

set -e  # Exit on any error

# Check if .env file exists
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

# Validate required variables
if [ -z "$GCP_PROJECT" ] || [ -z "$FTP_HOST" ] || [ -z "$FTP_USERNAME" ] || [ -z "$FTP_PASSWORD" ]; then
    echo "❌ Error: Missing required environment variables!"
    echo "Please ensure these variables are set in your .env file:"
    echo "- GCP_PROJECT"
    echo "- FTP_HOST" 
    echo "- FTP_USERNAME"
    echo "- FTP_PASSWORD"
    exit 1
fi

echo "🚀 Deploying PMC FTP service to Google Cloud Run..."
echo "Project: $GCP_PROJECT"
echo "Region: ${GCP_REGION:-us-central1}"

gcloud run deploy pmc-ftp-service \
  --project "$GCP_PROJECT" \
  --image "gcr.io/$GCP_PROJECT/pmc-ftp-service:$(git rev-parse --short HEAD)" \
  --platform managed \
  --ingress internal \
  --memory 2G \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 10 \
  --region "${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated \
  --set-env-vars "FTP_HOST=$FTP_HOST" \
  --set-env-vars "FTP_PORT=${FTP_PORT:-22}" \
  --set-env-vars "FTP_USERNAME=$FTP_USERNAME" \
  --set-env-vars "FTP_PASSWORD=$FTP_PASSWORD" \
  --set-env-vars "STREAM_BUFFER_KB=${STREAM_BUFFER_KB:-256}"

echo "✅ Deployment complete!" 