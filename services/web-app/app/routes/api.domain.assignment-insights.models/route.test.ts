import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock(), findUnique: mock() },
  assignmentType: { findUnique: mock() },
  document: { findMany: mock() },
  setting: { findUnique: mock() },
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
    'https://example.com/api/domain/assignment-insights/models'
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url, { method: 'GET' });
}

type Payload = {
  data: {
    models: {
      focuses: Array<{
        category: string;
        exemplar: { studentName: string; href: string } | null;
        instructive: { studentName: string; href: string } | null;
      }>;
    } | null;
    message?: string;
  };
  init?: { status?: number };
};

function payloadOf(response: unknown) {
  return response as Payload;
}

const ACTOR = { membershipId: 'm-1', organizationId: 'org-1', isAdmin: false };

function doc(
  id: string,
  name: string,
  scores: Record<string, number>,
  text = `${name} explains the reading with a quotation.`
) {
  return {
    id,
    membership: { user: { name, email: `${id}@x.com` } },
    group: null,
    submissions: [
      {
        id: `sub-${id}`,
        text,
        html: '',
        rubricScores: Object.fromEntries(
          Object.entries(scores).map(([key, score]) => [key, { score }])
        ),
      },
    ],
  };
}

const ALL_FIVE = (score: number, evidence: number) => ({
  thesis_and_content: score,
  organization_and_structure: score,
  evidence_and_support: evidence,
  voice_and_style: score,
  grammar_and_mechanics: score,
});

describe('api.domain.assignment-insights.models', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset().mockResolvedValue({
      id: 'ca-1',
      class: { school: { organization: { classInsightsEnabled: true } } },
    });
    // No assignment type resolves: the rubric falls back to the defaults.
    prisma.classAssignment.findUnique.mockReset().mockResolvedValue(null);
    prisma.assignmentType.findUnique.mockReset().mockResolvedValue(null);
    prisma.document.findMany.mockReset().mockResolvedValue([]);
    prisma.setting.findUnique
      .mockReset()
      .mockResolvedValue({ value: '{"mode":"everyone","orgIds":[]}' });
    getGradingActor.mockReset().mockResolvedValue(ACTOR);
    canManageGrades.mockReset().mockReturnValue(true);
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);
    const response = payloadOf(
      await loader({
        request: getRequest({ classAssignmentId: 'ca-1' }),
      } as never)
    );
    expect(response.init?.status).toBe(403);
    expect(response.data.models).toBeNull();
  });

  test('is not found while the feature flag is off for the school', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    const response = payloadOf(
      await loader({
        request: getRequest({ classAssignmentId: 'ca-1' }),
      } as never)
    );
    expect(response.init?.status).toBe(404);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  test('requires a class assignment', async () => {
    const response = payloadOf(
      await loader({ request: getRequest({}) } as never)
    );
    expect(response.init?.status).toBe(400);
  });

  test('is not found for a class the teacher does not teach', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    const response = payloadOf(
      await loader({
        request: getRequest({ classAssignmentId: 'ca-1' }),
      } as never)
    );
    expect(response.init?.status).toBe(404);
    const where = prisma.classAssignment.findFirst.mock.calls[0]?.[0].where;
    expect(where.class.teachers).toEqual({ some: { id: 'm-1' } });
    expect(where.class.school).toEqual({ organizationId: 'org-1' });
  });

  test('is not found when class insights are off for the organization', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'ca-1',
      class: { school: { organization: { classInsightsEnabled: false } } },
    });
    const response = payloadOf(
      await loader({
        request: getRequest({ classAssignmentId: 'ca-1' }),
      } as never)
    );
    expect(response.init?.status).toBe(404);
  });

  test('returns a strong model and an instructive example from graded work', async () => {
    prisma.document.findMany.mockResolvedValue([
      doc('a', 'Ava Ruiz', ALL_FIVE(5, 5)),
      doc('b', 'Ben Ito', ALL_FIVE(4, 1)),
      doc('c', 'Cy Park', ALL_FIVE(3, 3)),
    ]);

    const response = payloadOf(
      await loader({
        request: getRequest({ classAssignmentId: 'ca-1' }),
      } as never)
    );

    expect(response.init?.status ?? 200).toBe(200);
    const first = response.data.models!.focuses[0];
    expect(first.category).toBe('evidence_and_support');
    expect(first.exemplar).toMatchObject({
      studentName: 'Ava Ruiz',
      href: '/app/submissions/sub-a',
    });
    expect(first.instructive).toMatchObject({
      studentName: 'Ben Ito',
      href: '/app/submissions/sub-b',
    });

    // Only graded work from this class assignment is read.
    const query = prisma.document.findMany.mock.calls[0]?.[0];
    expect(query.where).toMatchObject({
      classAssignmentId: 'ca-1',
      deletedAt: null,
    });
    expect(query.select.submissions.where).toEqual({ gradedAt: { not: null } });
  });

  test('returns null models when there is too little graded work to compare', async () => {
    prisma.document.findMany.mockResolvedValue([
      doc('a', 'Ava Ruiz', ALL_FIVE(5, 5)),
    ]);
    const response = payloadOf(
      await loader({
        request: getRequest({ classAssignmentId: 'ca-1' }),
      } as never)
    );
    expect(response.data.models).toBeNull();
  });
});
