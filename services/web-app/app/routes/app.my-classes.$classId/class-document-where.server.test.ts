import { describe, expect, test } from 'bun:test';
import { buildClassDocumentScope } from './class-document-where.server';

describe('buildClassDocumentScope', () => {
  test('uses class assignment deployments for class work', () => {
    expect(buildClassDocumentScope('class-1', [])).toEqual({
      OR: [{ classAssignment: { classId: 'class-1' } }],
    });
  });

  test('includes practice docs for a filtered student membership', () => {
    expect(
      buildClassDocumentScope('class-1', [], { membershipId: 'membership-1' })
    ).toEqual({
      OR: [
        { classAssignment: { classId: 'class-1' } },
        { classAssignmentId: null, membershipId: 'membership-1' },
      ],
    });
  });

  test('also includes legacy documents preserved by DocumentClassForensic', () => {
    expect(
      buildClassDocumentScope('class-1', ['doc-legacy-1', 'doc-legacy-2'])
    ).toEqual({
      OR: [
        { classAssignment: { classId: 'class-1' } },
        { id: { in: ['doc-legacy-1', 'doc-legacy-2'] } },
      ],
    });
  });
});
