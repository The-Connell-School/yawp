import { describe, expect, test } from 'bun:test';
import { buildPostcheckReport } from './org-membership-postcheck';

describe('org-membership postcheck', () => {
  test('flags legacy tables and orphan rows', () => {
    const report = buildPostcheckReport({
      counts: {
        orgMemberships: 10,
        documents: 5,
        classes: 2,
      },
      legacyTablesPresent: ['TeacherProfile', 'StudentProfile'],
      documentsWithoutMembershipId: [{ documentId: 'doc-1' }],
      orphanClassTeacherLinks: [{ classId: 'class-1', membershipId: 'missing' }],
      orphanClassStudentLinks: [],
      duplicateUserOrgMemberships: [{ userId: 'u1', organizationId: 'o1', count: 2 }],
    });

    expect(report.ok).toBe(false);
    expect(report.blockers).toHaveLength(5);
    expect(report.blockers[0].kind).toBe('legacy_table_present');
    expect(report.dualRoleCount).toBe(1);
  });

  test('passes when post-migration invariants hold', () => {
    const report = buildPostcheckReport({
      counts: {
        orgMemberships: 10,
        documents: 5,
        classes: 2,
      },
      legacyTablesPresent: [],
      documentsWithoutMembershipId: [],
      orphanClassTeacherLinks: [],
      orphanClassStudentLinks: [],
      duplicateUserOrgMemberships: [],
    });

    expect(report.ok).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.dualRoleCount).toBe(0);
  });

  test('fails when org membership count is zero', () => {
    const report = buildPostcheckReport({
      counts: {
        orgMemberships: 0,
        documents: 0,
        classes: 0,
      },
      legacyTablesPresent: [],
      documentsWithoutMembershipId: [],
      orphanClassTeacherLinks: [],
      orphanClassStudentLinks: [],
      duplicateUserOrgMemberships: [],
    });

    expect(report.ok).toBe(false);
    expect(report.blockers.some((b) => b.kind === 'empty_org_membership')).toBe(
      true
    );
  });
});
