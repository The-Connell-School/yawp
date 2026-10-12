import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

const rubricRelease = { findMany: mock(), findUnique: mock() };
const rubric = { findMany: mock(), findFirst: mock() };
const assignmentType = { findMany: mock() };

mock.module('~/utils/db.server', () => ({
  prisma: { rubricRelease, rubric, assignmentType },
}));

const {
  listReleasedRubricsForAdminPicker,
  resolveAdminRubricPickerSelection,
} = await import('./admin-rubric-picker.server');

const db = { rubricRelease, rubric, assignmentType };

describe('listReleasedRubricsForAdminPicker', () => {
  beforeEach(() => {
    rubricRelease.findMany.mockReset();
    rubric.findMany.mockReset();
    assignmentType.findMany.mockReset();
  });

  test('lists only released, non-archived library rubrics with revision JSON', async () => {
    const revisionJson = {
      name: 'daily-pages-engagement',
      title: 'Daily Pages engagement',
      scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 100 },
      rubric: {
        categories: [
          {
            key: 'engagement_with_prompt',
            label: 'Engagement',
            description: 'Engagement',
            weight: 1,
          },
        ],
      },
      promptConfig: { gradingInstructions: 'Grade engagement.' },
      outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
      calibrationNotes: null,
    };
    rubricRelease.findMany.mockResolvedValue([
      {
        catalogKey: 'daily-pages-engagement',
        rubricRevision: { schemaJson: revisionJson },
      },
      {
        catalogKey: 'daily-pages-reflection',
        rubricRevision: { schemaJson: { ...revisionJson, name: 'daily-pages-reflection' } },
      },
      {
        catalogKey: 'unreleased-only',
        rubricRevision: { schemaJson: revisionJson },
      },
    ]);
    rubric.findMany.mockResolvedValue([
      {
        id: 'rubric-live',
        name: 'daily-pages-engagement',
        title: 'Daily Pages engagement',
      },
    ]);
    assignmentType.findMany.mockResolvedValue([]);

    const options = await listReleasedRubricsForAdminPicker(db as never);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: 'rubric-live',
      catalogKey: 'daily-pages-engagement',
      source: 'library',
    });
    expect(options[0]?.json).toContain('daily-pages-engagement');
  });

  test('includes released per-type catalog entries', async () => {
    const typeId = 'atype123';
    const catalogKey = `assignment-type:${typeId}`;
    const revisionJson = {
      name: catalogKey,
      title: 'Custom type rubric',
      scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 5, step: 1 },
      rubric: {
        categories: [
          { key: 'idea', label: 'Idea', description: 'Idea', weight: 1 },
        ],
      },
      promptConfig: {},
      outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
      calibrationNotes: null,
    };
    rubricRelease.findMany.mockResolvedValue([
      { catalogKey, rubricRevision: { schemaJson: revisionJson } },
    ]);
    rubric.findMany.mockResolvedValue([]);
    assignmentType.findMany.mockResolvedValue([
      {
        id: typeId,
        title: 'Thesis lab',
        rubricJson: { categories: [] },
        scoringScaleJson: { minScore: 0, maxScore: 5 },
      },
    ]);

    const options = await listReleasedRubricsForAdminPicker(db as never);
    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe(catalogKey);
    expect(options[0]?.source).toBe('assignment-type');
  });
});

describe('resolveAdminRubricPickerSelection', () => {
  beforeEach(() => {
    rubricRelease.findUnique.mockReset();
    rubric.findFirst.mockReset();
  });

  test('rejects library rubrics without a release', async () => {
    rubric.findFirst.mockResolvedValue({ id: 'r1', name: 'draft-only' });
    rubricRelease.findUnique.mockResolvedValue(null);
    await expect(resolveAdminRubricPickerSelection('r1', db as never)).rejects.toMatchObject({
      status: 400,
    });
  });

  test('accepts released library rubrics by id', async () => {
    rubric.findFirst.mockResolvedValue({ id: 'r1', name: 'daily-pages-engagement' });
    rubricRelease.findUnique.mockResolvedValue({ catalogKey: 'daily-pages-engagement' });
    await expect(resolveAdminRubricPickerSelection('r1', db as never)).resolves.toEqual({
      kind: 'library',
      rubricId: 'r1',
      catalogKey: 'daily-pages-engagement',
    });
  });

  test('maps released per-type keys to column snapshots', async () => {
    const catalogKey = `assignment-type:${randomUUID()}`;
    rubricRelease.findUnique.mockResolvedValue({
      rubricRevision: {
        schemaJson: {
          scoringScale: { minScore: 0, maxScore: 4 },
          rubric: { categories: [] },
          promptConfig: { gradingInstructionsOverride: 'keep' },
          outputSchema: { schemaVersion: 1 },
          calibrationNotes: 'notes',
        },
      },
    });
    const resolved = await resolveAdminRubricPickerSelection(catalogKey, db as never);
    expect(resolved.kind).toBe('per-type');
    if (resolved.kind === 'per-type') {
      expect(resolved.assignmentTypeData.rubricId).toBeNull();
      expect(resolved.assignmentTypeData.gradingCalibrationNotes).toBe('notes');
    }
  });
});
