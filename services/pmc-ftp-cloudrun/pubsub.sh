# Create service account
gcloud iam service-accounts create pmc-ftp-invoker \
  --display-name "PMC FTP Invoker"

# Give it permission to invoke the service
gcloud run services add-iam-policy-binding pmc-ftp-service \
  --member=serviceAccount:pmc-ftp-invoker@hhmi-staging-1.iam.gserviceaccount.com \
  --role=roles/run.invoker \
  --region us-central1

# Give it permission to publish to pubsub
gcloud projects add-iam-policy-binding hhmi-staging-1 \
  --member=serviceAccount:pmc-ftp-invoker@hhmi-staging-1.iam.gserviceaccount.com \
  --role=roles/pubsub.publisher

# Give it permission to create auth tokens (879616685817 is project number)
gcloud projects add-iam-policy-binding hhmi-staging-1 --member=serviceAccount:service-879616685817@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator

# Create pub/sub subscription with the account
gcloud pubsub topics create pmcFtpTopic
gcloud pubsub subscriptions create pmcFtpSub --topic pmcFtpTopic \
  --ack-deadline=600 \
  --push-endpoint=https://pmc-ftp-service-rp3wqy5zpq-uc.a.run.app \
  --push-auth-service-account=pmc-ftp-invoker@hhmi-staging-1.iam.gserviceaccount.com

# Test it out!
gcloud pubsub topics publish pmcFtpTopic --attribute "id=PMC7320451"

# Add to config:
# depositService:
#   url: https://pmc-ftp-service-rp3wqy5zpq-uc.a.run.app
#   topic: pmcFtpTopic
#   projectId: hhmi-staging-1
#   secretKeyfile: { for pmc-ftp-invoker }
