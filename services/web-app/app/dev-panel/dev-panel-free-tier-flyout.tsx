import { ChevronLeft, CircleAlert, Loader2, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import {
  FREE_TIER_STATE_GROUPS,
  findFreeTierState,
} from './free-tier-states.catalog';
const JUMP_TOAST_KEY = 'yawp-dev-panel-jump-toast';
const JUMP_TOAST_QUERY = 'devPanelJumpToast';

export function consumeDevPanelJumpToast() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get(JUMP_TOAST_QUERY);
  if (fromQuery) {
    params.delete(JUMP_TOAST_QUERY);
    const next = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
    toast.success(`Jumped to ${fromQuery}`);
    return;
  }
  const label = window.sessionStorage.getItem(JUMP_TOAST_KEY);
  if (!label) return;
  window.sessionStorage.removeItem(JUMP_TOAST_KEY);
  toast.success(`Jumped to ${label}`);
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
  pushed?: boolean;
}) {
  const { state, updateForms, flyoutSwitchInstant } = useDevPanel();
  const [filter, setFilter] = useState('');
  const [jumping, setJumping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const throwawayRef = useRef<HTMLInputElement>(null);
  const filterId = useId();
  const selected = state.forms.selectedStateId ?? null;
  const throwaway = state.forms.throwawaySwitch !== false;
  const selectedState = selected ? findFreeTierState(selected) : null;

  useEffect(() => {
    if (state.subSheet !== 'free-tier-states') return;
    const focusFirst = () => {
      throwawayRef.current?.focus({ preventScroll: true });
    };
    window.setTimeout(focusFirst, 0);
  }, [state.subSheet]);

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return FREE_TIER_STATE_GROUPS;
    return FREE_TIER_STATE_GROUPS.map((group) => ({
      ...group,
      states: group.states.filter(
        (entry) =>
          entry.label.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle)
      ),
    })).filter((group) => group.states.length > 0);
  }, [filter]);

  const visibleStateIds = useMemo(
    () => new Set(groups.flatMap((group) => group.states.map((entry) => entry.id))),
    [groups]
  );

  const noMatches = filter.trim().length > 0 && groups.length === 0;
  const selectedVisible = selected ? visibleStateIds.has(selected) : false;
  const jumpErrorStateLabel = selectedState?.state.label ?? 'this state';

  const beginJump = () => {
    if (!selected || !orgId || !selectedVisible) return;
    if (!throwaway) {
      setConfirmOpen(true);
      return;
    }
    void runJump();
  };

  const runJump = async () => {
    if (!selected || !orgId || !selectedVisible) return;
    const found = findFreeTierState(selected);
    setConfirmOpen(false);
    setJumping(true);
    setError('');
    try {
      const response = await fetch('/api/dev-panel/free-tier-jump', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stateId: selected, throwaway, organizationId: orgId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const label = found?.state.label ?? 'this state';
        setError(
          `Couldn't jump to '${label}' Your choice is still selected. Try again, or pick another state.`
        );
        setJumping(false);
        return;
      }
      const label = found?.state.label;
      if (label) {
        window.sessionStorage.setItem(JUMP_TOAST_KEY, label);
      }
      const redirectTo = label
        ? appendJumpToastToRedirect(String(result.redirectTo), label)
        : String(result.redirectTo);
      window.setTimeout(() => {
        window.location.assign(redirectTo);
      }, 350);
    } catch {
      setError(
        `Couldn't jump to '${jumpErrorStateLabel}' Your choice is still selected. Try again, or pick another state.`
      );
      setJumping(false);
    }
  };

  const primaryLabel = error ? 'Try again' : 'Jump to this state';
  const jumpDisabled =
    jumping || !orgId || (!error && (!selected || !selectedVisible));

  return (
    <div
      data-yawp-dev-panel-flyout
      data-instant={flyoutSwitchInstant ? 'true' : undefined}
      className={cn(
        'flex flex-col bg-background',
        pushed
          ? 'relative min-h-full'
          : 'absolute inset-y-0 right-full z-10 w-[var(--yawp-dev-panel-width)] border-r shadow-lg'
      )}
      role="dialog"
      aria-label="Free-tier states"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : null}
        <h2 className="flex-1 text-sm font-semibold">Free-tier states</h2>
        {!pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div
          className={cn(
            'space-y-3',
            jumping && 'pointer-events-none opacity-50'
          )}
        >
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Use a throwaway test account</span>
            <input
              ref={throwawayRef}
              type="checkbox"
              checked={throwaway}
              disabled={jumping}
              onChange={(event) => updateForms({ throwawaySwitch: event.target.checked })}
            />
          </label>
          <Input
            id={filterId}
            placeholder="Filter states"
            value={filter}
            disabled={jumping}
            onChange={(event) => setFilter(event.target.value)}
          />
          {noMatches ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Search className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-base font-medium">
                No states match &quot;{filter.trim()}&quot;
              </p>
              <p className="text-sm text-muted-foreground">Try another word</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setFilter('')}>
                Clear filter
              </Button>
            </div>
          ) : null}
          {!noMatches
            ? groups.map((group) => (
            <div key={group.id} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              {group.states.map((entry) => (
                <label
                  key={entry.id}
                  className="flex cursor-pointer gap-2 rounded-md border px-2 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="free-tier-state"
                    checked={selected === entry.id}
                    disabled={jumping}
                    onChange={() => updateForms({ selectedStateId: entry.id })}
                  />
                  <span>
                    <span className="font-medium">{entry.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ))
            : null}
        </div>
        {error ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}
      </div>
      <div className="border-t p-3">
        <Button
          type="button"
          className="w-full"
          disabled={jumpDisabled}
          onClick={() => void beginJump()}
        >
          {jumping ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Jumping…
            </>
          ) : (
            primaryLabel
          )}
        </Button>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the signed-in account?</AlertDialogTitle>
            <AlertDialogDescription>
              Throwaway mode is off, so this jump will update data on the account you are
              signed in with. Continue only if that is what you want.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runJump()}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
