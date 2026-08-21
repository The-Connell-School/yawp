import { describe, expect, test } from 'bun:test';
import {
  PRODUCTION_QA_IDS,
  PRODUCTION_QA_ORGANIZATION_FLAGS,
  assertProductionQaIdentitySafety,
  assertProductionQaPassword,
  redactedProductionQaSummary,
} from './production-qa-profile';

describe('production QA profile guardrails', () => {
  test('uses obvious QA-only identifiers', () => {
    expect(PRODUCTION_QA_IDS.organizationId).toBe('prod-qa-org');
    expect(PRODUCTION_QA_IDS.teacherEmail).toBe(
      'prod.qa.teacher.v2@brock.software'
    );
    expect(PRODUCTION_QA_IDS.studentEmail).toBe(
      'prod.qa.student.v2@brock.software'
    );

    for (const id of Object.values(PRODUCTION_QA_IDS)) {
      expect(id).not.toContain('the-connell-school');
      expect(id).not.toContain('jdoe@brock.software');
      expect(id).not.toContain('teacher.e2e@yawp.test');
    }
  });

  test('rejects missing, short, or default fixture passwords', () => {
    expect(() => assertProductionQaPassword(undefined)).toThrow(
      /PROD_QA_PASSWORD/
    );
    expect(() => assertProductionQaPassword('short')).toThrow(/at least 12/);
    expect(() => assertProductionQaPassword('teacher-e2e-password')).toThrow(
      /fixture password/
    );
    expect(() => assertProductionQaPassword('johndoe')).toThrow(
      /fixture password/
    );
  });

  test('accepts a non-default QA password', () => {
    expect(assertProductionQaPassword('yawp-prod-qa-password-2026')).toBe(
      'yawp-prod-qa-password-2026'
    );
  });

  test('enables released-grade activity only for the disposable QA organization', () => {
    expect(PRODUCTION_QA_IDS.organizationId).toBe('prod-qa-org');
    expect(PRODUCTION_QA_ORGANIZATION_FLAGS).toEqual({
      submissionActivityEnabled: true,
    });
  });

  test('redacts password material from result summaries', () => {
    const redacted = redactedProductionQaSummary({
      organizationId: PRODUCTION_QA_IDS.organizationId,
      teacherEmail: PRODUCTION_QA_IDS.teacherEmail,
      studentEmail: PRODUCTION_QA_IDS.studentEmail,
      schoolId: PRODUCTION_QA_IDS.schoolId,
      classId: PRODUCTION_QA_IDS.classId,
      assignmentTypeId: PRODUCTION_QA_IDS.assignmentTypeId,
      assignmentId: PRODUCTION_QA_IDS.assignmentId,
      classAssignmentId: PRODUCTION_QA_IDS.classAssignmentId,
      documentId: PRODUCTION_QA_IDS.documentId,
      submissionId: PRODUCTION_QA_IDS.submissionId,
      password: 'secret-password',
      passwordHash: '$2a$10$secret',
    });

    expect(JSON.stringify(redacted)).not.toContain('secret-password');
    expect(JSON.stringify(redacted)).not.toContain('$2a$10$secret');
    expect(redacted.passwordConfigured).toBe(true);
  });

  test('fails closed when a reserved email belongs to another user', () => {
    expect(() =>
      assertProductionQaIdentitySafety({
        users: [
          {
            id: 'real-teacher-user',
            email: PRODUCTION_QA_IDS.teacherEmail,
            memberships: [],
          },
        ],
        memberships: [],
      })
    ).toThrow(/reserved email or user ID collision/);
  });

  test('fails closed when an exact fixture user has a non-QA membership', () => {
    expect(() =>
      assertProductionQaIdentitySafety({
        users: [
          {
            id: PRODUCTION_QA_IDS.teacherUserId,
            email: PRODUCTION_QA_IDS.teacherEmail,
            memberships: [
              {
                id: 'real-org-membership',
                userId: PRODUCTION_QA_IDS.teacherUserId,
                organizationId: 'real-org',
                role: 'TEACHER',
                isOrgOwner: false,
              },
            ],
          },
        ],
        memberships: [],
      })
    ).toThrow(/non-QA membership graph/);
  });

  test('accepts absent identities or the exact QA-only identity graph', () => {
    expect(() =>
      assertProductionQaIdentitySafety({ users: [], memberships: [] })
    ).not.toThrow();

    const teacherMembership = {
      id: PRODUCTION_QA_IDS.teacherMembershipId,
      userId: PRODUCTION_QA_IDS.teacherUserId,
      organizationId: PRODUCTION_QA_IDS.organizationId,
      role: 'TEACHER' as const,
      isOrgOwner: true,
    };
    expect(() =>
      assertProductionQaIdentitySafety({
        users: [
          {
            id: PRODUCTION_QA_IDS.teacherUserId,
            email: PRODUCTION_QA_IDS.teacherEmail,
            memberships: [teacherMembership],
          },
        ],
        memberships: [teacherMembership],
      })
    ).not.toThrow();
  });
});
