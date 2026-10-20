import { afterAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { provisionFreeClassroom } from './provision-free-classroom.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { loadSiteLicenseLockedAssignmentTiles } from './site-license-locked-assignment-tiles.server';
import { SITE_LICENSE_LOCKED_TILE_LABELS } from './site-license-locked-assignment-tiles';
import { seedFreeTierBundleAssignmentTypes } from '../../../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types';
import {
  importProdFidelityFixtures,
  loadProdFidelityBundle,
} from '../../../../../packages/prisma/scripts/local-dev/import-prod-fidelity-fixtures';
import { LOCAL_DEV_ORG_ID } from '../../../../../packages/prisma/scripts/local-dev/dev-personas';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { FREE_CLASSROOM_ASSIGNMENT_KINDS } from '~/utils/entitlements.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';

const applicationIds: string[] = [];
const userIds: string[] = [];
const orgIds: string[] = [];

async function ensureLockedTileCatalogFixtureData() {
  await seedFreeTierBundleAssignmentTypes(prisma);
  await prisma.organization.upsert({
    where: { id: LOCAL_DEV_ORG_ID },
    create: {
      id: LOCAL_DEV_ORG_ID,
      name: 'Local Dev Organization',
      plan: 'SCHOOL',
    },
    update: {},
  });
  const thesis = await prisma.assignmentType.findFirst({
    where: {
      archivedAt: null,
      title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (!thesis) {
    await importProdFidelityFixtures(prisma, await loadProdFidelityBundle());
  }
  await prisma.assignmentType.upsert({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    create: {
      title: 'AP History Essay',
      description: 'AP History Essay (join-flow integration fixture)',
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      ownerOrgId: LOCAL_DEV_ORG_ID,
      position: 50,
    },
    update: { archivedAt: null },
  });
}

afterAll(async () => {
  if (!enabled) return;
  await prisma.freeTierApplication.deleteMany({
    where: { id: { in: applicationIds } },
  });
  await prisma.class.deleteMany({
    where: { school: { organizationId: { in: orgIds } } },
  });
  await prisma.orgMembership.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organizationAssignmentType.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

test.skipIf(!enabled)(
  'approved /free/join org sees locked tiles even though scope only includes the free bundle',
  async () => {
    await ensureLockedTileCatalogFixtureData();

    const user = await prisma.user.create({
      data: {
        email: `join-locked-${crypto.randomUUID()}@gmail.com`,
        name: 'Join flow teacher',
      },
    });
    userIds.push(user.id);

    const application = await prisma.freeTierApplication.create({
      data: {
        userId: user.id,
        email: user.email!,
        name: user.name!,
        schoolName: 'Demo High',
        gradeLevel: '10',
        location: 'Demo',
        status: 'ACCOUNT_CREATED',
      },
    });
    applicationIds.push(application.id);

    const provisioned = await provisionFreeClassroom(application.id);
    expect(provisioned.status).toBe('provisioned');
    if (provisioned.status !== 'provisioned') return;

    orgIds.push(provisioned.organizationId);

    const membership = await prisma.orgMembership.findFirstOrThrow({
      where: { userId: user.id, organizationId: provisioned.organizationId },
      select: {
        id: true,
        organization: { select: { plan: true } },
      },
    });

    const school = await prisma.school.findFirstOrThrow({
      where: { organizationId: provisioned.organizationId },
      select: { id: true, organizationId: true },
    });

    const scopedTypes = await getAvailableAssignmentTypesForScopes<{
      id: string;
      title: string;
      kind: string | null;
      systemKey: string | null;
    }>({
      scopes: [
        {
          organizationId: school.organizationId,
          schoolId: school.id,
          teacherProfileId: membership.id,
        },
      ],
      select: { id: true, title: true, kind: true, systemKey: true },
    });

    expect(scopedTypes.length).toBe(FREE_CLASSROOM_ASSIGNMENT_KINDS.length);
    expect(scopedTypes.map((type) => type.kind).sort()).toEqual(
      [...FREE_CLASSROOM_ASSIGNMENT_KINDS].sort()
    );

    const lockedTiles = await loadSiteLicenseLockedAssignmentTiles(
      membership.organization
    );

    expect(lockedTiles.map((tile) => tile.key)).toEqual([
      'thesis_driven_essay',
      'ap_history_essay',
      'daily_pages',
      'act_writing',
    ]);
    expect(lockedTiles.map((tile) => tile.label)).toEqual([
      SITE_LICENSE_LOCKED_TILE_LABELS.thesis_driven_essay,
      SITE_LICENSE_LOCKED_TILE_LABELS.ap_history_essay,
      SITE_LICENSE_LOCKED_TILE_LABELS.daily_pages,
      SITE_LICENSE_LOCKED_TILE_LABELS.act_writing,
    ]);
  }
);
