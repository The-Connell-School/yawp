const STORAGE_KEY = 'yawp:local-first-enabled';

export function isLocalFirstEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setLocalFirstEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

/**
 * Check URL params on page load: ?localFirst=on or ?localFirst=off
 * Persists to localStorage so it sticks across navigations.
 */
export function syncLocalFirstFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const param = params.get('localFirst');
  if (param === 'on' || param === 'true') {
    setLocalFirstEnabled(true);
    return true;
  }
  if (param === 'off' || param === 'false') {
    setLocalFirstEnabled(false);
    return false;
  }
  return isLocalFirstEnabled();
}
