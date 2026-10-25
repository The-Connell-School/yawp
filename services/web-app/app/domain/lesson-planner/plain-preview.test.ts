import { describe, expect, test } from 'bun:test';
import { plainPreview, previewLine } from './plain-preview';

const RAW = /[#*`|]|\]\(|^\s*[-+] /m;

describe('previews never show raw formatting (Kevin, Oct 25, note 7)', () => {
  test('teacher notes with headings, bold, lists and a table read as words', () => {
    const notes = [
      '### Subject–object model',
      '**Open with:** ask who wanted something *because* a friend did.',
      '- Point to Cassius',
      '1. Then Brutus',
      '',
      '| Who | Wants |',
      '|---|---|',
      '| Cassius | Power |',
      '',
      'See [the excerpt](https://example.org) and `students` field.',
    ].join('\n');
    const plain = plainPreview(notes);
    expect(plain).not.toMatch(RAW);
    expect(plain).toBe(
      'Subject–object model Open with: ask who wanted something because a friend did. Point to Cassius Then Brutus Who · Wants Cassius · Power See the excerpt and students field.'
    );
  });

  test('fences, even unfinished ones, vanish; a long line is cut at a word', () => {
    expect(plainPreview('Before\n```yawp-daily-pages\nkind: class-starter\n```\nAfter')).toBe('Before After');
    expect(plainPreview('Start\n```yawp-slides\n{"title"')).toBe('Start');
    const long = previewLine('word '.repeat(80), 40);
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(41);
  });

  test('snake_case and arithmetic survive', () => {
    expect(plainPreview('Use 3 * 4 = 12 in class_starter time')).toBe('Use 3 4 = 12 in class_starter time');
  });
});
