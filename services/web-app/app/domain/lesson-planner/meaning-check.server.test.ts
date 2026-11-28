import { describe, expect, it } from 'bun:test';
import { MEANING_CHECK_SYSTEM, isLiterature, meaningProblems } from './meaning-check.server';

// The Macbeth day-1 deck of the Nov 24 types test (R28, R29: fail).
const MACBETH = `## Read Act 1, Scene 1 together (12 min)
Read the scene twice.

\`\`\`yawp-slides
{"slides":[{"layout":"big_idea","title":"The witches do not make Macbeth do anything. The question is whether they name what is already in him."},{"layout":"cast","title":"Who is in Act 1","people":[{"name":"Macbeth","note":"Wants recognition — and more"}]}]}
\`\`\``;

const answer = (errors: unknown[]) => JSON.stringify({ errors });

describe('meaningProblems (R28, R29: never tell students what the work means)', () => {
  it('turns each student-facing claim about meaning into a problem for the repair pass', async () => {
    const ask = async () =>
      answer([
        {
          wrong: 'The witches do not make Macbeth do anything. The question is whether they name what is already in him.',
          right: 'Do the witches make Macbeth do anything, or do they name what is already in him?',
          confidence: 'high',
          why: 'A big-idea slide tells students what the play means before they have read it.',
        },
        { wrong: 'Wants recognition — and more', right: 'Thane of Glamis; a general', confidence: 'medium', why: 'The cast slide tells students what Macbeth wants.' },
      ]);
    const problems = await meaningProblems(MACBETH, ask);
    expect(problems).toHaveLength(2);
    expect(problems[0]!.words).toContain('The witches do not make Macbeth do anything');
    expect(problems[0]!.right).toContain('?');
    expect(problems[0]!.what).toContain('tells students what the play means');
    expect(problems[0]!.what).toContain("teacher's notes");
    expect(problems[1]!.note).toContain('Wants recognition');
  });

  it('drops what the reader itself is unsure of, says is fine, or cannot be found in the lesson', async () => {
    const ask = async () =>
      answer([
        { wrong: 'Wants recognition — and more', right: 'x', confidence: 'low', why: 'Maybe.' },
        { wrong: 'Read the scene twice.', right: 'x', confidence: 'high', why: 'This is not an error, so ignore it.' },
        { wrong: 'A sentence that is not in the lesson at all.', right: 'x', confidence: 'high', why: 'Tells the theme.' },
      ]);
    expect(await meaningProblems(MACBETH, ask)).toEqual([]);
  });

  it('gives the lesson back unchecked when the reader fails or answers nonsense', async () => {
    expect(await meaningProblems(MACBETH, async () => { throw new Error('timeout'); })).toEqual([]);
    expect(await meaningProblems(MACBETH, async () => 'not json')).toEqual([]);
  });

  it('asks only about the words students see, and says what counts as telling', () => {
    for (const words of ['students see', 'theme', 'wants', 'stands for', 'speaker notes', 'teacher', 'a question', '"wrong"', '"right"']) {
      expect(MEANING_CHECK_SYSTEM).toContain(words);
    }
  });
});

describe('isLiterature: the lessons the meaning check reads', () => {
  it('reads a novel, play, poem or short story lesson; not a skill lesson, a speech, a seminar or a unit map', () => {
    expect(isLiterature(['Build day 1 of a Macbeth unit for 12th grade, 50 minutes: introduce the play and read Act 1, Scene 1 together.'])).toBe(true);
    expect(isLiterature(["Teach a 50-minute close reading of Percy Bysshe Shelley's 'Ozymandias' for 10th grade."])).toBe(true);
    expect(isLiterature(['Teach a 50-minute lesson for 9th grade on using semicolons correctly in their own writing.'])).toBe(false);
    expect(isLiterature(["Teach a 50-minute rhetorical analysis lesson for 11th grade on Lincoln's Gettysburg Address."])).toBe(false);
    expect(isLiterature(['Help me plan tomorrow'])).toBe(false);
  });
});
