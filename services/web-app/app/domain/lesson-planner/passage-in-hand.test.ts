import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { passageNotInHand } from './passage-in-hand';

const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

/** A reply with one read slide and a handout, in the planner's own formats. */
function reply({ body, title = 'Chapter 1: The Opening', handout = 'Write two sentences about the river.', excerpt = false }: { body: string; title?: string; handout?: string; excerpt?: boolean }) {
  const slides = [
    { layout: 'title', title: 'Into the Valley', subtitle: 'Of Mice and Men' },
    ...(excerpt ? [{ layout: 'excerpt', title: 'The opening', body: 'A few miles south of Soledad, the Salinas River drops in close to the hillside bank.' }] : []),
    { layout: 'read', title, body, minutes: 14, tasks: [{ verb: 'Mark', text: 'one detail about George that tells you who he is' }] },
  ];
  return `# Into the Valley

## Read Chapter 1 (14 min)
Read aloud from the opening.

\`\`\`yawp-material
kind: handout
title: Chapter 1 handout
---
${handout}
\`\`\`

\`\`\`yawp-slides
${JSON.stringify({ title: 'Into the Valley', slides })}
\`\`\``;
}

describe('passageNotInHand (S1 and R9: no reading without the reading)', () => {
  it('finds a slide where students mark a passage that is nowhere in their hands (Of Mice and Men, Nov 24)', () => {
    const problems = passageNotInHand(reply({ body: 'Follow along. Mark one detail about George and one about Lennie.' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('Chapter 1: The Opening');
    expect(problems[0]!.what).toContain('labeled slot');
    expect(problems[0]!.what).toContain('copyright');
    expect(problems[0]!.words).toBe('Follow along. Mark one detail about George and one about Lennie.');
    expect(problems[0]!.note).toContain('Chapter 1: The Opening');
  });

  it('is satisfied when the slide says exactly where the passage runs', () => {
    expect(passageNotInHand(reply({ body: 'Read lines 216–230. His men beg him to take the cheese and go.' }))).toEqual([]);
    expect(passageNotInHand(reply({ body: 'Read pages 1–4, then mark one detail about each man.' }))).toEqual([]);
    expect(passageNotInHand(reply({ body: "Read from Macbeth's entrance to the end of his first aside." }))).toEqual([]);
  });

  it('is satisfied when the passage is printed on the handout or on a slide', () => {
    const printed = '> A few miles south of Soledad, the Salinas River drops in close to the hillside bank and runs deep and green.\n> The water is warm too, for it has slipped twinkling over the yellow sands in the sunlight.';
    expect(passageNotInHand(reply({ body: 'Follow along and mark.', handout: printed }))).toEqual([]);
    expect(passageNotInHand(reply({ body: 'Follow along and mark.', excerpt: true }))).toEqual([]);
  });

  it('is satisfied by a labeled slot for the teacher\'s own pages', () => {
    expect(passageNotInHand(reply({ body: 'Follow along and mark.', handout: '[The passage: print the opening pages of Chapter 1 from your copy here.]' }))).toEqual([]);
  });

  it('leaves a read slide with no marking task alone, and a reply with no deck', () => {
    const quiet = reply({ body: 'Listen as the teacher reads.' }).replace('"verb":"Mark","text":"one detail about George that tells you who he is"', '"verb":"Listen","text":"for the sound of the river"');
    expect(passageNotInHand(quiet)).toEqual([]);
    expect(passageNotInHand('# A plan\n\n## Read (10 min)\nAnnotate the chapter.')).toEqual([]);
  });

  it('finds nothing wrong in the saved Macbeth and Odyssey replies, which say where to read', () => {
    expect(passageNotInHand(fixture('printables-macbeth-reply.md'))).toEqual([]);
    expect(passageNotInHand(fixture('printables-odyssey-reply.md'))).toEqual([]);
  });
});

describe('passageNotInHand on the fiction run of Nov 28', () => {
  const STORY = `## "The Necklace"
*Guy de Maupassant, 1884 · translated by Jonathan Sturges (public domain)*

**As you read:** Put a small star next to any moment where Mathilde makes a choice.

She was one of those pretty and charming girls who are sometimes, as if by a mistake of destiny, born in a family of clerks. She had no dowry, no expectations, no means of being known, understood, loved, or wedded by any rich and distinguished man; and she let herself be married to a little clerk at the Ministry of Public Instruction.

She dressed plainly because she could not dress well, but she was as unhappy as though she had really fallen from her proper station, since with women there is neither caste nor rank; and beauty, grace, and charm act instead of family and birth.

She suffered ceaselessly, feeling herself born for all the delicacies and all the luxuries. She suffered from the poverty of her dwelling, from the wretched look of the walls, from the worn-out chairs, from the ugliness of the curtains.`;

  it('sees a story printed as plain paragraphs as in hand (The Necklace: a slot was added above the full story)', () => {
    expect(passageNotInHand(reply({ body: 'Follow along. Star any moment where Mathilde makes a choice.', handout: STORY }))).toEqual([]);
  });

  it('does not take the speaker notes, which students never see, for the slide saying where the passage runs (Of Mice and Men)', () => {
    const notes = reply({ body: 'Follow along and mark one detail about George and one about Lennie.' }).replace(
      '"minutes":14,',
      '"speakerNotes":"Read from the opening description of the Salinas River through George\'s line about living alone.","minutes":14,'
    );
    expect(passageNotInHand(notes)).toHaveLength(1);
  });

  it('asks for the text or a slot even when the slide says where, when students mark a handout with nothing on it', () => {
    const directions = reply({
      body: 'Read pages 1–4. Mark one detail about George and one about Lennie.',
      handout: '**Reading passage:** Chapter 1, from the opening description of the Salinas River through George\'s line about living alone.\n\n1. **Underline** one detail of the setting.',
    });
    const problems = passageNotInHand(directions);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('labeled slot');
  });
});
