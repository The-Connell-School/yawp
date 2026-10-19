import { describe, expect, test } from 'bun:test';
import { validateRubricPromotion } from './rubric-promotion';
import thesisDrivenEssay from './library/thesis-driven-essay.json';
import { STARTER_RUBRICS } from './starter-rubrics';
import { parseRubricSchema } from './rubric-schema';
import { DEFAULT_SCORING_SCALE, RUBRIC_SCORING_SCALE_TYPES, parseScoringScale } from '../assignment-types/assignment-type-rubric.shared';
import { legacyRubricDisplayConfig } from '../grading/rubric-display';
import { ACT_WRITING_SCORING_TYPE } from '../grading/recorded-grade';
import { POINTS_SCALE_SCORING_TYPE, RUBRIC_POINTS_SCORING_TYPE } from '../grading/gradeMath';
const valid = () => ({ name: 'qa-rubric', title: 'QA rubric', scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 4, step: 1 }, rubric: { categories: [{ key: 'claim', label: 'Claim', description: 'A supported claim.', weight: 1 }] } });
const scoringTypeIssue = {
  path: '/scoringScale/type',
  message: 'Scoring type must be one of weighted_1_5, weighted_percent, act_writing_2_12, rubric_points, points_scale.',
};
describe('promotion rubric validation', () => {
  test('valid portable rubrics and starter definitions with known scale types retain category content', () => {
    for (const raw of [valid(), ...STARTER_RUBRICS]) {
      const result = validateRubricPromotion(raw);
      expect({ name: raw.name, ...result }).toMatchObject({ ok: true });
      if (result.ok) {
        expect(result.schema.name).toBe(raw.name);
        expect(result.schema.rubric.categories).toEqual(raw.rubric.categories);
      }
    }
  });
  test.each([
    { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
    { type: 'weighted_percent', minScore: 0, maxScore: 100 },
    { type: 'act_writing_2_12', minScore: 1, maxScore: 6, compositeMin: 2, compositeMax: 12 },
    { type: 'rubric_points', minScore: 0, maxScore: 100 },
    { type: 'points_scale', minScore: 0, maxScore: 3 },
  ])('accepts a valid $type scale', scoringScale => {
    const result = validateRubricPromotion({ ...valid(), scoringScale });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema.scoringScale).toMatchObject(scoringScale);
  });
  test.each(['foo', ''])('rejects scoring type %j at its field path', type => {
    expect(validateRubricPromotion({ ...valid(), scoringScale: { ...valid().scoringScale, type } }))
      .toEqual({ ok: false, issues: [scoringTypeIssue] });
  });
  test('omitting the scale or type preserves the weighted_1_5 default', () => {
    const { scoringScale, ...raw } = valid();
    const result = validateRubricPromotion(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema.scoringScale).toEqual({ type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 });
    const { type, ...withoutType } = scoringScale;
    expect(validateRubricPromotion({ ...raw, scoringScale: withoutType }))
      .toMatchObject({ ok: true, schema: { scoringScale: { ...withoutType, type: 'weighted_1_5' } } });
  });
  test('weighted_percent starter content remains readable and publishable', () => {
    const legacy = STARTER_RUBRICS.filter(raw => raw.scoringScale.type === 'weighted_percent');
    expect(legacy.length).toBeGreaterThan(0);
    for (const raw of legacy) {
      expect(parseRubricSchema(raw)).toMatchObject({ ok: true, schema: raw });
      expect(validateRubricPromotion(raw)).toMatchObject({ ok: true });
    }
    expect(parseScoringScale({ type: 'foo', minScore: 0, maxScore: 4 }).type).toBe('foo');
  });
  test('the real thesis-driven-essay library document validates without changing its scoring scale', () => {
    expect(validateRubricPromotion(thesisDrivenEssay)).toMatchObject({
      ok: true, schema: { scoringScale: thesisDrivenEssay.scoringScale, rubric: thesisDrivenEssay.rubric },
    });
  });
  test('every built-in assignment rubric and fallback scale uses a known scoring type', async () => {
    const allowed: readonly string[] = RUBRIC_SCORING_SCALE_TYPES;
    for (const type of [DEFAULT_SCORING_SCALE.type, legacyRubricDisplayConfig.scoringType,
      ACT_WRITING_SCORING_TYPE, POINTS_SCALE_SCORING_TYPE, RUBRIC_POINTS_SCORING_TYPE]) {
      expect(allowed).toContain(type);
    }
    const directory = new URL('../assignment-types/', import.meta.url).pathname;
    let count = 0;
    for (const file of new Bun.Glob('*{-rubric,-assignment-type}.ts').scanSync(directory)) {
      const exports = await import(`${directory}${file}`);
      for (const [name, value] of Object.entries(exports)) {
        if (!name.endsWith('_SCORING_SCALE')) continue;
        expect(allowed, `${file}: ${name}`).toContain((value as { type: string }).type);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(7);
  });
  test('rejects null categories, malformed types, empty categories and blank descriptions without throwing', () => {
    for (const categories of [[null], [{ ...valid().rubric.categories[0], key: 123 }], [], [{ ...valid().rubric.categories[0], description: ' ' }]]) {
      expect(validateRubricPromotion({ ...valid(), rubric: { categories } }).ok).toBe(false);
    }
  });
  test('rejects duplicate category identity, negative weights and zero total weight', () => {
    const c = valid().rubric.categories[0];
    for (const categories of [[c, c], [{ ...c, weight: -1 }], [{ ...c, weight: 0 }]]) {
      expect(validateRubricPromotion({ ...valid(), rubric: { categories } }).ok).toBe(false);
    }
  });
  test('does not normalize invalid steps or accept unreachable full marks', () => {
    for (const scale of [{ step: 0 }, { step: 1.5 }, { maxScore: 3, step: 2 }, { minScore: 4 }, { maxScore: Infinity }, { maxScore: '5' }]) {
      expect(validateRubricPromotion({ ...valid(), scoringScale: { ...valid().scoringScale, ...scale } }).ok).toBe(false);
    }
  });
  test('rejects malformed or conflicting category labels and bands', () => {
    for (const options of [
      { scoreLabels: [{ value: 7, label: 'Outside scale' }] },
      { scoreLabels: [{ value: 1, label: 'One' }, { value: 1, label: 'Duplicate' }] },
      { bands: [{ min: 3, max: 1, label: 'Backwards', description: 'Invalid' }] },
      { bands: [{ min: 0, max: 2, label: 'First', description: 'One' }, { min: 2, max: 4, label: 'Second', description: 'Two' }] },
      { grammarHighlighting: 'false' },
    ]) expect(validateRubricPromotion({ ...valid(), rubric: { categories: [{ ...valid().rubric.categories[0], ...options }] } }).ok).toBe(false);
  });
  test('rejects unknown fields that the legacy parser would silently discard', () => {
    for (const raw of [{ ...valid(), unexpected: true }, { ...valid(), promptConfig: { gradingInstruction: 'misspelled' } }]) {
      expect(validateRubricPromotion(raw).ok).toBe(false);
    }
  });
  test('returns actionable field paths and does not mutate input', () => {
    const raw = valid(); const original = JSON.stringify(raw);
    expect(validateRubricPromotion(raw).ok).toBe(true); expect(JSON.stringify(raw)).toBe(original);
    const result = validateRubricPromotion({ ...raw, rubric: { categories: [{ ...raw.rubric.categories[0], weight: -1 }] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(issue => issue.path === '/rubric/categories/0/weight')).toBe(true);
  });
  test('accepts a top-level scoringMode from the rubric document shape (#411)', () => {
    const result = validateRubricPromotion({ ...valid(), scoringMode: 'holistic_tier' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema.scoringMode).toBe('holistic_tier');
  });

  test('accepts outputSchema.display and rejects unknown display keys', () => {
    const ok = validateRubricPromotion({
      ...valid(),
      outputSchema: {
        schemaVersion: 1,
        display: {
          grammarHighlight: 'highlight',
          grammarMaxDeductionPct: 10,
          teacherNotes: true,
        },
      },
    });
    expect(ok.ok).toBe(true);

    const bad = validateRubricPromotion({
      ...valid(),
      outputSchema: {
        display: { unexpected: true },
      },
    });
    expect(bad.ok).toBe(false);
  });
});
