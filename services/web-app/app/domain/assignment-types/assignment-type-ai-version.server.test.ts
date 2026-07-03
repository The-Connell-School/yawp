import { describe, expect, test } from 'bun:test';

import { buildAssignmentTypeAiSnapshot } from './assignment-type-ai-version.server';

describe('assignment type AI version snapshots', () => {
  test('serializes grading config and tutor modules in stable order', () => {
    const snapshot = buildAssignmentTypeAiSnapshot({
      assignmentType: {
        id: 'at-1',
        title: 'Thesis-Driven Essay',
        kind: 'thesis_driven_essay',
        description: 'Teach a thesis-driven essay.',
        scoringScaleJson: { type: 'weighted_0_5', minScore: 0, maxScore: 5 },
        rubricJson: {
          categories: [
            {
              key: 'thesis',
              label: 'Thesis',
              description: 'Clear defensible thesis.',
              weight: 0.35,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade against the thesis rubric.',
        },
        gradingOutputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
        gradingCalibrationNotes: 'Use 0 when absent.',
        gradingAssistantVersion: 4,
        gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
        assignmentModules: [
          {
            id: 'module-2',
            title: 'Draft',
            position: 1,
            description: null,
            tutorInstructions: 'Coach full draft revision.',
            isSelfGuided: false,
            rubricAlignmentJson: { thesis: 'supporting' },
            instructions: [
              {
                id: 'instruction-2',
                position: 1,
                title: 'Revise',
                prompt: 'Revise the thesis.',
                tutorInstructions: 'Ask one focused revision question.',
                showChatButton: true,
                showNextButton: false,
                buttons: [
                  {
                    id: 'button-2',
                    position: 1,
                    label: 'Try another question',
                    action: 'response',
                  },
                  {
                    id: 'button-1',
                    position: 0,
                    label: 'Continue',
                    action: 'advance',
                  },
                ],
              },
            ],
          },
          {
            id: 'module-1',
            title: 'Prewrite',
            position: 0,
            description: 'Find a topic.',
            tutorInstructions: 'Use the assignment prompt as context.',
            isSelfGuided: true,
            rubricAlignmentJson: { thesis: 'preparatory' },
            instructions: [],
          },
        ],
      },
    });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      assignmentType: {
        id: 'at-1',
        title: 'Thesis-Driven Essay',
        kind: 'thesis_driven_essay',
        description: 'Teach a thesis-driven essay.',
        gradingAssistantVersion: 4,
        scoringScaleJson: { type: 'weighted_0_5', minScore: 0, maxScore: 5 },
        rubricJson: {
          categories: [
            {
              key: 'thesis',
              label: 'Thesis',
              description: 'Clear defensible thesis.',
              weight: 0.35,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade against the thesis rubric.',
        },
        gradingOutputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
        gradingCalibrationNotes: 'Use 0 when absent.',
        gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
      },
      modules: [
        {
          id: 'module-1',
          title: 'Prewrite',
          position: 0,
          description: 'Find a topic.',
          tutorInstructions: 'Use the assignment prompt as context.',
          isSelfGuided: true,
          rubricAlignmentJson: { thesis: 'preparatory' },
          instructions: [],
        },
        {
          id: 'module-2',
          title: 'Draft',
          position: 1,
          description: null,
          tutorInstructions: 'Coach full draft revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'supporting' },
          instructions: [
            {
              id: 'instruction-2',
              position: 1,
              title: 'Revise',
              prompt: 'Revise the thesis.',
              tutorInstructions: 'Ask one focused revision question.',
              showChatButton: true,
              showNextButton: false,
              buttons: [
                {
                  id: 'button-1',
                  position: 0,
                  label: 'Continue',
                  action: 'advance',
                },
                {
                  id: 'button-2',
                  position: 1,
                  label: 'Try another question',
                  action: 'response',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test('normalizes missing optional values to nulls and arrays', () => {
    const snapshot = buildAssignmentTypeAiSnapshot({
      assignmentType: {
        id: 'at-2',
        title: 'Daily Pages',
        kind: null,
        description: null,
        scoringScaleJson: null,
        rubricJson: null,
        gradingPromptConfigJson: null,
        gradingOutputSchemaJson: null,
        gradingCalibrationNotes: null,
        gradingAssistantVersion: 1,
        gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
        assignmentModules: null,
      },
    });

    expect(snapshot.modules).toEqual([]);
    expect(snapshot.assignmentType.description).toBeNull();
    expect(snapshot.assignmentType.rubricJson).toBeNull();
  });
});

