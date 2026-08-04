import { describe, expect, test } from 'bun:test';
import {
  isCopyableRubric,
  listCopyableRubricSources,
} from './rubric-copy.server';

describe('rubric-copy.server', () => {
  test('isCopyableRubric is true when at least one category has a label', () => {
    expect(
      isCopyableRubric({
        categories: [
          { key: 'thesis', label: 'Thesis', weight: 1, description: '' },
        ],
      })
    ).toBe(true);
  });

  test('isCopyableRubric is false for empty or unlabeled categories', () => {
    expect(isCopyableRubric({ categories: [] })).toBe(false);
    expect(
      isCopyableRubric({
        categories: [{ key: '', label: '   ', weight: 0, description: '' }],
      })
    ).toBe(false);
  });

  test('listCopyableRubricSources excludes archived and current assignment types', async () => {
    const prisma = {
      assignmentType: {
        findMany: async ({ where }: { where?: { id?: { not?: string } } }) => {
          const rows = [
            {
              id: 'at-current',
              title: 'Current',
              scoringScaleJson: {
                type: 'weighted_1_5',
                minScore: 1,
                maxScore: 5,
              },
              rubricJson: {
                categories: [
                  {
                    key: 'thesis',
                    label: 'Thesis',
                    weight: 1,
                    description: '',
                  },
                ],
              },
            },
            {
              id: 'at-source',
              title: 'AP History',
              scoringScaleJson: {
                type: 'weighted_1_5',
                minScore: 1,
                maxScore: 5,
              },
              rubricJson: {
                categories: [
                  {
                    key: 'argument',
                    label: 'Argument',
                    weight: 0.5,
                    description: 'Clear claim.',
                  },
                  {
                    key: 'evidence',
                    label: 'Evidence',
                    weight: 0.5,
                    description: 'Uses sources well.',
                  },
                ],
              },
            },
            {
              id: 'at-empty',
              title: 'Empty rubric',
              scoringScaleJson: null,
              rubricJson: { categories: [] },
            },
          ];

          const excludeId = where?.id?.not;
          return excludeId ? rows.filter((row) => row.id !== excludeId) : rows;
        },
      },
    };

    const sources = await listCopyableRubricSources(prisma as never, {
      excludeAssignmentTypeId: 'at-current',
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.id).toBe('at-source');
    expect(sources[0]?.title).toBe('AP History');
    expect(sources[0]?.categoryCount).toBe(2);
    expect(sources[0]?.rubric.categories[0]?.label).toBe('Argument');
  });
});
