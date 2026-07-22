import { createHmac } from 'node:crypto';
import type { LtiRegistration as PersistedLtiRegistration } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  LTI_MESSAGE_TYPES,
  verifyLtiLaunchForm,
  type LtiSigningKeyResolver,
} from './lti-contract.server';
import { createLtiSigningKeyCache } from './lti-jwks-cache.server';
import {
  buildLtiOidcAuthorizationUrl,
  deriveLtiSubjectHash,
  generateLtiOneTimeValue,
  hashLtiOneTimeValue,
  ltiOneTimeValueMatches,
  mapLtiRolesToMembershipRole,
  parseLtiLoginInitiation,
  resolveLtiLaunchDestination,
  type LtiLoginInitiation,
  type LtiMembershipRole,
} from './lti-launch-pilot.server';
import {
  assertAllowedLtiTargetLink,
  parseLtiRegistration,
  type LtiRegistration,
} from './lti-registration';

const LAUNCH_TTL_MS = 5 * 60 * 1000;
const LINK_TTL_MS = 15 * 60 * 1000;
const signingKeyCache = createLtiSigningKeyCache();

export type LtiPilotErrorCode =
  | 'not_available'
  | 'invalid_request'
  | 'invalid_launch'
  | 'expired'
  | 'replay'
  | 'role_not_allowed'
  | 'course_unmapped'
  | 'account_conflict'
  | 'link_expired'
  | 'membership_not_allowed';

export class LtiPilotError extends Error {
  readonly code: LtiPilotErrorCode;
  readonly status: number;

  constructor(
    code: LtiPilotErrorCode,
    message: string,
    status = 400,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'LtiPilotError';
    this.code = code;
    this.status = status;
  }
}

function getRootSecret() {
  const rootSecret = process.env.SESSION_SECRET?.split(',')[0]?.trim();
  if (!rootSecret || rootSecret.length < 16) {
    throw new Error('SESSION_SECRET must contain a stable LTI HMAC root.');
  }
  return rootSecret;
}

export function getLtiIdentityHmacSecret() {
  return createHmac('sha256', getRootSecret())
    .update('yawp:lti:identity:v1', 'utf8')
    .digest('hex');
}

function hashScopedOpaqueValue(
  registrationId: string,
  label: string,
  value: string
) {
  return createHmac('sha256', getRootSecret())
    .update(`yawp:lti:${label}:v1`, 'utf8')
    .update('\0', 'utf8')
    .update(registrationId, 'utf8')
    .update('\0', 'utf8')
    .update(value, 'utf8')
    .digest('hex');
}

function allowLoopbackHttp() {
  return process.env.LTI_ALLOW_LOOPBACK_HTTP === 'true';
}

function registrationTransportMode(registration: PersistedLtiRegistration) {
  return allowLoopbackHttp() &&
    new URL(registration.issuer).protocol === 'http:'
    ? ('loopback-http' as const)
    : ('https' as const);
}

export function toLtiContractRegistration(
  registration: PersistedLtiRegistration
): LtiRegistration {
  return parseLtiRegistration(
    {
      id: registration.id,
      organizationId: registration.organizationId,
      provider: registration.provider,
      displayName: registration.displayName,
      transportMode: registrationTransportMode(registration),
      issuer: registration.issuer,
      clientId: registration.clientId,
      allowedAudiences: registration.allowedAudiences,
      deploymentId: registration.deploymentId,
      authorizationEndpoint: registration.authorizationEndpoint,
      tokenEndpoint: registration.tokenEndpoint,
      jwksUrl: registration.jwksUrl,
      allowedServiceOrigins: registration.allowedServiceOrigins,
      loginInitiationUrl: registration.loginInitiationUrl,
      launchUrl: registration.launchUrl,
      deepLinkingLaunchUrl: registration.deepLinkingLaunchUrl,
      toolJwksUrl: registration.toolJwksUrl,
      allowedTargetLinkUris: registration.allowedTargetLinkUris,
      enabledScopes: registration.enabledScopes,
      jwksCacheTtlSeconds: registration.jwksCacheTtlSeconds,
      enabled: registration.enabled && registration.uninstalledAt === null,
    },
    { allowLoopbackHttp: allowLoopbackHttp() }
  );
}

