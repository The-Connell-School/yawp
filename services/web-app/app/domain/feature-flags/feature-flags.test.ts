import { describe, expect, test } from 'bun:test';
import {
  FEATURE_FLAGS,
  INTERNAL_RUBRICS_FLAG,
  LESSON_PLANNER_FLAG,
  FEATURE_FLAG_KEYS,
  featureFlagSettingName,
  MAX_FEATURE_FLAG_ORG_IDS,
  evaluateFeatureFlag,
  isFeatureFlagKey,
  normalizeFeatureFlagValue,
  parseFeatureFlagValue,
  serializeFeatureFlagValue,
  type FeatureFlagValue,
} from './feature-flags';

describe('feature flag registry', () => {
  test('no longer has the removed Daily Pages writing-conditions flag', () => {
    // Paragraph type and writing time were removed with their flag. Its old
    // Setting row may still exist; it is simply no longer a registered flag.
    const removed = 'daily_pages_paragraph_type_and_writing_time';
    expect(FEATURE_FLAG_KEYS as readonly string[]).not.toContain(removed);
    expect(isFeatureFlagKey(removed)).toBe(false);
  });

  test('has the Lesson Planner flag', () => {
    expect(FEATURE_FLAG_KEYS).toContain(LESSON_PLANNER_FLAG);
    expect(isFeatureFlagKey(LESSON_PLANNER_FLAG)).toBe(true);
    expect(featureFlagSettingName(LESSON_PLANNER_FLAG)).toBe(
      'feature_flag.lesson_planner'
    );
  });

  test('has the Rubrics from Yawp Internal flag, stored under its own row', () => {
    expect(INTERNAL_RUBRICS_FLAG).toBe('internal_rubrics');
    expect(FEATURE_FLAG_KEYS).toEqual([LESSON_PLANNER_FLAG, INTERNAL_RUBRICS_FLAG]);
    expect(isFeatureFlagKey(INTERNAL_RUBRICS_FLAG)).toBe(true);
    expect(featureFlagSettingName(INTERNAL_RUBRICS_FLAG)).toBe(
      'feature_flag.internal_rubrics'
    );
    expect(FEATURE_FLAGS[INTERNAL_RUBRICS_FLAG].label).toBe(
      'Rubrics from Yawp Internal'
    );
    const { description } = FEATURE_FLAGS[INTERNAL_RUBRICS_FLAG];
    expect(description).toContain('new assignment');
    expect(description).toContain('Existing assignments keep');
  });

  test('rejects anything that is not a registered flag', () => {
    expect(isFeatureFlagKey('nope')).toBe(false);
    expect(isFeatureFlagKey('')).toBe(false);
    expect(isFeatureFlagKey(undefined)).toBe(false);
    expect(isFeatureFlagKey('__proto__')).toBe(false);
    expect(isFeatureFlagKey('toString')).toBe(false);
  });

  test('stores each flag under its own namespaced Setting row', () => {
    expect(featureFlagSettingName(LESSON_PLANNER_FLAG)).toBe(
      'feature_flag.lesson_planner'
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
