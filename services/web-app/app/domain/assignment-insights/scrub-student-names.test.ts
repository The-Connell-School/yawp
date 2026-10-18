import { describe, expect, test } from 'bun:test';
import { scrubStudentNames } from './scrub-student-names';

describe('scrubStudentNames', () => {
  test('removes full names and each part of a name, in any case', () => {
    expect(
      scrubStudentNames(
        'Ada Lovelace thinks, as ada says, that LOVELACE was right.',
        ['Ada Lovelace']
      )
    ).toBe('[name] thinks, as [name] says, that [name] was right.');
  });

  test("removes a classmate's name too, and leaves other words alone", () => {
    expect(
      scrubStudentNames('Like Grace said, Adam and Eve are a metaphor.', [
        'Ada Lovelace',
        'Grace Hopper',
      ])
    ).toBe('Like [name] said, Adam and Eve are a metaphor.');
  });

  test('uses the part of an email before the @ and skips one-letter parts', () => {
    expect(
      scrubStudentNames('As jo.smith noted, J was absent; Jo agreed.', [
        'jo.smith@school.org',
      ])
    ).toBe('As [name].[name] noted, J was absent; [name] agreed.');
  });

  test('handles names with regex characters and possessives', () => {
    expect(scrubStudentNames("O'Brien's essay (draft)", ["Sam O'Brien"])).toBe(
      "[name]'s essay (draft)"
    );
  });

  test('no names, no change', () => {
    expect(scrubStudentNames('Nothing to see.', [null, '', '  '])).toBe(
      'Nothing to see.'
    );
  });
});
