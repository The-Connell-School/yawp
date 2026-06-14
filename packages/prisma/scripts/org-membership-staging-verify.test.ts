import { describe, expect, test } from 'bun:test';
import { buildStagingVerifyReport } from './org-membership-staging-verify';

describe('org-membership staging verify', () => {
  test('passes when postcheck, forensic, and parity hold', () => {
    const report = buildStagingVerifyReport({
      postcheck: {
        counts: { orgMemberships: 10, documents: 5, classes: 2 },
        legacyTablesPresent: [],
        documentsWithoutMembershipId: [],
        orphanClassTeacherLinks: [],
        orphanClassStudentLinks: [],
        duplicateUserOrgMemberships: [],
      },
      forensicCounts: {
        TeacherProfileForensic: 10,
        StudentProfileForensic: 8,
        AssignmentClassIdForensic: 4,
        AssignmentDueDateForensic: 1,
        FeatureAccessTargetTeacherForensic: 2,
        DocumentStudentProfileIdForensic: 5,
      },
      parity: {
        assignments: 4,
        classAssignments: 4,
        teacherScopedFeatureTargets: 2,
        orphanTeacherFeatureTargets: 0,
      },
      sampleAccounts: [],
    });

    expect(report.ok).toBe(true);
    expect(report.blockers).toHaveLength(0);
  });

  test('flags missing forensic tables and orphan teacher feature targets', () => {
    const report = buildStagingVerifyReport({
      postcheck: {
        counts: { orgMemberships: 10, documents: 5, classes: 2 },
        legacyTablesPresent: [],
        documentsWithoutMembershipId: [],
        orphanClassTeacherLinks: [],
        orphanClassStudentLinks: [],
        duplicateUserOrgMemberships: [],
      },
      forensicCounts: {
        TeacherProfileForensic: null,
        StudentProfileForensic: 8,
        AssignmentClassIdForensic: 4,
        AssignmentDueDateForensic: 1,
        FeatureAccessTargetTeacherForensic: 2,
        DocumentStudentProfileIdForensic: 5,
      },
      parity: {
        assignments: 4,
        classAssignments: 4,
        teacherScopedFeatureTargets: 2,
        orphanTeacherFeatureTargets: 3,
      },
      sampleAccounts: [],
    });

    expect(report.ok).toBe(false);
    expect(
      report.blockers.some((blocker) => blocker.kind === 'missing_forensic_table')
    ).toBe(true);
    expect(
      report.blockers.some(
        (blocker) => blocker.kind === 'orphan_teacher_feature_target'
      )
    ).toBe(true);
  });
});
