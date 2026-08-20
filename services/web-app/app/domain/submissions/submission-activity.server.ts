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

export class SubmissionActivityUnavailableError extends Error {
  constructor() {
    super('Submission activity recording is temporarily unavailable.');
  }
}

/** Prevents a platform admin membership from being linked across tenants. */
export function resolveSubmissionActivityActorMembershipId({
  actorMembershipId,
  actorOrganizationId,
  submissionOrganizationId,
}: {
  actorMembershipId: string;
  actorOrganizationId: string;
  submissionOrganizationId: string;
}) {
  return actorOrganizationId === submissionOrganizationId
    ? actorMembershipId
    : null;
}

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
        .sort(([left], [right]) => left.localeCompare(right))
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

/** Semantic equality used by both mutation no-op detection and audit diffs. */
export function submissionAuditValuesEqual(left: unknown, right: unknown) {
  return auditValuesEqual(toAuditJson(left), toAuditJson(right));
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
    actorUserId?: string | null;
    eventType: string;
    source: string;
    occurredAfterRelease: boolean;
    changes: SubmissionActivityChanges;
    metadata?: Prisma.InputJsonObject;
  }
) {
  // Audit-required mutations fail closed. The switch is an incident-response
  // brake for writes, not permission to commit unaudited changes: throwing
  // here rolls back the enclosing mutation transaction.
  if (process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED === 'false') {
    throw new SubmissionActivityUnavailableError();
  }

  if (Object.keys(input.changes).length === 0 && input.metadata == null) {
    return null;
  }

  const actor = input.actorUserId
    ? await tx.user.findUnique({
        where: { id: input.actorUserId },
        select: { name: true, email: true },
      })
    : null;

  return tx.submissionActivity.create({
    data: {
      submissionId: input.submissionId,
      organizationId: input.organizationId,
      actorMembershipId: input.actorMembershipId,
      actorType: actor ? 'human' : 'system',
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      eventType: input.eventType,
      source: input.source,
      occurredAfterRelease: input.occurredAfterRelease,
      changes: input.changes,
      ...(input.metadata == null ? {} : { metadata: input.metadata }),
    },
  });
}

type SubmissionActivityInput = Parameters<typeof recordSubmissionActivity>[1];

/**
 * Records one transaction's homogeneous or mixed submission events with a
 * bounded query count. This is used by bulk release so the 500-item contract
 * does not turn into an actor lookup and insert for every submission.
 */
export async function recordSubmissionActivities(
  tx: Prisma.TransactionClient,
  inputs: SubmissionActivityInput[]
) {
  if (process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED === 'false') {
    throw new SubmissionActivityUnavailableError();
  }

  const auditableInputs = inputs.filter(
    (input) => Object.keys(input.changes).length > 0 || input.metadata != null
  );
  if (auditableInputs.length === 0) return { count: 0 };

  const actorUserIds = Array.from(
    new Set(
      auditableInputs
        .map((input) => input.actorUserId)
        .filter((id): id is string => typeof id === 'string')
    )
  );
  const actors =
    actorUserIds.length > 0
      ? await tx.user.findMany({
          where: { id: { in: actorUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const actorByUserId = new Map(actors.map((actor) => [actor.id, actor]));

  return tx.submissionActivity.createMany({
    data: auditableInputs.map((input) => {
      const actor = input.actorUserId
        ? actorByUserId.get(input.actorUserId)
        : null;
      return {
        submissionId: input.submissionId,
        organizationId: input.organizationId,
        actorMembershipId: input.actorMembershipId,
        actorType: actor ? 'human' : 'system',
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        eventType: input.eventType,
        source: input.source,
        occurredAfterRelease: input.occurredAfterRelease,
        changes: input.changes,
        ...(input.metadata == null ? {} : { metadata: input.metadata }),
      };
    }),
  });
}
