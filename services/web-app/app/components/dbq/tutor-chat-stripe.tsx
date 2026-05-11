import { useEffect, useRef, useState } from 'react';
import { PanelLeftClose, Send, Sparkles } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { DBQ_PHASES } from './types';
import type { ChatMessage } from './types';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

export function TutorChatStripe({
  state,
  onCollapse,
}: {
  state: DbqState;
  onCollapse?: () => void;
}) {
  const { messages, askTutor, phase, setPhase } = state;
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  function send() {
    if (!draft.trim()) return;
    askTutor(draft);
    setDraft('');
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" />
            <h2 className="text-sm font-semibold">Tutor</h2>
          </div>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Collapse tutor"
              title="Collapse tutor"
            >
              <PanelLeftClose size={14} />
            </button>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Phase-aware coaching. Failure-mode flags post here. Ask anything.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {DBQ_PHASES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPhase(p.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition',
                p.id === phase
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted/60'
              )}
              title={`Phase ${i + 1}: ${p.label}`}
            >
              <span className="opacity-60">{i + 1}</span>
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t bg-muted/20 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the tutor… (⌘/Ctrl + Enter to send)"
          rows={2}
          className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-1.5 flex justify-end">
          <Button
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={send}
            disabled={!draft.trim()}
          >
            <Send size={12} className="mr-1" /> Send
          </Button>
        </div>
      </div>
    </aside>
  );
}

function MessageCard({ message }: { message: ChatMessage }) {
  const isTutor = message.role === 'tutor';
  const isDetector = message.origin === 'detector';
  const isPhase = message.origin === 'phase';

  return (
    <article
      className={cn(
        'rounded-lg border p-2.5 transition-[box-shadow,background-color,border-color] duration-200',
        isTutor
          ? isDetector
            ? 'border-amber-200 bg-amber-50'
            : isPhase
              ? 'border-blue-200 bg-blue-50/60'
              : 'bg-muted/30'
          : 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'text-[11px] font-semibold',
            isTutor
              ? isDetector
                ? 'text-amber-900'
                : isPhase
                  ? 'text-blue-900'
                  : 'text-muted-foreground'
              : 'text-primary'
          )}
        >
          {isTutor ? 'Tutor' : 'You'}
        </span>
        {isDetector ? (
          <span className="rounded-full bg-amber-200 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-amber-900">
            Detector
          </span>
        ) : null}
        {isPhase ? (
          <span className="rounded-full bg-blue-200 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-blue-900">
            Phase
          </span>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-foreground/90">
        {message.body}
      </p>
    </article>
  );
}
