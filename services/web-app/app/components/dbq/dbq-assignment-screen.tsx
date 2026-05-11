import { useRef, useState } from 'react';
import { BookOpen, PanelLeftOpen, PenLine, Sparkles } from 'lucide-react';
import { EditorColumn } from './editor-column';
import { PromptBanner } from './prompt-banner';
import { ResizeHandle } from './resize-handle';
import { SourcesColumn } from './sources-column';
import { SubmittedView } from './submitted-view';
import { TutorChatStripe } from './tutor-chat-stripe';
import { sampleDbq } from './sample-data';
import { useDbqState } from './use-dbq-state';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

const SNAP_READ_PCT = 75;
const SNAP_WRITE_PCT = 25;
const BALANCED_PCT = 50;
const SNAP_TOLERANCE = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function DbqAssignmentScreen() {
  const state = useDbqState(sampleDbq);

  const [tutorCollapsed, setTutorCollapsed] = useState(false);
  const [tutorWidth, setTutorWidth] = useState(320);
  const [splitPct, setSplitPct] = useState(BALANCED_PCT);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  function handleTutorDrag(dx: number) {
    setTutorWidth((w) => clamp(w + dx, 240, 560));
  }

  function handleSplitDrag(dx: number) {
    const w = splitContainerRef.current?.getBoundingClientRect().width;
    if (!w) return;
    setSplitPct((p) => clamp(p + (dx / w) * 100, 25, 75));
  }

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tutorCollapsed ? (
          <CollapsedTutorRail onExpand={() => setTutorCollapsed(false)} />
        ) : (
          <>
            <div
              style={{ width: `${tutorWidth}px` }}
              className="min-h-0 shrink-0 border-r"
            >
              <TutorChatStripe
                state={state}
                onCollapse={() => setTutorCollapsed(true)}
              />
            </div>
            <ResizeHandle
              onDrag={handleTutorDrag}
              ariaLabel="Resize tutor panel"
            />
          </>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PromptBanner state={state} />

          {state.view === 'drafting' ? (
            <DraftingPane
              state={state}
              splitPct={splitPct}
              setSplitPct={setSplitPct}
              onSplitDrag={handleSplitDrag}
              splitContainerRef={splitContainerRef}
            />
          ) : (
            <SubmittedView state={state} />
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground">
        Prototype — student drafting surface for the AP History essay
        AssignmentType. Stacked on PR #115. No persistence, no backend. Drag
        the dividers to resize columns.
      </footer>
    </div>
  );
}

function DraftingPane({
  state,
  splitPct,
  setSplitPct,
  onSplitDrag,
  splitContainerRef,
}: {
  state: DbqState;
  splitPct: number;
  setSplitPct: (n: number) => void;
  onSplitDrag: (dx: number) => void;
  splitContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isRead = splitPct >= SNAP_READ_PCT - SNAP_TOLERANCE;
  const isWrite = splitPct <= SNAP_WRITE_PCT + SNAP_TOLERANCE;

  function snapRead() {
    setSplitPct(isRead ? BALANCED_PCT : SNAP_READ_PCT);
  }
  function snapWrite() {
    setSplitPct(isWrite ? BALANCED_PCT : SNAP_WRITE_PCT);
  }

  return (
    <div
      ref={splitContainerRef}
      className="flex min-h-0 flex-1 items-stretch gap-0 overflow-hidden p-3"
    >
      <div
        style={{ width: `${splitPct}%` }}
        className="min-h-0 shrink-0 pr-1.5"
      >
        <SourcesColumn state={state} />
      </div>

      <div className="relative shrink-0">
        <ResizeHandle
          onDrag={onSplitDrag}
          ariaLabel="Resize sources vs editor"
        />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center justify-center gap-1">
          <SnapButton
            active={isRead}
            onClick={snapRead}
            icon={<BookOpen size={12} />}
            label={isRead ? 'Reset split (50/50)' : 'Read mode (expand sources)'}
          />
          <SnapButton
            active={isWrite}
            onClick={snapWrite}
            icon={<PenLine size={12} />}
            label={isWrite ? 'Reset split (50/50)' : 'Write mode (expand editor)'}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 pl-1.5">
        <EditorColumn state={state} />
      </div>
    </div>
  );
}

function SnapButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary'
      )}
    >
      {icon}
    </button>
  );
}

function CollapsedTutorRail({ onExpand }: { onExpand: () => void }) {
  return (
    <aside className="flex h-full w-10 shrink-0 flex-col items-center gap-3 border-r bg-background py-2">
      <button
        type="button"
        onClick={onExpand}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Expand tutor"
        title="Expand tutor"
      >
        <PanelLeftOpen size={16} />
      </button>
      <Sparkles size={16} className="text-primary" />
      <span
        className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground"
        style={{ writingMode: 'vertical-rl' }}
      >
        Tutor
      </span>
    </aside>
  );
}
