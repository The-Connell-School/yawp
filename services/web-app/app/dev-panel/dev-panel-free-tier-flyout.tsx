import { ChevronLeft, CircleAlert, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import { findFreeTierState, isCatalogFreeTierJumpLabel } from './free-tier-states.catalog';
import {
  FREE_TIER_JUMP_GENERIC_ERROR,
  formatFreeTierJumpErrorForClient,
} from './free-tier-jump-messages';
import { PE3_FREE_TIER_STATES } from './dev-panel-pe3-states';

function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

const JUMP_TOAST_KEY = 'yawp-dev-panel-jump-toast';
const JUMP_TOAST_QUERY = 'devPanelJumpToast';

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

function showDevPanelJumpToast(label: string) {
  toast.success(
    <span>
      Jumped to: <span className="font-semibold">{label}</span>
    </span>,
    { className: 'yawp-dev-panel-jump-toast' }
  );
}

function appendJumpToastToRedirect(redirectTo: string, label: string) {
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

export function DevPanelFreeTierFlyout({
  onClose,
  orgId,
  pushed,
}: {
  onClose: () => void;
  orgId: string | null;
  orgName?: string | null;
  pushed?: boolean;
}) {
  const { state, updateForms, flyoutSwitchInstant } = useDevPanel();
  const [jumping, setJumping] = useState(false);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [jumpErrorMessage, setJumpErrorMessage] = useState(
    FREE_TIER_JUMP_GENERIC_ERROR
  );
  const isPhone = useMedia('(max-width: 639px)');
  const selected = state.forms.selectedStateId ?? null;

  const applyState = async (catalogId: string) => {
    if (!orgId || jumping) return;
    if (selected === catalogId && !jumpFailed) return;
    const found = findFreeTierState(catalogId);
    const pe3 = PE3_FREE_TIER_STATES.find((entry) => entry.catalogId === catalogId);
    if (!found || !pe3) return;
    updateForms({ selectedStateId: catalogId });
    setJumping(true);
    setJumpFailed(false);
    setJumpErrorMessage(FREE_TIER_JUMP_GENERIC_ERROR);
    try {
      const response = await fetch('/api/dev-panel/free-tier-jump', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stateId: catalogId,
          throwaway: true,
          organizationId: orgId,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok === false) {
        setJumpErrorMessage(
          formatFreeTierJumpErrorForClient(
            new Error(
              typeof result?.error === 'string'
                ? result.error
                : FREE_TIER_JUMP_GENERIC_ERROR
            )
          )
        );
        setJumpFailed(true);
        setJumping(false);
        return;
      }
      const label = found.state.label;
      window.sessionStorage.setItem(JUMP_TOAST_KEY, label);
      const redirectTo = appendJumpToastToRedirect(String(result.redirectTo), label);
      window.location.assign(redirectTo);
    } catch {
      setJumpErrorMessage(FREE_TIER_JUMP_GENERIC_ERROR);
      setJumpFailed(true);
      setJumping(false);
    }
  };

  return (
    <div
      data-yawp-dev-panel-flyout
      data-instant={flyoutSwitchInstant ? 'true' : undefined}
      className={cn(
        'flex flex-col bg-background',
        pushed
          ? cn(
              'z-20 flex flex-col bg-background',
              isPhone ? 'relative min-h-full' : 'absolute inset-0'
            )
          : 'yawp-dev-panel-flyout-docked absolute inset-y-0 right-full z-10 w-[var(--yawp-dev-panel-width)]'
      )}
      role="dialog"
      aria-label="Free-tier states"
    >
      <header className="yawp-dev-panel-flyout-header">
        {pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : null}
        <h2 id="states-title" className="min-w-0 flex-1 truncate">
          Free-tier states
        </h2>
        {!pushed ? (
          <button
            type="button"
            className="yawp-dev-panel-flyout-header-close"
            aria-label="Close free-tier states"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div
        className={cn(
          'yawp-dev-panel-pe3-states-body',
          jumping && 'pointer-events-none opacity-50'
        )}
      >
        <div role="radiogroup" aria-labelledby="states-title" aria-label="Free-tier state">
          {PE3_FREE_TIER_STATES.map((entry) => {
            const isSelected = selected === entry.catalogId;
            return (
              <label
                key={entry.catalogId}
                className={cn(
                  'yawp-dev-panel-pe3-state-label-row',
                  isSelected && 'yawp-dev-panel-pe3-state-label-row-selected'
                )}
              >
                <input
                  type="radio"
                  name="dev-panel-free-tier-state"
                  checked={isSelected}
                  disabled={jumping}
                  onChange={() => void applyState(entry.catalogId)}
                />
                <span className="yawp-dev-panel-pe3-state-label-text">{entry.label}</span>
                <span className="yawp-dev-panel-pe3-state-code">{entry.code}</span>
              </label>
            );
          })}
        </div>
        <span className="yawp-dev-panel-pe3-footnote">
          Applies right away and reloads the page.
        </span>
      </div>
      {jumpFailed ? (
        <div role="alert" className="yawp-dev-panel-pe3-error">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-medium">{jumpErrorMessage}</p>
            <button
              type="button"
              className="mt-1 text-sm font-medium underline underline-offset-2"
              onClick={() => selected && void applyState(selected)}
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}
      {jumping ? (
        <div role="status" className="yawp-dev-panel-pe3-jumping">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Applying state…
        </div>
      ) : null}
    </div>
  );
}
