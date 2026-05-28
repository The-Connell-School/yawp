import { describe, expect, test } from 'bun:test';
import { parsePoetryLines } from './parse-poetry-lines';

describe('parsePoetryLines', () => {
  test('assigns sequential line numbers to non-empty lines', () => {
    const lines = parsePoetryLines('Line one\nLine two\nLine three');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ text: 'Line one', lineNumber: 1, isStanzaBreak: false });
    expect(lines[1]).toEqual({ text: 'Line two', lineNumber: 2, isStanzaBreak: false });
    expect(lines[2]).toEqual({ text: 'Line three', lineNumber: 3, isStanzaBreak: false });
  });

  test('marks empty lines as stanza breaks with lineNumber 0', () => {
    const lines = parsePoetryLines('First stanza line\n\nSecond stanza line');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ text: 'First stanza line', lineNumber: 1, isStanzaBreak: false });
    expect(lines[1]).toEqual({ text: '', lineNumber: 0, isStanzaBreak: true });
    expect(lines[2]).toEqual({ text: 'Second stanza line', lineNumber: 2, isStanzaBreak: false });
  });

  test('handles multiple stanza breaks', () => {
    const poem = 'Line 1\nLine 2\n\nLine 3\nLine 4\n\nLine 5';
    const lines = parsePoetryLines(poem);
    const stanzaBreaks = lines.filter((l) => l.isStanzaBreak);
    expect(stanzaBreaks).toHaveLength(2);
    const numbered = lines.filter((l) => !l.isStanzaBreak);
    expect(numbered).toHaveLength(5);
    expect(numbered[4].lineNumber).toBe(5);
  });

  test('handles empty input', () => {
    const lines = parsePoetryLines('');
    expect(lines).toHaveLength(1);
    expect(lines[0].isStanzaBreak).toBe(true);
  });

  test('preserves indentation in line text', () => {
    const lines = parsePoetryLines('  Indented line\nNormal line');
    expect(lines[0].text).toBe('  Indented line');
    expect(lines[1].text).toBe('Normal line');
  });
});
