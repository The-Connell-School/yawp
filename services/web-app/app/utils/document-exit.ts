export const LAST_NON_DOCUMENT_ROUTE_KEY = 'yawp:last-non-document-route';

export function isDocumentRoutePath(pathname: string): boolean {
  return /^\/app\/documents\/[^/]+\/?$/.test(pathname);
}

export function sanitizeExitTarget(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;

  const pathname = value.split(/[?#]/)[0] || value;
  if (isDocumentRoutePath(pathname)) return null;

  return value;
}

export function readLastNonDocumentRoute(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_NON_DOCUMENT_ROUTE_KEY);
    return sanitizeExitTarget(raw);
  } catch {
    return null;
  }
}

export function writeLastNonDocumentRoute(path: string): void {
  if (typeof window === 'undefined') return;
  const safePath = sanitizeExitTarget(path);
  if (!safePath) return;

  try {
    window.sessionStorage.setItem(LAST_NON_DOCUMENT_ROUTE_KEY, safePath);
  } catch {
    // Ignore sessionStorage failures.
  }
}
