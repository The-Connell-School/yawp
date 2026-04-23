import { invariant } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  data as dataResponse,
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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
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
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  isDocumentSubmissionEnabledForSchool,
  isAssignmentsEnabledForOrganization,
} from '~/utils/feature-flags.server';
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
import { formatDateOnly } from '~/utils/date-only';
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

const SUBMIT_EMPTY_TOOLTIP =
  "You can't submit an empty document. Add text first.";

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
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

  const submissions = doc.submissions;

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

  const sortedComments = sortDocumentCommentsByMarkupOrder(
    doc.comments,
    doc.html
  );

  return dataResponse({
    doc: {
      ...doc,
      comments: sortedComments,
    },
    submissions,
    currentCms,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: doc.studentCourseModuleSessions[cmsIdx + 1] !== undefined,
    isDocumentSubmissionEnabled,
    assignmentsEnabled,
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
  const [localSubmissions, setLocalSubmissions] = useState<SubmissionRow[]>([]);
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const cmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tab = searchParams.get('tab') ?? 'tutor';
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;
  // Owner or class teacher (loader); api.model.document allows both to persist edits.
  const isDocumentEditable = true;

  // Merge server + optimistic submissions
  const submissions = useMemo(() => {
    const serverSubs = (data.submissions ?? []) as SubmissionRow[];
    const serverIds = new Set(serverSubs.map((s) => s.id));
    const newLocal = localSubmissions.filter((s) => !serverIds.has(s.id));
    return [...newLocal, ...serverSubs];
  }, [data.submissions, localSubmissions]);

  const { active: activeSubmissions, archived: archivedSubmissions } =
    useMemo(
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
  const commentsState = useCommentsState(
    (data.doc.comments as any[]) ?? []
  );
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
  const studentName = data.doc.profile.user.name?.trim() || 'Unknown student';
  const cannotSubmitEmpty = !editorSubmittable;
  const isSubmitting = submit.isSubmitting;
  const submitActionDisabled = isSubmitting || cannotSubmitEmpty;

  const tutorHasPreviousCms = useMemo(() => {
    const liveCmsId = tutor.cms?.id ?? data.currentCms.id;
    return (
      data.hasPreviousCms || liveCmsId !== data.currentCms.id
    );
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

  useEffect(() => {
    if (submissionArchiveFetcher.state !== 'idle') return;
    const body = submissionArchiveFetcher.data as { success?: boolean } | undefined;
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
                    <Badge variant="success" className="ml-1 text-[10px] px-1.5 py-0">
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
                                <Badge variant="outline" className="text-[10px]">
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
            {data.isDocumentSubmissionEnabled && !isViewingAsTeacher && (
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
            <DocumentHistory documentId={data.doc.id} syncStatus={syncStatus} />
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
          <div className="mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden">
            {isMobile && tab !== 'tutor' ? null : (
              <Tutor
                docId={data.doc.id}
                cms={(tutor.cms ?? data.currentCms) as any}
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
                onCommentCreated={(c) =>
                  commentsState.addComment(c as any)
                }
              />
            )}
            {isMobile && tab !== 'comments' ? null : (
              <Comments
                comments={visibleComments as any}
                readOnly={!isDocumentEditable}
                onCommentRemoved={commentsState.removeComment}
                onResponseAdded={commentsState.addResponse}
                autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
              />
            )}
          </div>
        </CommentsSelectionProvider>
      </main>
      {data.isDocumentSubmissionEnabled && (
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
                    <label htmlFor="submission-title" className="text-sm font-medium text-foreground">
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
                      Submitting creates a snapshot of your essay for your teacher
                      to grade.
                    </li>
                    <li>
                      You can keep editing and submit again after this.
                    </li>
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
                    <Button variant="default" data-testid="document-finalize-submit" disabled>
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
      )}
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
