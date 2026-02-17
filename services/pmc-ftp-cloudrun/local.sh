#!/bin/bash

# local.sh - Convenience script to build and copy FTP service assets for local development
# This script builds the FTP service package and copies the compiled assets 
# into the current cloudrun directory for local Docker builds

set -e  # Exit on any error

echo "🔨 Building FTP service package..."

# Navigate to the FTP service package and build it
cd ../../packages/pmc-ftp-service
npm run build

echo "📦 Copying built assets to cloudrun directory..."

# Copy the compiled JavaScript files to the cloudrun directory
cp dist/* ../../services/pmc-ftp-cloudrun/

# Navigate back to cloudrun directory
cd ../../services/pmc-ftp-cloudrun

echo "🐳 Building local Docker image..."

# Build the Docker image with a local tag
docker build --tag pmc-ftp-local .

echo "✅ Local build complete!"
echo ""

# Check if .env file exists and provide instructions
if [ -f ".env" ]; then
    echo "📋 Loading environment variables from .env file..."
    source .env
    
    echo "🚀 Starting container with environment variables..."
    docker run -p ${PORT:-8080}:8080 \
        -e FTP_HOST="$FTP_HOST" \
        -e FTP_PORT="$FTP_PORT" \
        -e FTP_USERNAME="$FTP_USERNAME" \
        -e FTP_PASSWORD="$FTP_PASSWORD" \
        -e STREAM_BUFFER_KB="$STREAM_BUFFER_KB" \
        --name pmc-ftp-local \
        --rm \
        pmc-ftp-local
else
    echo "⚠️  No .env file found!"
    echo ""
    echo "To run with environment variables:"
    echo "1. Copy .env.sample to .env:"
    echo "   cp .env.sample .env"
    echo ""
    echo "2. Edit .env with your actual values"
    echo ""
    echo "3. Run this script again, or manually run:"
    echo "   docker run -p 8080:8080 \\"
    echo "     -e FTP_HOST=your-host \\"
    echo "     -e FTP_PORT=22 \\"
    echo "     -e FTP_USERNAME=your-username \\"
    echo "     -e FTP_PASSWORD=your-password \\"
    echo "     -e STREAM_BUFFER_KB=256 \\"
    echo "     --name pmc-ftp-local \\"
    echo "     --rm \\"
    echo "     pmc-ftp-local"
fi 