import { invariant } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
} from 'react-router';
import {
  useLoaderData,
  Link,
  useSearchParams,
  useNavigate,
  useFetcher,
  useLocation,
  useRevalidator,
  redirect,
} from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { requireUserId, requireMembership } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import { buildTeacherDocumentAccessWhere } from '~/utils/grading-auth.server';
import { redirectWithToast } from '~/utils/toast.server';
import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import { hasRecordedGrade } from '~/domain/grading/recorded-grade';
import { type RubricDisplayConfig } from '~/domain/grading/rubric-display';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { parseAssistantSuggestion } from '~/domain/grading/assistant-suggestion';
import { resolveGrammarHighlightingEnabled } from '~/domain/assignment-types/rubric-category-options';
import { resolveRevisionEntryPath } from '~/domain/revisions/revision-flow';
import { findExcerptRange } from '~/utils/excerpt-position';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { EssayPanel } from './essay-panel';
import { GradingCommentsSidebar } from './teacher-grading/grading-comments-sidebar';
import { TeacherPasteReport } from '~/components/teacher-paste-report';
import { SelectionToolbar } from './teacher-grading/selection-toolbar';
import { GradeHighlightsOverlay } from './teacher-grading/grade-highlights-overlay';
import { SubmissionLifecyclePanel } from './teacher-grading/submission-lifecycle-panel';
import { GradeSummaryReleasedLabel } from './teacher-grading/grade-summary-released-label';
import { SubmissionActivitySheet } from './teacher-grading/submission-activity-sheet';
import { ViewPanel } from './teacher-grading/view-panel';
import { resolveSubmissionGradeMode } from './submission-grade-mode';
import { resolveSubmissionLifecycleState } from './submission-lifecycle-state';
import {
  resolveGrammarHighlightingForAssignmentType,
  resolveRubricConfigForSubmission,
} from './submission-rubric-config.server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// ── Revalidation ─────────────────────────────────────────────────────

