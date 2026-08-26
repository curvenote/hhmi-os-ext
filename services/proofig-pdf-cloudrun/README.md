# proofig-pdf-service (Cloud Run)

Deployment shell for `@hhmi/proofig-pdf-service`. Renders a Proofig report URL to a
PDF in headless Chromium and stores it back on the work version CDN for a Proofig
check service run.

This directory lives **outside** the npm workspaces (like `pmc-ftp-cloudrun`). It
contains only the Docker image definition, deploy scripts, and a pre-bundled
`index.js` produced from the source package.

## Layout

| File | Purpose |
|------|---------|
| `Dockerfile` | Playwright base image (Chromium + deps), runs the bundled service |
| `package.json` | Runtime deps (`playwright`) + `build:service` bundling script |
| `build.sh` | `gcloud builds submit` — build image on Cloud Build |
| `deploy.sh` | `gcloud run deploy` |
| `local.sh` | Build the bundle + Docker image and run locally |
| `run.sh` | Run the already-built local image |
| `scripts/post-message.sh` | POST a Pub/Sub-shaped message to a local container (full job envelope) |
| `scripts/post-test-render.sh` | POST `/test-render` for render-only smoke tests (requires `PROOFIG_PDF_RENDER_ONLY=1`) |
| `pubsub/pubsub.sh` | Idempotent topic + push subscription + IAM setup |

The service source lives in
[`../../packages/proofig-pdf-service`](../../packages/proofig-pdf-service). It is
bundled with esbuild into a single `index.js`; `playwright` is left external and
installed from this shell's `package.json` so it matches the Chromium in the base
image. **Keep the `playwright` version here in sync with the `Dockerfile` tag.**

## Message contract

Pub/Sub push envelope. Required attributes: `jobUrl`, `handshake`, `userId`
(standard SCMS job callback attributes). The base64 JSON `data` payload:

```json
{
  "reportUrl": "https://proofig.example.com/report?token=...",
  "work_version_id": "...",
  "check_service_run_id": "...",
  "cdn": "...",
  "cdn_key": "...",
  "report_id": "optional",
  "force": false
}
```

On success the service:
1. prints the report to `report.pdf` (A4, `printBackground`, print media emulation),
2. uploads it to `{cdn_key}/generated/{check_service_run_id}/proofig-report.pdf`,
3. POSTs `v1/hooks/proofig/pdf-stored/{check_service_run_id}` to register the file,
4. marks the job `COMPLETED`.

## Local development

Local host port defaults to **8088** (container still listens on 8080) so it does not
collide with other services on 8080. Override with `PORT=...` in `.env` or the
environment; `local.sh`, `run.sh`, and the test scripts all honour it.

```bash
cp .env.sample .env   # set GCP_PROJECT, GCP_REGION, PORT

# Optional: enable render-only smoke tests (no SCMS callbacks)
# PROOFIG_PDF_RENDER_ONLY=1
# RENDER_OUTPUT_DIR=./output

# Build the bundle + image and run
./local.sh

# Render-only smoke test (Playwright only — recommended when validating a report URL)
./scripts/post-test-render.sh "https://your-report-url?token=..."

# Full Pub/Sub-shaped envelope (exercises production POST / handler)
./scripts/post-message.sh "https://your-report-url?token=..."
```

### Render-only test mode

Set `PROOFIG_PDF_RENDER_ONLY=1` in `.env` before `./local.sh`. The container exposes
`POST /test-render` with body `{ "reportUrl": "..." }`. It renders the report to PDF
and returns `{ ok, size, md5, outputPath? }` without patching jobs, uploading to CDN,
or calling the pdf-stored hook.

When `RENDER_OUTPUT_DIR=./output` is set, `local.sh` resolves that relative path on
the host and bind-mounts it to `/render-output` inside the container. The PDF is
written as `./output/proofig-report.pdf` on the host.

Do **not** set `PROOFIG_PDF_RENDER_ONLY` on deployed Cloud Run services.

For the full pipeline (upload + hooks + job completion), use `post-message.sh` against
`POST /` with real SCMS job attributes, or trigger `PROOFIG_PERSIST_PDF` from the app.

## Deploy

```bash
# 1. Build image on Cloud Build
npm run build          # runs build:service then build.sh

# 2. Deploy to Cloud Run (internal ingress, no unauth)
npm run deploy

# 3. Wire Pub/Sub (needs the deployed URL)
cd pubsub
export PROJECT_ID=... PROJECT_NUMBER=... REGION=... \
  PUSH_ENDPOINT=https://proofig-pdf-service-xxxxx-uc.a.run.app
./pubsub.sh
```

Then set the `checks-proofig` extension `pdfService.topic` (and optional `devLocalPushUrl`
for local stub pushes). GCP `api.pubsubProjectId` and publisher credentials
(`api.converterSASecretKeyfile`) come from main app-config — the same values used for
converter Pub/Sub.
