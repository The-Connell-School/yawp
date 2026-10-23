/** Sanitized relative paths allowed for dev-panel feedback on demo/dev pages. */
export function devPanelFeedbackPath(value: string): string | null {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s\u0000-\u001f]/.test(value) ||
    /%(?![\da-f]{2})/i.test(value)
  ) {
    return null;
  }
  const url = new URL(value, 'https://feedback.invalid');
  if (!isAllowedDevPanelPathname(url.pathname) || url.pathname.length > 512) {
    return null;
  }
  for (const [key, val] of [...url.searchParams.entries()]) {
    if (
      /(token|secret|password|passwd|key|auth|session|signature|credential|code|state|jwt|ticket|invite)/i.test(
        key
      ) ||
      /[A-Za-z0-9_-]{32,}/.test(val) ||
      /^[^.]+\.[^.]+\.[^.]+$/.test(val)
    ) {
      url.searchParams.delete(key);
    }
  }
  if (url.pathname.length > 512) return null;
  return url.pathname;
}

function isAllowedDevPanelPathname(pathname: string) {
  if (pathname === '/') return true;
  if (pathname === '/info' || pathname.startsWith('/info/')) return true;
  if (/^\/(privacy|terms)(?:\/|$)/.test(pathname)) return true;
  if (pathname === '/app' || pathname.startsWith('/app/')) return true;
  if (pathname.startsWith('/free')) return true;
  if (pathname.startsWith('/auth/')) return true;
  return false;
}
