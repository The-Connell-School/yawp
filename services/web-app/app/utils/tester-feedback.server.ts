import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  internalApiRawQueryString,
  type InternalApiAuthContext,
} from './internal-platform-auth.server';
import { readBoundedText } from './bounded-body.server';

export const FEEDBACK_TEXT_LIMIT = 4000;
const severitySchema = z.enum(['low', 'medium', 'high']);
const text = z.string().trim().min(1).max(FEEDBACK_TEXT_LIMIT);
const submissionSchema = z.object({
  url: z
    .string()
    .max(2048)
    .transform((value, ctx) => {
      try {
        return sanitizeFeedbackUrl(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid app URL' });
        return z.NEVER;
      }
    }),
  whatIDid: text,
  whatHappened: text,
  whatIWish: text,
  severity: severitySchema.nullable(),
});

/** Store only a relative app path; discard credentials and opaque token values. */
export function sanitizeFeedbackUrl(value: string) {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s\u0000-\u001f]/.test(value) ||
    /%(?![\da-f]{2})/i.test(value)
  )
    throw new Error('Invalid URL');
  const url = new URL(value, 'https://feedback.invalid');
  if (url.pathname !== '/app' && !url.pathname.startsWith('/app/'))
    throw new Error('Invalid app path');
  for (const [key, val] of [...url.searchParams.entries()]) {
    if (
      /(token|secret|password|passwd|key|auth|session|signature|credential|code|state|jwt|ticket|invite)/i.test(
        key
      ) ||
      /[A-Za-z0-9_-]{32,}/.test(val) ||
      /^[^.]+\.[^.]+\.[^.]+$/.test(val)
    ) {
      url.searchParams.delete(key);
    }
  }
  const sanitized = url.pathname + url.search;
  if (sanitized.length > 2048) throw new Error('App URL is too long');
  return sanitized;
}

export const feedbackQuerySchema = z
  .object({
    environment: z.string().trim().min(1).max(100).optional(),
    userId: z.string().trim().min(1).max(100).optional(),
    severity: severitySchema.optional(),
    since: z.string().datetime({ offset: true }).optional(),
    until: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict()
  .refine(
    (input) =>
      !input.since ||
      !input.until ||
      new Date(input.since) <= new Date(input.until),
    { message: 'Invalid date range' }
  );
export type FeedbackQuery = z.infer<typeof feedbackQuerySchema>;
export type FeedbackInput = z.infer<typeof submissionSchema> & {
  userId: string;
  userAgent: string;
  environment: string;
};
export type FeedbackEntry = Omit<FeedbackInput, 'severity'> & {
  severity: string | null;
  id: string;
  createdAt: Date;
};
export interface FeedbackDependencies {
  enabled(): boolean;
  getUser(
    request: Request
  ): Promise<{ id: string; isTester: boolean; isAdmin: boolean } | null>;
  environment(): string;
  save(input: FeedbackInput): Promise<boolean>;
  list(input: FeedbackQuery): Promise<FeedbackEntry[]>;
  authenticateInternal(
    request: Request
  ): Promise<Response | InternalApiAuthContext | null>;
  auditInternalRead?(input: {
    actorEmail: string;
    keyId: string;
    endpoint: string;
    requestHash: string;
    result: string;
  }): Promise<void>;
}
const response = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      ...headers,
    },
  });

