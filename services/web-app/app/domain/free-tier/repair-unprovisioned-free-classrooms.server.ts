import { prisma } from '~/utils/db.server';
import { provisionFreeClassroomFromApproval } from './provision-free-classroom.server';

export type UnprovisionedReason =
  | 'pending_user'
  | 'no_organization'
  | 'no_membership'
  | 'no_class';

export type UnprovisionedFreeClassroom = {
  applicationId: string;
  email: string;
  name: string;
  schoolName: string;
  reason: UnprovisionedReason;
};

export function parseRepairArgs(argv: string[]) {
  const known = new Set(['--apply', '--dry-run']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length) {
    throw new Error(
      `Unknown argument ${unknown[0]}. Use --dry-run or --apply.`
    );
  }
  if (argv.includes('--apply') && argv.includes('--dry-run')) {
    throw new Error('Pass either --dry-run or --apply.');
  }
  return { apply: argv.includes('--apply') };
}

export async function listUnprovisionedApprovedApplications(options?: {
  applicationIds?: string[];
}): Promise<UnprovisionedFreeClassroom[]> {
  const apps = await prisma.freeTierApplication.findMany({
    where: {
      status: 'APPROVED',
      ...(options?.applicationIds ? { id: { in: options.applicationIds } } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      schoolName: true,
      userId: true,
      organizationId: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const rows: UnprovisionedFreeClassroom[] = [];
  for (const app of apps) {
    const base = {
      applicationId: app.id,
      email: app.email,
      name: app.name,
      schoolName: app.schoolName,
    };
    if (!app.userId) {
      rows.push({ ...base, reason: 'pending_user' });
      continue;
    }
    if (!app.organizationId) {
      rows.push({ ...base, reason: 'no_organization' });
      continue;
    }
    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId: app.userId,
        organizationId: app.organizationId,
        role: 'TEACHER',
      },
      select: {
        id: true,
        classesAsTeacher: {
          where: { isArchived: false },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!membership) {
      rows.push({ ...base, reason: 'no_membership' });
      continue;
    }
    if (membership.classesAsTeacher.length === 0) {
      rows.push({ ...base, reason: 'no_class' });
    }
  }
  return rows;
}

export async function repairUnprovisionedFreeClassrooms(options: {
  apply: boolean;
  applicationIds?: string[];
}) {
  const rows = await listUnprovisionedApprovedApplications({
    applicationIds: options.applicationIds,
  });
  if (!options.apply) {
    return { mode: 'dry-run' as const, rows, results: [] as const };
  }
  const results = [];
  for (const row of rows) {
    if (row.reason === 'pending_user') {
      results.push({ applicationId: row.applicationId, status: 'skipped' as const });
      continue;
    }
    const provisioned = await provisionFreeClassroomFromApproval(row.applicationId);
    results.push({
      applicationId: row.applicationId,
      status: provisioned.status,
      organizationId:
        'organizationId' in provisioned ? provisioned.organizationId : null,
    });
  }
  return { mode: 'apply' as const, rows, results };
}
