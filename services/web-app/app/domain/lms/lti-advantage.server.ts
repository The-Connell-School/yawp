import { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  createLtiClientAssertion,
  requestLtiAccessToken,
} from './lti-contract.server';
import { LtiHttpError } from './lti-http.server';
import { deriveLtiIdentityHashCandidates } from './lti-identity-keyset.server';
import { mapLtiRolesToMembershipRole } from './lti-launch-pilot.server';
import { toLtiContractRegistration } from './lti-pilot.server';
import {
  createAgsLineItem,
  fetchAllAgsLineItems,
  fetchAllNrpsMemberships,
  LTI_SCOPES,
  submitAgsScore,
} from './lti-services.server';
import { getActiveLtiToolSigningKey } from './lti-tool-keyset.server';

const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 30_000;

function redactedErrorCode(error: unknown) {
  if (error instanceof LtiHttpError) {
    if (error.status === 401 || error.status === 403) return 'token_revoked';
    if (error.status === 429) return 'provider_rate_limited';
    if (error.status === null || error.status >= 500)
      return 'provider_unavailable';
    return 'provider_rejected';
  }
  return 'invalid_provider_response';
}

function retryAt(attempt: number, now: Date) {
  return new Date(
    now.getTime() +
      Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), 30 * 60_000)
  );
}

async function serviceGrant(input: {
  registration: Parameters<typeof toLtiContractRegistration>[0];
  scopes: string[];
  advertisedScopes: string[];
  now?: Date;
}) {
  const registration = toLtiContractRegistration(input.registration);
  const key = getActiveLtiToolSigningKey();
  const nowSeconds = input.now
    ? Math.floor(input.now.getTime() / 1000)
    : undefined;
  const assertion = createLtiClientAssertion({
    clientId: registration.clientId,
    tokenEndpoint: registration.tokenEndpoint,
    deploymentId: registration.deploymentId,
    privateKeyPem: key.privateKeyPem,
    keyId: key.keyId,
    nowSeconds,
  });
  return {
    registration,
    grant: await requestLtiAccessToken({
      registration,
      clientAssertion: assertion,
      scopes: input.scopes,
      advertisedScopes: input.advertisedScopes,
    }),
  };
}

type RosterSummary = {
  added: number;
  updated: number;
  dropped: number;
  unchanged: number;
  unmatched: number;
  conflicts: number;
  duplicates: number;
};

