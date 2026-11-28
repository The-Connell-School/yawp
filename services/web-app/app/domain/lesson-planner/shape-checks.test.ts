import { describe, expect, it } from 'bun:test';
import { checkDuringProblems, modelFirstProblems } from './shape-checks';

/** A lesson in the planner's own form: `##` steps with minutes. */
const lesson = (...steps: Array<[string, string]>) =>
  `# A lesson\n\n${steps.map(([title, body]) => `## ${title}\n${body}`).join('\n\n')}`;

// Of Mice and Men, Nov 24 types test: S4 fail, S6 fail.
const MICE = lesson(
  ['Class starter (5 min)', 'Students write to the prompt. Take two or three shares.'],
  ['Context (10 min)', 'Teach the 1930s: the Depression, migrant workers, the Salinas Valley. Define bindle and recumbent.'],
  ['Read Chapter 1 (15 min)', 'Read aloud from the opening. Students mark one detail about George and one about Lennie that tells you who he is.'],
  ['Discussion and close reading (12 min)', 'Pairs compare what they marked. Take two or three answers.'],
  ['Short Response (5 min)', 'Students write in Yawp!.'],
  ['Closing (3 min)', 'Exit ticket.']
);

describe('checkDuringProblems (S6: check understanding during the lesson)', () => {
  it('finds a lesson where nobody checks the whole class at once (Of Mice and Men; Macbeth "take five answers")', () => {
    const problems = checkDuringProblems(MICE);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('everyone answers at once');
    expect(problems[0]!.what).toContain('if most of the class misses it');
    expect(problems[0]!.words).toBe('## Context (10 min)');
    expect(problems[0]!.note).toContain('check');
  });

  it('asks only for the plan for a miss when everyone already answers ("The Necklace": students jot one word)', () => {
    const necklace = MICE.replace('Pairs compare what they marked. Take two or three answers.', 'After each chunk, every student jots one word that describes Mathilde on a sticky note.');
    const problems = checkDuringProblems(necklace);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('what to do if most of the class misses it');
    expect(problems[0]!.what).not.toContain('one question with a right answer that everyone answers at once');
  });

  it('is satisfied by an all-respond check with a plan for a miss (the research lesson)', () => {
    const research = MICE.replace(
      'Pairs compare what they marked. Take two or three answers.',
      'Quick check: students write one word on a scrap of paper or hold up fingers. If most say only one criterion, reteach it with the second example. If the room is split, ask two students with different answers to explain.'
    );
    expect(checkDuringProblems(research)).toEqual([]);
    const whiteboards = MICE.replace('Take two or three answers.', 'Everyone shows the answer on a mini-whiteboard. If more than half miss it, reread the first page together.');
    expect(checkDuringProblems(whiteboards)).toEqual([]);
  });

  it('leaves alone a unit map and a reply that is not a lesson', () => {
    expect(checkDuringProblems('```yawp-unit\n{"days":[]}\n```\n\n## Day 1 (50 min)\nRead.\n\n## Day 2 (50 min)\nRead.')).toEqual([]);
    expect(checkDuringProblems('Here are three exit tickets for tomorrow.')).toEqual([]);
  });
});

describe('modelFirstProblems (S4: model first, then let them try)', () => {
  it('finds a close reading with no model before it (Of Mice and Men: "mark one detail about George")', () => {
    const problems = modelFirstProblems(MICE);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('Read Chapter 1');
    expect(problems[0]!.what).toContain('thinking aloud');
    expect(problems[0]!.words).toBe('## Read Chapter 1 (15 min)');
  });

  it('is satisfied by a model in that step or before it (Macbeth: think aloud on line 1; grammar: Model aloud, I do)', () => {
    const macbeth = MICE.replace('Read aloud from the opening.', "Read aloud from the opening. Model first: think aloud on the first sentence, \"I'd underline 'deep and green'\", then let them try.");
    expect(modelFirstProblems(macbeth)).toEqual([]);
    const grammar = lesson(
      ['Starter (4 min)', 'Write.'],
      ['Mini-lesson (12 min)', 'Model aloud — I do (2 min): fix a comma splice on the board. We do (3 min).'],
      ['Guided practice (10 min)', 'Students write their own sentences and correct the handout items.'],
      ['Exit ticket (5 min)', 'Exit.']
    );
    expect(modelFirstProblems(grammar)).toEqual([]);
  });

  it('does not count a model that comes after students have already tried', () => {
    const late = MICE.replace('Pairs compare what they marked.', 'Now model one annotation aloud on the first sentence. Pairs compare what they marked.');
    expect(modelFirstProblems(late)).toHaveLength(1);
  });

  it('does not take a step that only mentions the close reading to come for the close reading itself (Odyssey, Gatsby)', () => {
    const odyssey = lesson(
      ['Starter (5 min)', 'Write.'],
      ['Context: Odysseus and the heroic code (8 min)', 'Before the close reading, give students the frame they need: kleos, xenia, metis.'],
      ['Mini-lesson: what an unreliable narrator is (5 min)', 'Students will use these as a lens in the close reading.'],
      ['Close reading (15 min)', 'Model first: think aloud on line 1. Then students annotate lines 216–230.'],
      ['Exit (5 min)', 'Exit.']
    );
    expect(modelFirstProblems(odyssey)).toEqual([]);
  });

  it('leaves alone a lesson where students neither close-read nor write at length', () => {
    const talk = lesson(['Starter (5 min)', 'Write a sentence.'], ['Seminar round 1 (20 min)', 'Discuss question 1.'], ['Seminar round 2 (20 min)', 'Discuss question 2.'], ['Exit (5 min)', 'Exit.']);
    expect(modelFirstProblems(talk)).toEqual([]);
  });
});
