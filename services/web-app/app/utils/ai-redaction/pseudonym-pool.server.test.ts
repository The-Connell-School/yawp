import { describe, expect, test } from 'bun:test';
import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';
import { ORG_PSEUDONYM_NAME_POOL } from './org-pseudonym-pool.server';
import { isCommonWordFirstName } from './common-word-names.server';
import { buildRedactionMapping } from './mapping.server';
import { rehydrate } from './redact.server';

describe('PSEUDONYM_FIRST_NAME_POOL', () => {
  test('contains no name that is also an ordinary English word', () => {
    // rehydrate() rewrites pseudonyms back into real student names in text
    // the teacher and the student both read. A pseudonym that doubles as an
    // ordinary word ("Drew", "Gray", "Lane", "Robin") turns that rewrite
    // into silent corruption of feedback. Capitalization-gating rehydrate()
    // is the structural defence; keeping such words out of the pool is the
    // cheap one, and this test stops the pool regressing.
    const offenders = PSEUDONYM_FIRST_NAME_POOL.filter((name) =>
      isCommonWordFirstName(name)
    );

    expect(offenders).toEqual([]);
  });

  test('has no duplicates', () => {
    const lower = PSEUDONYM_FIRST_NAME_POOL.map((name) => name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  test('is large enough for a full class roster plus the teacher', () => {
    expect(PSEUDONYM_FIRST_NAME_POOL.length).toBeGreaterThanOrEqual(40);
  });

  test('every pool entry survives a full round trip inside ordinary prose', () => {
    // Belt and braces on top of the two guards above: for every slot in the
    // pool, a sentence that merely contains the lowercased pool word must
    // come back unchanged.
    for (const pseudonym of PSEUDONYM_FIRST_NAME_POOL) {
      const mapping = buildRedactionMapping(['Isaac'], [pseudonym]);
      const sentence = `the ${pseudonym.toLowerCase()} of the argument holds.`;
      expect(rehydrate(sentence, mapping)).toBe(sentence);
    }
  });
});

describe('ORG_PSEUDONYM_NAME_POOL', () => {
  test('contains no entry that is also an ordinary English word', () => {
    const offenders = ORG_PSEUDONYM_NAME_POOL.filter((name) =>
      name.split(/\s+/).some((part) => isCommonWordFirstName(part))
    );

    expect(offenders).toEqual([]);
  });
});
