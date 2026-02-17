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
if [ -z "$GCP_PROJECT" ]; then
    echo "❌ Error: Missing required environment variables!"
    echo "Please ensure these variables are set in your .env file:"
    echo "- GCP_PROJECT"
    exit 1
fi

echo "🚀 Deploying PMC FTP service to Google Cloud Run..."
echo "Project: $GCP_PROJECT"
echo "Region: ${GCP_REGION:-us-central1}"


gcloud builds submit \
  --project "$GCP_PROJECT" \
  --tag "gcr.io/$GCP_PROJECT/pmc-ftp-service:$(git rev-parse --short HEAD)" \
  --timeout 30m \
  .