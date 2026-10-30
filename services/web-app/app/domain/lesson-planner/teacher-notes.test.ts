import { describe, expect, test } from 'bun:test';
import { NOTE_SECTIONS, notesFallback, noteSections, readTeacherNotes, stepsWithoutNotes } from './teacher-notes';

describe('teacher notes (Oct 24 handoff, task 7)', () => {
  test('labeled sections, each in full, in the order written', () => {
    expect(
      noteSections('Open with: Ask who has lost something.\nSay: Today we read a list.\nIt is a long one.\n\nMove on when: every pen is down.')
    ).toEqual([
      { heading: 'Open with', body: 'Ask who has lost something.' },
      { heading: 'Say', body: 'Today we read a list.\nIt is a long one.' },
      { heading: 'Move on when', body: 'every pen is down.' },
    ]);
    expect(NOTE_SECTIONS).toEqual(['Open with', 'Say', 'Ask', 'Listen for', 'Connect back', 'Move on when']);
  });

  test('text before any heading, or with none, is one plain section', () => {
    expect(noteSections('Just read it aloud.')).toEqual([{ heading: null, body: 'Just read it aloud.' }]);
    expect(noteSections('Warm up first.\nAsk: why?')).toEqual([
      { heading: null, body: 'Warm up first.' },
      { heading: 'Ask', body: 'why?' },
    ]);
    expect(noteSections('   ')).toEqual([]);
  });

  test('a stored map keeps only text', () => {
    expect(readTeacherNotes({ a: 'Say: hi', b: 3, c: '' })).toEqual({ a: 'Say: hi' });
    expect(readTeacherNotes(null)).toEqual({});
    expect(readTeacherNotes(['x'])).toEqual({});
  });

  test("with no notes yet, the step's own text, without its Markdown", () => {
    expect(notesFallback('## Read aloud\n\n**Read** the opening.\n\n```yawp-x\n{}\n```')).toBe('Read aloud\nRead the opening.');
  });

  test('the steps that still need notes', () => {
    expect(stepsWithoutNotes([{ id: 'a' }, { id: 'b' }], { a: 'Say: x' })).toEqual([{ id: 'b' }]);
  });
});
