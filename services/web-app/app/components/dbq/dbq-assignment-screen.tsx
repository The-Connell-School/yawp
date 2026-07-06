import { useRef, useState } from 'react';
import {
  FileText,
  MessageSquareText,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import { cn } from '~/utils/misc';
import { EditorColumn } from './editor-column';
import { PromptBanner } from './prompt-banner';
import { ResizeHandle } from './resize-handle';
import { SourcesColumn } from './sources-column';
import { SubmittedView } from './submitted-view';
import { TutorChatStripe } from './tutor-chat-stripe';
import { sampleDbq } from './sample-data';
import { useDbqState } from './use-dbq-state';
import type { DbqState } from './use-dbq-state';
import type { DbqPrompt, TimeMode } from './types';

const SNAP_READ_PCT = 75;
const SNAP_WRITE_PCT = 25;
const BALANCED_PCT = 50;
const SNAP_TOLERANCE = 5;
const DEFAULT_SIDE_RAIL_WIDTH = 360;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

type Props = {
  prompt?: DbqPrompt;
  initialTimeMode?: TimeMode;
  durationMinutes?: number;
  tutor?: React.ReactNode;
  editor?: React.ReactNode;
  comments?: React.ReactNode;
};

export function DbqAssignmentScreen({
  prompt,
  initialTimeMode,
  durationMinutes,
  tutor,
  editor,
  comments,
}: Props = {}) {
  const isProductionDocument = Boolean(editor);
  const state = useDbqState(
    prompt ?? sampleDbq,
    initialTimeMode,
    durationMinutes,
    { submitOnTimerEnd: !isProductionDocument }
  );

  const [tutorCollapsed, setTutorCollapsed] = useState(false);
  const [tutorWidth, setTutorWidth] = useState(320);
  const [sideRailWidth, setSideRailWidth] = useState(DEFAULT_SIDE_RAIL_WIDTH);
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

  function handleSideRailDrag(dx: number) {
    setSideRailWidth((w) => clamp(w - dx, 300, 560));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tutorCollapsed ? (
          <CollapsedTutorRail onExpand={() => setTutorCollapsed(false)} />
        ) : (
          <>
            <div
              style={{ width: `${tutorWidth}px` }}
              className="hidden min-h-0 shrink-0 border-r lg:block"
            >
              {tutor ?? (
                <TutorChatStripe
                  state={state}
                  onCollapse={() => setTutorCollapsed(true)}
                />
              )}
            </div>
            <ResizeHandle
              onDrag={handleTutorDrag}
              ariaLabel="Resize tutor panel"
              className="hidden lg:block"
            />
          </>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PromptBanner
            state={state}
            showSubmit={!editor}
            showTimeControls={!editor}
          />

          {state.view === 'drafting' ? (
            isProductionDocument ? (
              <ProductionDraftingPane
                state={state}
                editor={editor}
                comments={comments}
                sideRailWidth={sideRailWidth}
                onSideRailDrag={handleSideRailDrag}
              />
            ) : (
              <DraftingPane
                state={state}
                splitPct={splitPct}
                setSplitPct={setSplitPct}
                onSplitDrag={handleSplitDrag}
                splitContainerRef={splitContainerRef}
                editor={editor}
                allowLocalDraftTools={!isProductionDocument}
              />
            )
          ) : (
            <SubmittedView state={state} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProductionDraftingPane({
  state,
  editor,
  comments,
  sideRailWidth,
  onSideRailDrag,
}: {
  state: DbqState;
  editor?: React.ReactNode;
  comments?: React.ReactNode;
  sideRailWidth: number;
  onSideRailDrag: (dx: number) => void;
}) {
  const [sideRailTab, setSideRailTab] = useState<'documents' | 'comments'>(
    'documents'
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <main className="min-h-0 flex-1 overflow-hidden">{editor}</main>
      <ResizeHandle
        onDrag={onSideRailDrag}
        ariaLabel="Resize document sidebar"
        className="hidden xl:block"
      />
      <aside
        role="complementary"
        aria-label="Document resources"
        style={{ width: `${sideRailWidth}px` }}
        className="hidden min-h-0 shrink-0 flex-col border-l bg-background xl:flex"
      >
        <div className="flex shrink-0 items-center gap-1 border-b p-1">
          <SideRailTabButton
            label="Documents"
            icon={<FileText size={14} />}
            active={sideRailTab === 'documents'}
            onClick={() => setSideRailTab('documents')}
          />
          <SideRailTabButton
            label="Comments"
            icon={<MessageSquareText size={14} />}
            active={sideRailTab === 'comments'}
            onClick={() => setSideRailTab('comments')}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {sideRailTab === 'documents' ? (
            <SourcesColumn
              state={state}
              allowSourceTools={false}
              className="rounded-none border-0"
            />
          ) : (
            comments
          )}
        </div>
      </aside>
    </div>
  );
}

function SideRailTabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DraftingPane({
  state,
  splitPct,
  setSplitPct,
  onSplitDrag,
  splitContainerRef,
  editor,
  allowLocalDraftTools,
}: {
  state: DbqState;
  splitPct: number;
  setSplitPct: (n: number) => void;
  editor?: React.ReactNode;
  allowLocalDraftTools: boolean;
  onSplitDrag: (dx: number) => void;
  splitContainerRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const isReadMaxed = splitPct >= SNAP_READ_PCT - SNAP_TOLERANCE;
  const isWriteMaxed = splitPct <= SNAP_WRITE_PCT + SNAP_TOLERANCE;

  function toggleReadMax() {
    setSplitPct(isReadMaxed ? BALANCED_PCT : SNAP_READ_PCT);
  }
  function toggleWriteMax() {
    setSplitPct(isWriteMaxed ? BALANCED_PCT : SNAP_WRITE_PCT);
  }

  return (
    <div
      ref={(element) => {
        splitContainerRef.current = element;
      }}
      className="flex min-h-0 flex-1 items-stretch gap-0 overflow-hidden p-3"
    >
      <div
        style={{ width: `${splitPct}%` }}
        className="min-h-0 shrink-0 pr-1.5"
      >
        <SourcesColumn
          state={state}
          isMaximized={isReadMaxed}
          onToggleMaximize={toggleReadMax}
          allowSourceTools={allowLocalDraftTools}
        />
      </div>

      <ResizeHandle onDrag={onSplitDrag} ariaLabel="Resize sources vs editor" />

      <div className="min-h-0 flex-1 pl-1.5">
        <EditorColumn
          state={state}
          isMaximized={isWriteMaxed}
          onToggleMaximize={toggleWriteMax}
          editor={editor}
          allowDraftTools={allowLocalDraftTools}
        />
      </div>
    </div>
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
