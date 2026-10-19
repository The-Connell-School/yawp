import { afterEach, expect, test } from 'bun:test';
import { emailDeliveryDiagnostic } from './email-delivery-error.server';

const provider = process.env.EMAIL_PROVIDER;
afterEach(() => {
  if (provider === undefined) delete process.env.EMAIL_PROVIDER;
  else process.env.EMAIL_PROVIDER = provider;
});

test('retains useful Resend diagnostics without provider-controlled private text', () => {
  process.env.EMAIL_PROVIDER = 'resend';
  expect(emailDeliveryDiagnostic({
    name: 'validation_error', statusCode: 403,
    message: 'The sender domain is not verified: owner@private.example https://secret.example/?code=otp re_private_key',
    cause: { token: 'private-token' },
  }, 'Owner@Example.COM')).toEqual({
    provider: 'resend', recipientDomain: 'example.com',
    name: 'validation_error', code: null, statusCode: 403,
    message: 'Sender domain is not verified',
  });
});

test('retains SES error names and network codes while discarding unknown text', () => {
  process.env.EMAIL_PROVIDER = 'aws-ses';
  expect(emailDeliveryDiagnostic(Object.assign(new Error('opaque-secret'), {
    name: 'CredentialsProviderError', code: 'ECONNREFUSED',
  }), 'owner@example.org')).toEqual({
    provider: 'ses', recipientDomain: 'example.org',
    name: 'CredentialsProviderError', code: 'ECONNREFUSED', statusCode: null,
    message: 'Provider error details redacted',
  });
});

test.each([undefined, null, 'secret-token', {
  name: 'owner@private.example', code: 'private-token',
  statusCode: 'https://private.example/?token=secret',
  message: 'Bearer arbitrary-secret\nowner@private.example https://private.example',
  cause: { secret: 'nested-secret' },
}])('never serializes arbitrary provider errors (%#)', (error) => {
  delete process.env.EMAIL_PROVIDER;
  expect(emailDeliveryDiagnostic(error, 'invalid@domain.example\nprivate-token')).toEqual({
    provider: 'resend', recipientDomain: null, name: 'UnknownError',
    code: null, statusCode: null, message: 'Provider error details redacted',
  });
});
