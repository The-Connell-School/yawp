import { describe, expect, test } from 'bun:test';

import {
  GALS_CLAIMS_ASSIGNMENT_TYPE_KIND,
  GALS_CLAIMS_CATEGORY_KEY,
  GALS_CLAIMS_PROMPT_CONFIG,
  GALS_CLAIMS_RUBRIC,
  GALS_CLAIMS_SCORE_LABELS,
  buildGalsClaimsGradingContext,
  extractGalsClaimSentence,
  isGalsClaimsAssignmentType,
} from './gals-claims-rubric';
import {
  isCategoryFeedbackEnabled,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('the GALS Claims rubric shape', () => {
  test('uses its own assignment type kind', () => {
    expect(GALS_CLAIMS_ASSIGNMENT_TYPE_KIND).toBe('gals_claims');
  });

  test('judges the my claim sentence on two bands only', () => {
    expect(GALS_CLAIMS_RUBRIC.categories).toHaveLength(1);
    expect(GALS_CLAIMS_RUBRIC.categories[0].key).toBe(GALS_CLAIMS_CATEGORY_KEY);
    expect(GALS_CLAIMS_SCORE_LABELS.map((entry) => entry.label)).toEqual([
      'Needs Some Improvement',
      'Excellent',
    ]);
  });

  test('stays soft: overall feedback only, no grammar markup', () => {
    expect(isCategoryFeedbackEnabled(GALS_CLAIMS_RUBRIC.categories[0])).toBe(
      false
    );
    expect(
      resolveGrammarHighlightingEnabled(GALS_CLAIMS_RUBRIC.categories)
    ).toBe(false);
  });

  test('embeds Brian’s two-band claim checks and student feedback rules', () => {
    const instructions = (
      GALS_CLAIMS_PROMPT_CONFIG.gradingInstructions ?? ''
    ).toLowerCase();

    expect(instructions).toContain('my claim');
    expect(instructions).toContain('excellent');
    expect(instructions).toContain('needs some improvement');
    expect(instructions).toContain('disagree');
    expect(instructions).toContain('never mention points');
    expect(instructions).toContain('never rewrite the claim');
  });
});

describe('extractGalsClaimSentence', () => {
  test('reads the sentence after a line-start My claim label', () => {
    expect(
      extractGalsClaimSentence(
        'Read the story.\nMy claim: The sisters fight because they want different things.'
      )
    ).toBe('The sisters fight because they want different things.');
  });

  test('returns null when the label is present but empty', () => {
    expect(extractGalsClaimSentence('My claim:\n\nReason: because.')).toBeNull();
  });

  test('finds an inline label inside a paragraph', () => {
    expect(
      extractGalsClaimSentence(
        'My claim: Family loyalty matters more than winning an argument.'
      )
    ).toBe('Family loyalty matters more than winning an argument.');
  });
});

describe('buildGalsClaimsGradingContext', () => {
  test('passes only the extracted claim to the grader', () => {
    expect(
      buildGalsClaimsGradingContext('My claim: The rain shows the mood is sad.')
    ).toContain('The rain shows the mood is sad.');
  });

  test('tells the grader when the claim is missing', () => {
    expect(buildGalsClaimsGradingContext('I am not sure yet.')).toContain(
      'did not include'
    );
  });
});

describe('isGalsClaimsAssignmentType', () => {
  test('matches the gals_claims kind only', () => {
    expect(isGalsClaimsAssignmentType({ kind: 'gals_claims' })).toBe(true);
    expect(isGalsClaimsAssignmentType({ kind: 'class_starter' })).toBe(false);
  });
});
