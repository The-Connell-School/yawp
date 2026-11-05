import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  classifyAuditEntry,
  type AdminConfigAuditRow,
} from './admin-config-audit.shared';

export type { AdminConfigAuditRow } from './admin-config-audit.shared';
export {
  auditItemLabel,
  classifyAuditEntry,
  formatAuditChangeSummary,
  isRestorableFeatureFlagAudit,
} from './admin-config-audit.shared';

export type AdminConfigAuditFilters = {
  entityKey?: string | null;
  actorEmail?: string | null;
  actionKind?: 'all' | 'mode' | 'schools' | 'access';
  from?: Date | null;
  to?: Date | null;
  limit?: number;
};

export async function listAdminConfigAudit(
  filters: AdminConfigAuditFilters = {},
  client: Pick<typeof prisma, 'adminConfigAudit'> = prisma
) {
  const where: Prisma.AdminConfigAuditWhereInput = {};
  if (filters.entityKey) {
    where.entityKey = filters.entityKey;
  }
  if (filters.actorEmail) {
    where.actorEmail = filters.actorEmail;
  }
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }
  const rows = await client.adminConfigAudit.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 200,
  });
  const typed = rows as AdminConfigAuditRow[];
  if (!filters.actionKind || filters.actionKind === 'all') return typed;
  return typed.filter((row) => {
    const { filterKind } = classifyAuditEntry(row);
    if (filters.actionKind === 'access') return filterKind === 'access';
    if (filters.actionKind === 'schools') return filterKind === 'schools';
    if (filters.actionKind === 'mode') return filterKind === 'mode';
    return true;
  });
}

export async function listAdminConfigAuditActors(
  client: Pick<typeof prisma, 'adminConfigAudit'> = prisma
) {
  const rows = await client.adminConfigAudit.findMany({
    distinct: ['actorEmail'],
    select: { actorEmail: true },
    orderBy: { actorEmail: 'asc' },
  });
  return rows.map((row) => row.actorEmail);
}
