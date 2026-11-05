import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const getLessonPlannerReviewFlags = mock(async (_org: string) => ({ libraryV2: true }) as Record<string, boolean>);
const library = {
  createGroup: mock(),
  createUnit: mock(async () => ({ result: { unitId: 'u-9', message: 'Created Gatsby.' }, undo: { before: {}, made: {} } })),
  deleteUnit: mock(),
  duplicateLesson: mock(),
  duplicateUnit: mock(),
  groupUnits: mock(),
  moveGroup: mock(),
  moveLessonTo: mock(async () => null),
  moveUnitsToGroup: mock(),
  planLesson: mock(),
  renameGroup: mock(),
  renameUnit: mock(),
  undoLibrary: mock(async () => undefined),
  ungroup: mock(),
};

mock.module('~/utils/auth.server', () => ({ requireMutableRequest: mock(async () => undefined), requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess: mock(async () => ({ membership: { id: 'teacher-1', organization: { id: 'org-1' } } })),
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));
const real = await import('~/domain/lesson-planner/library-v2.server');
mock.module('~/domain/lesson-planner/library-v2.server', () => ({ ...library, LIBRARY_UNDO: real.LIBRARY_UNDO }));

const { action } = await import('./route');
afterAll(() => mock.restore());

function post(fields: Record<string, string>) {
  return action({
    request: new Request('http://localhost/api/domain/lesson-planner/library', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
  } as any) as Promise<any>;
}

beforeEach(() => getLessonPlannerReviewFlags.mockResolvedValue({ libraryV2: true }));

describe('library moves (Oct 24 handoff, Part 2)', () => {
  test('nothing without the flag', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ libraryV2: false });
    expect((await post({ intent: 'create-unit', courseId: 'c1', title: 'Gatsby' })).init?.status).toBe(404);
  });

  test('a move answers with its line and its Undo, scoped to the teacher', async () => {
    const response = await post({ intent: 'create-unit', courseId: 'c1', title: 'Gatsby', kind: 'book' });
    expect(response.data).toMatchObject({ ok: true, unitId: 'u-9', message: 'Created Gatsby.' });
    expect(JSON.parse(response.data.undo)).toEqual({ before: {}, made: {} });
    expect(library.createUnit).toHaveBeenCalledWith(
      { membershipId: 'teacher-1', organizationId: 'org-1' },
      { courseId: 'c1', title: 'Gatsby', kind: 'book', groupId: null }
    );
  });

  test("another teacher's lesson is not found", async () => {
    expect((await post({ intent: 'move-lesson', conversationId: 'theirs', unitId: 'u1' })).init?.status).toBe(404);
  });

  test('Undo takes only a well-formed library; junk is refused', async () => {
    expect((await post({ intent: 'undo', undo: '{"nope":1}' })).init?.status).toBe(400);
    expect((await post({ intent: 'undo', undo: 'not json' })).init?.status).toBe(400);
    const ok = await post({
      intent: 'undo',
      undo: JSON.stringify({ before: { groups: [], units: [], lessons: [] }, made: { groups: [], units: ['u-9'], lessons: [] } }),
    });
    expect(ok.data).toEqual({ ok: true, message: 'Undone.' });
    expect(library.undoLibrary).toHaveBeenCalledTimes(1);
  });
});
