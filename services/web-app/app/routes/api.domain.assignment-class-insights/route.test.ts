import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignment: {
    findFirst: mock(),
    update: mock(),
  },
  submission: {
    findMany: mock(),
  },
  teacherTrainingModule: {
    findMany: mock(),
  },
};

const isClassInsightsEnabledForOrganization = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const getLLMCompletion = mock();
const parseFirstJsonValue = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isClassInsightsEnabledForOrganization,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module('~/utils/llm-json.server', () => ({ parseFirstJsonValue }));

const { action } = await import('./route');

function buildRequest(body: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) form.append(k, v);
  return new Request(
    'https://example.com/api/domain/assignment-class-insights',
    {
      method: 'POST',
      body: form,
    }
  );
}

function buildAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asn-1',
    title: 'To Kill a Mockingbird Essay',
    prompt: 'Write about courage.',
    class: {
      id: 'class-1',
      school: { organizationId: 'org-1' },
    },
    ...overrides,
  };
}

function buildSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    overallComment: 'Nice work',
    letterGrade: 'B',
    rubricScores: {
      thesis_and_content: { score: 4, comment: 'good' },
      organization_and_structure: { score: 3, comment: 'meh' },
      evidence_and_support: { score: 3, comment: 'meh' },
      voice_and_style: { score: 4, comment: 'good' },
      grammar_and_mechanics: { score: 2, comment: 'fix commas' },
    },
    ...overrides,
  };
}

const validAiResponse = {
  strengths: ['Strong thesis statements across the class'],
  weaknesses: [
    {
      rubricCategory: 'grammar_and_mechanics',
      observation: 'Comma splices are common',
      affectedCount: 7,
    },
  ],
  nextSteps: [
    {
      step: 'Re-teach comma rules',
      moduleId: 'mod-1',
    },
  ],
};

describe('api.domain.assignment-class-insights', () => {
  beforeEach(() => {
    prisma.assignment.findFirst.mockReset();
    prisma.assignment.update.mockReset();
    prisma.submission.findMany.mockReset();
    prisma.teacherTrainingModule.findMany.mockReset();
    isClassInsightsEnabledForOrganization.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    getLLMCompletion.mockReset();
    parseFirstJsonValue.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-profile-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isClassInsightsEnabledForOrganization.mockResolvedValue(true);
    prisma.assignment.findFirst.mockResolvedValue(buildAssignment());
    prisma.submission.findMany.mockResolvedValue([buildSubmission()]);
    prisma.teacherTrainingModule.findMany.mockResolvedValue([
      {
        id: 'mod-1',
        title: 'Comma Rules',
        description: 'Splices',
        teacherTrainingId: 'tt-1',
      },
    ]);
    getLLMCompletion.mockResolvedValue('{}');
    parseFirstJsonValue.mockReturnValue(validAiResponse);
    prisma.assignment.update.mockResolvedValue({});
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);
    const response = await action({
      request: buildRequest({ assignmentId: 'asn-1' }),
    } as any);
    expect((response as any).init?.status).toBe(403);
  });

  test('rejects when feature flag is disabled', async () => {
    isClassInsightsEnabledForOrganization.mockResolvedValue(false);
    const response = await action({
      request: buildRequest({ assignmentId: 'asn-1' }),
    } as any);
    expect((response as any).init?.status).toBe(403);
  });

  test('returns 404 when assignment not found', async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);
    const response = await action({
      request: buildRequest({ assignmentId: 'missing' }),
    } as any);
    expect((response as any).init?.status).toBe(404);
  });

  test('returns 400 when no graded submissions exist', async () => {
    prisma.submission.findMany.mockResolvedValue([]);
    const response = await action({
      request: buildRequest({ assignmentId: 'asn-1' }),
    } as any);
    expect((response as any).init?.status).toBe(400);
  });

  test('builds insights, resolves modules, and stores result on assignment', async () => {
    const response = await action({
      request: buildRequest({ assignmentId: 'asn-1' }),
    } as any);

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(prisma.assignment.update).toHaveBeenCalledTimes(1);

    const updateCall = prisma.assignment.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'asn-1' });
    expect(updateCall.data.classInsights.weaknesses[0]).toMatchObject({
      rubricCategory: 'grammar_and_mechanics',
      label: 'Grammar/Syntax/Formatting',
    });
    expect(updateCall.data.classInsights.nextSteps[0]).toMatchObject({
      step: 'Re-teach comma rules',
      moduleId: 'mod-1',
      moduleTitle: 'Comma Rules',
      teacherTrainingId: 'tt-1',
    });
    expect(updateCall.data.classInsights.submissionCount).toBe(1);
    expect(updateCall.data.classInsightsGeneratedAt).toBeInstanceOf(Date);

    const payload = (response as any).data;
    expect(payload.success).toBe(true);
  });

  test('drops next-step modules that the teacher does not have access to', async () => {
    parseFirstJsonValue.mockReturnValue({
      ...validAiResponse,
      nextSteps: [
        {
          step: 'Bogus step',
          moduleId: 'hallucinated-module-id',
        },
        {
          step: 'Real step',
          moduleId: 'mod-1',
        },
      ],
    });

    await action({
      request: buildRequest({ assignmentId: 'asn-1' }),
    } as any);

    const updateCall = prisma.assignment.update.mock.calls[0][0];
    const nextSteps = updateCall.data.classInsights.nextSteps;
    expect(nextSteps).toHaveLength(2);
    expect(nextSteps[0]).toMatchObject({
      step: 'Bogus step',
      moduleId: null,
      moduleTitle: null,
      teacherTrainingId: null,
    });
    expect(nextSteps[1]).toMatchObject({
      step: 'Real step',
      moduleId: 'mod-1',
      moduleTitle: 'Comma Rules',
      teacherTrainingId: 'tt-1',
    });
  });

  test('returns 502 when AI returns malformed JSON', async () => {
    parseFirstJsonValue.mockReturnValue({ not: 'valid' });
    const response = await action({
      request: buildRequest({ assignmentId: 'asn-1' }),
    } as any);
    expect((response as any).init?.status).toBe(502);
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });
});
