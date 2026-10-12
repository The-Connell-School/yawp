import { describe, expect, test } from 'bun:test';
import fixture from './__fixtures__/prod-rubric-catalog.json';
import { perTypeContent, perTypeKey } from './rubric-catalog.server';
import { RETIRED_STARTER_RUBRIC_NAMES } from './starter-rubrics';

const DAILY_PAGES_TYPE_ID = 'cmlgtyo8j01em0qjs6knw7cni';

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
  return type;
}

describe('prod-shaped catalog acceptance', () => {
  test('Live picker keys match non-archived library rubrics and editable per-type entries', () => {
    const liveLibrary = fixture.libraryRubrics
      .filter((rubric) => !RETIRED_STARTER_RUBRIC_NAMES.has(rubric.name))
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
    expect(liveLibrary.length).toBe(8);
  });
});
