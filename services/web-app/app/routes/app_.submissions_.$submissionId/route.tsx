import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { useLoaderData, Link, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { SubmissionCommentCard } from '~/components/submission-comment-card';
import { requireUserId, requireProfile } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { findExcerptRange } from '~/utils/excerpt-position';
import { EssayPanel } from './essay-panel';
import { TeacherGradingPanel } from './teacher-grading/teacher-grading-panel';
import { GradingCommentsSidebar } from './teacher-grading/grading-comments-sidebar';
import { SelectionToolbar } from './teacher-grading/selection-toolbar';
import { GradeHighlightsOverlay } from './teacher-grading/grade-highlights-overlay';

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
  const { submission, isOwner, isTeacher, isGradeMode } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
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
    <main className="flex h-screen flex-col">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 border-b px-3 py-2">
        <Button variant="secondary" size="sm" asChild>
          <Link to="/app">
            <ArrowLeft className="h-4" />
            Back
          </Link>
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
          {/* Teacher in view mode: show Edit Grade button */}
          {isTeacher && !isGradeMode && submission.gradedAt ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={editGradePath}>Edit Grade</Link>
            </Button>
          ) : null}

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
        {isGradeMode ? (
          <>
            {/* Left: Grading panel */}
            <div className="hidden w-full overflow-y-auto border-r md:block md:w-1/4">
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
            </div>

            {/* Center: Essay */}
            <div className="flex w-full flex-col overflow-hidden md:h-full md:w-2/4">
              <EssayPanel ref={setEssayRef} html={submission.html ?? ''} />
              {essayElement ? (
                <>
                  <SelectionToolbar contentRoot={essayElement} />
                  <GradeHighlightsOverlay
                    contentRoot={essayElement}
                    highlights={[
                      ...submission.comments.map((c) => ({
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
            <div className="hidden w-full overflow-y-auto border-l md:block md:w-1/4">
              <GradingCommentsSidebar
                submissionComments={submission.comments as any}
                submissionId={submission.id}
                sourceText={submission.text ?? ''}
                activeGradeCommentId={activeGradeCommentId}
                onSelectGradeComment={setActiveGradeCommentId}
                onDraftHighlightChange={setDraftHighlight}
              />
            </div>
          </>
        ) : (
          <>
            {/* View mode: Essay left, grade summary right */}
            <div className="flex w-full flex-col overflow-hidden border-r md:h-full md:w-3/5">
              <EssayPanel ref={setEssayRef} html={submission.html ?? ''} />
            </div>
            <div className="hidden w-full overflow-y-auto md:block md:w-2/5">
              <ViewPanel submission={submission} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ── View Panel (read-only grade summary + comments) ──────────────────

function ViewPanel({
  submission,
}: {
  submission: {
    numericPercentage: number | null;
    letterGrade: string | null;
    score: string | null;
    overallScore: number | null;
    overallComment: string | null;
    feedback: string | null;
    rubricScores: unknown;
    comments: Array<{
      id: string;
      content: string;
      excerpt: string | null;
      occurrence: number | null;
      createdAt: Date | string;
      profile: {
        user: { name: string | null; email: string };
      };
    }>;
  };
}) {
  const gradeDisplay =
    formatGrade(
      submission.numericPercentage ?? null,
      submission.letterGrade ?? null
    ) ||
    submission.score ||
    (submission.overallScore ? `${submission.overallScore}/5` : null);

  const rubricScores = submission.rubricScores as Record<
    string,
    { score?: number; comment?: string }
  > | null;

  return (
    <div className="flex h-full flex-col">
      {/* Grade summary */}
      {gradeDisplay || submission.overallComment || submission.feedback ? (
        <div className="border-b bg-green-50 p-4 dark:bg-green-950/20">
          <div className="flex items-center gap-2">
            <Badge variant="success">Grade Released</Badge>
            {gradeDisplay ? (
              <span className="text-sm font-medium">{gradeDisplay}</span>
            ) : null}
          </div>
          {(submission.overallComment || submission.feedback) && (
            <p className="mt-2 text-sm text-muted-foreground">
              {submission.overallComment || submission.feedback}
            </p>
          )}
        </div>
      ) : null}

      {/* Rubric scores */}
      {rubricScores && Object.keys(rubricScores).length > 0 ? (
        <div className="border-b p-4">
          <h3 className="mb-2 text-sm font-semibold">Rubric</h3>
          <div className="space-y-2">
            {Object.entries(rubricScores).map(([key, value]) => {
              if (!value || typeof value !== 'object') return null;
              const label = key
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={key} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">
                      {value.score ? `${value.score}/5` : '\u2014'}
                    </span>
                  </div>
                  {value.comment ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {value.comment}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Comments */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-2 text-sm font-semibold">Feedback Comments</h3>
        {submission.comments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No comments yet.
          </p>
        ) : (
          <div className="space-y-3">
            {submission.comments.map((comment) => (
              <SubmissionCommentCard
                key={comment.id}
                comment={comment}
                readOnly
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
