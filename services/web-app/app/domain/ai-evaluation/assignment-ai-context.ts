import { createHash } from 'node:crypto';
import { z } from 'zod';

const JsonObjectSchema = z.record(z.string(), z.unknown());

const AssignmentAiContextSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  assignmentTypeId: z.string().min(1),
  assignmentPrompt: z.string(),
  assignmentTypeGradingVersion: z.number().int().positive(),
  rubricSnapshot: JsonObjectSchema,
  rubricHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptConfigSnapshot: JsonObjectSchema,
  outputSchemaSnapshot: JsonObjectSchema,
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type AssignmentAiContextSnapshot = z.infer<
  typeof AssignmentAiContextSnapshotSchema
>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function assignmentAiContextHash(
  snapshot: Omit<AssignmentAiContextSnapshot, 'contextHash'> | AssignmentAiContextSnapshot
) {
  const { contextHash: _ignored, ...content } = snapshot as AssignmentAiContextSnapshot;
  return sha256(content);
}

export function buildAssignmentAiContextSnapshot({
  assignmentTypeId,
  assignmentPrompt,
  gradingVersion,
  rubricSnapshot,
  promptConfigSnapshot,
  outputSchemaSnapshot,
}: {
  assignmentTypeId: string;
  assignmentPrompt: string;
  gradingVersion: number;
  rubricSnapshot: Record<string, unknown>;
  promptConfigSnapshot: Record<string, unknown>;
  outputSchemaSnapshot: Record<string, unknown>;
}): AssignmentAiContextSnapshot {
  const withoutContextHash = {
    schemaVersion: 1 as const,
    assignmentTypeId,
    assignmentPrompt,
    assignmentTypeGradingVersion: gradingVersion,
    rubricSnapshot,
    rubricHash: sha256(rubricSnapshot),
    promptConfigSnapshot,
    outputSchemaSnapshot,
  };
  return {
    ...withoutContextHash,
    contextHash: assignmentAiContextHash(withoutContextHash),
  };
}

export function parseAssignmentAiContextSnapshot(
  value: unknown,
  expected?: { assignmentTypeId?: string }
): AssignmentAiContextSnapshot | null {
  const parsed = AssignmentAiContextSnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  const snapshot = parsed.data;
  if (
    expected?.assignmentTypeId &&
    snapshot.assignmentTypeId !== expected.assignmentTypeId
  ) {
    return null;
  }
  if (snapshot.rubricHash !== sha256(snapshot.rubricSnapshot)) return null;
  if (snapshot.contextHash !== assignmentAiContextHash(snapshot)) return null;
  return snapshot;
}
