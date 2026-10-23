import { z } from 'zod';
import { readBoundedText } from '~/utils/bounded-body.server';
import {
  FEEDBACK_CAPTURE_EVENTS,
  type FeedbackAction,
} from '~/utils/demo-feedback-context';
import { getUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { acceptsFeedbackOrigin } from '~/utils/tester-feedback.server';
import { assertDevPanelRoute } from './dev-panel-route-guard.server';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';
import {
  parseDevPanelFeedbackScreenshot,
  DEV_PANEL_SCREENSHOT_MAX_DECODED_BYTES,
} from './dev-panel-feedback-screenshot.server';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';
import {
  devPanelSeatRateLimitKey,
  ensureDevPanelSignedOutTesterUser,
} from './dev-panel-signed-out-feedback.server';

export const DEV_PANEL_FEEDBACK_BODY_LIMIT = 600_000;

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
  screenshot: z.string().max(DEV_PANEL_FEEDBACK_BODY_LIMIT).nullable().optional(),
  screenshotOmitted: z.boolean().optional(),
});

const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

const SIGNED_OUT_ATTRIBUTION = '[Signed-out preview tester]';

type FeedbackRowInput = {
  userId: string;
  environment: string;
  userAgent: string;
  url: string;
  whatHappened: string;
  whatIDid: string;
  whatIWish: string;
  severity: null;
  actions: FeedbackAction[];
  screenshot: string | null;
};

function feedbackEnvironment() {
  return (
    process.env.PREVIEW_SLUG ||
    process.env.YAWP_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development'
  ).slice(0, 100);
}

function signedOutSeatAttributionPrefix(seatLabel: string) {
  return `${SIGNED_OUT_ATTRIBUTION} (${seatLabel.slice(0, 80)})`;
}

function recentFeedbackCountWhere(
  userId: string,
  rateLimitKey: string,
  signedOutSeatLabel: string | null
) {
  const since = { gte: new Date(Date.now() - 600_000) };
  if (rateLimitKey === userId || !signedOutSeatLabel) {
    return { userId, createdAt: since };
  }
  return {
    userId,
    whatIDid: { startsWith: signedOutSeatAttributionPrefix(signedOutSeatLabel) },
    createdAt: since,
  };
}

async function saveDevPanelFeedback(
  input: FeedbackRowInput,
  rateLimitKey: string,
  signedOutSeatLabel: string | null
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tester_feedback:' || ${rateLimitKey}))`;
    const count = await tx.testerFeedback.count({
      where: recentFeedbackCountWhere(input.userId, rateLimitKey, signedOutSeatLabel),
    });
    if (count >= 5) return false;
    await tx.testerFeedback.create({ data: input });
    return true;
  });
}

async function resolveFeedbackAuthor(
  signedInUserId: string | null,
  previewSeat: Awaited<ReturnType<typeof getPreviewAccessSeat>>
) {
  if (signedInUserId) {
    return { userId: signedInUserId, signedOut: false as const, seat: previewSeat };
  }
  const userId = await ensureDevPanelSignedOutTesterUser();
  return { userId, signedOut: true as const, seat: previewSeat };
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

function screenshotWish(screenshot: string | null, omitted?: boolean) {
  if (screenshot) return '[screenshot stored on feedback record]';
  if (omitted) return '[screenshot omitted — capture exceeded size limit]';
  return '';
}

export async function submitDevPanelFeedback(request: Request) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const environment = feedbackEnvironment();
  const originHeader = request.headers.get('origin');
  if (
    originHeader &&
    !acceptsFeedbackOrigin(request, environment)
  ) {
    return json({ error: 'Invalid origin' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return json({ error: 'Unsupported content type' }, 415);
  }
  const body = await readBoundedText(request, DEV_PANEL_FEEDBACK_BODY_LIMIT);
  if (body === null) {
    return json({ error: 'Feedback payload is too large to send.' }, 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid feedback' }, 400);
  }
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success) {
    const noteIssue = parsed.error.issues.find((issue) => issue.path[0] === 'note');
    if (noteIssue) {
      return json({ error: 'Add a note of up to 2,000 characters.' }, 400);
    }
    return json({ error: 'Invalid page location or feedback payload.' }, 400);
  }
  let screenshot: string | null = null;
  if (parsed.data.screenshot) {
    const shot = parseDevPanelFeedbackScreenshot(parsed.data.screenshot);
    if (!shot.ok) {
      if (shot.reason === 'size') {
        return json(
          {
            error: `Screenshot is too large. Keep it under ${Math.floor(DEV_PANEL_SCREENSHOT_MAX_DECODED_BYTES / 1000)} KB.`,
          },
          413
        );
      }
      return json({ error: 'Screenshot must be a JPEG or WebP image.' }, 400);
    }
    screenshot = shot.screenshot;
  }
  const signedInUserId = await getUserId(request);
  const previewSeat = signedInUserId ? null : await getPreviewAccessSeat(request);
  if (!signedInUserId && isPreviewDevLoginAccessCodeRequired() && !previewSeat) {
    return json({ error: 'Preview access code required.' }, 401);
  }
  const author = await resolveFeedbackAuthor(signedInUserId, previewSeat);
  const seatLabel = author.seat?.label?.trim() ?? null;
  const signedOutPrefix =
    author.signedOut && seatLabel
      ? signedOutSeatAttributionPrefix(seatLabel)
      : author.signedOut
        ? SIGNED_OUT_ATTRIBUTION
        : '';
  const whatIDid = [signedOutPrefix, actionSummary(parsed.data.actions)]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000);
  const rateLimitKey =
    author.signedOut && author.seat
      ? devPanelSeatRateLimitKey(author.seat)
      : author.userId;
  try {
    const saved = await saveDevPanelFeedback(
      {
        userId: author.userId,
        environment,
        userAgent: (request.headers.get('user-agent') || '').slice(0, 1000),
        url: parsed.data.url,
        whatHappened: parsed.data.note,
        whatIDid,
        whatIWish: screenshotWish(screenshot, parsed.data.screenshotOmitted),
        severity: null,
        actions: parsed.data.actions,
        screenshot,
      },
      rateLimitKey,
      author.signedOut && seatLabel ? seatLabel : null
    );
    if (!saved) {
      return json(
        { error: 'Please wait a few minutes before sending more feedback.' },
        429
      );
    }
    return json({ ok: true }, 201);
  } catch {
    return json({ error: 'Could not save feedback. Please try again.' }, 503);
  }
}
