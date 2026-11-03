const LAST_ADMIN_EDIT_KEY = '_lastAdminEdit';

export type LastAdminEditSource = 'platform' | 'internal';

export type LastAdminEditMeta = {
  updatedAt: string;
  source: LastAdminEditSource;
  updatedBy?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readLastAdminEdit(
  gradingPromptConfigJson: unknown
): LastAdminEditMeta | null {
  if (!isRecord(gradingPromptConfigJson)) return null;
  const raw = gradingPromptConfigJson[LAST_ADMIN_EDIT_KEY];
  if (!isRecord(raw)) return null;
  const { updatedAt, source, updatedBy } = raw;
  if (typeof updatedAt !== 'string' || !updatedAt.trim()) return null;
  if (source !== 'platform' && source !== 'internal') return null;
  return {
    updatedAt,
    source,
    updatedBy: typeof updatedBy === 'string' ? updatedBy : null,
  };
}

export function withLastAdminEdit(
  gradingPromptConfigJson: unknown,
  edit: {
    source: LastAdminEditSource;
    updatedBy?: string | null;
    updatedAt?: string;
  }
): Record<string, unknown> {
  const base = isRecord(gradingPromptConfigJson)
    ? { ...gradingPromptConfigJson }
    : {};
  base[LAST_ADMIN_EDIT_KEY] = {
    updatedAt: edit.updatedAt ?? new Date().toISOString(),
    source: edit.source,
    updatedBy: edit.updatedBy ?? null,
  };
  return base;
}

const SOURCE_LABEL: Record<LastAdminEditSource, string> = {
  platform: 'Platform admin',
  internal: 'Yawp Internal',
};

export function formatLastAdminEditLine(
  rowUpdatedAt: Date | string | null | undefined,
  provenance: LastAdminEditMeta | null
): string {
  const updatedAt = provenance?.updatedAt ?? rowUpdatedAt;
  if (!updatedAt) return 'No save timestamp recorded yet.';

  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(updatedAt));

  if (!provenance) {
    return `Last saved ${when}. Last-write-wins applies if you also edit in Yawp Internal.`;
  }

  const who = provenance.updatedBy ? ` by ${provenance.updatedBy}` : '';
  return `Last saved ${when} via ${SOURCE_LABEL[provenance.source]}${who}. Last-write-wins applies across Platform and Internal.`;
}
