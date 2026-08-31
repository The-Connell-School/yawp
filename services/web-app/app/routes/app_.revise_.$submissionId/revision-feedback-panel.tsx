import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import type { GrammarIssue } from '~/domain/grading/grammarIssues';
import { GradingCommentsSidebar } from '~/routes/app_.submissions_.$submissionId/teacher-grading/grading-comments-sidebar';
import {
  ViewPanel,
  type ViewPanelSubmission,
} from '~/routes/app_.submissions_.$submissionId/teacher-grading/view-panel';

import {
  ASSISTANT_NOTE_ATTRIBUTE,
  resolveFeedbackFocusTarget,
  type FeedbackFocusRequest,
} from './feedback-focus';

type FeedbackComment = {
  id: string;
  content: string;
  excerpt: string | null;
  occurrence?: number | null;
  createdAt: Date | string;
  membership: { user: { name: string | null; email: string | null } };
};

type Props = {
  submission: ViewPanelSubmission & { id: string; text: string | null };
  comments: FeedbackComment[];
  grammarIssues: GrammarIssue[];
  grammarHighlightingEnabled: boolean;
  activeCommentId: string | null;
  onSelectComment: (id: string) => void;
  /**
   * Set when the student clicks a mark in the graded essay. The panel comes
   * back out if they collapsed it, moves to the tab holding that note, and
   * scrolls it into view — so a click answers "what was said about this?"
   * rather than leaving them to find it.
   */
  focusRequest?: FeedbackFocusRequest | null;
};

type Tab = 'grade' | 'teacher' | 'assistant';

/**
 * The feedback the student revises against, collapsed to a rail when they want
 * the graded essay and their draft to have the whole screen.
 *
 * Everything here is read-only: this panel reports what was released, it never
 * writes back to the submission.
 */
export function RevisionFeedbackPanel({
  submission,
  comments,
  grammarIssues,
  grammarHighlightingEnabled,
  activeCommentId,
  onSelectComment,
  focusRequest = null,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('grade');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const focusedNoteId =
    focusRequest?.kind === 'assistant' ? focusRequest.id : null;

  // Keyed on the nonce, not the id: clicking the same mark twice has to reopen
  // a panel the student collapsed in between.
  useEffect(() => {
    if (!focusRequest) return;
    const { tab: nextTab, selector } = resolveFeedbackFocusTarget(focusRequest);
    setIsOpen(true);
    setTab(nextTab);

    // The tab's content mounts in this same commit, so wait one frame before
    // looking for the note to scroll to.
    const frame = requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(selector)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  if (!isOpen) {
    return (
      <div className="flex h-11 w-full shrink-0 flex-row items-center gap-2 border-b bg-muted/30 px-2 xl:h-auto xl:w-11 xl:flex-col xl:border-r xl:border-b-0 xl:px-0 xl:py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Show feedback"
          aria-expanded={false}
          data-testid="revision-feedback-toggle"
          onClick={() => setIsOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium tracking-wide text-muted-foreground xl:mt-2 xl:[writing-mode:vertical-rl]">
          Feedback
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex h-[45vh] min-h-72 max-h-96 w-full shrink-0 flex-col overflow-hidden border-b bg-white md:h-[40%] md:min-h-0 md:max-h-none xl:h-auto xl:w-[320px] xl:border-r xl:border-b-0"
      data-testid="revision-feedback-panel"
    >
      {/* Same heights as the panes' header and bar rows (see PANE_HEADER_CLASS
          in route.tsx), so all three columns start their content on one line. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5">
        <span className="text-sm font-semibold">Feedback</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Hide feedback"
          aria-expanded={true}
          data-testid="revision-feedback-toggle"
          onClick={() => setIsOpen(false)}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex shrink-0 gap-1 border-b p-1 px-2">
        <TabButton
          isActive={tab === 'grade'}
          onClick={() => setTab('grade')}
          testId="revision-feedback-tab-grade"
        >
          Grade
        </TabButton>
        <TabButton
          isActive={tab === 'teacher'}
          onClick={() => setTab('teacher')}
          testId="revision-feedback-tab-comments"
          count={comments.length}
        >
          Comments
        </TabButton>
        {grammarHighlightingEnabled ? (
          <TabButton
            isActive={tab === 'assistant'}
            onClick={() => setTab('assistant')}
            testId="revision-feedback-tab-grammar"
            count={grammarIssues.length}
          >
            Grammar
          </TabButton>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar min-h-0 grow overflow-y-auto"
        data-testid="revision-feedback-scroll"
      >
        {tab === 'grade' ? <ViewPanel submission={submission} /> : null}
        {tab === 'teacher' ? (
          <GradingCommentsSidebar
            submissionComments={comments as never}
            submissionId={submission.id}
            sourceText={submission.text ?? ''}
            readOnly
            activeGradeCommentId={activeCommentId}
            onSelectGradeComment={onSelectComment}
            heading="Teacher comments"
          />
        ) : null}
        {tab === 'assistant' ? (
          <AssistantNotes
            grammarIssues={grammarIssues}
            focusedGrammarIssueId={focusedNoteId}
          />
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  isActive,
  onClick,
  testId,
  count,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  testId: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={isActive}
      onClick={onClick}
      className={`flex h-8 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium transition ${
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60'
      }`}
    >
      {children}
      {count != null && count > 0 ? (
        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] leading-none text-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Grading Assistant marks. V1 reports them; the revision tutor that talks back
 * about them is V2.
 */
function AssistantNotes({
  grammarIssues,
  focusedGrammarIssueId,
}: {
  grammarIssues: GrammarIssue[];
  focusedGrammarIssueId: string | null;
}) {
  if (grammarIssues.length === 0) {
    return (
      <p className="p-4 text-sm italic text-muted-foreground">
        No grammar or style notes on this draft.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {grammarIssues.map((issue) => (
        <li
          key={issue.id}
          data-testid={`revision-assistant-note-${issue.id}`}
          {...{ [ASSISTANT_NOTE_ATTRIBUTE]: issue.id }}
          className={`p-3 ${
            issue.id === focusedGrammarIssueId ? 'bg-purple-50' : ''
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-purple-500" />
            <p className="text-xs font-semibold text-purple-700">
              {issue.kind === 'error' ? 'Grammar Error' : 'Style Suggestion'}
            </p>
          </div>
          {issue.excerpt ? (
            <p className="mt-1.5 border-l-2 border-purple-200 pl-2 text-xs italic text-muted-foreground">
              {issue.excerpt}
            </p>
          ) : null}
          <p className="mt-1.5 text-sm leading-snug">{issue.message}</p>
          {issue.rule ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Rule: {issue.rule}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
