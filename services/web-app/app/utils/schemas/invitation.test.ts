import { describe, expect, test } from 'bun:test';
import { StudentOnboardingMetadataSchema } from './invitation';

describe('student onboarding invitation metadata', () => {
  test('accepts trusted UA organization metadata without a class', () => {
    expect(
      StudentOnboardingMetadataSchema.parse({
        partner: 'ua',
        organizationId: 'org-ua',
      })
    ).toEqual({ partner: 'ua', organizationId: 'org-ua' });
  });

  test('does not accept a generic organization-only invitation', () => {
    expect(() =>
      StudentOnboardingMetadataSchema.parse({ organizationId: 'org-any' })
    ).toThrow();
  });
});