export async function submitTesterFeedback(
  request: Request,
  deps: FeedbackDependencies
) {
  if (request.method !== 'POST')
    return response({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  if (!deps.enabled()) return response({ error: 'Not found' }, 404);
  const user = await deps.getUser(request);
  if (!user) return response({ error: 'Sign in to log feedback' }, 401);
  if (!user.isTester) return response({ error: 'Tester access required' }, 403);
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return response({ error: 'Invalid origin' }, 403);
  if (
    request.headers.get('content-type')?.split(';')[0] !==
    'application/x-www-form-urlencoded'
  )
    return response({ error: 'Unsupported content type' }, 415);
  const body = await readBoundedText(request, 160_000);
  if (body === null) return response({ error: 'Feedback is too large' }, 413);
  const form = new URLSearchParams(body);
  const parsed = submissionSchema.safeParse({
    url: form.get('url'),
    whatIDid: form.get('whatIDid'),
    whatHappened: form.get('whatHappened'),
    whatIWish: form.get('whatIWish'),
    severity: form.get('severity') || null,
  });
  if (!parsed.success)
    return response(
      {
        error:
          'Complete all three fields (up to 4,000 characters each) and select a valid severity.',
      },
      400
    );
  const saved = await deps.save({
    ...parsed.data,
    userId: user.id,
    userAgent: (request.headers.get('user-agent') || '').slice(0, 1000),
    environment: deps.environment(),
  });
  if (!saved)
    return response(
      { error: 'Please wait before logging more feedback.' },
      429,
      { 'retry-after': '600' }
    );
  return response({ ok: true }, 201);
}

const columns = [
  'id',
  'userId',
  'url',
  'userAgent',
  'whatIDid',
  'whatHappened',
  'whatIWish',
  'severity',
  'createdAt',
  'environment',
] as const;
function csvCell(value: string) {
  // Excel recognizes formulas even after leading whitespace. Escape all user-controlled cells.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function feedbackCsv(entries: FeedbackEntry[]) {
  return (
    [
      columns.join(','),
      ...entries.map((entry) =>
        columns
          .map((column) =>
            csvCell(
              column === 'createdAt'
                ? entry.createdAt.toISOString()
                : (entry[column] ?? '')
            )
          )
          .join(',')
      ),
    ].join('\r\n') + '\r\n'
  );
}

export async function readTesterFeedback(
  request: Request,
  deps: FeedbackDependencies,
  mode: 'admin' | 'internal'
) {
  let internalAuth: InternalApiAuthContext | null = null;
  if (mode === 'internal') {
    const auth = await deps.authenticateInternal(request);
    if (auth instanceof Response) return auth;
    internalAuth = auth;
  } else {
    const user = await deps.getUser(request);
    if (!user) return response({ error: 'Sign in required' }, 401);
    if (!user.isAdmin) return response({ error: 'Admin access required' }, 403);
  }
  if (request.method !== 'GET')
    return response({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
  const parsed = feedbackQuerySchema.safeParse(
    Object.fromEntries(
      [...new URL(request.url).searchParams].filter(([, value]) => value !== '')
    )
  );
  if (!parsed.success) return response({ error: 'Invalid filters' }, 400);
  const input = parsed.data;
  // Export all matching entries up to a bounded memory limit. Never silently truncate.
  const entries = await deps.list({
    ...input,
    cursor: input.format === 'csv' ? undefined : input.cursor,
    limit: input.format === 'csv' ? 10001 : input.limit + 1,
  });
  if (input.format === 'csv') {
    if (entries.length > 10000)
      return response(
        {
          error:
            'Export exceeds 10,000 entries. Narrow the date or user filters.',
        },
        413
      );
    if (internalAuth)
      await auditInternalFeedbackRead(request, deps, internalAuth, 'export.success');
    return new Response(feedbackCsv(entries), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="tester-feedback.csv"',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  const page = entries.slice(0, input.limit);
  if (internalAuth)
    await auditInternalFeedbackRead(request, deps, internalAuth, 'list.success');
  return response({
    entries: page,
    nextCursor: entries.length > input.limit ? page.at(-1)?.id : null,
  });
}

async function auditInternalFeedbackRead(
  request: Request,
  deps: FeedbackDependencies,
  auth: InternalApiAuthContext,
  result: string
) {
  if (!deps.auditInternalRead) return;
  const url = new URL(request.url);
  const requestHash = createHash('sha256')
    .update(
      [
        request.method.toUpperCase(),
        url.pathname,
        internalApiRawQueryString(url),
      ].join('\n')
    )
    .digest('hex');
  await deps.auditInternalRead({
    actorEmail: auth.actorEmail,
    keyId: auth.keyId,
    endpoint: `${request.method.toUpperCase()} ${url.pathname}`,
    requestHash,
    result,
  });
}
