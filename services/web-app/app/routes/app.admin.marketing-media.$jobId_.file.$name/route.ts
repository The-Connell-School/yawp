import path from 'node:path';
import fs from 'node:fs';
import { type LoaderFunctionArgs } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  getMarketingMediaDir,
  requireMarketingStudioEnabled,
} from '~/utils/marketing-studio.server';
import { type MarketingOutput } from '../../../../../packages/marketing-media';

const GUIDE_DOCUMENT_CSP =
  "sandbox; default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'";

/**
 * Serves disk-stored render outputs (environments without S3, i.e. previews).
 *
 * The file served is always looked up from the job's recorded outputs — the
 * name parameter selects among them and never touches the filesystem directly,
 * so a crafted name cannot escape the media directory.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  requireMarketingStudioEnabled();
  await requireAdmin(request);

  const mediaDir = getMarketingMediaDir();
  if (!mediaDir) {
    throw new Response('Not Found', { status: 404 });
  }

  const job = await prisma.marketingMediaJob.findUnique({
    where: { id: params.jobId },
    select: { outputs: true },
  });
  if (!job) throw new Response('Not Found', { status: 404 });

  const outputs = (
    Array.isArray(job.outputs) ? job.outputs : []
  ) as MarketingOutput[];
  const output = outputs.find(
    (candidate) => path.posix.basename(candidate.key) === params.name
  );
  if (!output) throw new Response('Not Found', { status: 404 });

  const filePath = path.join(mediaDir, output.key);
  let body: Buffer;
  try {
    body = fs.readFileSync(filePath);
  } catch {
    throw new Response('Not Found', { status: 404 });
  }

  const headers: Record<string, string> = {
    'content-type': output.contentType,
    'content-length': String(body.byteLength),
    'cache-control': 'private, max-age=60',
    'x-content-type-options': 'nosniff',
  };
  // A guide page is generated HTML on the app's own origin. It inlines its
  // media and needs no script, so it runs sandboxed with nothing else allowed.
  if (output.contentType.startsWith('text/html')) {
    headers['content-security-policy'] = GUIDE_DOCUMENT_CSP;
  }

  return new Response(new Uint8Array(body), { headers });
}
