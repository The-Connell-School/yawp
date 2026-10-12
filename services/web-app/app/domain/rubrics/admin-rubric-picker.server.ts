import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { perTypeKey } from './rubric-catalog.server';
import {
  formatRubricSchema,
  parseRubricSchema,
} from './rubric-schema';

/** Value stored in the assignment-type editor `rubricId` field for a released per-type catalog entry. */
export const ADMIN_PER_TYPE_PICKER_PREFIX = 'assignment-type:';

export type AdminRubricPickerOption = {
  id: string;
  catalogKey: string;
  name: string;
  title: string;
  json: string;
  source: 'library' | 'assignment-type';
};

export type PerTypeReleasedAssignmentTypeColumns = {
  rubricId: null;
  scoringScaleJson: Prisma.InputJsonValue;
  rubricJson: Prisma.InputJsonValue;
  gradingPromptConfigJson: Prisma.InputJsonValue;
  gradingOutputSchemaJson: Prisma.InputJsonValue;
  gradingCalibrationNotes: string | null;
};

export type ResolvedAdminRubricPickerSelection =
  | { kind: 'none' }
  | { kind: 'library'; rubricId: string; catalogKey: string }
  | {
      kind: 'per-type';
      catalogKey: string;
      assignmentTypeData: PerTypeReleasedAssignmentTypeColumns;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function formatReleasedSchema(schemaJson: unknown): string | null {
  const parsed = parseRubricSchema(schemaJson);
  if (!parsed.ok) return null;
  return formatRubricSchema(parsed.schema);
}

function columnsFromReleasedSchema(
  schemaJson: unknown
): PerTypeReleasedAssignmentTypeColumns {
  const record = isRecord(schemaJson) ? schemaJson : {};
  const rubric = isRecord(record.rubric) ? record.rubric : {};
  const promptConfig = isRecord(record.promptConfig) ? record.promptConfig : {};
  const outputSchema = isRecord(record.outputSchema) ? record.outputSchema : {};
  return {
    rubricId: null,
    scoringScaleJson: (record.scoringScale ?? {}) as Prisma.InputJsonValue,
    rubricJson: rubric as Prisma.InputJsonValue,
    gradingPromptConfigJson: promptConfig as Prisma.InputJsonValue,
    gradingOutputSchemaJson: outputSchema as Prisma.InputJsonValue,
    gradingCalibrationNotes:
      typeof record.calibrationNotes === 'string' ? record.calibrationNotes : null,
  };
}

/**
 * Lists every rubric Yawp Internal shows as Live: shared library rubrics and
 * per-assignment-type catalog entries with a `RubricRelease`, using each
 * release's revision content (not the mutable live row).
 */
export async function listReleasedRubricsForAdminPicker(
  db: Pick<
    typeof prisma,
    'rubricRelease' | 'rubric' | 'assignmentType'
  > = prisma
): Promise<AdminRubricPickerOption[]> {
  const releases = await db.rubricRelease.findMany({
    select: {
      catalogKey: true,
      rubricRevision: { select: { schemaJson: true } },
    },
  });

  const libraryKeys = new Set<string>();
  const perTypeIds = new Set<string>();
  for (const release of releases) {
    if (release.catalogKey.startsWith(ADMIN_PER_TYPE_PICKER_PREFIX)) {
      perTypeIds.add(release.catalogKey.slice(ADMIN_PER_TYPE_PICKER_PREFIX.length));
    } else {
      libraryKeys.add(release.catalogKey);
    }
  }

  const [libraryRows, perTypeRows] = await Promise.all([
    libraryKeys.size
      ? db.rubric.findMany({
          where: { name: { in: [...libraryKeys] }, archivedAt: null },
          select: { id: true, name: true, title: true },
        })
      : [],
    perTypeIds.size
      ? db.assignmentType.findMany({
          where: {
            id: { in: [...perTypeIds] },
            archivedAt: null,
            rubricId: null,
          },
          select: {
            id: true,
            title: true,
            rubricJson: true,
            scoringScaleJson: true,
          },
        })
      : [],
  ]);

  const releaseByKey = new Map(releases.map((row) => [row.catalogKey, row]));
  const options: AdminRubricPickerOption[] = [];

  for (const rubric of libraryRows) {
    const release = releaseByKey.get(rubric.name);
    if (!release) continue;
    const json = formatReleasedSchema(release.rubricRevision.schemaJson);
    if (!json) continue;
    options.push({
      id: rubric.id,
      catalogKey: rubric.name,
      name: rubric.name,
      title: rubric.title,
      json,
      source: 'library',
    });
  }

  for (const type of perTypeRows) {
    if (type.rubricJson === null && type.scoringScaleJson === null) continue;
    const catalogKey = perTypeKey(type.id);
    const release = releaseByKey.get(catalogKey);
    if (!release) continue;
    const json = formatReleasedSchema(release.rubricRevision.schemaJson);
    if (!json) continue;
    const parsed = parseRubricSchema(release.rubricRevision.schemaJson);
    const displayTitle =
      parsed.ok && parsed.schema.title
        ? parsed.schema.title
        : `${type.title ?? 'Assignment type'} (own rubric)`;
    options.push({
      id: catalogKey,
      catalogKey,
      name: catalogKey,
      title: displayTitle,
      json,
      source: 'assignment-type',
    });
  }

  return options.sort((a, b) => a.title.localeCompare(b.title));
}

export async function resolveAdminRubricPickerSelection(
  rawValue: string | null | undefined,
  db: Pick<typeof prisma, 'rubric' | 'rubricRelease'> = prisma
): Promise<ResolvedAdminRubricPickerSelection> {
  const trimmed = rawValue?.trim();
  if (!trimmed || trimmed === '__none__') return { kind: 'none' };

  if (trimmed.startsWith(ADMIN_PER_TYPE_PICKER_PREFIX)) {
    const catalogKey = trimmed;
    const release = await db.rubricRelease.findUnique({
      where: { catalogKey },
      select: { rubricRevision: { select: { schemaJson: true } } },
    });
    if (!release) {
      throw new Response('That rubric is no longer live. Choose another rubric.', {
        status: 400,
      });
    }
    return {
      kind: 'per-type',
      catalogKey,
      assignmentTypeData: columnsFromReleasedSchema(release.rubricRevision.schemaJson),
    };
  }

  const rubric = await db.rubric.findFirst({
    where: { id: trimmed, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!rubric) {
    throw new Response('That rubric no longer exists. Choose another rubric.', {
      status: 400,
    });
  }
  const release = await db.rubricRelease.findUnique({
    where: { catalogKey: rubric.name },
    select: { catalogKey: true },
  });
  if (!release) {
    throw new Response('That rubric is not live. Choose another rubric.', {
      status: 400,
    });
  }
  return { kind: 'library', rubricId: rubric.id, catalogKey: rubric.name };
}
