import { describe, expect, test } from 'bun:test';
import { renameFields, startedAsHint } from './lesson-rename';

describe("rename a lesson (Oct 24 handoff, task 8)", () => {
  test('the first rename keeps the name it started as', () => {
    expect(
      renameFields({ title: 'Write an essay about The Catcher in the Rye', packetTitle: null, originalTitle: null }, '  Building a Thesis from Evidence ')
    ).toEqual({
      title: 'Building a Thesis from Evidence',
      packetTitle: null,
      originalTitle: 'Write an essay about The Catcher in the Rye',
    });
  });

  test('a later rename keeps the first name, and a packet name counts as the shown name', () => {
    expect(renameFields({ title: 'B', packetTitle: null, originalTitle: 'A' }, 'C')).toEqual({
      title: 'C',
      packetTitle: null,
      originalTitle: 'A',
    });
    expect(renameFields({ title: 'chat', packetTitle: 'Printed', originalTitle: null }, 'New')?.originalTitle).toBe('Printed');
  });

  test('an empty name changes nothing', () => {
    expect(renameFields({ title: 'A', packetTitle: null, originalTitle: null }, '   ')).toBeNull();
  });

  test('the hint under the input', () => {
    expect(startedAsHint('Write an essay about The Catcher in the Rye')).toBe(
      'Started as “Write an essay about The Catcher in the Rye.” Renaming here renames it on the stack page too.'
    );
    expect(startedAsHint(null)).toBe('Renaming here renames it on the stack page too.');
  });
});
