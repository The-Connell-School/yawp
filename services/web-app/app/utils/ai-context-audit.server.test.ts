import { describe, expect, test } from 'bun:test';
import {
  buildAiTextContextAudit,
  sha256Text,
} from './ai-context-audit.server';

describe('ai-context-audit.server', () => {
  test('builds stable text context metadata without storing the text itself', () => {
    const audit = buildAiTextContextAudit({
      documentSource: 'submission-snapshot',
      documentId: 'doc-1',
      submissionId: 'sub-1',
      text: 'Frozen AI essay text',
    });

    expect(audit).toEqual({
      documentSource: 'submission-snapshot',
      documentId: 'doc-1',
      submissionId: 'sub-1',
      documentTextLength: 20,
      documentTextSha256:
        '073d1a79b60fbc3caaccdb440a9c17a1e12c9360f209e321e3b0bada66abb5d9',
    });
  });

  test('hashes text with sha256', () => {
    expect(sha256Text('Current draft')).toBe(
      'da3267e1cc4cf21210035face3017d8203d05cf7c2d30685146f537b5d47086f'
    );
  });
});
