import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import {
  startMockLtiPlatform,
  type MockLtiPlatform,
} from '../../../e2e/mocks/lti/mock-lti-platform';
import {
  deliverLtiGradePassback,
  enqueueReleasedLtiGrades,
  retryLtiWorkflow,
  syncLtiRoster,
} from './lti-advantage.server';
import { deriveLtiIdentityHashCandidates } from './lti-identity-keyset.server';
import {
  completeLtiDeepLinkLaunch,
  completeLtiLaunch,
  initiateLtiLogin,
  inspectLtiDeepLinkRequest,
  selectLtiDeepLinkPlacement,
} from './lti-pilot.server';
import { resetLtiToolSigningKeyCacheForTests } from './lti-tool-keyset.server';

const HAS_DATABASE = Boolean(
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL
);
const IDENTITY_SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const F = {
  org: 'lti-adv-it-org',
  school: 'lti-adv-it-school',
  class: 'lti-adv-it-class',
  otherClass: 'lti-adv-it-other-class',
  registration: 'lti-adv-it-registration',
  teacherUser: 'lti-adv-it-teacher-user',
  studentUser: 'lti-adv-it-student-user',
  manualUser: 'lti-adv-it-manual-user',
  teacherMembership: 'lti-adv-it-teacher-membership',
  studentMembership: 'lti-adv-it-student-membership',
  manualMembership: 'lti-adv-it-manual-membership',
  assignmentType: 'lti-adv-it-assignment-type',
  assignment: 'lti-adv-it-assignment',
  classAssignment: 'lti-adv-it-class-assignment',
  otherClassAssignment: 'lti-adv-it-other-class-assignment',
  document: 'lti-adv-it-document',
  submission: 'lti-adv-it-submission',
  retrySubmission: 'lti-adv-it-retry-submission',
} as const;

let platform: MockLtiPlatform;
let mappingId = '';
let placementId = '';
const instructorRole =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const learnerRole = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';

function hashSubject(subject: string) {
  return deriveLtiIdentityHashCandidates({
    registrationId: F.registration,
    subject,
  })[0]!;
}

function formPost(html: string) {
  const idToken = html.match(/name="id_token" value="([^"]+)"/)?.[1];
  const state = html.match(/name="state" value="([^"]+)"/)?.[1];
  if (!idToken || !state) throw new Error('Mock form_post was malformed.');
  return {
    idToken: idToken.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    state: state.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
  };
}

async function launch(scenario: string, target: 'resource' | 'deep-link') {
  const now = new Date(platform.seed.nowSeconds * 1000);
  const initiated = await initiateLtiLogin(
    new URLSearchParams({
      iss: platform.registration.issuer,
      client_id: platform.registration.clientId,
      lti_deployment_id: platform.registration.deploymentId,
      login_hint: `opaque-${scenario}`,
      lti_message_hint: scenario,
      target_link_uri:
        target === 'deep-link'
          ? platform.registration.deepLinkingLaunchUrl
          : platform.registration.launchUrl,
    }),
    { now, requesterFingerprint: `integration-${scenario}` }
  );
  const response = await Bun.fetch(initiated.authorizationUrl);
  expect(response.status).toBe(200);
  return {
    now,
    form: formPost(await response.text()),
    browserBinding: {
      transactionId: initiated.transactionId,
      secret: initiated.browserBindingSecret,
    },
  };
}

