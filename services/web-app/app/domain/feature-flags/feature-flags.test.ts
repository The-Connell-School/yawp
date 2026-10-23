import { describe, expect, test } from 'bun:test';
import {
  FEATURE_FLAGS,
  GUIDED_TOURS_FLAG,
  CLASS_CODE_UNIQUE_FLAG,
  DEMO_FEEDBACK_FLAG,
  INTERNAL_RUBRICS_FLAG,
  LESSON_PLANNER_FLAG,
  FREE_TIER_FLAG,
  FREE_TIER_FLAG_LEGACY_KEY,
  UNIFIED_SIGN_ON_FLAG,
  FEATURE_FLAG_KEYS,
  LESSON_PLANNER_INTAKE_V2_FLAG,
  LESSON_PLANNER_STACK_V2_FLAG,
  LESSON_PLANNER_DECK_V2_FLAG,
  LESSON_PLANNER_PLAN_EXPORT_V2_FLAG,
  LESSON_PLANNER_STACK_V3_FLAG,
  LESSON_PLANNER_SHARE_FLAG,
  LESSON_PLANNER_RUN_SHOW_FLAG,
  LESSON_PLANNER_TEMPLATES_FLAG,
  LESSON_PLANNER_DECK_GALLERY_FLAG,
  LESSON_PLANNER_UPLOADS_FLAG,
  LESSON_PLANNER_STACK_PANEL_FLAG,
  FOLDED_FREE_TIER_LEGACY_SETTINGS,
  isFreeTierGloballyEnabled,
  featureFlagSettingName,
  MAX_FEATURE_FLAG_ORG_IDS,
  evaluateFeatureFlag,
  isFeatureFlagKey,
  resolveFeatureFlagKey,
  normalizeFeatureFlagValue,
  parseFeatureFlagValue,
  serializeFeatureFlagValue,
  type FeatureFlagValue,
} from './feature-flags';

