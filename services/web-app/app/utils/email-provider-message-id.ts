const UNTRACKED_IDS = new Set([
  'unknown',
  'mocked',
  'preview-captured',
  'local-captured',
]);

/** Provider id from a sendEmail result, ignoring local capture stand-ins. */
export function providerMessageIdFromSendResult(result: {
  status: string;
  data?: unknown;
}): string | null {
  if (result.status !== 'success' || !result.data || typeof result.data !== 'object') {
    return null;
  }
  const data = result.data as { id?: unknown; data?: { id?: unknown } };
  const nested =
    data.data && typeof data.data === 'object' ? data.data.id : undefined;
  const id = typeof data.id === 'string' ? data.id : nested;
  if (typeof id !== 'string' || !id || UNTRACKED_IDS.has(id)) return null;
  return id;
}
