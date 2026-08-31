import { describe, expect, test } from 'bun:test';
import { classifyLoginSiteMismatch } from './login-site-mismatch.server';

const UA_ORGANIZATION_ID = 'org-ua';

function classify(
  overrides: Partial<Parameters<typeof classifyLoginSiteMismatch>[0]> = {}
) {
  return classifyLoginSiteMismatch({
    isUaHost: false,
    hasUaPartnerContext: false,
    uaOrganizationId: UA_ORGANIZATION_ID,
    membershipOrganizationIds: [],
    ...overrides,
  });
}

describe('classifyLoginSiteMismatch', () => {
  test('sends a non-UA-only member from the UA host to the main site', () => {
    expect(
      classify({
        isUaHost: true,
        membershipOrganizationIds: ['org-main'],
      })
    ).toBe('main');
  });

  test('sends a UA-only member from the main host to the UA site', () => {
    expect(classify({ membershipOrganizationIds: [UA_ORGANIZATION_ID] })).toBe(
      'ua'
    );
  });

  test('allows a member of both organization types on either host', () => {
    const membershipOrganizationIds = ['org-main', UA_ORGANIZATION_ID];
    expect(classify({ membershipOrganizationIds })).toBeNull();
    expect(classify({ isUaHost: true, membershipOrganizationIds })).toBeNull();
  });

  test('allows explicit UA enrollment with accepted partner context', () => {
    expect(
      classify({
        isUaHost: true,
        hasUaPartnerContext: true,
        membershipOrganizationIds: ['org-main'],
      })
    ).toBeNull();
  });

  test('does not redirect users without an active organization membership', () => {
    expect(classify()).toBeNull();
  });
});
