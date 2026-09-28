import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_PARAGRAPH_MODES,
  PARAGRAPH_MODE_FIELD,
  buildParagraphModeGradingBlock,
  buildParagraphModeTutorInstructions,
  enabledParagraphModes,
  getParagraphMode,
  offersParagraphModesForKind,
  parseParagraphMode,
} from './daily-pages-paragraph-modes';

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe('the paragraph types a teacher can choose', () => {
  test('covers the academic moves Daily Pages practices', () => {
    expect(DAILY_PAGES_PARAGRAPH_MODES.map((mode) => mode.key)).toEqual([
      'analyze',
      'argue',
      'compare',
      'define',
      'interpret',
      'evaluate',
      'synthesize',
    ]);
  });

  /**
   * Rollout: Analyze is built and quality-checked first. Teachers see only
   * the types that are switched on, and the others follow one at a time.
   */
  test('ships with Analyze as the only type switched on', () => {
    expect(enabledParagraphModes().map((mode) => mode.key)).toEqual([
      'analyze',
    ]);
  });

  test('a switched-on type carries both its grading and its tutor guidance', () => {
    for (const mode of enabledParagraphModes()) {
      expect(mode.gradingInstructions?.length).toBeGreaterThan(100);
      expect(mode.tutorInstructions?.length).toBeGreaterThan(100);
      expect(mode.description.length).toBeGreaterThan(20);
    }
  });

  test('looks a type up by key, and only a switched-on one', () => {
    expect(getParagraphMode('analyze')?.label).toBe('Analyze');
    expect(getParagraphMode('argue')).toBeNull();
    expect(getParagraphMode('nonsense')).toBeNull();
    expect(getParagraphMode(null)).toBeNull();
  });
});

/**
 * Claim-Evidence-Analysis is the paragraph model the tutor guides toward for
 * Analyze: a claim about the text, the words that show it, and the
 * explanation of how those words do it.
 */
describe('Analyze uses the Claim-Evidence-Analysis model', () => {
  const analyze = getParagraphMode('analyze')!;

  test('the tutor coaches claim, then evidence, then analysis', () => {
    const tutor = analyze.tutorInstructions!.toLowerCase();
    expect(tutor).toContain('claim-evidence-analysis');
    expect(tutor.indexOf('claim.')).toBeLessThan(tutor.indexOf('evidence.'));
    expect(tutor.indexOf('evidence.')).toBeLessThan(tutor.indexOf('analysis.'));
    expect(tutor).toContain('never write');
  });

  test('the grader reads for analysis that explains the evidence, not restates it', () => {
    const grading = analyze.gradingInstructions!.toLowerCase();
    expect(grading).toContain('claim-evidence-analysis');
    expect(grading).toContain('restat');
    expect(grading).toContain('development of thought');
  });

  test('offers the model without making it the only acceptable form', () => {
    expect(analyze.gradingInstructions!.toLowerCase()).toContain(
      'not the only acceptable form'
    );
  });
});

describe('parseParagraphMode', () => {
  test('absent or blank means no type chosen', () => {
    expect(parseParagraphMode(form({}))).toEqual({
      success: true,
      value: null,
    });
    expect(parseParagraphMode(form({ [PARAGRAPH_MODE_FIELD]: '' }))).toEqual({
      success: true,
      value: null,
    });
  });

  test('accepts a switched-on type', () => {
    expect(
      parseParagraphMode(form({ [PARAGRAPH_MODE_FIELD]: 'analyze' }))
    ).toEqual({ success: true, value: 'analyze' });
  });

  test('rejects a type that is not switched on yet, and nonsense', () => {
    expect(
      parseParagraphMode(form({ [PARAGRAPH_MODE_FIELD]: 'argue' })).success
    ).toBe(false);
    expect(
      parseParagraphMode(form({ [PARAGRAPH_MODE_FIELD]: 'freewrite' })).success
    ).toBe(false);
  });
});

/**
 * No type chosen is every assignment written before this setting existed, so
 * both prompt layers must be empty and change nothing.
 */
describe('the prompt layers', () => {
  test('are empty when no type is chosen', () => {
    expect(buildParagraphModeGradingBlock(null)).toBe('');
    expect(buildParagraphModeGradingBlock(undefined)).toBe('');
    expect(buildParagraphModeTutorInstructions(null)).toBe('');
  });

  test('are empty for a stored type that has since been switched off', () => {
    expect(buildParagraphModeGradingBlock('argue')).toBe('');
    expect(buildParagraphModeTutorInstructions('argue')).toBe('');
  });

  test('name the type and carry its guidance when one is chosen', () => {
    const grading = buildParagraphModeGradingBlock('analyze');
    expect(grading.startsWith('Paragraph type: Analyze')).toBe(true);
    expect(grading).toContain(getParagraphMode('analyze')!.gradingInstructions!);

    const tutor = buildParagraphModeTutorInstructions('analyze');
    expect(tutor).toContain('Analyze');
    expect(tutor).toContain(getParagraphMode('analyze')!.tutorInstructions!);
  });
});

describe('offersParagraphModesForKind', () => {
  test('only Daily Pages takes a paragraph type', () => {
    expect(offersParagraphModesForKind('daily_pages')).toBe(true);
    expect(offersParagraphModesForKind('class_starter')).toBe(false);
    expect(offersParagraphModesForKind(null)).toBe(false);
    expect(offersParagraphModesForKind(undefined)).toBe(false);
  });
});
