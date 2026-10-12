import { useRef, useState } from 'react';
import { useFetcher, useLocation } from 'react-router';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

function FeedbackForm() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const location = useLocation();
  const url = useRef(location.pathname + location.search);
  const pending = fetcher.state !== 'idle';
  const saved = fetcher.data?.ok;
  return (
    <fetcher.Form
      method="post"
      action="/api/tester-feedback"
      className="space-y-4"
    >
      <input type="hidden" name="url" value={url.current} />
      {(
        [
          ['whatIDid', 'What I did'],
          ['whatHappened', 'What happened'],
          ['whatIWish', 'What I wish it did'],
        ] as const
      ).map(([name, label]) => (
        <div key={name} className="space-y-1">
          <Label htmlFor={`feedback-${name}`}>{label}</Label>
          <Textarea
            id={`feedback-${name}`}
            name={name}
            required
            maxLength={4000}
            rows={3}
            disabled={pending || saved}
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor="feedback-severity">Severity</Label>
        <select
          id="feedback-severity"
          name="severity"
          className="block min-h-11 w-full rounded-md border bg-background px-3 text-sm"
          disabled={pending || saved}
        >
          <option value="">Optional</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      {fetcher.data?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {fetcher.data.error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm">
        {saved
          ? 'Feedback saved. Thank you.'
          : pending
            ? 'Saving feedback…'
            : ''}
      </p>
      <Button type="submit" disabled={pending || saved}>
        {pending ? 'Saving…' : 'Save feedback'}
      </Button>
    </fetcher.Form>
  );
}

export function TesterFeedbackWidget() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (pathname !== '/app' && !pathname.startsWith('/app/')) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Tutor and demo controls occupy the right; keep clear of the bottom action bar. */}
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-24 left-3 z-40 min-h-11 rounded-full px-4 shadow-md"
          variant="secondary"
        >
          Log feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100%_-_1.5rem)] overflow-y-auto rounded-lg">
        <DialogTitle>Log feedback</DialogTitle>
        <DialogDescription>
          Tell us about this session. Each field allows up to 4,000 characters.
          Please leave out passwords and private information.
        </DialogDescription>
        {open ? <FeedbackForm /> : null}
      </DialogContent>
    </Dialog>
  );
}
