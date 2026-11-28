import { describe, expect, it } from 'bun:test';
import { printedFromMemory } from './memory-quotes';

// To Kill a Mockingbird ch. 10 and The Outsiders ch. 1 (fiction run, Nov 28):
// handouts printed passages recalled from memory, one "paraphrased from memory".
const handout = (body: string) => `# Chapter 10

\`\`\`yawp-material
kind: handout
title: Chapter 10 — The Mad Dog
---
## Passage 1

${body}

1. What does Scout notice about her father?
\`\`\``;
const RECALLED = '> "Atticus was feeble: he was nearly fifty. When Jem and I asked him why he was so old, he said he got started late, which we felt reflected upon his abilities and manliness. He was much older than the parents of our school contemporaries, and there was nothing Jem or I could say about him when our classmates said, My father."';

describe('printedFromMemory (R24: a work Yawp! cannot check is never quoted from memory)', () => {
  it('finds a passage printed for students from a literature work Yawp! has no copy of', () => {
    const problems = printedFromMemory(handout(RECALLED), { checked: false, literature: true });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('labeled slot');
    expect(problems[0]!.what).toContain('in copyright');
    expect(problems[0]!.words).toContain('Atticus was feeble');
    expect(problems[0]!.note).toContain('from memory');
  });

  it('finds one printed as plain paragraphs too', () => {
    const prose = RECALLED.replace(/^> "/, '').replace(/"$/, '');
    const long = `${prose}\n\n${prose.replace('Atticus was feeble', 'Our father was feeble')}`;
    expect(printedFromMemory(handout(long), { checked: false, literature: true })).toHaveLength(1);
  });

  it('leaves alone a passage Yawp! checked against the book, or the teacher\'s pages', () => {
    expect(printedFromMemory(handout(RECALLED), { checked: true, literature: true })).toEqual([]);
  });

  it('leaves alone a skill lesson, a short quotation, and a model written for practice', () => {
    expect(printedFromMemory(handout(RECALLED), { checked: false, literature: false })).toEqual([]);
    expect(printedFromMemory(handout('> "Atticus was feeble: he was nearly fifty."'), { checked: false, literature: true })).toEqual([]);
    const model = handout(RECALLED).replace('title: Chapter 10 — The Mad Dog', 'title: Model paragraph, written for practice');
    expect(printedFromMemory(model, { checked: false, literature: true })).toEqual([]);
  });
});
