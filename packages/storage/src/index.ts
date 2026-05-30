import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type MediaStorageDisk = 'local' | 'r2';
export type MediaStorageMode = 'archive' | 'metadata_only';

export type MediaStorageConfig = {
  disk: MediaStorageDisk;
  mode: MediaStorageMode;
  retentionDays: number;
  localRoot: string;
  storageBaseUrl?: string;
  r2?: {
    endpoint?: string;
    region: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
};

export type SaveMediaInput = {
  instanceId: string;
  fileName: string;
  bytes: Buffer;
  mimeType: string;
};

export type SavedMedia = {
  mediaUrl: string;
  mediaPath: string;
  mediaExpiresAt: Date;
};

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function requireR2Config(config: MediaStorageConfig) {
  const r2 = config.r2;
  if (!r2?.endpoint || !r2.bucket || !r2.accessKeyId || !r2.secretAccessKey || !config.storageBaseUrl) {
    throw new Error('R2 storage requires R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and STORAGE_BASE_URL.');
  }

  return {
    endpoint: r2.endpoint,
    bucket: r2.bucket,
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
    region: r2.region,
    storageBaseUrl: config.storageBaseUrl,
  };
}

export class MediaStorage {
  private s3?: S3Client;

  constructor(private readonly config: MediaStorageConfig) {}

  isArchiveEnabled() {
    return this.config.mode === 'archive';
  }

  async save(input: SaveMediaInput): Promise<SavedMedia | undefined> {
    if (!this.isArchiveEnabled()) return undefined;

    const safeFileName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${trimSlashes(input.instanceId)}/${safeFileName}`;
    const mediaExpiresAt = addDays(this.config.retentionDays);

    if (this.config.disk === 'r2') {
      const r2 = requireR2Config(this.config);
      this.s3 ??= new S3Client({
        endpoint: r2.endpoint,
        region: r2.region,
        credentials: {
          accessKeyId: r2.accessKeyId,
          secretAccessKey: r2.secretAccessKey,
        },
        forcePathStyle: true,
      });

      await this.s3.send(new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: input.bytes,
        ContentType: input.mimeType,
        Metadata: {
          'ravoxzap-expires-at': mediaExpiresAt.toISOString(),
        },
      }));

      return {
        mediaUrl: `${r2.storageBaseUrl.replace(/\/+$/, '')}/${key}`,
        mediaPath: `${r2.storageBaseUrl.replace(/\/+$/, '')}/${key}`,
        mediaExpiresAt,
      };
    }

    const instanceMediaPath = path.join(this.config.localRoot, input.instanceId);
    const absolutePath = path.join(instanceMediaPath, safeFileName);
    await mkdir(instanceMediaPath, { recursive: true });
    await writeFile(absolutePath, input.bytes);

    return {
      mediaUrl: `/media/${input.instanceId}/${safeFileName}`,
      mediaPath: absolutePath,
      mediaExpiresAt,
    };
  }
}

export function createMediaStorage(config: MediaStorageConfig) {
  return new MediaStorage(config);
}
