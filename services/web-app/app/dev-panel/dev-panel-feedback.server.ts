import { z } from 'zod';
import { readBoundedText } from '~/utils/bounded-body.server';
import {
  FEEDBACK_CAPTURE_EVENTS,
  type FeedbackAction,
} from '~/utils/demo-feedback-context';
import { getUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { saveTesterFeedback } from '~/utils/tester-feedback-runtime.server';
import { assertDevPanelRoute } from './dev-panel-route-guard.server';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';

const pathSchema = z
  .string()
  .max(2048)
  .transform((value, ctx) => {
    const path = devPanelFeedbackPath(value);
    if (!path) {
      ctx.addIssue({ code: 'custom', message: 'Invalid page location' });
      return z.NEVER;
    }
    return path;
  });

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('route'), path: pathSchema }).strict(),
  z
    .object({
      type: z.literal('click'),
      path: pathSchema,
      target: z.enum(['button', 'link']),
    })
    .strict(),
  z
    .object({
      type: z.literal('capture'),
      path: pathSchema,
      event: z.enum(FEEDBACK_CAPTURE_EVENTS),
    })
    .strict(),
]);

const submissionSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  url: pathSchema,
  actions: z.array(actionSchema).max(5),
  screenshot: z.string().max(500_000).nullable().optional(),
});

const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

const SIGNED_OUT_ATTRIBUTION = '[Signed-out preview tester]';

async function resolveFeedbackUserId(request: Request) {
  const signedIn = await getUserId(request);
  if (signedIn) return { userId: signedIn, signedOut: false };
  const fallback = await prisma.user.findFirst({
    where: { email: 'dev.admin@yawp.local' },
    select: { id: true },
  });
  if (!fallback) return null;
  return { userId: fallback.id, signedOut: true };
}

function actionSummary(actions: FeedbackAction[]) {
  return actions
    .map((action) => {
      switch (action.type) {
        case 'route':
          return `Opened ${action.path}`;
        case 'click':
          return `Clicked a ${action.target} on ${action.path}`;
        case 'capture':
          return `Captured ${action.event} on ${action.path}`;
      }
    })
    .join(' → ')
    .slice(0, 4000);
}

export async function submitDevPanelFeedback(request: Request) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const origin = request.headers.get('origin');
  if (
    origin !== new URL(request.url).origin &&
    origin !== 'https://demo.yawp.school'
  ) {
    return json({ error: 'Invalid origin' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return json({ error: 'Unsupported content type' }, 415);
  }
  const body = await readBoundedText(request, 30_000);
  if (body === null) return json({ error: 'Feedback is too large' }, 413);
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid feedback' }, 400);
  }
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success) {
    return json(
      {
        error: 'Add a note of up to 2,000 characters with a valid page location.',
      },
      400
    );
  }
  const author = await resolveFeedbackUserId(request);
  if (!author) {
    return json({ error: 'Could not save feedback. Please try again.' }, 503);
  }
  if (author.signedOut && isPreviewDevLoginAccessCodeRequired()) {
    const seat = await getPreviewAccessSeat(request);
    if (!seat) {
      return json({ error: 'Preview access code required.' }, 401);
    }
  }
  const seat = await getPreviewAccessSeat(request);
  const seatLabel = seat?.label?.trim();
  const signedOutPrefix =
    author.signedOut && seatLabel
      ? `${SIGNED_OUT_ATTRIBUTION} (${seatLabel.slice(0, 80)})`
      : author.signedOut
        ? SIGNED_OUT_ATTRIBUTION
        : '';
  const whatIDid = [signedOutPrefix, actionSummary(parsed.data.actions)]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000);
  const environment = (
    process.env.PREVIEW_SLUG ||
    process.env.YAWP_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development'
  ).slice(0, 100);
  try {
    const saved = await saveTesterFeedback({
      userId: author.userId,
      environment,
      userAgent: (request.headers.get('user-agent') || '').slice(0, 1000),
      url: parsed.data.url,
      whatHappened: parsed.data.note,
      whatIDid,
      whatIWish: parsed.data.screenshot
        ? '[screenshot attached in dev panel feedback]'
        : '',
      severity: null,
      actions: parsed.data.actions,
    });
    if (!saved) {
      return json({ error: 'Please wait before sending more feedback.' }, 429);
    }
    return json({ ok: true }, 201);
  } catch {
    return json({ error: 'Could not save feedback. Please try again.' }, 503);
  }
}
