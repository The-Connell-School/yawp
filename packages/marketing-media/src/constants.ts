/**
 * Shared vocabulary for marketing media jobs. The web app writes these values,
 * the renderer reads them, so they live outside both.
 */

/**
 * What a job produces. GUIDE is a how-to guide document (docs/how-to-guides.md)
 * built from per-step stills and looping clips. Narrated clips are phase three
 * and are not accepted yet.
 */
export const MARKETING_JOB_KINDS = ['STILLS', 'CLIP', 'GUIDE'] as const;
export type MarketingJobKind = (typeof MARKETING_JOB_KINDS)[number];

export const MARKETING_JOB_STATUSES = [
  /** The brief is in, the storyboard is being written. */
  'GENERATING',
  /** Storyboard validated, waiting for a renderer. */
  'QUEUED',
  /** A renderer has claimed it. */
  'RENDERING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export type MarketingJobStatus = (typeof MARKETING_JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES: readonly MarketingJobStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
];

/** What the brief is about. FEATURE is free text; the others point at a record. */
export const MARKETING_SUBJECT_TYPES = [
  'FEATURE',
  'ASSIGNMENT_TYPE',
  'TEACHER_TRAINING',
] as const;
export type MarketingSubjectType = (typeof MARKETING_SUBJECT_TYPES)[number];

/** DOCUMENT is a guide's self-contained HTML page. */
export const MARKETING_OUTPUT_KINDS = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export type MarketingOutputKind = (typeof MARKETING_OUTPUT_KINDS)[number];

export type MarketingOutput = {
  kind: MarketingOutputKind;
  /** S3 key. Signed on read; never a public URL. */
  key: string;
  contentType: string;
  bytes: number;
  label: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

/** Number of times a job may be claimed before the worker gives up on it. */
export const MAX_RENDER_ATTEMPTS = 3;

/** A claim older than this is treated as a dead worker and may be retaken. */
export const RENDER_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export const MARKETING_MEDIA_S3_PREFIX = 'marketing-media';

export function buildMarketingMediaKey(params: {
  jobId: string;
  fileName: string;
}): string {
  const safeFileName = params.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${MARKETING_MEDIA_S3_PREFIX}/${params.jobId}/${safeFileName}`;
}
