import { describe, expect, test } from 'bun:test';
import {
  describeFeatureFlagSetChange,
  formatFlagModeLabel,
  shouldConfirmEveryoneFromTargeted,
  runtimeOverrideCopy,
} from './admin-access-flags.presentation';
import { TEACHER_LOUNGE_FLAG } from '~/domain/feature-flags/feature-flags';

describe('formatFlagModeLabel', () => {
  test('formats targeted school counts', () => {
    expect(formatFlagModeLabel({ mode: 'targeted', orgIds: ['a', 'b'] })).toBe(
      '2 schools'
    );
    expect(formatFlagModeLabel({ mode: 'everyone', orgIds: [] })).toBe('Everyone');
  });
});

describe('describeFeatureFlagSetChange', () => {
  test('detects schools updated vs mode changed', () => {
    expect(
      describeFeatureFlagSetChange(
        { mode: 'targeted', orgIds: ['a'] },
        { mode: 'targeted', orgIds: ['a', 'b'] }
      ).actionLabel
    ).toBe('Schools updated');
    expect(
      describeFeatureFlagSetChange(
        { mode: 'targeted', orgIds: ['a'] },
        { mode: 'everyone', orgIds: [] }
      ).actionLabel
    ).toBe('Mode changed');
  });
});

describe('shouldConfirmEveryoneFromTargeted', () => {
  test('requires confirmation when leaving a school list', () => {
    expect(
      shouldConfirmEveryoneFromTargeted(
        { mode: 'targeted', orgIds: ['org-1'] },
        { mode: 'everyone', orgIds: [] }
      )
    ).toBe(true);
    expect(
      shouldConfirmEveryoneFromTargeted(
        { mode: 'off', orgIds: [] },
        { mode: 'everyone', orgIds: [] }
      )
    ).toBe(false);
  });
});

describe('runtimeOverrideCopy', () => {
  test('describes non-production default on', () => {
    const flag = {
      key: TEACHER_LOUNGE_FLAG,
      persisted: { mode: 'off' as const, orgIds: [] },
      effective: { mode: 'everyone' as const, orgIds: [] },
      runtimeOverride: 'non_production_default' as const,
    };
    const copy = runtimeOverrideCopy(flag, {
      YAWP_ENVIRONMENT: 'demo',
    });
    expect(copy?.tag).toContain('Demo override');
  });
});
