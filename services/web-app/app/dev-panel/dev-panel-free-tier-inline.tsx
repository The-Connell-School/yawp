import { ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import {
  findPe3FreeTierState,
  PE3_FREE_TIER_STATES,
} from './dev-panel-pe3-states';
import { findFreeTierState } from './free-tier-states.catalog';
import {
  FREE_TIER_JUMP_GENERIC_ERROR,
  formatFreeTierJumpErrorForClient,
} from './free-tier-jump-messages';
import {
  appendJumpToastToRedirect,
  stashDevPanelJumpToast,
} from './dev-panel-jump-toast';

export function DevPanelFreeTierInline({
  orgId,
  sectionOpen,
}: {
  orgId: string | null;
  sectionOpen: boolean;
}) {
  const { state, updateForms } = useDevPanel();
  const [confirmCatalogId, setConfirmCatalogId] = useState<string | null>(null);
  const [applyingCatalogId, setApplyingCatalogId] = useState<string | null>(null);
  const [jumpError, setJumpError] = useState<string | null>(null);

  const currentCatalogId = state.forms.selectedStateId ?? null;
  const currentPe3 = currentCatalogId ? findPe3FreeTierState(currentCatalogId) : null;

  useEffect(() => {
    if (!sectionOpen) {
      setConfirmCatalogId(null);
      setJumpError(null);
    }
  }, [sectionOpen]);

  useEffect(() => {
    if (!confirmCatalogId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setConfirmCatalogId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmCatalogId]);

  const runJump = async (catalogId: string) => {
    if (!orgId || applyingCatalogId) return;
    const found = findFreeTierState(catalogId);
    const pe3 = findPe3FreeTierState(catalogId);
    if (!found || !pe3) return;

    setConfirmCatalogId(null);
    setApplyingCatalogId(catalogId);
    setJumpError(null);
    updateForms({ selectedStateId: catalogId });

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
        setJumpError(
          formatFreeTierJumpErrorForClient(
            new Error(
              typeof result?.error === 'string'
                ? result.error
                : FREE_TIER_JUMP_GENERIC_ERROR
            )
          )
        );
        setApplyingCatalogId(null);
        return;
      }
      const label = found.state.label;
      stashDevPanelJumpToast(label);
      const redirectTo = appendJumpToastToRedirect(String(result.redirectTo), label);
      window.location.assign(redirectTo);
    } catch {
      setJumpError(FREE_TIER_JUMP_GENERIC_ERROR);
      setApplyingCatalogId(null);
    }
  };

  const dimRows = Boolean(applyingCatalogId);

  return (
    <div
      className={cn(
        'yawp-dev-panel-inline-expanded-body yawp-dev-panel-free-tier-inline',
        dimRows && 'yawp-dev-panel-free-tier-inline-dimmed'
      )}
    >
      {currentPe3 ? (
        <span className="yawp-dev-panel-free-tier-now">
          Now: {currentPe3.label} ({currentPe3.code})
        </span>
      ) : null}
      <div
        className="yawp-dev-panel-free-tier-jump-list"
        aria-label="Jump to a free-tier state"
      >
        {PE3_FREE_TIER_STATES.map((entry) => {
          const isConfirming = confirmCatalogId === entry.catalogId;
          const isApplying = applyingCatalogId === entry.catalogId;

          if (isConfirming) {
            return (
              <div
                key={entry.catalogId}
                role="group"
                aria-label={`Confirm jump to ${entry.label}`}
                className="yawp-dev-panel-free-tier-confirm"
              >
                <div className="yawp-dev-panel-free-tier-confirm-title">
                  <span>{entry.label}</span>
                  <span className="yawp-dev-panel-free-tier-code">{entry.code}</span>
                </div>
                <span className="yawp-dev-panel-free-tier-confirm-copy">
                  Jump to this state? Your test account changes and the page reloads.
                </span>
                <div className="yawp-dev-panel-free-tier-confirm-actions">
                  <button
                    type="button"
                    className="yawp-dev-panel-free-tier-jump-btn"
                    onClick={() => void runJump(entry.catalogId)}
                  >
                    Jump
                  </button>
                  <button
                    type="button"
                    className="yawp-dev-panel-free-tier-cancel-btn"
                    onClick={() => setConfirmCatalogId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          if (isApplying) {
            return (
              <div
                key={entry.catalogId}
                className="yawp-dev-panel-free-tier-applying"
                role="status"
              >
                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                <span>Jumping to {entry.label}…</span>
                <span className="yawp-dev-panel-free-tier-code">{entry.code}</span>
              </div>
            );
          }

          return (
            <button
              key={entry.catalogId}
              type="button"
              className="yawp-dev-panel-free-tier-jump-row"
              disabled={Boolean(applyingCatalogId)}
              onClick={() => {
                setJumpError(null);
                setConfirmCatalogId(entry.catalogId);
              }}
            >
              <span>{entry.label}</span>
              <span className="yawp-dev-panel-free-tier-code">{entry.code}</span>
              <ChevronRight className="yawp-dev-panel-free-tier-row-chevron size-3 shrink-0" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {jumpError ? (
        <p role="alert" className="yawp-dev-panel-free-tier-error">
          {jumpError}
        </p>
      ) : null}
    </div>
  );
}
