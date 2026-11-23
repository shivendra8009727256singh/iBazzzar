// Upload processing. Files are identified by their bytes, never by the declared type. Images are re-encoded to WebP,
// which strips metadata and any payload hidden in the original. PDFs are accepted only for documents.
import sharp from 'sharp';
import { DomainError } from '../../../../packages/shared/src/index.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const isJpeg = (b) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]);
const isWebp = (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b.subarray(8, 12).toString() === 'WEBP';
const isPdf = (b) => b.subarray(0, 5).toString() === '%PDF-';

export async function processImage(buffer, { minSize = 300, maxSize = 1600 } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new DomainError('Choose an image to upload');
  if (buffer.length > MAX_IMAGE_BYTES) throw new DomainError('Images must be 5 MB or smaller', 413);
  if (!isJpeg(buffer) && !isPng(buffer) && !isWebp(buffer)) throw new DomainError('Upload a JPEG, PNG or WebP image', 415);
  let image;
  try {
    image = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
    const meta = await image.metadata();
    if ((meta.width || 0) < minSize || (meta.height || 0) < minSize) throw new DomainError(`Photos must be at least ${minSize} × ${minSize} pixels`);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('This image could not be read', 415);
  }
  const { data, info } = await image
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  return { data, mime: 'image/webp', width: info.width, height: info.height };
}

/** Business documents (GST certificate, drawings, specs): PDF or image. */
export async function processDocument(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new DomainError('Choose a file to upload');
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new DomainError('Files must be 8 MB or smaller', 413);
  if (isPdf(buffer)) {
    // Active content is not allowed in documents we serve back to other users.
    const text = buffer.toString('latin1');
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/.test(text)) throw new DomainError('This PDF contains scripts or embedded files and can’t be accepted', 415);
    return { data: buffer, mime: 'application/pdf', width: null, height: null };
  }
  return processImage(buffer, { minSize: 200, maxSize: 2400 });
}
