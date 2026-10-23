import { describe, expect, test } from 'bun:test';
import { redactEmailForLog } from './redact-email-for-log.server';

describe('redactEmailForLog', () => {
  test('redacts local and domain labels to the a***@d*** form', () => {
    expect(redactEmailForLog('alice@domain.com')).toBe('a***@d***');
    expect(redactEmailForLog('  bob@school.edu  ')).toBe('b***@s***');
  });

  test('does not echo the full address for malformed input', () => {
    expect(redactEmailForLog('not-an-email')).toBe('[redacted-email]');
    expect(redactEmailForLog('@missing-local.com')).toBe('[redacted-email]');
    expect(redactEmailForLog('missing-domain@')).toBe('[redacted-email]');
  });
});
