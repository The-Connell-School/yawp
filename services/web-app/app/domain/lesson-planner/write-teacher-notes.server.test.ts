import { describe, expect, test } from 'bun:test';
import { TEACHER_NOTES_SYSTEM, writeTeacherNotes } from './write-teacher-notes.server';

const steps = [
  { id: 'a', title: 'Class starter', minutes: 5, content: 'Write about one thing you carry.' },
  { id: 'b', title: 'Read aloud', minutes: 20, content: 'Read the opening list.' },
];

describe('writeTeacherNotes (Oct 24 handoff, task 7)', () => {
  test('one call for every step; notes come back keyed by step', async () => {
    let calls = 0;
    let asked = '';
    const notes = await writeTeacherNotes({
      title: 'Day 1',
      className: 'English 11',
      steps,
      complete: async (user) => {
        calls += 1;
        asked = user;
        return `Here you go: ${JSON.stringify({
          steps: [
            { notes: 'Open with: Ask what is in their pocket.\nMove on when: pens are down.' },
            { notes: 'Say: Listen for the weight of each thing.' },
          ],
        })}`;
      },
    });
    expect(calls).toBe(1);
    expect(asked).toContain('1. Class starter (5 min)');
    expect(asked).toContain('Read the opening list.');
    expect(notes).toEqual({
      a: 'Open with: Ask what is in their pocket.\nMove on when: pens are down.',
      b: 'Say: Listen for the weight of each thing.',
    });
    expect(TEACHER_NOTES_SYSTEM).toContain('Open with');
    expect(TEACHER_NOTES_SYSTEM).toContain('Move on when');
  });

  test('a reply that does not match the steps, or a failed call, writes nothing', async () => {
    expect(await writeTeacherNotes({ title: 'D', className: null, steps, complete: async () => '{"steps":[{"notes":"x"}]}' })).toBeNull();
    expect(
      await writeTeacherNotes({
        title: 'D',
        className: null,
        steps,
        complete: async () => {
          throw new Error('over budget');
        },
      })
    ).toBeNull();
    expect(await writeTeacherNotes({ title: 'D', className: null, steps: [], complete: async () => '' })).toBeNull();
  });
});
