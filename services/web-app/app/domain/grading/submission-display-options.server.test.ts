import { describe, expect, test } from 'bun:test';
import {
  grammarHighlightingEnabledForDisplay,
  readDisplaySnapshotFromAiMeta,
  resolveDisplayForSubmissionView,
} from './submission-display-options.server';
import type { RubricDisplayConfig } from './rubric-display';

const baseConfig: RubricDisplayConfig = {
  categories: [
    {
      key: 'quality',
      label: 'Quality',
      description: 'Overall quality.',
      weight: 1,
      feedbackEnabled: true,
    },
  ],
  minScore: 1,
  maxScore: 5,
  step: 1,
  scoringType: 'weighted_1_5',
};

describe('submission-display-options.server', () => {
  test('reads displaySnapshot from aiMeta', () => {
    expect(
      readDisplaySnapshotFromAiMeta({
        displaySnapshot: {
          showCategories: false,
          perCategoryComments: false,
          grammarHighlight: 'highlight',
          teacherNotes: true,
        },
      })
    ).toMatchObject({ showCategories: false, grammarHighlight: 'highlight' });
  });

  test('resolveDisplayForSubmissionView prefers grading-time snapshot', () => {
    const resolved = resolveDisplayForSubmissionView({
      rubricConfig: baseConfig,
      outputSchema: {
        display: { showCategories: true, perCategoryComments: true },
      },
      aiMeta: {
        displaySnapshot: {
          showCategories: false,
          perCategoryComments: false,
          grammarHighlight: 'off',
          teacherNotes: true,
        },
      },
    });
    expect(resolved.display?.showCategories).toBe(false);
    expect(grammarHighlightingEnabledForDisplay(resolved.display!)).toBe(false);
  });
});
