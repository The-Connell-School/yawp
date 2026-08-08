import type { SeedGraphProposal, SeedNodeKind } from './seed-generator-schema';
import type { PersistedSeedGeneratorNode } from './seed-generator-graph';

export const MAX_SEED_HISTORY_MESSAGES = 20;
export const MAX_SEED_HISTORY_CHARS = 24_000;

export function deriveSeedConversationTitle(message: string) {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed || 'New seed plan';
  return `${trimmed.slice(0, 57)}…`;
}

export function boundedSeedHistory(
  messages: Array<{ role: string; content: string }>
) {
  const countBounded = messages.slice(-MAX_SEED_HISTORY_MESSAGES);
  const selected: Array<{ role: string; content: string }> = [];
  let chars = 0;
  for (let index = countBounded.length - 1; index >= 0; index -= 1) {
    const message = countBounded[index]!;
    if (chars + message.content.length > MAX_SEED_HISTORY_CHARS) break;
    selected.unshift(message);
    chars += message.content.length;
  }
  return selected;
}

type GraphReferenceResult =
  | { valid: true }
  | { valid: false; issues: string[] };

/** Validate application-level graph edges before any nodes are persisted. */
export function validateNewGraphReferences(
  graph: SeedGraphProposal,
  currentNodes: PersistedSeedGeneratorNode[],
  existingClassIds: Set<string>
): GraphReferenceResult {
  const issues: string[] = [];
  const current = new Map(currentNodes.map((node) => [node.localId, node]));
  const proposed = new Map<string, SeedNodeKind>();
  for (const node of graph.nodes) {
    if (current.has(node.localId)) {
      issues.push(`localId "${node.localId}" already exists in this thread.`);
    }
    proposed.set(node.localId, node.kind);
  }
  const kindOf = (localId: string) =>
    proposed.get(localId) ?? current.get(localId)?.kind;

  for (const node of graph.nodes) {
    if (node.kind === 'class') {
      continue;
    }
    const parent = node.parentLocalId;
    const parentKind = kindOf(parent);
    if (node.kind === 'assignment' || node.kind === 'student') {
      if (parentKind !== 'class' && !existingClassIds.has(parent)) {
        issues.push(`${node.kind} "${node.localId}" must reference a class.`);
      }
      continue;
    }
    if (node.kind === 'document') {
      if (parentKind !== 'assignment') {
        issues.push(`Document "${node.localId}" must reference an assignment.`);
      }
      if (kindOf(node.data.studentLocalId) !== 'student') {
        issues.push(`Document "${node.localId}" must reference a student.`);
      }
      continue;
    }
    if (node.kind === 'submission') {
      if (parentKind !== 'document') {
        issues.push(`Submission "${node.localId}" must reference a document.`);
      }
      const existingParent = current.get(parent);
      if (
        existingParent?.kind === 'document' &&
        (existingParent.status === 'committed' ||
          existingParent.committedEntityId)
      ) {
        issues.push(
          `Submission "${node.localId}" needs a fresh document; committed documents cannot receive generated submissions.`
        );
      }
    }
  }

  return issues.length > 0 ? { valid: false, issues } : { valid: true };
}
