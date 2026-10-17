import { z } from 'zod';
import { readBoundedText } from './bounded-body.server';
import { FEEDBACK_CAPTURE_EVENTS, feedbackPath } from './demo-feedback-context';
import { severitySchema, type FeedbackInput } from './tester-feedback.server';

export interface DemoFeedbackDependencies {
  environment(): string;
  flagEnabled(): Promise<boolean>;
  getUser(request: Request): Promise<{ id: string } | null>;
  save(input: FeedbackInput): Promise<boolean>;
}

/** Shared by the root renderer and endpoint; production is denied even with a stray enabled row. */
export async function demoFeedbackAvailable(
  deps: Pick<DemoFeedbackDependencies, 'environment' | 'flagEnabled'>
) {
  if (deps.environment() !== 'demo') return false;
  try {
    return await deps.flagEnabled();
  } catch {
    return false;
  }
}

const pathSchema = z
  .string()
  .max(2048)
  .transform((value, ctx) => {
    const path = feedbackPath(value);
    if (!path) {
      ctx.addIssue({ code: 'custom', message: 'Invalid app location' });
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
  note: z.string().trim().min(1).max(4000),
  severity: severitySchema.nullable().optional(),
  url: pathSchema,
  actions: z.array(actionSchema).max(5),
});
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

export async function submitDemoFeedback(
  request: Request,
  deps: DemoFeedbackDependencies
) {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!(await demoFeedbackAvailable(deps)))
    return json({ error: 'Not found' }, 404);
  const user = await deps.getUser(request);
  if (!user) return json({ error: 'Sign in to give feedback' }, 401);
  // Demo's reverse proxy may expose an internal Request URL. Allow its exact browser
  // origin only after the demo runtime gate; no arbitrary forwarded host headers.
  const origin = request.headers.get('origin');
  if (
    origin !== new URL(request.url).origin &&
    origin !== 'https://demo.yawp.school'
  )
    return json({ error: 'Invalid origin' }, 403);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return json({ error: 'Unsupported content type' }, 415);
  const body = await readBoundedText(request, 30_000);
  if (body === null) return json({ error: 'Feedback is too large' }, 413);
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid feedback' }, 400);
  }
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success)
    return json(
      {
        error:
          'Add a note of up to 4,000 characters with a valid page location.',
      },
      400
    );
  try {
    const saved = await deps.save({
      userId: user.id,
      environment: 'demo',
      userAgent: (request.headers.get('user-agent') || '').slice(0, 1000),
      url: parsed.data.url,
      whatHappened: parsed.data.note,
      // Preserve Internal's string fields while retaining the bounded structured context.
      whatIDid: parsed.data.actions.map((action) => {
        switch (action.type) {
          case 'route': return `Opened ${action.path}`;
          case 'click': return `Clicked a ${action.target} on ${action.path}`;
          case 'capture': return `Captured ${action.event} on ${action.path}`;
        }
      }).join(' → ').slice(0, 4000),
      whatIWish: '',
      severity: parsed.data.severity ?? null,
      actions: parsed.data.actions,
    });
    if (!saved)
      return json({ error: 'Please wait before sending more feedback.' }, 429);
    return json({ ok: true }, 201);
  } catch {
    return json({ error: 'Could not save feedback. Please try again.' }, 503);
  }
}
