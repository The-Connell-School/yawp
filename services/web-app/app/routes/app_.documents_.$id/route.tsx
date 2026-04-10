import { invariant } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
  Link,
} from 'react-router';
import { ArrowLeft, Loader2, AlertCircle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useUser } from '~/hooks/useUser';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  isDocumentSubmissionEnabledForSchool,
  isAssignmentsEnabledForOrganization,
} from '~/utils/feature-flags.server';
import { findExcerptRange } from '~/utils/excerpt-position';
import { Comments } from './comments';
import { CommentsSelectionProvider } from './comments/selection-context';
import { DocumentEditor } from './document-editor/document-editor';
import type { EditorBridge } from './document-editor/use-editor-sync';
import { Tutor } from './tutor/tutor';
import { DocumentHistory } from './document-history/document-history';
import {
  DocumentStatusBadge,
  getDocumentStatusLabel,
} from '~/components/document-status-badge';
import { cn } from '~/utils/misc';
import { formatGrade } from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { TeacherGradingPanel } from '../app_.submissions_.$submissionId/teacher-grading/teacher-grading-panel';
import { GradingCommentsSidebar } from '../app_.submissions_.$submissionId/teacher-grading/grading-comments-sidebar';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { formatDateOnly } from '~/utils/date-only';
import type { SyncStatus } from '~/utils/sync-service';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import { useAuthHeartbeat } from './hooks/use-auth-heartbeat';
import { useCommentsState } from './hooks/use-comments-state';
import { useTutorState } from './hooks/use-tutor-state';
import { useDocumentSubmit } from './hooks/use-document-submit';

