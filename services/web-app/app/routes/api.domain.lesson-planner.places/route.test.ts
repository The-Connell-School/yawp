import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));
const { action } = await import('./route');
afterAll(() => mock.restore());

type Result = { init?: { status: number }; data?: { places?: Record<string, unknown>[]; view?: unknown; error?: string } };
const post = (slide: unknown) =>
  action({
    request: new Request('http://localhost/api/domain/lesson-planner/places', { method: 'POST', body: new URLSearchParams({ slide: typeof slide === 'string' ? slide : JSON.stringify(slide) }) }),
  } as never) as Promise<Result>;

const MAP = { layout: 'map', title: 'Journey', speakerNotes: 'n', places: [{ name: 'Khartoum', where: 'Sudan', lat: 0, lon: 0 }, { name: 'Maycomb' }] };

describe('api.domain.lesson-planner.places', () => {
  beforeEach(() => {
    requireMutableRequest.mockReset().mockResolvedValue(undefined);
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1', organization: { id: 'org-1' } } });
    getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ deckStudio: true });
  });

  test('a map slide’s places, where Yawp! found them, and the area to show', async () => {
    const result = await post(MAP);
    const [khartoum, maycomb] = result.data!.places!;
    expect(khartoum).toMatchObject({ name: 'Khartoum', found: 'Khartoum, Sudan' });
    expect(Math.abs((khartoum!.lat as number) - 15.55)).toBeLessThan(0.3);
    expect(maycomb).toEqual({ name: 'Maycomb' });
    expect(result.data!.view).toMatchObject({ w: expect.any(Number), n: expect.any(Number) });
  });

  test('not a map slide, not a slide, too much, or the studio off: refused', async () => {
    expect((await post({ layout: 'title', title: 'T', speakerNotes: 'n' })).init?.status).toBe(422);
    expect((await post('{"oops"')).init?.status).toBe(422);
    expect((await post({ ...MAP, speakerNotes: 'x'.repeat(40_000) })).init?.status).toBe(413);
    getLessonPlannerReviewFlags.mockResolvedValue({ deckStudio: false });
    expect((await post(MAP)).init?.status).toBe(404);
  });
});
