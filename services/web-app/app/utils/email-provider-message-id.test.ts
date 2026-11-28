import { expect, test } from 'bun:test';
import { providerMessageIdFromSendResult } from './email-provider-message-id';

test('reads an SES message id and a Resend parse result', () => {
  expect(
    providerMessageIdFromSendResult({
      status: 'success',
      data: { id: 'ses-message-1' },
    })
  ).toBe('ses-message-1');
  expect(
    providerMessageIdFromSendResult({
      status: 'success',
      data: { success: true, data: { id: 're_123' } },
    })
  ).toBe('re_123');
});

test('ignores capture stand-ins and failures', () => {
  for (const id of ['unknown', 'mocked', 'preview-captured', 'local-captured']) {
    expect(
      providerMessageIdFromSendResult({ status: 'success', data: { id } })
    ).toBeNull();
  }
  expect(
    providerMessageIdFromSendResult({ status: 'error', data: { id: 'ses-1' } })
  ).toBeNull();
});
