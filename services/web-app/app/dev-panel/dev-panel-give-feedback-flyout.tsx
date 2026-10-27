import {
  Check,
  ChevronLeft,
  CircleAlert,
  Loader2,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useRouteLoaderData } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import type { loader as rootLoader } from '~/root';
import { captureFeedbackScreenshot } from './capture-feedback-screenshot';
import { compressFeedbackScreenshot } from './compress-feedback-screenshot';
import { useDevPanel } from './dev-panel-provider';
import { createDevPanelFeedbackContext } from './dev-panel-feedback-context';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';
import { useVisualViewportFooterStyle } from './use-visual-viewport-footer';

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

function feedbackNoteValue(raw: unknown) {
  return typeof raw === 'string' ? raw : '';
}

function TesterIdentityBadge() {
  return (
    <p className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      <UserRound className="size-4 shrink-0" aria-hidden="true" />
      Sent as a tester (not signed in)
    </p>
  );
}

export function DevPanelGiveFeedbackFlyout({
  onClose,
  pushed,
  feedbackActions,
}: {
  onClose: () => void;
  pushed?: boolean;
  feedbackActions: () => ReturnType<
    ReturnType<typeof createDevPanelFeedbackContext>['snapshot']
  >;
}) {
  const { state, updateForms, flyoutSwitchInstant } = useDevPanel();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const location = useLocation();
  const path = devPanelFeedbackPath(location.pathname + location.search);
  const noteId = useId();
  const pageUrlId = useId();
  const sentHeadingId = useId();
  const isPhone = useMedia('(max-width: 639px)');
  const footerStyle = useVisualViewportFooterStyle(isPhone);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotOmitted, setScreenshotOmitted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const note = feedbackNoteValue(state.forms.feedbackNote);
  const signedOut = !rootData?.user?.email;
  const sentPathRef = useRef(path);

  useEffect(() => {
    if (state.subSheet !== 'give-feedback') return;
    const focusNote = () => {
      const el = document.getElementById(noteId);
      if (!el) return;
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) {
        window.requestAnimationFrame(() => {
          el.focus({ preventScroll: true });
        });
      }
    };
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      setScreenshot(null);
      window.setTimeout(focusNote, 0);
      return;
    }
    void captureFeedbackScreenshot()
      .then(async (raw) => {
        const { dataUrl, dropped } = await compressFeedbackScreenshot(raw);
        setScreenshot(dataUrl);
        setScreenshotOmitted(dropped);
      })
      .catch(() => {
        setScreenshot(null);
        setScreenshotOmitted(false);
      })
      .finally(focusNote);
  }, [noteId, state.subSheet]);

  useEffect(() => {
    if (status !== 'sent') return;
    const heading = document.getElementById(sentHeadingId);
    heading?.focus({ preventScroll: true });
  }, [sentHeadingId, status]);

  const submit = useCallback(async () => {
    if (!path) {
      setError('This page location cannot be sent.');
      setStatus('error');
      return;
    }
    if (!note.trim()) {
      setError('Add a note before sending.');
      document.getElementById(noteId)?.focus();
      return;
    }
    setStatus('submitting');
    setError('');
    setServerError('');
    setErrorStatus(null);
    try {
      const response = await fetch('/api/dev-panel/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: note.trim(),
          url: path,
          actions: feedbackActions(),
          screenshot,
          screenshotOmitted,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const message =
          typeof result?.error === 'string' ? result.error : 'Could not send feedback.';
        setServerError(message);
        setError(message);
        setErrorStatus(response.status);
        setStatus('error');
        return;
      }
      sentPathRef.current = path;
      setStatus('sent');
    } catch {
      setStatus('error');
      setError('');
      setServerError('');
      setErrorStatus(null);
    }
  }, [
    feedbackActions,
    note,
    noteId,
    path,
    screenshot,
    screenshotOmitted,
  ]);

  useEffect(() => {
    if (state.subSheet !== 'give-feedback' || status === 'sent') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
      if (status === 'submitting') return;
      event.preventDefault();
      void submit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state.subSheet, status, submit]);

  if (state.subSheet !== 'give-feedback') return null;

  const displayPath = path ?? location.pathname;

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
      aria-label="Give feedback"
    >
      <header className="yawp-dev-panel-flyout-header">
        {pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : null}
        <h2 id="fb-title" className="min-w-0 flex-1 truncate">
          Give feedback
        </h2>
        {!pushed ? (
          <button
            type="button"
            className="yawp-dev-panel-flyout-header-close"
            aria-label="Close feedback"
            disabled={status === 'submitting'}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div
        className={cn(
          'flex flex-1 flex-col overflow-hidden',
          status === 'sent' && 'justify-center'
        )}
      >
        <div className="yawp-dev-panel-flyout-body">
        {status === 'sent' ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="flex size-12 items-center justify-center rounded-full bg-primary/15"
                aria-hidden="true"
              >
                <Check className="size-6 text-primary" strokeWidth={2.5} />
              </div>
              <h3
                id={sentHeadingId}
                tabIndex={-1}
                className="text-base font-semibold outline-none"
              >
                Feedback sent
              </h3>
              <p role="status" className="text-sm text-muted-foreground">
                Thanks. The Yawp! team has your note, screenshot and page URL.
              </p>
            </div>
            <dl className="space-y-2 rounded-md bg-muted/50 px-3 py-3 text-sm">
              {signedOut ? (
                <div>
                  <dt className="text-muted-foreground">From</dt>
                  <dd>Sent as a tester (not signed in)</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Page</dt>
                <dd className="font-mono text-xs">{sentPathRef.current}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <>
            <p className="m-0 text-sm leading-5">
              Goes straight to the Yawp! team, with a screenshot and this page&apos;s URL.
            </p>
            {signedOut ? <TesterIdentityBadge /> : null}
            <div
              className={cn(
                'flex flex-col gap-1.5',
                status === 'submitting' && 'pointer-events-none opacity-60'
              )}
            >
              <Label htmlFor={noteId}>Note</Label>
              <Textarea
                id={noteId}
                rows={6}
                maxLength={2000}
                placeholder="What you did, what you expected, and what happened instead."
                value={note}
                disabled={status === 'submitting'}
                onChange={(event) => {
                  updateForms({ feedbackNote: event.target.value });
                  if (error) setError('');
                }}
                aria-invalid={Boolean(error && status !== 'error')}
                aria-describedby="dev-panel-feedback-note-help"
              />
              <div className="flex items-start gap-3">
                {error && status !== 'error' ? (
                  <p
                    id="dev-panel-feedback-note-help"
                    role="alert"
                    className="flex flex-1 items-start gap-1.5 text-xs font-medium text-destructive"
                  >
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                  </p>
                ) : (
                  <p
                    id="dev-panel-feedback-note-help"
                    className="flex-1 text-xs leading-4 text-muted-foreground"
                  >
                    Steps to repeat it help most.
                  </p>
                )}
                <span aria-live="polite" className="shrink-0 text-xs text-muted-foreground">
                  {note.length} / 2000
                </span>
              </div>
            </div>
            <div
              className={cn(
                'flex flex-col gap-1.5',
                status === 'submitting' && 'pointer-events-none opacity-50'
              )}
            >
              <span id="dev-panel-feedback-shot-label" className="text-sm font-medium">
                Screenshot
              </span>
              <div className="yawp-dev-panel-screenshot-card">
                {screenshot ? (
                  <img
                    src={screenshot}
                    alt=""
                    aria-labelledby="dev-panel-feedback-shot-label"
                    aria-describedby="dev-panel-feedback-shot-help"
                    className="yawp-dev-panel-screenshot-thumb"
                  />
                ) : (
                  <div
                    className="yawp-dev-panel-screenshot-thumb bg-muted"
                    aria-hidden="true"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] font-medium leading-[18px]">
                    Attached automatically
                  </span>
                  <p
                    id="dev-panel-feedback-shot-help"
                    className="m-0 text-xs leading-4 text-muted-foreground"
                  >
                    {screenshotOmitted
                      ? 'Screenshot omitted — the capture was too large to send.'
                      : 'Taken when you opened Give feedback. The developer panel is left out of it.'}
                  </p>
                </div>
              </div>
            </div>
            <div
              className={cn(
                'flex flex-col gap-1.5',
                status === 'submitting' && 'opacity-60'
              )}
            >
              <Label htmlFor={pageUrlId}>Page</Label>
              <Input
                id={pageUrlId}
                readOnly
                disabled={status === 'submitting'}
                value={displayPath}
                className="font-mono"
                aria-describedby="dev-panel-feedback-page-help"
              />
              <p
                id="dev-panel-feedback-page-help"
                className="m-0 text-xs leading-4 text-muted-foreground"
              >
                Filled in from the page you&apos;re on.
              </p>
            </div>
          </>
        )}
        </div>
        {status === 'error' ? (
          <div
            id="dev-panel-feedback-error"
            role="alert"
            className="mx-4 mb-2 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Couldn&apos;t send your feedback</p>
              <p>
                {errorStatus === 400 || errorStatus === 413 || errorStatus === 429
                  ? serverError
                  : 'Your note is still here. Check your connection and try again.'}
              </p>
            </div>
          </div>
        ) : null}
        {status === 'sent' ? (
          <div
            className={cn(
              'border-t bg-background p-4',
              isPhone && 'fixed inset-x-0 bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]'
            )}
            style={isPhone ? footerStyle : undefined}
          >
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setStatus('idle');
                updateForms({ feedbackNote: '' });
                setScreenshot(null);
                setScreenshotOmitted(false);
                window.setTimeout(() => document.getElementById(noteId)?.focus(), 0);
              }}
            >
              Send another
            </Button>
          </div>
        ) : (
          <footer
            className={cn(
              'yawp-dev-panel-flyout-footer',
              isPhone && 'fixed inset-x-0 bottom-0 z-20'
            )}
            style={isPhone ? footerStyle : undefined}
          >
            <div className="flex flex-col gap-2.5">
              <Button
                type="button"
                className="w-full"
                disabled={status === 'submitting'}
                onClick={() => void submit()}
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Sending…
                  </>
                ) : status === 'error' ? (
                  'Try again'
                ) : (
                  'Send feedback'
                )}
              </Button>
              {!isPhone && status !== 'error' && status !== 'submitting' ? (
                <span className="yawp-dev-panel-kbd-hint">
                  <kbd className="yawp-dev-panel-kbd">Ctrl</kbd>
                  <kbd className="yawp-dev-panel-kbd">Enter</kbd>
                  sends (⌘ Enter on Mac)
                </span>
              ) : null}
              {status === 'submitting' ? (
                <span role="status" className="text-center text-xs text-muted-foreground">
                  Sending to the Yawp! team…
                </span>
              ) : null}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
