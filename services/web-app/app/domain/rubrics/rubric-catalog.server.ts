import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@app/prisma';
import { validateRubricPromotion, type RubricValidationIssue } from './rubric-promotion';
import { STARTER_RUBRICS } from './starter-rubrics';

/**
 * The rubric catalog behind the internal app's rubric manager.
 *
 * Two kinds of rubric grade work in production:
 * - library rubrics (`Rubric` rows, chosen by an assignment type's `rubricId`)
 * - per-type rubrics (an assignment type's own grading JSON columns), whose
 *   immutable history lives in `RubricRevision` under `assignment-type:<id>`.
 *
 * Saving never edits history. It writes the live row; the database triggers
 * from 20260929034000_assignment_rubric_baseline_capture then append an
 * immutable `RubricRevision` and move the "current" pointer, so:
 * - assignments that already exist keep the revision they are pinned to;
 * - assignments created afterwards pin to the new revision (insert trigger).
 * Before the first save of content that no revision holds yet, the live
 * content is captured as its own revision and any unpinned assignments are
 * pinned to it, so the edit cannot move work that already exists.
 */

export const PROMPT_CONFIG_KEYS = [
  'systemInstructions', 'gradingInstructions', 'instructionsPreset', 'systemMessageTemplate',
  'userMessageTemplate', 'scoreInstructions', 'rubricInstructions',
] as const;
const PER_TYPE_PREFIX = 'assignment-type:';
const LIBRARY_NAME = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;
const TYPE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const STARTER_NAMES = new Set(STARTER_RUBRICS.map((rubric) => rubric.name));

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
export const contentFingerprint = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const sameContent = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export type CatalogKey = { source: 'library'; name: string } | { source: 'assignment-type'; assignmentTypeId: string };
export function parseCatalogKey(raw: unknown): CatalogKey | null {
  if (typeof raw !== 'string' || raw.length > 160) return null;
  if (raw.startsWith(PER_TYPE_PREFIX)) {
    const id = raw.slice(PER_TYPE_PREFIX.length);
    return TYPE_ID.test(id) ? { source: 'assignment-type', assignmentTypeId: id } : null;
  }
  return raw.length <= 120 && LIBRARY_NAME.test(raw) ? { source: 'library', name: raw } : null;
}
export const perTypeKey = (assignmentTypeId: string) => `${PER_TYPE_PREFIX}${assignmentTypeId}`;

type TypeColumns = {
  id: string; title: string | null; scoringScaleJson: unknown; rubricJson: unknown;
  gradingPromptConfigJson: unknown; gradingOutputSchemaJson: unknown; gradingCalibrationNotes: string | null;
};
/** Mirrors the jsonb_build_object in the per-type baseline trigger exactly. */
export function perTypeContent(type: TypeColumns): JsonRecord {
  const name = perTypeKey(type.id);
  return {
    name, title: type.title ?? name,
    scoringScale: type.scoringScaleJson ?? {}, rubric: type.rubricJson ?? {},
    promptConfig: type.gradingPromptConfigJson ?? {}, outputSchema: type.gradingOutputSchemaJson ?? {},
    calibrationNotes: type.gradingCalibrationNotes ?? null,
  };
}

const categoriesOf = (content: unknown): unknown[] => {
  const rubric = isRecord(content) ? content.rubric : null;
  return isRecord(rubric) && Array.isArray(rubric.categories) ? rubric.categories : [];
};
function scaleOf(content: unknown) {
  const scale = isRecord(content) ? content.scoringScale : null;
  if (!isRecord(scale) || typeof scale.minScore !== 'number' || typeof scale.maxScore !== 'number') return null;
  return {
    type: typeof scale.type === 'string' ? scale.type : '', minScore: scale.minScore, maxScore: scale.maxScore,
    ...(typeof scale.step === 'number' ? { step: scale.step } : {}),
    ...(typeof scale.compositeMin === 'number' ? { compositeMin: scale.compositeMin } : {}),
    ...(typeof scale.compositeMax === 'number' ? { compositeMax: scale.compositeMax } : {}),
  };
}

/**
 * The part of the stored content an operator edits. Prompt-config keys outside
 * the strict write schema (for example a per-type grading instructions
 * override) are not editable here and are carried over untouched on save.
 */
