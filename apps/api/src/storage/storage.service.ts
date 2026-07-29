import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

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

  constructor(config: ConfigService<Env, true>) {
    const credentials = {
      accessKey: config.get('MINIO_ACCESS_KEY', { infer: true }),
      secretKey: config.get('MINIO_SECRET_KEY', { infer: true }),
    };

    this.bucket = config.get('MINIO_BUCKET', { infer: true });
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

  async put(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.internal.putObject(this.bucket, objectKey, body, body.length, {
      'Content-Type': contentType,
    });
  }

  /** Time-limited URL the browser (and WhatsApp) can fetch directly. */
  presignedUrl(objectKey: string): Promise<string> {
    return this.public.presignedGetObject(this.bucket, objectKey, LINK_TTL_SECONDS);
  }
}
