import { describe, expect, test } from 'bun:test';
import {
  DAILY_PAGES_WRITING_CONDITIONS_FLAG,
  FEATURE_FLAG_KEYS,
  featureFlagSettingName,
  isFeatureFlagKey,
  parseFeatureFlagValue,
  readableWritingConditions,
} from './feature-flags';

describe('feature flag registry', () => {
  test('has the Daily Pages writing-conditions flag', () => {
    expect(FEATURE_FLAG_KEYS).toContain(DAILY_PAGES_WRITING_CONDITIONS_FLAG);
    expect(isFeatureFlagKey(DAILY_PAGES_WRITING_CONDITIONS_FLAG)).toBe(true);
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

  test('is off unless the stored value is exactly "true"', () => {
    expect(parseFeatureFlagValue('true')).toBe(true);
    expect(parseFeatureFlagValue('false')).toBe(false);
    expect(parseFeatureFlagValue(null)).toBe(false);
    expect(parseFeatureFlagValue(undefined)).toBe(false);
    expect(parseFeatureFlagValue('TRUE')).toBe(false);
    expect(parseFeatureFlagValue('1')).toBe(false);
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
