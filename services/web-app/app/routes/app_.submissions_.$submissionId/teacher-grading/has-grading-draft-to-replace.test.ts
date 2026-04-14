import { describe, expect, test } from 'bun:test';
import { rubricCategories } from '~/domain/grading/rubric';
import { hasGradingDraftToReplace } from './has-grading-draft-to-replace';

const emptyRubric = () =>
  rubricCategories.reduce<Record<string, { score: number; comment: string }>>(
    (acc, item) => {
      acc[item.key] = { score: 0, comment: '' };
      return acc;
    },
    {}
  );

describe('hasGradingDraftToReplace', () => {
  test('is false when everything is empty', () => {
    expect(
      hasGradingDraftToReplace(emptyRubric(), '', '', 0)
    ).toBe(false);
  });

  test('is true when overall comment has text', () => {
    expect(
      hasGradingDraftToReplace(emptyRubric(), 'hi', '', 0)
    ).toBe(true);
  });

  test('is true when percentage is set', () => {
    expect(
      hasGradingDraftToReplace(emptyRubric(), '', '42', 0)
    ).toBe(true);
  });

  test('is true when a rubric score is set', () => {
    const r = emptyRubric();
    r.thesis_and_content = { score: 3, comment: '' };
    expect(hasGradingDraftToReplace(r, '', '', 0)).toBe(true);
  });

  test('is true when a rubric comment exists without score', () => {
    const r = emptyRubric();
    r.thesis_and_content = { score: 0, comment: 'note' };
    expect(hasGradingDraftToReplace(r, '', '', 0)).toBe(true);
  });

  test('is true when grammar issues exist', () => {
    expect(hasGradingDraftToReplace(emptyRubric(), '', '', 1)).toBe(true);
  });
});
