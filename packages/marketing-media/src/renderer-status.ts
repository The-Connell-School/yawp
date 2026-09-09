/**
 * What the renderer says about itself, for the one question an operator
 * actually has: can this environment film right now?
 *
 * The worker has always known why it could not start — a missing system
 * library, a browser that will not launch — but only the container log knew,
 * so a blocked environment looked exactly like a busy one: jobs sitting in
 * QUEUED, no explanation on screen. The worker writes this beside the media
 * it produces, on the volume the app already mounts, so the studio can say
 * plainly whether a render is going to happen.
 *
 * A file, rather than a table, because it needs no migration and because it
 * belongs to the container that wrote it: a preview that is torn down takes
 * its claim with it instead of leaving a stale row behind.
 */
export const RENDERER_STATUS_FILE = 'renderer-status.json';

export const RENDERER_STATES = ['starting', 'ready', 'blocked'] as const;
export type RendererState = (typeof RENDERER_STATES)[number];

export type RendererStatus = {
  state: RendererState;
  /** Why it cannot film, when it cannot. */
  reason?: string;
  at: string;
  workerId?: string;
  /**
   * Nobody has checked in recently. The container is probably gone — its
   * claim to be ready outlived it, so it is reported but not believed.
   */
  stale: boolean;
};

/**
 * A renderer writes on every state change and while it waits, so silence for
 * this long means the process is not there any more.
 */
export const RENDERER_STATUS_STALE_MS = 5 * 60 * 1000;

export function parseRendererStatus(
  raw: string | null | undefined,
  now: Date = new Date()
): RendererStatus | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const fields = parsed as Record<string, unknown>;
  const state = fields.state;
  if (
    typeof state !== 'string' ||
    !(RENDERER_STATES as readonly string[]).includes(state)
  ) {
    return null;
  }

  const at = typeof fields.at === 'string' ? fields.at : '';
  const writtenAt = Date.parse(at);
  if (!Number.isFinite(writtenAt)) return null;

  return {
    state: state as RendererState,
    reason: typeof fields.reason === 'string' ? fields.reason : undefined,
    at,
    workerId:
      typeof fields.workerId === 'string' ? fields.workerId : undefined,
    stale: now.getTime() - writtenAt > RENDERER_STATUS_STALE_MS,
  };
}
