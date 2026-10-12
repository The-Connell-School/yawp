import type { Prisma, PrismaClient } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  perTypeContent,
  perTypeKey,
  RubricCatalog,
} from './rubric-catalog.server';
import { RETIRED_STARTER_RUBRIC_NAMES } from './starter-rubrics';
import {
  formatRubricSchema,
  parseRubricSchema,
} from './rubric-schema';

/** Value stored in the assignment-type editor `rubricId` field for a per-type catalog entry. */
export const ADMIN_PER_TYPE_PICKER_PREFIX = 'assignment-type:';

export type AdminRubricPickerOption = {
  id: string;
  catalogKey: string;
  name: string;
  title: string;
  json: string;
  source: 'library' | 'assignment-type';
};

export type PerTypeLiveAssignmentTypeColumns = {
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
      assignmentTypeData: PerTypeLiveAssignmentTypeColumns;
    };

type CatalogListEntry = Awaited<ReturnType<RubricCatalog['list']>>['rubrics'][number];

type PickerDb = Pick<
  PrismaClient,
  'rubric' | 'rubricRelease' | 'assignmentType'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const categoriesOf = (content: unknown): unknown[] => {
  const rubric = isRecord(content) ? content.rubric : null;
  return isRecord(rubric) && Array.isArray(rubric.categories) ? rubric.categories : [];
};

function formatCatalogContent(schemaJson: unknown): string | null {
  const parsed = parseRubricSchema(schemaJson);
  if (!parsed.ok) return null;
  return formatRubricSchema(parsed.schema);
}

