import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_PARAGRAPH_MODES,
  PARAGRAPH_MODE_FIELD,
  buildParagraphModeGradingBlock,
  buildParagraphModeTutorInstructions,
  enabledParagraphModes,
  getParagraphMode,
  offersParagraphModesForKind,
  effectiveParagraphModes,
  paragraphModeLabel,
  paragraphModeLabels,
  parseParagraphMode,
  parseParagraphModes,
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
   * Rollout: Analyze was built and quality-checked first, then Argue a
   * position, then Compare. Teachers see only the types that are switched
   * on, and the others follow one at a time.
   */
  test('ships with Analyze, Argue a position and Compare switched on', () => {
    expect(enabledParagraphModes().map((mode) => mode.key)).toEqual([
      'analyze',
      'argue',
      'compare',
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
    expect(getParagraphMode('argue')?.label).toBe('Argue a position');
    expect(getParagraphMode('compare')?.label).toBe('Compare');
    expect(getParagraphMode('define')).toBeNull();
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

/**
 * Argue a position asks for a position someone could disagree with, the
 * strongest reason for it, and a specific case that tests it. The case is
 * what separates an argument from an opinion: a reason held up only by
 * generalities has not been tested.
 */
describe('Argue a position: position, reason, test', () => {
  const argue = getParagraphMode('argue')!;

  test('the tutor coaches position, then reason, then the test', () => {
    const tutor = argue.tutorInstructions!.toLowerCase();
    expect(tutor).toContain('position-reason-test');
    expect(tutor.indexOf('position.')).toBeLessThan(tutor.indexOf('reason.'));
    expect(tutor.indexOf('reason.')).toBeLessThan(tutor.indexOf('test.'));
    expect(tutor).toContain('never write');
  });

  test('the tutor asks for the strongest reason rather than more of them', () => {
    expect(argue.tutorInstructions!.toLowerCase()).toContain('strongest');
  });

  test('the grader wants a position a reader could disagree with, not a straddle', () => {
    const grading = argue.gradingInstructions!.toLowerCase();
    expect(grading).toContain('position-reason-test');
    expect(grading).toContain('disagree');
    expect(grading).toContain('both sides');
    expect(grading).toContain('depth of thought');
  });

  test('the grader holds an untested position down in Development of Thought', () => {
    const grading = argue.gradingInstructions!.toLowerCase();
    expect(grading).toContain('specific');
    expect(grading).toContain('development of thought');
    expect(grading).toContain('does not rise above developing');
  });

  /**
   * A fifteen-minute paragraph cannot carry a full rebuttal. Facing the case
   * that tests the position is the move; a formal counterargument section is
   * not required.
   */
  test('does not demand a formal counterargument', () => {
    expect(argue.gradingInstructions!.toLowerCase()).toContain(
      'formal counterargument'
    );
  });

  test('offers the model without making it the only acceptable form', () => {
    expect(argue.gradingInstructions!.toLowerCase()).toContain(
      'not the only acceptable form'
    );
  });
});

/**
 * Compare asks for the ground two things share, the one difference that
 * matters, and what that difference shows. The failure it guards against is
 * the Venn diagram in prose: likenesses, then differences, then nothing.
 */
describe('Compare: basis, difference, significance', () => {
  const compare = getParagraphMode('compare')!;

  test('the tutor coaches the basis, then the difference, then why it matters', () => {
    const tutor = compare.tutorInstructions!.toLowerCase();
    expect(tutor).toContain('basis-difference-significance');
    expect(tutor.indexOf('basis.')).toBeLessThan(tutor.indexOf('difference.'));
    expect(tutor.indexOf('difference.')).toBeLessThan(
      tutor.indexOf('significance.')
    );
    expect(tutor).toContain('never write');
  });

  test('the tutor narrows a list of differences to the one that matters', () => {
    const tutor = compare.tutorInstructions!.toLowerCase();
    expect(tutor).toContain('one difference');
    expect(tutor).toContain('both');
  });

  test('the grader holds a list of likenesses and differences down in Depth of Thought', () => {
    const grading = compare.gradingInstructions!.toLowerCase();
    expect(grading).toContain('basis-difference-significance');
    expect(grading).toContain('list');
    expect(grading).toContain('depth of thought');
    expect(grading).toContain('does not rise above developing');
  });

  test('the grader wants evidence from both sides, read in Development of Thought', () => {
    const grading = compare.gradingInstructions!.toLowerCase();
    expect(grading).toContain('both');
    expect(grading).toContain('development of thought');
  });

  /** Two summaries side by side is the other common miss. */
  test('the grader does not credit two separate summaries as a comparison', () => {
    expect(compare.gradingInstructions!.toLowerCase()).toContain('summar');
  });

  test('offers the model without making it the only acceptable form', () => {
    expect(compare.gradingInstructions!.toLowerCase()).toContain(
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
    expect(
      parseParagraphMode(form({ [PARAGRAPH_MODE_FIELD]: 'argue' }))
    ).toEqual({ success: true, value: 'argue' });
  });

  test('rejects a type that is not switched on yet, and nonsense', () => {
    expect(
      parseParagraphMode(form({ [PARAGRAPH_MODE_FIELD]: 'define' })).success
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
    expect(buildParagraphModeGradingBlock('define')).toBe('');
    expect(buildParagraphModeTutorInstructions('define')).toBe('');
  });

  test('name the type and carry its guidance when one is chosen', () => {
    const grading = buildParagraphModeGradingBlock('analyze');
    expect(grading.startsWith('Paragraph type: Analyze')).toBe(true);
    expect(grading).toContain(getParagraphMode('analyze')!.gradingInstructions!);

    const tutor = buildParagraphModeTutorInstructions('analyze');
    expect(tutor).toContain('Analyze');
    expect(tutor).toContain(getParagraphMode('analyze')!.tutorInstructions!);
  });

  test('carry Argue a position under its own name', () => {
    expect(
      buildParagraphModeGradingBlock('argue').startsWith(
        'Paragraph type: Argue a position'
      )
    ).toBe(true);
    expect(buildParagraphModeTutorInstructions('argue')).toContain(
      getParagraphMode('argue')!.tutorInstructions!
    );
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

describe('paragraphModeLabel', () => {
  test('names any stored type, switched on or not', () => {
    expect(paragraphModeLabel('analyze')).toBe('Analyze');
    expect(paragraphModeLabel('define')).toBe('Define a term');
  });

  test('is null for no type or an unknown one', () => {
    expect(paragraphModeLabel(null)).toBeNull();
    expect(paragraphModeLabel('freewrite')).toBeNull();
  });
});

function formWith(values: string[]) {
  const data = new FormData();
  for (const value of values) data.append(PARAGRAPH_MODE_FIELD, value);
  return data;
}

/**
 * Most prompts ask for more than one move — "Honest and kind at once" is
 * argue and evaluate — so an assignment can name several paragraph types.
 * None chosen is any kind of paragraph, exactly as before.
 */
describe('parseParagraphModes', () => {
  test('nothing ticked means any kind of paragraph', () => {
    expect(parseParagraphModes(formWith([]))).toEqual({ success: true, value: [] });
    expect(parseParagraphModes(formWith(['']))).toEqual({ success: true, value: [] });
  });

  test('accepts several switched-on types, in the registry’s order, once each', () => {
    expect(parseParagraphModes(formWith(['argue', 'analyze', 'argue']))).toEqual({
      success: true,
      value: ['analyze', 'argue'],
    });
  });

  test('refuses the whole choice when any type is not switched on', () => {
    expect(parseParagraphModes(formWith(['analyze', 'define'])).success).toBe(false);
  });
});

/**
 * Assignments written before the list existed store one type in the old
 * column. They read as that one type; a list, when present, wins.
 */
describe('effectiveParagraphModes', () => {
  test('reads the list when there is one', () => {
    expect(
      effectiveParagraphModes({ paragraphModes: ['analyze', 'argue'], paragraphMode: 'analyze' })
    ).toEqual(['analyze', 'argue']);
  });

  test('falls back to the single stored type', () => {
    expect(effectiveParagraphModes({ paragraphModes: [], paragraphMode: 'argue' })).toEqual([
      'argue',
    ]);
    expect(effectiveParagraphModes({ paragraphMode: 'analyze' })).toEqual(['analyze']);
  });

  test('is empty when neither is set', () => {
    expect(effectiveParagraphModes({ paragraphModes: [], paragraphMode: null })).toEqual([]);
    expect(effectiveParagraphModes(null)).toEqual([]);
  });

  test('keeps a stored type that has since been switched off, for labels', () => {
    expect(effectiveParagraphModes({ paragraphModes: ['define'] })).toEqual(['define']);
  });
});

describe('several types in the prompt layers', () => {
  test('one type reads exactly as before', () => {
    expect(buildParagraphModeGradingBlock(['analyze'])).toBe(
      buildParagraphModeGradingBlock('analyze')
    );
    expect(buildParagraphModeTutorInstructions(['analyze'])).toBe(
      buildParagraphModeTutorInstructions('analyze')
    );
  });

  test('two types carry both blocks, and say the paragraph combines them', () => {
    const grading = buildParagraphModeGradingBlock(['analyze', 'argue']);
    expect(grading).toContain('Paragraph type: Analyze');
    expect(grading).toContain('Paragraph type: Argue a position');
    expect(grading.toLowerCase()).toContain('combines');

    const tutor = buildParagraphModeTutorInstructions(['analyze', 'argue']);
    expect(tutor).toContain(getParagraphMode('analyze')!.tutorInstructions!);
    expect(tutor).toContain(getParagraphMode('argue')!.tutorInstructions!);
    expect(tutor.toLowerCase()).toContain('combines');
  });

  test('switched-off types drop out of the layers', () => {
    expect(buildParagraphModeGradingBlock(['define'])).toBe('');
    expect(buildParagraphModeGradingBlock(['analyze', 'define'])).toBe(
      buildParagraphModeGradingBlock('analyze')
    );
  });
});

describe('paragraphModeLabels', () => {
  test('names every stored type', () => {
    expect(paragraphModeLabels(['analyze', 'argue'])).toEqual([
      'Analyze',
      'Argue a position',
    ]);
    expect(paragraphModeLabels([])).toEqual([]);
  });
});
