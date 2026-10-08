import { describe, expect, test } from 'bun:test';
import { readDocxParagraphs, readDocxText } from './docx';
import { readFixture } from './fixtures';

describe('readDocxParagraphs', () => {
  const paragraphs = readDocxParagraphs(readFixture('handout.docx'));

  test('reads the document in order', () => {
    expect(paragraphs[0]).toBe('Diagnose & Repair');
    expect(paragraphs[1]).toBe(
      'Read each excerpt. Underline the sentence that explains the quote.'
    );
  });

  test('honours a line break and a tab inside a paragraph', () => {
    expect(paragraphs[2]).toBe('Excerpt 1\nThe door slammed.\t(weak)');
  });

  test('keeps a blank paragraph', () => {
    // On a handout the empty line under a question is where a student writes.
    // Dropping it loses the only signal about how much room the page leaves.
    expect(paragraphs[3]).toBe('');
    expect(paragraphs[4]).toBe('Name:');
  });
});

describe('readDocxText', () => {
  test('reads as ordinary text', () => {
    expect(readDocxText(readFixture('handout.docx'))).toBe(
      'Diagnose & Repair\n' +
        'Read each excerpt. Underline the sentence that explains the quote.\n' +
        'Excerpt 1\nThe door slammed.\t(weak)\n\n' +
        'Name:'
    );
  });
});