async function cleanup() {
  await prisma.ltiGradePassback.deleteMany({
    where: { organizationId: F.org },
  });
  await prisma.ltiRosterEnrollment.deleteMany({
    where: { organizationId: F.org },
  });
  await prisma.ltiWorkflowRun.deleteMany({ where: { organizationId: F.org } });
  await prisma.ltiPlacement.deleteMany({ where: { organizationId: F.org } });
  await prisma.ltiDeepLinkRequest.deleteMany({
    where: { organizationId: F.org },
  });
  await prisma.ltiExternalIdentity.deleteMany({
    where: { organizationId: F.org },
  });
  await prisma.ltiPendingLink.deleteMany({ where: { organizationId: F.org } });
  await prisma.ltiLaunchTransaction.deleteMany({
    where: { organizationId: F.org },
  });
  await prisma.ltiCourseMapping.deleteMany({
    where: { organizationId: F.org },
  });
  await prisma.ltiRegistration.deleteMany({ where: { organizationId: F.org } });
  await prisma.submission.deleteMany({
    where: { id: { in: [F.submission, F.retrySubmission] } },
  });
  await prisma.document.deleteMany({ where: { id: F.document } });
  await prisma.classAssignment.deleteMany({
    where: { id: { in: [F.classAssignment, F.otherClassAssignment] } },
  });
  await prisma.assignment.deleteMany({ where: { id: F.assignment } });
  await prisma.assignmentType.deleteMany({ where: { id: F.assignmentType } });
  await prisma.class.deleteMany({
    where: { id: { in: [F.class, F.otherClass] } },
  });
  await prisma.school.deleteMany({ where: { id: F.school } });
  await prisma.orgMembership.deleteMany({ where: { organizationId: F.org } });
  await prisma.organization.deleteMany({ where: { id: F.org } });
  await prisma.user.deleteMany({
    where: { id: { in: [F.teacherUser, F.studentUser, F.manualUser] } },
  });
}

