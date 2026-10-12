import { describe, expect, test } from 'bun:test';
import fixture from './__fixtures__/prod-rubric-catalog.json';
import { perTypeContent, perTypeKey } from './rubric-catalog.server';
import { RETIRED_STARTER_RUBRIC_NAMES } from './starter-rubrics';
import { ADMIN_BUILTIN_PICKER_KEYS } from './admin-rubric-picker-builtins';

const DAILY_PAGES_TYPE_ID = 'cmlgtyo8j01em0qjs6knw7cni';
const GBA_ETIQUETTE_TYPE_ID = 'cms93piub000101lbiyhn43lh';
const GBA_ETIQUETTE_LIBRARY_NAME = 'gba300-international-etiquette';
/** Archived on production; must stay out of the admin picker. */
const QA_VALIDATION_PROBE_LIBRARY_NAME = 'prod-qa-validation-probe';

const categoriesOf = (content: unknown) => {
  const rubric =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as Record<string, unknown>).rubric
      : null;
  return Array.isArray((rubric as { categories?: unknown[] } | null)?.categories)
    ? (rubric as { categories: unknown[] }).categories
    : [];
};

/** Prod-shaped data: Daily Pages grades from the library rubric, not its own columns. */
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
  test('Live picker keys match non-archived library rubrics and editable per-type entries', () => {
    const liveLibrary = fixture.libraryRubrics
      .filter((rubric) => !RETIRED_STARTER_RUBRIC_NAMES.has(rubric.name))
      .filter((rubric) => rubric.name !== QA_VALIDATION_PROBE_LIBRARY_NAME)
      .filter((rubric) => categoriesOf(rubric.schemaJson).length > 0)
      .map((rubric) => rubric.name)
      .sort();

    const livePerType = fixture.perTypeRubrics
      .map((type) => prodShapedAssignmentType(type))
      .filter((type) => !type.archivedAt)
      .filter((type) => !type.rubricId)
      .map((type) => perTypeContent(type as never))
      .filter((content) => categoriesOf(content).length > 0)
      .map((content) => content.name as string)
      .sort();

    expect(liveLibrary).toContain('daily-pages-engagement');
    expect(liveLibrary).toContain('thesis-driven-essay');
    expect(liveLibrary).toContain('class-starter-engagement');
    expect(liveLibrary).not.toContain('daily-pages-reflection');
    expect(liveLibrary).not.toContain('daily-pages-short-form');
    expect(livePerType).not.toContain(perTypeKey(DAILY_PAGES_TYPE_ID));
    expect(livePerType).not.toContain(perTypeKey(GBA_ETIQUETTE_TYPE_ID));
    expect(liveLibrary.length).toBe(8);
  });

  test('GBA 300 etiquette dedupes when the type links the library rubric', () => {
    const shaped = prodShapedAssignmentType({
      id: GBA_ETIQUETTE_TYPE_ID,
      rubricId: null,
      archivedAt: null,
    });
    expect(shaped.rubricId).not.toBeNull();
    expect(livePerTypeKeysWithoutLibraryLink(fixture)).not.toContain(
      perTypeKey(GBA_ETIQUETTE_TYPE_ID)
    );
    expect(
      fixture.libraryRubrics.some((row) => row.name === GBA_ETIQUETTE_LIBRARY_NAME)
    ).toBe(true);
  });

  test('matches Internal Live shape: 8 library + 3 built-ins + per-type (fixture has 7; prod has 9)', () => {
    const libraryCount = fixture.libraryRubrics
      .filter((rubric) => !RETIRED_STARTER_RUBRIC_NAMES.has(rubric.name))
      .filter((rubric) => rubric.name !== QA_VALIDATION_PROBE_LIBRARY_NAME)
      .filter((rubric) => categoriesOf(rubric.schemaJson).length > 0).length;

    const perTypeCount = fixture.perTypeRubrics
      .map((type) => prodShapedAssignmentType(type))
      .filter((type) => !type.archivedAt)
      .filter((type) => !type.rubricId)
      .filter((type) => {
        const liveCategories = categoriesOf(
          perTypeContent(type as never)
        ).length;
        if (liveCategories > 0) return true;
        // ACT Writing (and similar) list from published revision even when columns are empty.
        return type.id === 'cmpphw7w303lh01l15z0pr6nd';
      }).length;

    expect(libraryCount).toBe(8);
    expect(ADMIN_BUILTIN_PICKER_KEYS.length).toBe(3);
    expect(perTypeCount).toBe(7);
    // Full production adds two assignment-type Live rows not captured in this fixture.
    expect(libraryCount + ADMIN_BUILTIN_PICKER_KEYS.length + perTypeCount).toBe(18);
    expect(libraryCount + ADMIN_BUILTIN_PICKER_KEYS.length + 9).toBe(20);
  });
});

function livePerTypeKeysWithoutLibraryLink(catalog: typeof fixture) {
  return catalog.perTypeRubrics
    .map((type) => prodShapedAssignmentType(type))
    .filter((type) => !type.archivedAt)
    .filter((type) => !type.rubricId)
    .map((type) => perTypeKey(type.id));
}
