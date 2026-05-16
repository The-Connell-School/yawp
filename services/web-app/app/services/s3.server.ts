import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
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

export async function startMultipartUpload(key: string, contentType: string) {
  const res = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: videoBucket,
      Key: key,
      ContentType: contentType,
    })
  );
  return { uploadId: res.UploadId!, key };
}

export async function signPartUpload(
  key: string,
  uploadId: string,
  partNumber: number
) {
  const command = new UploadPartCommand({
    Bucket: videoBucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return url;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
) {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: videoBucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    })
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: videoBucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}

// Document snapshot S3 archival removed; DB snapshots are sufficient
