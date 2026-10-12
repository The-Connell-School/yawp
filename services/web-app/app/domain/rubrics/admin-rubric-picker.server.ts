import type { Prisma, PrismaClient } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  ADMIN_BUILTIN_PICKER_PREFIX,
  fallbackBuiltinPublishedSchema,
  isAdminBuiltinPickerKey,
  libraryNameForAdminBuiltinPickerKey,
} from './admin-rubric-picker-builtins';
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

type PickerDb = Pick<PrismaClient, 'rubric' | 'assignmentType'>;

type PerTypePickerRow = {
  id: string;
  title: string | null;
  ownerOrg: { name: string } | null;
  schoolAssignments: { school: { name: string } }[];
  organizationAssignments: { organization: { name: string } }[];
};

const perTypePickerSelect = {
  id: true,
  title: true,
  ownerOrg: { select: { name: true } },
  schoolAssignments: {
    select: { school: { select: { name: true } } },
    orderBy: { school: { name: 'asc' as const } },
    take: 1,
  },
  organizationAssignments: {
    select: { organization: { select: { name: true } } },
    orderBy: { organization: { name: 'asc' as const } },
    take: 1,
  },
} satisfies Prisma.AssignmentTypeSelect;

function normalizePickerTitle(title: string) {
  return title.trim().toLowerCase();
}

export function shortAssignmentTypeIdForPicker(typeId: string) {
  if (typeId.length <= 16) return typeId;
  return typeId.slice(-16);
}

export function pickerOwnershipLabel(type: PerTypePickerRow): string {
  const school = type.schoolAssignments?.[0]?.school.name?.trim();
  if (school) return school;
  const org =
    type.ownerOrg?.name?.trim() ??
    type.organizationAssignments?.[0]?.organization.name?.trim();
  if (org) return org;
  return shortAssignmentTypeIdForPicker(type.id);
}

/** Keeps every option; duplicate display titles get a school/org suffix or type id. */
export function disambiguateAdminRubricPickerTitles(
  options: AdminRubricPickerOption[],
  ownershipByCatalogKey: Map<string, string>
): AdminRubricPickerOption[] {
  const sorted = [...options].sort((a, b) => a.title.localeCompare(b.title));
  const byNormalized = new Map<string, AdminRubricPickerOption[]>();
  for (const option of sorted) {
    const key = normalizePickerTitle(option.title);
    const group = byNormalized.get(key) ?? [];
    group.push(option);
    byNormalized.set(key, group);
  }

  const duplicateGroups = [...byNormalized.values()].filter((group) => group.length > 1);
  if (duplicateGroups.length) {
    console.warn('admin_rubric_picker_duplicate_titles', {
      titles: duplicateGroups.map((group) => group[0]?.title),
      catalogKeys: duplicateGroups.flatMap((group) =>
        group.map((option) => option.catalogKey)
      ),
    });
  }

  const used = new Set<string>();
  return sorted.map((option) => {
    const group = byNormalized.get(normalizePickerTitle(option.title)) ?? [option];
    if (group.length === 1) {
      used.add(normalizePickerTitle(option.title));
      return option;
    }

    const typeId = option.catalogKey.startsWith(ADMIN_PER_TYPE_PICKER_PREFIX)
      ? option.catalogKey.slice(ADMIN_PER_TYPE_PICKER_PREFIX.length)
      : option.name;
    const suffix =
      ownershipByCatalogKey.get(option.catalogKey) ??
      shortAssignmentTypeIdForPicker(typeId);

    let candidate = `${option.title} (${suffix})`;
    if (used.has(normalizePickerTitle(candidate))) {
      candidate = `${option.title} (${shortAssignmentTypeIdForPicker(typeId)})`;
    }
    used.add(normalizePickerTitle(candidate));
    return { ...option, title: candidate };
  });
}

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

async function publishedLibraryContentByName(
  db: PickerDb,
  names: string[]
): Promise<Map<string, unknown>> {
  if (!names.length) return new Map();
  const rows = await db.rubric.findMany({
    where: { name: { in: names } },
    select: {
      name: true,
      schemaJson: true,
      currentRevision: { select: { schemaJson: true } },
    },
  });
  return new Map(
    rows.map((row) => [
      row.name,
      row.currentRevision?.schemaJson ?? row.schemaJson,
    ])
  );
}

async function publishedPerTypeContentByTypeId(
  db: PickerDb,
  typeIds: string[]
): Promise<Map<string, unknown>> {
  if (!typeIds.length) return new Map();
  const types = await db.assignmentType.findMany({
    where: { id: { in: typeIds } },
    select: {
      id: true,
      title: true,
      scoringScaleJson: true,
      rubricJson: true,
      gradingPromptConfigJson: true,
      gradingOutputSchemaJson: true,
      gradingCalibrationNotes: true,
      rubricBaseline: {
        select: { rubricRevision: { select: { schemaJson: true } } },
      },
    },
  });
  const byTypeId = new Map<string, unknown>();
  for (const type of types) {
    const baseline = type.rubricBaseline?.rubricRevision?.schemaJson;
    const live = perTypeContent(type);
    byTypeId.set(type.id, baseline ?? live);
  }
  return byTypeId;
}

