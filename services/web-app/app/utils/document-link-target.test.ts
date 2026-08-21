import { describe, expect, test } from 'bun:test';
import {
  pickLatestReleasedSubmission,
  resolveDocumentLinkTarget,
} from './document-link-target';

describe('pickLatestReleasedSubmission', () => {
  test('returns most recently released submission when an older resubmission is still pending', () => {
    expect(
      pickLatestReleasedSubmission([
        {
          id: 'sub-pending',
          releasedAt: null,
          submittedAt: '2024-03-01T00:00:00.000Z',
        },
        {
          id: 'sub-released',
          releasedAt: '2024-02-01T00:00:00.000Z',
          submittedAt: '2024-02-01T00:00:00.000Z',
        },
      ])?.id
    ).toBe('sub-released');
  });

  test('prefers later releasedAt when multiple released submissions exist', () => {
    expect(
      pickLatestReleasedSubmission([
        {
          id: 'sub-old',
          releasedAt: '2024-01-01T00:00:00.000Z',
          submittedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'sub-new',
          releasedAt: '2024-02-01T00:00:00.000Z',
          submittedAt: '2024-02-01T00:00:00.000Z',
        },
      ])?.id
    ).toBe('sub-new');
  });
});

describe('resolveDocumentLinkTarget', () => {
  test('student with released grade links to submission view', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app',
        isStudentView: true,
        submissions: [
          {
            id: 'sub-old',
            releasedAt: '2024-01-01T00:00:00.000Z',
            submittedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'sub-new',
            releasedAt: '2024-02-01T00:00:00.000Z',
            submittedAt: '2024-02-01T00:00:00.000Z',
          },
        ],
      })
    ).toBe('/app/submissions/sub-new?exitTo=%2Fapp');
  });

  test('student links to released submission even when a newer submission is pending', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app',
        isStudentView: true,
        submissions: [
          {
            id: 'sub-pending',
            releasedAt: null,
            submittedAt: '2024-03-01T00:00:00.000Z',
          },
          {
            id: 'sub-released',
            releasedAt: '2024-02-01T00:00:00.000Z',
            submittedAt: '2024-02-01T00:00:00.000Z',
          },
        ],
      })
    ).toBe('/app/submissions/sub-released?exitTo=%2Fapp');
  });

  test('student with only unreleased submission links to document editor', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app',
        isStudentView: true,
        submissions: [
          {
            id: 'sub-1',
            releasedAt: null,
            submittedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      })
    ).toBe('/app/documents/doc-1?ssv=1&exitTo=%2Fapp');
  });

  test('teacher view always links to document editor', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app',
        isStudentView: false,
        submissions: [
          {
            id: 'sub-1',
            releasedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      })
    ).toBe('/app/documents/doc-1?ssv=1&exitTo=%2Fapp');
  });

  test('ignores a teacher-unsubmitted submission when picking released grade', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app',
        isStudentView: true,
        submissions: [
          {
            id: 'sub-unsubmitted',
            releasedAt: '2024-03-01T00:00:00.000Z',
            unsubmittedAt: '2024-03-02T00:00:00.000Z',
          },
          {
            id: 'sub-active',
            releasedAt: '2024-02-01T00:00:00.000Z',
          },
        ],
      })
    ).toBe('/app/submissions/sub-active?exitTo=%2Fapp');
  });

  test('links to the document editor when the only submission was unsubmitted', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app',
        isStudentView: true,
        submissions: [
          {
            id: 'sub-unsubmitted',
            releasedAt: '2024-03-01T00:00:00.000Z',
            unsubmittedAt: '2024-03-02T00:00:00.000Z',
          },
        ],
      })
    ).toBe('/app/documents/doc-1?ssv=1&exitTo=%2Fapp');
  });

  test('ignores archived submissions when picking released grade', () => {
    expect(
      resolveDocumentLinkTarget({
        documentId: 'doc-1',
        exitTo: '/app/assignment-types/at-1',
        isStudentView: true,
        submissions: [
          {
            id: 'sub-archived',
            releasedAt: '2024-03-01T00:00:00.000Z',
            archivedAt: '2024-03-02T00:00:00.000Z',
          },
          {
            id: 'sub-active',
            releasedAt: '2024-02-01T00:00:00.000Z',
          },
        ],
      })
    ).toBe(
      '/app/submissions/sub-active?exitTo=%2Fapp%2Fassignment-types%2Fat-1'
    );
  });
});
