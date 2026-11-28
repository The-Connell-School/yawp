import { describe, expect, it } from 'bun:test';
import { passageWithoutGlosses } from './passage-glosses';

const OZYMANDIAS = `I met a traveller from an antique land,
Who said—"Two vast and trunkless legs of stone
Stand in the desert. . . . Near them, on the sand,
Half sunk a shattered visage lies, whose frown,
And wrinkled lip, and sneer of cold command,
Tell that its sculptor well those passions read
Which yet survive, stamped on these lifeless things,
The hand that mocked them, and the heart that fed;`;

function reply({ terms = [] as Array<{ word: string; definition: string }>, handoutExtra = '', work = 'Ozymandias', body = OZYMANDIAS, source = '— Percy Bysshe Shelley, "Ozymandias"' }) {
  const slides = [
    { layout: 'title', title: 'Ozymandias', subtitle: 'Close reading' },
    ...(terms.length ? [{ layout: 'define', title: 'Words for the poem', terms }] : []),
    { layout: 'excerpt', title: 'The full poem', body, work, author: 'Percy Bysshe Shelley' },
  ];
  const quoted = body.split('\n').map((line) => `> ${line}`).join('\n');
  return `# Ozymandias

## Read the poem (8 min)
Read it aloud twice.

\`\`\`yawp-material
kind: handout
title: Ozymandias handout
---
${quoted}

${source}
${handoutExtra}
1. What is left of the statue?
\`\`\`

\`\`\`yawp-slides
${JSON.stringify({ title: 'Ozymandias', slides })}
\`\`\``;
}

describe('passageWithoutGlosses (R5, S5: the passage’s hard words glossed where students meet them)', () => {
  it('finds a printed poem none of whose words are glossed ("Ozymandias", Nov 24)', () => {
    const problems = passageWithoutGlosses(reply({}));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('Ozymandias');
    expect(problems[0]!.what).toContain('Words to know');
    expect(problems[0]!.words).toContain('Percy Bysshe Shelley');
    expect(problems[0]!.note).toContain('Ozymandias');
  });

  it('finds one whose define slide teaches only words that are not in the passage (Macbeth: thane, weird, prophecy)', () => {
    const problems = passageWithoutGlosses(reply({ terms: [{ word: 'Thane', definition: 'A Scottish lord.' }, { word: 'Prophecy', definition: 'A statement of what will happen.' }] }));
    expect(problems).toHaveLength(1);
  });

  it('is satisfied by a define slide with a word from the passage, or a gloss list on the handout', () => {
    expect(passageWithoutGlosses(reply({ terms: [{ word: 'visage', definition: 'A face.' }] }))).toEqual([]);
    expect(passageWithoutGlosses(reply({ handoutExtra: '\n**Words to know:** *antique*: ancient · *visage*: face · *mocked*: imitated\n' }))).toEqual([]);
  });

  it('leaves alone a model paragraph the lesson wrote, a short quotation, and a reply with no deck', () => {
    expect(passageWithoutGlosses(reply({ work: 'Model essay', source: '— Model essay, written for practice' }))).toEqual([]);
    expect(passageWithoutGlosses(reply({ body: 'I met a traveller from an antique land,\nWho said—"Two vast and trunkless legs of stone' }))).toEqual([]);
    expect(passageWithoutGlosses('# Plan\n\n> I met a traveller from an antique land')).toEqual([]);
  });
});

describe('passageWithoutGlosses on a story printed as plain paragraphs (The Necklace, Nov 28: "paste" glossed nowhere)', () => {
  const story = (extra = '') => `# The Necklace

\`\`\`yawp-material
kind: handout
title: The Necklace — Reading and Discussion
---
## "The Necklace"
*Guy de Maupassant, 1884 · translated by Jonathan Sturges*
${extra}
She was one of those pretty and charming girls who are sometimes, as if by a mistake of destiny, born in a family of clerks. She had no dowry, no expectations, no means of being known, understood, loved, or wedded by any rich and distinguished man; and she let herself be married to a little clerk at the Ministry of Public Instruction.

She dressed plainly because she could not dress well, but she was as unhappy as though she had really fallen from her proper station, since with women there is neither caste nor rank; and beauty, grace, and charm act instead of family and birth.

She suffered ceaselessly, feeling herself born for all the delicacies and all the luxuries. She suffered from the poverty of her dwelling, from the wretched look of the walls, from the worn-out chairs, from the ugliness of the curtains.
\`\`\``;
  it('finds the story with none of its words glossed', () => {
    const problems = passageWithoutGlosses(story());
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('The Necklace');
  });
  it('is satisfied by a gloss list on the handout', () => {
    expect(passageWithoutGlosses(story('\n**Words to know:** *dowry*: money a bride brings · *paste*: fake jewels\n'))).toEqual([]);
  });
});

describe('passageWithoutGlosses on quoted passages with no source line (Gatsby, Nov 28)', () => {
  const gatsby = `# Gatsby

\`\`\`yawp-material
kind: handout
title: The Great Gatsby — Chapter 1 Opening: Close Reading
---
### Passage A

> "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since. 'Whenever you feel like criticizing anyone,' he told me, 'just remember that all the people in this world haven't had the advantages that you've had.'"

**Questions:** 1. What does Nick's father tell him?
\`\`\``;
  it('reads them in a literature lesson', () => {
    expect(passageWithoutGlosses(gatsby, { literature: true })).toHaveLength(1);
  });
  it('leaves them alone in any other lesson, where a quoted paragraph is often the lesson\'s own model', () => {
    expect(passageWithoutGlosses(gatsby)).toEqual([]);
  });
});
