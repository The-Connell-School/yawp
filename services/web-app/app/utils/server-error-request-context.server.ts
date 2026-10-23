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

/** Error name and message only — stacks and cause chains can embed tokens or URLs. */
export function buildSafeErrorForLog(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'UnknownError',
  };
}

/** Route param values may hold class codes, tokens, or emails — log sorted keys only. */
export function buildSafeRouteParamsForLog(
  params: Record<string, string | undefined> | undefined,
) {
  if (!params) {
    return { paramKeys: [] as string[] };
  }
  return { paramKeys: Object.keys(params).sort() };
}
