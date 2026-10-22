import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FlaskConical,
  Loader2,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import type { loader as rootLoader } from '~/root';
import { captureFeedbackScreenshot } from './capture-feedback-screenshot';
import { useDevPanel } from './dev-panel-provider';
import {
  FREE_TIER_STATE_GROUPS,
  freeTierStateSummary,
} from './free-tier-states.catalog';
import { feedbackPath } from '~/utils/demo-feedback-context';

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
              disabled={checking || !code.trim()}
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

function GiveFeedbackSheet() {
  const { state, closeSubSheet, updateForms, clearFeedbackForm } = useDevPanel();
  const location = useLocation();
  const path = feedbackPath(location.pathname + location.search);
  const noteId = useId();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const note = state.forms.feedbackNote ?? '';

  useEffect(() => {
    if (state.subSheet !== 'give-feedback') return;
    void captureFeedbackScreenshot().then(setScreenshot).catch(() => setScreenshot(null));
  }, [state.subSheet]);

  if (state.subSheet !== 'give-feedback' || !path) return null;

  const submit = async () => {
    if (!note.trim()) {
      setError('Add a note before sending.');
      document.getElementById(noteId)?.focus();
      return;
    }
    setStatus('submitting');
    setError('');
    try {
      const response = await fetch('/api/demo-feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: note.trim(),
          url: path,
          actions: [],
          screenshot,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setError(result?.error ?? 'Could not send feedback.');
        setStatus('error');
        return;
      }
      setStatus('sent');
      clearFeedbackForm();
    } catch {
      setError('Could not send feedback.');
      setStatus('error');
    }
  };

  return (
    <div
      className="absolute inset-y-0 left-0 z-10 flex w-full max-w-md flex-col border-r bg-background shadow-lg md:-translate-x-full"
      role="dialog"
      aria-label="Give feedback"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">Give feedback</h2>
        <Button type="button" variant="ghost" size="sm" onClick={closeSubSheet}>
          Close
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {status === 'sent' ? (
          <div className="space-y-3">
            <p role="status">Feedback saved. Thank you.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus('idle');
                updateForms({ feedbackNote: '' });
              }}
            >
              Send more feedback
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Goes straight to the Yawp! team, with a screenshot and this page&apos;s URL.
            </p>
            <div className="space-y-1">
              <Label htmlFor={noteId}>Note</Label>
              <Textarea
                id={noteId}
                rows={6}
                maxLength={2000}
                value={note}
                disabled={status === 'submitting'}
                onChange={(event) => {
                  updateForms({ feedbackNote: event.target.value });
                  if (error) setError('');
                }}
                aria-describedby={error ? 'dev-panel-feedback-error' : undefined}
              />
              <p className="text-xs text-muted-foreground">{note.length} / 2000</p>
              {error ? (
                <p id="dev-panel-feedback-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            {screenshot ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Screenshot</p>
                <img src={screenshot} alt="Automatic screenshot of the page" className="max-h-32 rounded border" />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Page URL</Label>
              <Input readOnly value={path} />
            </div>
          </>
        )}
      </div>
      {status !== 'sent' ? (
        <div className="border-t p-4">
          <Button
            type="button"
            className="w-full"
            disabled={status === 'submitting'}
            onClick={() => void submit()}
          >
            {status === 'submitting' ? 'Sending…' : 'Send feedback'}
          </Button>
        </div>
      ) : null}
    </div>
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
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [logins, setLogins] = useState<Array<{ email: string; label: string; role: string }>>([]);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const loginFetcher = useFetcher();
  const location = useLocation();
  const currentEmail = rootData?.user?.email ?? null;
  const selectedOrg = state.org ?? orgs[0]?.id ?? null;
  const feedbackPathValue = feedbackPath(location.pathname + location.search);

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
          <div className="space-y-4 px-2 py-2">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center gap-2 font-medium">
                <Lock className="size-4" aria-hidden="true" />
                Developer tools are locked
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter the access code to use quick logins, state jumps and the Blackboard link on demo and dev.
              </p>
              <Button type="button" className="mt-3 w-full" onClick={() => setAccessOpen(true)}>
                Enter access code
              </Button>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {['Sign in as', 'Free-tier states', 'Blackboard link', 'Tester tools'].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Lock className="size-3.5" aria-hidden="true" />
                    {item}
                  </li>
                )
              )}
            </ul>
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
                <label className="text-xs font-medium" htmlFor="dev-panel-org">
                  Org
                </label>
                <select
                  id="dev-panel-org"
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={selectedOrg ?? ''}
                  onChange={(event) => setOrg(event.target.value)}
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
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

            <Collapsible
              open={state.openSections.includes('free-tier-states')}
              onOpenChange={() => toggleSection('free-tier-states')}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent">
                <span>
                  Free-tier states
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {freeTierStateSummary(state.forms.selectedStateId) ??
                      'Choose a state to jump to'}
                  </span>
                </span>
                <ChevronDown className="size-4" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 pb-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => openSubSheet('free-tier-states')}
                >
                  Choose a state to jump to
                </Button>
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

      {feedbackPathValue ? (
        <div className="border-t px-2 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
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
      <GiveFeedbackSheet />
      {state.subSheet === 'free-tier-states' ? (
        <FreeTierStatesSheet onClose={closeSubSheet} orgId={selectedOrg} />
      ) : null}
    </>
  );

  if (!state.open) return null;

  if (isPhone || isTablet) {
    return (
      <Sheet open={state.open} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent
          side="right"
          className="flex w-full max-w-none flex-col p-0 sm:max-w-[360px]"
          data-yawp-dev-panel
          id="devtools"
          role={isPhone ? 'dialog' : undefined}
          aria-modal={isPhone ? true : undefined}
        >
          {isPhone && state.subSheet ? (
            <FreeTierStatesSheet
              onClose={closeSubSheet}
              orgId={selectedOrg}
              pushed
            />
          ) : (
            panelBody
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

function FreeTierStatesSheet({
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
  const [error, setError] = useState('');
  const selected = state.forms.selectedStateId ?? null;
  const throwaway = state.forms.throwawaySwitch !== false;

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

  const jump = async () => {
    if (!selected || !orgId) return;
    if (!throwaway) {
      const ok = window.confirm(
        'Turn off throwaway mode will change the signed-in account. Continue?'
      );
      if (!ok) return;
    }
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
        setError(result?.error ?? 'Jump failed.');
        setJumping(false);
        return;
      }
      window.location.assign(result.redirectTo);
    } catch {
      setError('Jump failed.');
      setJumping(false);
    }
  };

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex flex-col bg-background',
        pushed ? 'relative inset-auto min-h-full' : 'md:left-auto md:w-[420px]'
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
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>Use a throwaway test account</span>
          <input
            type="checkbox"
            checked={throwaway}
            onChange={(event) => updateForms({ throwawaySwitch: event.target.checked })}
          />
        </label>
        <Input
          placeholder="Filter states"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
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
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="border-t p-3">
        <Button
          type="button"
          className="w-full"
          disabled={!selected || jumping}
          onClick={() => void jump()}
        >
          {jumping ? 'Switching…' : 'Jump to this state'}
        </Button>
      </div>
    </div>
  );
}
