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
  useRevalidator,
  useSearchParams,
  Link,
} from 'react-router';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  ExternalLink,
  Archive,
  ArchiveRestore,
  Clock,
  EllipsisVertical,
  Printer,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip } from '~/components/ui/tooltip';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useUser } from '~/hooks/useUser';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { Comments } from './comments';
import { CommentsSelectionProvider } from './comments/selection-context';
import { DocumentEditor } from './document-editor/document-editor';
import type { EditorBridge } from './document-editor/use-editor-sync';
import { Tutor } from './tutor/tutor';
import { DocumentHistory } from './document-history/document-history';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { resolveCurrentAssignmentModuleSession } from '~/utils/assignment-module-session-resume';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import type { SyncStatus } from '~/utils/sync-service';

import { useAuthHeartbeat } from './hooks/use-auth-heartbeat';
import { useCommentsState } from './hooks/use-comments-state';
import { useTutorState } from './hooks/use-tutor-state';
import { useDocumentSubmit } from './hooks/use-document-submit';
import {
  displaySubmissionTitle,
  partitionSubmissionsByArchive,
  versionLabelForActiveSubmission,
} from '~/utils/submission-versions';
import {
  isApHistorySnapshot,
  type ApHistorySnapshot,
} from '~/domain/ap-history/schema';
import { ApHistoryAssignmentPanel } from './ap-history-assignment-panel';
import { DbqLayout } from './_components/dbq-layout';
import { pickLatestReleasedSubmission } from '~/utils/document-link-target';

const SUBMIT_EMPTY_TOOLTIP =
  "You can't submit an empty document. Add text first.";

function escapePrintHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
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
  const profile = await requireMembership(request, userId);
  const url = new URL(request.url);
  const shouldSaveVersion = url.searchParams.get('ssv') === '1';
  const cmsIdxParam = url.searchParams.get('cmsIdx');
  const explicitCmsIdx =
    cmsIdxParam == null ? null : parseInt(cmsIdxParam, 10) || 0;

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
              { membershipId: profile.id },
              {
                membership: {
                  classesAsStudent: {
                    some: {
                      teachers: {
                        some: {
                          id: profile.id,
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
      assignmentType: {
        select: {
          id: true,
          title: true,
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          apHistorySnapshot: true,
        },
      },
      classAssignment: {
        select: {
          class: {
            select: {
              id: true,
              schoolId: true,
              teachers: { select: { id: true } },
              school: { select: { organizationId: true } },
            },
          },
        },
      },
      membership: {
        select: {
          id: true,
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
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          title: true,
          submittedAt: true,
          gradedAt: true,
          releasedAt: true,
          archivedAt: true,
        },
      },
      revisions: { orderBy: { createdAt: 'desc' } },
      assignmentModuleSessions: {
        orderBy: [
          { assignmentModule: { position: 'asc' } },
          { createdAt: 'desc' },
        ],
        include: {
          assignmentModule: {
            include: {
              instructions: {
                orderBy: { position: 'asc' },
                include: {
                  buttons: {
                    orderBy: { position: 'asc' },
                  },
                },
              },
              assignmentType: {
                select: {
                  assignmentModules: {
                    select: { id: true, position: true },
                    orderBy: { position: 'asc' },
                  },
                },
              },
            },
          },
          messages: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      },
      comments: {
        include: {
          membership: { include: { user: { select: { name: true } } } },
          responses: {
            include: {
              membership: { include: { user: { select: { name: true } } } },
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

  const submissions = doc.submissions;
  const isOwner = doc.membership.id === profile.id;
  const wantsDraftEditor =
    url.searchParams.get('revise') === '1' ||
    url.searchParams.get('spa') === '1';

  if (
    isOwner &&
    profile.role === 'STUDENT' &&
    !wantsDraftEditor &&
    !user?.isAdmin
  ) {
    const latestReleasedSubmission = pickLatestReleasedSubmission(submissions);
    if (latestReleasedSubmission) {
      const exitTo = url.searchParams.get('exitTo');
      const redirectParams = new URLSearchParams();
      if (exitTo) {
        redirectParams.set('exitTo', exitTo);
      }
      const suffix = redirectParams.toString()
        ? `?${redirectParams.toString()}`
        : '';
      throw redirect(
        `/app/submissions/${latestReleasedSubmission.id}${suffix}`
      );
    }
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

  const moduleSessionsByModuleId = new Map<
    string,
    (typeof doc.assignmentModuleSessions)[number]
  >();
  for (const session of doc.assignmentModuleSessions) {
    if (!moduleSessionsByModuleId.has(session.assignmentModuleId)) {
      moduleSessionsByModuleId.set(session.assignmentModuleId, session);
    }
  }
  const orderedModuleSessions = Array.from(moduleSessionsByModuleId.values());

  const { currentCms, currentCmsIdx } = resolveCurrentAssignmentModuleSession(
    orderedModuleSessions,
    explicitCmsIdx
  );

  if (!currentCms) {
    return redirectWithToast('/app', {
      description: 'No assignment module session found.',
      type: 'error',
    });
  }

  const assignmentModules =
    currentCms.assignmentModule.assignmentType?.assignmentModules ?? [];
  const currentModuleIndex = assignmentModules.findIndex(
    (cm) => cm.id === currentCms.assignmentModuleId
  );
  const nextCmId =
    currentModuleIndex >= 0
      ? assignmentModules[currentModuleIndex + 1]?.id
      : assignmentModules.find(
          (cm) => cm.position === currentCms.assignmentModule.position + 1
        )?.id;


  const sortedComments = sortDocumentCommentsByMarkupOrder(
    doc.comments,
    doc.html
  );

  return dataResponse({
    doc: {
      ...doc,
      assignmentModuleSessions: orderedModuleSessions,
      comments: sortedComments,
    },
    submissions,
    currentCms,
    currentCmsIdx,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: currentCmsIdx > 0,
  });
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs) {
  // Revalidate when the module session index changes (navigating between modules).
  const currentCmsIdx = args.currentUrl.searchParams.get('cmsIdx');
  const nextCmsIdx = args.nextUrl.searchParams.get('cmsIdx');
  if (currentCmsIdx !== nextCmsIdx) return true;

  // Otherwise, never revalidate. The editor owns document state client-side.
  // Server state flows through explicit fetch() calls + local React state.
  return false;
}

type SubmissionRow = {
  id: string;
  title: string;
  submittedAt: string | Date;
  gradedAt: string | null;
  releasedAt: string | null;
  archivedAt: string | Date | null;
};

type AssignmentWithApHistorySnapshot = {
  apHistorySnapshot?: unknown;
} | null;

export function getRenderableApHistorySnapshot(
  assignment: AssignmentWithApHistorySnapshot
): ApHistorySnapshot | null {
  const raw = assignment?.apHistorySnapshot;
  return isApHistorySnapshot(raw) ? raw : null;
}

export function shouldShowGenericAssignmentPrompt(
  assignment: unknown,
  apHistorySnapshot: ApHistorySnapshot | null
) {
  return Boolean(assignment && !apHistorySnapshot);
}

export function getGenericAssignmentPromptForEditor<T>(
  assignment: T,
  apHistorySnapshot: ApHistorySnapshot | null
): T | null {
  return shouldShowGenericAssignmentPrompt(assignment, apHistorySnapshot)
    ? assignment
    : null;
}

export function shouldRenderDbqWorkspace(
  apHistorySnapshot: ApHistorySnapshot | null
): apHistorySnapshot is ApHistorySnapshot & { essayType: 'dbq' } {
  return (
    apHistorySnapshot?.essayType === 'dbq' &&
    apHistorySnapshot.sources.length > 0
  );
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const fetcher = useFetcher();
  const submissionArchiveFetcher = useFetcher();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [submissionTitle, setSubmissionTitle] = useState('');
  const [showOldComments, setShowOldComments] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localSubmissions, setLocalSubmissions] = useState<SubmissionRow[]>([]);
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackCmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const cmsIdx =
    typeof data.currentCmsIdx === 'number' && data.currentCmsIdx >= 0
      ? data.currentCmsIdx
      : fallbackCmsIdx;
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tab = searchParams.get('tab') ?? 'tutor';
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.membership.userId;
  // Owner or class teacher (loader); api.model.document allows both to persist edits.
  const isDocumentEditable = true;
  const assignment = data.doc.assignment;
  const apHistorySnapshot = getRenderableApHistorySnapshot(assignment);
  const showDbqWorkspace = shouldRenderDbqWorkspace(apHistorySnapshot);
  const editorAssignmentPrompt = getGenericAssignmentPromptForEditor(
    assignment,
    apHistorySnapshot
  );

  // Merge server + optimistic submissions
  const submissions = useMemo(() => {
    const serverSubs = (data.submissions ?? []) as SubmissionRow[];
    const serverIds = new Set(serverSubs.map((s) => s.id));
    const newLocal = localSubmissions.filter((s) => !serverIds.has(s.id));
    return [...newLocal, ...serverSubs];
  }, [data.submissions, localSubmissions]);

  const { active: activeSubmissions, archived: archivedSubmissions } = useMemo(
    () => partitionSubmissionsByArchive(submissions),
    [submissions]
  );

  const studentList = isViewingAsTeacher ? submissions : activeSubmissions;
  const submissionCountForBadge = isViewingAsTeacher
    ? submissions.length
    : activeSubmissions.length;

  const isSubmitted = activeSubmissions.length > 0;
  const hasAnySubmissionRecord = submissions.length > 0;
  const gradedCount = activeSubmissions.filter((s) => s.releasedAt).length;
  const versionNumber = activeSubmissions.length + 1;
  const editorServerHtml = data.doc.html ?? '';
  const editorServerText = data.doc.text ?? '';

  // Exit target is computed once on mount (session-storage read is idempotent)
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );

  // Editor bridge handle — stable ref populated by DocumentEditor.onBridgeReady
  const editorBridgeRef = useRef<EditorBridge | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const getLiveDocumentTitle = useCallback(() => {
    if (titleInputRef.current) {
      return titleInputRef.current.value;
    }
    return data.doc.title ?? '';
  }, [data.doc.title]);

  // ── Extracted hooks ────────────────────────────────────────────────
  const auth = useAuthHeartbeat({
    documentId: data.doc.id,
    isEditable: isDocumentEditable,
  });
  const tutor = useTutorState(data.currentCms as any, cmsIdx);
  const commentsState = useCommentsState((data.doc.comments as any[]) ?? []);
  const submit = useDocumentSubmit({
    documentId: data.doc.id,
    editorBridgeRef,
    onSubmitted: (newSubmission) => {
      setIsFinalizeDialogOpen(false);
      setSubmissionTitle('');
      setLocalSubmissions((prev) => [
        {
          ...newSubmission,
          gradedAt: null,
          releasedAt: null,
          archivedAt: null,
        },
        ...prev,
      ]);
    },
  });

  const [editorSubmittable, setEditorSubmittable] = useState(() =>
    isDocumentSubmittableContent(editorServerHtml, editorServerText)
  );
  const handleSubmittableContentChange = useCallback((submittable: boolean) => {
    setEditorSubmittable(submittable);
  }, []);

  const isEditorEditable =
    isDocumentEditable && !auth.isLocked && auth.isInitialCheckComplete;

  // ── Derived UI data ────────────────────────────────────────────────
  // Re-sort by document-mark order whenever the comments list changes,
  // so optimistically-added comments slot into the correct position
  // (loader's pre-sort is stale once the user adds a new comment).
  const allComments = useMemo(() => {
    const stateComments = commentsState.comments as any[];
    const liveHtml = editorBridgeRef.current?.getContent().html;
    if (!liveHtml) return stateComments;
    return sortDocumentCommentsByMarkupOrder(stateComments, liveHtml);
  }, [commentsState.comments]);
  const activeComments = allComments.filter((c) => !c.archivedAt);
  const archivedComments = allComments.filter((c) => !!c.archivedAt);
  const visibleComments = hasAnySubmissionRecord
    ? showOldComments
      ? allComments
      : activeComments
    : activeComments;
  const studentName = data.doc.membership.user.name?.trim() || 'Unknown student';
  const cannotSubmitEmpty = !editorSubmittable;
  const isSubmitting = submit.isSubmitting;
  const submitActionDisabled = isSubmitting || cannotSubmitEmpty;

  const tutorHasPreviousCms = useMemo(() => {
    const liveCmsId = tutor.cms?.id ?? data.currentCms.id;
    return data.hasPreviousCms || liveCmsId !== data.currentCms.id;
  }, [data.hasPreviousCms, data.currentCms.id, tutor.cms?.id]);

  const changeTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
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

  const handlePrint = useCallback(() => {
    const liveContent = editorBridgeRef.current?.getContent();
    const rawHtml = liveContent?.html ?? data.doc.html ?? '';
    const title = getLiveDocumentTitle();

    const parser = new DOMParser();
    const parsed = parser.parseFromString(rawHtml, 'text/html');
    parsed.querySelectorAll('[data-comment-id]').forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    const cleanHtml = parsed.body.innerHTML;
    const printDate = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const safeTitle = escapePrintHtml(title || 'Untitled Document');
    const safeStudentName = escapePrintHtml(studentName);
    const safePrintDate = escapePrintHtml(printDate);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.6; color: #000; padding: 1in; }
    header { border-bottom: 1px solid #ccc; padding-bottom: 0.5em; margin-bottom: 1.5em; }
    header h1 { font-size: 18pt; font-weight: bold; margin-bottom: 0.25em; }
    header p { font-size: 10pt; color: #555; }
    h1, h2, h3, h4 { margin: 1em 0 0.5em; }
    p { margin: 0.5em 0; }
    ul, ol { margin: 0.5em 0 0.5em 1.5em; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header>
    <h1>${safeTitle}</h1>
    <p>${safeStudentName} &middot; ${safePrintDate}</p>
  </header>
  <main>${cleanHtml}</main>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
    printWindow.document.close();
  }, [data.doc.html, getLiveDocumentTitle, studentName]);

  useEffect(() => {
    if (submissionArchiveFetcher.state !== 'idle') return;
    const body = submissionArchiveFetcher.data as
      | { success?: boolean }
      | undefined;
    if (body?.success) {
      revalidator.revalidate();
    }
  }, [
    submissionArchiveFetcher.state,
    submissionArchiveFetcher.data,
    revalidator,
  ]);

  return (
    <>
      <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
        {apHistorySnapshot && !showDbqWorkspace ? (
          <ApHistoryAssignmentPanel snapshot={apHistorySnapshot} />
        ) : null}
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
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-4">
              <Input
                ref={titleInputRef}
                data-testid="document-title-input"
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
            </div>
          </div>
          {hasAnySubmissionRecord && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Submissions ({submissionCountForBadge})
                  {gradedCount > 0 && (
                    <Badge
                      variant="success"
                      className="ml-1 text-[10px] px-1.5 py-0"
                    >
                      {gradedCount} graded
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <p className="text-sm font-semibold">Submissions</p>
                  {!isViewingAsTeacher && archivedSubmissions.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="View archived submissions"
                      onClick={() => setArchiveDialogOpen(true)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {studentList.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No active submissions.
                    </p>
                  ) : (
                    studentList.map((s) => {
                      const isArchived = s.archivedAt != null;
                      const v = !isArchived
                        ? versionLabelForActiveSubmission(
                            activeSubmissions,
                            s.id
                          )
                        : null;
                      const label = displaySubmissionTitle(
                        s.title,
                        v,
                        'Untitled submission'
                      );
                      const isGraded = s.releasedAt != null;
                      return (
                        <div
                          key={s.id}
                          className="flex items-stretch gap-1 border-b last:border-0"
                        >
                          <Link
                            to={`/app/submissions/${s.id}`}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{label}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(s.submittedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {isArchived ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  Archived
                                </Badge>
                              ) : null}
                              <Badge
                                variant={isGraded ? 'success' : 'secondary'}
                                className="text-[10px]"
                              >
                                {isGraded ? 'Graded' : 'Submitted'}
                              </Badge>
                            </div>
                          </Link>
                          {!isViewingAsTeacher && !isArchived ? (
                            <div className="flex items-center pr-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground"
                                aria-label="Archive submission"
                                disabled={
                                  submissionArchiveFetcher.state !== 'idle'
                                }
                                onClick={() => {
                                  const fd = new FormData();
                                  fd.set('intent', 'archive');
                                  submissionArchiveFetcher.submit(fd, {
                                    method: 'POST',
                                    action: `/api/model/submission/${s.id}`,
                                  });
                                }}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {isViewingAsTeacher ? (
            <p
              className="shrink-0 text-xs font-medium text-muted-foreground md:text-sm"
              data-testid="document-teacher-student-name"
            >
              {studentName}
            </p>
          ) : null}
          <div className="ml-auto flex items-center gap-4">
            {!isViewingAsTeacher && (
              <>
                {cannotSubmitEmpty && !isSubmitting ? (
                  <Tooltip text={SUBMIT_EMPTY_TOOLTIP} delayDuration={0}>
                    <span
                      className="inline-flex"
                      data-testid="document-submit-empty-trigger"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        data-testid="document-submit-button"
                      >
                        Submit
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submitActionDisabled}
                    data-testid="document-submit-button"
                    onClick={() => {
                      setSubmissionTitle(getLiveDocumentTitle());
                      setIsFinalizeDialogOpen(true);
                    }}
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
                )}
              </>
            )}
            {hasAnySubmissionRecord && archivedComments.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOldComments((v) => !v)}
              >
                {showOldComments ? 'Hide old comments' : 'Show old comments'}
              </Button>
            )}
            <div className="flex items-center gap-1.5">
              <SaveStatusIndicator status={syncStatus} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    aria-label="Document actions"
                    data-testid="document-actions-menu"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="gap-2"
                    data-testid="document-action-history"
                    onSelect={() => setHistoryOpen(true)}
                  >
                    <Clock className="h-4 w-4" />
                    History
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    data-testid="document-action-print"
                    onSelect={handlePrint}
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <DocumentHistory
              documentId={data.doc.id}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          </div>
        </nav>
        {showDbqWorkspace && apHistorySnapshot ? (
          <CommentsSelectionProvider>
            <DbqLayout
              snapshot={apHistorySnapshot}
              tutor={
                <Tutor
                  className="h-full border-r-0 md:w-full"
                  docId={data.doc.id}
                  cms={(tutor.cms ?? data.currentCms) as any}
                  cmsIdx={cmsIdx}
                  nextCmId={data.nextCmId}
                  hasPreviousCms={tutorHasPreviousCms}
                  isSessionLocked={auth.isLocked}
                  beforeRespond={handleTutorBeforeRespond}
                  onCmsUpdate={tutor.updateCms}
                  getCurrentDocumentText={() =>
                    editorBridgeRef.current?.getContent().text ??
                    data.doc.text ??
                    ''
                  }
                />
              }
              editor={
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
                  onSubmittableContentChange={handleSubmittableContentChange}
                  onCommentCreated={(c) => commentsState.addComment(c as any)}
                />
              }
              comments={
                <Comments
                  className="md:w-full"
                  comments={visibleComments as any}
                  readOnly={!isDocumentEditable}
                  onCommentRemoved={commentsState.removeComment}
                  onResponseAdded={commentsState.addResponse}
                  autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
                />
              }
            />
          </CommentsSelectionProvider>
        ) : (
          <>
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
              <div className="mx-auto flex min-h-0 flex-1 w-full max-w-screen-2xl overflow-hidden">
                {isMobile && tab !== 'tutor' ? null : (
                  <Tutor
                    docId={data.doc.id}
                    cms={(tutor.cms ?? data.currentCms) as any}
                    cmsIdx={cmsIdx}
                    nextCmId={data.nextCmId}
                    hasPreviousCms={tutorHasPreviousCms}
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
                    assignment={editorAssignmentPrompt}
                    serverHtml={editorServerHtml}
                    serverText={editorServerText}
                    serverUpdatedAt={data.doc.updatedAt}
                    initialRevision={data.doc.revision}
                    isEditable={isEditorEditable}
                    onBridgeReady={(b) => {
                      editorBridgeRef.current = b;
                    }}
                    onSyncStatusChange={setSyncStatus}
                    onSubmittableContentChange={handleSubmittableContentChange}
                    onCommentCreated={(c) => commentsState.addComment(c as any)}
                  />
                )}
                {isMobile && tab !== 'comments' ? null : (
                  <Comments
                    className="md:w-3/5"
                    comments={visibleComments as any}
                    readOnly={!isDocumentEditable}
                    onCommentRemoved={commentsState.removeComment}
                    onResponseAdded={commentsState.addResponse}
                    autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
                  />
                )}
              </div>
            </CommentsSelectionProvider>
          </>
        )}
      </main>
      <Dialog
        open={isFinalizeDialogOpen}
        onOpenChange={setIsFinalizeDialogOpen}
      >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                Submit Version {versionNumber}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="submission-title"
                      className="text-sm font-medium text-foreground"
                    >
                      Submission Title
                    </label>
                    <Input
                      id="submission-title"
                      value={submissionTitle}
                      onChange={(e) => setSubmissionTitle(e.target.value)}
                      placeholder="Enter a title for this submission"
                    />
                  </div>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm">
                    <li>
                      Submitting creates a snapshot of your essay for your
                      teacher to grade.
                    </li>
                    <li>You can keep editing and submit again after this.</li>
                  </ul>
                  {activeSubmissions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Previous submissions
                      </p>
                      <div className="max-h-32 overflow-y-auto rounded-md border">
                        {activeSubmissions.map((s) => {
                          const v = versionLabelForActiveSubmission(
                            activeSubmissions,
                            s.id
                          );
                          const isGraded = s.releasedAt != null;
                          const label = displaySubmissionTitle(
                            s.title,
                            v,
                            'Untitled submission'
                          );
                          return (
                            <a
                              key={s.id}
                              href={`/app/submissions/${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm hover:bg-muted/50 last:border-0"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{label}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                              </div>
                              <Badge
                                variant={isGraded ? 'success' : 'secondary'}
                                className="shrink-0 text-[10px]"
                              >
                                {isGraded ? 'Graded' : 'Submitted'}
                              </Badge>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
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
              {cannotSubmitEmpty && !isSubmitting ? (
                <Tooltip text={SUBMIT_EMPTY_TOOLTIP} delayDuration={0}>
                  <span
                    className="inline-flex"
                    data-testid="document-finalize-submit-empty-trigger"
                  >
                    <Button
                      variant="default"
                      data-testid="document-finalize-submit"
                      disabled
                    >
                      {`Submit Version ${versionNumber}`}
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="default"
                  data-testid="document-finalize-submit"
                  onClick={() => {
                    const resolved =
                      submissionTitle.trim() || getLiveDocumentTitle().trim();
                    void submit.submitNow(resolved);
                  }}
                  disabled={submitActionDisabled}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    `Submit Version ${versionNumber}`
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
      </Dialog>
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archived submissions</DialogTitle>
            <DialogDescription>
              Hidden from your main list. Your teacher can still view and grade
              them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {archivedSubmissions.map((s) => {
              const isGraded = s.releasedAt != null;
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Link
                    to={`/app/submissions/${s.id}`}
                    className="min-w-0 flex-1 basis-[min(100%,12rem)] font-medium hover:underline"
                    onClick={() => setArchiveDialogOpen(false)}
                  >
                    <span className="block truncate">
                      {s.title?.trim() || 'Untitled submission'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.submittedAt).toLocaleDateString()}
                    </span>
                  </Link>
                  <Badge
                    variant={isGraded ? 'success' : 'secondary'}
                    className="shrink-0 text-[10px]"
                  >
                    {isGraded ? 'Graded' : 'Submitted'}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1"
                    disabled={submissionArchiveFetcher.state !== 'idle'}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set('intent', 'unarchive');
                      submissionArchiveFetcher.submit(fd, {
                        method: 'POST',
                        action: `/api/model/submission/${s.id}`,
                      });
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
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
    </>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
