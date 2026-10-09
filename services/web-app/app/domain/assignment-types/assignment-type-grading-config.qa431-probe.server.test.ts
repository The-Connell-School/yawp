import { describe, expect, mock, test } from 'bun:test';

const prisma = { assignment: { findUnique: mock() }, assignmentType: { findUnique: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));
const { resolveAssignmentTypeGradingConfig } = await import('./assignment-type-grading-config.server');
const typeId = 'h';
const rubricName = `assignment-type:${typeId}`;
const rubric = { categories: [{ key: 'thesis', label: 'Thesis', description: 'R.', weight: 1 }] };
const scale = { type: 'points_scale', minScore: 1, maxScore: 4, step: 1 };
async function run(livePrompt: Record<string, unknown>, snapPrompt: Record<string, unknown>) {
  prisma.assignmentType.findUnique.mockResolvedValue({
    id: typeId, title: 'H', kind: 'essay', scoringScaleJson: scale, rubricJson: rubric,
    gradingPromptConfigJson: livePrompt, gradingOutputSchemaJson: null, gradingCalibrationNotes: null, gradingAssistantVersion: 3,
    gradingAssistantSourceTemplateId: null, gradingAssistantSourceTemplateSlug: null, rubric: null,
  });
  prisma.assignment.findUnique.mockResolvedValue({
    assignmentTypeId: typeId, rubricTotalPoints: null, gradingMode: 'bands',
    rubricRevision: { id: 'r', version: 1, rubricName, sourceContentId: null, schemaJson: {
      name: rubricName, title: 'H', scoringScale: scale, rubric,
      promptConfig: snapPrompt, outputSchema: {}, calibrationNotes: null,
    } },
  });
  return ((await resolveAssignmentTypeGradingConfig({ assignmentTypeId: typeId, assignmentId: 'a' })).instructions as { gradingInstructions?: string }).gradingInstructions;
}

describe('probe: deploy-time, no publish (pre-PR answer = live override or base GA)', () => {
  test('A: override re-pasted after pin (snapshot v1, live v2) -> pre-PR v2', async () => {
    expect(await run({ gradingInstructions: 'base', gradingInstructionsOverride: 'paste v2' }, { gradingInstructions: 'base', gradingInstructionsOverride: 'paste v1' })).toBe('paste v2');
  });
  test('B: override removed in admin after pin (snapshot v1, live none) -> pre-PR base', async () => {
    expect(await run({ gradingInstructions: 'base' }, { gradingInstructions: 'base', gradingInstructionsOverride: 'paste v1' })).toBe('base');
  });
});

describe('probe: after a GA publish (pre-publish answer = live override at publish time = fallback)', () => {
  test('C: pin snapshot v1, live was v2 at publish -> should stay v2', async () => {
    expect(await run({ gradingInstructions: 'v4', gradingInstructionsOverride: null, gradingInstructionsOverridePinnedFallback: 'paste v2' }, { gradingInstructions: 'base', gradingInstructionsOverride: 'paste v1' })).toBe('paste v2');
  });
  test('D: legacy pin (no key) -> fallback', async () => {
    expect(await run({ gradingInstructions: 'v4', gradingInstructionsOverride: null, gradingInstructionsOverridePinnedFallback: 'paste v2' }, { gradingInstructions: 'base' })).toBe('paste v2');
  });
  test('E: post-publish pin (null) -> v4', async () => {
    expect(await run({ gradingInstructions: 'v4', gradingInstructionsOverride: null, gradingInstructionsOverridePinnedFallback: 'paste v2' }, { gradingInstructions: 'v4', gradingInstructionsOverride: null, gradingInstructionsOverridePinnedFallback: 'paste v2' })).toBe('v4');
  });
});