export function toEditable(content: JsonRecord, displayName: string) {
  const promptConfig = isRecord(content.promptConfig) ? content.promptConfig : {};
  const keep = Object.fromEntries(Object.entries(promptConfig).filter(([key]) => (PROMPT_CONFIG_KEYS as readonly string[]).includes(key)));
  const scale = isRecord(content.scoringScale) && Object.keys(content.scoringScale).length ? content.scoringScale : undefined;
  const outputSchema = isRecord(content.outputSchema) && Object.keys(content.outputSchema).length ? content.outputSchema : undefined;
  const editable: JsonRecord = {
    name: displayName, title: typeof content.title === 'string' ? content.title : displayName,
    ...(scale ? { scoringScale: clone(scale) } : {}),
    rubric: { categories: clone(categoriesOf(content)) },
    ...(Object.keys(keep).length ? { promptConfig: clone(keep) } : {}),
    ...(outputSchema ? { outputSchema: clone(outputSchema) } : {}),
    calibrationNotes: typeof content.calibrationNotes === 'string' ? content.calibrationNotes : null,
  };
  const preservedPromptConfigKeys = Object.keys(promptConfig).filter((key) => !(PROMPT_CONFIG_KEYS as readonly string[]).includes(key));
  const preservedTopLevelKeys = Object.keys(content).filter((key) => !['name', 'title', 'scoringScale', 'rubric', 'promptConfig', 'outputSchema', 'calibrationNotes'].includes(key));
  return { editable, preservedPromptConfigKeys, preservedTopLevelKeys };
}

/** Validates an operator's document with the same strict boundary as publication. */
export function validateEditable(document: unknown, validationName: string) {
  if (!isRecord(document)) return { ok: false as const, issues: [{ path: '/', message: 'Provide the rubric as a JSON object.' }] };
  return validateRubricPromotion({ ...document, name: validationName });
}

export class CatalogError extends Error {
  constructor(message: string, readonly statusCode: number, readonly issues?: RubricValidationIssue[]) { super(message); }
}

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export type SaveInput = {
  key: string; requestId: string; actorEmail: string; reason: string;
  expectedFingerprint: string; document: unknown;
};

const revisionSelect = { id: true, rubricName: true, version: true, schemaJson: true, fingerprint: true, createdBy: true, reason: true, createdAt: true, requestId: true, requestHash: true } as const;
type RevisionRow = { id: string; rubricName: string; version: number; schemaJson: unknown; fingerprint: string; createdBy: string; reason: string; createdAt: Date; requestId: string; requestHash: string };

// Code-seeded library rubrics are editable here: seedStarterRubrics only creates
// missing rows and never overwrites an existing one, and every save is an
// immutable revision. The catalog flags them so the operator knows the code
// carries the original definition.
function readOnlyReason(source: 'library' | 'assignment-type', _name: string, content: unknown, linkedLibrary?: string | null): string | null {
  if (source === 'assignment-type' && linkedLibrary) return `This assignment type grades with the library rubric "${linkedLibrary}"; edit that rubric instead.`;
  if (!categoriesOf(content).length) return 'No categories are stored, so this type grades with the built-in default rubric for its kind.';
  return null;
}

export class RubricCatalog {
  constructor(private db: Db) {}

