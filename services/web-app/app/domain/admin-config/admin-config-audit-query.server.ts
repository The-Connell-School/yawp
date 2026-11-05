import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  parseFeatureFlagValue,
  type FeatureFlagValue,
} from '~/domain/feature-flags/feature-flags';
import {
  describeFeatureFlagSetChange,
  entityDisplayLabel,
  formatAuditFlagValue,
} from './admin-access-flags.presentation';

export type AdminConfigAuditRow = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actorEmail: string;
  source: string;
  entityType: 'feature_flag' | 'access_list';
  entityKey: string;
  action: 'set' | 'add' | 'remove';
  before: unknown;
  after: unknown;
  reason: string | null;
};

export type AdminConfigAuditFilters = {
  entityKey?: string | null;
  actorEmail?: string | null;
  actionKind?: 'all' | 'mode' | 'schools' | 'access';
  from?: Date | null;
  to?: Date | null;
  limit?: number;
};

function parseFlagJson(value: unknown): FeatureFlagValue | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { mode?: unknown; orgIds?: unknown };
  if (typeof record.mode !== 'string') return null;
  return parseFeatureFlagValue(JSON.stringify(record));
}

export function classifyAuditEntry(row: AdminConfigAuditRow): {
  actionLabel: string;
  filterKind: 'mode' | 'schools' | 'access' | 'other';
} {
  if (row.entityType === 'access_list') {
    return {
      actionLabel: row.action === 'add' ? 'Access added' : 'Access removed',
      filterKind: 'access',
    };
  }
  const change = describeFeatureFlagSetChange(
    parseFlagJson(row.before),
    parseFlagJson(row.after)
  );
  return {
    actionLabel: change.actionLabel,
    filterKind: change.actionKind === 'schools' ? 'schools' : 'mode',
  };
}

export function formatAuditChangeSummary(row: AdminConfigAuditRow): {
  from: string;
  to: string;
} {
  if (row.entityType === 'access_list') {
    const beforeEmail =
      row.before &&
      typeof row.before === 'object' &&
      'email' in row.before &&
      typeof (row.before as { email: unknown }).email === 'string'
        ? (row.before as { email: string }).email
        : '—';
    const afterEmail =
      row.after &&
      typeof row.after === 'object' &&
      'email' in row.after &&
      typeof (row.after as { email: unknown }).email === 'string'
        ? (row.after as { email: string }).email
        : '—';
    return {
      from: row.action === 'add' ? '—' : beforeEmail,
      to: row.action === 'remove' ? '—' : afterEmail,
    };
  }
  return {
    from: formatAuditFlagValue(parseFlagJson(row.before)),
    to: formatAuditFlagValue(parseFlagJson(row.after)),
  };
}

export function auditItemLabel(row: AdminConfigAuditRow): string {
  return entityDisplayLabel(row.entityType, row.entityKey);
}

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

export function isRestorableFeatureFlagAudit(row: AdminConfigAuditRow): boolean {
  return row.entityType === 'feature_flag' && row.action === 'set' && row.before != null;
}
