import { describe, expect, mock, test } from 'bun:test';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';
import { seedApHistoryLibrary } from './seed-ap-history-library';
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
  test('seeds the selected preview organization and its curated prompt library', async () => {
    const assignmentTypeUpsert = mock(async () => ({ id: 'ap-type' }));
    const organizationAssignmentUpsert = mock(async () => ({}));
    const entryUpsert = mock(async ({ where }: { where: { externalKey: string } }) => ({
      id: where.externalKey,
    }));
    const sourceUpsert = mock(async () => ({}));
    const prisma = {
      organization: {
        findUnique: mock(async () => ({ id: 'preview-org' })),
      },
      assignmentType: {
        findUnique: mock(async () => null),
        upsert: assignmentTypeUpsert,
      },
      organizationAssignmentType: { upsert: organizationAssignmentUpsert },
      assignmentModule: {
        findFirst: mock(async () => ({ id: 'ap-module' })),
        update: mock(async () => ({ id: 'ap-module' })),
      },
      assignmentModuleInstruction: {
        findFirst: mock(async () => ({ id: 'ap-instruction' })),
        update: mock(async () => ({})),
      },
      apHistoryPromptLibraryEntry: { upsert: entryUpsert },
      apHistoryPromptLibrarySource: { upsert: sourceUpsert },
    };

    await seedApHistoryLibrary(prisma as never, 'preview-org');

    expect(assignmentTypeUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: { ownerOrgId: 'preview-org' },
    });
    expect(organizationAssignmentUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: {
        organizationId_assignmentTypeId: {
          organizationId: 'preview-org',
          assignmentTypeId: 'ap-type',
        },
      },
    });
    expect(entryUpsert).toHaveBeenCalledTimes(AP_HISTORY_LIBRARY_ENTRIES.length);
    expect(sourceUpsert).toHaveBeenCalledTimes(
      AP_HISTORY_LIBRARY_ENTRIES.flatMap((entry) => entry.sources).length
    );
  });

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
