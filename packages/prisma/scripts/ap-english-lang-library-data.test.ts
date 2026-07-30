import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_LIBRARY_ENTRIES,
  COMPLETE_SHORT_PASSAGE_KEYS,
  EXAM_SCALE_PASSAGE_MIN_WORDS,
  SHORT_EXCERPT_PASSAGE_KEYS,
} from './ap-english-lang-library-data';

const countWords = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).length;

const VALID_FRQ_TYPES = new Set([
  'synthesis',
  'rhetorical_analysis',
  'argument',
]);

describe('AP English Language library seed data', () => {
  test('ships at least 30 prompts', () => {
    expect(AP_ENGLISH_LANG_LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(30);
  });

  test('every entry has a unique external key', () => {
    const keys = AP_ENGLISH_LANG_LIBRARY_ENTRIES.map((e) => e.externalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every source has a unique external key', () => {
    const sourceKeys = AP_ENGLISH_LANG_LIBRARY_ENTRIES.flatMap((e) =>
      e.sources.map((s) => s.externalKey),
    );
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  });

  test('every entry declares a valid FRQ type and non-empty prompt', () => {
    for (const entry of AP_ENGLISH_LANG_LIBRARY_ENTRIES) {
      expect(VALID_FRQ_TYPES.has(entry.frqType)).toBe(true);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.prompt.trim().length).toBeGreaterThan(0);
      expect(entry.focusSkill.trim().length).toBeGreaterThan(0);
    }
  });

  test('covers all three free-response question types', () => {
    const present = new Set(
      AP_ENGLISH_LANG_LIBRARY_ENTRIES.map((e) => e.frqType),
    );
    expect(present.has('synthesis')).toBe(true);
    expect(present.has('rhetorical_analysis')).toBe(true);
    expect(present.has('argument')).toBe(true);
  });

  describe('synthesis entries', () => {
    const entries = AP_ENGLISH_LANG_LIBRARY_ENTRIES.filter(
      (e) => e.frqType === 'synthesis',
    );

    test('ship at least twelve prompts', () => {
      expect(entries.length).toBeGreaterThanOrEqual(12);
    });

    test('each ships at least six sources, with at least one visual', () => {
      for (const entry of entries) {
        expect(entry.sources.length).toBeGreaterThanOrEqual(6);
        expect(entry.sources.some((s) => s.mediaType === 'image')).toBe(true);
      }
    });

    test('each ships no suggestedEvidence (that is a Q3-only field)', () => {
      for (const entry of entries) {
        expect(entry.suggestedEvidence).toBeNull();
      }
    });
  });

  describe('rhetorical analysis entries', () => {
    const entries = AP_ENGLISH_LANG_LIBRARY_ENTRIES.filter(
      (e) => e.frqType === 'rhetorical_analysis',
    );

    test('ship at least eight prompts', () => {
      expect(entries.length).toBeGreaterThanOrEqual(8);
    });

    test('each ships exactly one passage source', () => {
      for (const entry of entries) {
        expect(entry.sources.length).toBe(1);
        expect(entry.sources[0].mediaType).toBe('text');
        expect(entry.sources[0].body.trim().length).toBeGreaterThan(0);
        expect(entry.sources[0].attribution.trim().length).toBeGreaterThan(0);
      }
    });

    // A Q2 passage IS the assignment: without the document in front of them a
    // student has nothing to analyze. The exam supplies 500-750 words, and Row B
    // 4 requires explaining how MULTIPLE choices work together, which a single
    // quoted sentence cannot support.
    test('every passage is exam-scale, or an explicitly tracked exception', () => {
      const tracked = new Set([
        ...SHORT_EXCERPT_PASSAGE_KEYS,
        ...COMPLETE_SHORT_PASSAGE_KEYS,
      ]);

      const undersized = entries
        .filter((entry) => !tracked.has(entry.externalKey))
        .map((entry) => ({
          key: entry.externalKey,
          words: countWords(entry.sources[0].body),
        }))
        .filter((entry) => entry.words < EXAM_SCALE_PASSAGE_MIN_WORDS);

      expect(undersized).toEqual([]);
    });

    test('a passage carrying a provenance URL is exam-scale', () => {
      for (const entry of entries) {
        if (!entry.sources[0].provenanceUrl) continue;
        expect(countWords(entry.sources[0].body)).toBeGreaterThanOrEqual(
          EXAM_SCALE_PASSAGE_MIN_WORDS,
        );
      }
    });

    // The tracked lists are a shrinking backlog, not a place to hide new gaps:
    // a key may only sit on them while the entry it names actually exists.
    test('the tracked-exception lists name only real entries', () => {
      const keys = new Set(entries.map((entry) => entry.externalKey));
      for (const key of [
        ...SHORT_EXCERPT_PASSAGE_KEYS,
        ...COMPLETE_SHORT_PASSAGE_KEYS,
      ]) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test('a tracked short excerpt is genuinely short', () => {
      for (const key of SHORT_EXCERPT_PASSAGE_KEYS) {
        const entry = entries.find((item) => item.externalKey === key);
        expect(countWords(entry!.sources[0].body)).toBeLessThan(
          EXAM_SCALE_PASSAGE_MIN_WORDS,
        );
      }
    });
  });

  describe('argument entries', () => {
    const entries = AP_ENGLISH_LANG_LIBRARY_ENTRIES.filter(
      (e) => e.frqType === 'argument',
    );

    test('ship at least twelve prompts', () => {
      expect(entries.length).toBeGreaterThanOrEqual(12);
    });

    test('each ships no provided text', () => {
      for (const entry of entries) {
        expect(entry.sources).toEqual([]);
      }
    });

    test('each ships suggested evidence domains', () => {
      for (const entry of entries) {
        expect((entry.suggestedEvidence ?? '').trim().length).toBeGreaterThan(0);
      }
    });
  });
});
