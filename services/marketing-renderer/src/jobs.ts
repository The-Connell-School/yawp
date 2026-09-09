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
      // A retried job carries its previous attempt's error so an admin can
      // see why it was requeued — but once a fresh attempt is actually
      // filming, that message is stale and must not sit under a RENDERING
      // badge reading like a live failure.
      error: null,
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
  /**
   * Non-fatal things the render worked around — a framing stage that timed
   * out and shipped the bare capture, a scene whose optional step found
   * nothing. The media is still delivered, so the job succeeds; without the
   * reasons on the row a quietly degraded take is indistinguishable from a
   * clean one, and the operator re-runs it blind.
   */
  warnings?: string[];
}): Promise<void> {
  await params.prisma.marketingMediaJob.update({
    where: { id: params.jobId },
    data: {
      status: 'SUCCEEDED',
      outputs: params.outputs,
      warnings: params.warnings?.length ? params.warnings : null,
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

/** The raw viewport capture kept beside its framed counterpart. */
export function rawStillFileName(framedFileName: string): string {
  return framedFileName.replace(/\.png$/, '-raw.png');
}

/**
 * The recording is written when the browser context closes. When that close
 * wedges and is abandoned, there is no file, and the transcode's own error —
 * an ffmpeg exit code under a page of build flags — hides the cause.
 */
export function missingRecordingError(recordedPath: string): Error {
  return new Error(
    `The recording was not written (${recordedPath.split('/').at(-1)}): the browser did not shut down cleanly, so the take will be filmed again.`
  );
}

/**
 * Playwright records WebM. Marketing surfaces and phones want H.264 in MP4, and
 * phase two clips carry no audio, so the stream is dropped rather than encoded
 * silent.
 */
export function buildTranscodeArgs(
  inputPath: string,
  outputPath: string,
  options: { trimStartSeconds?: number } = {}
): string[] {
  const trim =
    options.trimStartSeconds && options.trimStartSeconds > 0
      ? ['-ss', options.trimStartSeconds.toFixed(2)]
      : [];
  return [
    '-y',
    '-i',
    inputPath,
    // Placed after -i so the cut is frame-accurate; we re-encode anyway.
    ...trim,
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
