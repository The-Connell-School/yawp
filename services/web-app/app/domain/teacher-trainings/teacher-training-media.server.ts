import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  s3,
  buildModuleVideoKey,
  createMultipartUploadHelpers,
} from '~/services/s3.server';
import { response } from '~/utils/internal-admin-write.server';

export const PART_SIZE = 16 * 1024 * 1024;
export const MAX_RESOURCE_BYTES = 20 * 1024 * 1024;
export const resourceContentTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;
export type UploadInput = {
  kind: 'video' | 'resource';
  trainingId: string;
  moduleId: string;
  name: string;
  contentType: string;
  size: number;
};
export type UploadSession = UploadInput & {
  uploadId: string;
  key: string;
  partSize: number;
  partCount: number;
  expiresAt: string;
};
export type CompletedPart = { partNumber: number; etag: string };
export type TeacherTrainingMedia = ReturnType<
  typeof createTeacherTrainingMedia
>;
const invalid = (message: string) => response({ error: message }, 400);

export function matchesImage(blob: Buffer, contentType: string) {
  switch (contentType) {
    case 'image/png':
      return blob.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    case 'image/jpeg':
      return blob.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(
        blob.subarray(0, 6).toString('ascii')
      );
    case 'image/webp':
      return (
        blob.length >= 12 &&
        blob.subarray(0, 4).equals(Buffer.from('RIFF')) &&
        blob.subarray(8, 12).equals(Buffer.from('WEBP'))
      );
    default:
      return false;
  }
}
function matchesResource(blob: Buffer, type: string) {
  if (type.startsWith('image/')) return matchesImage(blob, type);
  if (type === 'application/pdf')
    return blob.subarray(0, 5).equals(Buffer.from('%PDF-'));
  // Office Open XML is a ZIP package. Check central-directory entry names without
  // decompressing untrusted content or accepting an arbitrary ZIP as an Office file.
  const expected = type.includes('wordprocessingml')
    ? 'word/document.xml'
    : 'ppt/presentation.xml';
  if (!blob.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))) return false;
  let contentTypes = false,
    document = false;
  for (let i = 0; i + 46 <= blob.length; i++) {
    if (blob.readUInt32LE(i) !== 0x02014b50) continue;
    const length = blob.readUInt16LE(i + 28);
    if (i + 46 + length > blob.length) return false;
    const name = blob.subarray(i + 46, i + 46 + length).toString('utf8');
    if (name === '[Content_Types].xml') contentTypes = true;
    if (name === expected) document = true;
    i += 45 + length + blob.readUInt16LE(i + 30) + blob.readUInt16LE(i + 32);
  }
  return contentTypes && document;
}
export function createTeacherTrainingMedia(
  input: { client?: S3Client; bucket?: string; sign?: typeof getSignedUrl } = {}
) {
  const client = input.client ?? s3;
  const bucket = input.bucket ?? process.env.AWS_S3_BUCKET_FOR_VIDEOS!;
  const multipart = createMultipartUploadHelpers({
    client,
    bucket,
    sign: input.sign,
  });
  return {
    async createUpload(fields: UploadInput): Promise<UploadSession> {
      const uniqueName = `${randomUUID()}-${fields.name}`;
      const key =
        fields.kind === 'video'
          ? buildModuleVideoKey(fields.trainingId, fields.moduleId, uniqueName)
          : `teacher-trainings/${fields.trainingId}/modules/${fields.moduleId}/resources/${uniqueName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const started = await multipart.start(key, fields.contentType);
      return {
        ...fields,
        ...started,
        partSize: PART_SIZE,
        partCount: Math.ceil(fields.size / PART_SIZE),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    },
    async signUpload(upload: UploadSession) {
      const parts: { partNumber: number; url: string }[] = [];
      // Sign locally; do not create hundreds of simultaneous promises for one request.
      for (let n = 1; n <= upload.partCount; n++) {
        const length = Math.min(
          upload.partSize,
          upload.size - (n - 1) * upload.partSize
        );
        parts.push({
          partNumber: n,
          url: await multipart.signPart(upload.key, upload.uploadId, n, length),
        });
      }
      return { ...upload, expiresIn: 3600, parts };
    },
    async completeUpload(
      upload: UploadSession,
      parts: CompletedPart[]
    ): Promise<Buffer<ArrayBuffer> | undefined> {
      try {
        const expected = [...parts].sort((a, b) => a.partNumber - b.partNumber);
        if (
          expected.length !== upload.partCount ||
          expected.some((part, i) => part.partNumber !== i + 1)
        )
          throw invalid('Uploaded parts do not match the upload session');
        // UploadPart signatures bind each Content-Length. CompleteMultipartUpload
        // validates the supplied ETags, and HeadObject below verifies total size.
        // The existing bucket role intentionally does not grant ListParts access.
        await multipart.complete(
          upload.key,
          upload.uploadId,
          expected.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }))
        );
      } catch (error) {
        // S3 completion can succeed before a DB rollback. A retry uses the unique,
        // server-issued key and still verifies the completed object's metadata.
        if (
          error instanceof Error &&
          ['InvalidPart', 'InvalidPartOrder', 'EntityTooSmall'].includes(
            error.name
          )
        )
          throw invalid('Uploaded parts do not match the upload session');
        if (!(error instanceof Error) || error.name !== 'NoSuchUpload')
          throw error;
      }
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: upload.key })
      );
      if (
        head.ContentLength !== upload.size ||
        head.ContentType !== upload.contentType
      )
        throw invalid('Uploaded object size or content type does not match');
      if (upload.kind === 'video') return;
      if (upload.size > MAX_RESOURCE_BYTES)
        throw response({ error: 'Resource exceeds 20 MiB limit' }, 413);
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: upload.key })
      );
      if (!object.Body) throw invalid('Uploaded object is empty');
      const chunks: Buffer[] = [];
      let size = 0;
      // Stream with an independent bound; neither the caller nor S3 metadata can
      // force an unbounded allocation into the legacy resource blob column.
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > MAX_RESOURCE_BYTES || size > upload.size)
          throw response({ error: 'Uploaded resource too large' }, 413);
        chunks.push(Buffer.from(chunk));
      }
      const blob = Buffer.concat(chunks, size);
      if (size !== upload.size || !matchesResource(blob, upload.contentType))
        throw invalid('Resource content does not match its content type');
      return blob;
    },
  };
}
