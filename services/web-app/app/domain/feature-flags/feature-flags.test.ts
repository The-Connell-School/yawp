import { describe, expect, test } from 'bun:test';
import {
  DAILY_PAGES_WRITING_CONDITIONS_FLAG,
  LESSON_PLANNER_FLAG,
  FEATURE_FLAG_KEYS,
  featureFlagSettingName,
  MAX_FEATURE_FLAG_ORG_IDS,
  evaluateFeatureFlag,
  isFeatureFlagKey,
  normalizeFeatureFlagValue,
  parseFeatureFlagValue,
  readableWritingConditions,
  serializeFeatureFlagValue,
  type FeatureFlagValue,
} from './feature-flags';

describe('feature flag registry', () => {
  test('has the Daily Pages writing-conditions flag', () => {
    expect(FEATURE_FLAG_KEYS).toContain(DAILY_PAGES_WRITING_CONDITIONS_FLAG);
    expect(isFeatureFlagKey(DAILY_PAGES_WRITING_CONDITIONS_FLAG)).toBe(true);
  });

  test('has the Lesson Planner flag', () => {
    expect(FEATURE_FLAG_KEYS).toContain(LESSON_PLANNER_FLAG);
    expect(isFeatureFlagKey(LESSON_PLANNER_FLAG)).toBe(true);
    expect(featureFlagSettingName(LESSON_PLANNER_FLAG)).toBe(
      'feature_flag.lesson_planner'
    );
  });

  test('rejects anything that is not a registered flag', () => {
    expect(isFeatureFlagKey('nope')).toBe(false);
    expect(isFeatureFlagKey('')).toBe(false);
    expect(isFeatureFlagKey(undefined)).toBe(false);
    expect(isFeatureFlagKey('__proto__')).toBe(false);
    expect(isFeatureFlagKey('toString')).toBe(false);
  });

  test('stores each flag under its own namespaced Setting row', () => {
    expect(featureFlagSettingName(DAILY_PAGES_WRITING_CONDITIONS_FLAG)).toBe(
      'feature_flag.daily_pages_paragraph_type_and_writing_time'
    );
  });

});

describe('stored flag values', () => {
  const off: FeatureFlagValue = { mode: 'off', orgIds: [] };
  const everyone: FeatureFlagValue = { mode: 'everyone', orgIds: [] };

  test('legacy "true" reads as everyone and "false" as off', () => {
    expect(parseFeatureFlagValue('true')).toEqual(everyone);
    expect(parseFeatureFlagValue('false')).toEqual(off);
  });

  test('a missing row is off', () => {
    expect(parseFeatureFlagValue(null)).toEqual(off);
    expect(parseFeatureFlagValue(undefined)).toEqual(off);
  });

  test('garbage reads as off', () => {
    for (const value of [
      '',
      'TRUE',
      '1',
      'on',
      '{',
      'null',
      '[]',
      '"everyone"',
      '{"mode":"sometimes","orgIds":[]}',
      '{"mode":"targeted","orgIds":"org-1"}',
      '{"mode":"targeted","orgIds":[1,2]}',
      '{"orgIds":["org-1"]}',
    ]) {
      expect(parseFeatureFlagValue(value)).toEqual(off);
    }
  });

  test('reads each JSON mode', () => {
    expect(parseFeatureFlagValue('{"mode":"off","orgIds":[]}')).toEqual(off);
    expect(parseFeatureFlagValue('{"mode":"everyone","orgIds":[]}')).toEqual(everyone);
    expect(
      parseFeatureFlagValue('{"mode":"targeted","orgIds":["org-1","org-2"]}')
    ).toEqual({ mode: 'targeted', orgIds: ['org-1', 'org-2'] });
  });

  test('orgIds only count for targeted, deduped and capped', () => {
    expect(parseFeatureFlagValue('{"mode":"everyone","orgIds":["org-1"]}')).toEqual(everyone);
    expect(parseFeatureFlagValue('{"mode":"off","orgIds":["org-1"]}')).toEqual(off);
    expect(
      parseFeatureFlagValue('{"mode":"targeted","orgIds":["org-1","org-1","org-2"]}')
    ).toEqual({ mode: 'targeted', orgIds: ['org-1', 'org-2'] });
    const many = Array.from({ length: MAX_FEATURE_FLAG_ORG_IDS + 5 }, (_, i) => `org-${i}`);
    expect(
      parseFeatureFlagValue(JSON.stringify({ mode: 'targeted', orgIds: many })).orgIds
    ).toHaveLength(MAX_FEATURE_FLAG_ORG_IDS);
    expect(MAX_FEATURE_FLAG_ORG_IDS).toBe(2000);
  });

  test('normalizes what is written and round-trips through the stored value', () => {
    expect(normalizeFeatureFlagValue('everyone', ['org-1'])).toEqual(everyone);
    expect(normalizeFeatureFlagValue('targeted', ['b', 'a', 'b'])).toEqual({
      mode: 'targeted',
      orgIds: ['b', 'a'],
    });
    const value: FeatureFlagValue = { mode: 'targeted', orgIds: ['org-1'] };
    const stored = serializeFeatureFlagValue(value);
    expect(JSON.parse(stored)).toEqual(value);
    expect(parseFeatureFlagValue(stored)).toEqual(value);
  });
});

describe('evaluateFeatureFlag', () => {
  const targeted = { mode: 'targeted', orgIds: ['org-1'] } as const;

  test('everyone is on for every school and with no school', () => {
    const value = { mode: 'everyone', orgIds: [] } as const;
    expect(evaluateFeatureFlag(value, 'org-1')).toBe(true);
    expect(evaluateFeatureFlag(value, null)).toBe(true);
    expect(evaluateFeatureFlag(value)).toBe(true);
  });

  test('off is off for every school', () => {
    const value = { mode: 'off', orgIds: [] } as const;
    expect(evaluateFeatureFlag(value, 'org-1')).toBe(false);
    expect(evaluateFeatureFlag(value)).toBe(false);
  });

  test('targeted is on only for the listed schools', () => {
    expect(evaluateFeatureFlag(targeted, 'org-1')).toBe(true);
    expect(evaluateFeatureFlag(targeted, 'org-2')).toBe(false);
    expect(evaluateFeatureFlag(targeted, '')).toBe(false);
    expect(evaluateFeatureFlag(targeted, null)).toBe(false);
    expect(evaluateFeatureFlag(targeted, undefined)).toBe(false);
  });
});

describe('readableWritingConditions', () => {
  const stored: {
    id: string;
    paragraphMode: string | null;
    writingTimeMinutes: number | null;
    tutorEnabled: boolean;
  } = {
    id: 'assignment-1',
    paragraphMode: 'analyze',
    writingTimeMinutes: 15,
    tutorEnabled: false,
  };

  test('flag on: the stored paragraph type and writing time are read as stored', () => {
    expect(readableWritingConditions(stored, true)).toEqual(stored);
  });

  test('flag off: both read as unset, everything else untouched', () => {
    expect(readableWritingConditions(stored, false)).toEqual({
      id: 'assignment-1',
      paragraphMode: null,
      writingTimeMinutes: null,
      tutorEnabled: false,
    });
  });

  test('flag off never mutates the stored record', () => {
    const copy = { ...stored };
    readableWritingConditions(copy, false);
    expect(copy).toEqual(stored);
  });

  test('passes a missing assignment through', () => {
    expect(readableWritingConditions(null, false)).toBeNull();
    expect(readableWritingConditions(undefined, true)).toBeUndefined();
  });
});