function publicFailure(error: unknown, fallback: LtiPilotErrorCode) {
  if (error instanceof LtiPilotError) return error;
  return new LtiPilotError(
    fallback,
    'The LTI request could not be completed.',
    400,
    { cause: error }
  );
}

async function findAvailableRegistration(initiation: LtiLoginInitiation) {
  const registration = await prisma.ltiRegistration.findUnique({
    where: {
      issuer_clientId_deploymentId: {
        issuer: initiation.issuer,
        clientId: initiation.clientId,
        deploymentId: initiation.deploymentId,
      },
    },
    include: { organization: { select: { ltiEnabled: true } } },
  });
  if (
    !registration ||
    !registration.enabled ||
    registration.uninstalledAt !== null ||
    !registration.organization.ltiEnabled
  ) {
    throw new LtiPilotError(
      'not_available',
      'The LTI integration is not available.',
      404
    );
  }
  return registration;
}

export async function initiateLtiLogin(
  parameters: URLSearchParams,
  options: { now?: Date } = {}
) {
  let initiation: LtiLoginInitiation;
  try {
    initiation = parseLtiLoginInitiation(parameters);
  } catch (error) {
    throw publicFailure(error, 'invalid_request');
  }
  const persistedRegistration = await findAvailableRegistration(initiation);
  const registration = toLtiContractRegistration(persistedRegistration);
  let targetLinkUri: string;
  try {
    targetLinkUri = assertAllowedLtiTargetLink(
      initiation.targetLinkUri,
      registration
    ).toString();
  } catch (error) {
    throw publicFailure(error, 'invalid_request');
  }
  if (targetLinkUri !== new URL(registration.launchUrl).toString()) {
    throw new LtiPilotError(
      'invalid_request',
      'This LTI login endpoint accepts resource launches only.'
    );
  }

  const state = generateLtiOneTimeValue();
  const nonce = generateLtiOneTimeValue();
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LAUNCH_TTL_MS);

  const transaction = await prisma.$transaction(async (database) => {
    const created = await database.ltiLaunchTransaction.create({
      data: {
        createdAt: now,
        stateHash: hashLtiOneTimeValue(state),
        nonceHash: hashLtiOneTimeValue(nonce),
        loginHintHash: hashScopedOpaqueValue(
          registration.id,
          'login-hint',
          initiation.loginHint
        ),
        messageHintHash: initiation.messageHint
          ? hashScopedOpaqueValue(
              registration.id,
              'message-hint',
              initiation.messageHint
            )
          : null,
        targetLinkUri,
        expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
        expiresAt,
        registrationId: registration.id,
        organizationId: registration.organizationId,
      },
      select: { id: true },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'oidc_login_initiated',
        outcome: 'accepted',
        registrationId: registration.id,
        organizationId: registration.organizationId,
        details: { transactionId: created.id },
      },
    });
    return created;
  });

  return {
    transactionId: transaction.id,
    authorizationUrl: buildLtiOidcAuthorizationUrl({
      authorizationEndpoint: registration.authorizationEndpoint,
      clientId: registration.clientId,
      launchUrl: registration.launchUrl,
      loginHint: initiation.loginHint,
      messageHint: initiation.messageHint,
      state,
      nonce,
    }),
  };
}

type CompletedLtiLaunch =
  | {
      kind: 'linked';
      userId: string;
      membershipId: string;
      organizationId: string;
      role: LtiMembershipRole;
      destination: string;
    }
  | {
      kind: 'link_required';
      pendingLinkId: string;
      pendingLinkSecret: string;
      organizationId: string;
      role: LtiMembershipRole;
      destination: string;
    };

async function consumeVerifiedLaunchFailure(input: {
  transactionId: string;
  registrationId: string;
  organizationId: string;
  outcome: 'invalid_launch' | 'role_not_allowed';
  contextId?: string | null;
  now: Date;
}) {
  return prisma.$transaction(async (database) => {
    const consumed = await database.ltiLaunchTransaction.updateMany({
      where: {
        id: input.transactionId,
        consumedAt: null,
        expiresAt: { gt: input.now },
      },
      data: { consumedAt: input.now },
    });
    if (consumed.count !== 1) return false;
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'launch_completed',
        outcome: input.outcome,
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        contextId: input.contextId ?? null,
      },
    });
    return true;
  });
}

