/**
 * Editing a deck on the slide itself (the deck studio, Nov 19): what the
 * teacher types into a run on the canvas goes back to the field the run was
 * drawn from, and nowhere else.
 */
import { describe, expect, test } from 'bun:test';
import { layoutKitV4Slide, type KitV4Run, type KitV4Source } from './deck-kit-v4';
import {
  applySlideText,
  insertSlideListItem,
  removeSlideListItem,
  sourceKey,
  sourceLabel,
  sourceLimit,
  sourceText,
} from './deck-on-slide';
import { validateSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const notes = { speakerNotes: 'Say this.' };
const slide = (fields: Partial<Slide> & Pick<Slide, 'layout' | 'title'>): Slide => ({ ...notes, ...fields }) as Slide;
const deck = (slides: Slide[], extra: Partial<SlideDeck> = {}): SlideDeck => ({
  title: 'Body Paragraphs',
  unit: 'The Critical Essay',
  slides,
  kit: 'v4.1',
  ...extra,
});

const SLIDES: Slide[] = [
  slide({ layout: 'title', title: 'Body Paragraphs', subtitle: 'Build on your thesis', teacher: 'Ms. Okafor', course: 'English 10, November 12' }),
  slide({ layout: 'agenda', title: 'Today', body: 'We build one paragraph.', agenda: [{ title: 'Warm up', minutes: 5 }, { title: 'Model', minutes: 15 }] }),
  slide({ layout: 'steps', title: 'Draft your topic sentence', bullets: ['Reread your thesis', 'Pick one reason', 'Write the sentence'], minutes: 6 }),
  slide({ layout: 'discuss', title: 'Class discussion', question: 'Which reason is strongest, and why?', grouping: 'Pairs', minutes: 4, stem: 'I think…', followUp: 'Say why.' }),
  slide({ layout: 'write', title: 'Quick write', body: 'What does your first reason prove?', routine: 'Class starter', minutes: 5 }),
  slide({ layout: 'notes', title: 'The essay’s parts', timeline: [{ year: '1899', caption: 'Rule together' }], facts: ['A thesis names the ~~1|claim~~ and a ~~2|reason~~', 'Each paragraph proves one reason'] }),
  slide({ layout: 'big_idea', title: 'Idea', body: 'Great thesis statements lead to great essays.', followUp: 'So what makes one great?' }),
  slide({ layout: 'read', title: 'Read the sample', body: 'Follow along.', work: 'Season of Migration', page: 'p. 4', tasks: [{ verb: 'Underline', text: 'the thesis' }] }),
  slide({ layout: 'excerpt', title: 'Annotate', body: 'It was a long time ago.', author: 'Tayeb Salih', work: 'Season of Migration', page: 'p. 4', tasks: [{ verb: 'Circle', text: 'the verbs' }] }),
  slide({ layout: 'divider', title: 'We draft.', processStep: 4, subtitle: 'One paragraph' }),
  slide({ layout: 'look', title: 'Look', question: 'What do you see?', routine: 'See, think, wonder', seconds: 60, followUp: 'Then tell a partner.' }),
  slide({ layout: 'statement', title: 'Which is the thesis?', body: 'Pick the thesis.', choices: ['A topic', 'A claim with a reason', 'A fact'], answer: 2 }),
  slide({ layout: 'compare', title: 'Weak and strong', left: { label: 'Weak', text: 'Dogs are nice.' }, right: { label: 'Strong', text: 'Dogs make a home safer.' } }),
  slide({ layout: 'exit', title: 'Before you go', body: 'Bring your draft tomorrow.', button: 'Exit ticket', nextLesson: 'Conclusions' }),
];

const base = deck(SLIDES);
const at = (layout: string, of: SlideDeck = base) => of.slides.findIndex((s) => s.layout === layout);

const runsOf = (of: SlideDeck, index: number): KitV4Run[] =>
  layoutKitV4Slide(of, index).elements.flatMap((element) => (element.kind === 'text' ? element.paras.flatMap((para) => para.runs) : []));
const sourced = (of: SlideDeck, index: number) => runsOf(of, index).filter((run): run is KitV4Run & { source: KitV4Source } => Boolean(run.source));
/** The run drawn from this field (and item, and part). */
const find = (of: SlideDeck, index: number, field: string, item?: number, key?: string) => {
  const run = sourced(of, index).find((r) => r.source.field === field && (item === undefined || r.source.index === item) && (key === undefined || r.source.key === key));
  if (!run) throw new Error(`No run drawn from ${field} on slide ${index + 1}`);
  return run;
};
const shown = (run: KitV4Run & { source: KitV4Source }) => run.text.slice(run.source.lead ?? 0, run.text.length - (run.source.trail ?? 0));

describe('every editable run reads back to its field', () => {
  for (const kit of ['v4', 'v4.1'] as const) {
    test(`spec ${kit}: the words on the canvas are the field’s words`, () => {
      const of = deck(SLIDES, { kit });
      of.slides.forEach((_, index) => {
        // A label is drawn from the slide's mode or the template's default.
        for (const run of sourced(of, index).filter((r) => r.source.field !== 'mode')) {
          expect({ slide: index + 1, field: run.source.field, text: shown(run) }).toEqual({
            slide: index + 1,
            field: run.source.field,
            text: sourceText(of, index, run.source) ?? '',
          });
        }
      });
    });
  }

  test('every slide has something to edit, and layout words have no source', () => {
    base.slides.forEach((_, index) => expect(sourced(base, index).length).toBeGreaterThan(0));
    const fixed = (index: number) => runsOf(base, index).filter((run) => !run.source).map((run) => run.text.trim());
    expect(fixed(at('agenda'))).toContain('Today');
    expect(fixed(at('steps'))).toContain('1');
    expect(fixed(at('exit'))).toContain('Before you go');
    expect(fixed(at('divider'))).toContain('Step 4');
    expect(fixed(at('look'))).toContain('60 seconds');
    expect(fixed(at('statement'))).toContain('Question 1 of 1');
  });
});

describe('applySlideText: typing goes to the field it was drawn from', () => {
  test('a headline, and only that slide changes', () => {
    const next = applySlideText(base, at('steps'), find(base, at('steps'), 'title').source, 'Write a topic sentence');
    expect(next.slides[at('steps')]!.title).toBe('Write a topic sentence');
    expect(next.slides.filter((s, i) => s !== base.slides[i])).toHaveLength(1);
    expect(next.kit).toBe('v4.1');
  });

  test('the unit line on the title slide is the deck’s', () => {
    const run = find(base, 0, 'unit');
    expect(run.source.on).toBe('deck');
    expect(applySlideText(base, 0, run.source, 'The Personal Essay').unit).toBe('The Personal Essay');
  });

  test('a list line, an agenda part, a task’s verb and its words, a timeline year, a column', () => {
    const steps = at('steps');
    expect(applySlideText(base, steps, find(base, steps, 'bullets', 1).source, 'Pick your best reason').slides[steps]!.bullets).toEqual([
      'Reread your thesis',
      'Pick your best reason',
      'Write the sentence',
    ]);
    const agenda = at('agenda');
    const part = find(base, agenda, 'agenda', 1);
    expect(part.text).toBe('   Model');
    expect(part.source.lead).toBe(3);
    expect(applySlideText(base, agenda, part.source, 'Model it').slides[agenda]!.agenda).toEqual([
      { title: 'Warm up', minutes: 5 },
      { title: 'Model it', minutes: 15 },
    ]);
    const read = at('read');
    const verb = find(base, read, 'tasks', 0, 'verb');
    expect(verb.text).toBe('Underline ');
    expect(verb.source.trail).toBe(1);
    expect(applySlideText(base, read, verb.source, 'Circle').slides[read]!.tasks).toEqual([{ verb: 'Circle', text: 'the thesis' }]);
    expect(applySlideText(base, read, find(base, read, 'tasks', 0, 'text').source, 'the claim').slides[read]!.tasks).toEqual([{ verb: 'Underline', text: 'the claim' }]);
    const know = at('notes');
    expect(applySlideText(base, know, find(base, know, 'timeline', 0, 'year').source, '1956').slides[know]!.timeline).toEqual([{ year: '1956', caption: 'Rule together' }]);
    const compare = at('compare');
    expect(applySlideText(base, compare, find(base, compare, 'right', undefined, 'text').source, 'Dogs guard a home.').slides[compare]!.right).toEqual({ label: 'Strong', text: 'Dogs guard a home.' });
  });

  test('a fallback is written back where it was read', () => {
    const noQuestion = deck([slide({ layout: 'discuss', title: 'Talk', body: 'Why the Nile?' })]);
    const run = find(noQuestion, 0, 'body');
    const next = applySlideText(noQuestion, 0, run.source, 'Why the river?');
    expect(next.slides[0]!.body).toBe('Why the river?');
    expect(next.slides[0]!.question).toBeUndefined();
  });

  test('words the layout rewrites are edited as shown', () => {
    const dotted = deck([slide({ layout: 'write', title: 'Write', body: 'What do you notice?', routine: 'See · Think · Wonder' })]);
    const routine = find(dotted, 0, 'routine');
    expect(routine.text).toBe('See, think, wonder');
    expect(applySlideText(dotted, 0, routine.source, 'Notice and wonder').slides[0]!.routine).toBe('Notice and wonder');
    // "p. 4" is drawn as ", p. 4": the page is not typed on the slide.
    expect(sourced(base, at('excerpt')).map((r) => r.source.field)).not.toContain('page');
  });

  test('layout words around a field stay out of it', () => {
    const exit = at('exit');
    const button = find(base, exit, 'button');
    expect(button.text).toBe('Exit ticket: open it in Yawp!');
    expect(shown(button)).toBe('Exit ticket');
    expect(applySlideText(base, exit, button.source, 'Reflection').slides[exit]!.button).toBe('Reflection');
    const next = find(base, exit, 'nextLesson');
    expect(shown(next)).toBe('Conclusions');
    const grouping = find(base, at('discuss'), 'grouping');
    expect(grouping.text).toBe('Pairs, 4 minutes');
    expect(shown(grouping)).toBe('Pairs');
  });

  test('one part of a line with color marks: the other parts and their marks stay', () => {
    const know = at('notes');
    const parts = sourced(base, know).filter((r) => r.source.field === 'facts' && r.source.index === 0);
    expect(parts.map((r) => r.text)).toEqual(['A thesis names the ', 'claim', ' and a ', 'reason']);
    const next = applySlideText(base, know, parts[1]!.source, 'main claim');
    expect(next.slides[know]!.facts![0]).toBe('A thesis names the ~~1|main claim~~ and a ~~2|reason~~');
    // A tilde would break the mark it sits in.
    expect(applySlideText(base, know, parts[1]!.source, 'cl~aim').slides[know]!.facts![0]).toBe('A thesis names the ~~1|claim~~ and a ~~2|reason~~');
  });

  test('typing stops at the field’s limit', () => {
    const title = find(base, at('steps'), 'title').source;
    expect(sourceLimit(title)).toBe(90);
    expect(applySlideText(base, at('steps'), title, 'x'.repeat(200)).slides[at('steps')]!.title).toHaveLength(90);
    expect(sourceLimit(find(base, at('agenda'), 'agenda', 0).source)).toBe(70);
    expect(sourceLimit(find(base, at('read'), 'tasks', 0, 'verb').source)).toBe(24);
  });

  test('line breaks become spaces: a field is one line', () => {
    const steps = at('steps');
    expect(applySlideText(base, steps, find(base, steps, 'title').source, 'Write\na topic\tsentence').slides[steps]!.title).toBe('Write a topic sentence');
  });

  test('emptied: an optional field is cleared, a required one keeps its words', () => {
    const talk = at('discuss');
    expect(applySlideText(base, talk, find(base, talk, 'stem').source, '  ').slides[talk]!.stem).toBeUndefined();
    // A title is required: the deck would not save.
    expect(applySlideText(base, talk, find(base, talk, 'title').source, '')).toBe(base);
    // A big idea needs its body.
    const idea = at('big_idea');
    expect(applySlideText(base, idea, find(base, idea, 'body').source, '')).toBe(base);
  });

  test('a label is the slide’s mode; emptied, the slide has no label', () => {
    const talk = at('discuss');
    const label = find(base, talk, 'mode');
    expect(label.text).toBe('Talk');
    expect(label.source.commit).toBe('blur');
    expect(applySlideText(base, talk, label.source, 'Turn and talk').slides[talk]!.mode).toBe('Turn and talk');
    expect(applySlideText(base, talk, label.source, '').slides[talk]!.mode).toBe('none');
  });

  test('every edit leaves a deck that still saves', () => {
    base.slides.forEach((_, index) => {
      for (const run of sourced(base, index)) {
        const next = applySlideText(base, index, run.source, 'New words');
        const { kit: _kit, ...stored } = next;
        expect(validateSlideDeck(JSON.stringify(stored)).ok).toBe(true);
      }
    });
  });
});

describe('lists on the slide: Enter adds a line, Backspace on an empty one removes it', () => {
  test('a new line goes in after the one the teacher is on, and is the one to type in next', () => {
    const steps = at('steps');
    const added = insertSlideListItem(base, steps, find(base, steps, 'bullets', 0).source)!;
    expect(added.deck.slides[steps]!.bullets).toEqual(['Reread your thesis', 'New line', 'Pick one reason', 'Write the sentence']);
    expect(added.focus).toMatchObject({ field: 'bullets', index: 1 });
  });

  test('no more lines than the slide draws', () => {
    const steps = at('steps');
    const four = insertSlideListItem(base, steps, find(base, steps, 'bullets', 2).source)!.deck;
    expect(four.slides[steps]!.bullets).toHaveLength(4);
    expect(insertSlideListItem(four, steps, find(four, steps, 'bullets', 3).source)).toBeNull();
  });

  test('an agenda part, a task and a choice get words of their own kind', () => {
    const agenda = at('agenda');
    expect(insertSlideListItem(base, agenda, find(base, agenda, 'agenda', 1).source)!.deck.slides[agenda]!.agenda![2]).toEqual({ title: 'New part' });
    const read = at('read');
    const task = insertSlideListItem(base, read, find(base, read, 'tasks', 0, 'text').source)!;
    expect(task.deck.slides[read]!.tasks![1]).toEqual({ verb: 'Mark', text: 'what to look for' });
    expect(task.focus).toMatchObject({ field: 'tasks', index: 1, key: 'text' });
    const quiz = at('statement');
    expect(insertSlideListItem(base, quiz, find(base, quiz, 'choices', 2).source)!.deck.slides[quiz]!.choices).toHaveLength(4);
  });

  test('removing a line moves to the one before it', () => {
    const steps = at('steps');
    const removed = removeSlideListItem(base, steps, find(base, steps, 'bullets', 1).source)!;
    expect(removed.deck.slides[steps]!.bullets).toEqual(['Reread your thesis', 'Write the sentence']);
    expect(removed.focus).toMatchObject({ field: 'bullets', index: 0 });
  });

  test('a list keeps what the slide needs: the last step, two choices', () => {
    const one = deck([slide({ layout: 'steps', title: 'Do', bullets: ['Only step'] })]);
    expect(removeSlideListItem(one, 0, find(one, 0, 'bullets', 0).source)).toBeNull();
    const two = deck([slide({ layout: 'statement', title: 'Q', body: 'Pick.', choices: ['A', 'B'] })]);
    expect(removeSlideListItem(two, 0, find(two, 0, 'choices', 0).source)).toBeNull();
  });

  test('a field that is not a list has no lines to add or remove', () => {
    const steps = at('steps');
    expect(insertSlideListItem(base, steps, find(base, steps, 'title').source)).toBeNull();
    expect(removeSlideListItem(base, steps, find(base, steps, 'title').source)).toBeNull();
  });
});

describe('names for a run: its key on the canvas and its label for a screen reader', () => {
  test('a key per field, item and part', () => {
    expect(sourceKey({ on: 'slide', field: 'title' })).toBe('slide.title');
    expect(sourceKey({ on: 'slide', field: 'tasks', index: 1, key: 'text', lead: 0 })).toBe('slide.tasks.1.text');
    expect(sourceKey({ on: 'slide', field: 'facts', index: 0, segment: 2 })).toBe('slide.facts.0#2');
    expect(sourceKey({ on: 'deck', field: 'unit' })).toBe('deck.unit');
  });

  test('a label a teacher would recognise', () => {
    expect(sourceLabel({ on: 'slide', field: 'title' })).toBe('Slide title');
    expect(sourceLabel({ on: 'slide', field: 'bullets', index: 1 })).toBe('Line 2');
    expect(sourceLabel({ on: 'slide', field: 'mode' })).toBe('Label');
    expect(sourceLabel({ on: 'slide', field: 'agenda', index: 0, key: 'title' })).toBe('Agenda part 1');
    expect(sourceLabel({ on: 'slide', field: 'left', key: 'text' })).toBe('Left column text');
  });
});
