import { describe, expect, test } from 'bun:test';
import { buildPasteAlertsByStudentId } from './class-paste-alerts';

describe('buildPasteAlertsByStudentId', () => {
  test('groups alerts by membershipId', () => {
    const result = buildPasteAlertsByStudentId([
      {
        id: 'a1',
        documentId: 'doc-1',
        membershipId: 'student-1',
        textLength: 250,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'a2',
        documentId: 'doc-2',
        membershipId: 'student-2',
        textLength: 300,
        createdAt: '2026-08-02T00:00:00.000Z',
      },
      {
        id: 'a3',
        documentId: 'doc-3',
        membershipId: 'student-1',
        textLength: 400,
        createdAt: '2026-08-03T00:00:00.000Z',
      },
    ]);

    expect(Object.keys(result).sort()).toEqual(['student-1', 'student-2']);
    expect(result['student-1'].map((a) => a.id)).toEqual(['a3', 'a1']);
    expect(result['student-2'].map((a) => a.id)).toEqual(['a2']);
  });

  test('returns an empty object for no alerts', () => {
    expect(buildPasteAlertsByStudentId([])).toEqual({});
  });

  test('sorts each student’s alerts newest first regardless of input order', () => {
    const result = buildPasteAlertsByStudentId([
      {
        id: 'old',
        documentId: 'doc-1',
        membershipId: 'student-1',
        textLength: 250,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'new',
        documentId: 'doc-2',
        membershipId: 'student-1',
        textLength: 250,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    expect(result['student-1'].map((a) => a.id)).toEqual(['new', 'old']);
  });
});
