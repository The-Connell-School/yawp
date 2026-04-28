import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import {
  useLoaderData,
  Link,
  useNavigate,
  useFetcher,
  redirect,
} from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { requireUserId, requireProfile } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { isSideBySideRevisionEnabled } from '~/utils/feature-flags.server';
import { formatGrade } from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { findExcerptRange } from '~/utils/excerpt-position';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import { EssayPanel } from '../app_.submissions_.$submissionId/essay-panel';
import { GradingCommentsSidebar } from '../app_.submissions_.$submissionId/teacher-grading/grading-comments-sidebar';
import { GradeHighlightsOverlay } from '../app_.submissions_.$submissionId/teacher-grading/grade-highlights-overlay';
import { DocumentEditor } from '../app_.documents_.$id/document-editor/document-editor';
import { useDocumentSubmit } from '../app_.documents_.$id/hooks/use-document-submit';
import { useAuthHeartbeat } from '../app_.documents_.$id/hooks/use-auth-heartbeat';
import type { EditorBridge } from '../app_.documents_.$id/document-editor/use-editor-sync';
import { CommentsSelectionProvider } from '../app_.documents_.$id/comments/selection-context';
import { DocumentHistory } from '../app_.documents_.$id/document-history/document-history';
import type { SyncStatus } from '~/utils/sync-service';

