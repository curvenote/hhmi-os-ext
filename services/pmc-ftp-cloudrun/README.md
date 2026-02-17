# PMC FTP Service - Cloud Run Deployment

This directory contains the Cloud Run deployment configuration for the PMC FTP service.

## Environment Configuration

### Setup

1. **Copy the sample environment file:**

   ```bash
   cp .env.sample .env
   ```

2. **Edit `.env` with your actual values:**

   ```bash
   # Required for deployment
   GCP_PROJECT=your-gcp-project-id
   FTP_HOST=your-sftp-host
   FTP_USERNAME=your-username
   FTP_PASSWORD=your-password

   # Optional configuration
   FTP_PORT=22
   STREAM_BUFFER_KB=256
   GCP_REGION=us-central1
   PORT=8080
   ```

### Environment Variables

| Variable           | Description               | Default     | Required            |
| ------------------ | ------------------------- | ----------- | ------------------- |
| `FTP_HOST`         | SFTP server hostname      | -           | ✅                  |
| `FTP_PORT`         | SFTP server port          | 22          | ❌                  |
| `FTP_USERNAME`     | SFTP username             | -           | ✅                  |
| `FTP_PASSWORD`     | SFTP password             | -           | ✅                  |
| `STREAM_BUFFER_KB` | Download buffer size (KB) | 256         | ❌                  |
| `GCP_PROJECT`      | Google Cloud project ID   | -           | ✅ (for deployment) |
| `GCP_REGION`       | Google Cloud region       | us-central1 | ❌                  |
| `PORT`             | Local development port    | 8080        | ❌                  |

## Scripts

### `./local.sh`

**Local Development & Testing**

Builds the FTP service, copies assets, creates Docker image, and runs locally:

```bash
./local.sh
```

Features:

- Automatically loads environment variables from `.env`
- Builds latest FTP service code
- Creates local Docker image (`pmc-ftp-local`)
- Runs container with proper environment configuration
- Includes helpful setup instructions if `.env` is missing

### `./build.sh`

**Production Remote Build with Environment Variables**

Builds Cloud Run Docker container remotely:

```bash
./build.sh
```

This does _not_ rebuild the latest FTP service code. If you need to rebuild the
service and build the Docker container remotely, use `npm run build`.

Features:

- Automatically loads environment variables from `.env`
- Builds remote Docker image on google, based on commit hash
- Includes helpful setup instructions if `.env` is missing

### `./deploy.sh`

**Production Deployment with Environment Variables**

Deploys to Google Cloud Run using environment variables:

```bash
./deploy.sh
```

Features:

- Validates required environment variables
- Uses `.env` file for configuration
- Deploys with proper Cloud Run settings
- Error handling for missing configuration

### Legacy Scripts

- `./run.sh` - Basic container run script - used by `npm run dev`, which now does the same thing as `./local.sh`

## Workflow

### Local Development

1. Set up environment: `cp .env.sample .env && edit .env`
2. Build and run: `./local.sh`
3. Test your changes locally
4. Commit your code changes (`.env` is gitignored)

### Build and Deploy For Staging

1. Ensure `.env` is configured with staging values
2. Build: `npm run build` - this will rebuild the service locally then run `./build.sh` to build the Docker container remotely
3. Deploy: `npm run deploy` - this will run `./deploy.sh`

### Build and Deploy For Production

1. Ensure `.env` is configured with production values - notably the correct FTP host/username/password
2. Build: `npm run build` - this will build the Docker container remotely in the production Google Cloud project
3. Deploy: `npm run deploy` - this will deploy the container with production .env values

## Security Notes

- ✅ `.env` files are gitignored and never committed
- ✅ Use `.env.sample` to document required variables
- ✅ Environment variables are loaded at runtime
- ✅ Production secrets stay out of the repository

## Buffer Size Configuration

The `STREAM_BUFFER_KB` variable controls memory usage vs performance:

- **64KB**: Memory-constrained environments
- **256KB**: Balanced default (recommended)
- **512KB**: High-performance storage
- **1MB**: Large files, fast network/storage

## SFTP client install on mac

You can connect via CLI on mac with SFTP client:

```
brew install inetutils
```

To connect to your local server:

```
sftp curvenote@34.82.165.84
```

It should prompt for password, then successfully connect.

## SFTP server install on GCP

I followed the instructions here exactly: https://stackoverflow.com/questions/63964361/set-up-ftp-in-google-cloud-platform

The only extra step I had to take was, in `/etc/ssh/sshd_config` change `PasswordAuthentication` from `no` to `yes`. Also, to match the PMC deposit folder structure, create the folder `upload` instead of `uploads`.
