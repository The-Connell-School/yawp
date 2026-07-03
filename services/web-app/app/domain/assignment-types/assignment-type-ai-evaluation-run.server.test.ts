import { describe, expect, it } from 'bun:test';
import { buildAssignmentTypeAiWorkbench } from './assignment-type-ai-workbench.server';
import { buildDeterministicAssignmentTypeAiEvaluationResult } from './assignment-type-ai-evaluation-run.server';

describe('buildDeterministicAssignmentTypeAiEvaluationResult', () => {
  it('builds repeatable grading and tutor output from a workbench preview', () => {
    const workbench = buildAssignmentTypeAiWorkbench({
      assignmentType: {
        id: 'type-1',
        title: 'Thesis Essay',
        kind: 'essay',
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
            {
              key: 'evidence',
              label: 'Evidence',
              description: 'Relevant support and explanation.',
              weight: 0.6,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Use the shared thesis rubric exactly.',
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
      },
      sampleEssay: 'My essay argues a clear claim.',
      studentFirstName: 'Ava',
      strictnessLevel: 'advanced',
    });

    const result = buildDeterministicAssignmentTypeAiEvaluationResult({
      workbench,
      sampleInput: 'My essay argues a clear claim.',
      studentFirstName: 'Ava',
    });

    expect(result).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        mode: 'deterministic-workbench-fixture',
        gradingAssistant: expect.objectContaining({
          overallComment: expect.stringContaining('Ava'),
          categories: [
            expect.objectContaining({
              key: 'thesis',
              score: 5,
            }),
            expect.objectContaining({
              key: 'evidence',
              score: 5,
            }),
          ],
        }),
        tutor: expect.objectContaining({
          responses: [
            expect.objectContaining({
              moduleTitle: 'Draft thesis',
              instructionTitle: 'Revise thesis',
              response: expect.stringContaining('thesis'),
            }),
          ],
        }),
      })
    );
  });
});
