import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: { findFirst: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const resolveRubricConfigForSubmission = mock();
const resolveGrammarHighlightingForAssignmentType = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (to: string, payload: unknown) =>
    new Response(JSON.stringify({ to, payload }), {
      status: 302,
      headers: { 'Content-Type': 'application/json' },
    }),
}));
mock.module(
  '~/routes/app_.submissions_.$submissionId/submission-rubric-config.server',
  () => ({
    resolveRubricConfigForSubmission,
    resolveGrammarHighlightingForAssignmentType,
  })
);

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

const STUDENT_MEMBERSHIP_ID = 'membership-student';
const TEACHER_MEMBERSHIP_ID = 'membership-teacher';

function membership(
  id: string,
  role: 'STUDENT' | 'TEACHER',
  { revisionFlowEnabled = true } = {}
) {
  return {
    id,
    role,
    organization: { id: 'org-1', revisionFlowEnabled },
  };
}

function buildSubmission(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'sub-1',
    title: 'Essay',
    text: 'body',
    html: '<p>body</p>',
    submittedAt: new Date('2026-08-01T00:00:00Z'),
    score: null,
    rubricScores: null,
    overallScore: null,
    overallComment: null,
    numericPercentage: null,
    letterGrade: null,
    grammarIssues: null,
    releasedAt: new Date('2026-08-03T00:00:00Z'),
    gradedAt: new Date('2026-08-02T00:00:00Z'),
    unsubmittedAt: null,
    documentId: 'doc-1',
    document: {
      id: 'doc-1',
      title: 'Essay',
      html: '<p>live draft</p>',
      text: 'live draft',
      revision: 7,
      updatedAt: new Date('2026-08-04T00:00:00Z'),
      assignmentTypeId: 'at-1',
      assignment: null,
      membership: {
        id: STUDENT_MEMBERSHIP_ID,
        userId: 'user-student',
        organizationId: 'org-1',
      },
    },
    comments: [],
    gradingAssistantRuns: [],
    ...overrides,
  };
}

function request() {
  return new Request('https://example.test/app/revise/sub-1');
}

async function readRedirect(result: unknown) {
  return (await (result as Response).json()) as {
    to: string;
    payload: { description: string; type: string };
  };
}

function call() {
  return loader({ request: request(), params: { submissionId: 'sub-1' } });
}

describe('revise loader', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    resolveRubricConfigForSubmission.mockReset();
    resolveGrammarHighlightingForAssignmentType.mockReset();

    requireUserId.mockResolvedValue('user-student');
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    resolveRubricConfigForSubmission.mockResolvedValue({
      minScore: 1,
      maxScore: 5,
      categories: [],
    });
    resolveGrammarHighlightingForAssignmentType.mockResolvedValue(true);
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());
  });

  test('serves the split screen to the owner of a released submission', async () => {
    const result = await call();

    expect(result).not.toBeInstanceOf(Response);
    const data = result as {
      submission: { id: string; html: string };
      document: { id: string; html: string; revision: number };
    };
    // Left pane reads the frozen submission snapshot; right pane reads the
    // live document. They must not be the same content.
    expect(data.submission.html).toBe('<p>body</p>');
    expect(data.document.html).toBe('<p>live draft</p>');
    expect(data.document.revision).toBe(7);
  });

  test('sends the student to the legacy draft editor while the flag is off', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT', {
        revisionFlowEnabled: false,
      })
    );

    const redirect = await readRedirect(await call());

    expect(redirect.to).toBe('/app/documents/doc-1?revise=1');
  });

  test('sends a student back to the submission page before release', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      buildSubmission({ releasedAt: null })
    );

    const redirect = await readRedirect(await call());

    expect(redirect.to).toBe('/app/submissions/sub-1');
    expect(redirect.payload.description).toMatch(/released/i);
  });

  test('sends a student to the draft editor for a withdrawn submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      buildSubmission({ unsubmittedAt: new Date('2026-08-05T00:00:00Z') })
    );

    const redirect = await readRedirect(await call());

    expect(redirect.to).toBe('/app/documents/doc-1?revise=1');
  });

  test('refuses a teacher: revising would write into the student document', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );

    const redirect = await readRedirect(await call());

    expect(redirect.to).toBe('/app/submissions/sub-1');
    expect(redirect.payload.type).toBe('error');
  });

  test('reports a missing submission rather than leaking its existence', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const redirect = await readRedirect(await call());

    expect(redirect.to).toBe('/app');
    expect(redirect.payload.description).toBe('Submission not found.');
  });
});
