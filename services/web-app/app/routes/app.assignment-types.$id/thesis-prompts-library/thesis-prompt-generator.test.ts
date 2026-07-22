import { describe, expect, test } from 'bun:test';
import {
  parseInlineSegments,
  parseReplyBlocks,
} from './thesis-prompt-generator';

describe('parseReplyBlocks', () => {
  test('splits blank-line-separated text into paragraphs', () => {
    const blocks = parseReplyBlocks('First thought.\n\nSecond thought.');
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'First thought.' },
      { kind: 'paragraph', text: 'Second thought.' },
    ]);
  });

  test('recognizes a bullet list', () => {
    const blocks = parseReplyBlocks('Pick an angle:\n\n- Duty vs. law\n- Loyalty\n- Fate');
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: 'Pick an angle:' });
    expect(blocks[1]).toEqual({
      kind: 'bullet',
      items: ['Duty vs. law', 'Loyalty', 'Fate'],
    });
  });

  test('recognizes a numbered list with either . or ) delimiters', () => {
    expect(parseReplyBlocks('1. One\n2. Two')[0]).toEqual({
      kind: 'ordered',
      items: ['One', 'Two'],
    });
    expect(parseReplyBlocks('1) One\n2) Two')[0]).toEqual({
      kind: 'ordered',
      items: ['One', 'Two'],
    });
  });

  test('drops empty blocks and trims surrounding whitespace', () => {
    expect(parseReplyBlocks('\n\n  Only one.  \n\n')).toEqual([
      { kind: 'paragraph', text: 'Only one.' },
    ]);
    expect(parseReplyBlocks('   ')).toEqual([]);
  });
});

describe('parseInlineSegments', () => {
  test('separates bold from plain runs', () => {
    expect(parseInlineSegments('Go **where the charge is** today')).toEqual([
      { bold: false, text: 'Go ' },
      { bold: true, text: 'where the charge is' },
      { bold: false, text: ' today' },
    ]);
  });

  test('handles plain text with no markup', () => {
    expect(parseInlineSegments('nothing bold here')).toEqual([
      { bold: false, text: 'nothing bold here' },
    ]);
  });

  test('handles multiple bold runs', () => {
    expect(parseInlineSegments('**one** and **two**')).toEqual([
      { bold: true, text: 'one' },
      { bold: false, text: ' and ' },
      { bold: true, text: 'two' },
    ]);
  });
});
