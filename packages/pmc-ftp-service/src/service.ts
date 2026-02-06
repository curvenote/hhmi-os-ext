/**
 * FTP Service for PMC Manuscript Deposits
 *
 * This service handles the processing and upload of manuscript deposits to PMC (PubMed Central).
 * It downloads files from cloud storage, creates manifest files, generates XML metadata,
 * packages everything into a tar.gz archive, and uploads to an SFTP server.
 *
 * Key Features:
 * - Streaming file downloads for memory efficiency with large files
 * - Concurrent download processing with rate limiting
 * - Automatic manifest and XML generation
 * - SFTP upload with directory management
 * - Comprehensive error handling and cleanup
 */

import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import Client from 'ssh2-sftp-client';
import express from 'express';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { create as createTar } from 'tar';
import {
  hyphenatedFromDate,
  removeFolder,
  withPubSubHandler,
  type HandlerContext,
} from '@curvenote/scms-tasks';
import { preparePMCManifestText } from 'pmc-node-utils';
import {
  AAMDepositManifestSchema,
  pmcXmlFromManifest,
  formatZodErrorForStatus,
  type AAMDepositManifest,
} from 'pmc-utils';

/**
 * Creates and configures the Express service for handling PMC deposit requests
 *
 * @returns Express application instance
 */
