/**
 * The teacher's own pages (plan item 12, Nov 23): what the teacher uploaded
 * is the text a copyrighted lesson's quotations are checked against, and
 * every lesson that quotes says what they were checked against.
 */
import { describe, expect, test } from 'bun:test';
import { checkQuotations } from './quotation-check.server';
import type { RegisteredWork } from './source-texts-data';
import { chooseCheckedAgainst, lessonQuotes, quotedPassagesIn, teacherPages, withQuotationsLabel, workNamedOnSlides } from './teacher-pages.server';

const PAGES = `Ships at a distance have every man's wish on board. For some they come in with the tide. For others they sail forever on the horizon, never out of sight, never landing until the Watcher turns his eyes away in resignation, his dreams mocked to death by Time. That is the life of men.

Now, women forget all those things they don't want to remember, and remember everything they don't want to forget. The dream is the truth. Then they act and do things accordingly.

So the beginning of this was a woman and she had come back from burying the dead. Not the dead of sick and ailing with friends at the pillow and the feet. She had come back from the sodden and the bloated; the sudden dead, their eyes flung wide open in judgment.`;

const upload = (over: Partial<{ id: string; name: string; text: string; keptDeck: boolean }> = {}) => ({
  id: 'u1',
  name: 'Their Eyes ch1.pdf',
  text: PAGES,
  keptDeck: false,
  ...over,
});

const registered = (over: Partial<RegisteredWork> = {}): RegisteredWork => ({
  id: 'frankenstein',
  title: 'Frankenstein',
  author: 'Mary Shelley',
  gutenbergId: 84,
  structure: 'chapters',
  names: ['Frankenstein'],
  check: 'Frankenstein',
  edition: 'the 1831 edition (Project Gutenberg)',
  ...over,
});

const deckWith = (slides: unknown[]) =>
  '```yawp-slides\n' + JSON.stringify({ title: 'Their Eyes Were Watching God, ch. 1', slides }) + '\n```';

const EXCERPT_DECK = deckWith([
  { layout: 'title', title: 'The Porch', speakerNotes: 'n' },
  {
    layout: 'excerpt',
    title: 'The opening',
    body: 'Ships at a distance have every man’s wish on board.',
    work: 'Their Eyes Were Watching God',
    page: 'p. 1',
    speakerNotes: 'n',
  },
]);

describe('the teacher’s pages as the text', () => {
  test('documents that are not decks and long enough to be pages, run together and named', () => {
    const pages = teacherPages([upload(), upload({ id: 'u2', name: 'deck.pptx', keptDeck: true }), upload({ id: 'u3', name: 'note.txt', text: 'Bring highlighters.' })]);
    expect(pages?.names).toEqual(['Their Eyes ch1.pdf']);
    expect(pages?.work.edition).toBe('your pages (Their Eyes ch1.pdf)');
    expect(pages?.work.structure).toBe('poems');
    expect(teacherPages([upload({ text: 'Too short to be a passage.' })])).toBeNull();
    expect(teacherPages([])).toBeNull();
  });

  test('a misremembered line is corrected to the teacher’s copy; an invented one is caught; nothing is "misplaced"', () => {
    const pages = teacherPages([upload()])!;
    const reply = [
      'Hurston opens: “Ships at a distance carry every man’s wish on board.”',
      'Later: “The dream is the only truth that women ever keep.”',
      'In chapter 4 she writes “women forget all those things they don’t want to remember”.',
    ].join('\n\n');
    const check = checkQuotations(reply, pages.source, { work: pages.work });
    expect(check.reply).toContain('Ships at a distance have every man\'s wish on board');
    expect(check.corrections[0]!.why).toContain('your pages (Their Eyes ch1.pdf)');
    expect(check.misplaced).toEqual([]);
    expect(check.verified.length).toBeGreaterThanOrEqual(2);
  });

  test('which text: a public-domain work held whole, then the teacher’s pages, then a text kept only to verify', () => {
    const pages = teacherPages([upload()]);
    expect(chooseCheckedAgainst(registered(), pages).kind).toBe('registered');
    expect(chooseCheckedAgainst(null, pages).kind).toBe('pages');
    // A translation is one of several: the class's own pages come first (Nov 23).
    expect(chooseCheckedAgainst(registered({ id: 'sophocles-theban', translated: true }), pages).kind).toBe('pages');
    expect(chooseCheckedAgainst(registered({ id: 'sophocles-theban', translated: true }), null).kind).toBe('registered');
    const dickinson = registered({ id: 'dickinson', verifyOnly: true });
    expect(chooseCheckedAgainst(dickinson, pages).kind).toBe('pages');
    expect(chooseCheckedAgainst(dickinson, null)).toEqual({ kind: 'registered', work: dickinson });
    expect(chooseCheckedAgainst(null, null)).toEqual({ kind: 'none' });
  });
});

