import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import type { MockLtiPlatform } from '../../../e2e/mocks/lti/mock-lti-platform';
import { startMockLtiPlatform } from '../../../e2e/mocks/lti/mock-lti-platform';
import {
  completeLtiLaunch,
  createLtiAuthenticatedSession,
  createLtiRegistration,
  disableLtiRegistration,
  enableLtiRegistration,
  initiateLtiLogin,
  inspectPendingLtiLink,
  LTI_PILOT_LIMITS,
  linkPendingLtiIdentity,
  pruneExpiredLtiOperationalData,
  setLtiCourseMappingEnabled,
  setOrganizationLtiGate,
  unlinkLtiExternalIdentity,
  upsertLtiCourseMapping,
} from './lti-pilot.server';
import { parseLtiRegistration } from './lti-registration';

const HAS_DATABASE = Boolean(
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL
);
const FIXTURE = {
  organizationId: 'lti-pilot-it-organization',
  otherOrganizationId: 'lti-pilot-it-other-organization',
  teacherUserId: 'lti-pilot-it-teacher-user',
  wrongClassUserId: 'lti-pilot-it-wrong-class-user',
  otherUserId: 'lti-pilot-it-other-user',
  schoolId: 'lti-pilot-it-school',
  otherSchoolId: 'lti-pilot-it-other-school',
  classId: 'lti-pilot-it-class',
  wrongClassId: 'lti-pilot-it-wrong-class',
  otherClassId: 'lti-pilot-it-other-class',
  registrationId: 'lti-pilot-it-registration',
  otherRegistrationId: 'lti-pilot-it-other-registration',
} as const;
const IDENTITY_KEY_V1 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const IDENTITY_KEY_V2 = 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA';

let platform: MockLtiPlatform;
let otherPlatform: MockLtiPlatform;

async function cleanupFixture() {
  await prisma.ltiExternalIdentity.deleteMany({
    where: {
      registrationId: {
        in: [FIXTURE.registrationId, FIXTURE.otherRegistrationId],
      },
    },
  });
  const registrationIds = [FIXTURE.registrationId, FIXTURE.otherRegistrationId];
  await prisma.ltiPendingLink.deleteMany({
    where: { registrationId: { in: registrationIds } },
  });
  await prisma.ltiLaunchTransaction.deleteMany({
    where: { registrationId: { in: registrationIds } },
  });
  await prisma.ltiCourseMapping.deleteMany({
    where: { registrationId: { in: registrationIds } },
  });
  await prisma.ltiRegistration.deleteMany({
    where: { id: { in: registrationIds } },
  });
  await prisma.class.deleteMany({
    where: {
      id: {
        in: [FIXTURE.classId, FIXTURE.wrongClassId, FIXTURE.otherClassId],
      },
    },
  });
  await prisma.school.deleteMany({
    where: { id: { in: [FIXTURE.schoolId, FIXTURE.otherSchoolId] } },
  });
  await prisma.orgMembership.deleteMany({
    where: {
      organizationId: {
        in: [FIXTURE.organizationId, FIXTURE.otherOrganizationId],
      },
    },
  });
  await prisma.organization.deleteMany({
    where: {
      id: { in: [FIXTURE.organizationId, FIXTURE.otherOrganizationId] },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          FIXTURE.teacherUserId,
          FIXTURE.wrongClassUserId,
          FIXTURE.otherUserId,
        ],
      },
    },
  });
}

function extractFormPost(html: string) {
  const idToken = html.match(/name="id_token" value="([^"]+)"/)?.[1];
  const state = html.match(/name="state" value="([^"]+)"/)?.[1];
  if (!idToken || !state) throw new Error('Mock LMS form_post was malformed.');
  return {
    idToken: idToken.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    state: state.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
  };
}

async function initiateAndAuthorize(
  scenario = 'instructor-resource-link',
  now = new Date(platform.seed.nowSeconds * 1000),
  registration = platform.registration
) {
  const initiated = await initiateLtiLogin(
    new URLSearchParams({
      iss: registration.issuer,
      client_id: registration.clientId,
      lti_deployment_id: registration.deploymentId,
      login_hint: 'opaque-integration-login-hint',
      lti_message_hint: scenario,
      target_link_uri: registration.launchUrl,
    }),
    { now }
  );
  const response = await Bun.fetch(initiated.authorizationUrl);
  expect(response.status).toBe(200);
  return {
    initiated,
    form: extractFormPost(await response.text()),
    browserBinding: {
      transactionId: initiated.transactionId,
      secret: initiated.browserBindingSecret,
    },
    now,
  };
}

