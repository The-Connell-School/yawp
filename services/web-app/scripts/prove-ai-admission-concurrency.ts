import assert from 'node:assert/strict';

import {
  AiRateLimitError,
  reserveAiRequest,
} from '../app/utils/ai-admission.server';
import { prisma } from '../app/utils/db.server';

type BurstResult = {
  admitted: number;
  rejected: number;
  unexpected: string[];
};

async function runSynchronizedBurst({
  contenders,
  membershipIds,
  organizationId,
  feature,
  membershipLimit,
  organizationLimit,
}: {
  contenders: number;
  membershipIds: string[];
  organizationId: string;
  feature: string;
  membershipLimit: number;
  organizationLimit: number;
}): Promise<BurstResult> {
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });

  const attempts = Array.from({ length: contenders }, async (_, index) => {
    await barrier;
    await reserveAiRequest({
      membershipId: membershipIds[index % membershipIds.length],
      organizationId,
      feature,
      policy: {
        membershipLimit,
        membershipWindowMs: 60_000,
        organizationLimit,
        organizationWindowMs: 60_000,
      },
    });
  });
  release?.();

  const settled = await Promise.allSettled(attempts);
  const unexpected: string[] = [];
  let admitted = 0;
  let rejected = 0;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      admitted += 1;
    } else if (result.reason instanceof AiRateLimitError) {
      rejected += 1;
    } else {
      unexpected.push(String(result.reason));
    }
  }
  return { admitted, rejected, unexpected };
}

async function main() {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      memberships: {
        where: { isActive: true },
        select: { id: true },
        take: 2,
      },
    },
    take: 50,
  });
  const organization = organizations.find(
    (candidate) => candidate.memberships.length >= 2
  );
  assert(
    organization,
    'proof requires an organization with two active members'
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const membershipFeature = `proof-membership-${suffix}`;
  const organizationFeature = `proof-organization-${suffix}`;
  const providerFailureFeature = `proof-provider-failure-${suffix}`;
  const proofFeatures = [
    membershipFeature,
    organizationFeature,
    providerFailureFeature,
  ];

  try {
    const membershipBurst = await runSynchronizedBurst({
      contenders: 12,
      membershipIds: [organization.memberships[0].id],
      organizationId: organization.id,
      feature: membershipFeature,
      membershipLimit: 5,
      organizationLimit: 100,
    });
    assert.deepEqual(membershipBurst, {
      admitted: 5,
      rejected: 7,
      unexpected: [],
    });
    const membershipRows = await prisma.aiRequestReservation.count({
      where: { feature: membershipFeature },
    });
    assert.equal(membershipRows, 5);

    const organizationBurst = await runSynchronizedBurst({
      contenders: 12,
      membershipIds: organization.memberships.map((member) => member.id),
      organizationId: organization.id,
      feature: organizationFeature,
      membershipLimit: 100,
      organizationLimit: 7,
    });
    assert.deepEqual(organizationBurst, {
      admitted: 7,
      rejected: 5,
      unexpected: [],
    });
    const organizationRows = await prisma.aiRequestReservation.count({
      where: { feature: organizationFeature },
    });
    assert.equal(organizationRows, 7);

    const simulatedProviderFailures = [
      new Error('simulated provider failure'),
      new Error('simulated provider cancellation'),
      new Error('simulated provider timeout'),
    ];
    for (const providerError of simulatedProviderFailures) {
      try {
        await reserveAiRequest({
          membershipId: organization.memberships[0].id,
          organizationId: organization.id,
          feature: providerFailureFeature,
          policy: {
            membershipLimit: 10,
            membershipWindowMs: 60_000,
            organizationLimit: 10,
            organizationWindowMs: 60_000,
          },
        });
        throw providerError;
      } catch (error) {
        assert.equal(error, providerError);
      }
    }
    const retainedAfterProviderFailure =
      await prisma.aiRequestReservation.count({
        where: { feature: providerFailureFeature },
      });
    assert.equal(retainedAfterProviderFailure, 3);

    process.stdout.write(
      `${JSON.stringify(
        {
          organizationId: organization.id,
          membershipBurst: {
            ...membershipBurst,
            durableRows: membershipRows,
          },
          organizationBurst: {
            ...organizationBurst,
            durableRows: organizationRows,
          },
          providerFailure: {
            simulatedFailures: simulatedProviderFailures.length,
            retainedReservations: retainedAfterProviderFailure,
          },
        },
        null,
        2
      )}\n`
    );
  } finally {
    await prisma.aiRequestReservation.deleteMany({
      where: { feature: { in: proofFeatures } },
    });
    await prisma.$disconnect();
  }
}

await main();