export function shouldRevalidate({
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return defaultShouldRevalidate;
}

// ── Loader ───────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const url = new URL(request.url);
  const editParam = url.searchParams.get('edit') === '1';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        is: {
          OR: [
            {
              membershipId: profile.id,
              membership: { organizationId: profile.organization.id },
            },
            {
              group: {
                is: {
                  members: {
                    some: { membershipId: profile.id, removedAt: null },
                  },
                },
              },
              classAssignment: {
                is: {
                  class: {
                    school: { organizationId: profile.organization.id },
                    students: { some: { id: profile.id } },
                  },
                },
              },
            },
            {
              ...buildTeacherDocumentAccessWhere({
                membershipId: profile.id,
                organizationId: profile.organization.id,
              }),
            },
            ...(isAdmin ? [{}] : []),
          ],
        },
      },
    },
    select: {
      id: true,
      updatedAt: true,
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
      gradedByMembershipId: true,
      archivedAt: true,
      unsubmittedAt: true,
      documentId: true,
      document: {
        select: {
          id: true,
          title: true,
          assignmentTypeId: true,
          assignment: {
            select: {
              id: true,
              submitForGrade: true,
              pointValue: true,
              gradingAssistantStrictnessLevel: true,
            },
          },
          classAssignment: {
            select: {
              class: {
                select: {
                  id: true,
                  schoolId: true,
                  school: {
                    select: {
                      organizationId: true,
                      organization: {
                        select: { submissionActivityEnabled: true },
                      },
                    },
                  },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
          membership: {
            select: {
              id: true,
              organizationId: true,
              organization: {
                select: { submissionActivityEnabled: true },
              },
              userId: true,
              user: { select: { name: true } },
              classesAsStudent: {
                select: {
                  id: true,
                  schoolId: true,
                  school: { select: { organizationId: true } },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
          submissions: {
            where: { archivedAt: null, unsubmittedAt: null },
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              title: true,
              submittedAt: true,
              releasedAt: true,
              numericPercentage: true,
              letterGrade: true,
              score: true,
            },
          },
          group: {
            select: {
              id: true,
              label: true,
              members: {
                where: { removedAt: null },
                select: { membershipId: true },
              },
            },
          },
        },
      },
      comments: {
        include: {
          membership: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      gradingAssistantRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          assignmentTypeRubricSnapshot: true,
          source: true,
          status: true,
          metadata: true,
        },
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
  const isOwner =
    submission.document.membership?.userId === userId ||
    Boolean(
      submission.document.group?.members.some(
        (member) => member.membershipId === profile.id
      )
    );

  const isCurrentClassTeacher =
    submission.document.classAssignment?.class?.school.organizationId ===
      profile.organization.id &&
    submission.document.classAssignment.class.teachers.some(
      (teacher) => teacher.id === profile.id
    );
  const isLegacyClassTeacher =
    submission.document.classAssignment == null &&
    Boolean(
      submission.document.membership?.classesAsStudent.some(
        (klass) =>
          klass.school.organizationId === profile.organization.id &&
          klass.teachers.some((teacher) => teacher.id === profile.id)
      )
    );
  const isTeacher =
    !isOwner &&
    profile.role === 'TEACHER' &&
    (submission.document.classAssignment?.class?.school?.organizationId ??
      submission.document.membership?.organizationId) ===
      profile.organization.id &&
    (isCurrentClassTeacher || isLegacyClassTeacher);

  const submissionActivityEnabled =
    (submission.document.classAssignment?.class?.school?.organization
      ?.submissionActivityEnabled ??
      submission.document.membership?.organization
        ?.submissionActivityEnabled) === true;

  // Unsubmitting is student-initiated: the solo owner or any active member of
  // the assigned group may withdraw, while teachers and admins are refused.
  // Once withdrawn it stops counting as turned in, so send the student back to
  // the untouched solo or shared artifact for revision and resubmission.
  if (isOwner && submission.unsubmittedAt) {
    const documentPath = submission.document.group
      ? `/app/collab-documents/${submission.documentId}`
      : `/app/documents/${submission.documentId}`;
    return redirectWithToast(documentPath, {
      description:
        'You unsubmitted this document. You can revise and resubmit it.',
      type: 'message',
    });
  }

  if (isOwner && editParam) {
    const next = new URL(request.url);
    next.searchParams.delete('edit');
    throw redirect(`${next.pathname}${next.search}${next.hash}`);
  }

  const [rubricConfig, grammarHighlightingEnabled] = await Promise.all([
    resolveRubricConfigForSubmission({
      assignmentTypeId: submission.document.assignmentTypeId,
      assignmentId: submission.document.assignment?.id,
      latestGradingRun: submission.gradingAssistantRuns[0] ?? null,
      rubricScores: submission.rubricScores,
    }),
    resolveGrammarHighlightingForAssignmentType(
      submission.document.assignmentTypeId
    ),
  ]);

  const activityPage =
    !isOwner && (isTeacher || isAdmin)
      ? await prisma.submissionActivity.findMany({
          where: {
            submissionId: submission.id,
            organizationId:
              submission.document.classAssignment?.class?.school
                ?.organizationId ??
              submission.document.membership?.organizationId ??
              profile.organization.id,
          },
          select: {
            id: true,
            eventType: true,
            source: true,
            occurredAfterRelease: true,
            changes: true,
            metadata: true,
            createdAt: true,
            actorType: true,
            actorName: true,
            actorEmail: true,
            actorMembership: {
              select: {
                user: { select: { name: true, email: true } },
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 101,
        })
      : null;
  const activities = activityPage?.slice(0, 100) ?? null;
  const activityHasMore = (activityPage?.length ?? 0) > 100;

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
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    revisionFlowEnabled: profile.organization.revisionFlowEnabled === true,
    submission: {
      ...submission,
      comments: sortedComments,
      rubricConfig,
      grammarHighlightingEnabled,
      // What the Grading Assistant last suggested, so a teacher who has since
      // edited the grade can put the suggestions back.
      assistantSuggestion: parseAssistantSuggestion(
        submission.gradingAssistantRuns[0] ?? null
      ),
    },
    isOwner,
    isTeacher: isTeacher || isAdmin,
    submissionActivityEnabled,
    ...(activities == null ? {} : { activities, activityHasMore }),
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function SubmissionRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const {
    submission,
    isOwner,
    isTeacher,
    submissionActivityEnabled,
    revisionFlowEnabled,
  } = loaderData;
  const activities = 'activities' in loaderData ? loaderData.activities : [];
  const activityHasMore =
    'activityHasMore' in loaderData ? loaderData.activityHasMore : false;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const revalidator = useRevalidator();
  const titleFetcher = useFetcher();
  const isGradingOther = isTeacher && !isOwner;

  const [localGradedAt, setLocalGradedAt] = useState<string | null>(null);
  const [localReleasedAt, setLocalReleasedAt] = useState<string | null>(null);
  const [isEditingGrade, setIsEditingGrade] = useState(
    () =>
      !submission.releasedAt &&
      !(
        submission.gradedAt &&
        hasRecordedGrade({
          numericPercentage: submission.numericPercentage,
          overallScore: submission.overallScore,
          score: submission.score,
        })
      )
  );
  const [teacherGradeUi, setTeacherGradeUi] = useState<{
    numericPercentage: number | null;
    letterGrade: string | null;
    overallScore: number | null;
    score: string | null;
    overallComment: string | null;
    rubricScores: unknown;
    rubricConfig?: RubricDisplayConfig | null;
  } | null>(null);

  useEffect(() => {
    setTeacherGradeUi(null);
    setIsEditingGrade(
      !submission.releasedAt &&
        !(
          submission.gradedAt &&
          hasRecordedGrade({
            numericPercentage: submission.numericPercentage,
            overallScore: submission.overallScore,
            score: submission.score,
          })
        )
    );
  }, [submission.id]);

  // Optimistic grade display values are tied to the loader revision that was
  // current when they were saved. Once any same-route revalidation advances
  // the submission revision, discard that snapshot and use the authoritative
  // loader values. Otherwise a later edit could combine stale displayed grade
  // values with the newer concurrency token and silently overwrite another
  // teacher's update.
  useEffect(() => {
    setTeacherGradeUi(null);
  }, [submission.updatedAt]);

  useEffect(() => {
    if (titleFetcher.state !== 'idle') return;
    const body = titleFetcher.data as { success?: boolean } | undefined;
    if (body?.success) revalidator.revalidate();
  }, [titleFetcher.state, titleFetcher.data, revalidator]);

  const effectiveGradedAt = localGradedAt ?? submission.gradedAt;
  const effectiveReleasedAt = localReleasedAt ?? submission.releasedAt;
  const isWithdrawn = submission.unsubmittedAt != null;
  const isGraded = !!effectiveGradedAt;
  const isReleased = !!effectiveReleasedAt;
  const effectiveNumericPct =
    teacherGradeUi?.numericPercentage ?? submission.numericPercentage ?? null;
  const effectiveOverallScore =
    teacherGradeUi?.overallScore ?? submission.overallScore ?? null;
  const effectiveScore = teacherGradeUi?.score ?? submission.score ?? null;
  const lifecycleState = resolveSubmissionLifecycleState({
    isGraded: isWithdrawn ? false : isGraded,
    isReleased: isWithdrawn ? false : isReleased,
    hasGrade: hasRecordedGrade({
      numericPercentage: effectiveNumericPct,
      overallScore: effectiveOverallScore,
      score: effectiveScore,
    }),
  });
  const isGradeMode = resolveSubmissionGradeMode({
    isGradingOther,
    lifecycleState,
    isEditingGrade,
    submissionActivityEnabled,
  });
  // Students viewing a submission whose grade hasn't been released yet
  const isPending = isOwner && !effectiveReleasedAt;

  const canEditTitle = isOwner || isTeacher;
  const submissionTitleDisplay =
    submission.title.trim() || submission.document.title || '';
  const submissionVersions = submission.document.submissions ?? [];

  // Exit target — same pattern as documents route
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );
  const versionHref = (submissionId: string) => {
    const params = new URLSearchParams();
    if (explicitExitTarget) params.set('exitTo', explicitExitTarget);
    const query = params.toString();
    return `/app/submissions/${submissionId}${query ? `?${query}` : ''}`;
  };
  const essayRef = useRef<HTMLDivElement>(null);
  const [essayElement, setEssayElement] = useState<HTMLDivElement | null>(null);
  const setEssayRef = useCallback((el: HTMLDivElement | null) => {
    (essayRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setEssayElement(el);
  }, []);

  // ── Grade display ──────────────────────────────────────────────────
  const effectiveLetterGrade =
    teacherGradeUi?.letterGrade ?? submission.letterGrade ?? null;
  const assignmentIsSubmittedForGrade =
    submission.document.assignment?.submitForGrade !== false;
  const gradeDisplay =
    formatAssignmentGrade({
      submitForGrade: submission.document.assignment?.submitForGrade,
      numericPercentage: effectiveNumericPct,
      letterGrade: effectiveLetterGrade,
      pointValue: submission.document.assignment?.pointValue ?? null,
      score: effectiveScore,
    }) ||
    (assignmentIsSubmittedForGrade && effectiveOverallScore != null
      ? `${effectiveOverallScore}/${submission.rubricConfig?.maxScore ?? 5}`
      : null);

  // ── Status badge (reflects optimistic save / release) ─────────────
  const statusLabel = isWithdrawn
    ? 'Withdrawn'
    : isOwner
      ? effectiveReleasedAt
        ? 'Graded'
        : submission.submittedAt
          ? 'Submitted'
          : 'Draft'
      : effectiveReleasedAt
        ? 'Released'
        : lifecycleState === 'graded'
          ? 'Graded'
          : submission.submittedAt
            ? 'Submitted'
            : 'Draft';
  const statusVariant = isOwner
    ? isWithdrawn
      ? ('secondary' as const)
      : effectiveReleasedAt
        ? ('success' as const)
        : submission.submittedAt
          ? ('info-outlined' as const)
          : ('secondary' as const)
    : isWithdrawn
      ? ('secondary' as const)
      : effectiveReleasedAt
        ? ('success' as const)
        : lifecycleState === 'graded'
          ? ('success' as const)
          : submission.submittedAt
            ? ('info-outlined' as const)
            : ('secondary' as const);

  // ── Local comments state (optimistic, no revalidation) ─────────────
  const [comments, setComments] = useState(submission.comments);
  const handleCommentCreated = useCallback(
    (comment: any) => {
      setComments((prev) => [...prev, comment]);
      revalidator.revalidate();
    },
    [revalidator]
  );
  const handleCommentDeleted = useCallback(
    (commentId: string) => {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      revalidator.revalidate();
    },
    [revalidator]
  );
  const handleCommentUpdated = useCallback(
    (commentId: string, content: string) => {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, content } : c))
      );
      revalidator.revalidate();
    },
    [revalidator]
  );

  // ── Grade mode state ───────────────────────────────────────────────
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<
    string | null
  >(null);

  // Clear active comment when clicking outside a highlight or comment card
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
  const [draftHighlight, setDraftHighlight] = useState<{
    excerpt: string;
    occurrence: number;
  } | null>(null);
  const [tooltipIssueIds, setTooltipIssueIds] = useState<string[]>([]);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [tooltipPage, setTooltipPage] = useState(0);
  const tooltipHoveredRef = useRef(false);
  const tooltipClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  /**
   * Grammar marks stored on the submission are only shown while the rubric
   * still asks for them. Turning the category's grammar highlighting off used
   * to leave every mark from an earlier grading run on the page, so the
   * setting looked ignored.
   */
  const grammarHighlightingEnabled = useMemo(() => {
    // The assignment type's own setting wins: switching highlighting off is
    // expected to clear marks a previous grading run left behind.
    if (typeof submission.grammarHighlightingEnabled === 'boolean') {
      return submission.grammarHighlightingEnabled;
    }
    return resolveGrammarHighlightingEnabled(
      (teacherGradeUi?.rubricConfig ?? submission.rubricConfig)?.categories ??
        []
    );
  }, [
    submission.grammarHighlightingEnabled,
    teacherGradeUi?.rubricConfig,
    submission.rubricConfig,
  ]);

  const persistedGrammarIssues = useMemo(
    () =>
      grammarHighlightingEnabled
        ? parseGrammarIssuesPayload(submission.grammarIssues, {
            sourceText: submission.text ?? '',
          })
        : [],
    [
      grammarHighlightingEnabled,
      submission.text,
      submission.id,
      submission.grammarIssues,
    ]
  );
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>(
    persistedGrammarIssues
  );
  const grammarIssuesRef = useRef(grammarIssues);
  grammarIssuesRef.current = grammarIssues;
  const grammarIssueSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const grammarIssueSaveVersionRef = useRef(0);
  const [hiddenGrammarIssueIds, setHiddenGrammarIssueIds] = useState<string[]>(
    []
  );
  /** Student-only: hide purple AI grammar marks in the essay (teacher feedback marks stay). */
  const [studentGrammarHighlightsVisible, setStudentGrammarHighlightsVisible] =
    useState(true);

  // Resync grammar issues when persisted value changes
  const lastPersistedRef = useRef(persistedGrammarIssues);
  if (lastPersistedRef.current !== persistedGrammarIssues) {
    lastPersistedRef.current = persistedGrammarIssues;
    grammarIssuesRef.current = persistedGrammarIssues;
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

  const activeGrammarIssues = useMemo(() => {
    if (tooltipIssueIds.length === 0) return [];
    return tooltipIssueIds
      .map((id) => grammarIssues.find((issue) => issue.id === id))
      .filter((issue): issue is GrammarIssue => issue != null);
  }, [grammarIssues, tooltipIssueIds]);

  const showGrammarMarksInEssay =
    isPending || isGradingOther || (isOwner && studentGrammarHighlightsVisible);

  const essayHighlights = useMemo(
    () => [
      ...(isPending
        ? []
        : comments.map((c) => ({
            id: c.id,
            excerpt: c.excerpt,
            occurrence: c.occurrence,
            dataAttr: 'data-grade-comment-id' as const,
            className: 'grade-comment-mark',
          }))),
      ...(isPending || !showGrammarMarksInEssay
        ? []
        : visibleGrammarIssues.map((g) => ({
            id: g.id,
            excerpt: g.excerpt,
            occurrence: g.occurrence,
            dataAttr: 'data-grammar-issue-id' as const,
            className: 'grammar-issue-mark',
          }))),
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
    ],
    [
      comments,
      visibleGrammarIssues,
      draftHighlight,
      isPending,
      showGrammarMarksInEssay,
    ]
  );

  useEffect(() => {
    if (studentGrammarHighlightsVisible || !isOwner) return;
    setTooltipIssueIds([]);
    setTooltipRect(null);
  }, [studentGrammarHighlightsVisible, isOwner]);

  const handleGrammarIssueHover = useCallback(
    (ids: string[], rect: DOMRect | null) => {
      if (tooltipClearTimerRef.current) {
        clearTimeout(tooltipClearTimerRef.current);
        tooltipClearTimerRef.current = null;
      }
      if (ids.length > 0) {
        setTooltipIssueIds(ids);
        setTooltipPage(0);
        setTooltipRect(rect);
      } else {
        // Delay clear so cursor can move from mark to tooltip
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

  const handleAiGradingComplete = useCallback(
    (payload: {
      numericPercentage: number | null;
      letterGrade: string | null;
      overallScore?: number | null;
      score: string | null;
      overallComment: string | null;
      rubricScores: unknown;
      rubricConfig?: RubricDisplayConfig | null;
    }) => {
      setTeacherGradeUi({ overallScore: null, ...payload });
      revalidator.revalidate();
    },
    [revalidator]
  );

  const handleGradeSaved = useCallback(
    (snapshot: {
      numericPercentage: number | null;
      letterGrade: string | null;
      overallScore: number | null;
      score: string | null;
      overallComment: string | null;
      rubricScores: unknown;
    }) => {
      setTeacherGradeUi((prev) => ({
        numericPercentage: snapshot.numericPercentage,
        letterGrade: snapshot.letterGrade,
        overallScore: snapshot.overallScore,
        score: snapshot.score,
        overallComment: snapshot.overallComment,
        rubricScores: snapshot.rubricScores,
        rubricConfig: prev?.rubricConfig ?? null,
      }));
      revalidator.revalidate();
    },
    [revalidator]
  );

  const teacherExistingGrade = useMemo(
    () => ({
      id: submission.id,
      updatedAt: submission.updatedAt,
      score: teacherGradeUi?.score ?? submission.score,
      feedback: submission.feedback,
      rubricScores: teacherGradeUi?.rubricScores ?? submission.rubricScores,
      overallComment:
        teacherGradeUi?.overallComment ?? submission.overallComment,
      numericPercentage:
        teacherGradeUi?.numericPercentage ?? submission.numericPercentage,
      letterGrade: teacherGradeUi?.letterGrade ?? submission.letterGrade,
      releasedAt: submission.releasedAt,
    }),
    [
      submission.id,
      submission.updatedAt,
      submission.feedback,
      submission.releasedAt,
      submission.score,
      submission.rubricScores,
      submission.overallComment,
      submission.numericPercentage,
      submission.letterGrade,
      teacherGradeUi,
    ]
  );

  const submissionForView = useMemo(
    () => ({
      ...submission,
      numericPercentage:
        teacherGradeUi?.numericPercentage ?? submission.numericPercentage,
      letterGrade: teacherGradeUi?.letterGrade ?? submission.letterGrade,
      overallScore: teacherGradeUi?.overallScore ?? submission.overallScore,
      score: teacherGradeUi?.score ?? submission.score,
      rubricConfig: teacherGradeUi?.rubricConfig ?? submission.rubricConfig,
      overallComment:
        teacherGradeUi?.overallComment ?? submission.overallComment,
      rubricScores: teacherGradeUi?.rubricScores ?? submission.rubricScores,
    }),
    [submission, teacherGradeUi]
  );

  const persistGrammarIssues = useCallback(
    async (issues: GrammarIssue[]) => {
      if (!isGradingOther || !isGradeMode || isReleased) return;
      const res = await fetch('/api/domain/update-submission', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          grammarIssues: issues,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to save grammar issue removal.');
      }
      revalidator.revalidate();
    },
    [isGradeMode, isGradingOther, isReleased, revalidator, submission.id]
  );

  const handleRemoveGrammarIssue = useCallback(
    async (id: string) => {
      const nextIssues = grammarIssuesRef.current.filter(
        (issue) => issue.id !== id
      );
      if (nextIssues.length === grammarIssuesRef.current.length) return;

      grammarIssuesRef.current = nextIssues;
      setGrammarIssues(nextIssues);
      setHiddenGrammarIssueIds((prev) =>
        prev.filter((currentId) => currentId !== id)
      );

      const saveVersion = ++grammarIssueSaveVersionRef.current;
      const saveRequest = grammarIssueSaveQueueRef.current
        .catch(() => undefined)
        .then(() => persistGrammarIssues(nextIssues));
      grammarIssueSaveQueueRef.current = saveRequest;

      try {
        await saveRequest;
      } catch {
        if (saveVersion === grammarIssueSaveVersionRef.current) {
          revalidator.revalidate();
        }
      }
    },
    [persistGrammarIssues, revalidator]
  );

  // ── Lifecycle panel: edit mode, Save, Release ───────────────────────
  const [isReleasing, setIsReleasing] = useState(false);

  const handleReleaseGrade = useCallback(async () => {
    setIsReleasing(true);
    try {
      const formData = new FormData();
      formData.append('submissionIds', submission.id);
      const res = await fetch('/api/domain/release-grades', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return;
      const body = (await res.json()) as { success?: boolean };
      if (body.success) {
        setLocalReleasedAt(new Date().toISOString());
        revalidator.revalidate();
      }
    } finally {
      setIsReleasing(false);
    }
  }, [revalidator, submission.id]);

  const [isSavingGrade, setIsSavingGrade] = useState(false);

  const handleMarkGraded = useCallback(async () => {
    setIsSavingGrade(true);
    try {
      const res = await fetch('/api/domain/update-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          markAsGraded: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { message?: string } | null)?.message ??
            'Failed to mark as graded.'
        );
      }
      setLocalGradedAt(new Date().toISOString());
    } finally {
      setIsSavingGrade(false);
    }
  }, [submission.id]);

  // ── Paths ──────────────────────────────────────────────────────────
  const revisePath = submission.document.group
    ? `/app/collab-documents/${submission.documentId}`
    : resolveRevisionEntryPath({
        revisionFlowEnabled,
        submissionId: submission.id,
        documentId: submission.documentId,
        isReleased: isReleased,
        isWithdrawn,
      });
  const opensRevisionFlow = revisePath.startsWith('/app/revise/');
  const viewDocumentHref = useMemo(() => {
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    const documentPath = submission.document.group
      ? `/app/collab-documents/${submission.documentId}`
      : `/app/documents/${submission.documentId}`;
    return `${documentPath}?exitTo=${encodeURIComponent(returnUrl)}`;
  }, [
    location.pathname,
    location.search,
    location.hash,
    submission.documentId,
    submission.document.group,
  ]);

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="flex w-full flex-wrap items-center gap-3 border-b bg-white px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(exitTarget)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        <div className="flex min-w-0 items-center gap-2">
          {isGradingOther &&
          (submission.document.group?.label ||
            submission.document.membership?.user.name) ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {submission.document.group?.label ??
                submission.document.membership?.user.name}
            </span>
          ) : null}
          {isGradingOther &&
          (submission.document.group?.label ||
            submission.document.membership?.user.name) ? (
            <span className="text-muted-foreground/40 shrink-0">·</span>
          ) : null}
          {canEditTitle ? (
            <Input
              key={`${submission.id}-${submission.title}`}
              data-testid="submission-title-input"
              size="sm"
              className="min-w-0 max-w-md truncate rounded-lg border border-transparent text-sm font-semibold transition hover:border-border"
              defaultValue={submissionTitleDisplay}
              placeholder="Untitled"
              disabled={titleFetcher.state !== 'idle'}
              onBlur={(e) => {
                const next = e.target.value.trim();
                const prev =
                  submission.title.trim() || submission.document.title || '';
                if (next === prev) return;
                titleFetcher.submit(
                  { intent: 'updateTitle', title: e.target.value },
                  {
                    method: 'POST',
                    action: `/api/model/submission/${submission.id}`,
                  }
                );
              }}
            />
          ) : (
            <p className="truncate text-sm font-semibold">
              {submission.title || submission.document.title || 'Untitled'}
            </p>
          )}
        </div>

        {isOwner ? (
          <Badge variant={statusVariant} className="shrink-0">
            {statusLabel}
          </Badge>
        ) : null}

        {isOwner && submissionVersions.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                data-testid="submission-version-menu"
              >
                Versions ({submissionVersions.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              {submissionVersions.map((version, index) => {
                const versionNumber = submissionVersions.length - index;
                const isCurrent = version.id === submission.id;
                const gradeLabel =
                  version.numericPercentage != null
                    ? `${version.numericPercentage}%${
                        version.letterGrade ? ` (${version.letterGrade})` : ''
                      }`
                    : version.score?.trim() || null;
                const lifecycleLabel = version.releasedAt
                  ? gradeLabel
                    ? `Graded · ${gradeLabel}`
                    : 'Graded'
                  : 'Submitted';

                return (
                  <DropdownMenuItem
                    key={version.id}
                    asChild
                    className={isCurrent ? 'bg-muted' : undefined}
                  >
                    <Link
                      to={versionHref(version.id)}
                      aria-current={isCurrent ? 'page' : undefined}
                      data-testid={`submission-version-${version.id}`}
                      className="flex w-full items-center justify-between gap-4"
                    >
                      <span className="font-medium">
                        Version {versionNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {lifecycleLabel}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {isGradingOther ? (
            <SubmissionActivitySheet
              activities={activities as any}
              hasMore={activityHasMore}
            />
          ) : null}
          {isGradingOther ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                to={viewDocumentHref}
                data-testid="submission-view-document"
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View document
              </Link>
            </Button>
          ) : null}
          {isOwner && !isPending && persistedGrammarIssues.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={studentGrammarHighlightsVisible}
              data-testid="toggle-grammar-highlights"
              onClick={() => setStudentGrammarHighlightsVisible((v) => !v)}
            >
              {studentGrammarHighlightsVisible
                ? 'Hide grammar highlights'
                : 'Show grammar highlights'}
            </Button>
          ) : null}
          {/* Shared artifacts stay on their collaborative editor; the solo
              revision flow assumes one student owner and must not be reused. */}
          {isOwner ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={revisePath} data-testid="submission-revise-essay">
                {submission.document.group
                  ? 'Open shared draft'
                  : opensRevisionFlow
                    ? 'Revise with feedback'
                    : 'Open document editor'}
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>

      {isGradingOther && submission.archivedAt ? (
        <div
          className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          data-testid="teacher-submission-archived-banner"
          role="status"
        >
          <span className="font-medium">Archived by student.</span> They hid
          this version from their own list. You can still grade it—make sure
          this is the submission you intend to score.
        </div>
      ) : null}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 grow flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Left panel: grading (edit/view toggle for teachers) or view-only summary */}
        <div className="no-scrollbar flex h-[70vh] w-full shrink-0 flex-col overflow-hidden border-b bg-white md:h-auto md:w-[380px] md:border-r md:border-b-0">
          {isGradingOther ? (
            <SubmissionLifecyclePanel
              lifecycleState={lifecycleState}
              submissionActivityEnabled={submissionActivityEnabled}
              isEditingGrade={isEditingGrade}
              onEditingGradeChange={setIsEditingGrade}
              onMarkGraded={handleMarkGraded}
              onGradeSaved={handleGradeSaved}
              isSavingGrade={isSavingGrade}
              onRelease={handleReleaseGrade}
              isReleasing={isReleasing}
              submissionForView={submissionForView}
              documentId={submission.documentId}
              submissionId={submission.id}
              existingGrade={teacherExistingGrade}
              grammarIssues={grammarIssues}
              hiddenGrammarIssueIds={hiddenGrammarIssueIds}
              onToggleGrammarIssue={toggleGrammarIssueVisibility}
              onRemoveGrammarIssue={handleRemoveGrammarIssue}
              onGrammarIssuesChange={handleGrammarIssuesChange}
              onAiGradingComplete={handleAiGradingComplete}
              rubricConfig={
                teacherGradeUi?.rubricConfig ?? submission.rubricConfig
              }
              assistantSuggestion={submission.assistantSuggestion}
              initialGradingAssistantStrictnessLevel={
                submission.document.assignment?.gradingAssistantStrictnessLevel
              }
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-sm font-semibold">Grade Summary</span>
                {isReleased ? <GradeSummaryReleasedLabel /> : null}
              </div>
              <div className="no-scrollbar grow overflow-y-auto">
                {isPending ? (
                  <PendingViewPanel />
                ) : (
                  <ViewPanel submission={submissionForView} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Center: Essay */}
        <div className="flex min-h-[60vh] min-w-0 grow flex-col overflow-hidden bg-white md:h-full md:min-h-0">
          <EssayPanel ref={setEssayRef} html={submission.html ?? ''} />
          {isGradingOther && essayElement ? (
            <SelectionToolbar contentRoot={essayElement} />
          ) : null}
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

        {/* Right: Feedback comments */}
        <div className="no-scrollbar max-h-[60vh] w-full shrink-0 overflow-y-auto border-t bg-white md:max-h-none md:w-[320px] md:border-t-0 md:border-l">
          <TeacherPasteReport
            key={submission.id}
            enabled={isGradingOther}
            submissionId={submission.id}
            contentRoot={essayElement}
          >
            <GradingCommentsSidebar
              submissionComments={isPending ? [] : (comments as any)}
              submissionId={submission.id}
              sourceText={submission.text ?? ''}
              readOnly={!isGradingOther}
              activeGradeCommentId={activeGradeCommentId}
              onSelectGradeComment={setActiveGradeCommentId}
              onDraftHighlightChange={setDraftHighlight}
              onCommentCreated={handleCommentCreated}
              onCommentDeleted={handleCommentDeleted}
              onCommentUpdated={handleCommentUpdated}
            />
          </TeacherPasteReport>
        </div>
      </div>

      {/* Grammar issue tooltip — shown on hover over purple-highlighted text */}
      {!isPending && activeGrammarIssues.length > 0 && tooltipPos
        ? (() => {
            const currentIssue =
              activeGrammarIssues[tooltipPage] ?? activeGrammarIssues[0];
            const hasMultiple = activeGrammarIssues.length > 1;
            return (
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-purple-500" />
                    <p className="text-xs font-semibold text-purple-700">
                      {currentIssue.kind === 'error'
                        ? 'Grammar Error'
                        : 'Style Suggestion'}
                    </p>
                  </div>
                  {hasMultiple ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-purple-500 hover:bg-purple-100"
                        onClick={() =>
                          setTooltipPage(
                            (p) =>
                              (p - 1 + activeGrammarIssues.length) %
                              activeGrammarIssues.length
                          )
                        }
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs text-purple-500">
                        {tooltipPage + 1}/{activeGrammarIssues.length}
                      </span>
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-purple-500 hover:bg-purple-100"
                        onClick={() =>
                          setTooltipPage(
                            (p) => (p + 1) % activeGrammarIssues.length
                          )
                        }
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm leading-snug select-text">
                  {currentIssue.message}
                </p>
                {currentIssue.rule ? (
                  <p className="mt-1.5 text-xs text-muted-foreground select-text border-t pt-1.5">
                    Rule: {currentIssue.rule}
                  </p>
                ) : null}
                {isGradeMode ? (
                  <div className="mt-2 border-t pt-2">
                    <button
                      type="button"
                      className="w-full rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100"
                      onClick={() => {
                        handleRemoveGrammarIssue(currentIssue.id);
                        setTooltipIssueIds([]);
                        setTooltipRect(null);
                      }}
                    >
                      Remove comment
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })()
        : null}
    </main>
  );
}

// ── Pending View Panel (student, grade not yet released) ─────────────

function PendingViewPanel() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
        <p className="text-sm font-semibold mt-0.5">Submitted</p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Grade</h3>
        <p className="mt-0.5 text-sm italic text-muted-foreground">
          Pending grade
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Feedback</h3>
        <p className="mt-0.5 text-sm italic text-muted-foreground">
          Pending feedback
        </p>
      </div>
    </div>
  );
}
