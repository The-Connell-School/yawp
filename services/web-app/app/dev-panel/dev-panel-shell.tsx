import {
  ChevronDown,
  ChevronRight,
  Copy,
  FlaskConical,
  Loader2,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Form, useFetcher, useLocation, useRouteLoaderData } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import type { loader as rootLoader } from '~/root';
import { useDevPanel } from './dev-panel-provider';
import { freeTierStateSummary } from './free-tier-states.catalog';
import { DevPanelOrgPicker } from './dev-panel-org-picker';
import { createDevPanelFeedbackContext } from './dev-panel-feedback-context';
import { DevPanelGiveFeedbackFlyout } from './dev-panel-give-feedback-flyout';
import {
  consumeDevPanelJumpToast,
  DevPanelFreeTierFlyout,
} from './dev-panel-free-tier-flyout';
import { DevPanelClassSimulationFlyout } from './dev-panel-class-simulation-flyout';

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

function AccessCodeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setPreviewAccessSeatLabel } = useDevPanel();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const submit = async () => {
    setChecking(true);
    setError('');
    try {
      const response = await fetch('/api/dev-panel/preview-access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error ?? 'That access code did not work.');
        return;
      }
      setPreviewAccessSeatLabel(result.seatLabel ?? 'Preview seat');
      setUnlocked(true);
    } catch {
      setError('Could not verify the access code.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="dev-panel-access-desc">
        <DialogTitle>Enter access code</DialogTitle>
        <DialogDescription id="dev-panel-access-desc">
          Unlock developer tools on this environment.
        </DialogDescription>
        {unlocked ? (
          <div className="space-y-4">
            <p role="status">Access code accepted.</p>
            <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="dev-panel-access-code">Access code</Label>
            <Input
              id="dev-panel-access-code"
              autoComplete="off"
              value={code}
              disabled={checking}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'dev-panel-access-error' : undefined}
            />
            {error ? (
              <p id="dev-panel-access-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={checking || code.length === 0}
              onClick={() => void submit()}
            >
              {checking ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                'Unlock'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DevPanelShell() {
  const {
    state,
    envBadge,
    unlocked,
    closePanel,
    toggleSection,
    openSubSheet,
    closeSubSheet,
    setOrg,
    updateForms,
    previewAccessSeatLabel,
    previewAccessGateEnabled,
  } = useDevPanel();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const isPhone = useMedia('(max-width: 639px)');
  const isTablet = useMedia('(min-width: 640px) and (max-width: 1023px)');
  const [accessOpen, setAccessOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRowRef = useRef<HTMLButtonElement>(null);
  const freeTierRowRef = useRef<HTMLButtonElement>(null);
  const classSimulationRowRef = useRef<HTMLButtonElement>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [logins, setLogins] = useState<Array<{ email: string; label: string; role: string }>>([]);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const loginFetcher = useFetcher();
  const location = useLocation();
  const currentEmail = rootData?.user?.email ?? null;
  const selectedOrg = state.org ?? orgs[0]?.id ?? null;
  const feedbackContext = useRef(createDevPanelFeedbackContext());

  useEffect(() => {
    consumeDevPanelJumpToast();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      root.classList.toggle('yawp-dev-panel-reduced-motion', media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!state.subSheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        document.querySelector(
          '[role=alertdialog],[data-state=open][aria-modal=true]'
        )
      ) {
        return;
      }
      event.preventDefault();
      const returningTo =
        state.subSheet === 'give-feedback'
          ? feedbackRowRef
          : state.subSheet === 'class-simulation'
            ? classSimulationRowRef
            : freeTierRowRef;
      closeSubSheet();
      window.requestAnimationFrame(() => returningTo.current?.focus());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeSubSheet, state.subSheet]);

  useEffect(() => {
    if (!state.open) return;
    feedbackContext.current.route(location.pathname + location.search);
  }, [state.open, location.pathname, location.search]);

  useEffect(() => {
    if (!state.open) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (
        event.target.closest(
          'input, textarea, select, [contenteditable], [data-yawp-dev-panel]'
        )
      ) {
        return;
      }
      const control = event.target.closest(
        'button, a, [role="button"], [role="link"]'
      );
      if (control) {
        feedbackContext.current.click(
          control.matches('a, [role="link"]') ? 'link' : 'button',
          location.pathname + location.search
        );
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [state.open, location.pathname, location.search]);

  useEffect(() => {
    if (!state.open) return;
    headingRef.current?.focus();
  }, [state.open]);

  useEffect(() => {
    if (!state.open || !unlocked) return;
    void fetch('/api/dev-panel/orgs', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => {
        const list = data.organizations ?? [];
        setOrgs(list);
        if (!state.org && list[0]?.id) setOrg(list[0].id);
      })
      .catch(() => setOrgs([]));
  }, [setOrg, state.open, state.org, unlocked]);

  useEffect(() => {
    if (!selectedOrg || !unlocked) return;
    setLoginState('loading');
    void fetch(`/api/dev-panel/logins?orgId=${encodeURIComponent(selectedOrg)}`, {
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('failed');
        return response.json();
      })
      .then((page) => {
        setLogins(page.options ?? []);
        setLoginState(page.options?.length ? 'idle' : 'empty');
      })
      .catch(() => setLoginState('error'));
  }, [selectedOrg, unlocked]);

  const panelBody = (
    <>
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-slate-900" aria-hidden="true" />
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold text-slate-900"
            >
              Developer tools
            </h1>
            <Badge variant="secondary" aria-label={`Environment: ${envBadge}`}>
              {envBadge}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close developer tools"
          onClick={closePanel}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!unlocked ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <div
              className="mb-4 flex size-12 items-center justify-center rounded-full border bg-muted/30"
              aria-hidden="true"
            >
              <Lock className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium">Developer tools are locked</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the access code to use them in this browser.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full max-w-xs"
              onClick={() => setAccessOpen(true)}
            >
              Enter access code
            </Button>
          </div>
        ) : (
          <>
            <Collapsible
              open={state.openSections.includes('sign-in')}
              onOpenChange={() => toggleSection('sign-in')}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                Sign in as
                <ChevronDown className="size-4" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 pb-2">
                <DevPanelOrgPicker
                  orgs={orgs}
                  value={selectedOrg}
                  onChange={setOrg}
                />
                {loginState === 'loading' ? (
                  <p role="status" className="mt-2 text-xs text-muted-foreground">
                    Loading quick logins…
                  </p>
                ) : null}
                {loginState === 'empty' ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No quick logins for this org. Ask the team if you expected some.
                  </p>
                ) : null}
                {loginState === 'error' ? (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    Could not load quick logins. Try again.
                  </p>
                ) : null}
                <div className="mt-2 space-y-1">
                  {logins.map((login) => (
                    <loginFetcher.Form
                      key={login.email}
                      method="post"
                      action="/auth/dev-login"
                      className="block"
                    >
                      <input type="hidden" name="email" value={login.email} />
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={`${location.pathname}${location.search}`}
                      />
                      <button
                        type="submit"
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                        aria-label={`Sign in as ${login.label}, ${login.role}`}
                      >
                        <span>{login.label}</span>
                        {currentEmail === login.email ? (
                          <span className="text-xs text-muted-foreground">Signed in</span>
                        ) : (
                          <span className="text-xs text-primary">Sign in</span>
                        )}
                      </button>
                    </loginFetcher.Form>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <button
              ref={freeTierRowRef}
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent',
                state.subSheet === 'free-tier-states' && 'bg-accent/60'
              )}
              onClick={() => openSubSheet('free-tier-states')}
            >
              <span>
                Free-tier states
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {freeTierStateSummary(state.forms.selectedStateId) ??
                    'Choose a state to jump to'}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </button>

            <Collapsible
              open={state.openSections.includes('data')}
              onOpenChange={() => toggleSection('data')}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                Data
                <ChevronDown className="size-4" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 px-2 pb-2">
                <button
                  ref={classSimulationRowRef}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent',
                    state.subSheet === 'class-simulation' && 'bg-accent/60'
                  )}
                  onClick={() => openSubSheet('class-simulation')}
                >
                  <span>
                    <span className="font-medium">Populate class</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Fake students and assignment progress
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent',
                    state.subSheet === 'class-simulation' && 'bg-accent/60'
                  )}
                  onClick={() => openSubSheet('class-simulation')}
                >
                  <span>
                    <span className="font-medium">Clear simulated data</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Remove only dev-panel simulated rows
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible
              open={state.openSections.includes('blackboard')}
              onOpenChange={() => toggleSection('blackboard')}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                Blackboard link
                <ChevronDown className="size-4" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 pb-2 space-y-2">
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={state.forms.blackboardRole ?? 'teacher'}
                  onChange={(event) =>
                    updateForms({
                      blackboardRole: event.target.value as 'teacher' | 'student',
                    })
                  }
                >
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
                <Button
                  type="button"
                  className="w-full"
                  onClick={async () => {
                    const response = await fetch('/api/dev-panel/blackboard-launch', {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ role: state.forms.blackboardRole ?? 'teacher' }),
                    });
                    const result = await response.json().catch(() => null);
                    if (!response.ok) {
                      window.alert(result?.error ?? 'Launch refused.');
                      return;
                    }
                    window.open(result.launchUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open Blackboard
                </Button>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible
              open={state.openSections.includes('tester-tools')}
              onOpenChange={() => toggleSection('tester-tools')}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                Tester tools
                <ChevronDown className="size-4" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 px-2 pb-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                  }}
                >
                  <Copy className="mr-2 size-4" aria-hidden="true" />
                  Copy current URL
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>

      {unlocked ? (
        <div className="border-t px-2 py-2">
          <button
            ref={feedbackRowRef}
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent',
              state.subSheet === 'give-feedback' && 'bg-accent/60'
            )}
            onClick={() => openSubSheet('give-feedback')}
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-sm font-medium">Give feedback</span>
              <span className="block text-xs text-muted-foreground">
                Note, screenshot and page URL
              </span>
            </span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <footer className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        {unlocked && previewAccessGateEnabled ? (
          <Form method="post" action="/auth/preview-access">
            <input type="hidden" name="intent" value="sign-out" />
            <button type="submit" className="text-destructive underline-offset-2 hover:underline">
              Re-enter access code
            </button>
          </Form>
        ) : (
          <span />
        )}
        <span>Toggle Alt Shift D</span>
      </footer>
      <AccessCodeModal open={accessOpen} onOpenChange={setAccessOpen} />
      {!isPhone && !isTablet && state.subSheet === 'give-feedback' ? (
        <DevPanelGiveFeedbackFlyout
          onClose={closeSubSheet}
          feedbackActions={() => feedbackContext.current.snapshot()}
        />
      ) : null}
      {!isPhone && !isTablet && state.subSheet === 'free-tier-states' ? (
        <DevPanelFreeTierFlyout onClose={closeSubSheet} orgId={selectedOrg} />
      ) : null}
      {!isPhone && !isTablet && state.subSheet === 'class-simulation' ? (
        <DevPanelClassSimulationFlyout onClose={closeSubSheet} />
      ) : null}
    </>
  );

  if (!state.open) return null;

  if (isPhone || isTablet) {
    return (
      <Sheet open={state.open} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="relative flex w-full max-w-none flex-col p-0 sm:max-w-[360px]"
          data-yawp-dev-panel
          id="devtools"
          role={isPhone ? 'dialog' : undefined}
          aria-modal={isPhone ? true : undefined}
        >
          {isPhone && state.subSheet === 'give-feedback' ? (
            <DevPanelGiveFeedbackFlyout
              onClose={closeSubSheet}
              pushed
              feedbackActions={() => feedbackContext.current.snapshot()}
            />
          ) : isPhone && state.subSheet === 'free-tier-states' ? (
            <DevPanelFreeTierFlyout
              onClose={closeSubSheet}
              orgId={selectedOrg}
              pushed
            />
          ) : isPhone && state.subSheet === 'class-simulation' ? (
            <DevPanelClassSimulationFlyout onClose={closeSubSheet} pushed />
          ) : (
            <>
              {panelBody}
              {isTablet && state.subSheet === 'give-feedback' ? (
                <DevPanelGiveFeedbackFlyout
                  onClose={closeSubSheet}
                  pushed
                  feedbackActions={() => feedbackContext.current.snapshot()}
                />
              ) : null}
              {isTablet && state.subSheet === 'free-tier-states' ? (
                <DevPanelFreeTierFlyout
                  onClose={closeSubSheet}
                  orgId={selectedOrg}
                  pushed
                />
              ) : null}
              {isTablet && state.subSheet === 'class-simulation' ? (
                <DevPanelClassSimulationFlyout onClose={closeSubSheet} pushed />
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      id="devtools"
      data-yawp-dev-panel
      aria-label="Developer tools"
      className={cn(
        'yawp-dev-panel-docked fixed inset-y-0 right-0 z-40 flex flex-col border-l bg-background shadow-xl',
        'w-[var(--yawp-dev-panel-width)]'
      )}
    >
      {panelBody}
    </aside>
  );
}
