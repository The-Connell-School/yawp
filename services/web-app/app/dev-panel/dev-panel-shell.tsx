import {
  ChevronDown,
  ChevronLeft,
  ChevronsRight,
  Copy,
  ExternalLink,
  FlaskConical,
  Loader2,
  Lock,
  MessageSquare,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { freeTierStateSummary } from './free-tier-states.catalog';
import { DevPanelOrgPicker } from './dev-panel-org-picker';
import { createDevPanelFeedbackContext } from './dev-panel-feedback-context';
import { DevPanelGiveFeedbackFlyout } from './dev-panel-give-feedback-flyout';
import {
  consumeDevPanelJumpToast,
  DevPanelFreeTierFlyout,
} from './dev-panel-free-tier-flyout';
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

function membershipRoleLabel(role: string | undefined) {
  if (!role) return '';
  const normalized = role.toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'owner') return 'Owner';
  if (normalized.includes('student')) return 'Student';
  return 'Teacher';
}

type LoginBucket = 'teachers' | 'admins' | 'students';

function loginBucket(role: string) {
  const normalized = role.toLowerCase();
  if (normalized.includes('student')) return 'students' as LoginBucket;
  if (
    normalized.includes('admin') ||
    normalized.includes('principal') ||
    normalized.includes('director') ||
    normalized.includes('owner')
  ) {
    return 'admins' as LoginBucket;
  }
  return 'teachers' as LoginBucket;
}

