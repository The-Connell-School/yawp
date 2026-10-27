import { ChevronLeft, CircleAlert, Loader2, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouteLoaderData } from 'react-router';

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
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/utils/misc';
import type { loader as rootLoader } from '~/root';
import { useDevPanel } from './dev-panel-provider';
import {
  FREE_TIER_STATE_GROUPS,
  findFreeTierState,
  isCatalogFreeTierJumpLabel,
} from './free-tier-states.catalog';
import {
  FREE_TIER_JUMP_GENERIC_ERROR,
  formatFreeTierJumpErrorForClient,
} from './free-tier-jump-messages';
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

function defaultOpenGroups(selectedId: string | null) {
  if (!selectedId) return ['approved'];
  const group = FREE_TIER_STATE_GROUPS.find((entry) =>
    entry.states.some((state) => state.id === selectedId)
  );
  return group ? [group.id] : ['approved'];
}

export function DevPanelFreeTierFlyout({
  onClose,
  orgId,
  orgName,
  pushed,
}: {
  onClose: () => void;
  orgId: string | null;
  orgName?: string | null;
  pushed?: boolean;
}) {
  const { state, updateForms, flyoutSwitchInstant } = useDevPanel();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const signedInName =
    rootData?.user?.name?.trim() || rootData?.user?.email || 'the signed-in account';
  const [filter, setFilter] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    defaultOpenGroups(state.forms.selectedStateId ?? null)
  );
  const [jumping, setJumping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [jumpErrorMessage, setJumpErrorMessage] = useState(
    FREE_TIER_JUMP_GENERIC_ERROR
  );
  const throwawayRef = useRef<HTMLButtonElement>(null);
  const filterId = useId();
  const isPhone = useMedia('(max-width: 639px)');
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
    setJumpFailed(false);
    setJumpErrorMessage(FREE_TIER_JUMP_GENERIC_ERROR);
    try {
      const response = await fetch('/api/dev-panel/free-tier-jump', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stateId: selected, throwaway, organizationId: orgId }),
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
      setJumpErrorMessage(FREE_TIER_JUMP_GENERIC_ERROR);
      setJumpFailed(true);
      setJumping(false);
    }
  };

  const primaryLabel = jumpFailed ? 'Try again' : 'Jump to this state';
  const jumpDisabled =
    jumping ||
    !orgId ||
    (!jumpFailed && (!selected || !selectedVisible)) ||
    (jumpFailed && !selectedVisible);
  const throwawayHelp = throwaway
    ? `Each jump makes a fresh test teacher at ${orgName ?? 'your school'}. ${signedInName}'s data isn't touched.`
    : `Off: jumps change the signed-in account, ${signedInName}.`;
  const toggleGroup = (groupId: string) => {
    setOpenGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
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
      <div className="yawp-dev-panel-states-intro">
        <p className="m-0 text-sm leading-5">
          Pick a state, then jump. Yawp! reloads straight into it.
        </p>
        <div className="flex items-start gap-3">
          <Switch
            id="throwaway"
            ref={throwawayRef}
            checked={throwaway}
            disabled={jumping}
            onCheckedChange={(checked) => updateForms({ throwawaySwitch: checked })}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor="throwaway">Use a throwaway test account</Label>
            <span id="throwaway-help" className="text-xs leading-4 text-muted-foreground">
              {throwawayHelp}
            </span>
          </div>
        </div>
        <Input
          id={filterId}
          placeholder="Filter states"
          aria-label="Filter states"
          value={filter}
          disabled={jumping}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 pb-2',
          jumping && 'pointer-events-none opacity-50'
        )}
      >
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
          ? groups.map((group) => {
              const open = openGroups.includes(group.id);
              return (
                <div key={group.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    className="yawp-dev-panel-state-group-trigger"
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className="yawp-dev-panel-state-group-title">{group.title}</span>
                    <span className="text-xs leading-4 text-muted-foreground">
                      {group.summary} · {group.states.length} states
                    </span>
                  </button>
                  {open ? (
                    <ul className="m-0 list-none pb-1">
                      {group.states.map((entry) => {
                        const isSelected = selected === entry.id;
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              disabled={jumping}
                              className={cn(
                                'yawp-dev-panel-state-option',
                                isSelected && 'yawp-dev-panel-state-option-selected'
                              )}
                              onClick={() => updateForms({ selectedStateId: entry.id })}
                            >
                              <span
                                className={cn(
                                  'yawp-dev-panel-state-radio',
                                  isSelected && 'yawp-dev-panel-state-radio-selected'
                                )}
                                aria-hidden="true"
                              >
                                {isSelected ? (
                                  <span className="yawp-dev-panel-state-radio-dot" />
                                ) : null}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-sm font-medium leading-5">
                                  {entry.label}
                                </span>
                                <span className="text-xs leading-4 text-muted-foreground">
                                  {entry.description}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })
          : null}
      </div>
      {jumpFailed ? (
        <div
          role="alert"
          className="mx-3 mb-2 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{jumpErrorMessage}</p>
            <p>
              Your choice is still selected. Try again, or pick another state.
            </p>
          </div>
        </div>
      ) : null}
      <footer className="yawp-dev-panel-flyout-footer">
        <div className="flex flex-col gap-2.5">
          <span className="text-xs leading-4 text-muted-foreground">Selected</span>
          <span className="-mt-2 text-sm font-medium leading-5">
            {selectedState?.label ?? 'None'}
          </span>
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
      </footer>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change {signedInName}&apos;s test data?</AlertDialogTitle>
            <AlertDialogDescription>
              Throwaway is off, so this jump sets {signedInName} to{' '}
              {selectedState?.label ?? 'the selected state'}. Their usage and approval status
              change. To change it again, jump to another state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runJump()}>
              Change data and jump
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
