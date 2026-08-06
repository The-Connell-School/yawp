import { describe, expect, test } from 'bun:test';
import {
  collectCascadeLocalIds,
  seedGraphToCommitProposal,
  type PersistedSeedGeneratorNode,
} from './seed-generator-graph';

const nodes: PersistedSeedGeneratorNode[] = [
  {
    localId: 'class-1',
    kind: 'class',
    parentLocalId: null,
    status: 'approved',
    committedEntityId: null,
    data: {
      title: 'English 9',
      grade: '9',
      period: '3',
      schoolYear: '2026-2027',
    },
  },
  {
    localId: 'assignment-1',
    kind: 'assignment',
    parentLocalId: 'class-1',
    status: 'approved',
    committedEntityId: null,
    data: {
      title: 'Civic essay',
      prompt: 'Write about civic responsibility.',
      assignmentTypeTitle: 'The Thesis-Driven Essay',
    },
  },
  {
    localId: 'student-1',
    kind: 'student',
    parentLocalId: 'class-1',
    status: 'approved',
    committedEntityId: null,
    data: { name: 'Maya R.', writingProfile: 'struggling' },
  },
  {
    localId: 'document-1',
    kind: 'document',
    parentLocalId: 'assignment-1',
    status: 'approved',
    committedEntityId: null,
    data: {
      title: 'Maya R. — Civic essay',
      studentLocalId: 'student-1',
    },
  },
  {
    localId: 'submission-1',
    kind: 'submission',
    parentLocalId: 'document-1',
    status: 'approved',
    committedEntityId: null,
    data: {
      status: 'submitted',
      essayText: 'A complete essay awaiting grading.',
    },
  },
];

describe('collectCascadeLocalIds', () => {
  test('rejecting a class cascades through every relationship', () => {
    expect([...collectCascadeLocalIds(nodes, 'class-1')].sort()).toEqual(
      nodes.map((node) => node.localId).sort()
    );
  });

  test('rejecting a student also cascades to its documents and submissions', () => {
    expect([...collectCascadeLocalIds(nodes, 'student-1')].sort()).toEqual([
      'document-1',
      'student-1',
      'submission-1',
    ]);
  });
});

describe('seedGraphToCommitProposal', () => {
  test('preserves document and submission ids and submission-level approval', () => {
    const proposal = seedGraphToCommitProposal(nodes);
    expect(proposal.students[0]?.submissions[0]).toMatchObject({
      localId: 'submission-1',
      documentLocalId: 'document-1',
      assignmentLocalId: 'assignment-1',
      approved: true,
      status: 'submitted',
    });
  });

  test('a rejected submission is omitted without requiring generated content', () => {
    const proposal = seedGraphToCommitProposal(
      nodes.map((node) =>
        node.localId === 'submission-1'
          ? {
              ...node,
              status: 'rejected' as const,
              data: { status: 'submitted' },
            }
          : node
      )
    );
    expect(proposal.students).toEqual([]);
  });

  test('a follow-up commit never replays committed writing', () => {
    const committed = nodes.map((node) => ({
      ...node,
      status: 'committed' as const,
      committedEntityId:
        node.kind === 'submission' && node.data.status === 'draft'
          ? null
          : `real-${node.localId}`,
    }));

    expect(seedGraphToCommitProposal(committed).students).toEqual([]);
  });

  test('fails closed when new writing targets a committed document', () => {
    const invalidFollowUp = nodes.map((node) =>
      node.localId === 'document-1'
        ? {
            ...node,
            status: 'committed' as const,
            committedEntityId: 'document-real-1',
          }
        : node
    );

    expect(() => seedGraphToCommitProposal(invalidFollowUp)).toThrow(
      /fresh document/
    );
  });
});
