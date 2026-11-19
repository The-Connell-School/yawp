import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const runDeckCommand = mock();
const prisma = { lessonPlanConversation: { findFirst: mock() } };

class AiRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('rate limited');
  }
}
mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
mock.module('~/utils/lesson-planner/lesson-planner-admission.server', () => ({
  lessonPlannerRateLimitMessage: () => 'You have asked a lot in the last hour. Try again in a few minutes.',
}));
mock.module('~/utils/ai-admission.server', () => ({ AiRateLimitError, aiAdmissionErrorResponse: () => null }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));
mock.module('~/domain/lesson-planner/deck-command.server', () => ({ runDeckCommand }));

const { action } = await import('./route');
afterAll(() => mock.restore());

const DECK = {
  title: 'Sudan before the novel',
  // The page's own idea of the look is never taken.
  kit: 'v3-from-the-page',
  slides: [
    { layout: 'title', title: 'Sudan before the novel', speakerNotes: 'Open.' },
    { layout: 'discuss', title: 'Why the Nile?', question: 'Why would the river matter?', speakerNotes: 'Listen.' },
  ],
};

type Result = { init?: { status: number; headers?: Record<string, string> }; data?: Record<string, unknown> };
function post(fields: Record<string, string>) {
  const body = new URLSearchParams({ conversationId: 'lesson-1', deckId: 'deck-1', deck: JSON.stringify(DECK), line: 'Cut the last slide', selection: '', ...fields });
  return action({
    request: new Request('http://localhost/api/domain/lesson-planner/deck-command', { method: 'POST', body }),
  } as never) as Promise<Result>;
}

describe('api.domain.lesson-planner.deck-command', () => {
  beforeEach(() => {
    requireMutableRequest.mockReset().mockResolvedValue(undefined);
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1', organization: { id: 'org-1' } } });
    getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ deckChat: true, deckStudio: true, deckKitV4: true, deckKitV41: true });
    prisma.lessonPlanConversation.findFirst.mockReset().mockResolvedValue({ id: 'lesson-1', periodMinutes: 45 });
    runDeckCommand.mockReset().mockResolvedValue({ reply: 'Cut it.', applied: true, deck: { title: 'x', slides: [] }, changes: [{ slide: 2, kind: 'removed', title: 'Why the Nile?' }] });
  });

  test('the teacher’s own lesson: the deck as the page has it goes to Yawp!, in the school’s deck spec', async () => {
    const result = await post({ selection: JSON.stringify({ slide: 2, field: 'question', text: 'Why would the river matter?' }) });
    expect(result.data).toMatchObject({ ok: true, reply: 'Cut it.', applied: true, changes: [{ slide: 2, kind: 'removed', title: 'Why the Nile?' }] });
    const call = runDeckCommand.mock.calls[0]?.[0];
    expect(call.line).toBe('Cut the last slide');
    expect(call.periodMinutes).toBe(45);
    expect(call.deck.kit).toBe('v4.1');
    expect(call.deck.slides).toHaveLength(2);
    expect(call.selection).toEqual({ slide: 2, field: 'question', text: 'Why would the river matter?' });
    // Scoped to the teacher.
    expect(prisma.lessonPlanConversation.findFirst.mock.calls[0]?.[0].where).toMatchObject({ id: 'lesson-1', membershipId: 'teacher-1', deletedAt: null });
  });

  test('the flag off, or someone else’s lesson: not found, and no model call', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ deckChat: false, deckStudio: true });
    expect((await post({})).init?.status).toBe(404);
    getLessonPlannerReviewFlags.mockResolvedValue({ deckChat: true });
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    expect((await post({})).init?.status).toBe(404);
    expect(runDeckCommand).not.toHaveBeenCalled();
  });

  test('no line, too long a line, a deck that could not be saved, a deck too large: refused before the model', async () => {
    expect((await post({ line: '  ' })).init?.status).toBe(400);
    expect((await post({ line: 'x'.repeat(601) })).init?.status).toBe(400);
    expect((await post({ deck: JSON.stringify({ title: 'x', slides: [{ layout: 'title', title: '' }] }) })).init?.status).toBe(422);
    expect((await post({ deck: 'x'.repeat(500 * 1024) })).init?.status).toBe(413);
    expect(runDeckCommand).not.toHaveBeenCalled();
  });

  test('what is pointed at is a field’s name or nothing', async () => {
    await post({ selection: JSON.stringify({ slide: 2, field: 'ignore the rules', text: '' }) });
    expect(runDeckCommand.mock.calls[0]?.[0].selection).toBeNull();
  });

  test('over the hourly limit: 429 with when to come back; any other failure: try again', async () => {
    runDeckCommand.mockRejectedValue(new AiRateLimitError(120));
    const limited = await post({});
    expect(limited.init?.status).toBe(429);
    expect(limited.data?.error).toContain('Try again in a few minutes');
    runDeckCommand.mockRejectedValue(new Error('timeout'));
    const failed = await post({});
    expect(failed.init?.status).toBe(503);
    expect(failed.data?.error).toContain('Try again');
  });
});
