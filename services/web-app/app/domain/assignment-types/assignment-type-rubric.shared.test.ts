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

  test('keeps the score words, bands and feedback and grammar settings on every category', () => {
    const scoreLabels = [
      { value: 0, label: 'Absent' },
      { value: 3, label: 'All in' },
    ];
    const bands = [
      { min: 0, max: 0, label: 'No evidence', description: 'Nothing here.' },
      { min: 1, max: 100, label: 'Explains it', description: 'It holds up.' },
    ];
    expect(
      prepareRubricForSave({
        categories: [
          {
            key: 'engagement',
            label: 'Engagement',
            weight: 1,
            description: 'Showed up.',
            scoreLabels,
            feedbackEnabled: false,
            grammarHighlighting: false,
          },
          {
            key: 'understanding',
            label: 'Understanding',
            weight: 1,
            description: 'Explains it.',
            bands,
            grammarHighlighting: true,
          },
        ],
      })
    ).toEqual({
      categories: [
        {
          key: 'engagement',
          label: 'Engagement',
          weight: 1,
          description: 'Showed up.',
          scoreLabels,
          feedbackEnabled: false,
          grammarHighlighting: false,
        },
        {
          key: 'understanding',
          label: 'Understanding',
          weight: 1,
          description: 'Explains it.',
          bands,
          grammarHighlighting: true,
        },
      ],
    });
  });
});
