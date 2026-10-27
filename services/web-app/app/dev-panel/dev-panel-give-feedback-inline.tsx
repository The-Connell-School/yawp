import { CircleAlert, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useRouteLoaderData } from 'react-router';
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

export function DevPanelGiveFeedbackInline({
  sectionOpen,
  feedbackActions,
}: {
  sectionOpen: boolean;
  feedbackActions: () => ReturnType<
    ReturnType<typeof createDevPanelFeedbackContext>['snapshot']
  >;
}) {
  const { state, updateForms, toggleSection } = useDevPanel();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const location = useLocation();
  const path = devPanelFeedbackPath(location.pathname + location.search);
  const noteId = useId();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotOmitted, setScreenshotOmitted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const note = feedbackNoteValue(state.forms.feedbackNote);
  const feedbackType = state.forms.feedbackType ?? 'bug';
  const attachScreenshot = state.forms.feedbackAttachScreenshot !== false;
  const canSend = note.trim().length > 0 && status !== 'submitting';
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
    if (!sectionOpen || !attachScreenshot) {
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
  }, [attachScreenshot, sectionOpen]);

  useEffect(() => {
    if (!sectionOpen) {
      captureStarted.current = false;
    }
  }, [sectionOpen]);

  const submit = useCallback(async () => {
    if (!canSend) return;
    if (!path) {
      setError('This page location cannot be sent.');
      setStatus('error');
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
      toggleSection('give-feedback');
    } catch {
      setStatus('error');
      setError('');
      setServerError('Could not send feedback.');
    }
  }, [
    attachScreenshot,
    canSend,
    feedbackActions,
    feedbackType,
    note,
    path,
    screenshot,
    screenshotOmitted,
    toggleSection,
    updateForms,
  ]);

  return (
    <div className="yawp-dev-panel-inline-expanded-body yawp-dev-panel-give-feedback-inline">
      <div className="yawp-dev-panel-segmented" role="radiogroup" aria-label="Feedback type">
        {FEEDBACK_TYPES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={feedbackType === entry.id}
            disabled={status === 'submitting'}
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
      <button
        type="button"
        className={cn(
          'yawp-dev-panel-pe3-send',
          !canSend && 'yawp-dev-panel-pe3-send-disabled'
        )}
        disabled={!canSend}
        aria-disabled={!canSend}
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
      {!canSend && status !== 'submitting' ? (
        <span className="yawp-dev-panel-give-feedback-hint">Describe the issue to send.</span>
      ) : null}
    </div>
  );
}
