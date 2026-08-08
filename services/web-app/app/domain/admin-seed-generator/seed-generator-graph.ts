import type {
  SeedCommitProposal,
  SeedNodeKind,
  SeedNodeReviewStatus,
} from './seed-generator-schema';

export type PersistedSeedGeneratorNode = {
  localId: string;
  kind: SeedNodeKind;
  parentLocalId: string | null;
  status: SeedNodeReviewStatus;
  committedEntityId: string | null;
  data: Record<string, unknown>;
};

function isDependencyIncluded(status: SeedNodeReviewStatus) {
  return status === 'approved' || status === 'committed';
}

function requiredString(
  data: Record<string, unknown>,
  key: string,
  localId: string
) {
  const value = data[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Seed node "${localId}" is missing ${key}.`);
  }
  return value;
}

/**
 * Find the full application-level dependency closure for a rejected node.
 * `parentLocalId` covers the primary tree; a document's studentLocalId is the
 * second DAG edge that lets rejecting a student also reject their writing.
 */
export function collectCascadeLocalIds(
  nodes: PersistedSeedGeneratorNode[],
  rootLocalId: string
): Set<string> {
  const rejected = new Set([rootLocalId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const studentLocalId =
        node.kind === 'document' && typeof node.data.studentLocalId === 'string'
          ? node.data.studentLocalId
          : null;
      if (
        !rejected.has(node.localId) &&
        ((node.parentLocalId != null && rejected.has(node.parentLocalId)) ||
          (studentLocalId != null && rejected.has(studentLocalId)))
      ) {
        rejected.add(node.localId);
        changed = true;
      }
    }
  }
  return rejected;
}

/**
 * Convert the durable graph to the backwards-compatible transactional writer
 * contract. Committed dependencies carry their real ids forward; proposed
 * entities keep their thread-local ids until the writer returns an id map.
 */
export function seedGraphToCommitProposal(
  nodes: PersistedSeedGeneratorNode[]
): SeedCommitProposal {
  const byLocalId = new Map(nodes.map((node) => [node.localId, node]));
  const classes = nodes.filter((node) => node.kind === 'class');
  const assignments = nodes.filter((node) => node.kind === 'assignment');
  const students = nodes.filter((node) => node.kind === 'student');
  const documents = nodes.filter((node) => node.kind === 'document');
  const submissions = nodes.filter((node) => node.kind === 'submission');
  const pendingDocumentIds = new Set<string>();

  for (const submission of submissions.filter(
    (node) => node.status === 'approved'
  )) {
    const document = submission.parentLocalId
      ? byLocalId.get(submission.parentLocalId)
      : null;
    if (
      document?.kind === 'document' &&
      (document.status === 'committed' || document.committedEntityId)
    ) {
      throw new Error(
        `Seed submission "${submission.localId}" needs a fresh document.`
      );
    }
  }

  const realOrLocalId = (localId: string | null) => {
    if (!localId) throw new Error('A seed graph relationship is missing.');
    const target = byLocalId.get(localId);
    return target?.committedEntityId ?? localId;
  };

  return {
    classes: classes.map((node) => ({
      localId: node.localId,
      title: requiredString(node.data, 'title', node.localId),
      grade: requiredString(node.data, 'grade', node.localId),
      period: requiredString(node.data, 'period', node.localId),
      schoolYear: requiredString(node.data, 'schoolYear', node.localId),
      approved: node.status === 'approved' && !node.committedEntityId,
    })),
    assignments: assignments.map((node) => ({
      localId: node.localId,
      classLocalId: realOrLocalId(node.parentLocalId),
      title: requiredString(node.data, 'title', node.localId),
      prompt: requiredString(node.data, 'prompt', node.localId),
      assignmentTypeTitle: requiredString(
        node.data,
        'assignmentTypeTitle',
        node.localId
      ),
      approved: node.status === 'approved' && !node.committedEntityId,
    })),
    students: students
      .map((student) => {
        const studentDocuments = documents.filter(
          (document) => document.data.studentLocalId === student.localId
        );
        const studentSubmissions = studentDocuments.flatMap((document) => {
          const assignment = document.parentLocalId
            ? byLocalId.get(document.parentLocalId)
            : null;
          return submissions
            .filter(
              (submission) =>
                submission.parentLocalId === document.localId &&
                submission.status === 'approved' &&
                document.status === 'approved' &&
                isDependencyIncluded(student.status) &&
                Boolean(assignment && isDependencyIncluded(assignment.status))
            )
            .map((submission) => {
              if (pendingDocumentIds.has(document.localId)) {
                throw new Error(
                  `Seed document "${document.localId}" has more than one pending submission.`
                );
              }
              pendingDocumentIds.add(document.localId);
              const workflowStatus = requiredString(
                submission.data,
                'status',
                submission.localId
              );
              if (
                workflowStatus !== 'draft' &&
                workflowStatus !== 'submitted' &&
                workflowStatus !== 'graded'
              ) {
                throw new Error(
                  `Seed node "${submission.localId}" has an invalid submission status.`
                );
              }
              const submissionStatus = workflowStatus as
                | 'draft'
                | 'submitted'
                | 'graded';
              const essayText = requiredString(
                submission.data,
                'essayText',
                submission.localId
              );
              return {
                localId: submission.localId,
                documentLocalId: document.localId,
                assignmentLocalId: realOrLocalId(document.parentLocalId),
                essayText,
                status: submissionStatus,
                ...(submission.data.grade
                  ? { grade: submission.data.grade as any }
                  : {}),
                approved:
                  submission.status === 'approved' &&
                  document.status === 'approved' &&
                  isDependencyIncluded(student.status) &&
                  Boolean(
                    assignment && isDependencyIncluded(assignment.status)
                  ),
              };
            });
        });
        if (studentSubmissions.length === 0) return null;
        return {
          localId: student.localId,
          name: requiredString(student.data, 'name', student.localId),
          classLocalId: realOrLocalId(student.parentLocalId),
          writingProfile: requiredString(
            student.data,
            'writingProfile',
            student.localId
          ) as 'struggling' | 'on_track' | 'advanced',
          submissions: studentSubmissions,
          approved: isDependencyIncluded(student.status),
          ...(student.committedEntityId
            ? { existingMembershipId: student.committedEntityId }
            : {}),
        };
      })
      .filter(
        (student): student is NonNullable<typeof student> => student != null
      ),
  };
}