describe('persisted LTI Advantage workflows over real HTTP and Postgres', () => {
  beforeAll(async () => {
    if (!HAS_DATABASE) return;
    process.env.LTI_ALLOW_LOOPBACK_HTTP = 'true';
    process.env.LTI_IDENTITY_HMAC_KEYS = `v1=${IDENTITY_SECRET}`;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? 'lti-advantage-integration-secret';
    platform = await startMockLtiPlatform();
    process.env.LTI_TOOL_SIGNING_KEYSET_JSON = JSON.stringify({
      activeKeyId: platform.tool.keyId,
      keys: [
        {
          keyId: platform.tool.keyId,
          privateKeyPem: platform.tool.privateKeyPem,
        },
      ],
    });
    resetLtiToolSigningKeyCacheForTests();
    await cleanup();
    await prisma.organization.create({
      data: { id: F.org, name: 'LTI Advantage Integration', ltiEnabled: true },
    });
    await prisma.user.createMany({
      data: [
        {
          id: F.teacherUser,
          email: 'adv-teacher@example.test',
          name: 'Advantage Teacher',
        },
        {
          id: F.studentUser,
          email: 'adv-student@example.test',
          name: 'Advantage Student',
        },
        {
          id: F.manualUser,
          email: 'adv-manual@example.test',
          name: 'Manual Student',
        },
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        {
          id: F.teacherMembership,
          userId: F.teacherUser,
          organizationId: F.org,
          role: 'TEACHER',
        },
        {
          id: F.studentMembership,
          userId: F.studentUser,
          organizationId: F.org,
          role: 'STUDENT',
        },
        {
          id: F.manualMembership,
          userId: F.manualUser,
          organizationId: F.org,
          role: 'STUDENT',
        },
      ],
    });
    await prisma.school.create({
      data: {
        id: F.school,
        name: 'Integration College',
        code: 'ADV-IT',
        organizationId: F.org,
      },
    });
    await prisma.class.create({
      data: {
        id: F.class,
        code: 'ENG-101-ADV',
        period: '1',
        grade: 'College',
        title: 'English Composition I',
        schoolId: F.school,
        teachers: { connect: { id: F.teacherMembership } },
        students: { connect: { id: F.manualMembership } },
      },
    });
    await prisma.class.create({
      data: {
        id: F.otherClass,
        code: 'ENG-202-ADV',
        period: '2',
        grade: 'College',
        title: 'English Composition II',
        schoolId: F.school,
        teachers: { connect: { id: F.teacherMembership } },
      },
    });
    await prisma.ltiRegistration.create({
      data: {
        id: F.registration,
        organizationId: F.org,
        provider: platform.registration.provider,
        displayName: platform.registration.displayName,
        issuer: platform.registration.issuer,
        clientId: platform.registration.clientId,
        deploymentId: platform.registration.deploymentId,
        authorizationEndpoint: platform.registration.authorizationEndpoint,
        tokenEndpoint: platform.registration.tokenEndpoint,
        jwksUrl: platform.registration.jwksUrl,
        loginInitiationUrl: platform.registration.loginInitiationUrl,
        launchUrl: platform.registration.launchUrl,
        deepLinkingLaunchUrl: platform.registration.deepLinkingLaunchUrl,
        toolJwksUrl: platform.registration.toolJwksUrl,
        allowedAudiences: platform.registration.allowedAudiences,
        allowedServiceOrigins: platform.registration.allowedServiceOrigins,
        allowedTargetLinkUris: platform.registration.allowedTargetLinkUris,
        enabledScopes: platform.registration.enabledScopes,
        jwksCacheTtlSeconds: platform.registration.jwksCacheTtlSeconds,
        enabled: true,
      },
    });
    const mapping = await prisma.ltiCourseMapping.create({
      data: {
        registrationId: F.registration,
        organizationId: F.org,
        contextId: platform.seed.context.id,
        classId: F.class,
      },
    });
    mappingId = mapping.id;
    for (const [subject, membershipId] of [
      ['lti-instructor-kevin', F.teacherMembership],
      ['lti-learner-ada', F.studentMembership],
      ['lti-learner-james', F.manualMembership],
    ] as const) {
      const hash = hashSubject(subject);
      await prisma.ltiExternalIdentity.create({
        data: {
          subjectHash: hash.subjectHash,
          subjectHashKeyId: hash.keyId,
          registrationId: F.registration,
          organizationId: F.org,
          membershipId,
        },
      });
    }
    await prisma.assignmentType.create({
      data: {
        id: F.assignmentType,
        title: 'Integration Essay',
        position: 9001,
        ownerOrgId: F.org,
      },
    });
    await prisma.assignment.create({
      data: {
        id: F.assignment,
        assignmentTypeId: F.assignmentType,
        title: 'Argument Essay',
        prompt: 'Make a claim and support it.',
        pointValue: 50,
      },
    });
    await prisma.classAssignment.create({
      data: {
        id: F.classAssignment,
        assignmentId: F.assignment,
        classId: F.class,
      },
    });
    await prisma.classAssignment.create({
      data: {
        id: F.otherClassAssignment,
        assignmentId: F.assignment,
        classId: F.otherClass,
      },
    });
  });

  afterAll(async () => {
    if (!HAS_DATABASE) return;
    await cleanup();
    await platform.close();
    resetLtiToolSigningKeyCacheForTests();
  });

  test.skipIf(!HAS_DATABASE)(
    'places, reconciles, launches, releases, retries, and delivers without abstraction mocks',
    async () => {
      const deep = await launch('deep-link-standard', 'deep-link');
      const request = await completeLtiDeepLinkLaunch(deep.form, {
        now: deep.now,
        currentUserId: F.teacherUser,
        browserBinding: deep.browserBinding,
      });
      await expect(
        inspectLtiDeepLinkRequest({
          requestId: request.requestId,
          browserSecret: request.browserSecret,
          teacherUserId: F.teacherUser,
          now: deep.now,
        })
      ).resolves.toMatchObject({ assignments: [{ id: F.classAssignment }] });
      await expect(
        selectLtiDeepLinkPlacement({
          requestId: request.requestId,
          browserSecret: request.browserSecret,
          teacherUserId: F.teacherUser,
          classAssignmentId: F.otherClassAssignment,
          now: deep.now,
          toolKey: platform.tool,
        })
      ).rejects.toMatchObject({ code: 'course_unmapped' });
      expect(
        await prisma.ltiPlacement.count({ where: { organizationId: F.org } })
      ).toBe(0);
      const selected = await selectLtiDeepLinkPlacement({
        requestId: request.requestId,
        browserSecret: request.browserSecret,
        teacherUserId: F.teacherUser,
        classAssignmentId: F.classAssignment,
        now: deep.now,
        toolKey: platform.tool,
      });
      placementId = selected.placementId;
      const deepReturn = await Bun.fetch(selected.returnUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ JWT: selected.responseJwt }),
      });
      expect(deepReturn.status).toBe(204);
      expect(platform.state.deepLinkContentItems).toHaveLength(1);
      expect(JSON.stringify(platform.state.deepLinkContentItems[0])).toContain(
        placementId
      );

      const firstSync = await syncLtiRoster({
        courseMappingId: mappingId,
        idempotencyKey: 'initial-sync',
        now: deep.now,
      });
      expect(firstSync.added).toBe(1);
      expect(firstSync.unmatched).toBe(1);
      const nrpsRequests = platform.journal.filter((entry) =>
        entry.path.endsWith('/memberships')
      ).length;
      await expect(
        syncLtiRoster({
          courseMappingId: mappingId,
          idempotencyKey: 'initial-sync',
          now: deep.now,
        })
      ).resolves.toEqual(firstSync);
      expect(
        platform.journal.filter((entry) => entry.path.endsWith('/memberships'))
          .length
      ).toBe(nrpsRequests);

      platform.state.members = platform.state.members.map((member) =>
        member.user_id === 'lti-learner-ada' ||
        member.user_id === 'lti-learner-james'
          ? { ...member, status: 'Inactive' as const }
          : member
      );
      const drops = await syncLtiRoster({
        courseMappingId: mappingId,
        idempotencyKey: 'drop-sync',
        now: deep.now,
      });
      expect(drops.dropped).toBe(1);
      const membershipsAfterDrop = await prisma.class.findUniqueOrThrow({
        where: { id: F.class },
        select: { students: { select: { id: true } } },
      });
      expect(
        membershipsAfterDrop.students.map((item) => item.id)
      ).not.toContain(F.studentMembership);
      expect(membershipsAfterDrop.students.map((item) => item.id)).toContain(
        F.manualMembership
      );

      platform.state.members = [
        ...platform.state.members.map((member) =>
          member.user_id === 'lti-learner-ada'
            ? { ...member, status: 'Active' as const }
            : member
        ),
        { status: 'Active', user_id: 'duplicate-user', roles: [learnerRole] },
        { status: 'Active', user_id: 'duplicate-user', roles: [learnerRole] },
        {
          status: 'Active',
          user_id: 'mixed-role-user',
          roles: [learnerRole, instructorRole],
        },
      ];
      const conflicts = await syncLtiRoster({
        courseMappingId: mappingId,
        idempotencyKey: 'conflict-sync',
        now: deep.now,
      });
      expect(conflicts.added).toBe(1);
      expect(conflicts.duplicates).toBe(2);
      expect(conflicts.conflicts).toBe(3);

      const learner = await launch('learner-resource-link-placed', 'resource');
      await expect(
        completeLtiLaunch(learner.form, {
          now: learner.now,
          browserBinding: learner.browserBinding,
        })
      ).resolves.toMatchObject({
        kind: 'linked',
        userId: F.studentUser,
        classId: F.class,
      });
      expect(
        await prisma.ltiPlacement.findUniqueOrThrow({
          where: { id: placementId },
          select: { resourceLinkId: true },
        })
      ).toEqual({ resourceLinkId: 'resource-link-from-deep-link-001' });

      await prisma.document.create({
        data: {
          id: F.document,
          title: 'Ada Argument Essay',
          text: 'A supported claim.',
          html: '<p>A supported claim.</p>',
          membershipId: F.studentMembership,
          assignmentTypeId: F.assignmentType,
          assignmentId: F.assignment,
          classAssignmentId: F.classAssignment,
        },
      });
      await prisma.submission.create({
        data: {
          id: F.submission,
          title: 'Ada Argument Essay',
          text: 'A supported claim.',
          html: '<p>A supported claim.</p>',
          submittedAt: new Date(deep.now.getTime() - 60_000),
          numericPercentage: 80,
          documentId: F.document,
        },
      });
      expect(
        (
          await enqueueReleasedLtiGrades({
            submissionIds: [F.submission],
            now: deep.now,
          })
        ).enqueued
      ).toBe(0);
      await prisma.submission.update({
        where: { id: F.submission },
        data: { releasedAt: deep.now },
      });
      expect(
        (
          await enqueueReleasedLtiGrades({
            submissionIds: [F.submission],
            now: deep.now,
          })
        ).enqueued
      ).toBe(1);
      expect(
        (
          await enqueueReleasedLtiGrades({
            submissionIds: [F.submission],
            now: deep.now,
          })
        ).existing
      ).toBe(1);
      const grade = await prisma.ltiGradePassback.findFirstOrThrow({
        where: { submissionId: F.submission },
      });
      await deliverLtiGradePassback({
        gradePassbackId: grade.id,
        now: deep.now,
      });
      expect(platform.state.scores).toHaveLength(1);
      expect(platform.state.scores[0]).toMatchObject({
        userId: 'lti-learner-ada',
        scoreGiven: 40,
        scoreMaximum: 50,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      });
      await deliverLtiGradePassback({
        gradePassbackId: grade.id,
        now: deep.now,
      });
      expect(platform.state.scores).toHaveLength(1);

      await prisma.submission.create({
        data: {
          id: F.retrySubmission,
          title: 'Ada Revised Essay',
          text: 'A stronger supported claim.',
          html: '<p>A stronger supported claim.</p>',
          submittedAt: new Date(deep.now.getTime() - 30_000),
          numericPercentage: 90,
          releasedAt: new Date(deep.now.getTime() + 1_000),
          documentId: F.document,
        },
      });
      await enqueueReleasedLtiGrades({
        submissionIds: [F.retrySubmission],
        now: deep.now,
      });
      const retryGrade = await prisma.ltiGradePassback.findFirstOrThrow({
        where: { submissionId: F.retrySubmission },
      });
      platform.failNext('token', {
        status: 401,
        contentType: 'application/json',
        body: '{"error":"invalid_client"}',
      });
      await expect(
        deliverLtiGradePassback({
          gradePassbackId: retryGrade.id,
          now: deep.now,
        })
      ).rejects.toThrow();
      expect(
        await prisma.ltiGradePassback.findUniqueOrThrow({
          where: { id: retryGrade.id },
          select: { status: true, lastErrorCode: true },
        })
      ).toEqual({ status: 'retry', lastErrorCode: 'token_revoked' });
      await retryLtiWorkflow({
        organizationId: F.org,
        gradePassbackId: retryGrade.id,
        now: deep.now,
      });
      await deliverLtiGradePassback({
        gradePassbackId: retryGrade.id,
        now: deep.now,
      });
      expect(platform.state.scores).toHaveLength(2);

      const serializedDiagnostics = JSON.stringify(
        await prisma.$transaction([
          prisma.ltiWorkflowRun.findMany({ where: { organizationId: F.org } }),
          prisma.ltiAuditEvent.findMany({ where: { organizationId: F.org } }),
          prisma.ltiGradePassback.findMany({
            where: { organizationId: F.org },
          }),
        ])
      );
      expect(serializedDiagnostics).not.toContain('example.test');
      expect(serializedDiagnostics).not.toContain('lti-learner-ada');
    }
  );
});