describe('persisted LTI launch pilot over a real database and LMS network', () => {
  beforeAll(async () => {
    if (!HAS_DATABASE) return;
    process.env.LTI_ALLOW_LOOPBACK_HTTP = 'true';
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? 'lti-pilot-integration-secret-2026';
    process.env.LTI_IDENTITY_HMAC_KEYS =
      process.env.LTI_IDENTITY_HMAC_KEYS ??
      'v1=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
    platform = await startMockLtiPlatform();
    otherPlatform = await startMockLtiPlatform();
    await cleanupFixture();

    await prisma.organization.createMany({
      data: [
        {
          id: FIXTURE.organizationId,
          name: 'LTI Pilot Integration Organization',
          ltiEnabled: true,
        },
        {
          id: FIXTURE.otherOrganizationId,
          name: 'LTI Pilot Other Organization',
          ltiEnabled: true,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: FIXTURE.teacherUserId,
          email: 'lti-pilot-teacher@example.test',
          name: 'Pilot Teacher',
        },
        {
          id: FIXTURE.wrongClassUserId,
          email: 'lti-pilot-wrong-class@example.test',
          name: 'Wrong Class Teacher',
        },
        {
          id: FIXTURE.otherUserId,
          email: 'lti-pilot-other@example.test',
          name: 'Other Tenant User',
        },
      ],
    });
    const [teacherMembership, wrongClassMembership, otherMembership] =
      await Promise.all([
        prisma.orgMembership.create({
          data: {
            userId: FIXTURE.teacherUserId,
            organizationId: FIXTURE.organizationId,
            role: 'TEACHER',
          },
        }),
        prisma.orgMembership.create({
          data: {
            userId: FIXTURE.wrongClassUserId,
            organizationId: FIXTURE.organizationId,
            role: 'TEACHER',
          },
        }),
        prisma.orgMembership.create({
          data: {
            userId: FIXTURE.otherUserId,
            organizationId: FIXTURE.otherOrganizationId,
            role: 'TEACHER',
          },
        }),
      ]);
    await prisma.school.createMany({
      data: [
        {
          id: FIXTURE.schoolId,
          name: 'LTI Pilot School',
          code: 'LTI-PILOT-IT-SCHOOL',
          organizationId: FIXTURE.organizationId,
        },
        {
          id: FIXTURE.otherSchoolId,
          name: 'LTI Pilot Other School',
          code: 'LTI-PILOT-IT-OTHER-SCHOOL',
          organizationId: FIXTURE.otherOrganizationId,
        },
      ],
    });
    await Promise.all([
      prisma.class.create({
        data: {
          id: FIXTURE.classId,
          code: 'LTI-PILOT-IT-CLASS',
          period: '1',
          grade: 'College',
          title: 'English Composition I',
          schoolId: FIXTURE.schoolId,
          teachers: { connect: { id: teacherMembership.id } },
        },
      }),
      prisma.class.create({
        data: {
          id: FIXTURE.wrongClassId,
          code: 'LTI-PILOT-IT-WRONG-CLASS',
          period: '2',
          grade: 'College',
          title: 'Different Course',
          schoolId: FIXTURE.schoolId,
          teachers: { connect: { id: wrongClassMembership.id } },
        },
      }),
      prisma.class.create({
        data: {
          id: FIXTURE.otherClassId,
          code: 'LTI-PILOT-IT-OTHER-CLASS',
          period: '3',
          grade: 'College',
          title: 'Other Tenant Course',
          schoolId: FIXTURE.otherSchoolId,
          teachers: { connect: { id: otherMembership.id } },
        },
      }),
    ]);
    await prisma.ltiRegistration.createMany({
      data: [
        {
          id: FIXTURE.registrationId,
          organizationId: FIXTURE.organizationId,
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
        {
          id: FIXTURE.otherRegistrationId,
          organizationId: FIXTURE.otherOrganizationId,
          provider: otherPlatform.alternateRegistration.provider,
          displayName: otherPlatform.alternateRegistration.displayName,
          issuer: otherPlatform.alternateRegistration.issuer,
          clientId: otherPlatform.alternateRegistration.clientId,
          deploymentId: otherPlatform.alternateRegistration.deploymentId,
          authorizationEndpoint:
            otherPlatform.alternateRegistration.authorizationEndpoint,
          tokenEndpoint: otherPlatform.alternateRegistration.tokenEndpoint,
          jwksUrl: otherPlatform.alternateRegistration.jwksUrl,
          loginInitiationUrl:
            otherPlatform.alternateRegistration.loginInitiationUrl,
          launchUrl: otherPlatform.alternateRegistration.launchUrl,
          deepLinkingLaunchUrl:
            otherPlatform.alternateRegistration.deepLinkingLaunchUrl,
          toolJwksUrl: otherPlatform.alternateRegistration.toolJwksUrl,
          allowedAudiences:
            otherPlatform.alternateRegistration.allowedAudiences,
          allowedServiceOrigins:
            otherPlatform.alternateRegistration.allowedServiceOrigins,
          allowedTargetLinkUris:
            otherPlatform.alternateRegistration.allowedTargetLinkUris,
          enabledScopes: otherPlatform.alternateRegistration.enabledScopes,
          jwksCacheTtlSeconds:
            otherPlatform.alternateRegistration.jwksCacheTtlSeconds,
          enabled: true,
        },
      ],
    });
    await prisma.ltiCourseMapping.createMany({
      data: [
        {
          registrationId: FIXTURE.registrationId,
          organizationId: FIXTURE.organizationId,
          contextId: platform.seed.context.id,
          classId: FIXTURE.classId,
        },
        {
          registrationId: FIXTURE.otherRegistrationId,
          organizationId: FIXTURE.otherOrganizationId,
          contextId: platform.seed.context.id,
          classId: FIXTURE.otherClassId,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!HAS_DATABASE) return;
    await cleanupFixture();
    await platform.close();
    await otherPlatform.close();
  });

  test.skipIf(!HAS_DATABASE)(
    'links an authenticated tenant member explicitly, then launches without PII identity keys',
    async () => {
      const first = await initiateAndAuthorize();
      const storedTransaction =
        await prisma.ltiLaunchTransaction.findUniqueOrThrow({
          where: { id: first.initiated.transactionId },
        });
      const authorization = new URL(first.initiated.authorizationUrl);
      expect(storedTransaction.stateHash).not.toBe(
        authorization.searchParams.get('state')
      );
      expect(storedTransaction.nonceHash).not.toBe(
        authorization.searchParams.get('nonce')
      );
      expect(storedTransaction.loginHintHash).not.toContain('opaque');

      const pending = await completeLtiLaunch(first.form, {
        now: first.now,
        browserBinding: first.browserBinding,
      });
      expect(pending).toMatchObject({
        kind: 'link_required',
        organizationId: FIXTURE.organizationId,
        role: 'TEACHER',
        destination: `/app/my-classes/${FIXTURE.classId}`,
      });
      if (pending.kind !== 'link_required') throw new Error('Expected link.');

      await expect(
        linkPendingLtiIdentity({
          pendingLinkId: pending.pendingLinkId,
          secret: pending.pendingLinkSecret,
          userId: FIXTURE.otherUserId,
          now: first.now,
        })
      ).rejects.toMatchObject({ code: 'membership_not_allowed' });

      await expect(
        linkPendingLtiIdentity({
          pendingLinkId: pending.pendingLinkId,
          secret: pending.pendingLinkSecret,
          userId: FIXTURE.wrongClassUserId,
          now: first.now,
        })
      ).rejects.toMatchObject({ code: 'membership_not_allowed' });

      await expect(
        inspectPendingLtiLink({
          pendingLinkId: pending.pendingLinkId,
          secret: pending.pendingLinkSecret,
          now: first.now,
        })
      ).resolves.toMatchObject({
        organizationName: 'LTI Pilot Integration Organization',
        classId: FIXTURE.classId,
        role: 'TEACHER',
      });

      await expect(
        linkPendingLtiIdentity({
          pendingLinkId: pending.pendingLinkId,
          secret: pending.pendingLinkSecret,
          userId: FIXTURE.teacherUserId,
          now: first.now,
        })
      ).resolves.toMatchObject({
        organizationId: FIXTURE.organizationId,
        destination: `/app/my-classes/${FIXTURE.classId}`,
      });

      const identity = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.registrationId },
      });
      expect(identity.subjectHash).toHaveLength(64);
      expect(identity.subjectHash).not.toContain('lti-instructor-kevin');

      const second = await initiateAndAuthorize();
      await expect(
        completeLtiLaunch(second.form, {
          now: second.now,
          browserBinding: second.browserBinding,
        })
      ).resolves.toMatchObject({
        kind: 'linked',
        userId: FIXTURE.teacherUserId,
        organizationId: FIXTURE.organizationId,
        role: 'TEACHER',
      });
      await expect(
        completeLtiLaunch(second.form, {
          now: second.now,
          browserBinding: second.browserBinding,
        })
      ).rejects.toMatchObject({ code: 'replay' });

      const serializedAudits = JSON.stringify(
        await prisma.ltiAuditEvent.findMany({
          where: { organizationId: FIXTURE.organizationId },
        })
      );
      expect(serializedAudits).not.toContain('example.test');
      expect(serializedAudits).not.toContain('lti-instructor-kevin');
      await expect(
        Promise.resolve().then(() =>
          prisma.ltiAuditEvent.updateMany({
            where: { organizationId: FIXTURE.organizationId },
            data: { outcome: 'tampered' },
          })
        )
      ).rejects.toThrow('append-only');
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'binds a launch to the initiating browser before verifier or identity work',
    async () => {
      const launch = await initiateAndAuthorize();
      const before = {
        identities: await prisma.ltiExternalIdentity.count({
          where: { registrationId: FIXTURE.registrationId },
        }),
        verificationAudits: await prisma.ltiAuditEvent.count({
          where: {
            registrationId: FIXTURE.registrationId,
            eventType: 'launch_verification_failed',
          },
        }),
        jwksRequests: platform.journal.filter(
          (entry) => entry.path === '/.well-known/jwks.json'
        ).length,
      };

      await expect(
        completeLtiLaunch(launch.form, {
          now: launch.now,
          browserBinding: {
            transactionId: launch.initiated.transactionId,
            secret: 'transferred-to-a-different-browser-without-cookie',
          },
        })
      ).rejects.toMatchObject({ code: 'invalid_launch' });
      expect(
        await prisma.ltiLaunchTransaction.findUniqueOrThrow({
          where: { id: launch.initiated.transactionId },
          select: { verificationAttempts: true, consumedAt: true },
        })
      ).toEqual({ verificationAttempts: 0, consumedAt: null });
      expect(
        await prisma.ltiExternalIdentity.count({
          where: { registrationId: FIXTURE.registrationId },
        })
      ).toBe(before.identities);
      expect(
        await prisma.ltiAuditEvent.count({
          where: {
            registrationId: FIXTURE.registrationId,
            eventType: 'launch_verification_failed',
          },
        })
      ).toBe(before.verificationAudits);
      expect(
        platform.journal.filter(
          (entry) => entry.path === '/.well-known/jwks.json'
        ).length
      ).toBe(before.jwksRequests);

      await expect(
        completeLtiLaunch(launch.form, {
          now: launch.now,
          browserBinding: launch.browserBinding,
        })
      ).resolves.toMatchObject({ kind: 'linked' });
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'enforces mapped-class assignment again for an already linked identity',
    async () => {
      const membership = await prisma.orgMembership.findFirstOrThrow({
        where: {
          userId: FIXTURE.teacherUserId,
          organizationId: FIXTURE.organizationId,
        },
        select: { id: true },
      });
      await prisma.orgMembership.update({
        where: { id: membership.id },
        data: { classesAsTeacher: { disconnect: { id: FIXTURE.classId } } },
      });
      try {
        const launch = await initiateAndAuthorize();
        await expect(
          completeLtiLaunch(launch.form, {
            now: launch.now,
            browserBinding: launch.browserBinding,
          })
        ).rejects.toMatchObject({ code: 'account_conflict' });
      } finally {
        await prisma.orgMembership.update({
          where: { id: membership.id },
          data: { classesAsTeacher: { connect: { id: FIXTURE.classId } } },
        });
      }
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'rejects unknown issuer, client, and deployment without persistence',
    async () => {
      const before = await prisma.$transaction([
        prisma.ltiLaunchTransaction.count(),
        prisma.ltiAuditEvent.count(),
      ]);
      const base = {
        iss: platform.registration.issuer,
        client_id: platform.registration.clientId,
        lti_deployment_id: platform.registration.deploymentId,
        login_hint: 'opaque-unknown-registration',
        target_link_uri: platform.registration.launchUrl,
      };
      for (const mutation of [
        { iss: 'https://unknown-issuer.example.test' },
        { client_id: 'unknown-client' },
        { lti_deployment_id: 'unknown-deployment' },
      ]) {
        await expect(
          initiateLtiLogin(new URLSearchParams({ ...base, ...mutation }), {
            now: new Date(platform.seed.nowSeconds * 1000),
          })
        ).rejects.toMatchObject({ code: 'not_available' });
      }
      expect(
        await prisma.$transaction([
          prisma.ltiLaunchTransaction.count(),
          prisma.ltiAuditEvent.count(),
        ])
      ).toEqual(before);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'rejects expired persisted state without verifier or identity side effects',
    async () => {
      const launch = await initiateAndAuthorize();
      const identityCount = await prisma.ltiExternalIdentity.count({
        where: { registrationId: FIXTURE.registrationId },
      });
      const jwksCount = platform.journal.filter(
        (entry) => entry.path === '/.well-known/jwks.json'
      ).length;
      await expect(
        completeLtiLaunch(launch.form, {
          now: new Date(launch.now.getTime() + 6 * 60 * 1000),
          browserBinding: launch.browserBinding,
        })
      ).rejects.toMatchObject({ code: 'expired' });
      expect(
        await prisma.ltiExternalIdentity.count({
          where: { registrationId: FIXTURE.registrationId },
        })
      ).toBe(identityCount);
      expect(
        platform.journal.filter(
          (entry) => entry.path === '/.well-known/jwks.json'
        ).length
      ).toBe(jwksCount);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'audits bad signatures safely and caps missing-kid verifier amplification',
    async () => {
      const badSignature = await initiateAndAuthorize('bad-signature');
      await expect(
        completeLtiLaunch(badSignature.form, {
          now: badSignature.now,
          browserBinding: badSignature.browserBinding,
        })
      ).rejects.toMatchObject({ code: 'invalid_launch' });
      expect(
        await prisma.ltiAuditEvent.count({
          where: {
            registrationId: FIXTURE.registrationId,
            eventType: 'launch_verification_failed',
            outcome: 'invalid_signature',
          },
        })
      ).toBeGreaterThanOrEqual(1);

      const missingKid = await initiateAndAuthorize('unknown-kid');
      const jwksBefore = platform.journal.filter(
        (entry) => entry.path === '/.well-known/jwks.json'
      ).length;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await expect(
          completeLtiLaunch(missingKid.form, {
            now: missingKid.now,
            browserBinding: missingKid.browserBinding,
          })
        ).rejects.toMatchObject({ code: 'invalid_launch' });
      }
      await expect(
        completeLtiLaunch(missingKid.form, {
          now: missingKid.now,
          browserBinding: missingKid.browserBinding,
        })
      ).rejects.toMatchObject({ code: 'rate_limited' });
      const jwksAfter = platform.journal.filter(
        (entry) => entry.path === '/.well-known/jwks.json'
      ).length;
      expect(jwksAfter - jwksBefore).toBeLessThanOrEqual(1);
      expect(
        await prisma.ltiLaunchTransaction.findUniqueOrThrow({
          where: { id: missingKid.initiated.transactionId },
          select: { verificationAttempts: true, consumedAt: true },
        })
      ).toEqual({ verificationAttempts: 8, consumedAt: null });
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'rotates durable identity keys and isolates one subject across issuer, deployment, and tenant',
    async () => {
      const mainBefore = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.registrationId },
      });
      process.env.LTI_IDENTITY_HMAC_KEYS = `v2=${IDENTITY_KEY_V2},v1=${IDENTITY_KEY_V1}`;
      const rotatedLaunch = await initiateAndAuthorize();
      await expect(
        completeLtiLaunch(rotatedLaunch.form, {
          now: rotatedLaunch.now,
          browserBinding: rotatedLaunch.browserBinding,
        })
      ).resolves.toMatchObject({ kind: 'linked' });
      const mainAfter = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.registrationId },
      });
      expect(mainAfter.id).toBe(mainBefore.id);
      expect(mainAfter.subjectHashKeyId).toBe('v2');
      expect(mainAfter.subjectHash).not.toBe(mainBefore.subjectHash);

      const otherLaunch = await initiateAndAuthorize(
        'instructor-resource-link',
        new Date(otherPlatform.seed.nowSeconds * 1000),
        otherPlatform.alternateRegistration
      );
      const pending = await completeLtiLaunch(otherLaunch.form, {
        now: otherLaunch.now,
        browserBinding: otherLaunch.browserBinding,
      });
      expect(pending.kind).toBe('link_required');
      if (pending.kind !== 'link_required') throw new Error('Expected link.');
      await linkPendingLtiIdentity({
        pendingLinkId: pending.pendingLinkId,
        secret: pending.pendingLinkSecret,
        userId: FIXTURE.otherUserId,
        now: otherLaunch.now,
      });
      const otherIdentity = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.otherRegistrationId },
      });
      expect(otherIdentity.organizationId).toBe(FIXTURE.otherOrganizationId);
      expect(otherIdentity.subjectHash).not.toBe(mainAfter.subjectHash);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'consumes a verified launch that carries no authorized Yawp role',
    async () => {
      const unauthorized = await initiateAndAuthorize('empty-roles');
      await expect(
        completeLtiLaunch(unauthorized.form, {
          now: unauthorized.now,
          browserBinding: unauthorized.browserBinding,
        })
      ).rejects.toMatchObject({ code: 'role_not_allowed' });
      await expect(
        completeLtiLaunch(unauthorized.form, {
          now: unauthorized.now,
          browserBinding: unauthorized.browserBinding,
        })
      ).rejects.toMatchObject({ code: 'replay' });

      expect(
        await prisma.ltiAuditEvent.count({
          where: {
            organizationId: FIXTURE.organizationId,
            eventType: 'launch_completed',
            outcome: 'role_not_allowed',
          },
        })
      ).toBe(1);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'administers disabled-first registrations and tenant-bound course mappings',
    async () => {
      const registrationId = 'lti-pilot-it-admin-registration';
      const adminRegistration = parseLtiRegistration({
        id: registrationId,
        organizationId: FIXTURE.organizationId,
        provider: 'blackboard',
        displayName: 'Admin Configuration Proof',
        transportMode: 'https',
        issuer: 'https://admin-proof.lms.example.test',
        clientId: 'admin-proof-client',
        allowedAudiences: ['admin-proof-client'],
        deploymentId: 'admin-proof-deployment',
        authorizationEndpoint: 'https://admin-proof.lms.example.test/oidc/auth',
        tokenEndpoint: 'https://admin-proof.lms.example.test/oauth2/token',
        jwksUrl: 'https://admin-proof.lms.example.test/.well-known/jwks.json',
        allowedServiceOrigins: ['https://admin-proof.lms.example.test'],
        loginInitiationUrl: 'https://yawp.example.test/lti/login',
        launchUrl: 'https://yawp.example.test/lti/launch',
        deepLinkingLaunchUrl: 'https://yawp.example.test/lti/deep-link',
        toolJwksUrl: 'https://yawp.example.test/.well-known/jwks.json',
        allowedTargetLinkUris: [
          'https://yawp.example.test/lti/launch',
          'https://yawp.example.test/lti/deep-link',
        ],
        enabledScopes: [
          'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
        ],
        enabled: false,
      });
      await createLtiRegistration({
        registration: adminRegistration,
        actorUserId: FIXTURE.teacherUserId,
      });
      expect(
        await prisma.ltiRegistration.findUniqueOrThrow({
          where: { id: registrationId },
          select: { enabled: true },
        })
      ).toEqual({ enabled: false });

      await enableLtiRegistration({
        registrationId,
        organizationId: FIXTURE.organizationId,
        actorUserId: FIXTURE.teacherUserId,
      });
      const mapping = await upsertLtiCourseMapping({
        registrationId,
        organizationId: FIXTURE.organizationId,
        contextId: 'admin-proof-context',
        classId: FIXTURE.classId,
        actorUserId: FIXTURE.teacherUserId,
      });
      await setLtiCourseMappingEnabled({
        mappingId: mapping.id,
        organizationId: FIXTURE.organizationId,
        enabled: false,
        actorUserId: FIXTURE.teacherUserId,
      });
      await expect(
        setLtiCourseMappingEnabled({
          mappingId: mapping.id,
          organizationId: FIXTURE.otherOrganizationId,
          enabled: true,
          actorUserId: FIXTURE.otherUserId,
        })
      ).rejects.toThrow();
      await disableLtiRegistration({
        registrationId,
        organizationId: FIXTURE.organizationId,
        actorUserId: FIXTURE.teacherUserId,
        uninstall: true,
      });
      await expect(
        enableLtiRegistration({
          registrationId,
          organizationId: FIXTURE.organizationId,
          actorUserId: FIXTURE.teacherUserId,
        })
      ).rejects.toMatchObject({ code: 'invalid_request' });
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'supports audited unlink recovery and privacy deletion without stranded sessions',
    async () => {
      const identity = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.registrationId },
      });
      const session = await prisma.session.create({
        data: {
          userId: FIXTURE.teacherUserId,
          expirationDate: new Date(Date.now() + 60 * 60 * 1000),
          ltiRegistrationId: FIXTURE.registrationId,
          ltiOrganizationId: FIXTURE.organizationId,
          ltiExternalIdentityId: identity.id,
        },
      });
      await unlinkLtiExternalIdentity({
        identityId: identity.id,
        organizationId: FIXTURE.organizationId,
        actorUserId: FIXTURE.teacherUserId,
      });
      expect(await prisma.session.count({ where: { id: session.id } })).toBe(0);
      expect(
        await prisma.ltiAuditEvent.count({
          where: {
            registrationId: FIXTURE.registrationId,
            eventType: 'identity_unlinked',
            outcome: 'accepted',
          },
        })
      ).toBe(1);

      const recoveryLaunch = await initiateAndAuthorize();
      const pending = await completeLtiLaunch(recoveryLaunch.form, {
        now: recoveryLaunch.now,
        browserBinding: recoveryLaunch.browserBinding,
      });
      expect(pending.kind).toBe('link_required');
      if (pending.kind !== 'link_required') throw new Error('Expected link.');
      await linkPendingLtiIdentity({
        pendingLinkId: pending.pendingLinkId,
        secret: pending.pendingLinkSecret,
        userId: FIXTURE.teacherUserId,
        now: recoveryLaunch.now,
      });

      const otherIdentity = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.otherRegistrationId },
      });
      const otherSession = await prisma.session.create({
        data: {
          userId: FIXTURE.otherUserId,
          expirationDate: new Date(Date.now() + 60 * 60 * 1000),
          ltiRegistrationId: FIXTURE.otherRegistrationId,
          ltiOrganizationId: FIXTURE.otherOrganizationId,
          ltiExternalIdentityId: otherIdentity.id,
        },
      });
      const otherMembership = await prisma.orgMembership.findFirstOrThrow({
        where: {
          userId: FIXTURE.otherUserId,
          organizationId: FIXTURE.otherOrganizationId,
        },
        select: { id: true },
      });
      await prisma.orgMembership.delete({ where: { id: otherMembership.id } });
      expect(
        await prisma.ltiExternalIdentity.count({
          where: { id: otherIdentity.id },
        })
      ).toBe(0);
      expect(
        await prisma.session.count({ where: { id: otherSession.id } })
      ).toBe(0);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'serializes the registration-wide initiation hard cap across distinct requesters',
    async () => {
      await prisma.ltiLaunchTransaction.deleteMany({
        where: { registrationId: FIXTURE.registrationId },
      });
      const now = new Date(platform.seed.nowSeconds * 1000);
      const parameters = (scenario?: string) =>
        new URLSearchParams({
          iss: platform.registration.issuer,
          client_id: platform.registration.clientId,
          lti_deployment_id: platform.registration.deploymentId,
          login_hint: 'opaque-quota-proof',
          target_link_uri: platform.registration.launchUrl,
          ...(scenario ? { lti_message_hint: scenario } : {}),
        });
      const sampledInitiations: Awaited<ReturnType<typeof initiateLtiLogin>>[] =
        [];
      for (
        let index = 0;
        index < LTI_PILOT_LIMITS.registrationLoginsPerMinute - 1;
        index += 1
      ) {
        const initiated = await initiateLtiLogin(
          parameters(index < 12 ? 'unknown-kid' : undefined),
          {
            now,
            requesterFingerprint: `prefill-${index}`,
          }
        );
        if (index < 13) sampledInitiations.push(initiated);
      }
      const concurrent = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          initiateLtiLogin(parameters(), {
            now,
            requesterFingerprint: `concurrent-${index}`,
          })
        )
      );
      expect(
        concurrent.filter(({ status }) => status === 'fulfilled')
      ).toHaveLength(1);
      expect(
        concurrent.filter(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof Error &&
            'code' in result.reason &&
            result.reason.code === 'rate_limited'
        )
      ).toHaveLength(9);
      expect(
        await prisma.ltiLaunchTransaction.count({
          where: { registrationId: FIXTURE.registrationId },
        })
      ).toBe(LTI_PILOT_LIMITS.registrationLoginsPerMinute);

      const jwksBeforeFailures = platform.journal.filter(
        (entry) => entry.path === '/.well-known/jwks.json'
      ).length;
      for (const initiated of sampledInitiations.slice(0, 12)) {
        const response = await Bun.fetch(initiated.authorizationUrl);
        const form = extractFormPost(await response.text());
        await expect(
          completeLtiLaunch(form, {
            now,
            browserBinding: {
              transactionId: initiated.transactionId,
              secret: initiated.browserBindingSecret,
            },
          })
        ).rejects.toMatchObject({ code: 'invalid_launch' });
      }
      const jwksAfterFailures = platform.journal.filter(
        (entry) => entry.path === '/.well-known/jwks.json'
      ).length;
      expect(jwksAfterFailures - jwksBeforeFailures).toBeLessThanOrEqual(1);
      expect(
        await prisma.ltiAuditEvent.count({
          where: {
            registrationId: FIXTURE.registrationId,
            eventType: 'launch_verification_failed',
            createdAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) },
          },
        })
      ).toBeLessThanOrEqual(LTI_PILOT_LIMITS.failureAuditsPerFiveMinutes);

      const saturationRows = await prisma.ltiLaunchTransaction.findMany({
        where: {
          registrationId: FIXTURE.registrationId,
          id: {
            notIn: sampledInitiations.map(({ transactionId }) => transactionId),
          },
        },
        take: 14,
        select: { id: true },
      });
      await prisma.ltiLaunchTransaction.updateMany({
        where: { id: { in: saturationRows.map(({ id }) => id) } },
        data: { verificationAttempts: 8 },
      });
      const verificationTarget = sampledInitiations[12];
      if (!verificationTarget) throw new Error('Missing verification target.');
      const targetResponse = await Bun.fetch(
        verificationTarget.authorizationUrl
      );
      const targetForm = extractFormPost(await targetResponse.text());
      const jwksBeforeSaturation = platform.journal.filter(
        (entry) => entry.path === '/.well-known/jwks.json'
      ).length;
      await expect(
        completeLtiLaunch(targetForm, {
          now,
          browserBinding: {
            transactionId: verificationTarget.transactionId,
            secret: verificationTarget.browserBindingSecret,
          },
        })
      ).rejects.toMatchObject({ code: 'rate_limited' });
      expect(
        platform.journal.filter(
          (entry) => entry.path === '/.well-known/jwks.json'
        ).length
      ).toBe(jwksBeforeSaturation);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'serializes LTI session creation against registration and organization revocation',
    async () => {
      const identity = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.registrationId },
        include: { membership: { select: { id: true } } },
      });

      const proveRevocationWinsAfterSessionLinearizes = async (input: {
        revoke: () => Promise<void>;
        restore: () => Promise<void>;
      }) => {
        let revokeResolved = false;
        let revokePromise: Promise<void> | undefined;
        const session = await createLtiAuthenticatedSession({
          userId: FIXTURE.teacherUserId,
          membershipId: identity.membership.id,
          organizationId: FIXTURE.organizationId,
          registrationId: FIXTURE.registrationId,
          externalIdentityId: identity.id,
          classId: FIXTURE.classId,
          role: 'TEACHER',
          expirationDate: new Date(Date.now() + 60 * 60 * 1000),
          beforeInsert: async () => {
            revokePromise = input.revoke().then(() => {
              revokeResolved = true;
            });
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(revokeResolved).toBe(false);
          },
        });
        if (!revokePromise) throw new Error('Revocation did not start.');
        await revokePromise;
        expect(await prisma.session.count({ where: { id: session.id } })).toBe(
          0
        );
        await input.restore();
      };

      await proveRevocationWinsAfterSessionLinearizes({
        revoke: () =>
          disableLtiRegistration({
            registrationId: FIXTURE.registrationId,
            organizationId: FIXTURE.organizationId,
            actorUserId: FIXTURE.teacherUserId,
          }),
        restore: () =>
          enableLtiRegistration({
            registrationId: FIXTURE.registrationId,
            organizationId: FIXTURE.organizationId,
            actorUserId: FIXTURE.teacherUserId,
          }),
      });

      await proveRevocationWinsAfterSessionLinearizes({
        revoke: () =>
          setOrganizationLtiGate({
            organizationId: FIXTURE.organizationId,
            enabled: false,
            actorUserId: FIXTURE.teacherUserId,
          }),
        restore: () =>
          setOrganizationLtiGate({
            organizationId: FIXTURE.organizationId,
            enabled: true,
            actorUserId: FIXTURE.teacherUserId,
          }),
      });
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'preserves immutable audit evidence when its actor is privacy-deleted',
    async () => {
      const audit = await prisma.ltiAuditEvent.create({
        data: {
          eventType: 'privacy_actor_delete_proof',
          outcome: 'accepted',
          organizationId: FIXTURE.organizationId,
          actorUserId: FIXTURE.wrongClassUserId,
        },
      });
      const membership = await prisma.orgMembership.findFirstOrThrow({
        where: {
          userId: FIXTURE.wrongClassUserId,
          organizationId: FIXTURE.organizationId,
        },
        select: { id: true },
      });
      await prisma.orgMembership.delete({ where: { id: membership.id } });
      await prisma.user.delete({ where: { id: FIXTURE.wrongClassUserId } });
      expect(
        await prisma.ltiAuditEvent.findUniqueOrThrow({
          where: { id: audit.id },
          select: { actorUserId: true, eventType: true, outcome: true },
        })
      ).toEqual({
        actorUserId: null,
        eventType: 'privacy_actor_delete_proof',
        outcome: 'accepted',
      });
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'creates no launch or audit data while the tenant feature gate is disabled',
    async () => {
      const identity = await prisma.ltiExternalIdentity.findFirstOrThrow({
        where: { registrationId: FIXTURE.registrationId },
      });
      const session = await prisma.session.create({
        data: {
          userId: FIXTURE.teacherUserId,
          expirationDate: new Date(Date.now() + 60 * 60 * 1000),
          ltiRegistrationId: FIXTURE.registrationId,
          ltiOrganizationId: FIXTURE.organizationId,
          ltiExternalIdentityId: identity.id,
        },
      });
      await setOrganizationLtiGate({
        organizationId: FIXTURE.organizationId,
        enabled: false,
        actorUserId: FIXTURE.teacherUserId,
      });
      expect(await prisma.session.count({ where: { id: session.id } })).toBe(0);
      const before = await prisma.$transaction([
        prisma.ltiLaunchTransaction.count({
          where: { organizationId: FIXTURE.organizationId },
        }),
        prisma.ltiAuditEvent.count({
          where: { organizationId: FIXTURE.organizationId },
        }),
      ]);

      await expect(initiateAndAuthorize()).rejects.toMatchObject({
        code: 'not_available',
      });
      const after = await prisma.$transaction([
        prisma.ltiLaunchTransaction.count({
          where: { organizationId: FIXTURE.organizationId },
        }),
        prisma.ltiAuditEvent.count({
          where: { organizationId: FIXTURE.organizationId },
        }),
      ]);
      expect(after).toEqual(before);
    }
  );

  test.skipIf(!HAS_DATABASE)(
    'prunes expired operational artifacts without deleting audit evidence',
    async () => {
      const auditsBefore = await prisma.ltiAuditEvent.count({
        where: { organizationId: FIXTURE.organizationId },
      });
      const result = await pruneExpiredLtiOperationalData({
        now: new Date(
          platform.seed.nowSeconds * 1000 + 3 * 24 * 60 * 60 * 1000
        ),
      });
      expect(result.count).toBeGreaterThan(0);
      expect(
        await prisma.ltiAuditEvent.count({
          where: { organizationId: FIXTURE.organizationId },
        })
      ).toBe(auditsBefore);
    }
  );
});