  async list() {
    const [rubrics, revisions, types, pinCounts, recent] = await Promise.all([
      this.db.rubric.findMany({ orderBy: { title: 'asc' }, select: { id: true, name: true, title: true, schemaJson: true, currentRevisionId: true, createdAt: true, updatedAt: true } }),
      this.db.rubricRevision.findMany({ select: revisionSelect, orderBy: [{ rubricName: 'asc' }, { version: 'asc' }] }),
      this.db.assignmentType.findMany({
        orderBy: [{ position: 'asc' }, { title: 'asc' }],
        select: {
          id: true, title: true, kind: true, systemKey: true, archivedAt: true, ownerOrgId: true, ownerMembershipId: true, rubricId: true,
          scoringScaleJson: true, rubricJson: true, gradingPromptConfigJson: true, gradingOutputSchemaJson: true, gradingCalibrationNotes: true,
          rubricBaseline: { select: { rubricRevisionId: true } },
          organizationAssignments: { select: { organization: { select: { id: true, name: true } } } },
          _count: { select: { assignments: true, schoolAssignments: true, teacherAssignments: true } },
        },
      }),
      this.db.assignment.groupBy({ by: ['assignmentTypeId', 'rubricRevisionId'], _count: { _all: true } }),
      this.db.assignment.groupBy({ by: ['assignmentTypeId'], where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _count: { _all: true } }),
    ]);
    const revisionsByName = new Map<string, RevisionRow[]>();
    for (const revision of revisions as RevisionRow[]) {
      const list = revisionsByName.get(revision.rubricName) ?? [];
      list.push(revision); revisionsByName.set(revision.rubricName, list);
    }
    const recentByType = new Map(recent.map((row) => [row.assignmentTypeId, row._count._all]));
    const pinsByType = new Map<string, { revisionId: string | null; count: number }[]>();
    for (const row of pinCounts) {
      const list = pinsByType.get(row.assignmentTypeId) ?? [];
      list.push({ revisionId: row.rubricRevisionId, count: row._count._all }); pinsByType.set(row.assignmentTypeId, list);
    }
    const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));

    const summarize = (args: { key: string; source: 'library' | 'assignment-type'; name: string; title: string; content: JsonRecord; currentRevisionId: string | null; fallbackEditedAt: Date | null; types: typeof types; linkedLibrary?: string | null }) => {
      const history = revisionsByName.get(args.name) ?? [];
      const current = history.find((revision) => revision.id === args.currentRevisionId && sameContent(revision.schemaJson, args.content))
        ?? [...history].reverse().find((revision) => sameContent(revision.schemaJson, args.content)) ?? null;
      const latest = history[history.length - 1] ?? null;
      const revisionIds = new Set(history.map((revision) => revision.id));
      let assignmentCount = 0, onCurrent = 0, onOlder = 0, unpinned = 0;
      for (const type of args.types) {
        for (const pin of pinsByType.get(type.id) ?? []) {
          assignmentCount += pin.count;
          if (!pin.revisionId) unpinned += pin.count;
          else if (current && pin.revisionId === current.id) onCurrent += pin.count;
          else if (revisionIds.has(pin.revisionId)) onOlder += pin.count;
        }
      }
      const organizations = new Map<string, string>();
      for (const type of args.types) for (const link of type.organizationAssignments) organizations.set(link.organization.id, link.organization.name);
      const reason = readOnlyReason(args.source, args.source === 'library' ? args.name : '', args.content, args.linkedLibrary);
      return {
        key: args.key, source: args.source, name: args.name, title: args.title,
        editable: reason === null, readOnlyReason: reason,
        seededFromCode: args.source === 'library' && STARTER_NAMES.has(args.name),
        currentVersion: current?.version ?? null, versionCount: history.length,
        liveMatchesVersion: current !== null,
        lastEditedAt: (latest?.createdAt ?? args.fallbackEditedAt)?.toISOString() ?? null,
        lastEditedBy: latest?.createdBy ?? null,
        categoryCount: categoriesOf(args.content).length, scale: scaleOf(args.content),
        assignmentTypes: args.types.map((type) => ({ id: type.id, title: type.title, archived: type.archivedAt !== null })),
        organizations: [...organizations].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        assignmentCount, assignmentsOnCurrentVersion: onCurrent, assignmentsOnOlderVersions: onOlder, assignmentsUnpinned: unpinned,
      };
    };

    const library = rubrics.map((rubric) => summarize({
      key: rubric.name, source: 'library', name: rubric.name, title: rubric.title,
      content: isRecord(rubric.schemaJson) ? rubric.schemaJson : {}, currentRevisionId: rubric.currentRevisionId,
      fallbackEditedAt: rubric.updatedAt, types: types.filter((type) => type.rubricId === rubric.id),
    }));
    const perType = types.filter((type) => !type.rubricId && (type.rubricJson !== null || type.scoringScaleJson !== null)).map((type) => summarize({
      key: perTypeKey(type.id), source: 'assignment-type', name: perTypeKey(type.id), title: type.title,
      content: perTypeContent(type), currentRevisionId: type.rubricBaseline?.rubricRevisionId ?? null,
      fallbackEditedAt: null, types: [type],
    }));
    const assignmentTypes = types.map((type) => {
      const library = type.rubricId ? rubricById.get(type.rubricId) ?? null : null;
      const perTypeStored = !library && (type.rubricJson !== null || type.scoringScaleJson !== null);
      return {
        id: type.id, title: type.title, kind: type.kind, systemKey: type.systemKey, archived: type.archivedAt !== null,
        ownerScoped: Boolean(type.ownerOrgId || type.ownerMembershipId),
        rubricSource: library ? 'library' : perTypeStored ? 'assignment-type' : 'built-in',
        rubricKey: library ? library.name : perTypeStored ? perTypeKey(type.id) : null,
        rubricTitle: library ? library.title : perTypeStored ? `${type.title} (own rubric)` : 'Built-in default',
        hasUnusedOwnRubricColumns: Boolean(library && type.rubricJson !== null),
        organizations: type.organizationAssignments.map((link) => ({ id: link.organization.id, name: link.organization.name })).sort((a, b) => a.name.localeCompare(b.name)),
        schoolCount: type._count.schoolAssignments, teacherCount: type._count.teacherAssignments,
        assignmentCount: type._count.assignments, assignmentsLast30Days: recentByType.get(type.id) ?? 0,
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      totals: { libraryRubrics: library.length, perTypeRubrics: perType.length, assignmentTypes: types.length, revisions: revisions.length },
      rubrics: [...library, ...perType],
      assignmentTypes,
    };
  }

  async get(rawKey: string) {
    const key = parseCatalogKey(rawKey);
    if (!key) throw new CatalogError('Unknown rubric', 404);
    const catalog = await this.list();
    const summary = catalog.rubrics.find((rubric) => rubric.key === rawKey);
    if (!summary) {
      if (key.source === 'assignment-type' && catalog.assignmentTypes.some((type) => type.id === key.assignmentTypeId)) throw new CatalogError('This assignment type has no rubric of its own', 404);
      throw new CatalogError('Unknown rubric', 404);
    }
    const content = await this.liveContent(this.db, key);
    if (!content) throw new CatalogError('Unknown rubric', 404);
    const revisions = await this.db.rubricRevision.findMany({ where: { rubricName: summary.name }, orderBy: { version: 'desc' }, select: revisionSelect }) as RevisionRow[];
    const pinCounts = await this.db.assignment.groupBy({ by: ['rubricRevisionId'], where: { rubricRevisionId: { in: revisions.map((revision) => revision.id) } }, _count: { _all: true } });
    const pins = new Map(pinCounts.map((row) => [row.rubricRevisionId, row._count._all]));
    const displayName = key.source === 'library' ? key.name : perTypeKey(key.assignmentTypeId);
    const { editable, preservedPromptConfigKeys, preservedTopLevelKeys } = toEditable(content.content, displayName);
    const validation = summary.editable ? validateEditable(editable, key.source === 'library' ? key.name : 'assignment-type-rubric') : null;
    return {
      rubric: summary,
      live: {
        fingerprint: contentFingerprint(content.content), content: content.content, editable,
        preservedPromptConfigKeys, preservedTopLevelKeys,
        validation: validation ? (validation.ok ? { ok: true, issues: [] } : { ok: false, issues: validation.issues }) : null,
      },
      revisions: revisions.map((revision) => ({
        id: revision.id, version: revision.version, createdAt: revision.createdAt.toISOString(), createdBy: revision.createdBy,
        reason: revision.reason, fingerprint: revision.fingerprint, content: revision.schemaJson,
        isCurrent: summary.currentVersion === revision.version, assignmentCount: pins.get(revision.id) ?? 0,
      })),
    };
  }

  private async liveContent(db: Db | Tx, key: CatalogKey) {
    if (key.source === 'library') {
      const row = await db.rubric.findUnique({ where: { name: key.name }, select: { id: true, name: true, title: true, schemaJson: true, currentRevisionId: true } });
      return row ? { content: isRecord(row.schemaJson) ? row.schemaJson : {}, library: row, type: null } : null;
    }
    const type = await db.assignmentType.findUnique({ where: { id: key.assignmentTypeId }, select: { id: true, title: true, rubricId: true, scoringScaleJson: true, rubricJson: true, gradingPromptConfigJson: true, gradingOutputSchemaJson: true, gradingCalibrationNotes: true, rubric: { select: { name: true } } } });
    if (!type || (type.rubricJson === null && type.scoringScaleJson === null)) return null;
    return { content: perTypeContent(type), library: null, type };
  }

  async save(input: SaveInput) {
    const key = parseCatalogKey(input.key);
    if (!key) throw new CatalogError('Unknown rubric', 404);
    const validationName = key.source === 'library' ? key.name : 'assignment-type-rubric';
    const validation = validateEditable(input.document, validationName);
    if (!validation.ok) throw new CatalogError('Rubric validation failed', 422, validation.issues);
    const document = clone(input.document) as JsonRecord;
    if (key.source === 'library' && document.name !== key.name) throw new CatalogError('The rubric name cannot change; it identifies the rubric across environments', 422, [{ path: '/name', message: 'The rubric name cannot change.' }]);
    const name = key.source === 'library' ? key.name : perTypeKey(key.assignmentTypeId);
    const requestHash = contentFingerprint({ key: input.key, expectedFingerprint: input.expectedFingerprint, document, reason: input.reason, actorEmail: input.actorEmail });

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rubric-request:${input.requestId}`}, 0))`;
      const replay = await tx.rubricRevision.findUnique({ where: { requestId: input.requestId }, select: revisionSelect });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new CatalogError('Request ID already used with different inputs', 409);
        return { revision: publicRevision(replay as RevisionRow), replayed: true, captured: null };
      }
      if (key.source === 'library') await tx.$queryRaw`SELECT id FROM "Rubric" WHERE name = ${key.name} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "AssignmentType" WHERE id = ${key.assignmentTypeId} FOR UPDATE`;
      const live = await this.liveContent(tx, key);
      if (!live) throw new CatalogError('Unknown rubric', 404);
      const reason = readOnlyReason(key.source, key.source === 'library' ? key.name : '', live.content, live.type?.rubric?.name ?? null);
      if (reason) throw new CatalogError(reason, 403);
      if (contentFingerprint(live.content) !== input.expectedFingerprint) throw new CatalogError('This rubric changed since you opened it. Reload to see the latest version, then reapply your edit.', 409);

      const livePrompt = isRecord(live.content.promptConfig) ? live.content.promptConfig : {};
      const preservedPrompt = Object.fromEntries(Object.entries(livePrompt).filter(([k]) => !(PROMPT_CONFIG_KEYS as readonly string[]).includes(k)));
      const editedPrompt = isRecord(document.promptConfig) ? document.promptConfig : {};
      const promptConfig = { ...preservedPrompt, ...editedPrompt };

      let next: JsonRecord;
      let typeUpdate: Prisma.AssignmentTypeUpdateInput | null = null;
      if (key.source === 'library') {
        const preservedTop = Object.fromEntries(Object.entries(live.content).filter(([k]) => !['name', 'title', 'scoringScale', 'rubric', 'promptConfig', 'outputSchema', 'calibrationNotes'].includes(k)));
        next = {
          ...preservedTop, name: key.name, title: String(document.title).trim(),
          ...(document.scoringScale !== undefined ? { scoringScale: document.scoringScale } : live.content.scoringScale !== undefined ? { scoringScale: live.content.scoringScale } : {}),
          rubric: document.rubric,
          ...(Object.keys(promptConfig).length || live.content.promptConfig !== undefined ? { promptConfig } : {}),
          ...(document.outputSchema !== undefined ? { outputSchema: document.outputSchema } : live.content.outputSchema !== undefined ? { outputSchema: live.content.outputSchema } : {}),
          calibrationNotes: typeof document.calibrationNotes === 'string' && document.calibrationNotes.trim() ? document.calibrationNotes : null,
        };
      } else {
        const type = live.type!;
        typeUpdate = {
          scoringScaleJson: (document.scoringScale ?? type.scoringScaleJson ?? undefined) as Prisma.InputJsonValue,
          rubricJson: document.rubric as Prisma.InputJsonValue,
          gradingPromptConfigJson: promptConfig as Prisma.InputJsonValue,
          gradingOutputSchemaJson: (document.outputSchema ?? type.gradingOutputSchemaJson ?? undefined) as Prisma.InputJsonValue,
          gradingCalibrationNotes: typeof document.calibrationNotes === 'string' && document.calibrationNotes.trim() ? document.calibrationNotes : null,
        };
        next = perTypeContent({ ...type, ...(typeUpdate as unknown as TypeColumns), id: type.id, title: type.title });
      }
      if (sameContent(next, live.content)) throw new CatalogError('No changes to save', 422, [{ path: '/', message: 'Nothing changed compared with the live rubric.' }]);

      // 1) Make sure the live content exists as an immutable revision, and pin
      //    any assignment that is not pinned yet to it, before anything moves.
      const history = await tx.rubricRevision.findMany({ where: { rubricName: name }, select: revisionSelect, orderBy: { version: 'asc' } }) as RevisionRow[];
      let baseline = [...history].reverse().find((revision) => sameContent(revision.schemaJson, live.content)) ?? null;
      let captured: ReturnType<typeof publicRevision> | null = null;
      if (!baseline) {
        const version = (history[history.length - 1]?.version ?? 0) + 1;
        baseline = await tx.rubricRevision.create({ select: revisionSelect, data: {
          id: randomUUID(), rubricName: name, version, schemaJson: live.content as Prisma.InputJsonObject,
          fingerprint: contentFingerprint(live.content), requestId: randomUUID(), requestHash: contentFingerprint(live.content),
          createdBy: 'capture-before-edit', reason: `Live content captured before ${input.actorEmail} saved a new version`,
        } }) as RevisionRow;
        captured = publicRevision(baseline);
      }
      if (key.source === 'library') {
        // The pin trigger only accepts a revision of the rubric's current
        // pointer, so point at the revision that holds the live content first.
        if (live.library!.currentRevisionId !== baseline.id) {
          await tx.rubric.update({ where: { id: live.library!.id }, data: { currentRevisionId: baseline.id } });
        }
        const typeIds = (await tx.assignmentType.findMany({ where: { rubricId: live.library!.id }, select: { id: true } })).map((t) => t.id);
        if (typeIds.length) await tx.assignment.updateMany({ where: { rubricRevisionId: null, assignmentTypeId: { in: typeIds } }, data: { rubricRevisionId: baseline.id } });
      } else {
        await tx.assignmentTypeRubricBaseline.upsert({ where: { assignmentTypeId: key.assignmentTypeId }, create: { assignmentTypeId: key.assignmentTypeId, rubricRevisionId: baseline.id }, update: { rubricRevisionId: baseline.id } });
        await tx.assignment.updateMany({ where: { rubricRevisionId: null, assignmentTypeId: key.assignmentTypeId }, data: { rubricRevisionId: baseline.id } });
      }

      // 2) Write the live row. The revision trigger records who and why.
      await tx.$executeRaw`SELECT set_config('yawp.rubric_revision_actor', ${input.actorEmail}, true), set_config('yawp.rubric_revision_reason', ${input.reason}, true), set_config('yawp.rubric_revision_request_id', ${input.requestId}, true), set_config('yawp.rubric_revision_request_hash', ${requestHash}, true)`;
      if (key.source === 'library') {
        await tx.rubric.update({ where: { id: live.library!.id }, data: { schemaJson: next as Prisma.InputJsonObject, title: String(next.title) } });
      } else {
        await tx.assignmentType.update({ where: { id: key.assignmentTypeId }, data: typeUpdate! });
      }
      const created = await tx.rubricRevision.findUnique({ where: { requestId: input.requestId }, select: revisionSelect });
      if (!created || !sameContent(created.schemaJson, next)) throw new CatalogError('Revision was not recorded', 500);
      return { revision: publicRevision(created as RevisionRow), replayed: false, captured };
    });
  }
}

function publicRevision(revision: RevisionRow) {
  return { id: revision.id, rubricName: revision.rubricName, version: revision.version, createdBy: revision.createdBy, reason: revision.reason, createdAt: revision.createdAt.toISOString(), fingerprint: revision.fingerprint };
}