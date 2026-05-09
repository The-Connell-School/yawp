import { describe, expect, test } from 'bun:test';
import { buildClassDocumentScope } from './class-document-where.server';

describe('buildClassDocumentScope', () => {
  test('uses assignment class linkage for new assignment documents', () => {
    expect(buildClassDocumentScope('class-1', [])).toEqual({
      OR: [{ assignment: { classId: 'class-1' } }],
    });
  });

  test('also includes legacy documents preserved by DocumentClassForensic', () => {
    expect(
      buildClassDocumentScope('class-1', ['doc-legacy-1', 'doc-legacy-2'])
    ).toEqual({
      OR: [
        { assignment: { classId: 'class-1' } },
        { id: { in: ['doc-legacy-1', 'doc-legacy-2'] } },
      ],
    });
  });
});

