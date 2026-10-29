import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ObjectInfo, PresignedUpload, StoragePort } from './storage.port';
import { URL_TTL_SECONDS } from './storage.port';

export interface S3Options {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/** AWS S3 o cualquier compatible (MinIO, Cloudflare R2) con `endpoint`. */
export class S3Storage implements StoragePort {
  private readonly client: S3Client;

  constructor(private readonly options: S3Options) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint || undefined,
      forcePathStyle: options.forcePathStyle,
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
          : undefined,
    });
  }

  async presignPut(key: string, contentType: string, bytes: number): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: bytes,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: URL_TTL_SECONDS });
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  presignGet(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.options.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: URL_TTL_SECONDS });
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      return { bytes: res.ContentLength ?? 0, contentType: res.ContentType ?? '' };
    } catch {
      return null;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.options.bucket, Delete: { Objects: keys } }),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }
}
