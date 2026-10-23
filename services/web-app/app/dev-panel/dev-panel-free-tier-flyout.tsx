import { ChevronLeft, Loader2 } from 'lucide-react';
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
import type { FreeTierJumpStep } from './free-tier-jump.server';

const JUMP_TOAST_KEY = 'yawp-dev-panel-jump-toast';

export function consumeDevPanelJumpToast() {
  if (typeof window === 'undefined') return;
  const label = window.sessionStorage.getItem(JUMP_TOAST_KEY);
  if (!label) return;
  window.sessionStorage.removeItem(JUMP_TOAST_KEY);
  toast.message(`Jumped to: ${label}`);
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
  const { state, updateForms } = useDevPanel();
  const [filter, setFilter] = useState('');
  const [jumping, setJumping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [switchSteps, setSwitchSteps] = useState<FreeTierJumpStep[] | null>(null);
  const [error, setError] = useState('');
  const throwawayRef = useRef<HTMLInputElement>(null);
  const filterId = useId();
  const selected = state.forms.selectedStateId ?? null;
  const throwaway = state.forms.throwawaySwitch !== false;

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

  const noMatches = filter.trim().length > 0 && groups.length === 0;

  const beginJump = () => {
    if (!selected || !orgId) return;
    if (!throwaway) {
      setConfirmOpen(true);
      return;
    }
    void runJump();
  };

  const runJump = async () => {
    if (!selected || !orgId) return;
    const found = findFreeTierState(selected);
    const pendingSteps: FreeTierJumpStep[] = [
      {
        id: 'account',
        label: throwaway ? 'Making test account…' : 'Using signed-in account…',
        done: false,
      },
      {
        id: 'state',
        label: found
          ? `Setting up ${found.state.label}…`
          : 'Setting up state…',
        done: false,
      },
      { id: 'reload', label: 'Reloading Yawp!…', done: false },
    ];
    setConfirmOpen(false);
    setJumping(true);
    setSwitchSteps(pendingSteps);
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
        setError(result?.error ?? 'Jump failed.');
        setJumping(false);
        setSwitchSteps(null);
        return;
      }
      const steps = (result.steps ?? pendingSteps) as FreeTierJumpStep[];
      setSwitchSteps(steps);
      if (found?.state.label) {
        window.sessionStorage.setItem(JUMP_TOAST_KEY, found.state.label);
      }
      window.setTimeout(() => {
        window.location.assign(result.redirectTo);
      }, 350);
    } catch {
      setError('Jump failed.');
      setJumping(false);
      setSwitchSteps(null);
    }
  };

  return (
    <div
      data-yawp-dev-panel-flyout
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
        {jumping && switchSteps ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3" role="status">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Switching…
            </p>
            <ol className="space-y-2 text-sm">
              {switchSteps.map((step) => (
                <li key={step.id} className="flex items-start gap-2">
                  <span aria-hidden="true">{step.done ? '✓' : '…'}</span>
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {!jumping ? (
          <>
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
              onChange={(event) => setFilter(event.target.value)}
            />
            {noMatches ? (
              <p className="text-sm text-muted-foreground">No states match</p>
            ) : null}
            {groups.map((group) => (
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
            ))}
          </>
        ) : null}
        {error ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={() => void runJump()}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
      <div className="border-t p-3">
        <Button
          type="button"
          className="w-full"
          disabled={!selected || jumping || !orgId}
          onClick={() => beginJump()}
        >
          {jumping ? 'Switching…' : 'Jump to this state'}
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
