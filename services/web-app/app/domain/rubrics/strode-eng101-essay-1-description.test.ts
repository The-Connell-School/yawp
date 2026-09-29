import { describe, expect, test } from 'bun:test';
import { STARTER_RUBRICS } from './starter-rubrics';
import { computeWeightedBandPercentage } from '~/domain/grading/gradeMath';
import { formatRubricSchema, parseRubricSchema } from './rubric-schema';

describe('Strode ENG 101 Essay 1 rubric', () => {
  const schema = STARTER_RUBRICS.find(
    (r) => r.name === 'strode-eng101-essay-1-description'
  )!;

  test('has seven categories with equal weights and no grammar category', () => {
    const categories = schema.rubric.categories;
    expect(categories).toHaveLength(7);
    const keys = categories.map((c) => c.key);
    expect(keys).toEqual([
      'scene_selection',
      'detail_as_engine',
      'angle_of_vision',
      'parallel_structure',
      'language_and_style',
      'focus_and_restraint',
      'self_reflection_part_b',
    ]);
    // Equal weights
    const weights = new Set(categories.map((c) => c.weight));
    expect(weights.size).toBe(1);
    // No grammar category
    expect(keys.some((k) => /grammar|syntax/i.test(k))).toBe(false);
  });

  test('uses step-anchors 55/72/85/95 for every category', () => {
    for (const cat of schema.rubric.categories) {
      const values = (cat.scoreLabels ?? []).map((e) => e.value).sort((a, b) => a - b);
      expect(values).toEqual([55, 72, 85, 95]);
    }
  });

  test('band-scored mean of anchors: all 4s=95, all 3s=85, all 2s=72, mixed=84', () => {
    const cats = schema.rubric.categories.map((c) => ({ key: c.key, weight: c.weight, bands: c.bands }));
    const all = (score: number) =>
      Object.fromEntries(schema.rubric.categories.map((c) => [c.key, { score }]));
    expect(computeWeightedBandPercentage(all(95), cats)).toBe(95);
    expect(computeWeightedBandPercentage(all(85), cats)).toBe(85);
    expect(computeWeightedBandPercentage(all(72), cats)).toBe(72);
    // Mixed: 4,4,3,3,3,2,2 -> 95,95,85,85,85,72,72 => mean 84.14 -> 84
    const mixedScores = [95, 95, 85, 85, 85, 72, 72];
    const mixed = Object.fromEntries(
      schema.rubric.categories.map((c, i) => [c.key, { score: mixedScores[i] }])
    );
    expect(computeWeightedBandPercentage(mixed, cats)).toBe(84);
  });

  test('gradingInstructions has real newlines and no literal \\n', () => {
    const gi = schema.promptConfig.gradingInstructions ?? '';
    expect(gi.length).toBeGreaterThan(0);
    expect(gi.includes('\n')).toBe(true);
    expect(gi.includes('\\n')).toBe(false);
  });

  test('gradingInstructions contains required spec wording', () => {
    const gi = schema.promptConfig.gradingInstructions ?? '';
    expect(gi.includes('Never imply doubt about whether the observation happened')).toBe(true);
    expect(gi.includes('Never call a student')).toBe(true);
    expect(gi.includes('Mechanics come last')).toBe(true);
    expect(gi.includes('Describe the effect on the reader, not on the grade')).toBe(true);
  });

  test('schema parses and round-trips via formatRubricSchema', () => {
    const parsed = parseRubricSchema(schema);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const formatted = formatRubricSchema(parsed.schema);
    const reparsed = parseRubricSchema(JSON.parse(formatted));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.schema.name).toBe('strode-eng101-essay-1-description');
    expect(reparsed.schema.rubric.categories).toHaveLength(7);
  });
});

