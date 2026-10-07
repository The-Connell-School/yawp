import { describe, expect, test } from 'bun:test';
import authored from '~/domain/rubrics/library/daily-pages-engagement.json';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import type { ResolvedAssignmentTypeGradingConfig } from './assignment-type-grading-config.server';
import { scaleDailyPagesForAssignment } from './daily-pages-assignment-points';
import { dailyPagesEngagementTierBands } from './daily-pages-engagement-tier-bands';

function config(): ResolvedAssignmentTypeGradingConfig {
  return {
    source: 'assignment-type',
    rubricName: authored.name,
    rubricIncomplete: false,
    assignmentTypeId: 'daily',
    assignmentTypeKind: 'daily_pages',
    assignmentTypeTitle: 'Daily Pages',
    label: 'Daily Pages',
    version: 7,
    scoringType: authored.scoringScale.type,
    minScore: 0,
    maxScore: 100,
    step: 1,
    rubricCategories: structuredClone(authored.rubric.categories),
    instructions: {
      mode: 'unified',
      gradingInstructions: authored.promptConfig.gradingInstructions,
    },
    rubricSnapshot: {
      categories: structuredClone(authored.rubric.categories),
      minScore: 0,
      maxScore: 100,
      step: 1,
      scoringType: 'rubric_points',
    },
    promptConfigSnapshot: structuredClone(authored.promptConfig),
    outputSchemaSnapshot: { ...authored.outputSchema },
    calibrationNotes: null,
    sourceTemplateId: null,
    sourceTemplateSlug: null,
  };
}

describe('Daily Pages assignment points', () => {
  test('the library opts into v2 scaling', () => {
    expect(authored.outputSchema).toHaveProperty(
      'assignmentPointScaling',
      'daily_pages_engagement_v2'
    );
  });

  test('scales bands to the teacher point total without touching prompt copy', () => {
    const original = config();
    const before = JSON.stringify(original);
    const scaled = scaleDailyPagesForAssignment(original, 30);
    expect(scaled.maxScore).toBe(30);
    expect(scaled.rubricSnapshot.maxScore).toBe(30);
    expect(scaled.instructions).toEqual(original.instructions);
    expect(scaled.promptConfigSnapshot).toEqual(original.promptConfigSnapshot);
    expect(JSON.stringify(original)).toBe(before);

    const expected = dailyPagesEngagementTierBands(30);
    expect(
      scaled.rubricCategories[0].bands?.map((band) => [
        band.min,
        band.max,
        band.label,
      ])
    ).toEqual(
      expected.map((band) => [band.min, band.max, band.label])
    );
    expect(scaled.rubricCategories[0].description).toContain(
      'This assignment is worth 30 points'
    );
  });

  test('managed prompts include scaled band context', () => {
    const original = config();
    original.promptTemplate = {
      systemMessage: 'Managed system.',
      userMessage: '{{rubric}}\n{{document}}',
    };
    const scaled = scaleDailyPagesForAssignment(original, 10);
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: scaled,
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'Synthetic writing.',
    });
    expect(invocation.system).toContain('Managed system.');
    expect(invocation.userMessage).toContain('Excellent');
    expect(invocation.userMessage).toContain('10');
  });

  test('rejects totals below 5 via no-op scale (caller validates separately)', () => {
    for (const total of [1, 2, 3, 4]) {
      const original = config();
      expect(scaleDailyPagesForAssignment(original, total)).toBe(original);
    }
  });

  test('all supported totals from 5 up have integer, nonoverlapping bands', () => {
    for (let total = 5; total <= 200; total++) {
      const category = scaleDailyPagesForAssignment(
        config(),
        total
      ).rubricCategories[0];
      let previousMax = -1;
      for (const band of category.bands!) {
        expect(Number.isInteger(band.min) && Number.isInteger(band.max)).toBe(
          true
        );
        expect(band.min).toBeGreaterThan(previousMax);
        expect(band.max).toBeGreaterThanOrEqual(band.min);
        expect(band.max).toBeLessThanOrEqual(total);
        previousMax = band.max;
      }
    }
  });

  test('old pins, unrelated rubrics, and legacy fallbacks stay unchanged', () => {
    const noScalingOutput = { responseShape: 'categories_overall_comment' };
    const cases = [
      {
        rubricName: 'thesis-driven-essay',
        outputSchemaSnapshot: noScalingOutput,
      },
      {
        rubricName: 'daily-pages-reflection',
        outputSchemaSnapshot: noScalingOutput,
      },
      {
        rubricName: 'daily-pages-short-form',
        outputSchemaSnapshot: noScalingOutput,
      },
      {
        source: 'default' as const,
        rubricName: 'thesis-driven-essay',
        outputSchemaSnapshot: noScalingOutput,
      },
      { scoringType: 'weighted_1_5', outputSchemaSnapshot: noScalingOutput },
      {
        rubricName: 'thesis-driven-essay',
        outputSchemaSnapshot: noScalingOutput,
        rubricCategories: [
          { ...config().rubricCategories[0], key: 'other_category' },
        ],
      },
    ];
    for (const change of cases) {
      const original = { ...config(), ...change } as ResolvedAssignmentTypeGradingConfig;
      expect(scaleDailyPagesForAssignment(original, 30)).toBe(original);
    }
  });

  test.each([undefined, null, 0, -1, 1.5, Number.NaN, 100])(
    'ignores absent, invalid, or reference total %s',
    (total) => {
      const original = config();
      expect(scaleDailyPagesForAssignment(original, total)).toBe(original);
    }
  );
});
