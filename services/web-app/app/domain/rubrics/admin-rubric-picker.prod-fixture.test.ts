import { describe, expect, test } from 'bun:test';
import fixture from './__fixtures__/prod-rubric-catalog.json';
import { perTypeKey } from './rubric-catalog.server';
import {
  PROD_SHAPED_ADMIN_PICKER_COUNT,
  prodShapedPickerKeysFromFixture,
  QA_VALIDATION_PROBE_LIBRARY_NAME,
} from './prod-shaped-admin-picker-count';

const DAILY_PAGES_TYPE_ID = 'cmlgtyo8j01em0qjs6knw7cni';
const GBA_ETIQUETTE_TYPE_ID = 'cms93piub000101lbiyhn43lh';
const GBA_ETIQUETTE_LIBRARY_NAME = 'gba300-international-etiquette';
const ACT_WRITING_TYPE_ID = 'cmpphw7w303lh01l15z0pr6nd';

function prodShapedAssignmentType<T extends { id: string; rubricId?: string | null }>(
  type: T
): T {
  if (type.id === DAILY_PAGES_TYPE_ID) {
    return { ...type, rubricId: 'daily-pages-engagement-library' };
  }
  if (type.id === GBA_ETIQUETTE_TYPE_ID) {
    return { ...type, rubricId: 'gba-etiquette-library-id' };
  }
  return type;
}

describe('prod-shaped catalog acceptance', () => {
  test('Live picker keys match non-archived library rubrics and per-type live columns', () => {
    const keys = prodShapedPickerKeysFromFixture();
    expect(keys).toContain('daily-pages-engagement');
    expect(keys).toContain('thesis-driven-essay');
    expect(keys).toContain('class-starter-engagement');
    expect(keys).not.toContain('daily-pages-reflection');
    expect(keys).not.toContain('daily-pages-short-form');
    expect(keys).not.toContain(perTypeKey(DAILY_PAGES_TYPE_ID));
    expect(keys).not.toContain(perTypeKey(GBA_ETIQUETTE_TYPE_ID));
    expect(keys).not.toContain(perTypeKey(ACT_WRITING_TYPE_ID));
    expect(keys.filter((key) => !key.startsWith('assignment-type:'))).toHaveLength(8);
    expect(keys.filter((key) => key.startsWith('assignment-type:'))).toHaveLength(6);
  });

  test('GBA 300 etiquette dedupes when the type links the library rubric', () => {
    const shaped = prodShapedAssignmentType({
      id: GBA_ETIQUETTE_TYPE_ID,
      rubricId: null,
      archivedAt: null,
    });
    expect(shaped.rubricId).not.toBeNull();
    expect(prodShapedPickerKeysFromFixture()).not.toContain(
      perTypeKey(GBA_ETIQUETTE_TYPE_ID)
    );
    expect(
      fixture.libraryRubrics.some((row) => row.name === GBA_ETIQUETTE_LIBRARY_NAME)
    ).toBe(true);
  });

  test('production-shaped picker total is 16 (fixture JSON documents 14 keys)', () => {
    expect(PROD_SHAPED_ADMIN_PICKER_COUNT).toBe(16);
    expect(prodShapedPickerKeysFromFixture()).toHaveLength(14);
    expect(PROD_SHAPED_ADMIN_PICKER_COUNT - prodShapedPickerKeysFromFixture().length).toBe(
      2
    );
  });

  test('archived QA validation probe library row stays excluded', () => {
    expect(prodShapedPickerKeysFromFixture()).not.toContain(
      QA_VALIDATION_PROBE_LIBRARY_NAME
    );
  });
});
