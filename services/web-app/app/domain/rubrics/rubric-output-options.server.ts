import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@app/prisma';
import {
  teacherNotesEnabled,
  withTeacherNotesEnabled,
} from '~/domain/grading/teacher-notes';
import {
  RubricCatalog,
  contentFingerprint,
  perTypeContent,
  perTypeKey,
  toEditable,
} from './rubric-catalog.server';

export type RubricOutputOptionsState = {
  catalogKey: string;
  teacherNotesEnabled: boolean;
  fingerprint: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function readOutputSchemaTeacherNotes(content: unknown): boolean {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return false;
  }
  return teacherNotesEnabled((content as Record<string, unknown>).outputSchema);
}

/** Live rubric output toggle for an assignment type — no catalog list scan. */
export async function readLiveRubricOutputOptionsForAssignmentType(
  db: PrismaClient,
  assignmentTypeId: string
): Promise<RubricOutputOptionsState | null> {
  const type = await db.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: {
      id: true,
      rubricId: true,
      rubricJson: true,
      scoringScaleJson: true,
      gradingOutputSchemaJson: true,
      gradingPromptConfigJson: true,
      gradingCalibrationNotes: true,
      rubric: { select: { name: true, schemaJson: true } },
    },
  });
  if (!type) return null;

  if (type.rubricId && type.rubric) {
    const content = isRecord(type.rubric.schemaJson) ? type.rubric.schemaJson : {};
    return {
      catalogKey: type.rubric.name,
      teacherNotesEnabled: readOutputSchemaTeacherNotes(content),
      fingerprint: contentFingerprint(content),
    };
  }

  if (type.rubricJson === null && type.scoringScaleJson === null) {
    return null;
  }

  const content = perTypeContent(type);
  const key = perTypeKey(type.id);
  return {
    catalogKey: key,
    teacherNotesEnabled: readOutputSchemaTeacherNotes(content),
    fingerprint: contentFingerprint(content),
  };
}

export async function resolveRubricOutputOptionsForAssignmentType(
  db: PrismaClient,
  assignmentTypeId: string
): Promise<RubricOutputOptionsState | null> {
  return readLiveRubricOutputOptionsForAssignmentType(db, assignmentTypeId);
}

export async function setRubricTeacherNotesEnabled(args: {
  db: PrismaClient;
  catalogKey: string;
  enabled: boolean;
  expectedFingerprint: string;
  actorEmail: string;
  requestId?: string;
}) {
  const catalog = new RubricCatalog(args.db);
  const detail = await catalog.get(args.catalogKey);
  const editable = structuredClone(detail.live.editable) as Record<
    string,
    unknown
  >;
  const currentOutput =
    editable.outputSchema && typeof editable.outputSchema === 'object'
      ? (editable.outputSchema as Record<string, unknown>)
      : {};
  editable.outputSchema = withTeacherNotesEnabled(currentOutput, args.enabled);

  const saved = await catalog.save({
    key: args.catalogKey,
    requestId: args.requestId ?? randomUUID(),
    actorEmail: args.actorEmail,
    reason: args.enabled
      ? 'Enable private teacher notes on grading output'
      : 'Disable private teacher notes on grading output',
    expectedFingerprint: args.expectedFingerprint,
    document: editable,
  });

  const nextContent = await catalog.get(args.catalogKey);
  return {
    revision: saved.revision,
    replayed: saved.replayed,
    teacherNotesEnabled: readOutputSchemaTeacherNotes(nextContent.live.content),
    fingerprint: nextContent.live.fingerprint,
  };
}

export function outputSchemaFingerprint(outputSchema: Record<string, unknown>) {
  return contentFingerprint({ outputSchema });
}

export { toEditable };
