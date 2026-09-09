import fs from 'node:fs';
import path from 'node:path';
import {
  RENDERER_STATUS_FILE,
  parseRendererStatus,
  type RendererStatus,
} from '../../../../packages/marketing-media';

/**
 * What the renderer for this environment last said about itself.
 *
 * Read from the media directory rather than a table: the worker writes it
 * beside the media it produces, on the volume the app already mounts, so a
 * preview that is torn down takes its claim with it. Environments that keep
 * media in S3 have no such directory and get null — there the renderer is a
 * long-lived service whose health is an infrastructure question, not
 * something the studio can answer.
 */
export function readRendererStatus(
  mediaDir: string | null
): RendererStatus | null {
  if (!mediaDir) return null;
  try {
    return parseRendererStatus(
      fs.readFileSync(path.join(mediaDir, RENDERER_STATUS_FILE), 'utf8')
    );
  } catch {
    // No file yet, or a directory this process cannot read. Either way no
    // renderer has reported in, which is what null means.
    return null;
  }
}
