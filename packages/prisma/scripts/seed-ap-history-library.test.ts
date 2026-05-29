import { describe, expect, test } from 'bun:test';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';
import { readFileSync } from 'node:fs';

describe('AP History library seed data', () => {
  test('exports the two MVP entries', () => {
    expect(AP_HISTORY_LIBRARY_ENTRIES).toHaveLength(2);
  });

  test('entry external keys are unique APUSH DBQ or LEQ keys', () => {
    const externalKeys = AP_HISTORY_LIBRARY_ENTRIES.map((entry) => entry.externalKey);

    expect(new Set(externalKeys).size).toBe(externalKeys.length);
    for (const externalKey of externalKeys) {
      expect(externalKey).toMatch(/^apush-(dbq|leq)-/);
    }
  });

  test('source external keys are unique and nested under their entry key', () => {
    const sourceKeys = AP_HISTORY_LIBRARY_ENTRIES.flatMap((entry) =>
      entry.sources.map((source) => source.externalKey)
    );

    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
    for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
      for (const source of entry.sources) {
        expect(source.externalKey.startsWith(`${entry.externalKey}-doc-`)).toBe(true);
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
