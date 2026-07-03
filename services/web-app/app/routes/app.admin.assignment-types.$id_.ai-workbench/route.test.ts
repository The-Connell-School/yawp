import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
  },
};

const requireAdmin = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

describe('admin assignment type AI workbench loader', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ id: 'admin-user-1' });
  });

  test('loads current assignment type AI config and builds prompt previews', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 0.4,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask one targeted thesis question.',
            },
          ],
        },
      ],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: {
            id: 'admin-user-1',
            name: 'Bryant Brock',
            email: 'bryant@brock.software',
          },
        },
      ],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(requireAdmin).toHaveBeenCalled();
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      include: expect.objectContaining({
        assignmentModules: expect.objectContaining({
          where: { deletedAt: null },
        }),
        aiVersions: expect.objectContaining({ take: 10 }),
      }),
    });
    expect((result as { data: any }).data.workbench.gradingPreview.userPrompt).toContain(
      'Use this shared rubric exactly.'
    );
    expect((result as { data: any }).data.workbench.tutorPreviews[0].systemPrompt).toContain(
      'Ask one targeted thesis question.'
    );
    expect((result as { data: any }).data.assignmentType.aiVersions).toHaveLength(
      1
    );
  });

  test('applies sandbox query parameters to the prompt previews', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [],
      aiVersions: [],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench?studentFirstName=Ava&strictnessLevel=advanced&sampleEssay=This%20draft%20has%20a%20specific%20claim.'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(data.controls).toEqual({
      studentFirstName: 'Ava',
      strictnessLevel: 'advanced',
      sampleEssay: 'This draft has a specific claim.',
    });
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'Student first name: Ava'
    );
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'Grading assistant strictness: Advanced'
    );
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'This draft has a specific claim.'
    );
  });

  test('returns 404 when the assignment type is missing', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/missing/ai-workbench'
        ),
        params: { id: 'missing' },
        context: {} as never,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