describe('feature flag registry', () => {
  test('no longer has the removed Daily Pages writing-conditions flag', () => {
    const removed = 'daily_pages_paragraph_type_and_writing_time';
    expect(FEATURE_FLAG_KEYS as readonly string[]).not.toContain(removed);
    expect(isFeatureFlagKey(removed)).toBe(false);
  });

  test('registers only the collapsed rollout flags plus unrelated product flags', () => {
    expect(FEATURE_FLAG_KEYS).toEqual([
      LESSON_PLANNER_FLAG,
      INTERNAL_RUBRICS_FLAG,
      FREE_TIER_FLAG,
      LESSON_PLANNER_INTAKE_V2_FLAG,
      LESSON_PLANNER_STACK_V2_FLAG,
      LESSON_PLANNER_DECK_V2_FLAG,
      LESSON_PLANNER_STACK_PANEL_FLAG,
      LESSON_PLANNER_PLAN_EXPORT_V2_FLAG,
      LESSON_PLANNER_STACK_V3_FLAG,
      LESSON_PLANNER_SHARE_FLAG,
      LESSON_PLANNER_RUN_SHOW_FLAG,
      LESSON_PLANNER_TEMPLATES_FLAG,
      LESSON_PLANNER_DECK_GALLERY_FLAG,
      LESSON_PLANNER_UPLOADS_FLAG,
      UNIFIED_SIGN_ON_FLAG,
      CLASS_CODE_UNIQUE_FLAG,
      DEMO_FEEDBACK_FLAG,
      GUIDED_TOURS_FLAG,
    ]);
  });

  test('stores free tier under the legacy Setting row name', () => {
    expect(FREE_TIER_FLAG).toBe('free-tier');
    expect(featureFlagSettingName(FREE_TIER_FLAG)).toBe('feature_flag.free_tier');
  });

  test('accepts legacy Internal API keys as aliases', () => {
    expect(resolveFeatureFlagKey(FREE_TIER_FLAG_LEGACY_KEY)).toBe(FREE_TIER_FLAG);
    expect(resolveFeatureFlagKey('free-tier-onboarding-v2')).toBe(FREE_TIER_FLAG);
    expect(resolveFeatureFlagKey('free-tier-inapp-v2')).toBe(FREE_TIER_FLAG);
    expect(resolveFeatureFlagKey('signon-teacher-prompts')).toBe(UNIFIED_SIGN_ON_FLAG);
    expect(isFeatureFlagKey('free_tier')).toBe(true);
    expect(isFeatureFlagKey('free-tier-onboarding-v2')).toBe(true);
  });

  test('documents folded legacy settings for migration', () => {
    expect(FOLDED_FREE_TIER_LEGACY_SETTINGS).toEqual([
      'feature_flag.free-tier-onboarding-v2',
      'feature_flag.free-tier-inapp-v2',
    ]);
  });

  test('has the lesson planner review flags, each with a setting name', () => {
    expect(featureFlagSettingName(LESSON_PLANNER_INTAKE_V2_FLAG)).toBe(
      'feature_flag.lesson_planner_intake_v2'
    );
    expect(featureFlagSettingName(LESSON_PLANNER_STACK_V2_FLAG)).toBe(
      'feature_flag.lesson_planner_stack_v2'
    );
    expect(featureFlagSettingName(LESSON_PLANNER_DECK_V2_FLAG)).toBe(
      'feature_flag.lesson_planner_deck_v2'
    );
    expect(featureFlagSettingName(LESSON_PLANNER_STACK_PANEL_FLAG)).toBe(
      'feature_flag.lesson_planner_stack_panel'
    );
    expect(featureFlagSettingName(LESSON_PLANNER_PLAN_EXPORT_V2_FLAG)).toBe(
      'feature_flag.lesson_planner_plan_export_v2'
    );
    expect(featureFlagSettingName(LESSON_PLANNER_STACK_V3_FLAG)).toBe(
      'feature_flag.lesson_planner_stack_v3'
    );
    expect(featureFlagSettingName(LESSON_PLANNER_SHARE_FLAG)).toBe('feature_flag.lesson_planner_share');
    expect(featureFlagSettingName(LESSON_PLANNER_RUN_SHOW_FLAG)).toBe('feature_flag.lesson_planner_run_show');
    expect(featureFlagSettingName(LESSON_PLANNER_TEMPLATES_FLAG)).toBe('feature_flag.lesson_planner_templates');
    expect(featureFlagSettingName(LESSON_PLANNER_DECK_GALLERY_FLAG)).toBe('feature_flag.lesson_planner_deck_gallery');
    expect(featureFlagSettingName(LESSON_PLANNER_UPLOADS_FLAG)).toBe('feature_flag.lesson_planner_uploads');
  });

  test('rejects anything that is not a registered flag', () => {
    expect(isFeatureFlagKey('nope')).toBe(false);
    expect(isFeatureFlagKey('')).toBe(false);
    expect(isFeatureFlagKey(undefined)).toBe(false);
    expect(isFeatureFlagKey('__proto__')).toBe(false);
    expect(isFeatureFlagKey('toString')).toBe(false);
  });

  test('has the Rubrics from Yawp Internal flag, stored under its own row', () => {
    expect(INTERNAL_RUBRICS_FLAG).toBe('internal_rubrics');
    expect(featureFlagSettingName(INTERNAL_RUBRICS_FLAG)).toBe(
      'feature_flag.internal_rubrics'
    );
    expect(FEATURE_FLAGS[INTERNAL_RUBRICS_FLAG].label).toBe(
      'Rubrics from Yawp Internal'
    );
  });
});

describe('stored flag values', () => {
  const off: FeatureFlagValue = { mode: 'off', orgIds: [] };
  const everyone: FeatureFlagValue = { mode: 'everyone', orgIds: [] };

  test('everyone with invalid orgIds reads as off', () => {
    expect(parseFeatureFlagValue('{"mode":"everyone","orgIds":false}')).toEqual({
      mode: 'off',
      orgIds: [],
    });
    expect(parseFeatureFlagValue('{"mode":"everyone","orgIds":[1]}')).toEqual({
      mode: 'off',
      orgIds: [],
    });
  });

  test('legacy "true" reads as everyone and "false" is off', () => {
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

  test('targeted is on only for listed schools', () => {
    expect(evaluateFeatureFlag(targeted, 'org-1')).toBe(true);
    expect(evaluateFeatureFlag(targeted, 'org-2')).toBe(false);
    expect(evaluateFeatureFlag(targeted, null)).toBe(false);
    expect(evaluateFeatureFlag(targeted)).toBe(false);
  });

  test('off is off everywhere', () => {
    const value = { mode: 'off', orgIds: [] } as const;
    expect(evaluateFeatureFlag(value, 'org-1')).toBe(false);
    expect(evaluateFeatureFlag(value)).toBe(false);
  });

  test('isFreeTierGloballyEnabled matches everyone mode only', () => {
    expect(isFreeTierGloballyEnabled({ mode: 'everyone', orgIds: [] })).toBe(true);
    expect(isFreeTierGloballyEnabled(targeted)).toBe(false);
    expect(isFreeTierGloballyEnabled({ mode: 'off', orgIds: [] })).toBe(false);
  });
});
