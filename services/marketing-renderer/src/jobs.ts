import {
  MAX_RENDER_ATTEMPTS,
  RENDER_LOCK_TIMEOUT_MS,
  describeStoryboardError,
  safeParseStoryboard,
  type MarketingJobKind,
  type MarketingOutput,
  type MarketingStoryboard,
} from '@app/marketing-media';

/**
 * The slice of Prisma this worker needs. Typing it structurally keeps the job
 * logic unit-testable without a database.
 */
export type JobStore = {
  marketingMediaJob: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
};

export type ClaimedJob = {
  id: string;
  kind: MarketingJobKind;
  attempts: number;
  storyboard: MarketingStoryboard;
  targetUrl: string | null;
};

/**
 * Take the oldest job that is ready to render.
 *
 * A job is ready when it is QUEUED, or when it has been RENDERING longer than
 * the lock timeout — that second case is a worker that died mid-render. The
 * claim is a conditional update: if another worker got there first the update
 * touches zero rows and this one moves on rather than filming the same job.
 */
export async function claimNextJob(params: {
  prisma: JobStore;
  workerId: string;
  now?: Date;
}): Promise<ClaimedJob | null> {
  const now = params.now ?? new Date();
  const staleBefore = new Date(now.getTime() - RENDER_LOCK_TIMEOUT_MS);

  const candidate = await params.prisma.marketingMediaJob.findFirst({
    where: {
      OR: [
        { status: 'QUEUED' },
        { status: 'RENDERING', lockedAt: { lt: staleBefore } },
      ],
      attempts: { lt: MAX_RENDER_ATTEMPTS },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      status: true,
      attempts: true,
      storyboard: true,
      targetUrl: true,
    },
  });

  if (!candidate) return null;

  const claim = await params.prisma.marketingMediaJob.updateMany({
    where: { id: candidate.id, status: candidate.status },
    data: {
      status: 'RENDERING',
      lockedAt: now,
      lockedBy: params.workerId,
      startedAt: now,
      attempts: { increment: 1 },
    },
  });

  if (claim.count === 0) return null;

  // The storyboard was validated when it was queued, but it is re-validated
  // here because the row could have been edited in between and this worker is
  // what points a browser at it.
  const parsed = safeParseStoryboard(candidate.storyboard);
  if (!parsed.success) {
    await params.prisma.marketingMediaJob.update({
      where: { id: candidate.id },
      data: {
        status: 'FAILED',
        error: `Stored storyboard is not valid: ${describeStoryboardError(parsed.error)}`,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return null;
  }

  return {
    id: String(candidate.id),
    kind: candidate.kind as MarketingJobKind,
    attempts: Number(candidate.attempts) + 1,
    storyboard: parsed.data,
    targetUrl: (candidate.targetUrl as string | null) ?? null,
  };
}

export async function markSucceeded(params: {
  prisma: JobStore;
  jobId: string;
  outputs: MarketingOutput[];
}): Promise<void> {
  await params.prisma.marketingMediaJob.update({
    where: { id: params.jobId },
    data: {
      status: 'SUCCEEDED',
      outputs: params.outputs,
      error: null,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * A failed render goes back in the queue until the attempt budget runs out.
 * Most failures here are a slow demo environment or a selector that moved; the
 * first is worth retrying and the second is not, but the row records the reason
 * either way so an admin can tell which they are looking at.
 */
export async function markFailed(params: {
  prisma: JobStore;
  jobId: string;
  attempts: number;
  error: unknown;
}): Promise<void> {
  const message =
    params.error instanceof Error ? params.error.message : String(params.error);
  const exhausted = params.attempts >= MAX_RENDER_ATTEMPTS;

  await params.prisma.marketingMediaJob.update({
    where: { id: params.jobId },
    data: {
      status: exhausted ? 'FAILED' : 'QUEUED',
      error: message.slice(0, 2000),
      finishedAt: exhausted ? new Date() : null,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * Numbered file name for one still. Numbering keeps the admin gallery in
 * storyboard order no matter how S3 sorts the keys.
 */
export function shotFileName(index: number, name: string): string {
  const safeName = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index).padStart(2, '0')}-${safeName || 'shot'}.png`;
}

/**
 * Playwright records WebM. Marketing surfaces and phones want H.264 in MP4, and
 * phase two clips carry no audio, so the stream is dropped rather than encoded
 * silent.
 */
export function buildTranscodeArgs(
  inputPath: string,
  outputPath: string
): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-an',
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}