describe('what the quotations were checked against, on every lesson that quotes', () => {
  test('not checked: at the end, with what to check before class, naming the work and the one thing that fixes it (Kevin, Nov 23)', () => {
    const reply = `# The Porch\n\nA lesson on chapter 1.\n\n${EXCERPT_DECK}\n\n**Check before class:**\n- A date to confirm.\n\nWant changes?`;
    const out = withQuotationsLabel(reply, { kind: 'none' }, { verified: 0, corrected: 0, unverified: 0 });
    expect(out.startsWith('# The Porch')).toBe(true);
    expect(out).toContain('**Check before class:**\n- A date to confirm.\n- Quotations not checked: Yawp! doesn’t have *Their Eyes Were Watching God*. Add your pages with the paperclip');
    expect(out.trimEnd().endsWith('Want changes?')).toBe(true);
    // With nothing to check, one quiet line at the end.
    const quiet = withQuotationsLabel(`# The Porch\n\n${EXCERPT_DECK}\n\nWant changes?`, { kind: 'none' }, { verified: 0, corrected: 0, unverified: 0 });
    expect(quiet).toContain('*Quotations not checked:');
    expect(quiet.trimEnd().endsWith('Want changes?')).toBe(true);
  });

  test('checked against the pages: what was found and corrected', () => {
    const pages = teacherPages([upload()])!;
    const reply = `# The Porch\n\n${EXCERPT_DECK}\n\nWant changes?`;
    const out = withQuotationsLabel(reply, { kind: 'pages', ...pages }, { verified: 9, corrected: 2, unverified: 1 });
    expect(out).toContain('*Quotations checked against your pages (Their Eyes ch1.pdf): 9 found; 2 corrected to match; 1 not found in it.*');
  });

  test('a text kept only to verify says it was checked, not corrected', () => {
    const work = registered({ title: 'Dickinson’s poems', edition: 'the 1890s editions', verifyOnly: true });
    const out = withQuotationsLabel(`# Death\n\n${EXCERPT_DECK}`, { kind: 'registered', work }, { verified: 4, corrected: 0, unverified: 0 });
    expect(out).toContain('checked against Dickinson’s poems, the 1890s editions, checked but not corrected');
  });

  test('a lesson that quotes nothing, or a reply already labeled, is left alone', () => {
    const plain = '# Thesis statements\n\nStudents write a claim about the novel.';
    expect(withQuotationsLabel(plain, { kind: 'none' }, { verified: 0, corrected: 0, unverified: 0 })).toBe(plain);
    const once = withQuotationsLabel(`# P\n\n${EXCERPT_DECK}`, { kind: 'none' }, { verified: 0, corrected: 0, unverified: 0 });
    expect(withQuotationsLabel(once, { kind: 'none' }, { verified: 0, corrected: 0, unverified: 0 })).toBe(once);
  });

  test('what counts as quoting: a passage on a slide, or six quoted words in the lesson', () => {
    expect(lessonQuotes(EXCERPT_DECK)).toBe(true);
    expect(lessonQuotes('Walter says “I want so many things that they are driving me kind of crazy.”')).toBe(true);
    expect(lessonQuotes('The word “civility” matters.')).toBe(false);
    expect(quotedPassagesIn(deckWith([{ layout: 'title', title: 'A "quoted title" of six words here', speakerNotes: 'n' }]))).toBe(0);
    expect(workNamedOnSlides(EXCERPT_DECK)).toBe('Their Eyes Were Watching God');
  });

  test('a unit map, and the prompts in starters and exit tickets, are not quoting the work (Kevin, Nov 23)', () => {
    const unit = "Here is the unit.\n\n```yawp-unit\nDay 1: Class starter: \"Think of a rule you have followed even though you thought it was wrong.\"\n```\n\nJust build Day 1.";
    expect(lessonQuotes(unit)).toBe(false);
    expect(withQuotationsLabel(unit, { kind: 'none' }, { verified: 0, corrected: 0, unverified: 0 })).toBe(unit);
    const starter = "```yawp-daily-pages\n\"When is loyalty to your country more important than loyalty to your family?\"\n```";
    expect(lessonQuotes(starter)).toBe(false);
    const handout = "```yawp-material\nkind: handout\n\n\"Life for me ain't been no crystal stair.\"\n```";
    expect(lessonQuotes(handout)).toBe(true);
  });
});
