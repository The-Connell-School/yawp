import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { useLoaderData, Link, useSearchParams, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { requireUserId, requireProfile } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { findExcerptRange } from '~/utils/excerpt-position';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { EssayPanel } from './essay-panel';
import { TeacherGradingPanel } from './teacher-grading/teacher-grading-panel';
import { GradingCommentsSidebar } from './teacher-grading/grading-comments-sidebar';
import { SelectionToolbar } from './teacher-grading/selection-toolbar';
import { GradeHighlightsOverlay } from './teacher-grading/grade-highlights-overlay';

// ── Revalidation ─────────────────────────────────────────────────────

export function shouldRevalidate() {
  return false;
}

// ── Loader ───────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const url = new URL(request.url);
  const editParam = url.searchParams.get('edit') === '1';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        OR: [
          // Owner of the document
          { profile: { id: profile.id } },
          // Teacher of the student's class
          {
            profile: {
              studentProfile: {
                classes: {
                  some: {
                    teachers: {
                      some: { profileId: profile.id },
                    },
                  },
                },
              },
            },
          },
          // Admin override
          ...(user?.isAdmin ? [{}] : []),
        ],
      },
    },
    select: {
      id: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      score: true,
      feedback: true,
      rubricScores: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      grammarIssues: true,
      promptConfig: true,
      aiMeta: true,
      releasedAt: true,
      gradedAt: true,
      gradedById: true,
      documentId: true,
      document: {
        select: {
          id: true,
          title: true,
          profile: {
            select: {
              id: true,
              userId: true,
              user: { select: { name: true } },
            },
          },
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

  // Determine if viewer is the owner (student) or a teacher
  const isOwner = submission.document.profile.id === profile.id;

  // Teacher detection: profile has a teacherProfile linked to student's class
  const isTeacher = !isOwner
    ? !!(await prisma.teacherProfile.findFirst({
        where: {
          profileId: profile.id,
          classes: {
            some: {
              students: {
                some: {
                  profileId: submission.document.profile.id,
                },
              },
            },
          },
        },
        select: { id: true },
      }))
    : false;

  const isAdmin = user?.isAdmin ?? false;

  // Students can only see their own released submissions
  if (isOwner && !submission.releasedAt) {
    return redirectWithToast(`/app/documents/${submission.documentId}`, {
      description: 'Grade has not been released yet.',
      type: 'error',
    });
  }

  // Grade mode: teacher AND (not yet graded OR editing)
  const isGradeMode =
    (isTeacher || isAdmin) && (!submission.gradedAt || editParam);

  // Sort comments by document location
  const sortedComments = [...submission.comments].sort((a, b) => {
    const aRange = findExcerptRange(
      submission.text,
      a.excerpt,
      a.occurrence ?? 1
    );
    const bRange = findExcerptRange(
      submission.text,
      b.excerpt,
      b.occurrence ?? 1
    );
    if (aRange && bRange) {
      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      return aRange.end - bRange.end;
    }
    if (aRange) return -1;
    if (bRange) return 1;
    return (
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });

  return {
    submission: {
      ...submission,
      comments: sortedComments,
    },
    isOwner,
    isTeacher: isTeacher || isAdmin,
    isGradeMode,
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function SubmissionRoute() {
  const { submission, isOwner, isTeacher, isGradeMode: loaderGradeMode } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Grade mode driven by ?edit=1 query param so refreshes keep the same tab
  const isGradeMode = isTeacher && (loaderGradeMode || searchParams.get('edit') === '1');

  // Exit target — same pattern as documents route
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );
  const essayRef = useRef<HTMLDivElement>(null);
  const [essayElement, setEssayElement] = useState<HTMLDivElement | null>(null);
  const setEssayRef = useCallback(
    (el: HTMLDivElement | null) => {
      (essayRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setEssayElement(el);
    },
    []
  );

  // ── Grade display ──────────────────────────────────────────────────
  const gradeDisplay =
    formatGrade(
      submission.numericPercentage ?? null,
      submission.letterGrade ?? null
    ) ||
    submission.score ||
    (submission.overallScore ? `${submission.overallScore}/5` : null);

  // ── Status badge ───────────────────────────────────────────────────
  const statusLabel = submission.gradedAt
    ? 'Graded'
    : submission.submittedAt
      ? 'Submitted'
      : 'Draft';
  const statusVariant = submission.gradedAt
    ? ('success' as const)
    : submission.submittedAt
      ? ('info-outlined' as const)
      : ('secondary' as const);

  // ── Local comments state (optimistic, no revalidation) ─────────────
  const [comments, setComments] = useState(submission.comments);
  const handleCommentCreated = useCallback((comment: any) => {
    setComments((prev) => [...prev, comment]);
  }, []);
  const handleCommentDeleted = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);
  const handleCommentUpdated = useCallback((commentId: string, content: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content } : c))
    );
  }, []);

  // ── Grade mode state ───────────────────────────────────────────────
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<
    string | null
  >(null);
  const [draftHighlight, setDraftHighlight] = useState<{
    excerpt: string;
    occurrence: number;
  } | null>(null);
  const [tooltipIssueId, setTooltipIssueId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);

  const persistedGrammarIssues = useMemo(
    () =>
      parseGrammarIssuesPayload(submission.grammarIssues, {
        sourceText: submission.text ?? '',
      }),
    [submission.text, submission.id, submission.grammarIssues]
  );
  const [grammarIssues, setGrammarIssues] =
    useState<GrammarIssue[]>(persistedGrammarIssues);
  const [hiddenGrammarIssueIds, setHiddenGrammarIssueIds] = useState<string[]>(
    []
  );

  // Resync grammar issues when persisted value changes
  const lastPersistedRef = useRef(persistedGrammarIssues);
  if (lastPersistedRef.current !== persistedGrammarIssues) {
    lastPersistedRef.current = persistedGrammarIssues;
    setGrammarIssues(persistedGrammarIssues);
    setHiddenGrammarIssueIds([]);
  }

  const visibleGrammarIssues = useMemo(
    () =>
      grammarIssues.filter(
        (issue) => !hiddenGrammarIssueIds.includes(issue.id)
      ),
    [grammarIssues, hiddenGrammarIssueIds]
  );

  const tooltipPos = useMemo(() => {
    if (!tooltipRect) return null;
    return {
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    };
  }, [tooltipRect]);

  const toggleGrammarIssueVisibility = useCallback((id: string) => {
    setHiddenGrammarIssueIds((prev) =>
      prev.includes(id)
        ? prev.filter((currentId) => currentId !== id)
        : [...prev, id]
    );
  }, []);

  const handleGrammarIssuesChange = useCallback((issues: GrammarIssue[]) => {
    setGrammarIssues(issues);
    setHiddenGrammarIssueIds([]);
  }, []);

  const handleRemoveGrammarIssue = useCallback((id: string) => {
    setGrammarIssues((prev) => prev.filter((issue) => issue.id !== id));
    setHiddenGrammarIssueIds((prev) =>
      prev.filter((currentId) => currentId !== id)
    );
  }, []);

  // ── Paths ──────────────────────────────────────────────────────────
  const revisePath = `/app/documents/${submission.documentId}?revise=1`;
  const editGradePath = `/app/submissions/${submission.id}?edit=1`;

  return (
    <main className="flex h-screen flex-col bg-white">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 border-b px-3 py-2">
        <Button variant="secondary" size="sm" onClick={() => navigate(exitTarget)}>
          <ArrowLeft className="h-4" />
          Exit
        </Button>

        <p className="text-sm font-semibold">
          {submission.title || submission.document.title || 'Untitled'}
        </p>

        <Badge variant={statusVariant}>{statusLabel}</Badge>

        {gradeDisplay ? (
          <Badge
            variant="secondary"
            className="border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
          >
            {gradeDisplay}
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* Student: Revise Essay link */}
          {isOwner ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={revisePath}>Revise Essay</Link>
            </Button>
          ) : null}
        </div>
      </nav>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex grow overflow-hidden">
        {/* Left panel: grading (edit/view toggle for teachers) or view-only summary */}
        <div className="no-scrollbar flex shrink-0 flex-col overflow-hidden border-r" style={{ width: 380 }}>
          {isTeacher ? (
            <>
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium">Grade Summary</span>
                <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1">
                  <Button
                    size="sm"
                    variant={isGradeMode ? 'secondary' : 'ghost'}
                    className="rounded-full px-3 text-xs"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set('edit', '1');
                      setSearchParams(params, { replace: true });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={!isGradeMode ? 'secondary' : 'ghost'}
                    className="rounded-full px-3 text-xs"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.delete('edit');
                      setSearchParams(params, { replace: true });
                    }}
                  >
                    View
                  </Button>
                </div>
              </div>
              <div className="no-scrollbar grow overflow-y-auto">
                {isGradeMode ? (
                  <TeacherGradingPanel
                    documentId={submission.documentId}
                    submissionId={submission.id}
                    existingGrade={{
                      id: submission.id,
                      score: submission.score,
                      feedback: submission.feedback,
                      rubricScores: submission.rubricScores,
                      overallComment: submission.overallComment,
                      numericPercentage: submission.numericPercentage,
                      letterGrade: submission.letterGrade,
                      releasedAt: submission.releasedAt,
                    }}
                    grammarIssues={grammarIssues}
                    persistedGrammarIssues={persistedGrammarIssues}
                    hiddenGrammarIssueIds={hiddenGrammarIssueIds}
                    onToggleGrammarIssue={toggleGrammarIssueVisibility}
                    onRemoveGrammarIssue={handleRemoveGrammarIssue}
                    onGrammarIssuesChange={handleGrammarIssuesChange}
                  />
                ) : (
                  <ViewPanel submission={submission} />
                )}
              </div>
            </>
          ) : (
            <div className="no-scrollbar grow overflow-y-auto">
              <ViewPanel submission={submission} />
            </div>
          )}
        </div>

        {/* Center: Essay */}
        <div className="flex min-w-0 grow flex-col overflow-hidden md:h-full">
          <EssayPanel ref={setEssayRef} html={submission.html ?? ''} />
          {isTeacher && essayElement ? (
            <>
              <SelectionToolbar contentRoot={essayElement} />
              <GradeHighlightsOverlay
                contentRoot={essayElement}
                highlights={[
                  ...comments.map((c) => ({
                    id: c.id,
                    excerpt: c.excerpt,
                    occurrence: c.occurrence,
                    dataAttr: 'data-grade-comment-id' as const,
                    className: 'grade-comment-mark',
                  })),
                  ...visibleGrammarIssues.map((g) => ({
                    id: g.id,
                    excerpt: g.excerpt,
                    occurrence: g.occurrence,
                    dataAttr: 'data-grammar-issue-id' as const,
                    className: 'grammar-issue-mark',
                  })),
                  ...(draftHighlight
                    ? [
                        {
                          id: 'draft',
                          excerpt: draftHighlight.excerpt,
                          occurrence: draftHighlight.occurrence,
                          dataAttr: 'data-grade-comment-id' as const,
                          className: 'grade-comment-mark draft',
                        },
                      ]
                    : []),
                ]}
                activeGradeCommentId={activeGradeCommentId}
                onGradeCommentSelect={setActiveGradeCommentId}
                onGrammarIssueHover={(id, rect) => {
                  setTooltipIssueId(id);
                  setTooltipRect(rect);
                }}
              />
            </>
          ) : null}
        </div>

        {/* Right: Feedback comments */}
        <div className="no-scrollbar shrink-0 overflow-y-auto border-l" style={{ width: 320 }}>
          <GradingCommentsSidebar
            submissionComments={comments as any}
            submissionId={submission.id}
            sourceText={submission.text ?? ''}
            activeGradeCommentId={activeGradeCommentId}
            onSelectGradeComment={setActiveGradeCommentId}
            onDraftHighlightChange={setDraftHighlight}
            onCommentCreated={handleCommentCreated}
            onCommentDeleted={handleCommentDeleted}
            onCommentUpdated={handleCommentUpdated}
          />
        </div>
      </div>
    </main>
  );
}

