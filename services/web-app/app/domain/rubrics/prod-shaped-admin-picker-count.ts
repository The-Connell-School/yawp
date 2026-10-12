import fixture from './__fixtures__/prod-rubric-catalog.json';
import { perTypeContent, perTypeKey } from './rubric-catalog.server';
import { RETIRED_STARTER_RUBRIC_NAMES } from './starter-rubrics';

/** Reviewed production-shaped admin picker total (8 library + 8 per-type Live). */
export const PROD_SHAPED_ADMIN_PICKER_COUNT = 16;

const DAILY_PAGES_TYPE_ID = 'cmlgtyo8j01em0qjs6knw7cni';
const GBA_ETIQUETTE_TYPE_ID = 'cms93piub000101lbiyhn43lh';
const ACT_WRITING_TYPE_ID = 'cmpphw7w303lh01l15z0pr6nd';
export const QA_VALIDATION_PROBE_LIBRARY_NAME = 'prod-qa-validation-probe';

const categoriesOf = (content: unknown): unknown[] => {
  const rubric =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as Record<string, unknown>).rubric
      : null;
  return Array.isArray((rubric as { categories?: unknown[] } | null)?.categories)
    ? (rubric as { categories: unknown[] }).categories
    : [];
};

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

/** Keys documented in the prod rubric catalog fixture (subset of production). */
export function prodShapedPickerKeysFromFixture(): string[] {
  const library = fixture.libraryRubrics
    .filter((rubric) => !RETIRED_STARTER_RUBRIC_NAMES.has(rubric.name))
    .filter((rubric) => rubric.name !== QA_VALIDATION_PROBE_LIBRARY_NAME)
    .filter((rubric) => categoriesOf(rubric.schemaJson).length > 0)
    .map((rubric) => rubric.name);

  const perType = fixture.perTypeRubrics
    .map((type) => prodShapedAssignmentType(type))
    .filter((type) => !type.archivedAt)
    .filter((type) => !type.rubricId)
    .filter((type) => type.id !== ACT_WRITING_TYPE_ID)
    .map((type) => perTypeContent(type as never))
    .filter((content) => categoriesOf(content).length > 0)
    .map((content) => content.name as string);

  return [...library, ...perType].sort();
}
