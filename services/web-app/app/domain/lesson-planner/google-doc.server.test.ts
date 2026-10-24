import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-1';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret-1';
process.env.SESSION_SECRET ||= 'test-secret';

const grants = new Map<string, { userId: string; refreshToken: string; scope: string }>();
const prisma = {
  lessonPlanConversation: { findFirst: mock(async () => ({ id: 'plan-1' })) },
  user: { findUnique: mock(async () => ({ email: 'teacher@school.org' })) },
  googleDriveGrant: {
    findUnique: mock(async ({ where }: any) => grants.get(where.userId) ?? null),
    upsert: mock(async ({ where, create, update }: any) => {
      grants.set(where.userId, grants.has(where.userId) ? { ...grants.get(where.userId)!, ...update } : create);
    }),
  },
};
const getLessonPlannerAccess = mock(async () => ({
  allowed: true,
  userId: 'user-1',
  membership: { id: 'teacher-1', organization: { id: 'org-1' } },
}));
const getLessonPlannerReviewFlags = mock(async () => ({ teachNotes: true }));

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ getLessonPlannerAccess }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));
mock.module('./load-lesson-plan-doc.server', () => ({
  loadLessonPlan: async () => ({ doc: { title: 'Day One' }, kit: null }),
}));
mock.module('./lesson-plan-render.server', () => ({
  renderLessonPlanDocx: async () => new Uint8Array([80, 75]),
  lessonPlanFilename: (title: string) => `${title} - Lesson plan.docx`,
}));

const google: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL) => {
  google.push(String(url));
  if (String(url).endsWith('/token')) return Response.json({ access_token: 'at-1', refresh_token: 'rt-1', scope: 'https://www.googleapis.com/auth/drive.file' });
  return Response.json({ id: 'doc-1', webViewLink: 'https://docs.google.com/document/d/doc-1/edit' });
}) as unknown as typeof fetch;

const { openGoogleDoc, finishDriveGrant } = await import('./google-doc.server');

afterAll(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error('expected a redirect');
}

const CLICK = 'https://yawp.school/app/lesson-planner/plan-1/google-doc?doc=plan';

beforeEach(() => {
  google.length = 0;
});

describe('Google Docs (Oct 24 handoff, task 3)', () => {
  test('the first click asks Google once; the answer is kept, sealed; then the doc opens', async () => {
    const ask = await thrown(openGoogleDoc({ request: new Request(CLICK), conversationId: 'plan-1', kind: 'plan' }));
    const to = new URL(ask.headers.get('location')!);
    expect(to.hostname).toBe('accounts.google.com');
    expect(to.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(to.searchParams.get('redirect_uri')).toBe('https://yawp.school/app/lesson-planner/google/callback');
    const cookie = ask.headers.get('set-cookie')!.split(';')[0]!;

    // A forged answer is refused.
    const forged = await finishDriveGrant(
      new Request('https://yawp.school/app/lesson-planner/google/callback?code=c&state=nope', { headers: { cookie } })
    );
    expect(forged.headers.get('location')).toBe('/app/lesson-planner');
    expect(grants.size).toBe(0);

    const back = await finishDriveGrant(
      new Request(`https://yawp.school/app/lesson-planner/google/callback?code=c1&state=${to.searchParams.get('state')}`, {
        headers: { cookie },
      })
    );
    expect(back.headers.get('location')).toBe('/app/lesson-planner/plan-1/google-doc?doc=plan');
    expect(grants.get('user-1')?.refreshToken).not.toContain('rt-1');

    const opened = await thrown(openGoogleDoc({ request: new Request(CLICK), conversationId: 'plan-1', kind: 'plan' }));
    expect(opened.headers.get('location')).toBe('https://docs.google.com/document/d/doc-1/edit');
    expect(google.some((url) => url.startsWith('https://www.googleapis.com/upload/drive/v3/files'))).toBe(true);
  });

  test('a teacher who says no at Google is told so', async () => {
    grants.clear();
    const ask = await thrown(openGoogleDoc({ request: new Request(CLICK), conversationId: 'plan-1', kind: 'plan' }));
    const state = new URL(ask.headers.get('location')!).searchParams.get('state');
    const back = await finishDriveGrant(
      new Request(`https://yawp.school/app/lesson-planner/google/callback?error=access_denied&state=${state}`, {
        headers: { cookie: ask.headers.get('set-cookie')!.split(';')[0]! },
      })
    );
    expect(back.headers.get('location')).toBe('/app/lesson-planner/plan-1/google-doc?doc=plan&problem=declined');
  });

  test('without the Google client on this site, it says so and offers Word', async () => {
    const saved = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = '';
    try {
      expect(await openGoogleDoc({ request: new Request(CLICK), conversationId: 'plan-1', kind: 'plan' })).toEqual({ problem: 'unconfigured' });
    } finally {
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = saved;
    }
  });

  test('only with the flag', async () => {
    getLessonPlannerReviewFlags.mockResolvedValueOnce({ teachNotes: false });
    const response = await thrown(openGoogleDoc({ request: new Request(CLICK), conversationId: 'plan-1', kind: 'plan' }));
    expect(response.status).toBe(404);
  });
});
