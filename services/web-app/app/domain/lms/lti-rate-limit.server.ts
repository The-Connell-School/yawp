export class LtiRateLimitError extends Error {
  constructor() {
    super('The LTI request rate limit was exceeded.');
    this.name = 'LtiRateLimitError';
  }
}

type Entry = { windowStartedAt: number; count: number };
const buckets = new Map<string, Entry>();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 2_048;

const limits = {
  login: 30,
  launch: 60,
} as const;

export function admitLtiPublicRequest(input: {
  kind: keyof typeof limits;
  requester: string;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const key = `${input.kind}\0${input.requester}`;
  const existing = buckets.get(key);
  const entry =
    !existing || nowMs - existing.windowStartedAt >= WINDOW_MS
      ? { windowStartedAt: nowMs, count: 0 }
      : existing;
  entry.count += 1;
  buckets.delete(key);
  buckets.set(key, entry);

  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  if (entry.count > limits[input.kind]) throw new LtiRateLimitError();
}

export function clearLtiRateLimitsForTests() {
  buckets.clear();
}
