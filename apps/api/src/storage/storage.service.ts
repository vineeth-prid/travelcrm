import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { Env } from '../config/env';

/** Presigned links outlive a working session but not much more. */
const LINK_TTL_SECONDS = 24 * 60 * 60;

interface Endpoint {
  endPoint: string;
  port: number;
  useSSL: boolean;
}

/**
 * Something printable out of whatever was thrown.
 *
 * The minio client throws `S3Error`s whose `message` is sometimes empty, which
 * is how a broken region lookup reached the log as a bare `S3Error:` with
 * nothing after it. The class name at least says which library failed.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || `${error.name} (no message)`;
}

function parseEndpoint(url: string): Endpoint {
  const parsed = new URL(url);
  const useSSL = parsed.protocol === 'https:';
  return {
    endPoint: parsed.hostname,
    port: Number(parsed.port) || (useSSL ? 443 : 80),
    useSSL,
  };
}

/**
 * Object storage for generated PDFs.
 *
 * Two clients on purpose: uploads go to the endpoint the API can reach
 * (`minio:9000` inside Compose), while presigned links must be signed for the
 * host the browser — and WhatsApp — will actually fetch. A signature is bound
 * to the host it was made for, so one client cannot do both.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly internal: Client;
  private readonly public: Client;
  private readonly bucket: string;
  /** Where PDFs land when MinIO is unreachable. */
  private readonly localRoot: string;
  private readonly apiUrl: string;

  constructor(config: ConfigService<Env, true>) {
    const credentials = {
      accessKey: config.get('MINIO_ACCESS_KEY', { infer: true }),
      secretKey: config.get('MINIO_SECRET_KEY', { infer: true }),
      /**
       * Explicit, and not optional.
       *
       * Without a region the minio client resolves one lazily the first time
       * it signs a URL, by calling `GET /bucket?location`. Against MinIO that
       * round trip fails inside the client's own XML parsing and surfaces as a
       * bare `S3Error` with no message — so every proposal PDF failed at the
       * link stage, after the upload had already succeeded, with nothing in
       * the log to say why. Naming the region means the call never happens.
       */
      region: config.get('MINIO_REGION', { infer: true }),
    };

    this.bucket = config.get('MINIO_BUCKET', { infer: true });
    this.localRoot = resolve(config.get('STORAGE_DIR', { infer: true }));
    this.apiUrl = `${config.get('API_URL', { infer: true }).replace(/\/$/, '')}/api/v1`;
    this.internal = new Client({
      ...parseEndpoint(config.get('MINIO_ENDPOINT', { infer: true })),
      ...credentials,
    });
    this.public = new Client({
      ...parseEndpoint(config.get('MINIO_PUBLIC_URL', { infer: true })),
      ...credentials,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.internal.bucketExists(this.bucket))) {
        await this.internal.makeBucket(this.bucket);
        this.logger.log(`Created bucket "${this.bucket}"`);
      }
    } catch (error) {
      // Storage is only needed when a PDF is generated; do not block startup.
      this.logger.warn(`Object storage is not ready: ${describe(error)}`);
    }
  }

  /**
   * Stores an object, falling back to the local disk when MinIO cannot be
   * reached.
   *
   * Object storage being down used to mean no PDF could be generated at all,
   * which in turn meant no proposal could be submitted — a whole workflow
   * blocked by a service a small agency may not even be running. A document
   * on the API's own disk is served back through `GET /files/…`, which is
   * authorised properly; the only thing lost is the public link that channel
   * delivery needs.
   */
  async put(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.internal.putObject(this.bucket, objectKey, body, body.length, {
        'Content-Type': contentType,
      });
      return;
    } catch (error) {
      this.logger.warn(
        `Object storage rejected ${objectKey} (${describe(error)}). ` +
          'Writing it to local disk instead.',
      );
    }

    const path = this.localPath(objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    this.logger.log(`Stored ${objectKey} locally at ${path}`);
  }

  /**
   * A link the browser can fetch.
   *
   * Presigned when the object is in MinIO — that link is public, which is what
   * channel delivery needs. If signing fails the document is not lost: the API
   * can serve it itself, so the fallback is an authenticated `/files/…` URL
   * rather than an error. Failing to *sign* a link must never look the same as
   * failing to produce the document.
   */
  async presignedUrl(objectKey: string): Promise<string> {
    if (existsSync(this.localPath(objectKey))) {
      return `${this.apiUrl}/files/${objectKey}`;
    }

    try {
      return await this.public.presignedGetObject(this.bucket, objectKey, LINK_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Could not presign ${objectKey} (${describe(error)}). Serving it through the API instead.`,
      );
      return `${this.apiUrl}/files/${objectKey}`;
    }
  }

  /**
   * Reads an object back, wherever it lives: local disk first, then MinIO.
   * This is what `GET /files/…` serves.
   */
  async read(objectKey: string): Promise<Buffer | null> {
    if (existsSync(this.localPath(objectKey))) {
      return readFile(this.localPath(objectKey));
    }

    try {
      const stream = await this.internal.getObject(this.bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.warn(`Could not read ${objectKey}: ${describe(error)}`);
      return null;
    }
  }

  /**
   * Where an object key lands on disk.
   *
   * The key is built by this application, never by a client, but it is still
   * resolved and checked against the root: a traversal here would hand out
   * arbitrary files from the server.
   */
  private localPath(objectKey: string): string {
    const path = resolve(this.localRoot, objectKey);

    if (path !== this.localRoot && !path.startsWith(this.localRoot + sep)) {
      throw new Error(`Refusing to touch ${objectKey}: it resolves outside the storage directory.`);
    }

    return path;
  }
}
