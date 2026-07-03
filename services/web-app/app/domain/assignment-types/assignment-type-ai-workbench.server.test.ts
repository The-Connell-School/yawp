import { describe, expect, it } from 'bun:test';
import {
  assignmentTypeAiSnapshotToWorkbenchInput,
  buildAssignmentTypeAiWorkbench,
  compareAssignmentTypeAiWorkbenches,
} from './assignment-type-ai-workbench.server';

describe('buildAssignmentTypeAiWorkbench', () => {
  it('builds grading assistant and tutor prompt previews from one assignment type config', () => {
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
            rubricAlignmentJson: {
              thesis: 'primary',
              evidence: 'not-applicable',
            },
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

    expect(workbench.gradingPreview.system).toContain(
      'You are a grading assistant'
    );
    expect(workbench.gradingPreview.system).toContain('0-5');
    expect(workbench.gradingPreview.userPrompt).toContain(
      'Grading assistant strictness: Advanced'
    );
    expect(workbench.gradingPreview.userPrompt).toContain('thesis: Thesis (40%)');
    expect(workbench.gradingPreview.userPrompt).toContain(
      'Use the shared thesis rubric exactly.'
    );
    expect(workbench.gradingPreview.userPrompt).toContain(
      'My essay argues a clear claim.'
    );

    expect(workbench.tutorPreviews).toHaveLength(1);
    expect(workbench.tutorPreviews[0].systemPrompt).toContain(
      'Coach thesis revision.'
    );
    expect(workbench.tutorPreviews[0].systemPrompt).toContain(
      'Ask one targeted thesis question.'
    );
    expect(workbench.tutorPreviews[0].systemPrompt).toContain(
      'Thesis (40%)'
    );
    expect(workbench.tutorPreviews[0].systemPrompt).not.toContain('Evidence');
  });

  it('replays prompt previews from an assignment type AI snapshot', () => {
    const assignmentType = assignmentTypeAiSnapshotToWorkbenchInput({
      schemaVersion: 1,
      assignmentType: {
        id: 'type-1',
        title: 'Saved Thesis Essay',
        kind: 'essay',
        description: null,
        gradingAssistantVersion: 7,
        scoringScaleJson: { type: 'weighted_0_5', minScore: 0, maxScore: 5 },
        rubricJson: {
          categories: [
            {
              key: 'thesis',
              label: 'Thesis',
              description: 'Saved thesis standard.',
              weight: 1,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Use the saved rubric wording.',
        },
        gradingOutputSchemaJson: null,
        gradingCalibrationNotes: null,
        gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
      },
      modules: [
        {
          id: 'module-1',
          title: 'Saved module',
          position: 0,
          description: null,
          tutorInstructions: 'Saved module tutor instruction.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Saved instruction',
              position: 0,
              prompt: 'Saved prompt.',
              tutorInstructions: 'Saved instruction tutor instruction.',
              showChatButton: true,
              showNextButton: false,
              buttons: [],
            },
          ],
        },
      ],
    });

    const workbench = buildAssignmentTypeAiWorkbench({
      assignmentType,
      sampleEssay: 'Saved sample essay.',
      studentFirstName: 'Ava',
    });

    expect(workbench.assignmentType.title).toBe('Saved Thesis Essay');
    expect(workbench.assignmentType.gradingAssistantVersion).toBe(7);
    expect(workbench.gradingPreview.userPrompt).toContain(
      'Use the saved rubric wording.'
    );
    expect(workbench.tutorPreviews[0].systemPrompt).toContain(
      'Saved instruction tutor instruction.'
    );
  });
});

describe('compareAssignmentTypeAiWorkbenches', () => {
  it('summarizes grading, rubric, and tutor prompt changes', () => {
    const baseAssignmentType = {
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
            description: 'Defensible thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Grade thesis only.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask a thesis question.',
            },
          ],
        },
      ],
    };
    const current = buildAssignmentTypeAiWorkbench({
      assignmentType: {
        ...baseAssignmentType,
        rubricJson: {
          categories: [
            {
              key: 'thesis',
              label: 'Thesis',
              description: 'Defensible and specific thesis.',
              weight: 0.7,
            },
            {
              key: 'evidence',
              label: 'Evidence',
              description: 'Specific support.',
              weight: 0.3,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade thesis and evidence.',
        },
        gradingAssistantVersion: 2,
        assignmentModules: [
          {
            ...baseAssignmentType.assignmentModules[0],
            tutorInstructions: 'Coach thesis revision.',
          },
        ],
      },
    });
    const historical = buildAssignmentTypeAiWorkbench({
      assignmentType: baseAssignmentType,
    });

    const comparison = compareAssignmentTypeAiWorkbenches({
      current,
      baseline: historical,
    });

    expect(comparison.gradingPromptChanged).toBe(true);
    expect(comparison.rubricCategories.added).toEqual(['evidence']);
    expect(comparison.rubricCategories.changed).toEqual(['thesis']);
    expect(comparison.tutorPrompts.changed).toEqual([
      'Draft thesis - Revise thesis',
    ]);
    expect(comparison.hasChanges).toBe(true);
  });
});
