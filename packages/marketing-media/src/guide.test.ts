import { describe, expect, test } from 'bun:test';
import {
  guideOutline,
  lintGuideCopy,
  lintGuideStoryboard,
  validateGuideStoryboard,
} from './guide';
import { guideStoryboard } from './guide.fixture';
import { parseStoryboard, safeParseStoryboard } from './storyboard';

describe('guide copy on the storyboard', () => {
  test('a guide storyboard parses and keeps its copy', () => {
    const parsed = parseStoryboard(guideStoryboard());
    expect(parsed.guide?.headline).toBe(
      'Get students writing every day in five minutes.'
    );
    expect(parsed.scenes[2].guide).toEqual({
      section: 'step',
      heading: 'Assign a prompt',
      body: 'Choose a prompt and send it to a class.',
    });
  });

  // Stills and clips written before guides existed must keep parsing.
  test('storyboards without guide copy still parse', () => {
    const { guide: _guide, ...rest } = guideStoryboard();
    const scenes = rest.scenes.map(({ guide: _g, ...scene }) => scene);
    expect(safeParseStoryboard({ ...rest, scenes }).success).toBe(true);
  });

  test('a highlight has to be part of the headline it emphasizes', () => {
    const result = safeParseStoryboard(
      guideStoryboard({
        guide: { ...guideStoryboard().guide, highlight: 'every week' },
      })
    );
    expect(result.success).toBe(false);
  });

  test('copy fields are length-capped so a guide stays a teaser', () => {
    const result = safeParseStoryboard(
      guideStoryboard({
        guide: { ...guideStoryboard().guide, lede: 'word '.repeat(80) },
      })
    );
    expect(result.success).toBe(false);
  });
});

describe('validateGuideStoryboard', () => {
  const valid = () => parseStoryboard(guideStoryboard());

  test('accepts a guide in the documented shape', () => {
    expect(validateGuideStoryboard(valid())).toEqual([]);
  });

  test('needs guide copy at all', () => {
    const { guide: _guide, ...rest } = guideStoryboard();
    const problems = validateGuideStoryboard(parseStoryboard(rest));
    expect(problems.join(' ')).toMatch(/guide copy/i);
  });

  test('needs exactly one hero with a still', () => {
    const board = valid();
    board.scenes[0].guide = undefined;
    expect(validateGuideStoryboard(board).join(' ')).toMatch(/hero/i);

    const noShot = valid();
    noShot.scenes[0].screenshot = false;
    expect(validateGuideStoryboard(noShot).join(' ')).toMatch(/hero/i);
  });

  test('allows at most three numbered steps', () => {
    const board = valid();
    const step = board.scenes[2];
    board.scenes.push(
      { ...step, id: 'three' },
      { ...step, id: 'four' }
    );
    expect(validateGuideStoryboard(board).join(' ')).toMatch(/3 steps/);
  });

  test('needs at least one step', () => {
    const board = valid();
    board.scenes = board.scenes.slice(0, 2);
    expect(validateGuideStoryboard(board).join(' ')).toMatch(/step/i);
  });

  test('every step needs a heading and one or two lines', () => {
    const board = valid();
    board.scenes[2].guide = { section: 'step', heading: 'Assign a prompt' };
    expect(validateGuideStoryboard(board).join(' ')).toMatch(/assign/);
  });

  // The won't column is what a district approves the feature on.
  test('needs both will and won’t lines', () => {
    const board = valid();
    board.guide!.wont = [];
    expect(validateGuideStoryboard(board).join(' ')).toMatch(/won.t/i);
  });

  test('needs the honest demo footer', () => {
    const board = valid();
    board.guide!.footerNote = '';
    expect(validateGuideStoryboard(board).join(' ')).toMatch(/footer/i);
  });
});

describe('lintGuideCopy', () => {
  test('passes plain, direct copy', () => {
    expect(
      lintGuideCopy('Class reports, student growth reports, and growth plans.')
    ).toEqual([]);
  });

  test('flags em-dash asides', () => {
    expect(lintGuideCopy('It writes the plan — so you can teach.')).toHaveLength(
      1
    );
  });

  test('flags "not X, but Y" constructions', () => {
    expect(
      lintGuideCopy('It is not a grader, but a coach.').join(' ')
    ).toMatch(/not X, but Y/);
  });

  test('flags marketing filler words', () => {
    expect(lintGuideCopy('Unlock seamless feedback.').join(' ')).toMatch(
      /seamless/i
    );
  });

  test('flags a list missing its Oxford comma', () => {
    expect(
      lintGuideCopy('Class reports, student growth reports and growth plans.')
        .join(' ')
    ).toMatch(/Oxford comma/);
  });

  test('flags YAWP written without its capitals and bang', () => {
    expect(lintGuideCopy('Yawp saves every draft.').join(' ')).toMatch(
      /YAWP!/
    );
    expect(lintGuideCopy('YAWP! saves every draft.')).toEqual([]);
  });
});

describe('lintGuideStoryboard', () => {
  test('names the field each problem is in', () => {
    const board = parseStoryboard(guideStoryboard());
    board.scenes[2].guide!.body = 'Choose a prompt — then send it.';
    const problems = lintGuideStoryboard(board);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/scenes\.assign\.body/);
  });
});

describe('guideOutline', () => {
  test('orders scenes into the documented shape regardless of filming order', () => {
    const board = parseStoryboard(guideStoryboard());
    // Film the range after the steps; the document still shows it first.
    board.scenes = [board.scenes[0], board.scenes[2], board.scenes[3], board.scenes[1]];
    const outline = guideOutline(board);
    expect(outline.hero?.id).toBe('hero');
    expect(outline.range?.id).toBe('prompt-library');
    expect(outline.steps.map((scene) => scene.id)).toEqual(['assign', 'review']);
    expect(outline.extras).toEqual([]);
  });
});
