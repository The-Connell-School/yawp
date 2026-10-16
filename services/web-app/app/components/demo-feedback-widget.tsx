import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  captureSavedFeedback,
  createFeedbackContext,
  feedbackPath,
  type FeedbackAnalytics,
} from '~/utils/demo-feedback-context';
import './demo-feedback-widget.css';

type Analytics = FeedbackAnalytics & {
  on(
    event: 'eventCaptured',
    callback: (event: { event?: string }) => void
  ): () => void;
};

export function DemoFeedbackWidget({ analytics }: { analytics?: Analytics }) {
  const location = useLocation();
  const currentUrl = useRef('');
  currentUrl.current = location.pathname + location.search;
  const context = useRef(createFeedbackContext());
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'saved' | 'error'
  >('idle');
  const [error, setError] = useState('');
  const pending = status === 'submitting';
  const controller = useRef<AbortController>();

  useEffect(() => {
    context.current.route(location.pathname + location.search);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      // Ignore form fields entirely. Never read text, labels, values, attributes or analytics properties.
      if (
        event.target.closest(
          'input, textarea, select, [contenteditable], [data-demo-feedback]'
        )
      )
        return;
      const control = event.target.closest(
        'button, a, [role="button"], [role="link"]'
      );
      if (control)
        context.current.click(
          control.matches('a, [role="link"]') ? 'link' : 'button',
          currentUrl.current
        );
    };
    document.addEventListener('click', onClick, true);
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = analytics?.on('eventCaptured', (event) =>
        context.current.capture(event.event || '', currentUrl.current)
      );
    } catch {
      /* Analytics is optional. */
    }
    return () => {
      document.removeEventListener('click', onClick, true);
      unsubscribe?.();
    };
  }, [analytics]);
  useEffect(() => () => controller.current?.abort(), []);

  const path = feedbackPath(location.pathname + location.search);
  if (!path) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && status === 'saved') {
          setNote('');
          setStatus('idle');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          data-demo-feedback
          className="demo-feedback-trigger fixed bottom-20 right-4 z-40 min-h-11 px-4 shadow-md"
          variant="outline"
        >
          Give feedback
        </Button>
      </DialogTrigger>
      <DialogContent
        data-demo-feedback
        className="demo-feedback-panel max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-xl bg-white text-slate-900"
        overlayClassName="bg-black/30"
      >
        <DialogTitle>Give feedback</DialogTitle>
        <DialogDescription>
          Tell us what worked or what could be better. Please leave out
          passwords and private information.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || status === 'saved') return;
            const actions = context.current.snapshot();
            const url = path;
            setStatus('submitting');
            setError('');
            const abort = new AbortController();
            controller.current = abort;
            try {
              const response = await fetch('/api/demo-feedback', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ note, url, actions }),
                signal: abort.signal,
              });
              const result = await response.json().catch(() => null);
              if (!response.ok || !result?.ok) {
                setError(
                  typeof result?.error === 'string'
                    ? result.error
                    : 'Could not save feedback. Please try again.'
                );
                setStatus('error');
                return;
              }
              setStatus('saved');
              captureSavedFeedback(analytics, url, actions);
            } catch {
              if (abort.signal.aborted) return;
              setError('Could not save feedback. Please try again.');
              setStatus('error');
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="demo-feedback-note">Your note</Label>
            <Textarea
              id="demo-feedback-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={4000}
              required
              rows={5}
              disabled={pending || status === 'saved'}
            />
            <p className="text-xs text-slate-500">Up to 4,000 characters.</p>
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <p>Page location</p>
            <p className="break-all">{path}</p>
            <p className="text-xs">
              Includes up to five recent navigation and button actions.
            </p>
          </div>
          {status === 'error' ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="text-sm">
            {status === 'saved'
              ? 'Feedback saved. Thank you.'
              : pending
                ? 'Sending feedback…'
                : ''}
          </p>
          <Button
            type="submit"
            className="w-full min-h-11"
            disabled={pending || status === 'saved'}
          >
            {pending ? 'Sending…' : 'Send feedback'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
