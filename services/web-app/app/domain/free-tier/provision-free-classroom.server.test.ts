import { describe, expect, test } from 'bun:test';
import {
  appendPaidSchoolDomainNote,
  paidSchoolDomainMatchNote,
  teacherEmailDomainMatchesSchoolOrg,
} from './provision-free-classroom.server';

describe('teacherEmailDomainMatchesSchoolOrg', () => {
  test('returns true when a school org teacher shares the domain', async () => {
    const client = {
      $queryRaw: async () => [{ exists: true }],
    };
    await expect(
      teacherEmailDomainMatchesSchoolOrg('northridge.edu', client as any)
    ).resolves.toBe(true);
  });

  test('names the paid school once and uses the Oxford comma for three', () => {
    const one = paidSchoolDomainMatchNote([{ id: 'a', name: 'Lincoln High' }]);
    expect(one).toBe("Teacher's domain matches paid school Lincoln High.");
    expect(appendPaidSchoolDomainNote('Existing note', one)).toBe(
      `Existing note\n${one}`
    );
    expect(appendPaidSchoolDomainNote(`Existing note\n${one}`, one)).toBe(
      `Existing note\n${one}`
    );
    expect(
      paidSchoolDomainMatchNote([
        { id: 'a', name: 'Lincoln High' },
        { id: 'b', name: 'West High' },
        { id: 'c', name: 'North High' },
      ])
    ).toBe(
      "Teacher's domain matches paid schools Lincoln High, West High, and North High."
    );
  });

  test('returns false for an empty domain', async () => {
    await expect(teacherEmailDomainMatchesSchoolOrg('', {} as any)).resolves.toBe(
      false
    );
  });
});
