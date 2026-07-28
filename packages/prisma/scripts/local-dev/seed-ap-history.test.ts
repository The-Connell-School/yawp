import { describe, expect, test } from 'bun:test';
import { AP_HISTORY_LIBRARY_ENTRIES } from '../ap-history-library-data';
import { UNIVERSAL_TUTOR_INSTRUCTIONS } from '../universal-tutor-instructions';
import {
  AP_HISTORY_ASSIGNMENT_TYPE_SYSTEM_KEY,
  buildApHistoryAssignmentTypeCreateInput,
} from './seed-ap-history';

describe('buildApHistoryAssignmentTypeCreateInput', () => {
  const orgId = 'org-local-dev';
  const input = buildApHistoryAssignmentTypeCreateInput(orgId);

  test('creates the canonical AP History Essay type owned by the org', () => {
    expect(input.systemKey).toBe(AP_HISTORY_ASSIGNMENT_TYPE_SYSTEM_KEY);
    expect(input.systemKey).toBe('ap_history_essay');
    expect(input.title).toBe('AP History Essay');
    expect(input.ownerOrgId).toBe(orgId);
  });

  test('ships the universal tutor block in the module tutor settings', () => {
    const modules = input.assignmentModules?.create ?? [];
    const moduleList = Array.isArray(modules) ? modules : [modules];

    expect(moduleList).toHaveLength(1);
    expect(moduleList[0]?.tutorInstructions).toBe(UNIVERSAL_TUTOR_INSTRUCTIONS);
  });

  test('links the type to the org so it appears in org defaults', () => {
    expect(input.organizationAssignments?.create).toEqual({
      organizationId: orgId,
    });
  });

  test('seeds every curated library entry from the shared data source', () => {
    const entries = input.apHistoryLibraryEntries?.create ?? [];
    expect(entries).toHaveLength(AP_HISTORY_LIBRARY_ENTRIES.length);

    const seededKeys = entries.map((entry) => entry.externalKey).sort();
    const sourceKeys = AP_HISTORY_LIBRARY_ENTRIES.map(
      (entry) => entry.externalKey
    ).sort();
    expect(seededKeys).toEqual(sourceKeys);
  });

  test('attaches the history-collage hero image as an image blob', () => {
    const image = input.image?.create;
    expect(image).toBeTruthy();
    expect(image?.contentType).toBe('image/webp');
    expect(image?.altText).toContain('history');
    expect(Buffer.isBuffer(image?.blob)).toBe(true);
    expect((image?.blob as Buffer).length).toBeGreaterThan(0);
  });

  test('preserves DBQ sources and keeps LEQs source-free', () => {
    const entries = input.apHistoryLibraryEntries?.create ?? [];
    for (const entry of entries) {
      const source = AP_HISTORY_LIBRARY_ENTRIES.find(
        (candidate) => candidate.externalKey === entry.externalKey
      );
      const sourceCount = entry.sources?.create?.length ?? 0;
      if (entry.essayType === 'dbq') {
        expect(sourceCount).toBeGreaterThan(0);
        expect(sourceCount).toBe(source?.sources.length ?? -1);
      } else {
        expect(sourceCount).toBe(0);
      }
    }
  });
});
