import { ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
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
  const note = state.forms.feedbackNote ?? '';
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

  if (state.subSheet !== 'give-feedback') return null;

  const submit = async () => {
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
        setError(result?.error ?? 'Could not send feedback.');
        setStatus('error');
        return;
      }
      sentPathRef.current = path;
      setStatus('sent');
    } catch {
      setStatus('error');
      setError('');
    }
  };

  const displayPath = path ?? location.pathname;

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
      aria-label="Give feedback"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        {pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : null}
        <h2 className="flex-1 text-base font-semibold">Give feedback</h2>
        {!pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {status === 'sent' ? (
          <div className="space-y-3">
            <h3
              id={sentHeadingId}
              tabIndex={-1}
              className="text-base font-semibold outline-none"
            >
              Feedback sent
            </h3>
            <p role="status">
              Thanks. The Yawp! team got your note, screenshot and {sentPathRef.current}.
            </p>
            {signedOut ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Sent as a tester (not signed in)
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
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
          <>
            <p className="text-sm text-muted-foreground">
              Goes straight to the Yawp! team, with a screenshot and this page&apos;s URL.
            </p>
            {signedOut ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Sent as a tester (not signed in)
              </p>
            ) : null}
            {screenshotOmitted ? (
              <p className="text-xs text-muted-foreground">
                Screenshot omitted — the capture was too large to send.
              </p>
            ) : null}
            <div
              className={cn(
                'space-y-1',
                status === 'submitting' && 'pointer-events-none opacity-60'
              )}
            >
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
                aria-describedby={
                  error || status === 'error' ? 'dev-panel-feedback-error' : undefined
                }
              />
              <p className="text-xs text-muted-foreground">{note.length} / 2000</p>
            </div>
            {error && status !== 'error' ? (
              <p id="dev-panel-feedback-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {status === 'error' ? (
              <p id="dev-panel-feedback-error" role="alert" className="text-sm text-destructive">
                Couldn&apos;t send feedback. Your note and screenshot are saved here. Check your
                connection and try again.
              </p>
            ) : null}
            {screenshot ? (
              <div
                className={cn(
                  'space-y-1',
                  status === 'submitting' && 'pointer-events-none opacity-60'
                )}
              >
                <p className="text-sm font-medium">Screenshot</p>
                <img
                  src={screenshot}
                  alt={`Screenshot of ${displayPath}`}
                  className="max-h-32 rounded border"
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor={pageUrlId}>Page URL</Label>
              <Input id={pageUrlId} readOnly value={displayPath} />
            </div>
          </>
        )}
      </div>
      {status !== 'sent' ? (
        <div
          className={cn(
            'border-t bg-background p-4',
            isPhone && 'fixed inset-x-0 bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]'
          )}
          style={isPhone ? footerStyle : undefined}
        >
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
              'Retry'
            ) : (
              'Send feedback'
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
