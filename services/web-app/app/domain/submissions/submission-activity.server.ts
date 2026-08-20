import { createHash } from 'node:crypto';
import type { Prisma } from '@app/prisma';

export const submissionActivityEventTypes = {
  created: 'submission.created',
  titleUpdated: 'submission.title_updated',
  bodyUpdated: 'submission.body_updated',
  gradeUpdated: 'submission.grade_updated',
  gradeFinalized: 'submission.grade_finalized',
  gradeReleased: 'submission.grade_released',
  gradingAssistantUpdated: 'submission.grading_assistant_updated',
  commentCreated: 'submission.comment_created',
  commentUpdated: 'submission.comment_updated',
  commentDeleted: 'submission.comment_deleted',
  unsubmitted: 'submission.unsubmitted',
} as const;

export const auditableSubmissionFields = [
  'title',
  'score',
  'feedback',
  'rubricScores',
  'overallScore',
  'overallComment',
  'numericPercentage',
  'letterGrade',
  'grammarIssues',
  'gradedAt',
  'gradedByMembershipId',
  'releasedAt',
  'unsubmittedAt',
  'unsubmittedByMembershipId',
] as const;

export type SubmissionActivityChanges = Record<
  string,
  {
    before: Prisma.InputJsonValue | null;
    after: Prisma.InputJsonValue | null;
  }
>;

function toAuditJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return value.map(toAuditJson) as Prisma.InputJsonArray;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, toAuditJson(entry)])
    ) as Prisma.InputJsonObject;
  }
  return String(value);
}

function auditValuesEqual(
  left: Prisma.InputJsonValue | null,
  right: Prisma.InputJsonValue | null
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildSubmissionActivityChanges({
  before,
  after,
  fields = auditableSubmissionFields,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fields?: readonly string[];
}): SubmissionActivityChanges {
  const changes: SubmissionActivityChanges = {};
  for (const field of fields) {
    const previous = toAuditJson(before[field]);
    const next = toAuditJson(after[field]);
    if (!auditValuesEqual(previous, next)) {
      changes[field] = { before: previous, after: next };
    }
  }
  return changes;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** Body evidence is intentionally irreversible and bounded. */
export function buildSubmissionBodyAuditMetadata({
  text,
  html,
}: {
  text: string;
  html: string;
}) {
  return {
    text: { length: text.length, sha256: hash(text) },
    html: { length: html.length, sha256: hash(html) },
  } satisfies Prisma.InputJsonObject;
}

export async function recordSubmissionActivity(
  tx: Prisma.TransactionClient,
  input: {
    submissionId: string;
    organizationId: string;
    actorMembershipId: string | null;
    eventType: string;
    source: string;
    occurredAfterRelease: boolean;
    changes: SubmissionActivityChanges;
    metadata?: Prisma.InputJsonObject;
  }
) {
  if (Object.keys(input.changes).length === 0 && input.metadata == null) {
    return null;
  }

  return tx.submissionActivity.create({
    data: {
      submissionId: input.submissionId,
      organizationId: input.organizationId,
      actorMembershipId: input.actorMembershipId,
      eventType: input.eventType,
      source: input.source,
      occurredAfterRelease: input.occurredAfterRelease,
      changes: input.changes,
      ...(input.metadata == null ? {} : { metadata: input.metadata }),
    },
  });
}
