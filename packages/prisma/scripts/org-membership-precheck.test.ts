import { describe, expect, test } from 'bun:test';
import { buildPrecheckReport } from './org-membership-precheck';

describe('org-membership precheck', () => {
  test('blocks document mismatches but warns on dual sub-profiles', () => {
    const report = buildPrecheckReport({
      counts: {
        users: 1,
        profiles: 1,
        teacherProfiles: 1,
        studentProfiles: 1,
        documents: 1,
        classes: 1,
      },
      dualSubProfiles: [{ profileId: 'p1', userId: 'u1', organizationId: 'o1' }],
      documentMismatches: [
        {
          documentId: 'd1',
          profileId: 'p1',
          studentProfileId: 'sp9',
          expectedMembershipId: 'p2',
        },
      ],
      orphanSubProfiles: [],
      duplicateUserOrgProfiles: [],
      orphanProfilesWithoutSubProfiles: 0,
    });

    expect(report.ok).toBe(false);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0].kind).toBe('document_mismatch');
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].kind).toBe('dual_sub_profile');
  });

  test('passes when no blockers even with expected production warnings', () => {
    const report = buildPrecheckReport({
      counts: {
        users: 40,
        profiles: 40,
        teacherProfiles: 34,
        studentProfiles: 34,
        documents: 10,
        classes: 5,
      },
      dualSubProfiles: [{ profileId: 'p1', userId: 'u1', organizationId: 'o1' }],
      documentMismatches: [],
      orphanSubProfiles: [],
      duplicateUserOrgProfiles: [{ userId: 'u1', organizationId: 'o1', count: 2 }],
      orphanProfilesWithoutSubProfiles: 106,
    });

    expect(report.ok).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toHaveLength(3);
  });
});
