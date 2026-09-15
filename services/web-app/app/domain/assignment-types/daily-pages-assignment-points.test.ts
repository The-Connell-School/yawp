import { describe, expect, test } from 'bun:test';
import authored from '~/domain/rubrics/library/daily-pages-engagement.json';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import type { ResolvedAssignmentTypeGradingConfig } from './assignment-type-grading-config.server';
import { scaleDailyPagesForAssignment } from './daily-pages-assignment-points';

function config(): ResolvedAssignmentTypeGradingConfig {
  return {
    source: 'assignment-type', rubricName: authored.name,
    rubricIncomplete: false, assignmentTypeId: 'daily', assignmentTypeKind: 'daily_pages',
    assignmentTypeTitle: 'Daily Pages', label: 'Daily Pages', version: 7,
    scoringType: authored.scoringScale.type, minScore: 0, maxScore: 30, step: 1,
    rubricCategories: structuredClone(authored.rubric.categories),
    instructions: { mode: 'unified', gradingInstructions: authored.promptConfig.gradingInstructions },
    rubricSnapshot: { categories: structuredClone(authored.rubric.categories), minScore: 0, maxScore: 30, step: 1, scoringType: 'rubric_points' },
    promptConfigSnapshot: structuredClone(authored.promptConfig),
    outputSchemaSnapshot: { ...authored.outputSchema, assignmentPointScaling: 'daily_pages_engagement_v1' },
    calibrationNotes: null, sourceTemplateId: null, sourceTemplateSlug: null,
  };
}

describe('Daily Pages assignment points', () => {
  test('the revised library explicitly opts in; instructions stay source-exact', () => {
    expect(authored.outputSchema).toHaveProperty('assignmentPointScaling', 'daily_pages_engagement_v1');
    const original = config();
    const before = JSON.stringify(original);
    const scaled = scaleDailyPagesForAssignment(original, 90);
    expect(scaled.maxScore).toBe(90);
    expect(scaled.rubricSnapshot.maxScore).toBe(90);
    expect(scaled.instructions).toEqual(original.instructions);
    expect(scaled.promptConfigSnapshot).toEqual(original.promptConfigSnapshot);
    expect(JSON.stringify(original)).toBe(before);
    expect(scaled.rubricCategories[0].scoreLabels?.map(entry => entry.value)).toEqual([0, 30, 60, 90]);
    expect(scaled.rubricCategories[0].bands?.map(band => [band.min, band.max])).toEqual([[0, 0], [21, 39], [51, 69], [84, 90]]);
  });

  test('managed prompts contain effective bands, anchors and the meaning of source-scale examples', () => {
    const original = config();
    original.promptTemplate = { systemMessage: 'Managed system.', userMessage: '{{rubric}}\n{{document}}' };
    const scaled = scaleDailyPagesForAssignment(original, 10);
    const invocation = compileGradingAssistantInvocation({ gradingConfig: scaled, studentFirstName: 'Jordan', strictnessLevel: 'intermediate', documentText: 'Synthetic writing.' });
    expect(invocation.system).toContain('"score": 0-10');
    expect(invocation.userMessage).toContain('6-7 SHOWED UP');
    expect(invocation.userMessage).toContain('Configured anchor: 7/10');
    expect(invocation.userMessage).toContain('Original 30-point guidance');
    expect(invocation.userMessage).toContain('multiply by 10/30');
  });

  test.each([1, 2])('a %i-point total merges indistinguishable submitted tiers and keeps zero for no submission', (total) => {
    const scaled = scaleDailyPagesForAssignment(config(), total);
    const category = scaled.rubricCategories[0];
    expect(category.bands?.map(band => [band.min, band.max, band.label])).toEqual(total === 1
      ? [[0, 0, 'NOT HANDED IN'], [1, 1, 'HARDLY THERE / SHOWED UP / ALL IN']]
      : [[0, 0, 'NOT HANDED IN'], [1, 1, 'HARDLY THERE / SHOWED UP'], [2, 2, 'ALL IN']]);
    expect(category.description).toContain('cannot distinguish all four tiers');
    expect(category.scoreLabels?.map(entry => entry.value)).toEqual(total === 1 ? [0, 1] : [0, 1, 2]);
  });

  test('all supported small and ordinary totals have integer, nonoverlapping bands and anchors within their bands', () => {
    for (let total = 1; total <= 1000; total++) {
      const category = scaleDailyPagesForAssignment(config(), total).rubricCategories[0];
      let previousMax = -1;
      for (const band of category.bands!) {
        expect(Number.isInteger(band.min) && Number.isInteger(band.max)).toBe(true);
        expect(band.min).toBeGreaterThan(previousMax);
        expect(band.max).toBeGreaterThanOrEqual(band.min);
        expect(band.max).toBeLessThanOrEqual(total);
        previousMax = band.max;
      }
      for (const anchor of category.scoreLabels!) {
        expect(category.bands?.some(band => anchor.value >= band.min && anchor.value <= band.max && band.label.includes(anchor.label))).toBe(true);
      }
    }
  });

  test('old pins, unrelated rubrics, legacy fallbacks and existing run snapshots stay unchanged', () => {
    const cases = [
      { outputSchemaSnapshot: {} },
      { rubricName: 'daily-pages-reflection' },
      { rubricName: undefined },
      { source: 'default' as const },
      { step: 10 },
      { minScore: 1 },
      { maxScore: 90 },
      { scoringType: 'weighted_1_5' },
      { rubricCategories: [{ ...config().rubricCategories[0], bands: undefined }] },
    ];
    for (const change of cases) {
      const original = { ...config(), ...change } as ResolvedAssignmentTypeGradingConfig;
      expect(scaleDailyPagesForAssignment(original, 90)).toBe(original);
    }
    const priorSnapshot = structuredClone(config().rubricSnapshot);
    scaleDailyPagesForAssignment(config(), 90);
    expect(priorSnapshot.maxScore).toBe(30);
  });

  test.each([undefined, null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 30])('ignores absent, invalid or unchanged total %s', (total) => {
    const original = config();
    expect(scaleDailyPagesForAssignment(original, total)).toBe(original);
  });
});