const LOGIN_SECTION_LABELS: Record<LoginBucket, string> = {
  teachers: 'Teachers',
  admins: 'Admins',
  students: 'Students',
};

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
    previewAccessSeatLabel,
    previewAccessGateEnabled,
  } = useDevPanel();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const isPhone = useMedia('(max-width: 639px)');
  const isPhonePortrait = useMedia(
    '(max-width: 639px) and (orientation: portrait)'
  );
  const isTablet = useMedia('(min-width: 640px) and (max-width: 1023px)');
  const [accessOpen, setAccessOpen] = useState(false);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const feedbackRowRef = useRef<HTMLButtonElement>(null);
  const freeTierRowRef = useRef<HTMLButtonElement>(null);
  const classSimulationRowRef = useRef<HTMLButtonElement>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [logins, setLogins] = useState<Array<{ email: string; label: string; role: string }>>([]);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const loginFetcher = useFetcher();
  const location = useLocation();
  const currentEmail = rootData?.user?.email ?? null;
  const signedInUser = rootData?.user ?? null;
  const signedInRole = membershipRoleLabel(
    signedInUser?.selectedMembership?.role ?? signedInUser?.memberships?.[0]?.role
  );
  const selectedOrg = state.org ?? orgs[0]?.id ?? null;
  const selectedOrgName =
    orgs.find((org) => org.id === selectedOrg)?.name ??
    orgs[0]?.name ??
    'Choose org';
  const freeTierSummary =
    freeTierStateSummary(state.forms.selectedStateId) ?? 'None';
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

  const showPhoneBottomSheet = isPhonePortrait;

  const panelBody = (
    <>
      <header className="yawp-dev-panel-header">
        <div className="yawp-dev-panel-header-title">
          <FlaskConical className="yawp-dev-panel-header-beaker shrink-0" aria-hidden="true" />
          <p
            ref={headingRef}
            tabIndex={-1}
            role="heading"
            aria-level={1}
            className="yawp-dev-panel-header-heading"
          >
            Developer tools
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="yawp-dev-panel-header-close size-7 shrink-0"
          aria-label="Close developer tools"
          aria-keyshortcuts="Alt+Shift+D"
          title="Close (Alt+Shift+D)"
          onClick={closePanel}
        >
          {showPhoneBottomSheet ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <ChevronsRight className="size-4" aria-hidden="true" />
          )}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
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
              <div className="yawp-dev-panel-user-row">
                {signedInUser ? (
                  <>
                    <span>Signed in</span>
                    <span className="yawp-dev-panel-user-name">
                      {signedInUser.name?.trim() || signedInUser.email}
                    </span>
                    {signedInRole ? <span>{signedInRole}</span> : null}
                    <span className="flex-1" aria-hidden="true" />
                    <Form
                      method="post"
                      action={`/auth/logout?redirectTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
                      className="shrink-0"
                    >
                      <button type="submit" className="yawp-dev-panel-user-signout">
                        Sign out
                      </button>
                    </Form>
                  </>
                ) : (
                  <>
                    <span>Signed out</span>
                    <span className="yawp-dev-panel-user-name min-w-0 flex-1">
                      Pick a login below
                    </span>
                  </>
                )}
              </div>

              <Collapsible
                open={state.openSections.includes('sign-in')}
                onOpenChange={() => toggleSection('sign-in')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span className="yawp-dev-panel-row-label">Sign in as</span>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="yawp-dev-panel-row-value max-w-[9rem] truncate">
                      {selectedOrgName}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-section-body space-y-2">
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
                  {(['teachers', 'admins', 'students'] as LoginBucket[]).map((bucket) => {
                    const bucketLogins = logins.filter(
                      (login) => loginBucket(login.role) === bucket
                    );
                    if (bucketLogins.length === 0) return null;
                    return (
                      <div key={bucket} className="flex flex-col">
                        <h4 className="yawp-dev-panel-login-section-title">
                          {LOGIN_SECTION_LABELS[bucket]}
                        </h4>
                        <ul className="m-0 list-none p-0">
                          {bucketLogins.map((login) => {
                            const isCurrent = currentEmail === login.email;
                            return (
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
                                  <div
                                    className={cn(
                                      'yawp-dev-panel-login-list-row',
                                      isCurrent && 'yawp-dev-panel-login-list-row-current'
                                    )}
                                  >
                                    <span className="shrink-0 font-medium">{login.label}</span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                      {login.role}
                                    </span>
                                    {isCurrent ? (
                                      <span className="shrink-0 pr-1.5 text-xs text-muted-foreground">
                                        Signed in
                                      </span>
                                    ) : (
                                      <button
                                        type="submit"
                                        className="yawp-dev-panel-login-signin-btn"
                                        aria-label={`Sign in as ${login.label}, ${login.role}`}
                                      >
                                        Sign in
                                      </button>
                                    )}
                                  </div>
                                </loginFetcher.Form>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>

              <button
                ref={freeTierRowRef}
                type="button"
                className={cn(
                  'yawp-dev-panel-row',
                  state.subSheet === 'free-tier-states' && 'yawp-dev-panel-row-active'
                )}
                onClick={() => openSubSheet('free-tier-states')}
              >
                <span className="yawp-dev-panel-row-label">Free-tier states</span>
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className={cn(
                      'yawp-dev-panel-row-value yawp-dev-panel-row-value-mono max-w-[10rem] truncate'
                    )}
                  >
                    {freeTierSummary}
                  </span>
                  <ChevronLeft className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                </span>
              </button>

              <Collapsible
                open={state.openSections.includes('blackboard')}
                onOpenChange={() => toggleSection('blackboard')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span className="yawp-dev-panel-row-label">Blackboard link</span>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="yawp-dev-panel-row-value max-w-[9rem] truncate">
                      LTI test launch
                    </span>
                    <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-section-body flex flex-col gap-2">
                  <p className="yawp-dev-panel-section-help">
                    Opens a mock Blackboard course in a new tab and launches Yawp! through
                    LTI.
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      id="dev-panel-bb-role-label"
                      className="w-16 shrink-0 text-xs text-muted-foreground"
                    >
                      Launch as
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby="dev-panel-bb-role-label"
                      className="yawp-dev-panel-bb-role-group"
                    >
                      {(['teacher', 'student'] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          role="radio"
                          aria-checked={(state.forms.blackboardRole ?? 'teacher') === role}
                          className="yawp-dev-panel-bb-role-pill capitalize"
                          onClick={() => updateForms({ blackboardRole: role })}
                        >
                          {role === 'teacher' ? 'Teacher' : 'Student'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="yawp-dev-panel-bb-launch"
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
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </button>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible
                open={state.openSections.includes('tester-tools')}
                onOpenChange={() => toggleSection('tester-tools')}
              >
                <CollapsibleTrigger className="yawp-dev-panel-row">
                  <span className="yawp-dev-panel-row-label">Tester tools</span>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="yawp-dev-panel-row-value">Copy URL</span>
                    <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="yawp-dev-panel-section-body flex flex-col gap-1.5">
                  <Label htmlFor="dev-panel-current-url" className="text-xs font-normal text-muted-foreground">
                    Current page
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="dev-panel-current-url"
                      readOnly
                      className="yawp-dev-panel-url-field"
                      value={`${location.pathname}${location.search}`}
                    />
                    <button
                      type="button"
                      className="yawp-dev-panel-copy-btn"
                      aria-label="Copy current page URL"
                      onClick={async () => {
                        await navigator.clipboard.writeText(window.location.href);
                      }}
                    >
                      <Copy className="size-3" aria-hidden="true" />
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
            </>
          )}
        </div>

        {unlocked ? (
          <div className="mt-auto border-t">
            <button
              ref={feedbackRowRef}
              type="button"
              className={cn(
                'yawp-dev-panel-row border-b-0',
                state.subSheet === 'give-feedback' && 'yawp-dev-panel-row-active'
              )}
              onClick={() => openSubSheet('give-feedback')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="yawp-dev-panel-row-label">Give feedback</span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="yawp-dev-panel-row-value max-w-[9rem] truncate">
                  {state.subSheet === 'give-feedback'
                    ? 'Writing…'
                    : 'Note, screenshot, URL'}
                </span>
                <ChevronLeft className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <footer className="yawp-dev-panel-footer">
        {unlocked && previewAccessGateEnabled ? (
          <Form method="post" action="/auth/preview-access">
            <input type="hidden" name="intent" value="sign-out" />
            <button type="submit" className="yawp-dev-panel-footer-access">
              Re-enter access code
            </button>
          </Form>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1" aria-label="Toggle Alt Shift D">
          <kbd className="yawp-dev-panel-kbd">Alt</kbd>
          <kbd className="yawp-dev-panel-kbd">Shift</kbd>
          <kbd className="yawp-dev-panel-kbd">D</kbd>
        </span>
      </footer>
      <AccessCodeModal open={accessOpen} onOpenChange={setAccessOpen} />
      {!isPhone && !isTablet && state.subSheet === 'give-feedback' ? (
        <DevPanelGiveFeedbackFlyout
          onClose={closeSubSheet}
          feedbackActions={() => feedbackContext.current.snapshot()}
        />
      ) : null}
      {!isPhone && !isTablet && state.subSheet === 'free-tier-states' ? (
        <DevPanelFreeTierFlyout
          onClose={closeSubSheet}
          orgId={selectedOrg}
          orgName={selectedOrgName}
          signedInDisplayName={
            signedInUser?.name?.trim() || signedInUser?.email || null
          }
        />
      ) : null}
      {!isPhone && !isTablet && state.subSheet === 'class-simulation' ? (
        <DevPanelClassSimulationFlyout onClose={closeSubSheet} />
      ) : null}
    </>
  );

  if (!state.open) return null;

  if (isPhone || isTablet) {
    const compactPanelContent =
      isPhone && state.subSheet === 'give-feedback' ? (
        <DevPanelGiveFeedbackFlyout
          onClose={closeSubSheet}
          pushed
          feedbackActions={() => feedbackContext.current.snapshot()}
        />
      ) : isPhone && state.subSheet === 'free-tier-states' ? (
        <DevPanelFreeTierFlyout
          onClose={closeSubSheet}
          orgId={selectedOrg}
          orgName={selectedOrgName}
          signedInDisplayName={
            signedInUser?.name?.trim() || signedInUser?.email || null
          }
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
              orgName={selectedOrgName}
              signedInDisplayName={
                signedInUser?.name?.trim() || signedInUser?.email || null
              }
              pushed
            />
          ) : null}
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
          className="relative flex h-full w-full max-w-none flex-col p-0 sm:max-w-[360px]"
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
        'yawp-dev-panel-docked fixed inset-y-0 right-0 z-40 flex flex-col bg-popover',
        'w-[var(--yawp-dev-panel-width)]'
      )}
    >
      {panelBody}
    </aside>
  );
}