export async function syncLtiRoster(input: {
  courseMappingId: string;
  idempotencyKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const mapping = await prisma.ltiCourseMapping.findUnique({
    where: { id: input.courseMappingId },
    include: { registration: true },
  });
  if (!mapping?.enabled || !mapping.nrpsMembershipsUrl) {
    throw new Error('The mapped course has no signed NRPS service binding.');
  }
  const existingRun = await prisma.ltiWorkflowRun.findUnique({
    where: {
      registrationId_idempotencyKey: {
        registrationId: mapping.registrationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existingRun?.status === 'succeeded') {
    return existingRun.summary as RosterSummary;
  }
  const run = await prisma.ltiWorkflowRun.upsert({
    where: {
      registrationId_idempotencyKey: {
        registrationId: mapping.registrationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    create: {
      kind: 'roster_sync',
      status: 'running',
      idempotencyKey: input.idempotencyKey,
      attemptCount: 1,
      registrationId: mapping.registrationId,
      organizationId: mapping.organizationId,
      courseMappingId: mapping.id,
    },
    update: {
      status: 'running',
      attemptCount: { increment: 1 },
      nextAttemptAt: null,
      errorCode: null,
    },
  });

  try {
    const { registration, grant } = await serviceGrant({
      registration: mapping.registration,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
      now,
    });
    const roster = await fetchAllNrpsMemberships({
      membershipsUrl: mapping.nrpsMembershipsUrl,
      grant,
      registration,
      expectedContextId: mapping.contextId,
    });
    const seenHashes = new Map<string, number>();
    const normalized = roster.members.map((member) => {
      const candidates = deriveLtiIdentityHashCandidates({
        registrationId: mapping.registrationId,
        subject: member.userId,
      });
      const active = candidates[0]!;
      seenHashes.set(
        active.subjectHash,
        (seenHashes.get(active.subjectHash) ?? 0) + 1
      );
      let role: 'TEACHER' | 'STUDENT' | null = null;
      try {
        role = mapLtiRolesToMembershipRole(member.roles);
      } catch {
        // Mixed/unsupported roles become explicit conflicts below.
      }
      return { member, candidates, active, role };
    });

    const summary = await prisma.$transaction(async (database) => {
      await database.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lti-roster:${mapping.id}`}, 0))`
      );
      const counts: RosterSummary = {
        added: 0,
        updated: 0,
        dropped: 0,
        unchanged: 0,
        unmatched: 0,
        conflicts: 0,
        duplicates: 0,
      };
      for (const item of normalized) {
        const duplicate = (seenHashes.get(item.active.subjectHash) ?? 0) > 1;
        const current = await database.ltiRosterEnrollment.findUnique({
          where: {
            courseMappingId_subjectHash: {
              courseMappingId: mapping.id,
              subjectHash: item.active.subjectHash,
            },
          },
        });
        const identity = await database.ltiExternalIdentity.findFirst({
          where: {
            registrationId: mapping.registrationId,
            subjectHash: {
              in: item.candidates.map((candidate) => candidate.subjectHash),
            },
          },
          include: {
            membership: {
              include: {
                classesAsTeacher: {
                  where: { id: mapping.classId },
                  select: { id: true },
                },
                classesAsStudent: {
                  where: { id: mapping.classId },
                  select: { id: true },
                },
              },
            },
          },
        });
        const active = item.member.status === 'Active';
        const conflict =
          duplicate ||
          !item.role ||
          (!!identity && identity.membership.role !== item.role);

        if (duplicate) counts.duplicates += 1;
        if (conflict) {
          counts.conflicts += 1;
          await database.ltiRosterEnrollment.upsert({
            where: {
              courseMappingId_subjectHash: {
                courseMappingId: mapping.id,
                subjectHash: item.active.subjectHash,
              },
            },
            create: {
              subjectHash: item.active.subjectHash,
              subjectHashKeyId: item.active.keyId,
              role: item.role ?? 'STUDENT',
              lmsStatus: item.member.status,
              reconciliationState: 'conflict',
              managedByLti: false,
              lastSeenAt: now,
              registrationId: mapping.registrationId,
              organizationId: mapping.organizationId,
              courseMappingId: mapping.id,
            },
            update: {
              subjectHashKeyId: item.active.keyId,
              lmsStatus: item.member.status,
              reconciliationState: 'conflict',
              managedByLti: false,
              externalIdentityId: null,
              membershipId: null,
              lastSeenAt: now,
            },
          });
          continue;
        }
        if (!identity) {
          counts.unmatched += 1;
          await database.ltiRosterEnrollment.upsert({
            where: {
              courseMappingId_subjectHash: {
                courseMappingId: mapping.id,
                subjectHash: item.active.subjectHash,
              },
            },
            create: {
              subjectHash: item.active.subjectHash,
              subjectHashKeyId: item.active.keyId,
              role: item.role!,
              lmsStatus: item.member.status,
              reconciliationState: active ? 'unmatched' : 'dropped',
              lastSeenAt: now,
              registrationId: mapping.registrationId,
              organizationId: mapping.organizationId,
              courseMappingId: mapping.id,
            },
            update: {
              subjectHashKeyId: item.active.keyId,
              role: item.role!,
              lmsStatus: item.member.status,
              reconciliationState: active ? 'unmatched' : 'dropped',
              managedByLti: false,
              externalIdentityId: null,
              membershipId: null,
              lastSeenAt: now,
            },
          });
          continue;
        }

        const wasInClass =
          item.role === 'TEACHER'
            ? identity.membership.classesAsTeacher.length > 0
            : identity.membership.classesAsStudent.length > 0;
        if (active && !wasInClass) {
          await database.class.update({
            where: { id: mapping.classId },
            data:
              item.role === 'TEACHER'
                ? { teachers: { connect: { id: identity.membershipId } } }
                : { students: { connect: { id: identity.membershipId } } },
          });
          counts.added += 1;
        } else if (!active && wasInClass && current?.managedByLti === true) {
          await database.class.update({
            where: { id: mapping.classId },
            data:
              item.role === 'TEACHER'
                ? { teachers: { disconnect: { id: identity.membershipId } } }
                : { students: { disconnect: { id: identity.membershipId } } },
          });
          counts.dropped += 1;
        } else if (
          current &&
          (current.lmsStatus !== item.member.status ||
            current.reconciliationState !== (active ? 'linked' : 'dropped'))
        ) {
          counts.updated += 1;
        } else {
          counts.unchanged += 1;
        }
        await database.ltiRosterEnrollment.upsert({
          where: {
            courseMappingId_subjectHash: {
              courseMappingId: mapping.id,
              subjectHash: item.active.subjectHash,
            },
          },
          create: {
            subjectHash: item.active.subjectHash,
            subjectHashKeyId: item.active.keyId,
            role: item.role!,
            lmsStatus: item.member.status,
            reconciliationState: active ? 'linked' : 'dropped',
            managedByLti: active && !wasInClass,
            lastSeenAt: now,
            registrationId: mapping.registrationId,
            organizationId: mapping.organizationId,
            courseMappingId: mapping.id,
            externalIdentityId: identity.id,
            membershipId: identity.membershipId,
          },
          update: {
            subjectHashKeyId: item.active.keyId,
            role: item.role!,
            lmsStatus: item.member.status,
            reconciliationState: active ? 'linked' : 'dropped',
            managedByLti: active
              ? current?.managedByLti === true || !wasInClass
              : false,
            externalIdentityId: identity.id,
            membershipId: identity.membershipId,
            lastSeenAt: now,
          },
        });
      }
      await database.ltiWorkflowRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          summary: counts,
          completedAt: now,
          nextAttemptAt: null,
          errorCode: null,
        },
      });
      await database.ltiAuditEvent.create({
        data: {
          eventType: 'roster_sync',
          outcome: 'succeeded',
          registrationId: mapping.registrationId,
          organizationId: mapping.organizationId,
          contextId: mapping.contextId,
          details: counts,
        },
      });
      return counts;
    });
    return summary;
  } catch (error) {
    const attempts = run.attemptCount;
    const dead = attempts >= MAX_ATTEMPTS;
    const code = redactedErrorCode(error);
    await prisma.$transaction([
      prisma.ltiWorkflowRun.update({
        where: { id: run.id },
        data: {
          status: dead ? 'dead_letter' : 'retry',
          errorCode: code,
          nextAttemptAt: dead ? null : retryAt(attempts, now),
          deadLetteredAt: dead ? now : null,
        },
      }),
      prisma.ltiAuditEvent.create({
        data: {
          eventType: 'roster_sync',
          outcome: dead ? 'dead_letter' : 'retry',
          registrationId: mapping.registrationId,
          organizationId: mapping.organizationId,
          contextId: mapping.contextId,
          details: { errorCode: code, attempt: attempts },
        },
      }),
    ]);
    throw error;
  }
}

export async function ensureLtiLineItem(input: {
  placementId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const placement = await prisma.ltiPlacement.findUnique({
    where: { id: input.placementId },
    include: {
      registration: true,
      courseMapping: true,
      classAssignment: { include: { assignment: true } },
    },
  });
  if (!placement?.enabled || !placement.courseMapping.agsLineItemsUrl) {
    throw new Error('The placement has no signed AGS line-item binding.');
  }
  if (placement.lineItemUrl) return placement.lineItemUrl;
  const advertised = placement.courseMapping.agsScopes;
  const { registration, grant } = await serviceGrant({
    registration: placement.registration,
    scopes: [LTI_SCOPES.lineItem],
    advertisedScopes: advertised,
    now,
  });
  const existing = await fetchAllAgsLineItems({
    lineItemsUrl: placement.courseMapping.agsLineItemsUrl,
    grant,
    registration,
    filters: { resourceId: placement.resourceId, limit: 100 },
  });
  if (existing.length > 1) {
    throw new Error(
      'AGS returned duplicate line items for one Yawp placement.'
    );
  }
  const lineItem =
    existing[0] ??
    (await createAgsLineItem({
      lineItemsUrl: placement.courseMapping.agsLineItemsUrl,
      grant,
      registration,
      lineItem: {
        scoreMaximum: placement.scoreMaximum,
        label: placement.classAssignment.assignment.title || 'Yawp assignment',
        resourceId: placement.resourceId,
        ...(placement.resourceLinkId
          ? { resourceLinkId: placement.resourceLinkId }
          : {}),
        tag: 'yawp-assignment',
      },
    }));
  const updated = await prisma.ltiPlacement.updateMany({
    where: { id: placement.id, lineItemUrl: null },
    data: { lineItemUrl: lineItem.id },
  });
  if (updated.count === 0) {
    return (
      await prisma.ltiPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      })
    ).lineItemUrl!;
  }
  return lineItem.id;
}

export async function enqueueReleasedLtiGrades(input: {
  submissionIds: string[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const submissions = await prisma.submission.findMany({
    where: {
      id: { in: Array.from(new Set(input.submissionIds)) },
      releasedAt: { not: null },
      numericPercentage: { not: null },
      document: { classAssignmentId: { not: null } },
    },
    include: {
      document: {
        include: {
          membership: { include: { ltiExternalIdentities: true } },
          classAssignment: { include: { ltiPlacements: true } },
        },
      },
    },
  });
  let enqueued = 0;
  let existing = 0;
  for (const submission of submissions) {
    for (const placement of submission.document.classAssignment
      ?.ltiPlacements ?? []) {
      if (!placement.enabled) continue;
      const identity =
        submission.document.membership.ltiExternalIdentities.find(
          (candidate) => candidate.registrationId === placement.registrationId
        );
      if (!identity) continue;
      const scoreGiven =
        Math.round(
          (submission.numericPercentage! / 100) * placement.scoreMaximum * 100
        ) / 100;
      const result = await prisma.ltiGradePassback.createMany({
        data: {
          releasedAt: submission.releasedAt!,
          scoreTimestamp: submission.releasedAt!,
          scoreGiven,
          scoreMaximum: placement.scoreMaximum,
          registrationId: placement.registrationId,
          organizationId: placement.organizationId,
          courseMappingId: placement.courseMappingId,
          placementId: placement.id,
          submissionId: submission.id,
          externalIdentityId: identity.id,
          nextAttemptAt: now,
        },
        skipDuplicates: true,
      });
      if (result.count === 1) enqueued += 1;
      else existing += 1;
    }
  }
  return { enqueued, existing };
}

export async function deliverLtiGradePassback(input: {
  gradePassbackId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const claimed = await prisma.ltiGradePassback.updateMany({
    where: {
      id: input.gradePassbackId,
      status: { in: ['pending', 'retry'] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    data: { status: 'delivering', attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    return prisma.ltiGradePassback.findUnique({
      where: { id: input.gradePassbackId },
    });
  }
  const event = await prisma.ltiGradePassback.findUniqueOrThrow({
    where: { id: input.gradePassbackId },
    include: {
      registration: true,
      courseMapping: true,
      placement: true,
      externalIdentity: true,
      submission: true,
    },
  });
  try {
    const lineItemUrl = await ensureLtiLineItem({
      placementId: event.placementId,
      now,
    });
    if (!event.courseMapping.nrpsMembershipsUrl) {
      throw new Error('Grade delivery requires a signed NRPS binding.');
    }
    const rosterGrant = await serviceGrant({
      registration: event.registration,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
      now,
    });
    const roster = await fetchAllNrpsMemberships({
      membershipsUrl: event.courseMapping.nrpsMembershipsUrl,
      grant: rosterGrant.grant,
      registration: rosterGrant.registration,
      expectedContextId: event.courseMapping.contextId,
    });
    const providerUsers = roster.members.filter((member) =>
      deriveLtiIdentityHashCandidates({
        registrationId: event.registrationId,
        subject: member.userId,
      }).some(
        (candidate) =>
          candidate.subjectHash === event.externalIdentity.subjectHash
      )
    );
    if (providerUsers.length !== 1) {
      throw new Error(
        'The released student identity is missing or ambiguous in NRPS.'
      );
    }
    const scoreGrant = await serviceGrant({
      registration: event.registration,
      scopes: [LTI_SCOPES.score],
      advertisedScopes: event.courseMapping.agsScopes,
      now,
    });
    await submitAgsScore({
      lineItemsUrl: event.courseMapping.agsLineItemsUrl!,
      lineItemUrl,
      grant: scoreGrant.grant,
      registration: scoreGrant.registration,
      score: {
        userId: providerUsers[0]!.userId,
        scoreGiven: event.scoreGiven,
        scoreMaximum: event.scoreMaximum,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: event.scoreTimestamp.toISOString(),
        submission: { submittedAt: event.submission.submittedAt.toISOString() },
      },
    });
    return prisma.$transaction(async (database) => {
      const delivered = await database.ltiGradePassback.update({
        where: { id: event.id },
        data: {
          status: 'delivered',
          deliveredAt: now,
          nextAttemptAt: null,
          lastErrorCode: null,
        },
      });
      await database.ltiAuditEvent.create({
        data: {
          eventType: 'grade_passback',
          outcome: 'delivered',
          registrationId: event.registrationId,
          organizationId: event.organizationId,
          contextId: event.courseMapping.contextId,
          details: { gradePassbackId: event.id },
        },
      });
      return delivered;
    });
  } catch (error) {
    const dead = event.attemptCount >= MAX_ATTEMPTS;
    const code = redactedErrorCode(error);
    await prisma.$transaction([
      prisma.ltiGradePassback.update({
        where: { id: event.id },
        data: {
          status: dead ? 'dead_letter' : 'retry',
          nextAttemptAt: dead ? null : retryAt(event.attemptCount, now),
          deadLetteredAt: dead ? now : null,
          lastErrorCode: code,
        },
      }),
      prisma.ltiAuditEvent.create({
        data: {
          eventType: 'grade_passback',
          outcome: dead ? 'dead_letter' : 'retry',
          registrationId: event.registrationId,
          organizationId: event.organizationId,
          contextId: event.courseMapping.contextId,
          details: {
            gradePassbackId: event.id,
            errorCode: code,
            attempt: event.attemptCount,
          },
        },
      }),
    ]);
    throw error;
  }
}

export async function deliverDueLtiGrades(
  input: {
    submissionIds?: string[];
    now?: Date;
    limit?: number;
  } = {}
) {
  const now = input.now ?? new Date();
  const events = await prisma.ltiGradePassback.findMany({
    where: {
      status: { in: ['pending', 'retry'] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      ...(input.submissionIds
        ? { submissionId: { in: input.submissionIds } }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(input.limit ?? 25, 100),
    select: { id: true },
  });
  return Promise.allSettled(
    events.map((event) =>
      deliverLtiGradePassback({ gradePassbackId: event.id, now })
    )
  );
}

export async function retryLtiWorkflow(input: {
  organizationId: string;
  runId?: string;
  gradePassbackId?: string;
  now?: Date;
}) {
  if ((input.runId ? 1 : 0) + (input.gradePassbackId ? 1 : 0) !== 1) {
    throw new Error('Select exactly one LTI recovery target.');
  }
  if (input.gradePassbackId) {
    await prisma.ltiGradePassback.updateMany({
      where: {
        id: input.gradePassbackId,
        organizationId: input.organizationId,
      },
      data: {
        status: 'retry',
        attemptCount: 0,
        nextAttemptAt: input.now ?? new Date(),
        deadLetteredAt: null,
        lastErrorCode: null,
      },
    });
  } else {
    await prisma.ltiWorkflowRun.updateMany({
      where: { id: input.runId, organizationId: input.organizationId },
      data: {
        status: 'retry',
        attemptCount: 0,
        nextAttemptAt: input.now ?? new Date(),
        deadLetteredAt: null,
        errorCode: null,
      },
    });
  }
}