export async function completeLtiLaunch(
  form: { idToken: string; state: string },
  options: {
    now?: Date;
    currentUserId?: string | null;
    resolveSigningKey?: LtiSigningKeyResolver;
  } = {}
): Promise<CompletedLtiLaunch> {
  if (!form.state || !form.idToken) {
    throw new LtiPilotError(
      'invalid_request',
      'LTI launch form is incomplete.'
    );
  }
  const now = options.now ?? new Date();
  const transaction = await prisma.ltiLaunchTransaction.findUnique({
    where: { stateHash: hashLtiOneTimeValue(form.state) },
    include: {
      registration: true,
      organization: { select: { ltiEnabled: true } },
    },
  });
  if (
    !transaction ||
    !transaction.registration.enabled ||
    transaction.registration.uninstalledAt !== null ||
    !transaction.organization.ltiEnabled
  ) {
    throw new LtiPilotError(
      'not_available',
      'The LTI integration is unavailable.',
      404
    );
  }
  if (transaction.consumedAt !== null) {
    throw new LtiPilotError('replay', 'This LTI launch was already used.', 409);
  }
  if (transaction.expiresAt <= now) {
    throw new LtiPilotError('expired', 'This LTI launch has expired.', 410);
  }
  const registration = toLtiContractRegistration(transaction.registration);

  let launch;
  try {
    launch = await verifyLtiLaunchForm(form, {
      registration,
      expectedState: null,
      expectedStateHash: transaction.stateHash,
      expectedNonce: null,
      expectedNonceHash: transaction.nonceHash,
      expectedTargetLinkUri: transaction.targetLinkUri,
      expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
      nowSeconds: Math.floor(now.getTime() / 1000),
      resolveSigningKey:
        options.resolveSigningKey ?? signingKeyCache.resolveSigningKey,
    });
  } catch (error) {
    throw publicFailure(error, 'invalid_launch');
  }
  if (!launch.subject || !launch.context?.id) {
    const consumed = await consumeVerifiedLaunchFailure({
      transactionId: transaction.id,
      registrationId: registration.id,
      organizationId: registration.organizationId,
      outcome: 'invalid_launch',
      contextId: launch.context?.id,
      now,
    });
    if (!consumed) {
      throw new LtiPilotError(
        'replay',
        'This LTI launch was already used.',
        409
      );
    }
    throw new LtiPilotError(
      'invalid_launch',
      'An identified course launch is required.'
    );
  }

  let role: LtiMembershipRole;
  try {
    role = mapLtiRolesToMembershipRole(launch.roles);
  } catch (error) {
    const consumed = await consumeVerifiedLaunchFailure({
      transactionId: transaction.id,
      registrationId: registration.id,
      organizationId: registration.organizationId,
      outcome: 'role_not_allowed',
      contextId: launch.context.id,
      now,
    });
    if (!consumed) {
      throw new LtiPilotError(
        'replay',
        'This LTI launch was already used.',
        409
      );
    }
    throw new LtiPilotError(
      'role_not_allowed',
      'The LMS role cannot enter this Yawp integration.',
      403,
      { cause: error }
    );
  }
  const subjectHash = deriveLtiSubjectHash({
    hmacSecret: getLtiIdentityHmacSecret(),
    registrationId: registration.id,
    subject: launch.subject,
  });

  const result = await prisma.$transaction(async (database) => {
    const consumed = await database.ltiLaunchTransaction.updateMany({
      where: {
        id: transaction.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return { outcome: 'replay' as const };

    const courseMapping = await database.ltiCourseMapping.findUnique({
      where: {
        registrationId_contextId: {
          registrationId: registration.id,
          contextId: launch.context!.id,
        },
      },
      include: {
        class: {
          select: {
            id: true,
            school: { select: { organizationId: true } },
          },
        },
      },
    });
    if (
      !courseMapping?.enabled ||
      courseMapping.organizationId !== registration.organizationId ||
      courseMapping.class.school.organizationId !== registration.organizationId
    ) {
      await database.ltiAuditEvent.create({
        data: {
          eventType: 'launch_completed',
          outcome: 'course_unmapped',
          registrationId: registration.id,
          organizationId: registration.organizationId,
          subjectHash,
          contextId: launch.context!.id,
        },
      });
      return { outcome: 'course_unmapped' as const };
    }

    const destination = resolveLtiLaunchDestination({
      classId: courseMapping.class.id,
      role,
    });
    const identity = await database.ltiExternalIdentity.findUnique({
      where: {
        registrationId_subjectHash: {
          registrationId: registration.id,
          subjectHash,
        },
      },
      include: {
        membership: {
          select: { id: true, userId: true, role: true, isActive: true },
        },
      },
    });

    if (identity) {
      if (
        identity.organizationId !== registration.organizationId ||
        !identity.membership.isActive ||
        identity.membership.role !== role ||
        (options.currentUserId &&
          options.currentUserId !== identity.membership.userId)
      ) {
        await database.ltiAuditEvent.create({
          data: {
            eventType: 'launch_completed',
            outcome: 'account_conflict',
            registrationId: registration.id,
            organizationId: registration.organizationId,
            subjectHash,
            contextId: launch.context!.id,
          },
        });
        return { outcome: 'account_conflict' as const };
      }
      await database.ltiExternalIdentity.update({
        where: { id: identity.id },
        data: { lastLaunchedAt: now },
      });
      await database.ltiAuditEvent.create({
        data: {
          eventType: 'launch_completed',
          outcome: 'linked',
          registrationId: registration.id,
          organizationId: registration.organizationId,
          subjectHash,
          contextId: launch.context!.id,
        },
      });
      return {
        outcome: 'linked' as const,
        userId: identity.membership.userId,
        membershipId: identity.membership.id,
        destination,
      };
    }

    const pendingLinkSecret = generateLtiOneTimeValue();
    const pending = await database.ltiPendingLink.create({
      data: {
        createdAt: now,
        secretHash: hashLtiOneTimeValue(pendingLinkSecret),
        subjectHash,
        membershipRole: role,
        transactionId: transaction.id,
        registrationId: registration.id,
        organizationId: registration.organizationId,
        courseMappingId: courseMapping.id,
        expiresAt: new Date(now.getTime() + LINK_TTL_MS),
      },
      select: { id: true },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'launch_completed',
        outcome: 'link_required',
        registrationId: registration.id,
        organizationId: registration.organizationId,
        subjectHash,
        contextId: launch.context!.id,
      },
    });
    return {
      outcome: 'link_required' as const,
      pendingLinkId: pending.id,
      pendingLinkSecret,
      destination,
    };
  });

  if (result.outcome === 'replay') {
    throw new LtiPilotError('replay', 'This LTI launch was already used.', 409);
  }
  if (result.outcome === 'course_unmapped') {
    throw new LtiPilotError(
      'course_unmapped',
      'This LMS course is not mapped to Yawp.',
      409
    );
  }
  if (result.outcome === 'account_conflict') {
    throw new LtiPilotError(
      'account_conflict',
      'The linked account does not match this session.',
      409
    );
  }
  if (result.outcome === 'linked') {
    return {
      kind: 'linked',
      userId: result.userId,
      membershipId: result.membershipId,
      organizationId: registration.organizationId,
      role,
      destination: result.destination,
    };
  }
  return {
    kind: 'link_required',
    pendingLinkId: result.pendingLinkId,
    pendingLinkSecret: result.pendingLinkSecret,
    organizationId: registration.organizationId,
    role,
    destination: result.destination,
  };
}

export async function inspectPendingLtiLink(input: {
  pendingLinkId: string;
  secret: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const pending = await prisma.ltiPendingLink.findUnique({
    where: { id: input.pendingLinkId },
    include: {
      registration: { select: { enabled: true, uninstalledAt: true } },
      organization: { select: { id: true, name: true, ltiEnabled: true } },
      courseMapping: {
        select: {
          enabled: true,
          contextId: true,
          class: { select: { id: true, title: true, code: true } },
        },
      },
    },
  });
  if (
    !pending ||
    pending.consumedAt !== null ||
    pending.expiresAt <= now ||
    !pending.registration.enabled ||
    pending.registration.uninstalledAt !== null ||
    !pending.organization.ltiEnabled ||
    !pending.courseMapping.enabled ||
    !ltiOneTimeValueMatches(input.secret, pending.secretHash)
  ) {
    throw new LtiPilotError(
      'link_expired',
      'This account-link request is unavailable.',
      410
    );
  }
  return {
    id: pending.id,
    organizationId: pending.organization.id,
    organizationName: pending.organization.name,
    classId: pending.courseMapping.class.id,
    className:
      pending.courseMapping.class.title ?? pending.courseMapping.class.code,
    role: pending.membershipRole,
  };
}

export async function linkPendingLtiIdentity(input: {
  pendingLinkId: string;
  secret: string;
  userId: string;
  now?: Date;
}) {
  const inspected = await inspectPendingLtiLink(input);
  const now = input.now ?? new Date();
  const result = await prisma.$transaction(async (database) => {
    const pending = await database.ltiPendingLink.findUnique({
      where: { id: input.pendingLinkId },
      include: {
        registration: { select: { enabled: true, uninstalledAt: true } },
        organization: { select: { ltiEnabled: true } },
        courseMapping: {
          select: { classId: true, contextId: true, enabled: true },
        },
      },
    });
    if (
      !pending ||
      pending.consumedAt !== null ||
      pending.expiresAt <= now ||
      !pending.registration.enabled ||
      pending.registration.uninstalledAt !== null ||
      !pending.organization.ltiEnabled ||
      !pending.courseMapping.enabled ||
      !ltiOneTimeValueMatches(input.secret, pending.secretHash)
    ) {
      return { outcome: 'expired' as const };
    }
    const membership = await database.orgMembership.findFirst({
      where: {
        userId: input.userId,
        organizationId: pending.organizationId,
        role: pending.membershipRole,
        isActive: true,
      },
      select: { id: true },
    });
    if (!membership) {
      await database.ltiAuditEvent.create({
        data: {
          eventType: 'identity_linked',
          outcome: 'membership_not_allowed',
          registrationId: pending.registrationId,
          organizationId: pending.organizationId,
          subjectHash: pending.subjectHash,
          contextId: pending.courseMapping.contextId,
          actorUserId: input.userId,
        },
      });
      return { outcome: 'membership_not_allowed' as const };
    }

    const consumed = await database.ltiPendingLink.updateMany({
      where: { id: pending.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return { outcome: 'expired' as const };

    const existing = await database.ltiExternalIdentity.findFirst({
      where: {
        registrationId: pending.registrationId,
        OR: [
          { subjectHash: pending.subjectHash },
          { membershipId: membership.id },
        ],
      },
      select: { subjectHash: true, membershipId: true },
    });
    if (
      existing &&
      (existing.subjectHash !== pending.subjectHash ||
        existing.membershipId !== membership.id)
    ) {
      await database.ltiAuditEvent.create({
        data: {
          eventType: 'identity_linked',
          outcome: 'account_conflict',
          registrationId: pending.registrationId,
          organizationId: pending.organizationId,
          subjectHash: pending.subjectHash,
          contextId: pending.courseMapping.contextId,
          actorUserId: input.userId,
        },
      });
      return { outcome: 'account_conflict' as const };
    }
    if (!existing) {
      await database.ltiExternalIdentity.create({
        data: {
          subjectHash: pending.subjectHash,
          registrationId: pending.registrationId,
          organizationId: pending.organizationId,
          membershipId: membership.id,
          lastLaunchedAt: now,
        },
      });
    }
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'identity_linked',
        outcome: 'accepted',
        registrationId: pending.registrationId,
        organizationId: pending.organizationId,
        subjectHash: pending.subjectHash,
        contextId: pending.courseMapping.contextId,
        actorUserId: input.userId,
      },
    });
    return { outcome: 'linked' as const, membershipId: membership.id };
  });

  if (result.outcome === 'expired') {
    throw new LtiPilotError(
      'link_expired',
      'This account-link request is unavailable.',
      410
    );
  }
  if (result.outcome === 'membership_not_allowed') {
    throw new LtiPilotError(
      'membership_not_allowed',
      'Your verified Yawp membership is not eligible for this LMS role.',
      403
    );
  }
  if (result.outcome === 'account_conflict') {
    throw new LtiPilotError(
      'account_conflict',
      'This LMS or Yawp identity is already linked.',
      409
    );
  }
  return {
    membershipId: result.membershipId,
    organizationId: inspected.organizationId,
    destination: resolveLtiLaunchDestination({
      classId: inspected.classId,
      role: inspected.role,
    }),
  };
}

export async function cancelPendingLtiLink(input: {
  pendingLinkId: string;
  secret: string;
  actorUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (database) => {
    const pending = await database.ltiPendingLink.findUnique({
      where: { id: input.pendingLinkId },
      include: {
        registration: { select: { enabled: true, uninstalledAt: true } },
        organization: { select: { ltiEnabled: true } },
        courseMapping: { select: { contextId: true, enabled: true } },
      },
    });
    if (
      !pending ||
      pending.consumedAt !== null ||
      pending.expiresAt <= now ||
      !pending.registration.enabled ||
      pending.registration.uninstalledAt !== null ||
      !pending.organization.ltiEnabled ||
      !pending.courseMapping.enabled ||
      !ltiOneTimeValueMatches(input.secret, pending.secretHash)
    ) {
      throw new LtiPilotError(
        'link_expired',
        'This account-link request is unavailable.',
        410
      );
    }
    const consumed = await database.ltiPendingLink.updateMany({
      where: { id: pending.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new LtiPilotError(
        'link_expired',
        'This account-link request is unavailable.',
        410
      );
    }
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'identity_link_cancelled',
        outcome: 'accepted',
        registrationId: pending.registrationId,
        organizationId: pending.organizationId,
        subjectHash: pending.subjectHash,
        contextId: pending.courseMapping.contextId,
        actorUserId: input.actorUserId,
      },
    });
  });
}

export async function disableLtiRegistration(input: {
  registrationId: string;
  organizationId: string;
  actorUserId: string;
  uninstall?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const registration = await prisma.$transaction(async (database) => {
    const updated = await database.ltiRegistration.update({
      where: {
        id_organizationId: {
          id: input.registrationId,
          organizationId: input.organizationId,
        },
      },
      data: {
        enabled: false,
        disabledAt: now,
        ...(input.uninstall ? { uninstalledAt: now } : {}),
      },
      select: { id: true },
    });
    await database.ltiLaunchTransaction.updateMany({
      where: {
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
    await database.ltiPendingLink.updateMany({
      where: {
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: input.uninstall
          ? 'registration_uninstalled'
          : 'registration_disabled',
        outcome: 'accepted',
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      },
    });
    return updated;
  });
  signingKeyCache.clearRegistration(registration.id);
}

export async function createLtiRegistration(input: {
  registration: LtiRegistration;
  actorUserId: string;
}) {
  if (
    input.registration.transportMode !== 'https' ||
    input.registration.enabled
  ) {
    throw new LtiPilotError(
      'invalid_request',
      'New LTI registrations must use HTTPS and begin disabled.'
    );
  }
  return prisma.$transaction(async (database) => {
    const organization = await database.organization.findUnique({
      where: { id: input.registration.organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new LtiPilotError(
        'invalid_request',
        'Organization not found.',
        404
      );
    }
    const registration = await database.ltiRegistration.create({
      data: {
        id: input.registration.id,
        organizationId: input.registration.organizationId,
        provider: input.registration.provider,
        displayName: input.registration.displayName,
        issuer: input.registration.issuer,
        clientId: input.registration.clientId,
        deploymentId: input.registration.deploymentId,
        authorizationEndpoint: input.registration.authorizationEndpoint,
        tokenEndpoint: input.registration.tokenEndpoint,
        jwksUrl: input.registration.jwksUrl,
        loginInitiationUrl: input.registration.loginInitiationUrl,
        launchUrl: input.registration.launchUrl,
        deepLinkingLaunchUrl: input.registration.deepLinkingLaunchUrl,
        toolJwksUrl: input.registration.toolJwksUrl,
        allowedAudiences: input.registration.allowedAudiences,
        allowedServiceOrigins: input.registration.allowedServiceOrigins,
        allowedTargetLinkUris: input.registration.allowedTargetLinkUris,
        enabledScopes: input.registration.enabledScopes,
        jwksCacheTtlSeconds: input.registration.jwksCacheTtlSeconds,
        enabled: false,
      },
      select: { id: true, organizationId: true },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'registration_created',
        outcome: 'accepted',
        registrationId: registration.id,
        organizationId: registration.organizationId,
        actorUserId: input.actorUserId,
      },
    });
    return registration;
  });
}

export async function enableLtiRegistration(input: {
  registrationId: string;
  organizationId: string;
  actorUserId: string;
}) {
  const registration = await prisma.ltiRegistration.findUnique({
    where: {
      id_organizationId: {
        id: input.registrationId,
        organizationId: input.organizationId,
      },
    },
    include: { organization: { select: { ltiEnabled: true } } },
  });
  if (!registration || registration.uninstalledAt !== null) {
    throw new LtiPilotError('invalid_request', 'Registration not found.', 404);
  }
  if (!registration.organization.ltiEnabled) {
    throw new LtiPilotError(
      'not_available',
      'Enable the organization LTI gate before this registration.',
      409
    );
  }
  toLtiContractRegistration({ ...registration, enabled: true });
  await prisma.$transaction(async (database) => {
    await database.ltiRegistration.update({
      where: {
        id_organizationId: {
          id: input.registrationId,
          organizationId: input.organizationId,
        },
      },
      data: { enabled: true, disabledAt: null },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'registration_enabled',
        outcome: 'accepted',
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      },
    });
  });
  signingKeyCache.clearRegistration(input.registrationId);
}

export async function upsertLtiCourseMapping(input: {
  registrationId: string;
  organizationId: string;
  contextId: string;
  classId: string;
  actorUserId: string;
}) {
  if (!input.contextId || input.contextId.length > 255) {
    throw new LtiPilotError(
      'invalid_request',
      'LMS context id must contain 1 to 255 characters.'
    );
  }
  return prisma.$transaction(async (database) => {
    const [registration, classRecord] = await Promise.all([
      database.ltiRegistration.findUnique({
        where: {
          id_organizationId: {
            id: input.registrationId,
            organizationId: input.organizationId,
          },
        },
        select: { id: true, uninstalledAt: true },
      }),
      database.class.findUnique({
        where: { id: input.classId },
        select: { id: true, school: { select: { organizationId: true } } },
      }),
    ]);
    if (!registration || registration.uninstalledAt !== null) {
      throw new LtiPilotError(
        'invalid_request',
        'Registration not found.',
        404
      );
    }
    if (
      !classRecord ||
      classRecord.school.organizationId !== input.organizationId
    ) {
      throw new LtiPilotError('invalid_request', 'Class not found.', 404);
    }
    const mapping = await database.ltiCourseMapping.upsert({
      where: {
        registrationId_contextId: {
          registrationId: input.registrationId,
          contextId: input.contextId,
        },
      },
      create: {
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        contextId: input.contextId,
        classId: input.classId,
        enabled: true,
      },
      update: { classId: input.classId, enabled: true },
      select: { id: true, contextId: true },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: 'course_mapping_saved',
        outcome: 'accepted',
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        contextId: mapping.contextId,
        actorUserId: input.actorUserId,
      },
    });
    return mapping;
  });
}

export async function setLtiCourseMappingEnabled(input: {
  mappingId: string;
  organizationId: string;
  enabled: boolean;
  actorUserId: string;
}) {
  return prisma.$transaction(async (database) => {
    const mapping = await database.ltiCourseMapping.update({
      where: {
        id_organizationId: {
          id: input.mappingId,
          organizationId: input.organizationId,
        },
      },
      data: { enabled: input.enabled },
      select: { registrationId: true, contextId: true },
    });
    await database.ltiAuditEvent.create({
      data: {
        eventType: input.enabled
          ? 'course_mapping_enabled'
          : 'course_mapping_disabled',
        outcome: 'accepted',
        registrationId: mapping.registrationId,
        organizationId: input.organizationId,
        contextId: mapping.contextId,
        actorUserId: input.actorUserId,
      },
    });
    return mapping;
  });
}

export async function setOrganizationLtiGate(input: {
  organizationId: string;
  enabled: boolean;
  actorUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const registrationIds = await prisma.$transaction(async (database) => {
    await database.organization.update({
      where: { id: input.organizationId },
      data: { ltiEnabled: input.enabled },
    });
    const registrations = await database.ltiRegistration.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true },
    });
    if (!input.enabled) {
      await database.ltiLaunchTransaction.updateMany({
        where: { organizationId: input.organizationId, consumedAt: null },
        data: { consumedAt: now },
      });
      await database.ltiPendingLink.updateMany({
        where: { organizationId: input.organizationId, consumedAt: null },
        data: { consumedAt: now },
      });
    }
    await database.ltiAuditEvent.create({
      data: {
        eventType: input.enabled
          ? 'organization_gate_enabled'
          : 'organization_gate_disabled',
        outcome: 'accepted',
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      },
    });
    return registrations.map(({ id }) => id);
  });
  if (!input.enabled) {
    for (const registrationId of registrationIds) {
      signingKeyCache.clearRegistration(registrationId);
    }
  }
}
