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
    message: 'Sender domain is not verified', validationReason: 'sender_domain_unverified',
  });
});

test('retains SES error names and network codes while discarding unknown text', () => {
  process.env.EMAIL_PROVIDER = 'aws-ses';
  expect(emailDeliveryDiagnostic(Object.assign(new Error('opaque-secret'), {
    name: 'CredentialsProviderError', code: 'ECONNREFUSED',
  }), 'owner@example.org')).toEqual({
    provider: 'ses', recipientDomain: 'example.org',
    name: 'CredentialsProviderError', code: 'ECONNREFUSED', statusCode: null,
    message: 'Provider error details redacted', validationReason: 'other',
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
    code: null, statusCode: null, message: 'Provider error details redacted', validationReason: 'other',
  });
});

// Sender/testing messages: https://resend.com/docs/api-reference/errors
// Malformed recipient: https://github.com/resend/resend-node/issues/286
// Reserved recipient report (not listed in the current error reference):
// https://github.com/schemalabz/opencouncil/issues/56
const rejectionCases = [
  {
    validationReason: 'recipient_domain_reserved', statusCode: 422,
    message: 'Invalid `to` field. Please use our testing email address instead of domains like `example.com`. See our documentation for more information.',
    safeMessage: 'Provider error details redacted',
  },
  {
    validationReason: 'recipient_invalid', statusCode: 422,
    message: 'Invalid `to` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.',
    safeMessage: 'Provider error details redacted',
  },
  {
    validationReason: 'sender_domain_unverified', statusCode: 403,
    message: 'The `private.example` domain is not verified. Please, add and verify your domain.',
    safeMessage: 'Sender domain is not verified',
  },
  {
    validationReason: 'testing_recipient_restricted', statusCode: 403,
    message: 'You can only send testing emails to your own email address (`private@private.example`). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.',
    safeMessage: 'Provider restricts test recipients',
  },
  {
    validationReason: 'other', statusCode: 400,
    message: 'An error was found with one or more fields in the request.',
    safeMessage: 'Provider error details redacted',
  },
] as const;

test.each(rejectionCases)('classifies $validationReason and discards all provider text', ({ validationReason, statusCode, message, safeMessage }) => {
  process.env.EMAIL_PROVIDER = 'resend';
  const diagnostic = emailDeliveryDiagnostic({
    name: 'validation_error', statusCode,
    message: `${message} private@private.example https://private.example/?token=fixture-token fixture-credential`,
    token: 'fixture-token', cause: { message },
  }, 'owner@example.com');
  expect(diagnostic).toEqual({
    provider: 'resend', recipientDomain: 'example.com', name: 'validation_error',
    code: null, statusCode, message: safeMessage, validationReason,
  });
  expect(JSON.stringify(diagnostic)).not.toMatch(/private|https:|fixture-|Invalid `to`|resend.com/);
});

test.each([
  'Invalid `to` field.',
  'Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.',
  'Invalid `to` field. Unknown validation error for example.com.',
  'The `example.com` domain has been registered already.',
  'Please verify your domain before sending.',
  'Recipient domain is not verified.',
  'A reserved domain was mentioned in a request.',
  'You can only send emails to testing recipients.',
])('does not guess a validation reason from ambiguous text (%#)', (message) => {
  process.env.EMAIL_PROVIDER = 'resend';
  expect(emailDeliveryDiagnostic({ name: 'validation_error', statusCode: 422, message }, 'owner@example.com').validationReason).toBe('other');
});

test('does not apply Resend validation categories to SES', () => {
  process.env.EMAIL_PROVIDER = 'ses';
  expect(emailDeliveryDiagnostic({ message: rejectionCases[3].message }, 'owner@example.com').validationReason).toBe('other');
});
