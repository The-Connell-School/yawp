import { describe, expect, test } from 'bun:test';

import { parseAssignmentTypeRubricConfig } from './assignment-type-rubric-config';
import { STRODE_AUTOBIOGRAPHY_GRADING_INSTRUCTIONS } from './strode-autobiography-grading-instructions';
import {
  STRODE_AUTOBIOGRAPHY_ASSIGNMENT_TYPE_KIND,
  STRODE_AUTOBIOGRAPHY_RUBRIC,
  buildStrodeAutobiographyRubricSchema,
  isStrodeAutobiographyAssignmentType,
} from './strode-autobiography-rubric';
import {
  STRODE_AUTOBIOGRAPHY_ANCHORS,
  applyStrodeAutobiographySummaryCap,
  computeStrodeAutobiographyFinalPercent,
  computeStrodeAutobiographyMeanAnchor,
  strodeEng101LetterFromPercent,
} from './strode-autobiography-scoring';
import { STARTER_RUBRICS } from '~/domain/rubrics/starter-rubrics';
import { formatRubricSchema, parseRubricSchema } from '~/domain/rubrics/rubric-schema';

function scoresFromAnchors(anchors: number[]) {
  const keys = STRODE_AUTOBIOGRAPHY_RUBRIC.categories.map((c) => c.key);
  return Object.fromEntries(
    keys.map((key, index) => [key, { score: anchors[index] ?? anchors[0] }])
  );
}

describe('Strode Autobiography rubric shape', () => {
  test('uses strode_autobiography kind and five equal categories in Tim order', () => {
    expect(STRODE_AUTOBIOGRAPHY_ASSIGNMENT_TYPE_KIND).toBe('strode_autobiography');
    expect(STRODE_AUTOBIOGRAPHY_RUBRIC.categories.map((c) => c.key)).toEqual([
      'plot',
      'character',
      'theme',
      'setting_scene_vs_summary',
      'open_form_tools',
    ]);
    const weights = new Set(STRODE_AUTOBIOGRAPHY_RUBRIC.categories.map((c) => c.weight));
    expect(weights).toEqual(new Set([1]));
  });

  test('uses step-anchors 55/72/85/95 on every category', () => {
    for (const category of STRODE_AUTOBIOGRAPHY_RUBRIC.categories) {
      const values = (category.scoreLabels ?? []).map((entry) => entry.value).sort((a, b) => a - b);
      expect(values).toEqual([...STRODE_AUTOBIOGRAPHY_ANCHORS].sort((a, b) => a - b));
    }
  });

  test('grading instructions include four guards and cap rules', () => {
    const gi = STRODE_AUTOBIOGRAPHY_GRADING_INSTRUCTIONS;
    expect(gi.includes('FOUR GUARDS')).toBe(true);
    expect(gi.includes('THERE IS NO THESIS')).toBe(true);
    expect(gi.includes('ASSUME THE STORY IS TRUE')).toBe(true);
    expect(gi.includes('HANDLE IT WITH CARE')).toBe(true);
    expect(gi.includes('cannot exceed 64')).toBe(true);
    expect(gi.includes('cannot exceed 74')).toBe(true);
    expect(gi.includes('Mechanics come last')).toBe(true);
  });

  test('library schema is registered in starter rubrics and round-trips', () => {
    const schema = STARTER_RUBRICS.find(
      (r) => r.name === 'strode-eng101-essay-2-autobiography'
    );
    expect(schema).toBeDefined();
    const parsed = parseRubricSchema(buildStrodeAutobiographyRubricSchema());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const formatted = formatRubricSchema(parsed.schema);
    const reparsed = parseRubricSchema(JSON.parse(formatted));
    expect(reparsed.ok).toBe(true);
  });
});

describe('Strode Autobiography scoring', () => {
  test('mean of anchors: all 95 → 95, all 85 → 85, all 72 → 72, all 55 → 55', () => {
    for (const anchor of STRODE_AUTOBIOGRAPHY_ANCHORS) {
      const scores = scoresFromAnchors(Array(5).fill(anchor));
      expect(computeStrodeAutobiographyMeanAnchor(scores)).toBe(anchor);
    }
  });

  test('pure summary cap limits final percent to 64', () => {
    const scores = scoresFromAnchors([55, 95, 95, 95, 95]);
    expect(computeStrodeAutobiographyMeanAnchor(scores)).toBe(87);
    expect(applyStrodeAutobiographySummaryCap(87, scores)).toBe(64);
    expect(computeStrodeAutobiographyFinalPercent(scores)).toBe(64);
  });

  test('veer/flat cap limits final percent to 74', () => {
    const scores = scoresFromAnchors([72, 95, 95, 95, 95]);
    expect(computeStrodeAutobiographyMeanAnchor(scores)).toBe(90);
    expect(computeStrodeAutobiographyFinalPercent(scores)).toBe(74);
  });

  test('no cap when scenes are strong across plot and setting', () => {
    const scores = scoresFromAnchors([95, 85, 85, 85, 85]);
    expect(computeStrodeAutobiographyFinalPercent(scores)).toBe(87);
  });

  test('letter mapping uses Strode +/- boundaries', () => {
    expect(strodeEng101LetterFromPercent(95)).toBe('A');
    expect(strodeEng101LetterFromPercent(85)).toBe('B+');
    expect(strodeEng101LetterFromPercent(84)).toBe('B');
    expect(strodeEng101LetterFromPercent(75)).toBe('C+');
    expect(strodeEng101LetterFromPercent(65)).toBe('D+');
    expect(strodeEng101LetterFromPercent(59)).toBe('F');
  });
});

describe('assignment type config fallback', () => {
  test('falls back to Strode Autobiography default rubric for strode_autobiography kind', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: STRODE_AUTOBIOGRAPHY_ASSIGNMENT_TYPE_KIND,
    });
    expect(config.source).toBe('strode-autobiography-default');
    expect(config.rubric.categories).toHaveLength(5);
    expect(config.defaultLabel).toBe('Strode ENG 101 Autobiographical Narrative');
  });

  test('isStrodeAutobiographyAssignmentType matches kind only', () => {
    expect(isStrodeAutobiographyAssignmentType({ kind: 'strode_autobiography' })).toBe(
      true
    );
    expect(isStrodeAutobiographyAssignmentType({ kind: 'gals_claims' })).toBe(false);
  });
});
