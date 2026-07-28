import { describe, expect, test } from 'bun:test';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';
import {
  AP_HISTORY_MODULE_DATA,
  buildApHistoryModuleUpdateData,
} from './ap-history-module-data';
import {
  UNIVERSAL_TUTOR_INSTRUCTIONS,
  hasUniversalTutorInstructions,
} from './universal-tutor-instructions';
import { readFileSync } from 'node:fs';

describe('AP History library seed data', () => {
  test('exports a curated library of DBQ entries', () => {
    expect(AP_HISTORY_LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(1);
    expect(
      AP_HISTORY_LIBRARY_ENTRIES.some((entry) => entry.essayType === 'dbq')
    ).toBe(true);
  });

  test('every source has a mediaType and non-empty body', () => {
    for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
      for (const source of entry.sources) {
        expect(['text', 'image']).toContain(source.mediaType);
        expect(source.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('image sources carry alt text and a self-hosted asset (no hotlinks)', () => {
    const imageSources = AP_HISTORY_LIBRARY_ENTRIES.flatMap((entry) =>
      entry.sources.filter((source) => source.mediaType === 'image')
    );

    for (const source of imageSources) {
      // Curated images are served from our own origin by externalKey, never
      // hotlinked from an external host.
      expect(source.imageUrl).toBeNull();
      expect((source.imageAlt ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  test('entry external keys are unique AP history DBQ or LEQ keys', () => {
    const externalKeys = AP_HISTORY_LIBRARY_ENTRIES.map(
      (entry) => entry.externalKey
    );

    expect(new Set(externalKeys).size).toBe(externalKeys.length);
    for (const externalKey of externalKeys) {
      expect(externalKey).toMatch(/^ap(ush|euro|world)-(dbq|leq)-/);
    }
  });

  test('source external keys are unique and nested under their entry key', () => {
    const sourceKeys = AP_HISTORY_LIBRARY_ENTRIES.flatMap((entry) =>
      entry.sources.map((source) => source.externalKey)
    );

    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
    for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
      for (const source of entry.sources) {
        expect(source.externalKey.startsWith(`${entry.externalKey}-doc-`)).toBe(
          true
        );
      }
    }
  });

  test('DBQs include sources and LEQs do not', () => {
    for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
      if (entry.essayType === 'dbq') {
        expect(entry.sources.length).toBeGreaterThan(0);
      } else {
        expect(entry.essayType).toBe('leq');
        expect(entry.sources).toHaveLength(0);
      }
    }
  });

  test('source positions are positive and unique per entry', () => {
    for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
      const positions = entry.sources.map((source) => source.position);

      expect(new Set(positions).size).toBe(positions.length);
      for (const position of positions) {
        expect(position).toBeGreaterThan(0);
      }
    }
  });
});

describe('AP History assignment type seed behavior', () => {
  test('assignment type update path preserves existing ownerOrgId', () => {
    const seedScript = readFileSync(
      new URL('./seed-ap-history-library.ts', import.meta.url),
      'utf8'
    );
    const updatePayload = seedScript.match(
      /update:\s*\{[\s\S]*?\.\.\.ASSIGNMENT_TYPE_DATA,[\s\S]*?\},/
    )?.[0];

    expect(updatePayload).toBeDefined();
    expect(updatePayload).not.toContain('ownerOrgId');
  });
});

describe('AP History module tutor instructions', () => {
  test('the seeded module ships the universal tutor block', () => {
    expect(AP_HISTORY_MODULE_DATA.tutorInstructions).toBe(
      UNIVERSAL_TUTOR_INSTRUCTIONS
    );
    expect(
      hasUniversalTutorInstructions(AP_HISTORY_MODULE_DATA.tutorInstructions)
    ).toBe(true);
  });

  test('an existing module with no tutor instructions gets the universal block', () => {
    const update = buildApHistoryModuleUpdateData(null);

    expect(update.tutorInstructions).toBe(UNIVERSAL_TUTOR_INSTRUCTIONS);
    expect(update.title).toBe(AP_HISTORY_MODULE_DATA.title);
    expect(update.position).toBe(AP_HISTORY_MODULE_DATA.position);
  });

  test('existing AP-specific tutor wording is preserved, not overwritten', () => {
    const existing =
      'Coach the student through an AP History DBQ using the AP rubric.';

    const update = buildApHistoryModuleUpdateData(existing);

    expect(update.tutorInstructions).toContain(existing);
    expect(
      update.tutorInstructions.startsWith(UNIVERSAL_TUTOR_INSTRUCTIONS)
    ).toBe(true);
  });

  test('re-running the seed does not duplicate the universal block', () => {
    const first = buildApHistoryModuleUpdateData(null).tutorInstructions;
    const second = buildApHistoryModuleUpdateData(first).tutorInstructions;

    expect(second).toBe(first);
  });

  test('the seed reads the existing module tutor instructions before updating', () => {
    const seedScript = readFileSync(
      new URL('./seed-ap-history-library.ts', import.meta.url),
      'utf8'
    );

    expect(seedScript).toContain('buildApHistoryModuleUpdateData');
    expect(seedScript).toContain('tutorInstructions: true');
  });
});
