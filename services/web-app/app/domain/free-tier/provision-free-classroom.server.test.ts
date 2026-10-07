import { describe, expect, test } from 'bun:test';
import { teacherEmailDomainMatchesSchoolOrg } from './provision-free-classroom.server';

describe('teacherEmailDomainMatchesSchoolOrg', () => {
  test('returns true when a school org teacher shares the domain', async () => {
    const client = {
      $queryRaw: async () => [{ exists: true }],
    };
    await expect(
      teacherEmailDomainMatchesSchoolOrg('northridge.edu', client as any)
    ).resolves.toBe(true);
  });

  test('returns false for an empty domain', async () => {
    await expect(teacherEmailDomainMatchesSchoolOrg('', {} as any)).resolves.toBe(
      false
    );
  });
});
