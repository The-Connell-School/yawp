import { describe, expect, test } from 'bun:test';
import { parseApTutorContext } from './ap-tutor-context';

describe('parseApTutorContext', () => {
  test('parses a synthesis context with sources', () => {
    const json = JSON.stringify({
      essayType: 'synthesis',
      sourcePassages: [
        { label: 'Source A', title: 'Doc', attribution: 'Smith', body: 'Text A' },
        { label: 'Source B', body: 'Text B' },
      ],
      teacherNotes: 'Focus on synthesis.',
    });
    const result = parseApTutorContext(json);
    expect(result).not.toBeNull();
    expect(result!.essayType).toBe('synthesis');
    expect(result!.sourcePassages).toHaveLength(2);
    expect(result!.sourcePassages[0].title).toBe('Doc');
    expect(result!.teacherNotes).toBe('Focus on synthesis.');
  });

  test('parses an argument context with no sources', () => {
    const json = JSON.stringify({ essayType: 'argument' });
    const result = parseApTutorContext(json);
    expect(result).not.toBeNull();
    expect(result!.essayType).toBe('argument');
    expect(result!.sourcePassages).toEqual([]);
  });

  test('returns null for plain-text tutorContext (non-AP)', () => {
    expect(parseApTutorContext('Focus on thesis clarity.')).toBeNull();
  });

  test('returns null for null/undefined', () => {
    expect(parseApTutorContext(null)).toBeNull();
    expect(parseApTutorContext(undefined)).toBeNull();
  });

  test('returns null for JSON without a valid essayType', () => {
    expect(parseApTutorContext(JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(
      parseApTutorContext(JSON.stringify({ essayType: 'not-real' }))
    ).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseApTutorContext('{ broken')).toBeNull();
  });

  test('drops source passages with empty bodies', () => {
    const json = JSON.stringify({
      essayType: 'synthesis',
      sourcePassages: [
        { label: 'Source A', body: 'Real text' },
        { label: 'Source B', body: '' },
        { label: 'Source C' },
      ],
    });
    const result = parseApTutorContext(json);
    expect(result!.sourcePassages).toHaveLength(1);
    expect(result!.sourcePassages[0].label).toBe('Source A');
  });

  test('defaults missing label to "Source"', () => {
    const json = JSON.stringify({
      essayType: 'synthesis',
      sourcePassages: [{ body: 'Text' }],
    });
    const result = parseApTutorContext(json);
    expect(result!.sourcePassages[0].label).toBe('Source');
  });
});
