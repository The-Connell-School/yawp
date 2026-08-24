import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  buildMarketingMediaKey,
  type MarketingOutput,
} from '@app/marketing-media';
import type { RenderedFile } from './render';

export function createS3Client(region: string): S3Client {
  return new S3Client({ region });
}

/**
 * Upload the render to the videos bucket under a per-job prefix. Objects stay
 * private; the admin UI signs a short-lived URL when someone opens the job.
 */
export async function uploadRenderedFiles(params: {
  s3: S3Client;
  bucket: string;
  jobId: string;
  files: RenderedFile[];
}): Promise<MarketingOutput[]> {
  const outputs: MarketingOutput[] = [];

  for (const file of params.files) {
    const body = fs.readFileSync(file.path);
    const key = buildMarketingMediaKey({
      jobId: params.jobId,
      fileName: path.basename(file.path),
    });

    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: key,
        Body: body,
        ContentType: file.contentType,
      })
    );

    outputs.push({
      kind: file.kind,
      key,
      contentType: file.contentType,
      bytes: body.byteLength,
      label: file.label,
      width: file.width,
      height: file.height,
      durationMs: file.durationMs,
    });
  }

  return outputs;
}
