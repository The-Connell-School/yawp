import fs from 'node:fs';
import path from 'node:path';
import {
  buildMarketingMediaKey,
  type MarketingOutput,
} from '@app/marketing-media';
import type { RenderedFile } from './render';

/**
 * Disk-backed output storage.
 *
 * Environments without AWS credentials — preview environments foremost — store
 * renders on a volume the web app also mounts, under the same
 * marketing-media/<jobId>/<file> keys S3 would use. The app serves them from
 * disk instead of signing S3 URLs, so the job page works identically in both
 * modes.
 */
export function storeRenderedFilesOnDisk(params: {
  mediaDir: string;
  jobId: string;
  files: RenderedFile[];
}): MarketingOutput[] {
  const outputs: MarketingOutput[] = [];

  for (const file of params.files) {
    const key = buildMarketingMediaKey({
      jobId: params.jobId,
      fileName: path.basename(file.path),
    });
    const target = path.join(params.mediaDir, key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.path, target);

    outputs.push({
      kind: file.kind,
      key,
      contentType: file.contentType,
      bytes: fs.statSync(target).size,
      label: file.label,
      width: file.width,
      height: file.height,
      durationMs: file.durationMs,
    });
  }

  return outputs;
}
