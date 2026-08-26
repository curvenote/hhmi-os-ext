# Playwright base image ships Chromium + system deps matching the pinned playwright version.
# Keep this tag in sync with the `playwright` dependency in package.json.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /usr/app

# index.js is the pre-bundled service (esbuild) copied in by build:service.
# `native/` holds optional `.node` artifacts from `--loader:.node=copy` (always staged
# with at least `.keep` so this COPY never fails when none were emitted).
COPY index.js package.json package-lock.json* ./
COPY native/ ./
RUN npm install --omit=dev

CMD ["npm", "run", "start"]
