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
