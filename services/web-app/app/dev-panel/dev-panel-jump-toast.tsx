import { toast } from 'sonner';
import { isCatalogFreeTierJumpLabel } from './free-tier-states.catalog';

const JUMP_TOAST_KEY = 'yawp-dev-panel-jump-toast';
const JUMP_TOAST_QUERY = 'devPanelJumpToast';

export function showDevPanelJumpToast(label: string) {
  toast.success(
    <span>
      Jumped to: <span className="font-semibold">{label}</span>
    </span>,
    { className: 'yawp-dev-panel-jump-toast' }
  );
}

export function consumeDevPanelJumpToast() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get(JUMP_TOAST_QUERY);
  if (fromQuery && isCatalogFreeTierJumpLabel(fromQuery)) {
    params.delete(JUMP_TOAST_QUERY);
    const next = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
    showDevPanelJumpToast(fromQuery);
    return;
  }
  const label = window.sessionStorage.getItem(JUMP_TOAST_KEY);
  if (!label || !isCatalogFreeTierJumpLabel(label)) return;
  window.sessionStorage.removeItem(JUMP_TOAST_KEY);
  showDevPanelJumpToast(label);
}

export function appendJumpToastToRedirect(redirectTo: string, label: string) {
  try {
    const target = new URL(redirectTo, window.location.origin);
    if (target.origin !== window.location.origin) {
      target.searchParams.set(JUMP_TOAST_QUERY, label);
      return target.toString();
    }
  } catch {
    return redirectTo;
  }
  return redirectTo;
}

export function stashDevPanelJumpToast(label: string) {
  window.sessionStorage.setItem(JUMP_TOAST_KEY, label);
}
