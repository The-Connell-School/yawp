import { expect, type Page } from '@playwright/test';

/** Preview unlock code from the test runtime env (never hard-coded in specs). */
export function previewUnlockCodeFromEnv(): string | null {
  const master = String(process.env.PREVIEW_MASTER_ACCESS_CODE ?? '').trim();
  if (master) return master;
  const legacy = String(process.env.PREVIEW_ACCESS_CODES ?? '')
    .split(/[;,\n]/)
    .map((part) => part.trim())
    .find(Boolean);
  if (legacy) return legacy;
  try {
    const seats = JSON.parse(String(process.env.PREVIEW_ACCESS_SEATS ?? '[]')) as unknown;
    if (!Array.isArray(seats) || !seats[0] || typeof seats[0] !== 'object') return null;
    const code = String((seats[0] as Record<string, unknown>).code ?? '').trim();
    return code || null;
  } catch {
    return null;
  }
}

export async function mintDevPanelPreviewAccessCookie(page: Page) {
  const code = previewUnlockCodeFromEnv();
  expect(
    code,
    'Set PREVIEW_MASTER_ACCESS_CODE, PREVIEW_ACCESS_CODES, or PREVIEW_ACCESS_SEATS for unlock E2E'
  ).toBeTruthy();
  const response = await page.request.post('/api/dev-panel/preview-access', {
    data: { code },
    headers: { 'content-type': 'application/json' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}
