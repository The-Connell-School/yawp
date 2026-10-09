import { describe, expect, mock, test } from 'bun:test';

const prisma = { assignment: { findUnique: mock() }, assignmentType: { findUnique: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));
const { resolveAssignmentTypeGradingConfig } = await import('./assignment-type-grading-config.server');

describe('QA #431 legacy pin', () => {
  test('per-type assignment pinned to a revision captured BEFORE the admin override was pasted', async () => {
    const typeId = 'hornbuckle-legacy';
    const rubricName = `assignment-type:${typeId}`;
    const rubric = { categories: [{ key: 'thesis', label: 'Thesis', description: 'R.', weight: 1 }] };
    const scale = { type: 'points_scale', minScore: 1, maxScore: 4, step: 1 };
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: typeId, title: 'H', kind: 'essay', scoringScaleJson: scale, rubricJson: rubric,
      gradingPromptConfigJson: { gradingInstructions: 'Original placeholder GA.', gradingInstructionsOverride: '10/5 pasted GA (live today).' },
      gradingOutputSchemaJson: null, gradingCalibrationNotes: null, gradingAssistantVersion: 2,
      gradingAssistantSourceTemplateId: null, gradingAssistantSourceTemplateSlug: null, rubric: null,
    });
    prisma.assignment.findUnique.mockResolvedValue({
      assignmentTypeId: typeId, rubricTotalPoints: null, gradingMode: 'bands',
      rubricRevision: { id: 'r1', version: 1, rubricName, sourceContentId: null, schemaJson: {
        name: rubricName, title: 'H', scoringScale: scale, rubric,
        promptConfig: { gradingInstructions: 'Original placeholder GA.' }, outputSchema: {}, calibrationNotes: null,
      } },
    });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: typeId, assignmentId: 'old-essay' });
    expect((config.instructions as { gradingInstructions?: string }).gradingInstructions).toBe('10/5 pasted GA (live today).');
  });
});
