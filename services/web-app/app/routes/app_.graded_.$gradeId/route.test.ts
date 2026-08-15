import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  legacyGradeRedirect: { findUnique: mock() },
  submission: { findUnique: mock() },
};

const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId }));

const { loader } = await import('./route');

// The legacy id maps to student B's submission, which points at student B's document.
const LEGACY_GRADE_ID = 'legacy-grade-1';
const VICTIM_DOCUMENT_ID = 'doc-b';

function callLoader() {
  return loader({
    request: new Request(`https://example.com/app/graded/${LEGACY_GRADE_ID}`),
    params: { gradeId: LEGACY_GRADE_ID },
    context: {} as any,
  } as any) as Promise<any>;
}

function locationOf(result: any): string {
  if (result instanceof Response) return result.headers.get('location') ?? '';
  return result?.headers?.location ?? '';
}

describe('app_.graded_.$gradeId authentication', () => {
  beforeEach(() => {
    prisma.legacyGradeRedirect.findUnique.mockReset();
    prisma.submission.findUnique.mockReset();
    requireUserId.mockReset();

    prisma.legacyGradeRedirect.findUnique.mockResolvedValue({
      submissionId: 'submission-b',
    });
    prisma.submission.findUnique.mockResolvedValue({
      id: 'submission-b',
      documentId: VICTIM_DOCUMENT_ID,
    });
  });

  test('does not resolve a document id for a caller with no session', async () => {
    // Stands in for a request carrying no auth cookie: requireUserId throws the
    // login redirect rather than returning a user id.
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { location: '/auth/login' },
    });
    requireUserId.mockRejectedValue(loginRedirect);

    let thrown: unknown;
    let returned: any;
    try {
      returned = await callLoader();
    } catch (error) {
      thrown = error;
    }

    // The whole point of the route is the Location header. An unauthenticated
    // caller must never receive one that names a document id.
    expect(locationOf(returned)).not.toContain(VICTIM_DOCUMENT_ID);
    expect(locationOf(thrown)).not.toContain(VICTIM_DOCUMENT_ID);

    // And the lookup must not run at all — it is an existence oracle on its own.
    expect(prisma.legacyGradeRedirect.findUnique).not.toHaveBeenCalled();
    expect(prisma.submission.findUnique).not.toHaveBeenCalled();
  });

  test('redirects an authenticated caller following an old bookmark', async () => {
    requireUserId.mockResolvedValue('user-1');

    const result = await callLoader();

    expect(locationOf(result)).toBe(`/app/documents/${VICTIM_DOCUMENT_ID}`);
  });
});
