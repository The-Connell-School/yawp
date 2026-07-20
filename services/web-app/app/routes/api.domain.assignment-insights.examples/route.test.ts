import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  document: { findMany: mock() },
};

const getGradingActor = mock();
const canManageGrades = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));

const { loader } = await import('./route');

function getRequest(params: Record<string, string>) {
  const url = new URL(
    'https://example.com/api/domain/assignment-insights/examples'
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url, { method: 'GET' });
}

function payloadOf(response: unknown) {
  return response as {
    data: {
      examples: Array<{
        snippet: string;
        score: number;
        studentName: string;
        href: string;
      }>;
      message?: string;
    };
    init?: { status?: number };
  };
}

const ACTOR = {
  membershipId: 'm-1',
  organizationId: 'org-1',
  isAdmin: false,
};

describe('api.domain.assignment-insights.examples', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    prisma.document.findMany.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    getGradingActor.mockResolvedValue(ACTOR);
    canManageGrades.mockReturnValue(true);
    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'ca-1',
      class: {
        school: { organization: { classInsightsEnabled: true } },
      },
    });
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);
    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );
    expect(response.init?.status).toBe(403);
    expect(response.data.examples).toEqual([]);
  });

  test('rejects an unknown rubric category', async () => {
    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'not_a_category',
          status: 'gap',
        }),
      } as never)
    );
    expect(response.init?.status).toBe(400);
  });

  test('404s when the class assignment is not owned by the teacher', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );
    expect(response.init?.status).toBe(404);
  });

  test('always scopes exemplar access to the actor organization', async () => {
    getGradingActor.mockResolvedValue({
      membershipId: 'admin-1',
      organizationId: 'org-1',
      isAdmin: true,
    });
    prisma.classAssignment.findFirst.mockResolvedValue(null);

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'other-org-assignment',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );

    expect(response.init?.status).toBe(404);
    expect(prisma.classAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'other-org-assignment',
          class: { school: { organizationId: 'org-1' } },
        },
      })
    );
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  test('returns the lowest-scoring snippets for a gap category', async () => {
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'd-strong',
        membership: { user: { name: 'Ada Strong', email: 'ada@example.com' } },
        submissions: [
          {
            id: 's-strong',
            text: 'A precise, well-integrated analysis of the quotation.',
            html: null,
            rubricScores: { evidence_and_support: 5 },
          },
        ],
      },
      {
        id: 'd-weak',
        membership: { user: { name: 'Ben Weak', email: 'ben@example.com' } },
        submissions: [
          {
            id: 's-weak',
            text: 'The quote is just dropped in with no explanation at all.',
            html: null,
            rubricScores: { evidence_and_support: 2 },
          },
        ],
      },
      {
        id: 'd-unscored',
        membership: { user: { name: 'Cara None', email: 'cara@example.com' } },
        submissions: [
          {
            id: 's-unscored',
            text: 'No rubric score on the category here.',
            html: null,
            rubricScores: { thesis_and_content: 4 },
          },
        ],
      },
    ]);

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );

    expect(response.init?.status ?? 200).toBe(200);
    // Only the two scored submissions appear, weakest first for a gap.
    expect(response.data.examples).toHaveLength(2);
    expect(response.data.examples[0].score).toBe(2);
    expect(response.data.examples[0].snippet).toContain('dropped in');
    expect(response.data.examples[0].studentName).toBe('Ben Weak');
    expect(response.data.examples[0].href).toBe('/app/submissions/s-weak');
    expect(response.data.examples[1].score).toBe(5);
    expect(response.data.examples[1].studentName).toBe('Ada Strong');
  });

  test('falls back to email, then a placeholder, when a name is missing', async () => {
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'd-email',
        membership: { user: { name: null, email: 'noname@example.com' } },
        submissions: [
          {
            id: 's-email',
            text: 'Essay text from a student with no display name.',
            html: null,
            rubricScores: { evidence_and_support: 3 },
          },
        ],
      },
      {
        id: 'd-anon',
        membership: { user: { name: null, email: null } },
        submissions: [
          {
            id: 's-anon',
            text: 'Essay text with no identity at all.',
            html: null,
            rubricScores: { evidence_and_support: 3 },
          },
        ],
      },
    ]);

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'mixed',
        }),
      } as never)
    );

    const names = response.data.examples.map((example) => example.studentName);
    expect(names).toContain('noname@example.com');
    expect(names).toContain('Unknown student');
  });

  test('reads the nested rubric-score shape and strips html', async () => {
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'd-1',
        submissions: [
          {
            id: 's-1',
            text: '',
            html: '<p>Rich <em>markup</em> student text.</p>',
            rubricScores: {
              thesis_and_content: { score: 5, comment: 'Great' },
            },
          },
        ],
      },
    ]);

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'thesis_and_content',
          status: 'strength',
        }),
      } as never)
    );

    expect(response.data.examples).toHaveLength(1);
    expect(response.data.examples[0].score).toBe(5);
    expect(response.data.examples[0].snippet).toBe('Rich markup student text.');
  });

  test('rejects direct example requests while the organization gate is off', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'ca-1',
      class: {
        school: { organization: { classInsightsEnabled: false } },
      },
    });

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );

    expect(response.init?.status).toBe(404);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});
