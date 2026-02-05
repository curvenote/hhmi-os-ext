#!/bin/sh

docker run \
  -p 8080:8080 \
  -v ~/.config/gcloud/application_default_credentials.json:/usr/app/application_default_credentials.json \
  -e GOOGLE_APPLICATION_CREDENTIALS=/usr/app/application_default_credentials.json \
  -e FTP_HOST=0.0.0.0 \
  -e FTP_USERNAME=test \
  -e FTP_PASSWORD=test \
  pmc-ftp-local