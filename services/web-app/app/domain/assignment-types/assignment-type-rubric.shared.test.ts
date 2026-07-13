import { describe, expect, test } from 'bun:test';
import { prepareRubricForSave } from './assignment-type-rubric.shared';

describe('prepareRubricForSave', () => {
  test('preserves established category keys when their labels use different words', () => {
    expect(
      prepareRubricForSave({
        categories: [
          {
            key: 'thesis_and_content',
            label: 'Thesis/Content',
            weight: 1,
            description: 'A clear thesis.',
          },
        ],
      })
    ).toEqual({
      categories: [
        {
          key: 'thesis_and_content',
          label: 'Thesis/Content',
          weight: 1,
          description: 'A clear thesis.',
        },
      ],
    });
  });

  test('creates a key from the label for a new category', () => {
    expect(
      prepareRubricForSave({
        categories: [
          {
            key: '',
            label: 'Claim Strength',
            weight: 1,
            description: 'A defensible claim.',
          },
        ],
      }).categories[0]?.key
    ).toBe('claim_strength');
  });
});
