import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Copy,
  Loader2,
  Lock,
  MessageSquare,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, useFetcher, useLocation, useRouteLoaderData } from 'react-router';
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
import { pe3FreeTierRowValue } from './dev-panel-pe3-states';
import { groupDevPanelLogins } from './dev-panel-login-groups';
import { DevPanelOrgPicker } from './dev-panel-org-picker';
import { createDevPanelFeedbackContext } from './dev-panel-feedback-context';
import { DevPanelGiveFeedbackInline } from './dev-panel-give-feedback-inline';
import { DevPanelFreeTierInline } from './dev-panel-free-tier-inline';
import { consumeDevPanelJumpToast } from './dev-panel-jump-toast';
import { DevPanelClassSimulationFlyout } from './dev-panel-class-simulation-flyout';
import { DevPanelMobileBottomSheet } from './dev-panel-mobile-bottom-sheet';

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

function truncatePanelLabel(value: string, max = 12) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function membershipRoleLabel(role: string | undefined) {
  if (!role) return '';
  const normalized = role.toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'owner') return 'Owner';
  if (normalized.includes('student')) return 'Student';
  return 'Teacher';
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
    unlocked,
    closePanel,
    toggleSection,
    openSubSheet,
    closeSubSheet,
    setOrg,
    updateForms,
  } = useDevPanel();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const isPhone = useMedia('(max-width: 639px)');
  const isPhonePortrait = useMedia(
    '(max-width: 639px) and (orientation: portrait)'
  );
  const isTablet = useMedia('(min-width: 640px) and (max-width: 1023px)');
  const [accessOpen, setAccessOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const classSimulationRowRef = useRef<HTMLButtonElement>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [logins, setLogins] = useState<Array<{ email: string; label: string; role: string }>>([]);
  const groupedLogins = useMemo(() => groupDevPanelLogins(logins), [logins]);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const loginFetcher = useFetcher();
  const location = useLocation();
  const currentEmail = rootData?.user?.email ?? null;
  const signedInUser = rootData?.user ?? null;
  const signedInRole = membershipRoleLabel(
    signedInUser?.selectedMembership?.role ?? signedInUser?.memberships?.[0]?.role
  );
  const selectedOrg = state.org ?? orgs[0]?.id ?? null;
  const freeTierSummary = pe3FreeTierRowValue(state.forms.selectedStateId);
  const signInRowValue = signedInUser
    ? `${signedInRole || 'User'} · ${truncatePanelLabel(
        signedInUser.name?.trim() || signedInUser.email || 'User'
      )}`
    : 'Signed out';
  const feedbackContext = useRef(createDevPanelFeedbackContext());
  const buildFooterLabel = rootData?.devPanelBuildFooter ?? '';

  useEffect(() => {
    consumeDevPanelJumpToast();
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
      if (state.subSheet === 'class-simulation') {
        closeSubSheet();
        window.requestAnimationFrame(() => classSimulationRowRef.current?.focus());
      }
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

  const showPhoneBottomSheet = isPhonePortrait;

  const panelBody = (
    <>
      <header className="yawp-dev-panel-header">
        <h2
          id="devtools-title"
          ref={headingRef}
          tabIndex={-1}
          className="yawp-dev-panel-header-heading min-w-0 flex-1 truncate"
        >
          Developer tools
        </h2>
        <button
          type="button"
          className="yawp-dev-panel-header-close"
          aria-label="Collapse developer tools"
          aria-keyshortcuts="Alt+Shift+D"
          title="Close (Alt+Shift+D)"
          onClick={closePanel}
        >
          {showPhoneBottomSheet ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <ChevronsRight className="size-4" aria-hidden="true" />
          )}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="yawp-dev-panel-scroll flex-1 overflow-y-auto">
          {!unlocked ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <div
                className="mb-4 flex size-12 items-center justify-center rounded-full border bg-muted/30"
                aria-hidden="true"
              >
                <Lock className="size-5 text-muted-foreground" />
              </div>
              <p className="font-medium">Developer tools are locked</p>
              <p className="mt-2 text-muted-foreground">
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
              <div className="yawp-dev-panel-section">
              <Collapsible
                open={state.openSections.includes('sign-in')}
                onOpenChange={() => toggleSection('sign-in')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span>Sign in as</span>
                  <span className="yawp-dev-panel-row-value yawp-dev-panel-row-value-mono">
                    {signInRowValue}
                  </span>
                  {state.openSections.includes('sign-in') ? (
                    <ChevronDown className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-collapsible-content yawp-dev-panel-inline-expanded-body">
                  <DevPanelOrgPicker
                    orgs={orgs}
                    value={selectedOrg}
                    onChange={setOrg}
                  />
                  {loginState === 'loading' ? (
                    <p role="status" className="text-muted-foreground">
                      Loading quick logins…
                    </p>
                  ) : null}
                  {loginState === 'empty' ? (
                    <p className="text-muted-foreground">
                      No quick logins for this org. Ask the team if you expected some.
                    </p>
                  ) : null}
                  {loginState === 'error' ? (
                    <p role="alert" className="text-destructive">
                      Could not load quick logins. Try again.
                    </p>
                  ) : null}
                  {groupedLogins.map((group) => (
                    <div key={group.key}>
                      <p className="yawp-dev-panel-login-group-title">{group.title}</p>
                      <ul className="m-0 list-none p-0">
                        {group.logins.map((login) => (
                          <li key={login.email}>
                            <loginFetcher.Form
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
                                className={cn(
                                  'yawp-dev-panel-login-row',
                                  currentEmail === login.email &&
                                    'yawp-dev-panel-login-row-current'
                                )}
                                aria-label={`Sign in as ${login.label}, ${login.role}`}
                              >
                                <span className="yawp-dev-panel-login-label">{login.label}</span>
                                <span className="yawp-dev-panel-login-role">{login.role}</span>
                                {currentEmail === login.email ? (
                                  <span className="shrink-0 pr-1.5 text-xs text-muted-foreground">
                                    Signed in
                                  </span>
                                ) : (
                                  <span className="yawp-dev-panel-sign-in-pill">Sign in</span>
                                )}
                              </button>
                            </loginFetcher.Form>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
              </div>

              <div className="yawp-dev-panel-section">
              <Collapsible
                open={state.openSections.includes('free-tier-states')}
                onOpenChange={() => toggleSection('free-tier-states')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span>Free-tier states</span>
                  <span className="yawp-dev-panel-row-value yawp-dev-panel-row-value-mono">
                    {freeTierSummary}
                  </span>
                  {state.openSections.includes('free-tier-states') ? (
                    <ChevronDown className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-collapsible-content yawp-dev-panel-inline-expanded-body">
                  <DevPanelFreeTierInline
                    orgId={selectedOrg}
                    sectionOpen={state.openSections.includes('free-tier-states')}
                  />
                </CollapsibleContent>
              </Collapsible>
              </div>

              <div className="yawp-dev-panel-section">
              <Collapsible
                open={state.openSections.includes('blackboard')}
                onOpenChange={() => toggleSection('blackboard')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span>Blackboard link</span>
                  <span className="yawp-dev-panel-row-spacer" aria-hidden="true" />
                  {state.openSections.includes('blackboard') ? (
                    <ChevronDown className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-collapsible-content yawp-dev-panel-inline-expanded-body">
                  <div className="flex items-center gap-2 px-0 py-1">
                    <span
                      id="dev-panel-bb-role-label"
                      className="w-16 shrink-0 text-xs text-muted-foreground"
                    >
                      Launch as
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby="dev-panel-bb-role-label"
                      className="yawp-dev-panel-segmented yawp-dev-panel-segmented-inline flex-1"
                    >
                      {(['teacher', 'student'] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          role="radio"
                          aria-checked={(state.forms.blackboardRole ?? 'teacher') === role}
                          className={cn(
                            'yawp-dev-panel-segment flex-1 capitalize',
                            (state.forms.blackboardRole ?? 'teacher') === role &&
                              'yawp-dev-panel-segment-active'
                          )}
                          onClick={() => updateForms({ blackboardRole: role })}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="yawp-dev-panel-pill-action h-[var(--yawp-dev-panel-btn-height)] w-full"
                    onClick={async () => {
                      const response = await fetch('/api/dev-panel/blackboard-launch', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          role: state.forms.blackboardRole ?? 'teacher',
                        }),
                      });
                      const result = await response.json().catch(() => null);
                      if (!response.ok) {
                        window.alert(result?.error ?? 'Launch refused.');
                        return;
                      }
                      window.open(result.launchUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Open Blackboard launch
                  </Button>
                </CollapsibleContent>
              </Collapsible>
              </div>

              <div className="yawp-dev-panel-section">
              <Collapsible
                open={state.openSections.includes('tester-tools')}
                onOpenChange={() => toggleSection('tester-tools')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span>Tester tools</span>
                  <span className="yawp-dev-panel-row-spacer" aria-hidden="true" />
                  {state.openSections.includes('tester-tools') ? (
                    <ChevronDown className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-collapsible-content yawp-dev-panel-inline-expanded-body">
                  <div className="flex items-center gap-1.5 py-1">
                    <input
                      id="dev-panel-current-url"
                      readOnly
                      aria-label="Current page URL"
                      value={`${location.pathname}${location.search}`}
                      className="yawp-dev-panel-inline-mono min-w-0 flex-1 bg-transparent px-0 font-mono text-xs outline-none"
                    />
                    <button
                      type="button"
                      className="yawp-dev-panel-text-action shrink-0"
                      aria-label="Copy current page URL"
                      onClick={async () => {
                        await navigator.clipboard.writeText(window.location.href);
                      }}
                    >
                      <Copy className="mr-1 inline size-3" aria-hidden="true" />
                      Copy
                    </button>
                  </div>
                  <button
                    ref={classSimulationRowRef}
                    type="button"
                    className={cn(
                      'yawp-dev-panel-login-row w-full',
                      state.subSheet === 'class-simulation' && 'bg-accent/55'
                    )}
                    onClick={() => {
                      updateForms({ simulationOpenAction: null });
                      openSubSheet('class-simulation');
                    }}
                  >
                    <span className="truncate font-medium">Populate class</span>
                    <ChevronLeft className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="yawp-dev-panel-login-row w-full"
                    onClick={() => {
                      updateForms({ simulationOpenAction: 'clear-confirm' });
                      openSubSheet('class-simulation');
                    }}
                  >
                    <span className="truncate font-medium">Clear simulated data</span>
                    <ChevronLeft className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  </button>
                </CollapsibleContent>
              </Collapsible>
              </div>
            </>
          )}
        </div>

        {unlocked ? (
          <div className="yawp-dev-panel-feedback-section mt-auto">
            <div className="yawp-dev-panel-section">
            <Collapsible
              open={state.openSections.includes('give-feedback')}
              onOpenChange={() => toggleSection('give-feedback')}
            >
              <CollapsibleTrigger className="yawp-dev-panel-feedback-row">
                <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="shrink-0 font-semibold">Give feedback</span>
                <span className="yawp-dev-panel-row-spacer" aria-hidden="true" />
                {state.openSections.includes('give-feedback') ? (
                  <ChevronDown className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronRight className="yawp-dev-panel-row-chevron size-3.5 shrink-0" aria-hidden="true" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="yawp-dev-panel-collapsible-content yawp-dev-panel-inline-expanded-body">
                <DevPanelGiveFeedbackInline
                  sectionOpen={state.openSections.includes('give-feedback')}
                  feedbackActions={() => feedbackContext.current.snapshot()}
                />
              </CollapsibleContent>
            </Collapsible>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="yawp-dev-panel-footer">
        <span className="yawp-dev-panel-footer-build">{buildFooterLabel}</span>
        <button type="button" className="yawp-dev-panel-hide-tools" onClick={closePanel}>
          Hide tools
        </button>
      </footer>
      <AccessCodeModal open={accessOpen} onOpenChange={setAccessOpen} />
      {!isPhone && !isTablet && state.subSheet === 'class-simulation' ? (
        <DevPanelClassSimulationFlyout onClose={closeSubSheet} />
      ) : null}
    </>
  );

  if (!state.open) return null;

  if (isPhone || isTablet) {
    const compactPanelContent =
      isPhone && state.subSheet === 'class-simulation' ? (
        <DevPanelClassSimulationFlyout onClose={closeSubSheet} pushed />
      ) : (
        <>
          {panelBody}
          {isTablet && state.subSheet === 'class-simulation' ? (
            <DevPanelClassSimulationFlyout onClose={closeSubSheet} pushed />
          ) : null}
        </>
      );

    if (showPhoneBottomSheet) {
      return (
        <DevPanelMobileBottomSheet
          open={state.open}
          onOpenChange={(open) => !open && closePanel()}
        >
          {compactPanelContent}
        </DevPanelMobileBottomSheet>
      );
    }

    return (
      <Sheet open={state.open} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="yawp-dev-panel-mobile-sheet relative flex h-full w-full max-w-none flex-col p-0 sm:max-w-[360px] data-[state=open]:animate-none data-[state=closed]:animate-none"
          data-yawp-dev-panel
          data-yawp-dev-panel-ready="true"
          id="devtools"
          role={isPhone ? 'dialog' : undefined}
          aria-modal={isPhone ? true : undefined}
        >
          {compactPanelContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      id="devtools"
      data-yawp-dev-panel
      data-yawp-dev-panel-ready="true"
      aria-label="Developer tools"
      className={cn(
        'yawp-dev-panel-docked fixed inset-y-0 right-0 z-40 flex flex-col',
        'w-[var(--yawp-dev-panel-width)]'
      )}
    >
      {panelBody}
    </aside>
  );
}
