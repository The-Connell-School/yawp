import { invariant } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
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
import { ArrowLeft, Check, Loader2, AlertCircle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import {
  setPendingSave,
  getPendingSave,
  clearPendingSave,
} from '~/utils/pending-document-save';
import { Comments } from './comments';
import { CommentsSelectionProvider } from './comments/selection-context';
import { Editor, type EditorBridge } from './editor/index';
import { Tutor } from './tutor';
import { DocumentVersions } from './_components/document-versions';
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
import { TeacherGradingPanel } from './_components/teacher-grading-panel';
import { GradingCommentsSidebar } from './_components/grading-comments-sidebar';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { formatDateOnly } from '~/utils/date-only';
import type { SyncStatus } from '~/utils/sync-service';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import { DocumentHistory } from './_components/document-history';

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
  const requestedSnapshotId = url.searchParams.get('snapshotId');
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
      revision: true,
      title: true,
      html: true,
      text: true,
      submittedAt: true,
      submittedSnapshotId: true,
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
      submittedSnapshot: {
        select: {
          id: true,
          html: true,
          text: true,
          grades: {
            select: {
              id: true,
              score: true,
              feedback: true,
              overallScore: true,
              overallComment: true,
              numericPercentage: true,
              letterGrade: true,
              grammarIssues: true,
              rubricScores: true,
              releasedAt: true,
              createdAt: true,
            },
            take: 1,
          },
        },
      },
      versions: { orderBy: { createdAt: 'desc' } },
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

  const selectedSnapshot =
    requestedSnapshotId && isViewingAsTeacher
      ? await prisma.documentSnapshot.findFirst({
          where: {
            id: requestedSnapshotId,
            documentId: doc.id,
          },
          select: {
            id: true,
            html: true,
            text: true,
            grades: {
              select: {
                id: true,
                score: true,
                feedback: true,
                overallScore: true,
                overallComment: true,
                numericPercentage: true,
                letterGrade: true,
                grammarIssues: true,
                rubricScores: true,
                releasedAt: true,
                createdAt: true,
              },
              take: 1,
            },
          },
        })
      : null;
  const activeSnapshot = selectedSnapshot ?? doc.submittedSnapshot;

  const latestGrade = doc.submittedSnapshot?.grades?.[0];
  if (
    !isViewingAsTeacher &&
    latestGrade?.id &&
    latestGrade.releasedAt &&
    !isReviseMode
  ) {
    return redirect(`/app/graded/${latestGrade.id}`);
  }

  if (shouldSaveVersion) {
    const latestVersion = doc.versions[0];
    if (doc.html && doc.text && latestVersion?.html !== doc.html) {
      prisma.documentVersion
        .create({
          data: { documentId: doc.id, html: doc.html, text: doc.text },
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

  const gradeId = activeSnapshot?.grades?.[0]?.id;
  const unsortedGradeComments =
    gradeId != null
      ? await prisma.gradeComment.findMany({
          where: { gradeId },
          include: {
            profile: {
              include: { user: { select: { name: true, email: true } } },
            },
            responses: {
              include: {
                profile: {
                  include: { user: { select: { name: true, email: true } } },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

  const gradeComments = sortByDocumentLocation({
    items: unsortedGradeComments,
    sourceText: activeSnapshot?.text ?? '',
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
    activeSnapshot,
    currentCms,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: doc.studentCourseModuleSessions[cmsIdx + 1] !== undefined,
    isDocumentSubmissionEnabled,
    assignmentsEnabled,
    gradeComments,
  });
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const fetcher = useFetcher();
  const submitFetcher = useFetcher();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);
  const [showOldComments, setShowOldComments] = useState(false);
  const [hasEditorContent, setHasEditorContent] = useState(
    !!(data.doc.html && data.doc.text)
  );
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const [exitTarget, setExitTarget] = useState('/app');
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tab = searchParams.get('tab') ?? 'tutor';
  const leftPanel = searchParams.get('left') ?? 'tutor';
  const isReviseMode = searchParams.get('revise') === '1';
  const activeSnapshot = data.activeSnapshot ?? data.doc.submittedSnapshot;
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;
  const isSubmitting = submitFetcher.state !== 'idle';
  const isSubmitted = data.doc.submittedAt !== null;
  const grade = activeSnapshot?.grades?.[0];
  const documentStatusLabel = getDocumentStatusLabel({
    submittedAt: data.doc.submittedAt,
    grade: grade ?? null,
  });
  const isGradeReleased =
    grade?.releasedAt !== null && grade?.releasedAt !== undefined;
  const canUseGradingPanel =
    data.isDocumentSubmissionEnabled && isViewingAsTeacher && isSubmitted;
  const isTeacherGradingTabOpen = canUseGradingPanel && leftPanel === 'grading';
  const isDocumentEditable = !isViewingAsTeacher || !isTeacherGradingTabOpen;
  const isTeacherSnapshotView =
    isViewingAsTeacher && Boolean(activeSnapshot?.id);
  const editorHtml =
    isTeacherSnapshotView && activeSnapshot?.html
      ? activeSnapshot.html
      : data.doc.html;
  const initialEditorContent = useMemo(
    () => ({
      html: editorHtml ?? '',
      text:
        (isTeacherSnapshotView ? activeSnapshot?.text : data.doc.text) ?? '',
    }),
    [activeSnapshot?.text, data.doc.text, editorHtml, isTeacherSnapshotView]
  );
  const editorSessionId = useMemo(() => crypto.randomUUID(), [data.doc.id]);
  const loginReturnStorageKey = useMemo(
    () => `yawp:audit:login-return:${data.doc.id}`,
    [data.doc.id]
  );
  const latestEditorContentRef = useRef(initialEditorContent);
  const editorBridgeRef = useRef<EditorBridge | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [isInitialAuthCheckComplete, setIsInitialAuthCheckComplete] =
    useState(false);
  const isEditorLocked =
    isSessionLocked || (isDocumentEditable && !isInitialAuthCheckComplete);
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
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const closeTooltipTimer = useRef<number | null>(null);
  const persistedGrammarIssues = useMemo(
    () =>
      parseGrammarIssuesPayload(grade?.grammarIssues, {
        sourceText: activeSnapshot?.text ?? '',
      }),
    [activeSnapshot?.text, grade?.id, grade?.grammarIssues]
  );
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>(
    persistedGrammarIssues
  );
  const [hiddenGrammarIssueIds, setHiddenGrammarIssueIds] = useState<string[]>(
    []
  );
  const allComments = (data.doc.comments as any[]) ?? [];
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
    studentCanViewReleasedGrade && grade?.id ? `/app/graded/${grade.id}` : null;
  const studentRevisePath = `/app/documents/${data.doc.id}?revise=1${
    explicitExitTarget
      ? `&exitTo=${encodeURIComponent(explicitExitTarget)}`
      : ''
  }`;
  const saveFailureCountRef = useRef(0);
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
  const editorGradeHighlights = useMemo(() => {
    if (!isTeacherGradingTabOpen) return undefined;

    const commentHighlights = (data.gradeComments as any[]).map((comment) => ({
      id: comment.id,
      excerpt: comment.excerpt,
      occurrence: comment.occurrence,
      dataAttr: 'data-grade-comment-id' as const,
      className: 'grade-comment-mark' as const,
    }));
    const grammarHighlights = visibleGrammarIssues.map((issue) => ({
      id: issue.id,
      excerpt: issue.excerpt,
      occurrence: issue.occurrence ?? 1,
      dataAttr: 'data-grammar-issue-id' as const,
      className: 'grammar-issue' as const,
    }));
    const draftHighlightEntry = draftHighlight
      ? [
          {
            id: 'draft',
            excerpt: draftHighlight.excerpt,
            occurrence: draftHighlight.occurrence,
            dataAttr: 'data-grade-comment-id' as const,
            className:
              activeGradeCommentId === 'draft'
                ? 'grade-comment-mark focused'
                : 'grade-comment-mark',
          },
        ]
      : [];

    return [...commentHighlights, ...draftHighlightEntry, ...grammarHighlights];
  }, [
    activeGradeCommentId,
    data.gradeComments,
    draftHighlight,
    isTeacherGradingTabOpen,
    visibleGrammarIssues,
  ]);

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

  const lockSession = useCallback(() => {
    setIsSessionLocked(true);
  }, []);

  const handleLoginRedirect = useCallback(() => {
    const content =
      editorBridgeRef.current?.getContent() ?? latestEditorContentRef.current;
    setPendingSave(data.doc.id, content);
    sessionStorage.setItem(loginReturnStorageKey, '1');
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth/login?redirectTo=${redirectTo}`;
  }, [
    data.doc.id,
    editorSessionId,
    loginReturnStorageKey,
    user.id,
    user.selectedProfile?.id,
  ]);

  const checkAuthSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/check', {
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          lockSession();
          return false;
        }
        return true;
      }

      const data = (await response.json()) as { valid?: boolean };
      if (!data?.valid) {
        lockSession();
        return false;
      }

      return true;
    } catch {
      // Ignore transient network failures.
      return true;
    }
  }, [lockSession]);

  const handleRemoteSaveFailure = useCallback(
    (args: {
      content: { html: string; text: string };
      reason: 'auth' | 'network' | 'server';
    }) => {
      setPendingSave(data.doc.id, args.content);
      saveFailureCountRef.current += 1;
      if (saveFailureCountRef.current >= 2) {
        setHasSaveError(true);
      }
      if (args.reason === 'auth') {
        lockSession();
      }
    },
    [data.doc.id, lockSession]
  );

  const handleRemoteSaveSuccess = useCallback(
    (_args: { content: { html: string; text: string }; revision: number }) => {
      clearPendingSave(data.doc.id);
      saveFailureCountRef.current = 0;
      setHasSaveError(false);
    },
    [data.doc.id]
  );

  const handleTutorBeforeRespond = useCallback(async () => {
    if (isSessionLocked) return false;

    await editorBridgeRef.current?.saveNow();

    const isValidSession = await checkAuthSession();
    return isValidSession && !isSessionLocked;
  }, [checkAuthSession, isSessionLocked]);

  const handleEditorContentSnapshot = useCallback(
    (content: { html: string; text: string }) => {
      latestEditorContentRef.current = content;
    },
    []
  );

  const recoverPendingSave = useCallback(
    (bridge: EditorBridge, source: string) => {
      const pending = getPendingSave(data.doc.id);
      if (!pending) return false;

      bridge.setContent(pending.html);
      latestEditorContentRef.current = { html: pending.html, text: pending.text };
      toast.info('Recovered unsaved changes');
      void bridge.saveNow({ source: 'editor-recovery' });
      return true;
    },
    [data.doc.id, editorSessionId, user.id, user.selectedProfile?.id]
  );

  const handleEditorBridgeReady = useCallback(
    (bridge: EditorBridge | null) => {
      editorBridgeRef.current = bridge;
      if (!bridge || !isDocumentEditable || !isInitialAuthCheckComplete) return;
      recoverPendingSave(bridge, 'bridge-ready');
    },
    [
      isDocumentEditable,
      isInitialAuthCheckComplete,
      recoverPendingSave,
    ]
  );

  useEffect(() => {
    setGrammarIssues(persistedGrammarIssues);
  }, [persistedGrammarIssues]);

  useEffect(() => {
    latestEditorContentRef.current = initialEditorContent;
  }, [initialEditorContent]);

  useEffect(() => {
    setIsSessionLocked(false);
  }, [data.doc.id]);


  useEffect(() => {
    if (!isInitialAuthCheckComplete || isSessionLocked) return;
    if (!sessionStorage.getItem(loginReturnStorageKey)) return;
    sessionStorage.removeItem(loginReturnStorageKey);
  }, [
    data.doc.id,
    editorSessionId,
    isInitialAuthCheckComplete,
    isSessionLocked,
    loginReturnStorageKey,
    user.id,
    user.selectedProfile?.id,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!isDocumentEditable) {
      setIsInitialAuthCheckComplete(true);
      return;
    }

    setIsInitialAuthCheckComplete(false);

    const runInitialCheck = async () => {
      await checkAuthSession();
      if (!cancelled) {
        setIsInitialAuthCheckComplete(true);
      }
    };

    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void checkAuthSession();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void checkAuthSession();
    };

    void runInitialCheck();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkAuthSession, data.doc.id, isDocumentEditable]);

  // Flush pending save on page unload / visibility hidden
  useEffect(() => {
    if (!isDocumentEditable) return;

    const flushPendingSave = () => {
      const content =
        editorBridgeRef.current?.getContent() ??
        latestEditorContentRef.current;
      setPendingSave(data.doc.id, content);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingSave();
    };

    window.addEventListener('pagehide', flushPendingSave);
    window.addEventListener('beforeunload', flushPendingSave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      window.removeEventListener('beforeunload', flushPendingSave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isDocumentEditable, data.doc.id]);

  // Recover pending save on load
  useEffect(() => {
    if (!isInitialAuthCheckComplete || !isDocumentEditable) return;

    if (!editorBridgeRef.current) return;
    recoverPendingSave(editorBridgeRef.current, 'load');
  }, [
    isInitialAuthCheckComplete,
    isDocumentEditable,
    recoverPendingSave,
  ]);

  // Periodic auth heartbeat
  useEffect(() => {
    if (!isDocumentEditable) return;

    const interval = setInterval(() => {
      void checkAuthSession();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isDocumentEditable, checkAuthSession]);

  useEffect(() => {
    setHiddenGrammarIssueIds((prev) =>
      prev.filter((id) => grammarIssues.some((issue) => issue.id === id))
    );
  }, [grammarIssues]);

  useEffect(() => {
    if (!tooltipIssueId) return;
    if (visibleGrammarIssues.some((issue) => issue.id === tooltipIssueId))
      return;
    setTooltipIssueId(null);
    setTooltipRect(null);
  }, [tooltipIssueId, visibleGrammarIssues]);

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
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeGradeCommentId, isTeacherGradingTabOpen]);

  const activeGrammarIssue = useMemo(() => {
    if (!tooltipIssueId) return null;
    return grammarIssues.find((issue) => issue.id === tooltipIssueId) ?? null;
  }, [grammarIssues, tooltipIssueId]);

  useEffect(() => {
    if (!tooltipRect) {
      setTooltipPos(null);
      return;
    }
    setTooltipPos({
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    });
  }, [tooltipRect]);

  useEffect(() => {
    if (data.shouldSaveVersion) {
      const { pathname, search } = window.location;
      const searchParams = new URLSearchParams(search);
      searchParams.delete('ssv');
      navigate(`${pathname}?${searchParams}`, { replace: true });
    }
  }, [data.shouldSaveVersion, navigate]);

  useEffect(() => {
    if (submitFetcher.state === 'idle' && submitFetcher.data) {
      if (submitFetcher.data.success) {
        toast.success(
          submitFetcher.data.message || 'Essay submitted successfully!'
        );
        setIsFinalizeDialogOpen(false);
        // Reload the page to reflect the new submission status
        navigate(window.location.pathname + window.location.search, {
          replace: true,
        });
      }
    }
  }, [submitFetcher.state, submitFetcher.data, navigate]);

  useEffect(() => {
    if (explicitExitTarget) {
      setExitTarget(explicitExitTarget);
      return;
    }

    setExitTarget(readLastNonDocumentRoute() ?? '/app');
  }, [explicitExitTarget]);

  useEffect(() => {
    const handleEditorReady = (event: Event) => {
      const customEvent = event as CustomEvent;
      const getContent = customEvent.detail?.getContent;
      if (!getContent) return;

      // Check content immediately
      const content = getContent();
      setHasEditorContent(!!(content?.html && content?.text));

      // Set up interval to check content
      const interval = setInterval(() => {
        const currentContent = getContent();
        setHasEditorContent(!!(currentContent?.html && currentContent?.text));
      }, 500);

      return () => clearInterval(interval);
    };

    window.addEventListener('editor-ready', handleEditorReady);
    return () => window.removeEventListener('editor-ready', handleEditorReady);
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
                submittedAt={data.doc.submittedAt}
                grade={isGradeReleased ? (grade ?? null) : null}
              />
              {isSubmitted ? (
                <span className="text-xs text-muted-foreground">
                  {isGradeReleased && grade?.releasedAt
                    ? new Date(grade.releasedAt).toLocaleDateString()
                    : new Date(data.doc.submittedAt!).toLocaleDateString()}
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
                      <Link to={`/app/graded/${grade.id}`}>
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
                {hasSaveError ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <p className="text-xs font-medium">Save failed</p>
                  </div>
                ) : isSaving ? (
                  <div className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <p className="text-xs font-medium">Saving</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full border bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    <p className="mr-1 text-xs font-medium">Saved</p>
                  </div>
                )}
                <div className="h-[20px] border-r" />
                <DocumentVersions documentId={data.doc.id} />
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
                    <Link to={`/app/graded/${grade.id}`}>Open Graded View</Link>
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
                snapshotId={activeSnapshot?.id ?? null}
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
                cms={data.currentCms}
                nextCmId={data.nextCmId}
                hasPreviousCms={data.hasPreviousCms}
                isSessionLocked={isSessionLocked}
                beforeRespond={handleTutorBeforeRespond}
                getCurrentDocumentText={() =>
                  editorBridgeRef.current?.getContent().text ??
                  latestEditorContentRef.current.text ??
                  data.doc.text ??
                  ''
                }
              />
            )}
            {isMobile && tab !== 'editor' ? null : (
              <Editor
                docId={data.doc.id}
                docHtml={editorHtml}
                initialRevision={data.doc.revision}
                editorSessionId={editorSessionId}
                saveSnapshotId={
                  isTeacherSnapshotView ? activeSnapshot?.id : null
                }
                setIsSaving={setIsSaving}
                isEditable={isDocumentEditable && !isEditorLocked}
                onContentSnapshot={handleEditorContentSnapshot}
                onEditorBridgeReady={handleEditorBridgeReady}
                onRemoteSaveSuccess={handleRemoteSaveSuccess}
                onRemoteSaveFailure={handleRemoteSaveFailure}
                onSyncStatusChange={setSyncStatus}
                gradeHighlights={editorGradeHighlights}
                activeGradeCommentId={
                  isTeacherGradingTabOpen ? activeGradeCommentId : null
                }
                onGradeCommentSelect={
                  isTeacherGradingTabOpen
                    ? (id) => setActiveGradeCommentId(id)
                    : undefined
                }
                onGrammarIssueHover={
                  isTeacherGradingTabOpen
                    ? (id, rect) => {
                        if (id && rect) {
                          if (closeTooltipTimer.current) {
                            window.clearTimeout(closeTooltipTimer.current);
                          }
                          setTooltipIssueId(id);
                          setTooltipRect(rect);
                          return;
                        }

                        closeTooltipTimer.current = window.setTimeout(() => {
                          setTooltipIssueId(null);
                          setTooltipRect(null);
                        }, 120);
                      }
                    : undefined
                }
              />
            )}
            {isMobile && tab !== 'comments' ? null : isTeacherGradingTabOpen ? (
              <GradingCommentsSidebar
                gradeComments={data.gradeComments}
                gradeId={grade?.id ?? null}
                snapshotId={activeSnapshot?.id ?? null}
                sourceText={activeSnapshot?.text ?? ''}
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
                  submitFetcher.submit(
                    { documentId: data.doc.id },
                    {
                      method: 'POST',
                      action: '/api/domain/submit-document',
                    }
                  );
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
      <Dialog open={isSessionLocked} onOpenChange={() => {}}>
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
