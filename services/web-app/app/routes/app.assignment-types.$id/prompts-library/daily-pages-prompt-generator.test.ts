import { describe, expect, test } from 'bun:test';
import {
  formatOptionTags,
  parseInlineSegments,
  parseReplyBlocks,
} from './daily-pages-prompt-generator';

describe('parseReplyBlocks', () => {
  test('splits blank-line-separated text into paragraphs', () => {
    const blocks = parseReplyBlocks('First thought.\n\nSecond thought.');
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'First thought.' },
      { kind: 'paragraph', text: 'Second thought.' },
    ]);
  });

  test('recognizes a bullet list', () => {
    const blocks = parseReplyBlocks(
      'Pick an angle:\n\n- Identity\n- Belonging\n- Change'
    );
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: 'Pick an angle:' });
    expect(blocks[1]).toEqual({
      kind: 'bullet',
      items: ['Identity', 'Belonging', 'Change'],
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

describe('formatOptionTags', () => {
  test('reads a draft the way a library row does', () => {
    expect(
      formatOptionTags({
        prompt: 'Agree or disagree.',
        type: 'agree-disagree',
        seriousness: 'moderate',
        cognitiveMoves: ['take-a-stance', 'complicate'],
      })
    ).toEqual(['Agree / disagree', 'Moderate', 'Take a stance', 'Complicate']);
  });

  test('omits tags the model left off', () => {
    expect(formatOptionTags({ prompt: 'Just the prompt.' })).toEqual([]);
    expect(
      formatOptionTags({ prompt: 'Half tagged.', seriousness: 'playful' })
    ).toEqual(['Playful']);
  });
});
