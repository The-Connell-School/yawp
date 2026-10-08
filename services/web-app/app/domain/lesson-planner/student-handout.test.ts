import { describe, expect, test } from 'bun:test';
import { buildLessonPacket } from './lesson-packet';
import { buildStudentHandout } from './student-handout';

const packet = buildLessonPacket({
  title: 'Evidence that earns its place',
  className: 'English 10 · Period 3',
  sections: [
    {
      id: 'msg-1',
      content: '## Lesson Sequence\n\nWarm-up, mini-lesson, practice.',
      keptAudience: 'teacher',
    },
    {
      id: 'material-1',
      content: '## Diagnose & Repair\n\nRead each excerpt.',
      keptAudience: 'student',
      keptTitle: 'Diagnose & Repair',
      kind: 'handout',
      origin: 'material',
    },
    {
      id: 'material-2',
      content: 'Write one explanation sentence for the quote below.',
      keptAudience: 'student',
      keptTitle: 'Evidence Exit Ticket',
      kind: 'handout',
      origin: 'material',
    },
    {
      id: 'material-3',
      content: '1. b\n2. a',
      keptAudience: 'teacher',
      keptTitle: 'Answer key',
      kind: 'plan',
      origin: 'material',
    },
  ],
});

describe('buildStudentHandout', () => {
  const handout = buildStudentHandout({ packet });

  test('is one document made of the pieces students actually get', () => {
    expect(handout.title).toBe('Evidence that earns its place');
    expect(handout.parts.map((part) => part.title)).toEqual([
      'Diagnose & Repair',
      'Evidence Exit Ticket',
    ]);
  });

  test('leaves the teacher’s own pages out of it', () => {
    const titles = handout.parts.map((part) => part.title);
    expect(titles).not.toContain('Lesson Sequence');
    expect(titles).not.toContain('Answer key');
  });

  test('numbers the parts so a class can be led through them', () => {
    expect(handout.parts.map((part) => part.number)).toEqual([1, 2]);
  });

  test('keeps the pieces in lesson order', () => {
    expect(handout.parts[0]!.content).toContain('Read each excerpt');
    expect(handout.parts[1]!.content).toContain('Write one explanation');
  });

  test('leaves out the pieces the teacher took out', () => {
    const trimmed = buildStudentHandout({
      packet,
      excluded: ['material-1'],
    });
    expect(trimmed.parts.map((part) => part.title)).toEqual([
      'Evidence Exit Ticket',
    ]);
    // Numbering follows what is actually on the page.
    expect(trimmed.parts[0]!.number).toBe(1);
  });

  test('is empty when nothing in the lesson is for students', () => {
    const teacherOnly = buildLessonPacket({
      title: 'Plan',
      className: null,
      sections: [{ id: 'a', content: '## Plan', keptAudience: 'teacher' }],
    });
    expect(buildStudentHandout({ packet: teacherOnly }).parts).toEqual([]);
  });
});

describe('buildStudentHandout — material still inside a kept reply', () => {
  const withNested = buildLessonPacket({
    title: 'Evidence lesson',
    className: null,
    sections: [
      {
        id: 'msg-1',
        content: [
          '## Lesson Sequence',
          '',
          'Hand out the practice set.',
          '',
          '```yawp-material',
          'kind: handout',
          'title: Quote Sandwich Practice',
          '---',
          'Rewrite each one.',
          '```',
          '',
          '```yawp-material',
          'kind: answer-key',
          'title: Key',
          '---',
          '1. b',
          '```',
        ].join('\n'),
        keptAudience: 'teacher',
      },
    ],
  });

  test('picks up a handout the teacher kept as part of the whole reply', () => {
    const handout = buildStudentHandout({ packet: withNested });
    expect(handout.parts.map((part) => part.title)).toEqual([
      'Quote Sandwich Practice',
    ]);
    expect(handout.parts[0]!.content).toContain('Rewrite each one.');
  });

  test('gives nested pieces their own id so one can be left out', () => {
    const handout = buildStudentHandout({ packet: withNested });
    const trimmed = buildStudentHandout({
      packet: withNested,
      excluded: [handout.parts[0]!.id],
    });
    expect(trimmed.parts).toEqual([]);
  });
});
