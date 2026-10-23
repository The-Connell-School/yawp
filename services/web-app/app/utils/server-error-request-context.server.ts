const ALLOWED_REQUEST_HEADERS = ['user-agent', 'x-request-id'] as const;

function requestPathWithoutQuery(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return '/';
  }
}

export function requestIdFromHeaders(request: Request): string | null {
  return request.headers.get('x-request-id');
}

/** Safe request fields for server error logs — no cookies, auth, or forwarding headers. */
export function buildServerErrorRequestContext(request: Request) {
  const headers: Record<string, string> = {};
  for (const name of ALLOWED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  return {
    method: request.method,
    path: requestPathWithoutQuery(request),
    requestId: requestIdFromHeaders(request),
    headers,
  };
}
