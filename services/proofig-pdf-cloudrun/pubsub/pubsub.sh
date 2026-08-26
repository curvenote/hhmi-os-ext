#!/usr/bin/env bash
#
# Set up GCP Pub/Sub topic + push subscription for the proofig-pdf Cloud Run service.
#
# Creates / updates only:
#   1. Pub/Sub topic
#   2. Push subscription (endpoint + OIDC auth as an existing converter SA)
#
# Also grants roles/run.invoker on the proofig-pdf Cloud Run service to that SA
# (required for authenticated push). Does NOT create service accounts or grant
# project-level pubsub.publisher / tokenCreator — those must already exist from
# the task-converter Pub/Sub setup.
#
# Idempotent: safe to re-run after redeploy (updates push endpoint + auth).
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Cloud Run service already deployed (need PUSH_ENDPOINT)
#   - SERVICE_ACCOUNT_NAME already exists (converter / workspace SA)
#
# Usage:
#   cd scripts/pubsub
#   cp env.sample.staging .env    # or env.sample.production
#   # set PUSH_ENDPOINT to the deployed Cloud Run URL
#   ./pubsub.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
  set +a
fi

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-proofig-pdf-service}"
PUSH_ENDPOINT="${PUSH_ENDPOINT:-}"
TOPIC_NAME="${TOPIC_NAME:-proofigPdfServiceTopic}"
SUBSCRIPTION_NAME="${SUBSCRIPTION_NAME:-proofigPdfServiceSub}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-}"
ACK_DEADLINE="${ACK_DEADLINE:-600}"

missing=()
[[ -z "$PROJECT_ID" ]]            && missing+=(PROJECT_ID)
[[ -z "$REGION" ]]                && missing+=(REGION)
[[ -z "$SERVICE_NAME" ]]          && missing+=(SERVICE_NAME)
[[ -z "$PUSH_ENDPOINT" ]]         && missing+=(PUSH_ENDPOINT)
[[ -z "$TOPIC_NAME" ]]            && missing+=(TOPIC_NAME)
[[ -z "$SUBSCRIPTION_NAME" ]]     && missing+=(SUBSCRIPTION_NAME)
[[ -z "$SERVICE_ACCOUNT_NAME" ]]  && missing+=(SERVICE_ACCOUNT_NAME)

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing required environment variables: ${missing[*]}"
  echo ""
  echo "Copy an env sample and set PUSH_ENDPOINT after deploy:"
  echo "  cp env.sample.staging .env      # or env.sample.production"
  echo "  # edit PUSH_ENDPOINT"
  echo "  ./pubsub.sh"
  exit 1
fi

SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project "${PROJECT_ID}" &>/dev/null; then
  echo "Error: service account ${SA_EMAIL} not found."
  echo "Reuse the existing task-converter / workspace SA (do not create a new one)."
  exit 1
fi
echo "Reusing service account: ${SA_EMAIL}"

echo "Granting run.invoker on Cloud Run service: ${SERVICE_NAME}"
gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/run.invoker \
  --region "${REGION}" \
  --project "${PROJECT_ID}"

if gcloud pubsub topics describe "${TOPIC_NAME}" --project "${PROJECT_ID}" &>/dev/null; then
  echo "Using existing Pub/Sub topic: ${TOPIC_NAME}"
else
  echo "Creating Pub/Sub topic: ${TOPIC_NAME}"
  gcloud pubsub topics create "${TOPIC_NAME}" --project "${PROJECT_ID}"
fi

if gcloud pubsub subscriptions describe "${SUBSCRIPTION_NAME}" --project "${PROJECT_ID}" &>/dev/null; then
  echo "Updating existing push subscription: ${SUBSCRIPTION_NAME}"
  gcloud pubsub subscriptions update "${SUBSCRIPTION_NAME}" \
    --topic "${TOPIC_NAME}" \
    --ack-deadline="${ACK_DEADLINE}" \
    --expiration-period=never \
    --push-endpoint="${PUSH_ENDPOINT}" \
    --push-auth-service-account="${SA_EMAIL}" \
    --project "${PROJECT_ID}"
else
  echo "Creating push subscription: ${SUBSCRIPTION_NAME}"
  gcloud pubsub subscriptions create "${SUBSCRIPTION_NAME}" \
    --topic "${TOPIC_NAME}" \
    --ack-deadline="${ACK_DEADLINE}" \
    --expiration-period=never \
    --push-endpoint="${PUSH_ENDPOINT}" \
    --push-auth-service-account="${SA_EMAIL}" \
    --project "${PROJECT_ID}"
fi

echo ""
echo "Done. Set checks-proofig extension config (credentials/project come from api.*):"
echo "  pdfService:"
echo "    topic: ${TOPIC_NAME}"
echo "    # or: projects/${PROJECT_ID}/topics/${TOPIC_NAME}"
echo ""
echo "Publisher SA (already used for converter): ${SA_EMAIL}"
echo "Test publish (optional):"
echo "  gcloud pubsub topics publish ${TOPIC_NAME} --project ${PROJECT_ID} --message '{\"test\":true}'"