function columnsFromCatalogContent(
  schemaJson: unknown
): PerTypeLiveAssignmentTypeColumns {
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

async function releaseContentByKey(
  db: PickerDb,
  keys: string[]
): Promise<Map<string, unknown>> {
  if (!keys.length) return new Map();
  const releases = await db.rubricRelease.findMany({
    where: { catalogKey: { in: keys } },
    select: {
      catalogKey: true,
      rubricRevision: { select: { schemaJson: true } },
    },
  });
  return new Map(
    releases.map((row) => [row.catalogKey, row.rubricRevision.schemaJson])
  );
}

function pickerContent(
  catalogKey: string,
  liveContent: unknown,
  releaseByKey: Map<string, unknown>
) {
  return releaseByKey.get(catalogKey) ?? liveContent;
}

function isLiveCatalogEntry(entry: CatalogListEntry) {
  return entry.editable;
}

/**
 * Lists rubrics that match Yawp Internal's Live catalog view: every non-archived,
 * non-retired library rubric and every per-type entry with its own stored rubric,
 * using live row content (preferring a `RubricRelease` revision when present).
 */
export async function listLiveRubricsForAdminPicker(
  db: PickerDb = prisma
): Promise<AdminRubricPickerOption[]> {
  const catalog = await new RubricCatalog(db as PrismaClient).list();
  const liveEntries = catalog.rubrics.filter(isLiveCatalogEntry);
  const releaseByKey = await releaseContentByKey(
    db,
    liveEntries.map((entry) => entry.key)
  );

  const archivedLibrary = await db.rubric.findMany({
    where: { archivedAt: { not: null } },
    select: { name: true },
  });
  const archivedLibraryNames = new Set(archivedLibrary.map((row) => row.name));

  const libraryRows = await db.rubric.findMany({
    where: {
      name: {
        in: liveEntries
          .filter((entry) => entry.source === 'library')
          .map((entry) => entry.name),
      },
    },
    select: { id: true, name: true, title: true, schemaJson: true },
  });
  const libraryByName = new Map(libraryRows.map((row) => [row.name, row]));

  const perTypeIds = liveEntries
    .filter((entry) => entry.source === 'assignment-type')
    .map((entry) => entry.key.slice(ADMIN_PER_TYPE_PICKER_PREFIX.length));
  const perTypeRows = perTypeIds.length
    ? await db.assignmentType.findMany({
        where: { id: { in: perTypeIds }, archivedAt: null, rubricId: null },
        select: {
          id: true,
          title: true,
          scoringScaleJson: true,
          rubricJson: true,
          gradingPromptConfigJson: true,
          gradingOutputSchemaJson: true,
          gradingCalibrationNotes: true,
        },
      })
    : [];
  const perTypeById = new Map(perTypeRows.map((row) => [row.id, row]));

  const options: AdminRubricPickerOption[] = [];

  for (const entry of liveEntries) {
    if (entry.source === 'library') {
      if (archivedLibraryNames.has(entry.name)) continue;
      if (RETIRED_STARTER_RUBRIC_NAMES.has(entry.name)) continue;
      const rubric = libraryByName.get(entry.name);
      if (!rubric) continue;
      const content = pickerContent(
        entry.key,
        rubric.schemaJson,
        releaseByKey
      );
      const json = formatCatalogContent(content);
      if (!json) continue;
      options.push({
        id: rubric.id,
        catalogKey: entry.key,
        name: entry.name,
        title: rubric.title,
        json,
        source: 'library',
      });
      continue;
    }

    const typeId = entry.key.slice(ADMIN_PER_TYPE_PICKER_PREFIX.length);
    const type = perTypeById.get(typeId);
    if (!type) continue;
    const live = perTypeContent(type);
    const content = pickerContent(entry.key, live, releaseByKey);
    const json = formatCatalogContent(content);
    if (!json) continue;
    const parsed = parseRubricSchema(content);
    const displayTitle =
      parsed.ok && parsed.schema.title
        ? parsed.schema.title
        : `${type.title ?? 'Assignment type'} (own rubric)`;
    options.push({
      id: entry.key,
      catalogKey: entry.key,
      name: entry.key,
      title: displayTitle,
      json,
      source: 'assignment-type',
    });
  }

  return options.sort((a, b) => a.title.localeCompare(b.title));
}

/** @deprecated Use listLiveRubricsForAdminPicker */
export const listReleasedRubricsForAdminPicker = listLiveRubricsForAdminPicker;

export async function resolveAdminRubricPickerSelection(
  rawValue: string | null | undefined,
  db: PickerDb = prisma
): Promise<ResolvedAdminRubricPickerSelection> {
  const trimmed = rawValue?.trim();
  if (!trimmed || trimmed === '__none__') return { kind: 'none' };

  if (trimmed.startsWith(ADMIN_PER_TYPE_PICKER_PREFIX)) {
    const catalogKey = trimmed;
    const typeId = catalogKey.slice(ADMIN_PER_TYPE_PICKER_PREFIX.length);
    const type = await db.assignmentType.findUnique({
      where: { id: typeId },
      select: {
        id: true,
        archivedAt: true,
        rubricId: true,
        title: true,
        scoringScaleJson: true,
        rubricJson: true,
        gradingPromptConfigJson: true,
        gradingOutputSchemaJson: true,
        gradingCalibrationNotes: true,
      },
    });
    if (!type || type.archivedAt) {
      throw new Response('That rubric no longer exists. Choose another rubric.', {
        status: 400,
      });
    }
    if (type.rubricId) {
      throw new Response('That rubric no longer exists. Choose another rubric.', {
        status: 400,
      });
    }
    if (type.rubricJson === null && type.scoringScaleJson === null) {
      throw new Response('That rubric no longer exists. Choose another rubric.', {
        status: 400,
      });
    }
    const releaseByKey = await releaseContentByKey(db, [catalogKey]);
    const content = pickerContent(catalogKey, perTypeContent(type), releaseByKey);
    if (!categoriesOf(content).length) {
      throw new Response('That rubric no longer exists. Choose another rubric.', {
        status: 400,
      });
    }
    return {
      kind: 'per-type',
      catalogKey,
      assignmentTypeData: columnsFromCatalogContent(content),
    };
  }

  const rubric = await db.rubric.findFirst({
    where: {
      id: trimmed,
      archivedAt: null,
      name: { notIn: [...RETIRED_STARTER_RUBRIC_NAMES] },
    },
    select: { id: true, name: true, schemaJson: true },
  });
  if (!rubric) {
    throw new Response('That rubric no longer exists. Choose another rubric.', {
      status: 400,
    });
  }
  const releaseByKey = await releaseContentByKey(db, [rubric.name]);
  const content = pickerContent(rubric.name, rubric.schemaJson, releaseByKey);
  if (!categoriesOf(content).length) {
    throw new Response('That rubric no longer exists. Choose another rubric.', {
      status: 400,
    });
  }
  return { kind: 'library', rubricId: rubric.id, catalogKey: rubric.name };
}
