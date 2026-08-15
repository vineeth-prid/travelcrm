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
      this.logger.warn(
        `Object storage is not ready: ${error instanceof Error ? error.message : String(error)}`,
      );
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
        `Object storage rejected ${objectKey} (${error instanceof Error ? error.message : String(error)}). ` +
          'Writing it to local disk instead.',
      );
    }

    const path = this.localPath(objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    this.logger.log(`Stored ${objectKey} locally at ${path}`);
  }

  /**
   * A link the browser can fetch. Presigned when the object is in MinIO, and
   * an authenticated API URL when it is on local disk.
   */
  async presignedUrl(objectKey: string): Promise<string> {
    if (existsSync(this.localPath(objectKey))) {
      return `${this.apiUrl}/files/${objectKey}`;
    }

    return this.public.presignedGetObject(this.bucket, objectKey, LINK_TTL_SECONDS);
  }

  /** Reads back an object that was written to local disk. */
  readLocal(objectKey: string): Promise<Buffer> {
    return readFile(this.localPath(objectKey));
  }

  hasLocal(objectKey: string): boolean {
    return existsSync(this.localPath(objectKey));
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
