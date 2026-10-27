import { ChevronLeft, CircleAlert, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useRouteLoaderData } from 'react-router';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import type { loader as rootLoader } from '~/root';
import { captureFeedbackScreenshot } from './capture-feedback-screenshot';
import { compressFeedbackScreenshot } from './compress-feedback-screenshot';
import { useDevPanel } from './dev-panel-provider';
import { createDevPanelFeedbackContext } from './dev-panel-feedback-context';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';
import { devPanelFeedbackPageMeta } from './dev-panel-feedback-page-meta';
import type { DevPanelFeedbackType } from './dev-panel-types';
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

function membershipRoleLabel(role: string | undefined) {
  if (!role) return '';
  const normalized = role.toLowerCase();
  if (normalized.includes('student')) return 'Student';
  if (normalized === 'admin' || normalized === 'owner') return 'Admin';
  return 'Teacher';
}

const FEEDBACK_TYPES: { id: DevPanelFeedbackType; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
  { id: 'copy', label: 'Copy' },
];

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
  const isPhone = useMedia('(max-width: 639px)');
  const footerStyle = useVisualViewportFooterStyle(isPhone);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotOmitted, setScreenshotOmitted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const note = feedbackNoteValue(state.forms.feedbackNote);
  const feedbackType = state.forms.feedbackType ?? 'bug';
  const attachScreenshot = state.forms.feedbackAttachScreenshot !== false;
  const signedInRole = membershipRoleLabel(
    rootData?.user?.selectedMembership?.role ?? rootData?.user?.memberships?.[0]?.role
  );
  const pageMeta = devPanelFeedbackPageMeta({
    path: path ?? location.pathname,
    signedIn: Boolean(rootData?.user?.email),
    roleLabel: signedInRole,
    selectedStateId: state.forms.selectedStateId,
  });
  const captureStarted = useRef(false);

  useEffect(() => {
    if (state.subSheet !== 'give-feedback' || !attachScreenshot) {
      if (!attachScreenshot) setScreenshot(null);
      return;
    }
    if (captureStarted.current) return;
    captureStarted.current = true;
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      setScreenshot(null);
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
      });
  }, [attachScreenshot, state.subSheet]);

  useEffect(() => {
    if (state.subSheet !== 'give-feedback') {
      captureStarted.current = false;
    }
  }, [state.subSheet]);

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
    const typePrefix =
      feedbackType === 'idea'
        ? '[Idea] '
        : feedbackType === 'copy'
          ? '[Copy] '
          : '[Bug] ';
    try {
      const response = await fetch('/api/dev-panel/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: `${typePrefix}${note.trim()}`,
          url: path,
          actions: feedbackActions(),
          screenshot: attachScreenshot ? screenshot : null,
          screenshotOmitted: attachScreenshot ? screenshotOmitted : false,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const message =
          typeof result?.error === 'string' ? result.error : 'Could not send feedback.';
        setServerError(message);
        setError(message);
        setStatus('error');
        return;
      }
      updateForms({ feedbackNote: '' });
      setStatus('idle');
      onClose();
    } catch {
      setStatus('error');
      setError('');
      setServerError('Could not send feedback.');
    }
  }, [
    attachScreenshot,
    feedbackActions,
    feedbackType,
    note,
    noteId,
    onClose,
    path,
    screenshot,
    screenshotOmitted,
    updateForms,
  ]);

  if (state.subSheet !== 'give-feedback') return null;

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
      <div className="yawp-dev-panel-pe3-feedback-body">
        <div className="yawp-dev-panel-pe3-field">
          <span className="yawp-dev-panel-pe3-field-label">Type</span>
          <div className="yawp-dev-panel-segmented" role="radiogroup" aria-label="Feedback type">
            {FEEDBACK_TYPES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={feedbackType === entry.id}
                className={cn(
                  'yawp-dev-panel-segment',
                  feedbackType === entry.id && 'yawp-dev-panel-segment-active'
                )}
                onClick={() => updateForms({ feedbackType: entry.id })}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <div className="yawp-dev-panel-pe3-field">
          <label htmlFor={noteId} className="yawp-dev-panel-pe3-field-label">
            What happened?
          </label>
          <Textarea
            id={noteId}
            rows={5}
            maxLength={2000}
            className="yawp-dev-panel-pe3-textarea"
            placeholder="Describe what you saw and what you expected."
            value={note}
            disabled={status === 'submitting'}
            onChange={(event) => {
              updateForms({ feedbackNote: event.target.value });
              if (error) setError('');
            }}
            aria-invalid={Boolean(error)}
          />
          {error ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <label className="yawp-dev-panel-pe3-checkbox-row">
          <input
            type="checkbox"
            checked={attachScreenshot}
            disabled={status === 'submitting'}
            onChange={(event) =>
              updateForms({ feedbackAttachScreenshot: event.target.checked })
            }
          />
          <span>Attach a screenshot of this page</span>
        </label>
        <p className="yawp-dev-panel-pe3-page-meta">{pageMeta}</p>
        {status === 'error' && serverError ? (
          <div role="alert" className="yawp-dev-panel-pe3-error">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span className="text-sm">{serverError}</span>
          </div>
        ) : null}
        <div
          className={cn(isPhone && 'fixed inset-x-0 bottom-0 z-20 bg-background px-3 pb-3 pt-2')}
          style={isPhone ? footerStyle : undefined}
        >
          <button
            type="button"
            className="yawp-dev-panel-pe3-send"
            disabled={status === 'submitting'}
            onClick={() => void submit()}
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              'Send feedback'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
