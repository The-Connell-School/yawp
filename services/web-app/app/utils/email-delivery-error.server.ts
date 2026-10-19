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
    provider, recipientDomain, name, code,
    statusCode: typeof detail.statusCode === 'number' && Number.isInteger(detail.statusCode)
      && detail.statusCode >= 100 && detail.statusCode <= 599 ? detail.statusCode : null,
    message: /domain.*not verified|verify.*domain/i.test(message)
      ? 'Sender domain is not verified'
      : /api key.*invalid|invalid.*api key/i.test(message)
        ? 'Provider rejected API credentials'
        : /only send.*testing|testing.*own email/i.test(message)
          ? 'Provider restricts test recipients'
          : /too many requests|rate limit/i.test(message)
            ? 'Provider rate limit exceeded'
            : 'Provider error details redacted',
  };
}
