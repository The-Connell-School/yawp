import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import type { MockLtiPlatform } from '../../../e2e/mocks/lti/mock-lti-platform';
import { startMockLtiPlatform } from '../../../e2e/mocks/lti/mock-lti-platform';
import {
  completeLtiLaunch,
  createLtiRegistration,
  disableLtiRegistration,
  enableLtiRegistration,
  initiateLtiLogin,
  inspectPendingLtiLink,
  linkPendingLtiIdentity,
  setLtiCourseMappingEnabled,
  setOrganizationLtiGate,
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
  otherUserId: 'lti-pilot-it-other-user',
  schoolId: 'lti-pilot-it-school',
  classId: 'lti-pilot-it-class',
  registrationId: 'lti-pilot-it-registration',
} as const;

let platform: MockLtiPlatform;

async function cleanupFixture() {
  await prisma.ltiExternalIdentity.deleteMany({
    where: { registrationId: FIXTURE.registrationId },
  });
  await prisma.ltiPendingLink.deleteMany({
    where: { registrationId: FIXTURE.registrationId },
  });
  await prisma.ltiLaunchTransaction.deleteMany({
    where: { registrationId: FIXTURE.registrationId },
  });
  await prisma.ltiCourseMapping.deleteMany({
    where: { registrationId: FIXTURE.registrationId },
  });
  await prisma.ltiRegistration.deleteMany({
    where: { id: FIXTURE.registrationId },
  });
  await prisma.class.deleteMany({ where: { id: FIXTURE.classId } });
  await prisma.school.deleteMany({ where: { id: FIXTURE.schoolId } });
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
    where: { id: { in: [FIXTURE.teacherUserId, FIXTURE.otherUserId] } },
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
  now = new Date(platform.seed.nowSeconds * 1000)
) {
  const initiated = await initiateLtiLogin(
    new URLSearchParams({
      iss: platform.registration.issuer,
      client_id: platform.registration.clientId,
      lti_deployment_id: platform.registration.deploymentId,
      login_hint: 'opaque-integration-login-hint',
      lti_message_hint: scenario,
      target_link_uri: platform.registration.launchUrl,
    }),
    { now }
  );
  const response = await Bun.fetch(initiated.authorizationUrl);
  expect(response.status).toBe(200);
  return {
    initiated,
    form: extractFormPost(await response.text()),
    now,
  };
}

describe('persisted LTI launch pilot over a real database and LMS network', () => {
  beforeAll(async () => {
    if (!HAS_DATABASE) return;
    process.env.LTI_ALLOW_LOOPBACK_HTTP = 'true';
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? 'lti-pilot-integration-secret-2026';
    platform = await startMockLtiPlatform();
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
          id: FIXTURE.otherUserId,
          email: 'lti-pilot-other@example.test',
          name: 'Other Tenant User',
        },
      ],
    });
    const [teacherMembership] = await Promise.all([
      prisma.orgMembership.create({
        data: {
          userId: FIXTURE.teacherUserId,
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
    await prisma.school.create({
      data: {
        id: FIXTURE.schoolId,
        name: 'LTI Pilot School',
        code: 'LTI-PILOT-IT-SCHOOL',
        organizationId: FIXTURE.organizationId,
      },
    });
    await prisma.class.create({
      data: {
        id: FIXTURE.classId,
        code: 'LTI-PILOT-IT-CLASS',
        period: '1',
        grade: 'College',
        title: 'English Composition I',
        schoolId: FIXTURE.schoolId,
        teachers: { connect: { id: teacherMembership.id } },
      },
    });
    await prisma.ltiRegistration.create({
      data: {
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
    });
    await prisma.ltiCourseMapping.create({
      data: {
        registrationId: FIXTURE.registrationId,
        organizationId: FIXTURE.organizationId,
        contextId: platform.seed.context.id,
        classId: FIXTURE.classId,
      },
    });
  });

  afterAll(async () => {
    if (!HAS_DATABASE) return;
    await cleanupFixture();
    await platform.close();
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

      const pending = await completeLtiLaunch(first.form, { now: first.now });
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
        completeLtiLaunch(second.form, { now: second.now })
      ).resolves.toMatchObject({
        kind: 'linked',
        userId: FIXTURE.teacherUserId,
        organizationId: FIXTURE.organizationId,
        role: 'TEACHER',
      });
      await expect(
        completeLtiLaunch(second.form, { now: second.now })
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
    'consumes a verified launch that carries no authorized Yawp role',
    async () => {
      const unauthorized = await initiateAndAuthorize('empty-roles');
      await expect(
        completeLtiLaunch(unauthorized.form, { now: unauthorized.now })
      ).rejects.toMatchObject({ code: 'role_not_allowed' });
      await expect(
        completeLtiLaunch(unauthorized.form, { now: unauthorized.now })
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
    'creates no launch or audit data while the tenant feature gate is disabled',
    async () => {
      await setOrganizationLtiGate({
        organizationId: FIXTURE.organizationId,
        enabled: false,
        actorUserId: FIXTURE.teacherUserId,
      });
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
});
