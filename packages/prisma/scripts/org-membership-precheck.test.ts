import { describe, expect, test } from 'bun:test';
import { buildPrecheckReport } from './org-membership-precheck';

describe('org-membership precheck', () => {
  test('flags dual sub-profiles and document mismatches', () => {
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
    });

    expect(report.ok).toBe(false);
    expect(report.blockers).toHaveLength(2);
    expect(report.blockers[0].kind).toBe('dual_sub_profile');
  });

  test('passes when no blockers', () => {
    const report = buildPrecheckReport({
      counts: {
        users: 1,
        profiles: 1,
        teacherProfiles: 1,
        studentProfiles: 0,
        documents: 0,
        classes: 0,
      },
      dualSubProfiles: [],
      documentMismatches: [],
      orphanSubProfiles: [],
      duplicateUserOrgProfiles: [],
    });
    expect(report.ok).toBe(true);
  });
});
