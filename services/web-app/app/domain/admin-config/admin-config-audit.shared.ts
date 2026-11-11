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

export function isRestorableFeatureFlagAudit(row: AdminConfigAuditRow): boolean {
  return row.entityType === 'feature_flag' && row.action === 'set' && row.before != null;
}
