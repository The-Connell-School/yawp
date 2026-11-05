import type { FeatureFlagKey, FeatureFlagMode, FeatureFlagValue } from '~/domain/feature-flags/feature-flags';
import {
  FEATURE_FLAGS,
  sameFeatureFlagValue,
} from '~/domain/feature-flags/feature-flags';
import {
  isDemoDeployment,
  isPreviewDeployment,
} from '~/domain/feature-flags/feature-flags.deployment';
import { TEACHER_LOUNGE_ACCESS_LIST_KEY } from '~/domain/access-lists/access-lists';

export type AdminFlagModeBadge = 'off' | 'everyone' | 'targeted';

export function formatFlagModeLabel(value: FeatureFlagValue): string {
  if (value.mode === 'off') return 'Off';
  if (value.mode === 'everyone') return 'Everyone';
  const count = value.orgIds.length;
  return count === 1 ? '1 school' : `${count} schools`;
}

export function flagModeBadgeVariant(value: FeatureFlagValue): AdminFlagModeBadge {
  return value.mode;
}

export function formatAuditFlagValue(value: FeatureFlagValue | null | undefined): string {
  if (!value) return '—';
  if (value.mode === 'off') return 'Off';
  if (value.mode === 'everyone') return 'Everyone';
  if (value.orgIds.length === 0) return 'Targeted';
  return `${value.orgIds.length} schools`;
}

export function describeFeatureFlagSetChange(
  before: FeatureFlagValue | null | undefined,
  after: FeatureFlagValue | null | undefined
): { actionLabel: string; actionKind: 'mode' | 'schools' | 'other' } {
  const prev = before ?? { mode: 'off' as FeatureFlagMode, orgIds: [] };
  const next = after ?? { mode: 'off' as FeatureFlagMode, orgIds: [] };
  if (prev.mode !== next.mode) {
    return { actionLabel: 'Mode changed', actionKind: 'mode' };
  }
  if (
    prev.mode === 'targeted' &&
    next.mode === 'targeted' &&
    !sameFeatureFlagValue(prev, next)
  ) {
    return { actionLabel: 'Schools updated', actionKind: 'schools' };
  }
  return { actionLabel: 'Mode changed', actionKind: 'other' };
}

export function entityDisplayLabel(
  entityType: 'feature_flag' | 'access_list',
  entityKey: string
): string {
  if (entityType === 'access_list' && entityKey === TEACHER_LOUNGE_ACCESS_LIST_KEY) {
    return "Teacher's Lounge";
  }
  if (entityType === 'feature_flag') {
    const key = entityKey as FeatureFlagKey;
    if (Object.hasOwn(FEATURE_FLAGS, key)) return FEATURE_FLAGS[key].label;
  }
  return entityKey;
}

export type RuntimeOverrideCopy = {
  tag: string;
  text: string;
} | null;

type FlagRuntimeOverrideInput = {
  key: FeatureFlagKey;
  persisted: FeatureFlagValue;
  effective: FeatureFlagValue;
  runtimeOverride: 'non_production_default' | null;
};

export function runtimeOverrideCopy(
  flag: FlagRuntimeOverrideInput,
  env: Record<string, string | undefined> = process.env
): RuntimeOverrideCopy {
  if (flag.runtimeOverride === 'non_production_default') {
    const stored = formatFlagModeLabel(flag.persisted);
    const stage = isDemoDeployment(env) ? 'demo' : isPreviewDeployment(env) ? 'preview' : 'non-production';
    return {
      tag: `${stage.charAt(0).toUpperCase()}${stage.slice(1)} override: everyone`,
      text: `The ${stage} runtime forces this on. The stored value, ${stored}, is what schools get.`,
    };
  }
  if (
    flag.persisted.mode !== flag.effective.mode ||
    (flag.persisted.mode === 'targeted' &&
      flag.effective.mode === 'targeted' &&
      !sameFeatureFlagValue(flag.persisted, flag.effective))
  ) {
    const stored = formatFlagModeLabel(flag.persisted);
    const stage = isPreviewDeployment(env)
      ? 'preview'
      : isDemoDeployment(env)
        ? 'demo'
        : 'runtime';
    const effective = formatFlagModeLabel(flag.effective);
    return {
      tag: `${stage.charAt(0).toUpperCase()}${stage.slice(1)} override: ${effective.toLowerCase()}`,
      text: `The ${stage} runtime forces this ${effective.toLowerCase()}. The stored value${stored === 'Off' ? ', Off,' : ` targets ${stored.toLowerCase()}`} is what schools get.`,
    };
  }
  return null;
}

export function formatAdminTimestamp(iso: string | null): {
  primary: string;
  secondary: string | null;
} {
  if (!iso) return { primary: '—', secondary: null };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { primary: '—', secondary: null };
  const primary = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  const secondary = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return { primary, secondary: `${primary} · ${secondary}` };
}

export function shouldConfirmEveryoneFromTargeted(
  previous: FeatureFlagValue,
  next: FeatureFlagValue
): boolean {
  return previous.mode === 'targeted' && previous.orgIds.length > 0 && next.mode === 'everyone';
}

export function parseOrgIdsField(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];
}
