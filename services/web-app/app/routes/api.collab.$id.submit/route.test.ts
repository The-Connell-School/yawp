import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { document: { findFirst: mock() } };

const requireUserId = mock();
const requireMembership = mock();
const getIsPlatformAdmin = mock();
const submitGroupDraft = mock();
const withdrawGroupSubmit = mock();
const readGroupSubmitState = mock();

const actualAccess = globalThis.__realModules['~/utils/document-access.server'];
const actualSubmit =
  globalThis.__realModules['~/domain/collaboration/submit.server'];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/document-access.server', () => ({
  ...actualAccess,
  // The predicates themselves are real — only the admin lookup, which is a
  // database read, is stubbed. So this file still exercises the authorization
  // shape the route builds rather than a stand-in for it.
  getIsPlatformAdmin,
}));
mock.module('~/domain/collaboration/submit.server', () => ({
  ...actualSubmit,
  submitGroupDraft,
  withdrawGroupSubmit,
  readGroupSubmitState,
  GroupSubmitError: actualSubmit?.GroupSubmitError,
}));

const { action, loader } = await import('./route');
const { GroupSubmitError } =
  (await import('~/domain/collaboration/submit.server')) as any;

afterAll(() => {
  mock.restore();
  mock.module('~/utils/document-access.server', () => actualAccess);
  mock.module('~/domain/collaboration/submit.server', () => actualSubmit);
});

const readBody = async (response: any) =>
  typeof response.json === 'function' ? response.json() : response.data;
const statusOf = (response: any) => response.status ?? response.init?.status;

const readiness = (submittedCount: number, total: number) => ({
  members: [],
  total,
  submittedCount,
  waitingOn: Array.from({ length: total - submittedCount }, (_, index) => ({
    membershipId: `waiting-${index}`,
    name: 'Taylor Nguyen',
    submitted: false,
    submittedAt: null,
    isViewer: false,
  })),
  everyoneSubmitted: submittedCount === total,
  viewerSubmitted: true,
  viewerIsMember: true,
});

const post = (intent?: string) => {
  const body = new FormData();
  if (intent) body.set('intent', intent);
  return action({
    request: new Request('https://example.com/api/collab/doc-1/submit', {
      method: 'POST',
      body,
    }),
    params: { id: 'doc-1' },
  } as any);
};

const get = () =>
  loader({
    request: new Request('https://example.com/api/collab/doc-1/submit'),
    params: { id: 'doc-1' },
  } as any);

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue({ id: 'member-1' });
  getIsPlatformAdmin.mockReset().mockResolvedValue(false);
  prisma.document.findFirst.mockReset().mockResolvedValue({
    id: 'doc-1',
    title: 'Expansion Plan',
    revision: 3,
    html: '<p>x</p>',
    text: 'x',
  });
  submitGroupDraft.mockReset().mockResolvedValue({
    status: 'waiting',
    submissionId: null,
    created: false,
    readiness: readiness(1, 3),
  });
  withdrawGroupSubmit
    .mockReset()
    .mockResolvedValue({ readiness: readiness(0, 3) });
  readGroupSubmitState.mockReset().mockResolvedValue({
    readiness: readiness(1, 3),
    submittedAt: null,
    submissionId: null,
  });
});

describe('POST /api/collab/:id/submit', () => {
  test('a press that does not complete the set never claims the draft was submitted', async () => {
    // The failure this guards against is a student reading "Submitted", closing
    // the tab, and their group's draft never reaching the teacher.
    const body = await readBody(await post());

    expect(body.status).toBe('waiting');
    expect(body.submissionId).toBeNull();
    expect(body.message).not.toMatch(/^Submitted/);
    expect(body.message).toMatch(/recorded/i);
    expect(body.progress).toBeTruthy();
  });

  test('says so plainly when the last press sends the draft in', async () => {
    submitGroupDraft.mockResolvedValue({
      status: 'submitted',
      submissionId: 'sub-1',
      created: true,
      readiness: readiness(3, 3),
    });

    const body = await readBody(await post());

    expect(body.status).toBe('submitted');
    expect(body.submissionId).toBe('sub-1');
    expect(body.message).toMatch(/gone to your teacher/i);
  });

  test('returns the group progress so the page can name who is still to press', async () => {
    const body = await readBody(await post());

    expect(body.readiness.submittedCount).toBe(1);
    expect(body.readiness.total).toBe(3);
  });

  test('withdraw takes a press back', async () => {
    const body = await readBody(await post('withdraw'));

    expect(withdrawGroupSubmit).toHaveBeenCalledWith({
      documentId: 'doc-1',
      membershipId: 'member-1',
    });
    expect(body.status).toBe('withdrawn');
    expect(submitGroupDraft).not.toHaveBeenCalled();
  });

  test('a refusal from the domain comes back as a 400 with its own message', async () => {
    submitGroupDraft.mockRejectedValue(
      new GroupSubmitError('Cannot submit an empty draft.')
    );

    const response = await post();

    expect(statusOf(response)).toBe(400);
    expect((await readBody(response)).message).toMatch(/empty/i);
  });

  test('someone outside the group gets a 404, not a hint that the draft exists', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await post();

    expect(statusOf(response)).toBe(404);
    expect(submitGroupDraft).not.toHaveBeenCalled();
  });

  test('scopes the press to an author of a collaborative room', async () => {
    await post();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('doc-1');
    expect(where.deletedAt).toBeNull();
    // documentAuthorWhere: owner or active co-author, teachers excluded.
    expect(JSON.stringify(where.AND)).toContain('member-1');
  });
});

describe('GET /api/collab/:id/submit', () => {
  test('reports the group progress for polling', async () => {
    const body = await readBody(await get());

    expect(readGroupSubmitState).toHaveBeenCalledWith({
      documentId: 'doc-1',
      viewerMembershipId: 'member-1',
    });
    expect(body.readiness.total).toBe(3);
    expect(body.progress).toBeTruthy();
  });

  test('404s for someone who cannot read the draft', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    expect(statusOf(await get())).toBe(404);
  });
});
