import { redactEmailForLog } from './redact-email-for-log.server';

// Provider errors can contain addresses, verification links, credentials, or
// arbitrary response bodies. Log only allowlisted identifiers and fixed prose;
// regex replacement alone cannot safely redact opaque tokens.
const errorNames = new Set([
  'validation_error', 'restricted_api_key', 'missing_api_key', 'invalid_api_key',
  'rate_limit_exceeded', 'application_error', 'not_found', 'invalid_access',
  'MessageRejected', 'MessageRejectedException', 'MailFromDomainNotVerifiedException',
  'NotFoundException', 'BadRequestException', 'TooManyRequestsException',
  'LimitExceededException', 'AccountSuspendedException', 'SendingPausedException',
  'AccessDeniedException', 'UnrecognizedClientException', 'ExpiredTokenException',
  'CredentialsProviderError', 'TimeoutError', 'TypeError', 'UnknownError',
]);
const errorCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);

type ValidationReason =
  | 'recipient_domain_reserved'
  | 'recipient_invalid'
  | 'sender_domain_unverified'
  | 'testing_recipient_restricted'
  | 'other';

function resendValidationReason(message: string): ValidationReason {
  // Resend's testing restriction also tells callers to verify a domain.
  // Match its specific rejection before any sender-verification wording.
  if (/^You can only send testing emails to your own email address(?: \(|\.)/i.test(message))
    return 'testing_recipient_restricted';
  if (/^Invalid `to` field\. Please use our testing email address instead of domains like `[^`\s]+`\./i.test(message))
    return 'recipient_domain_reserved';
  if (/^Invalid `to` field\. The email address needs to follow the `email@example\.com` or `Name <email@example\.com>` format(?:\.|$)/.test(message))
    return 'recipient_invalid';
  if (/^(?:The `?[a-z0-9][a-z0-9.-]*`?|Sender) domain is not verified(?:[.:]|$)/i.test(message))
    return 'sender_domain_unverified';
  return 'other';
}

export function emailDeliveryDiagnostic(error: unknown, recipient: string) {
  const provider = ['ses', 'aws-ses'].includes(process.env.EMAIL_PROVIDER?.toLowerCase() ?? '')
    ? 'ses' : 'resend';
  const detail = error && typeof error === 'object'
    ? error as { name?: unknown; code?: unknown; message?: unknown; statusCode?: unknown }
    : {};
  const name = typeof detail.name === 'string' && errorNames.has(detail.name)
    ? detail.name : 'UnknownError';
  const code = typeof detail.code === 'string' && errorCodes.has(detail.code)
    ? detail.code : null;
  const message = typeof detail.message === 'string' ? detail.message : '';
  const domain = recipient.split('@');
  const recipientDomain = domain.length === 2
    && domain[1]!.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain[1]!)
    ? domain[1]!.toLowerCase() : null;
  return {
    provider,
    recipient: redactEmailForLog(recipient),
    recipientDomain,
    name,
    code,
    validationReason: provider === 'resend' ? resendValidationReason(message) : 'other',
    statusCode: typeof detail.statusCode === 'number' && Number.isInteger(detail.statusCode)
      && detail.statusCode >= 100 && detail.statusCode <= 599 ? detail.statusCode : null,
    message: /only send.*testing|testing.*own email/i.test(message)
      ? 'Provider restricts test recipients'
      : /domain.*not verified|verify.*domain/i.test(message)
        ? 'Sender domain is not verified'
        : /api key.*invalid|invalid.*api key/i.test(message)
          ? 'Provider rejected API credentials'
          : /too many requests|rate limit/i.test(message)
            ? 'Provider rate limit exceeded'
            : 'Provider error details redacted',
  };
}
