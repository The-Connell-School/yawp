import { describe, expect, test } from 'bun:test';
import { AP_ENGLISH_LIT_LIBRARY_ENTRIES } from './ap-english-lit-library-data';

const VALID_FRQ_TYPES = new Set(['poetry', 'prose', 'literary_argument']);

describe('AP English Literature library seed data', () => {
  test('ships at least 50 prompts', () => {
    expect(AP_ENGLISH_LIT_LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(50);
  });

  test('every entry has a unique external key', () => {
    const keys = AP_ENGLISH_LIT_LIBRARY_ENTRIES.map((e) => e.externalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every source has a unique external key', () => {
    const sourceKeys = AP_ENGLISH_LIT_LIBRARY_ENTRIES.flatMap((e) =>
      e.sources.map((s) => s.externalKey),
    );
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  });

  test('every entry declares a valid FRQ type and non-empty prompt', () => {
    for (const entry of AP_ENGLISH_LIT_LIBRARY_ENTRIES) {
      expect(VALID_FRQ_TYPES.has(entry.frqType)).toBe(true);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.prompt.trim().length).toBeGreaterThan(0);
      expect(entry.focusSkill.trim().length).toBeGreaterThan(0);
    }
  });

  test('poetry and prose prompts provide a text; literary argument does not', () => {
    for (const entry of AP_ENGLISH_LIT_LIBRARY_ENTRIES) {
      if (entry.frqType === 'literary_argument') {
        expect(entry.sources.length).toBe(0);
        // Open questions offer suggested works instead of a provided text.
        expect((entry.suggestedWorks ?? '').trim().length).toBeGreaterThan(0);
      } else {
        expect(entry.sources.length).toBeGreaterThan(0);
      }
    }
  });

  test('covers all three free-response question types', () => {
    const present = new Set(
      AP_ENGLISH_LIT_LIBRARY_ENTRIES.map((e) => e.frqType),
    );
    expect(present.has('poetry')).toBe(true);
    expect(present.has('prose')).toBe(true);
    expect(present.has('literary_argument')).toBe(true);
  });
});
