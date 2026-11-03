/** Same-origin app paths for dev-panel feedback (pathname only; query/hash stripped). */
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
  const pathname = url.pathname;
  if (pathname.length === 0 || pathname.length > 512) return null;
  if (pathname.startsWith('/api/')) return null;
  return pathname;
}
