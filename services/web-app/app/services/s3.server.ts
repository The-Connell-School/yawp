import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const videoBucket = process.env.AWS_S3_BUCKET_FOR_VIDEOS!;
const region = process.env.AWS_S3_REGION_FOR_VIDEOS!;

export const s3 = new S3Client({ region });

export function buildModuleVideoKey(
  teacherTrainingId: string,
  moduleId: string,
  fileName: string
) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `teacher-trainings/${teacherTrainingId}/modules/${moduleId}/video/${Date.now()}-${safe}`;
}

export async function putSmallObject(
  key: string,
  body: Buffer | Uint8Array | Blob,
  contentType: string
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: videoBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getSignedGetUrl(key: string, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: videoBucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

export async function deleteSmallObject(key: string) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: videoBucket,
      Key: key,
    })
  );
}

/** Same client/bucket as the admin uploads; injection keeps multipart checks offline in tests. */
export function createMultipartUploadHelpers(input: {
  client: S3Client;
  bucket: string;
  sign?: typeof getSignedUrl;
}) {
  const sign = input.sign ?? getSignedUrl;
  return {
    async start(key: string, contentType: string) {
      const result = await input.client.send(
        new CreateMultipartUploadCommand({
          Bucket: input.bucket,
          Key: key,
          ContentType: contentType,
        })
      );
      if (!result.UploadId)
        throw new Error('Multipart upload did not return an ID');
      return { key, uploadId: result.UploadId };
    },
    async signPart(
      key: string,
      uploadId: string,
      partNumber: number,
      contentLength?: number
    ) {
      return sign(
        input.client,
        new UploadPartCommand({
          Bucket: input.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          ...(contentLength !== undefined
            ? { ContentLength: contentLength }
            : {}),
        }),
        { expiresIn: 3600 }
      );
    },
    async complete(
      key: string,
      uploadId: string,
      parts: { ETag: string; PartNumber: number }[]
    ) {
      await input.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: input.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber),
          },
        })
      );
    },
    async abort(key: string, uploadId: string) {
      await input.client.send(
        new AbortMultipartUploadCommand({
          Bucket: input.bucket,
          Key: key,
          UploadId: uploadId,
        })
      );
    },
  };
}
const multipart = createMultipartUploadHelpers({
  client: s3,
  bucket: videoBucket,
});
export const startMultipartUpload = multipart.start;
export const signPartUpload = multipart.signPart;
export const completeMultipartUpload = multipart.complete;
export const abortMultipartUpload = multipart.abort;

// Document snapshot S3 archival removed; DB snapshots are sufficient
