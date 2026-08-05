import { describe, expect, test } from 'bun:test';
import { blockText, inlineRuns, markdownBlocks } from './markdown-blocks';

describe('markdownBlocks — the shape of a lesson', () => {
  test('reads headings at the level they were written', () => {
    const blocks = markdownBlocks('# One\n\n## Two\n\n### Three');
    expect(blocks.map((block) => [block.kind, blockText(block)])).toEqual([
      ['heading', 'One'],
      ['heading', 'Two'],
      ['heading', 'Three'],
    ]);
    expect(blocks.map((block) => (block as any).level)).toEqual([1, 2, 3]);
  });

  test('flattens a deeper heading rather than inventing a size for it', () => {
    expect((markdownBlocks('##### Five')[0] as any).level).toBe(3);
  });

  test('keeps paragraphs apart', () => {
    const blocks = markdownBlocks('First para.\n\nSecond para.');
    expect(blocks.map(blockText)).toEqual(['First para.', 'Second para.']);
  });

  test('numbers an ordered list from where it starts', () => {
    const blocks = markdownBlocks('3. Third\n4. Fourth');
    expect(blocks.map((block) => (block as any).marker)).toEqual(['3.', '4.']);
  });

  test('gives an unordered list a bullet', () => {
    const blocks = markdownBlocks('- One\n- Two');
    expect(blocks.map((block) => (block as any).marker)).toEqual(['•', '•']);
    expect(blocks.map(blockText)).toEqual(['One', 'Two']);
  });

  test('indents a nested list and changes its marker', () => {
    const blocks = markdownBlocks('- Outer\n    - Inner');
    expect(
      blocks.map((block) => [(block as any).depth, (block as any).marker])
    ).toEqual([
      [0, '•'],
      [1, '–'],
    ]);
  });

  test('turns every paragraph of a blockquote into a quoted line', () => {
    const blocks = markdownBlocks('> What made it land?\n>\n> Write for four.');
    expect(blocks.map((block) => block.kind)).toEqual(['quote', 'quote']);
    expect(blocks.map(blockText)).toEqual([
      'What made it land?',
      'Write for four.',
    ]);
  });

  test('keeps a horizontal rule', () => {
    expect(markdownBlocks('a\n\n---\n\nb').map((b) => b.kind)).toEqual([
      'paragraph',
      'rule',
      'paragraph',
    ]);
  });

  test('reads a table as a header row and its rows', () => {
    const blocks = markdownBlocks(
      '| Time | Move |\n| - | - |\n| 5 min | Write |'
    );
    expect(blocks.map((block) => block.kind)).toEqual(['tableRow', 'tableRow']);
    expect((blocks[0] as any).header).toBe(true);
    expect(blockText(blocks[0]!)).toBe('Time | Move');
    expect((blocks[1] as any).header).toBe(false);
    expect(blockText(blocks[1]!)).toBe('5 min | Write');
  });

  test('never silently drops content it does not recognise', () => {
    const blocks = markdownBlocks('```\nkeep me\n```');
    expect(blocks.map(blockText).join('')).toContain('keep me');
  });

  test('handles an empty document without throwing', () => {
    expect(markdownBlocks('')).toEqual([]);
  });
});

describe('inlineRuns — emphasis survives the trip', () => {
  test('marks a bold run bold and leaves the rest plain', () => {
    const [block] = markdownBlocks('Give them **four minutes** to write.');
    expect((block as any).runs).toEqual([
      { text: 'Give them ' },
      { text: 'four minutes', bold: true },
      { text: ' to write.' },
    ]);
  });

  test('carries emphasis down through nesting', () => {
    const [block] = markdownBlocks('**bold with *italic* inside**');
    expect((block as any).runs).toEqual([
      { text: 'bold with ', bold: true },
      { text: 'italic', bold: true, italic: true },
      { text: ' inside', bold: true },
    ]);
  });

  test('keeps a link’s address so it can stay clickable', () => {
    const [block] = markdownBlocks('Open [the deck](/app/decks/1).');
    expect((block as any).runs).toEqual([
      { text: 'Open ' },
      { text: 'the deck', href: '/app/decks/1' },
      { text: '.' },
    ]);
  });

  test('marks inline code as fixed width', () => {
    const [block] = markdownBlocks('Type `so what?` on the board.');
    expect((block as any).runs[1]).toEqual({ text: 'so what?', mono: true });
  });

  test('merges neighbours that share a style', () => {
    expect(
      inlineRuns([
        { type: 'text', text: 'one ' },
        { type: 'text', text: 'two' },
      ])
    ).toEqual([{ text: 'one two' }]);
  });

  test('drops empty runs rather than emitting nothing-text', () => {
    expect(
      inlineRuns([
        { type: 'text', text: '' },
        { type: 'text', text: 'real' },
      ])
    ).toEqual([{ text: 'real' }]);
  });
});
