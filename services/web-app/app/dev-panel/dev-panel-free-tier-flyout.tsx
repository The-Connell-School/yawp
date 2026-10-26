import { ChevronLeft, CircleAlert, Loader2, Search, X } from 'lucide-react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import {
  FREE_TIER_STATE_GROUPS,
  findFreeTierState,
  freeTierGroupSubtitle,
  freeTierStateSummary,
  isCatalogFreeTierJumpLabel,
} from './free-tier-states.catalog';
import {
  FREE_TIER_JUMP_GENERIC_ERROR,
  formatFreeTierJumpErrorForClient,
} from './free-tier-jump-messages';

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
  orgName,
  signedInDisplayName,
  pushed,
}: {
  onClose: () => void;
  orgId: string | null;
  orgName?: string | null;
  signedInDisplayName?: string | null;
  pushed?: boolean;
}) {
  const { state, updateForms, flyoutSwitchInstant } = useDevPanel();
  const [filter, setFilter] = useState('');
  const [jumping, setJumping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [jumpErrorMessage, setJumpErrorMessage] = useState(
    FREE_TIER_JUMP_GENERIC_ERROR
  );
  const throwawayId = useId();
  const throwawayHelpId = useId();
  const filterId = useId();
  const isPhone = useMedia('(max-width: 639px)');
  const selected = state.forms.selectedStateId ?? null;
  const activeStateId = state.forms.activeStateId ?? null;
  const throwaway = state.forms.throwawaySwitch !== false;
  const signedInName = signedInDisplayName?.trim() || 'Your account';

  const initialOpenGroups = useMemo(() => {
    const focusId = selected ?? activeStateId;
    if (focusId) {
      const found = findFreeTierState(focusId);
      if (found) return [found.group.id];
    }
    return ['approved'];
  }, [activeStateId, selected]);

  useEffect(() => {
    if (state.subSheet !== 'free-tier-states') return;
    const focusFirst = () => {
      document.getElementById(throwawayId)?.focus({ preventScroll: true });
    };
    window.setTimeout(focusFirst, 0);
  }, [state.subSheet, throwawayId]);

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
  const selectedSummary = selected ? freeTierStateSummary(selected) : null;

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
      updateForms({ activeStateId: selected });
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

  const throwawayHelp = orgName
    ? `Each jump makes a fresh test teacher at ${orgName}. ${signedInName}'s data isn't touched.`
    : `Each jump makes a fresh test teacher. ${signedInName}'s data isn't touched.`;

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
          : 'yawp-dev-panel-flyout-docked absolute inset-y-0 right-full z-10'
      )}
      role="dialog"
      aria-label="Free-tier states"
    >
      <div className="yawp-dev-panel-flyout-header">
        {pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : null}
        <h2 className="min-w-0 flex-1">Free-tier states</h2>
        {!pushed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Close free-tier states"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="yawp-dev-panel-flyout-intro flex flex-col gap-3">
        <p className="m-0 text-sm leading-5">
          Pick a state, then jump. Yawp! reloads straight into it.
        </p>
        <div className="flex gap-3">
          <Switch
            id={throwawayId}
            checked={throwaway}
            disabled={jumping}
            aria-describedby={throwawayHelpId}
            onCheckedChange={(checked) => updateForms({ throwawaySwitch: checked })}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor={throwawayId}>Use a throwaway test account</Label>
            <span id={throwawayHelpId} className="text-xs text-muted-foreground">
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
          className="h-8 rounded-sm px-2 py-1"
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div
        className={cn(
          'flex-1 overflow-y-auto px-4',
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
        ) : (
          <Accordion type="multiple" defaultValue={initialOpenGroups} className="w-full">
            {groups.map((group) => (
              <AccordionItem key={group.id} value={group.id} className="border-b">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <span className="flex flex-col items-start gap-0.5 text-left">
                    <span className="text-[15px] font-bold text-foreground">
                      {group.title}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {freeTierGroupSubtitle(group)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-0">
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pb-1">
                    {group.states.map((entry) => {
                      const isSelected = selected === entry.id;
                      const isCurrent = activeStateId === entry.id;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            aria-current={isCurrent ? 'true' : undefined}
                            className={cn(
                              'yawp-dev-panel-state-option',
                              isSelected && 'yawp-dev-panel-state-option-selected'
                            )}
                            disabled={jumping}
                            onClick={() => updateForms({ selectedStateId: entry.id })}
                          >
                            <span className="yawp-dev-panel-state-radio" aria-hidden="true">
                              {isSelected ? (
                                <span className="yawp-dev-panel-state-radio-dot" />
                              ) : null}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-sm font-medium">{entry.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {entry.description}
                              </span>
                            </span>
                            {isCurrent ? (
                              <Badge variant="secondary" className="shrink-0 px-1.5 py-0.5 text-xs">
                                Current
                              </Badge>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
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

      <footer className="border-t bg-popover px-4 pb-4 pt-3.5">
        <div className="flex flex-col gap-2.5">
          <span className="text-xs text-muted-foreground">Selected</span>
          <span className="-mt-2 text-sm font-medium">
            {selectedSummary ?? 'None'}
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
