import { describe, expect, test } from 'bun:test';
import { validateRubricPromotion } from './rubric-promotion';
import { STARTER_RUBRICS } from './starter-rubrics';
const valid = () => ({ name: 'qa-rubric', title: 'QA rubric', scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 4, step: 1 }, rubric: { categories: [{ key: 'claim', label: 'Claim', description: 'A supported claim.', weight: 1 }] } });
describe('promotion rubric validation', () => {
  test('valid portable rubrics and all current starter definitions retain category content', () => {
    for (const raw of [valid(), ...STARTER_RUBRICS]) {
      const result = validateRubricPromotion(raw);
      expect({ name: raw.name, ...result }).toMatchObject({ ok: true });
      if (result.ok) {
        expect(result.schema.name).toBe(raw.name);
        expect(result.schema.rubric.categories).toEqual(raw.rubric.categories);
      }
    }
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
});