/**
 * Lists rubrics that match Yawp Internal's Live catalog view: every non-archived,
 * non-retired library rubric and every per-type entry with its own stored rubric,
 * using published library revisions and per-type baseline or live columns.
 */
export async function listLiveRubricsForAdminPicker(
  db: PickerDb = prisma
): Promise<AdminRubricPickerOption[]> {
  const catalog = await new RubricCatalog(db as PrismaClient).list();
  const catalogEntries = catalog.rubrics;

  const archivedLibrary = await db.rubric.findMany({
    where: { archivedAt: { not: null } },
    select: { name: true },
  });
  const archivedLibraryNames = new Set(archivedLibrary.map((row) => row.name));

  const libraryNames = catalogEntries
    .filter((entry) => entry.source === 'library')
    .map((entry) => entry.name);
  const perTypeIds = catalogEntries
    .filter((entry) => entry.source === 'assignment-type')
    .map((entry) => entry.key.slice(ADMIN_PER_TYPE_PICKER_PREFIX.length));

  const [publishedLibrary, publishedPerType] = await Promise.all([
    publishedLibraryContentByName(db, libraryNames),
    publishedPerTypeContentByTypeId(db, perTypeIds),
  ]);

  const libraryRows = await db.rubric.findMany({
    where: { name: { in: libraryNames } },
    select: { id: true, name: true, title: true },
  });
  const libraryByName = new Map(libraryRows.map((row) => [row.name, row]));

  const perTypeRows: PerTypePickerRow[] = perTypeIds.length
    ? await db.assignmentType.findMany({
        where: { id: { in: perTypeIds }, archivedAt: null, rubricId: null },
        select: perTypePickerSelect,
      })
    : [];
  const perTypeById = new Map(perTypeRows.map((row) => [row.id, row]));
  const ownershipByCatalogKey = new Map(
    perTypeRows.map((row) => [perTypeKey(row.id), pickerOwnershipLabel(row)])
  );

  const options: AdminRubricPickerOption[] = [];

  for (const entry of catalogEntries) {
    if (entry.source === 'library') {
      if (archivedLibraryNames.has(entry.name)) continue;
      if (RETIRED_STARTER_RUBRIC_NAMES.has(entry.name)) continue;
      const rubric = libraryByName.get(entry.name);
      if (!rubric) continue;
      const content = publishedLibrary.get(entry.name);
      if (!content || !categoriesOf(content).length) continue;
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
    const content = publishedPerType.get(typeId);
    if (!content || !categoriesOf(content).length) continue;
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

  return disambiguateAdminRubricPickerTitles(options, ownershipByCatalogKey);
}

export { ADMIN_BUILTIN_PICKER_PREFIX } from './admin-rubric-picker-builtins';

/** @deprecated Use listLiveRubricsForAdminPicker */
export const listReleasedRubricsForAdminPicker = listLiveRubricsForAdminPicker;

export async function resolveAdminRubricPickerSelection(
  rawValue: string | null | undefined,
  db: PickerDb = prisma
): Promise<ResolvedAdminRubricPickerSelection> {
  const trimmed = rawValue?.trim();
  if (!trimmed || trimmed === '__none__') return { kind: 'none' };

  if (isAdminBuiltinPickerKey(trimmed)) {
    const libraryName = libraryNameForAdminBuiltinPickerKey(trimmed);
    const rubric = await db.rubric.findFirst({
      where: { name: libraryName, archivedAt: null },
      select: {
        id: true,
        name: true,
        schemaJson: true,
        currentRevision: { select: { schemaJson: true } },
      },
    });
    const content =
      rubric?.currentRevision?.schemaJson ??
      rubric?.schemaJson ??
      fallbackBuiltinPublishedSchema(trimmed);
    if (!categoriesOf(content).length) {
      throw new Response('That rubric no longer exists. Choose another rubric.', {
        status: 400,
      });
    }
    if (!rubric) {
      throw new Response('That rubric no longer exists. Choose another rubric.', {
        status: 400,
      });
    }
    return { kind: 'library', rubricId: rubric.id, catalogKey: trimmed };
  }

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
        rubricBaseline: {
          select: { rubricRevision: { select: { schemaJson: true } } },
        },
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
    const baseline = type.rubricBaseline?.rubricRevision?.schemaJson;
    const content = baseline ?? perTypeContent(type);
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
    select: {
      id: true,
      name: true,
      schemaJson: true,
      currentRevision: { select: { schemaJson: true } },
    },
  });
  if (!rubric) {
    throw new Response('That rubric no longer exists. Choose another rubric.', {
      status: 400,
    });
  }
  const content = rubric.currentRevision?.schemaJson ?? rubric.schemaJson;
  if (!categoriesOf(content).length) {
    throw new Response('That rubric no longer exists. Choose another rubric.', {
      status: 400,
    });
  }
  return { kind: 'library', rubricId: rubric.id, catalogKey: rubric.name };
}