function sortByDocumentLocation<T extends { createdAt: Date | string }>(args: {
  items: T[];
  sourceText: string;
  getExcerpt: (item: T) => string | null | undefined;
  getOccurrence?: (item: T) => number | null | undefined;
}) {
  return [...args.items].sort((a, b) => {
    const aRange = findExcerptRange(
      args.sourceText,
      args.getExcerpt(a),
      args.getOccurrence?.(a) ?? 1
    );
    const bRange = findExcerptRange(
      args.sourceText,
      args.getExcerpt(b),
      args.getOccurrence?.(b) ?? 1
    );

    if (aRange && bRange) {
      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      return aRange.end - bRange.end;
    }
    if (aRange) return -1;
    if (bRange) return 1;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function sortDocumentCommentsByMarkupOrder<
  T extends { id: string; createdAt: Date | string },
>(items: T[], html: string | null | undefined) {
  if (!html) {
    return [...items].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  const orderByCommentId = new Map<string, number>();
  const regex = /data-comment-id=(['"])(.*?)\1/g;
  let order = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const commentId = match[2];
    if (!orderByCommentId.has(commentId)) {
      orderByCommentId.set(commentId, order);
      order += 1;
    }
  }

  return [...items].sort((a, b) => {
    const aOrder = orderByCommentId.get(a.id);
    const bOrder = orderByCommentId.get(b.id);

    if (aOrder != null && bOrder != null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (aOrder != null) return -1;
    if (bOrder != null) return 1;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id found');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const url = new URL(request.url);
  const shouldSaveVersion = url.searchParams.get('ssv') === '1';
  const cmsIdx = parseInt(url.searchParams.get('cmsIdx') ?? '0') || 0;
  const isReviseMode = url.searchParams.get('revise') === '1';
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const doc = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...(user?.isAdmin
        ? {}
        : {
            OR: [
              { profile: { id: profile.id } },
              {
                profile: {
                  studentProfile: {
                    classes: {
                      some: {
                        teachers: {
                          some: {
                            profileId: profile.id,
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      revision: true,
      title: true,
      html: true,
      text: true,
      class: {
        select: {
          schoolId: true,
          school: { select: { organizationId: true } },
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          tutorContext: true,
          dueDate: true,
        },
      },
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
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
          releasedAt: true,
          gradedById: true,
          gradedAt: true,
          comments: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              createdAt: true,
              content: true,
              excerpt: true,
              occurrence: true,
              profileId: true,
            },
          },
        },
      },
      revisions: { orderBy: { createdAt: 'desc' } },
      profile: { include: { user: { select: { name: true } } } },
      studentCourseModuleSessions: {
        orderBy: { studentCourseModule: { position: 'desc' } },
        include: {
          studentCourseModule: {
            include: {
              instructions: {
                orderBy: { position: 'asc' },
                include: {
                  buttons: {
                    orderBy: { position: 'asc' },
                  },
                },
              },
              studentCourse: {
                select: {
                  studentCourseModules: {
                    select: { id: true, position: true },
                    orderBy: { position: 'asc' },
                  },
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      comments: {
        include: {
          profile: { include: { user: { select: { name: true } } } },
          responses: {
            include: {
              profile: { include: { user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!doc) {
    return redirectWithToast('/app', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  const isViewingAsTeacher = profile.id !== doc.profile.id;

  const latestSubmission = doc.submissions[0] ?? null;

  if (
    !isViewingAsTeacher &&
    latestSubmission?.id &&
    latestSubmission.releasedAt &&
    !isReviseMode
  ) {
    return redirect(`/app/submissions/${latestSubmission.id}`);
  }

  if (shouldSaveVersion) {
    const latestRevision = doc.revisions[0];
    if (doc.html && doc.text && latestRevision?.html !== doc.html) {
      prisma.documentRevision
        .create({
          data: {
            documentId: doc.id,
            html: doc.html,
            text: doc.text,
            trigger: 'loader-save',
          },
        })
        .catch(() => {});
    }
  }

  let currentCms = doc.studentCourseModuleSessions[cmsIdx];

  if (!currentCms) {
    currentCms = doc.studentCourseModuleSessions[0];
  }

  if (!currentCms) {
    return redirectWithToast('/app', {
      description: 'No course module session found.',
      type: 'error',
    });
  }

  const nextCmId =
    currentCms.studentCourseModule.studentCourse?.studentCourseModules.find(
      (cm) => cm.position === currentCms.studentCourseModule.position + 1
    )?.id;

  const [isDocumentSubmissionEnabled, assignmentsEnabled] = await Promise.all([
    isDocumentSubmissionEnabledForSchool(doc.class?.schoolId),
    isAssignmentsEnabledForOrganization(doc.class?.school?.organizationId),
  ]);

  const unsortedSubmissionComments =
    latestSubmission != null
      ? await prisma.submissionComment.findMany({
          where: { submissionId: latestSubmission.id },
          include: {
            profile: {
              include: { user: { select: { name: true, email: true } } },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

  const submissionComments = sortByDocumentLocation({
    items: unsortedSubmissionComments,
    sourceText: latestSubmission?.text ?? '',
    getExcerpt: (comment) => comment.excerpt,
    getOccurrence: (comment) => comment.occurrence,
  });

  const sortedComments = sortDocumentCommentsByMarkupOrder(
    doc.comments,
    doc.html
  );

  return dataResponse({
    doc: {
      ...doc,
      comments: sortedComments,
    },
    latestSubmission,
    currentCms,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: doc.studentCourseModuleSessions[cmsIdx + 1] !== undefined,
    isDocumentSubmissionEnabled,
    assignmentsEnabled,
    submissionComments,
  });
}

export function shouldRevalidate(_args: ShouldRevalidateFunctionArgs) {
  // Never revalidate the document page loader. The editor owns
  // document state client-side. Server state flows through explicit
  // fetch() calls + local React state, not loader revalidation.
  return false;
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [showOldComments, setShowOldComments] = useState(false);
  const [localSubmittedAt, setLocalSubmittedAt] = useState<string | null>(null);
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tab = searchParams.get('tab') ?? 'tutor';
  const leftPanel = searchParams.get('left') ?? 'tutor';
  const isReviseMode = searchParams.get('revise') === '1';
  const latestSubmission = data.latestSubmission;
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;
  const isSubmitted = localSubmittedAt !== null || latestSubmission !== null;
  // The submission IS the grade now — grading fields live on the Submission model
  const grade = latestSubmission;
  const documentStatusLabel = getDocumentStatusLabel({
    submittedAt: localSubmittedAt ?? latestSubmission?.submittedAt ?? null,
    grade: grade ?? null,
  });
  const isGradeReleased =
    grade?.releasedAt !== null && grade?.releasedAt !== undefined;
  const canUseGradingPanel =
    data.isDocumentSubmissionEnabled && isViewingAsTeacher && isSubmitted;
  const isTeacherGradingTabOpen = canUseGradingPanel && leftPanel === 'grading';
  const isDocumentEditable = !isViewingAsTeacher || !isTeacherGradingTabOpen;
  const isTeacherSnapshotView =
    isViewingAsTeacher && Boolean(latestSubmission?.id);
  const editorServerHtml =
    (isTeacherSnapshotView && latestSubmission?.html
      ? latestSubmission.html
      : data.doc.html) ?? '';
  const editorServerText =
    (isTeacherSnapshotView ? latestSubmission?.text : data.doc.text) ?? '';

  // Exit target is computed once on mount (session-storage read is idempotent)
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );

  // Editor bridge handle — stable ref populated by DocumentEditor.onBridgeReady
  const editorBridgeRef = useRef<EditorBridge | null>(null);

  // ── Extracted hooks ────────────────────────────────────────────────
  const auth = useAuthHeartbeat({
    documentId: data.doc.id,
    isEditable: isDocumentEditable,
  });
  const tutor = useTutorState(data.currentCms as any);
  const commentsState = useCommentsState(
    (data.doc.comments as any[]) ?? []
  );
  const submit = useDocumentSubmit({
    documentId: data.doc.id,
    editorBridgeRef,
    onSubmitted: () => {
      setIsFinalizeDialogOpen(false);
      setLocalSubmittedAt(new Date().toISOString());
    },
  });

  const isEditorEditable =
    isDocumentEditable && !auth.isLocked && auth.isInitialCheckComplete;

  // ── Teacher-grading UI state (Phase 3 will extract these) ──────────
  const gradeDisplay =
    (grade
      ? formatGrade(
          grade.numericPercentage ?? null,
          grade.letterGrade ?? null
        ) ||
        grade.score ||
        (grade.overallScore ? `${grade.overallScore}/5` : null)
      : null) ?? null;
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<
    string | null
  >(null);
  const [draftHighlight, setDraftHighlight] = useState<{
    excerpt: string;
    occurrence: number;
  } | null>(null);
  const [tooltipIssueId, setTooltipIssueId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const closeTooltipTimer = useRef<number | null>(null);
  const persistedGrammarIssues = useMemo(
    () =>
      parseGrammarIssuesPayload(grade?.grammarIssues, {
        sourceText: latestSubmission?.text ?? '',
      }),
    [latestSubmission?.text, grade?.id, grade?.grammarIssues]
  );
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>(
    persistedGrammarIssues
  );
  const [hiddenGrammarIssueIds, setHiddenGrammarIssueIds] = useState<string[]>(
    []
  );

  // Derived-state pattern: resync grammar issues in render when the
  // persisted-from-loader value changes (no useEffect needed).
  const lastPersistedRef = useRef(persistedGrammarIssues);
  if (lastPersistedRef.current !== persistedGrammarIssues) {
    lastPersistedRef.current = persistedGrammarIssues;
    setGrammarIssues(persistedGrammarIssues);
    setHiddenGrammarIssueIds([]);
  }

  // Derived value (no state needed for tooltip position)
  const tooltipPos = useMemo(() => {
    if (!tooltipRect) return null;
    return {
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    };
  }, [tooltipRect]);

  const visibleGrammarIssues = useMemo(
    () =>
      grammarIssues.filter(
        (issue) => !hiddenGrammarIssueIds.includes(issue.id)
      ),
    [grammarIssues, hiddenGrammarIssueIds]
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
  const handleRemoveGrammarIssue = useCallback((id: string) => {
    setGrammarIssues((prev) => prev.filter((issue) => issue.id !== id));
    setHiddenGrammarIssueIds((prev) =>
      prev.filter((currentId) => currentId !== id)
    );
  }, []);
  const activeGrammarIssue = useMemo(() => {
    if (!tooltipIssueId) return null;
    return grammarIssues.find((issue) => issue.id === tooltipIssueId) ?? null;
  }, [grammarIssues, tooltipIssueId]);

  // Outside-click handler for active grade comment (teacher grading view).
  // This effect will move into grade-highlights-overlay in Phase 3.
  useEffect(() => {
    if (!isTeacherGradingTabOpen || !activeGradeCommentId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const clickedInHighlight = target.closest('[data-grade-comment-id]');
      const clickedInCommentCard = target.closest('[data-grade-comment-card]');
      if (clickedInHighlight || clickedInCommentCard) return;
      setActiveGradeCommentId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeGradeCommentId, isTeacherGradingTabOpen]);

  // ── Derived UI data ────────────────────────────────────────────────
  const allComments = commentsState.comments as any[];
  const activeComments = allComments.filter((c) => !c.archivedAt);
  const archivedComments = allComments.filter((c) => !!c.archivedAt);
  const visibleComments = isSubmitted
    ? showOldComments
      ? allComments
      : activeComments
    : activeComments;
  const teacherHeaderTitle = data.doc.title?.trim() || 'Untitled document';
  const studentName = data.doc.profile.user.name?.trim() || 'Unknown student';
  const studentCanViewReleasedGrade =
    !isViewingAsTeacher && isGradeReleased && Boolean(grade?.id);
  const studentGradeViewPath =
    studentCanViewReleasedGrade && grade?.id ? `/app/submissions/${grade.id}` : null;
  const studentRevisePath = `/app/documents/${data.doc.id}?revise=1${
    explicitExitTarget
      ? `&exitTo=${encodeURIComponent(explicitExitTarget)}`
      : ''
  }`;
  // Submit button is always enabled — the editor has content by the
  // time the user can click it. (Old polling logic deleted with Task 17.)
  const hasEditorContent = true;
  const isSubmitting = submit.isSubmitting;

  const changeTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params, { replace: true });
  };

  const changeLeftPanel = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('left', value);
    setSearchParams(params, { replace: true });
  };

  const handleTutorBeforeRespond = useCallback(async () => {
    if (auth.isLocked) return false;
    await editorBridgeRef.current?.saveNow({ source: 'tutor-pre-respond' });
    const isValidSession = await auth.checkAuthSession();
    return isValidSession && !auth.isLocked;
  }, [auth]);

  const handleLoginRedirect = useCallback(() => {
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth/login?redirectTo=${redirectTo}`;
  }, []);

  return (
    <>
      <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
        <nav className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 border-b px-3 py-2">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(exitTarget)}
            >
              <ArrowLeft className="h-4" />
              Exit
            </Button>
            {isViewingAsTeacher ? (
              <p className="text-xs font-semibold text-foreground md:text-md">
                {teacherHeaderTitle}
                <span className="px-2 text-muted-foreground">&bull;</span>
                <span className="font-medium text-muted-foreground">
                  {studentName}
                </span>
                <span className="px-2 text-muted-foreground">&bull;</span>
                <span className="font-medium text-muted-foreground">
                  {documentStatusLabel}
                </span>
              </p>
            ) : (
              <Input
                size="sm"
                className="rounded-lg border border-transparent font-bold transition hover:border-border"
                defaultValue={data.doc.title}
                placeholder="Untitled document"
                onBlur={(e) =>
                  e.target.value !== data.doc.title
                    ? fetcher.submit(
                        {
                          title: e.target.value,
                        },
                        {
                          method: 'POST',
                          action: `/api/model/document/${data.doc.id}?from=title-input`,
                        }
                      )
                    : undefined
                }
              />
            )}
          </div>
          {!isViewingAsTeacher && (
            <div className="flex items-center gap-2">
              <DocumentStatusBadge
                submittedAt={localSubmittedAt ?? latestSubmission?.submittedAt ?? null}
                grade={isGradeReleased ? (grade ?? null) : null}
              />
              {isSubmitted ? (
                <span className="text-xs text-muted-foreground">
                  {isGradeReleased && grade?.releasedAt
                    ? new Date(grade.releasedAt).toLocaleDateString()
                    : new Date((localSubmittedAt ?? latestSubmission?.submittedAt)!).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          )}
          <div className="ml-auto flex items-center gap-4">
            {studentGradeViewPath ? (
              <div className="hidden md:flex items-center gap-1 rounded-full border bg-muted/40 p-1">
                <Button
                  size="sm"
                  variant={isReviseMode ? 'ghost' : 'secondary'}
                  asChild
                >
                  <Link to={studentGradeViewPath}>View Grade</Link>
                </Button>
                <Button
                  size="sm"
                  variant={isReviseMode ? 'secondary' : 'ghost'}
                  asChild
                >
                  <Link to={studentRevisePath}>Revise Essay</Link>
                </Button>
              </div>
            ) : null}
            {data.isDocumentSubmissionEnabled && !isSubmitted && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting || !hasEditorContent}
                  data-testid="document-submit-button"
                  onClick={() => setIsFinalizeDialogOpen(true)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
                {!isTeacherGradingTabOpen ? (
                  <div className="h-[20px] border-r" />
                ) : null}
              </>
            )}
            {isSubmitted && archivedComments.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowOldComments((v) => !v)}
                >
                  {showOldComments ? 'Hide old comments' : 'Show old comments'}
                </Button>
                <div className="h-[20px] border-r" />
              </>
            )}
            {isViewingAsTeacher && isSubmitted && (
              <>
                {grade ? (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/app/submissions/${grade.id}`}>
                        Open Graded View
                      </Link>
                    </Button>
                    <div className="h-[20px] border-r" />
                  </>
                ) : null}
              </>
            )}
            {!isTeacherGradingTabOpen ? (
              <div className="flex items-center gap-2">
                <SaveStatusIndicator status={syncStatus} />
                <div className="h-[20px] border-r" />
                <DocumentHistory documentId={data.doc.id} />
              </div>
            ) : null}
            {isViewingAsTeacher && isSubmitted && (
              <>
                {isTeacherGradingTabOpen ? null : (
                  <div className="h-[20px] border-r" />
                )}
                <div className="hidden md:flex items-center gap-1 rounded-full border bg-muted/40 p-1">
                  <Button
                    size="sm"
                    variant={leftPanel === 'tutor' ? 'secondary' : 'ghost'}
                    data-testid="document-leftpanel-tutor"
                    onClick={() => changeLeftPanel('tutor')}
                  >
                    Tutor
                  </Button>
                  {canUseGradingPanel ? (
                    <Button
                      size="sm"
                      variant={leftPanel === 'grading' ? 'secondary' : 'ghost'}
                      data-testid="document-leftpanel-grading"
                      onClick={() => changeLeftPanel('grading')}
                    >
                      Grading
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </nav>
        {data.assignmentsEnabled && data.doc.assignment ? (
          <div className="mx-auto w-full max-w-screen-2xl border-b bg-amber-50 px-3 py-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info-outlined" size="sm">
                  Assignment Prompt
                </Badge>
                <span className="text-sm font-medium">
                  {data.doc.assignment.title?.trim() || 'Untitled Assignment'}
                </span>
                {data.doc.assignment.dueDate ? (
                  <span className="text-xs text-muted-foreground">
                    Due {formatDateOnly(data.doc.assignment.dueDate)}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">
                {data.doc.assignment.prompt}
              </p>
            </div>
          </div>
        ) : null}
        {grade &&
          !isTeacherGradingTabOpen &&
          ((!isViewingAsTeacher && isGradeReleased) || isViewingAsTeacher) && (
            <div className="mx-auto w-full max-w-screen-2xl border-b bg-green-50 dark:bg-green-950/20 px-3 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={isGradeReleased ? 'success' : 'secondary'}>
                    {isGradeReleased
                      ? 'Grade Released'
                      : 'Graded (Not Released)'}
                  </Badge>
                  <span className="text-sm font-medium">
                    {gradeDisplay || 'Graded'}
                  </span>
                </div>
                {(grade.feedback || grade.overallComment) && (
                  <div className="flex-1 sm:mx-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {grade.overallComment || grade.feedback}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="bg-white dark:bg-background"
                  >
                    <Link to={`/app/submissions/${grade.id}`}>Open Graded View</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        <Tabs onValueChange={changeTab} value={tab} className="md:hidden">
          <TabsList className="w-full rounded-none border-b px-3">
            <TabsTrigger value="tutor" className="w-full">
              Tutor
            </TabsTrigger>
            <TabsTrigger value="editor" className="w-full">
              Editor
            </TabsTrigger>
            <TabsTrigger value="comments" className="w-full">
              Comments
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <CommentsSelectionProvider>
          <div
            className={cn(
              'mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden',
              isTeacherGradingTabOpen && 'draft-comments-hidden'
            )}
          >
            {isMobile && tab !== 'tutor' ? null : canUseGradingPanel &&
              leftPanel === 'grading' ? (
              <TeacherGradingPanel
                documentId={data.doc.id}
                submissionId={latestSubmission?.id ?? null}
                existingGrade={grade ?? null}
                grammarIssues={grammarIssues}
                persistedGrammarIssues={persistedGrammarIssues}
                hiddenGrammarIssueIds={hiddenGrammarIssueIds}
                onToggleGrammarIssue={toggleGrammarIssueVisibility}
                onRemoveGrammarIssue={handleRemoveGrammarIssue}
                onGrammarIssuesChange={handleGrammarIssuesChange}
              />
            ) : (
              <Tutor
                docId={data.doc.id}
                cms={(tutor.cms ?? data.currentCms) as any}
                nextCmId={data.nextCmId}
                hasPreviousCms={data.hasPreviousCms}
                isSessionLocked={auth.isLocked}
                beforeRespond={handleTutorBeforeRespond}
                onCmsUpdate={tutor.updateCms}
                getCurrentDocumentText={() =>
                  editorBridgeRef.current?.getContent().text ??
                  data.doc.text ??
                  ''
                }
              />
            )}
            {isMobile && tab !== 'editor' ? null : (
              <DocumentEditor
                docId={data.doc.id}
                serverHtml={editorServerHtml}
                serverText={editorServerText}
                serverUpdatedAt={data.doc.updatedAt}
                initialRevision={data.doc.revision}
                isEditable={isEditorEditable}
                onBridgeReady={(b) => {
                  editorBridgeRef.current = b;
                }}
                onSyncStatusChange={setSyncStatus}
                onCommentCreated={(c) =>
                  commentsState.addComment(c as any)
                }
              />
            )}
            {isMobile && tab !== 'comments' ? null : isTeacherGradingTabOpen ? (
              <GradingCommentsSidebar
                submissionComments={data.submissionComments}
                submissionId={latestSubmission?.id ?? null}
                sourceText={latestSubmission?.text ?? ''}
                activeGradeCommentId={activeGradeCommentId}
                onSelectGradeComment={setActiveGradeCommentId}
                onDraftHighlightChange={setDraftHighlight}
              />
            ) : (
              <Comments
                comments={visibleComments as any}
                readOnly={!isDocumentEditable}
              />
            )}
          </div>
        </CommentsSelectionProvider>
      </main>
      {data.isDocumentSubmissionEnabled && !isSubmitted && (
        <Dialog
          open={isFinalizeDialogOpen}
          onOpenChange={setIsFinalizeDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                Submit Essay
              </DialogTitle>
              <DialogDescription className="space-y-3 pt-2">
                <p>Before you submit, please note the following:</p>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    Submitting creates a snapshot of your essay for your teacher
                    to grade.
                  </li>
                  <li>
                    You can keep editing after you submit, but changes won’t be
                    reflected in what your teacher sees.
                  </li>
                  <li>You can only submit once right now.</li>
                </ul>
                <p className="pt-2 font-medium">
                  Are you sure you want to submit this essay?
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFinalizeDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                data-testid="document-finalize-submit"
                onClick={() => {
                  void submit.submitNow();
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finalizing...
                  </>
                ) : (
                  'Finalize Document'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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
      {isTeacherGradingTabOpen && activeGrammarIssue && tooltipPos ? (
        <div
          className="fixed z-50 max-w-sm rounded-lg border bg-white p-3 text-sm shadow"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateY(0)',
          }}
          onMouseEnter={() => {
            if (closeTooltipTimer.current) {
              window.clearTimeout(closeTooltipTimer.current);
            }
          }}
          onMouseLeave={() => {
            setTooltipIssueId(null);
            setTooltipRect(null);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {activeGrammarIssue.kind === 'style' ? 'Style' : 'Grammar'}
                {activeGrammarIssue.ruleNumber
                  ? ` • Rule ${activeGrammarIssue.ruleNumber}`
                  : ''}
              </div>
              {activeGrammarIssue.rule ? (
                <div className="text-sm font-medium">
                  {activeGrammarIssue.rule}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => {
                setTooltipIssueId(null);
                setTooltipRect(null);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {activeGrammarIssue.message}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