// ── Loader ───────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');

  const sideBySideEnabled = await isSideBySideRevisionEnabled();
  if (!sideBySideEnabled) {
    // Feature flag off: fall back to legacy document editor flow.
    // We need the documentId, so do a minimal lookup first.
    const minimal = await prisma.submission.findFirst({
      where: { id: params.submissionId },
      select: { documentId: true },
    });
    if (minimal) {
      return redirect(`/app/documents/${minimal.documentId}?revise=1`);
    }
    return redirectWithToast('/app', {
      description: 'Submission not found.',
      type: 'error',
    });
  }

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: { profile: { id: profile.id } },
    },
    select: {
      id: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      numericPercentage: true,
      letterGrade: true,
      overallComment: true,
      rubricScores: true,
      grammarIssues: true,
      releasedAt: true,
      gradedAt: true,
      documentId: true,
      document: {
        select: {
          id: true,
          title: true,
          html: true,
          text: true,
          updatedAt: true,
          revision: true,
        },
      },
      comments: {
        include: {
          profile: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!submission) {
    return redirectWithToast('/app', {
      description: 'Submission not found.',
      type: 'error',
    });
  }

  // Sort comments by position in source text
  const sortedComments = [...submission.comments].sort((a, b) => {
    const aRange = findExcerptRange(submission.text, a.excerpt, a.occurrence ?? 1);
    const bRange = findExcerptRange(submission.text, b.excerpt, b.occurrence ?? 1);
    if (aRange && bRange) {
      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      return aRange.end - bRange.end;
    }
    if (aRange) return -1;
    if (bRange) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    submission: { ...submission, comments: sortedComments },
    doc: submission.document,
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function RevisionRoute() {
  const { submission, doc } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ── Editor state ──────────────────────────────────────────────────
  const editorBridgeRef = useRef<EditorBridge | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [editorSubmittable, setEditorSubmittable] = useState(() =>
    isDocumentSubmittableContent(doc.html ?? '', doc.text ?? '')
  );
  const handleSubmittableContentChange = useCallback((submittable: boolean) => {
    setEditorSubmittable(submittable);
  }, []);

  const auth = useAuthHeartbeat({ documentId: doc.id, isEditable: true });
  const isEditorEditable = !auth.isLocked && auth.isInitialCheckComplete;

  const handleLoginRedirect = useCallback(() => {
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth/login?redirectTo=${redirectTo}`;
  }, []);

  const submit = useDocumentSubmit({
    documentId: doc.id,
    editorBridgeRef,
    onSubmitted: (newSubmission) => {
      navigate(`/app/submissions/${newSubmission.id}`);
    },
  });

  // ── Feedback panel state ──────────────────────────────────────────
  const essayRef = useRef<HTMLDivElement>(null);
  const [essayElement, setEssayElement] = useState<HTMLDivElement | null>(null);
  const setEssayRef = useCallback((el: HTMLDivElement | null) => {
    (essayRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setEssayElement(el);
  }, []);

  const [activeGradeCommentId, setActiveGradeCommentId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGradeCommentId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-grade-comment-id]')) return;
      if (target.closest('[data-grade-comment-card]')) return;
      setActiveGradeCommentId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeGradeCommentId]);

  const [tooltipIssueIds, setTooltipIssueIds] = useState<string[]>([]);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const tooltipHoveredRef = useRef(false);
  const tooltipClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grammarIssues = useMemo(
    () =>
      parseGrammarIssuesPayload(submission.grammarIssues, {
        sourceText: submission.text ?? '',
      }),
    [submission.grammarIssues, submission.text]
  );

  const essayHighlights = useMemo(
    () => [
      ...submission.comments.map((c) => ({
        id: c.id,
        excerpt: c.excerpt,
        occurrence: c.occurrence,
        dataAttr: 'data-grade-comment-id' as const,
        className: 'grade-comment-mark',
      })),
      ...grammarIssues.map((g) => ({
        id: g.id,
        excerpt: g.excerpt,
        occurrence: g.occurrence,
        dataAttr: 'data-grammar-issue-id' as const,
        className: 'grammar-issue-mark',
      })),
    ],
    [submission.comments, grammarIssues]
  );

  const activeGrammarIssues = useMemo(() => {
    if (tooltipIssueIds.length === 0) return [];
    return tooltipIssueIds
      .map((id) => grammarIssues.find((issue) => issue.id === id))
      .filter((issue): issue is GrammarIssue => issue != null);
  }, [grammarIssues, tooltipIssueIds]);

  const tooltipPos = useMemo(() => {
    if (!tooltipRect) return null;
    return {
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    };
  }, [tooltipRect]);

  const handleGrammarIssueHover = useCallback(
    (ids: string[], rect: DOMRect | null) => {
      if (tooltipClearTimerRef.current) {
        clearTimeout(tooltipClearTimerRef.current);
        tooltipClearTimerRef.current = null;
      }
      if (ids.length > 0) {
        setTooltipIssueIds(ids);
        setTooltipRect(rect);
      } else {
        tooltipClearTimerRef.current = setTimeout(() => {
          if (!tooltipHoveredRef.current) {
            setTooltipIssueIds([]);
            setTooltipRect(null);
          }
          tooltipClearTimerRef.current = null;
        }, 100);
      }
    },
    []
  );

  // ── Derived display values ────────────────────────────────────────
  const gradeDisplay =
    formatGrade(submission.numericPercentage, submission.letterGrade) ?? null;
  const submissionTitle =
    submission.title.trim() || doc.title || 'Untitled';

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* ── Nav ───────────────────────────────────────────────────── */}
      <nav className="flex w-full items-center gap-3 border-b bg-white px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link to={`/app/submissions/${submission.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to feedback
          </Link>
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        <Input
          ref={titleInputRef}
          data-testid="document-title-input"
          size="sm"
          className="min-w-0 max-w-[260px] rounded-lg border border-transparent font-bold transition hover:border-border"
          defaultValue={doc.title}
          placeholder="Untitled document"
          onBlur={(e) =>
            e.target.value !== doc.title
              ? fetcher.submit(
                  { title: e.target.value },
                  {
                    method: 'POST',
                    action: `/api/model/document/${doc.id}?from=title-input`,
                  }
                )
              : undefined
          }
        />

        {gradeDisplay ? (
          <Badge
            variant="secondary"
            className="shrink-0 border-purple-300 bg-purple-100 text-purple-800"
          >
            {gradeDisplay}
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <DocumentHistory documentId={doc.id} syncStatus={syncStatus} />
          <Button
            size="sm"
            variant="default"
            disabled={submit.isSubmitting || !editorSubmittable}
            onClick={() => submit.submitNow()}
            data-testid="submit-revised-version-button"
          >
            {submit.isSubmitting ? 'Submitting…' : 'Submit Revised Version'}
          </Button>
        </div>
      </nav>

      {/* ── Split body ────────────────────────────────────────────── */}
      <div className="flex grow overflow-hidden">
        {/* Left: feedback (read-only submission view) */}
        <div
          className="flex w-1/2 shrink-0 overflow-hidden border-r"
          data-testid="revision-feedback-panel"
        >
          {/* Stacked left column: Grade Summary + Grade Comments */}
          <div className="no-scrollbar flex w-[240px] shrink-0 flex-col overflow-y-auto border-r bg-white">
            <div className="flex shrink-0 items-center border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Grade Summary</span>
            </div>
            <GradeSummaryPanel submission={submission} />
            <GradingCommentsSidebar
              submissionComments={submission.comments as any}
              submissionId={submission.id}
              sourceText={submission.text ?? ''}
              readOnly
              activeGradeCommentId={activeGradeCommentId}
              onSelectGradeComment={setActiveGradeCommentId}
            />
          </div>

          {/* Essay + highlights */}
          <div className="relative flex min-w-0 grow flex-col overflow-hidden bg-white">
            <EssayPanel ref={setEssayRef} html={submission.html ?? ''} />
            {essayElement ? (
              <GradeHighlightsOverlay
                contentRoot={essayElement}
                highlights={essayHighlights}
                activeGradeCommentId={activeGradeCommentId}
                onGradeCommentSelect={setActiveGradeCommentId}
                onGrammarIssueHover={handleGrammarIssueHover}
              />
            ) : null}
          </div>
        </div>

        {/* Right: editable document */}
        <div
          className="flex w-1/2 flex-col overflow-hidden bg-white"
          data-testid="revision-editor-panel"
        >
          <div className="flex shrink-0 items-center border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Your Revision</span>
          </div>
          <div className="relative min-h-0 grow">
            <CommentsSelectionProvider>
              <DocumentEditor
                docId={doc.id}
                serverHtml={doc.html ?? ''}
                serverText={doc.text ?? ''}
                serverUpdatedAt={doc.updatedAt}
                initialRevision={doc.revision}
                isEditable={isEditorEditable}
                onBridgeReady={(bridge) => {
                  editorBridgeRef.current = bridge;
                }}
                onSubmittableContentChange={handleSubmittableContentChange}
                onSyncStatusChange={setSyncStatus}
              />
            </CommentsSelectionProvider>
          </div>
        </div>
      </div>

      {/* Session expired dialog */}
      <Dialog open={auth.isLocked} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Session Expired</DialogTitle>
            <DialogDescription>
              Your session expired while editing. Editing is now paused to
              prevent data loss. Please log in again to continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              data-testid="session-expired-login"
              onClick={handleLoginRedirect}
              className="w-full sm:w-auto"
            >
              Log In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grammar tooltip */}
      {activeGrammarIssues.length > 0 && tooltipPos ? (
        <div
          className="fixed z-50 max-w-xs rounded-lg border border-purple-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          onMouseEnter={() => {
            tooltipHoveredRef.current = true;
            if (tooltipClearTimerRef.current) {
              clearTimeout(tooltipClearTimerRef.current);
              tooltipClearTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            tooltipHoveredRef.current = false;
            setTooltipIssueIds([]);
            setTooltipRect(null);
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-purple-500" />
            <p className="text-xs font-semibold text-purple-700">
              {activeGrammarIssues[0].kind === 'error'
                ? 'Grammar Error'
                : 'Style Suggestion'}
            </p>
          </div>
          <p className="mt-1.5 text-sm leading-snug select-text">
            {activeGrammarIssues[0].message}
          </p>
        </div>
      ) : null}
    </main>
  );
}

// ── Grade summary panel ───────────────────────────────────────────────

function GradeSummaryPanel({
  submission,
}: {
  submission: {
    numericPercentage: number | null;
    letterGrade: string | null;
    overallComment: string | null;
    rubricScores: unknown;
  };
}) {
  const rawRubric = (submission.rubricScores ?? {}) as Record<
    string,
    number | { score: number; comment?: string }
  >;
  const rubricEntries = Object.entries(rawRubric).map(([key, val]) => {
    const score =
      typeof val === 'object' && val !== null
        ? (val as { score: number }).score
        : (val as number);
    const comment =
      typeof val === 'object' && val !== null
        ? (val as { comment?: string }).comment
        : undefined;
    return { key, score, comment };
  });
  const hasGrade = submission.numericPercentage != null;

  if (!hasGrade) {
    return (
      <div className="p-4">
        <p className="text-sm italic text-muted-foreground">No grade yet</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">Overall Grade</h3>
        <p className="text-xl font-semibold">
          {submission.numericPercentage}%
          {submission.letterGrade ? ` (${submission.letterGrade})` : ''}
        </p>
      </div>
      {submission.overallComment ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Feedback</h3>
          <p className="mt-1 text-xs whitespace-pre-wrap leading-relaxed">
            {submission.overallComment}
          </p>
        </div>
      ) : null}
      {rubricEntries.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Rubric</h3>
          <Accordion type="multiple" className="mt-2">
            {rubricEntries.map(({ key, score, comment }) => (
              <AccordionItem
                key={key}
                value={key}
                className="border-b last:border-0"
              >
                <AccordionTrigger className="py-2 text-xs hover:no-underline">
                  <div className="flex w-full items-center justify-between pr-2">
                    <span className="font-medium text-left">
                      {key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {score}/5
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {comment ? (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {comment}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No feedback for this category
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}
    </div>
  );
}
