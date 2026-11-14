import { describe, expect, test } from 'bun:test';
import {
  SUBMIT_DOCUMENT_GENERIC_ERROR,
  submitDocumentErrorTextForClient,
} from './submit-document-client-messages';

describe('submitDocumentErrorTextForClient', () => {
  test('returns whitelisted conflict copy unchanged', () => {
    expect(
      submitDocumentErrorTextForClient(
        'This document changed before it could be submitted. Please refresh and try again.',
      ),
    ).toBe(
      'This document changed before it could be submitted. Please refresh and try again.',
    );
  });

  test('uses fallback for internal or unknown server messages', () => {
    const text = submitDocumentErrorTextForClient(
      'PrismaClientKnownRequestError: Unique constraint failed on document_id',
    );
    expect(text).toBe(SUBMIT_DOCUMENT_GENERIC_ERROR);
    expect(text).not.toContain('Prisma');
  });

  test('uses fallback when message is empty', () => {
    expect(submitDocumentErrorTextForClient('   ')).toBe(
      SUBMIT_DOCUMENT_GENERIC_ERROR,
    );
  });
});