// ── View Panel (read-only grade fields for student / view mode) ───────

function ViewPanel({
  submission,
}: {
  submission: {
    numericPercentage: number | null;
    letterGrade: string | null;
    overallComment: string | null;
    rubricScores: unknown;
  };
}) {
  const rawRubric = (submission.rubricScores ?? {}) as Record<string, number | { score: number; comment?: string }>;
  const rubricEntries = Object.entries(rawRubric).map(([key, val]) => {
    const score = typeof val === 'object' && val !== null ? (val as { score: number }).score : (val as number);
    const comment = typeof val === 'object' && val !== null ? (val as { comment?: string }).comment : undefined;
    return { key, score, comment };
  });
  const hasGrade = submission.numericPercentage != null;

  return (
    <div className="p-4 space-y-4">
      {hasGrade ? (
        <>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Overall Grade</h3>
            <p className="text-2xl font-semibold">
              {submission.numericPercentage}%
              {submission.letterGrade ? ` (${submission.letterGrade})` : ''}
            </p>
          </div>
          {submission.overallComment ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Overall Feedback</h3>
              <p className="mt-1 text-sm whitespace-pre-wrap">{submission.overallComment}</p>
            </div>
          ) : null}
          {rubricEntries.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Rubric</h3>
              <Accordion type="multiple" className="mt-2">
                {rubricEntries.map(({ key, score, comment }) => (
                  <AccordionItem key={key} value={key} className="border-b last:border-0">
                    <AccordionTrigger className="py-2 text-sm hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-2">
                        <span className="font-medium">{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                        <span className="text-muted-foreground">{score}/5</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {comment ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{comment}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No feedback for this category</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Not yet graded</p>
      )}
    </div>
  );
}
