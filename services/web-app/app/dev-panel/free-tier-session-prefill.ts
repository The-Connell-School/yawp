export const DEV_PANEL_FT_PREFILL_STORAGE_KEY = 'yawp-dev-panel-ft-prefill';

export type DevPanelFtPrefill = {
  email: string;
  name: string;
  schoolName: string;
  location: string;
  gradeLevel: string;
};

export const DEV_PANEL_FT_TEST_EMAIL_DOMAIN = 'yawp.test';

export function isDevPanelFtTestEmail(email: string) {
  return (
    email.toLowerCase().endsWith(`@${DEV_PANEL_FT_TEST_EMAIL_DOMAIN}`) &&
    email.toLowerCase().includes('ft-test+')
  );
}

/** PE3 session-runner fixture values (Create Account & Class autofill). */
export function devPanelFtPrefillForEmail(email: string): DevPanelFtPrefill {
  return {
    email,
    name: 'Dana Whitaker',
    schoolName: 'Lincoln High School',
    location: 'Lincoln, CA',
    gradeLevel: '10',
  };
}

export function writeDevPanelFtPrefill(
  storage: Storage | undefined,
  prefill: DevPanelFtPrefill
) {
  if (!storage) return;
  try {
    storage.setItem(DEV_PANEL_FT_PREFILL_STORAGE_KEY, JSON.stringify(prefill));
  } catch {
    /* ignore */
  }
}

export function readDevPanelFtPrefill(
  storage: Storage | undefined
): DevPanelFtPrefill | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DEV_PANEL_FT_PREFILL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DevPanelFtPrefill;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDevPanelFtPrefill(storage: Storage | undefined) {
  if (!storage) return;
  try {
    storage.removeItem(DEV_PANEL_FT_PREFILL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function mintDevPanelFtTestEmail() {
  const slug = Math.random().toString(36).slice(2, 6);
  return `ft-test+${slug}@yawp.test`;
}
