import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: { findUnique: mock() },
};
const requireAdmin = mock();
const getLLMCompletion = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));

const { action } = await import('./route');

function scratchTestFormData() {
  const formData = new FormData();
  formData.set('assignmentTypeId', 'at-1');
  formData.set('title', 'Argument Essay');
  formData.set(
    'scoringScaleJson',
    JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5 })
  );
  formData.set(
    'rubricJson',
    JSON.stringify({
      categories: [
        {
          key: 'claim',
          label: 'Claim',
          weight: 1,
          description: 'States a defensible position.',
        },
      ],
    })
  );
  formData.set(
    'promptConfigJson',
    JSON.stringify({
      systemInstructions: 'Draft system instructions.',
      gradingInstructions: 'Draft grading instructions.',
    })
  );
  formData.set('documentText', 'School uniforms should remain optional.');
  formData.set(
    'criterion',
    'The feedback should identify the claim and one grounded next step.'
  );
  return formData;
}

describe('grading assistant scratch test action', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    requireAdmin.mockReset();
    getLLMCompletion.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Argument Essay',
      kind: null,
      systemKey: null,
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: {
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            weight: 1,
            description: 'States a defensible position.',
          },
        ],
      },
      gradingPromptConfigJson: {
        systemInstructions: 'Saved system instructions.',
        gradingInstructions: 'Saved grading instructions.',
      },
      gradingOutputSchemaJson: { schemaVersion: 1 },
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 7,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
    });
    getLLMCompletion
      .mockResolvedValueOnce(
        JSON.stringify({
          categories: [{ key: 'claim', score: 4, comment: 'Clear position.' }],
          overallComment: 'Jordan, explain the stakes next.',
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          passed: true,
          evidence: 'The response names the claim and a grounded next step.',
        })
      );
  });

  test('runs current draft assignment-type config without saving it', async () => {
    const formData = scratchTestFormData();

    const response = await action({
      request: new Request(
        'https://example.test/api/domain/grading-assistant-test',
        { method: 'POST', body: formData }
      ),
      params: {},
      context: {} as never,
    } as any);

    const data = (response as { data: any }).data;
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('pass');
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(getLLMCompletion).toHaveBeenCalledTimes(2);
    expect(getLLMCompletion.mock.calls[0]?.[0].system).toContain(
      'Draft system instructions.'
    );
    expect(getLLMCompletion.mock.calls[0]?.[0].system).not.toContain(
      'Saved system instructions.'
    );
  });

  test('rejects AP History because its production prompt requires an assignment snapshot', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'AP History Essay',
      kind: 'ap_history',
      systemKey: 'ap_history_essay',
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
    });

    await expect(
      action({
        request: new Request(
          'https://example.test/api/domain/grading-assistant-test',
          { method: 'POST', body: scratchTestFormData() }
        ),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 400 });
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects a draft without a usable assignment-type rubric', async () => {
    const formData = scratchTestFormData();
    formData.set('rubricJson', JSON.stringify({ categories: [] }));

    const response = await action({
      request: new Request(
        'https://example.test/api/domain/grading-assistant-test',
        { method: 'POST', body: formData }
      ),
      params: {},
      context: {} as never,
    } as any);

    const result = response as {
      data: { success: boolean; message: string };
      init: { status: number };
    };
    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      success: false,
      message: 'Add at least one complete rubric category before testing.',
    });
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });
});
