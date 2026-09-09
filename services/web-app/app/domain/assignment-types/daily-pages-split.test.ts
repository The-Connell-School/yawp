import { describe, expect, test } from 'bun:test';

import { isDailyPagesSplitEnabled } from './daily-pages-split';

describe('isDailyPagesSplitEnabled', () => {
  test('is off unless the flag is explicitly turned on', () => {
    expect(isDailyPagesSplitEnabled({})).toBe(false);
    expect(isDailyPagesSplitEnabled({ DAILY_PAGES_SPLIT_ENABLED: '' })).toBe(
      false
    );
    expect(
      isDailyPagesSplitEnabled({ DAILY_PAGES_SPLIT_ENABLED: 'false' })
    ).toBe(false);
    // Anything other than the exact opt-in string stays off, so a typo in a
    // deploy config cannot change how live submissions are graded.
    expect(isDailyPagesSplitEnabled({ DAILY_PAGES_SPLIT_ENABLED: 'yes' })).toBe(
      false
    );
    expect(isDailyPagesSplitEnabled({ DAILY_PAGES_SPLIT_ENABLED: 'TRUE' })).toBe(
      false
    );
  });

  test('is on for the exact opt-in string', () => {
    expect(isDailyPagesSplitEnabled({ DAILY_PAGES_SPLIT_ENABLED: 'true' })).toBe(
      true
    );
  });

  test('reads the ambient environment when none is passed', () => {
    // The browser bundle has no process.env; reading the flag there must not
    // throw, it must simply report the feature off.
    expect(typeof isDailyPagesSplitEnabled()).toBe('boolean');
  });
});