export function createService() {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/', async (_, res) => {
    console.log('Received GET request');
    return res.send('Curvenote FTP Service');
  });

  /**
   * Main endpoint for processing PMC deposit requests.
   *
   * Uses withPubSubHandler for validation, temp folder, job client, and cleanup.
   * Workflow: validate manifest → download files (streaming) → generate manifest/XML →
   * create tar.gz → upload to SFTP.
   */
  app.post(
    '/',
    withPubSubHandler(async (ctx: HandlerContext<unknown>) => {
      const { client, res, tmpFolder } = ctx;

      // Extract and validate the manifest data
      const parseResult = AAMDepositManifestSchema.safeParse(ctx.payload);
      console.log('Parsed manifest', parseResult);
      if (!parseResult.success) {
        const errorMessage = formatZodErrorForStatus(parseResult.error);
        throw new Error(`Invalid manifest: ${errorMessage}`);
      }
      const manifest: AAMDepositManifest = parseResult.data;
      const id = manifest.taskId;
      console.log('Task ID', id);

      // Clean and recreate temporary folder (match original behavior: empty dir for this job)
      removeFolder(tmpFolder);
      await fs.mkdir(tmpFolder, { recursive: true });

      /**
       * STREAMING FILE DOWNLOADS
       *
       * This section handles downloading files from cloud storage using streaming
       * to efficiently handle large files without loading them entirely into memory.
       *
       * Key benefits:
       * - Memory usage stays constant (~256KB) regardless of file size
       * - Can handle multi-GB files without memory exhaustion
       * - Proper backpressure handling prevents overwhelming the system
       * - Concurrent downloads with rate limiting (max 5 simultaneous)
       *
       * Technical details:
       * - Uses Node.js streams with pipeline() for proper error handling
       * - Configurable buffer size via STREAM_BUFFER_KB environment variable
       * - Default 256KB buffer balances memory usage vs performance
       * - Works with both text and binary files automatically
       */
      await client.running(res, `Downloading ${manifest.files.length} files...`);

      // Rate limiter: Allow maximum 5 concurrent downloads to prevent overwhelming
      // the source server or network connection
      const limit = pLimit(5);

      await Promise.all(
        manifest.files.map((file) =>
          limit(async () => {
            console.log(`Starting download: ${file.filename} from ${file.path}`);

            // Fetch file from cloud storage (could be Google Cloud Storage, AWS S3, etc.)
            const fileResp = await fetch(file.path);
            if (!fileResp.ok) {
              throw new Error(`Unable to download file: ${file.path} (HTTP ${fileResp.status})`);
            }
            console.log('Downloading file - have response', file.filename);

            /**
             * STREAMING SETUP
             *
             * Instead of loading the entire file into memory with .arrayBuffer() or .text(),
             * we stream the response directly to disk. This approach:
             *
             * 1. Uses a configurable buffer size (default 256KB)
             * 2. Handles backpressure automatically
             * 3. Provides proper error handling and cleanup
             * 4. Works with files of any size (MB to GB+)
             *
             * Buffer size can be tuned via STREAM_BUFFER_KB environment variable:
             * - 64KB: Memory-constrained environments, small files
             * - 256KB: Balanced default for most use cases
             * - 512KB-1MB: High-performance storage, large files
             */

            // Stream the file directly to disk to handle large files efficiently
            const filePath = path.join(tmpFolder, file.filename);

            // Configure write stream with optimized buffer size
            // Buffer size affects memory usage vs performance tradeoff
            const bufferSize = parseInt(process.env.STREAM_BUFFER_KB ?? '256') * 1024;
            const writeStream = createWriteStream(filePath, {
              highWaterMark: bufferSize, // Controls internal buffer size
            });

            // Ensure response has a body stream (should always be present for successful responses)
            if (!fileResp.body) {
              throw new Error(`No response body for file: ${file.path}`);
            }

            /**
             * PIPELINE STREAMING
             *
             * pipeline() connects the HTTP response stream to the file write stream.
             * Benefits over manual stream handling:
             * - Automatic error propagation and cleanup
             * - Proper backpressure handling (slows down reading if writing is slow)
             * - Automatic stream closure on completion or error
             * - Promise-based API for easy async/await usage
             *
             * The pipeline will:
             * 1. Read data from fileResp.body in chunks
             * 2. Write chunks to disk via writeStream
             * 3. Handle any errors by closing both streams
             * 4. Resolve when transfer is complete
             */
            await pipeline(fileResp.body, writeStream);
            console.log(`Downloaded file - written: ${file.filename}`);
          }),
        ),
      );
      console.log('Downloaded all files');

      await client.running(res, 'Generating manifest and metadata files...');

      /**
       * MANIFEST AND METADATA GENERATION
       *
       * After all files are downloaded, generate the required PMC submission files:
       * 1. manifest.txt - Tab-delimited file listing all contents
       * 2. bulk_meta.xml - XML metadata file with manuscript details
       */

      // Generate PMC-compliant manifest text file
      const manifestText = preparePMCManifestText(manifest);
      console.log('Prepared manifest text');
      await fs.writeFile(path.join(tmpFolder, 'manifest.txt'), manifestText);
      console.log('Wrote manifest text');

      // Generate XML metadata file required by PMC
      const xml = pmcXmlFromManifest(manifest);
      console.log('Generated XML metadata');
      await fs.writeFile(path.join(tmpFolder, 'bulk_meta.xml'), xml);
      console.log('Wrote bulk_meta.xml');

      await client.running(res, 'Creating archive package...');

      /**
       * ARCHIVE CREATION
       *
       * Package all files into a compressed tar.gz archive for upload
       */
      const tarFileName = `${id}.tar.gz`;
      const tarFilePath = path.join(tmpFolder, tarFileName);
      console.log('Creating tar file:', tarFilePath);

      try {
        await createTar({ gzip: true, file: tarFilePath, cwd: tmpFolder }, [
          'manifest.txt',
          'bulk_meta.xml',
          ...manifest.files.map(({ filename }) => filename),
        ]);
        console.log('Created tar file successfully');
      } catch (e) {
        console.error('Error creating tar.gz file', e);
        throw new Error('Error creating tar.gz file');
      }

      await client.running(res, 'Uploading to SFTP server...');

      /**
       * SFTP UPLOAD
       *
       * Upload the completed archive to the PMC SFTP server
       * with automatic directory creation based on current date
       */
      const sftpClient = new Client();
      console.log('Connecting to SFTP server');

      await sftpClient.connect({
        host: process.env.FTP_HOST,
        port: parseInt(process.env.FTP_PORT ?? '22'),
        username: process.env.FTP_USERNAME,
        password: process.env.FTP_PASSWORD,
      });
      console.log('Connected to SFTP server');

      // Create date-based directory structure (e.g., upload/2024-01-15/)
      const targetDir = `upload/${hyphenatedFromDate(new Date())}`;
      console.log('Checking if target directory exists:', targetDir);

      const dirExists = await sftpClient.exists(targetDir);
      if (!dirExists) {
        console.log('Creating target directory:', targetDir);
        await sftpClient.mkdir(targetDir);
        console.log('Created target directory successfully');
      } else {
        console.log('Target directory already exists');
      }

      // Upload the archive
      await sftpClient.put(tarFilePath, `${targetDir}/${tarFileName}`);
      console.log('Uploaded tar file successfully');

      // Clean up SFTP connection
      await sftpClient.end();
      console.log('Disconnected from SFTP server');

      // Report success (service responsibility); wrapper handles removeFolder(tmpFolder)
      const { successState, userId } = ctx.attributes;
      await client.putSubmissionStatus(successState, userId, res);
      await client.completed(res, 'FTP upload completed successfully', {
        taskId: id,
        tarFileName,
        targetDir,
        uploadedFiles: manifest.files.length,
      });
    }),
  );

  return app;
}
