// Media storage adapters with one interface: put(buffer, contentType) → { key, url }, get(key), remove(key).
// Keys are random UUID file names, so uploads cannot be guessed or overwrite each other.
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const KEY = /^[0-9a-f-]{36}\.(webp|pdf)$/;
const extensionFor = (type) => (type === 'application/pdf' ? 'pdf' : 'webp');

export function localStorage(dir) {
  const root = resolve(dir);
  return {
    driver: 'local',
    async put(data, contentType = 'image/webp') {
      await mkdir(root, { recursive: true });
      const key = `${randomUUID()}.${extensionFor(contentType)}`;
      await writeFile(join(root, key), data);
      return { key, url: `/api/media/${key}` };
    },
    async get(key) {
      if (!KEY.test(key)) return null;
      try { return await readFile(join(root, key)); } catch { return null; }
    },
    async remove(key) {
      if (KEY.test(key)) await unlink(join(root, key)).catch(() => {});
    },
  };
}

/** S3-compatible storage (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO). */
export async function s3Storage({ bucket, region, endpoint, accessKeyId, secretAccessKey, publicUrl }) {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region, endpoint, forcePathStyle: !!endpoint,
    ...(accessKeyId ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return {
    driver: 's3',
    async put(data, contentType = 'image/webp') {
      const key = `${randomUUID()}.${extensionFor(contentType)}`;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
      // With a CDN/public bucket URL the browser loads media directly; otherwise the API streams it.
      return { key, url: publicUrl ? `${publicUrl.replace(/\/$/, '')}/${key}` : `/api/media/${key}` };
    },
    async get(key) {
      if (!KEY.test(key)) return null;
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return Buffer.from(await out.Body.transformToByteArray());
      } catch { return null; }
    },
    async remove(key) {
      if (KEY.test(key)) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
    },
  };
}

export async function createStorage(storage) {
  return storage.driver === 's3' ? s3Storage(storage.s3) : localStorage(storage.mediaDir);
}
