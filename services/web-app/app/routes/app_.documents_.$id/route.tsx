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
  useRouteLoaderData,
  useSearchParams,
  Link,
} from 'react-router';
import type { Route as RootRoute } from '../../+types/root';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  ExternalLink,
  Archive,
  RotateCcw,
  Clock,
  EllipsisVertical,
  Printer,
  Compass,
  MessageCircle,
  PanelLeft,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';
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
import {
  DOCUMENT_IMAGE_KILL_SWITCH_ENV,
  isDocumentImageUploadEnabled,
} from '~/domain/document-images/document-images';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import { redirectWithToast } from '~/utils/toast.server';
import { ensureAssignmentModuleSessionsForDocument } from '~/domain/documents.server';
import { collaborationRoomWhere } from '~/domain/collaboration/room.server';
import { documentReadWhere } from '~/utils/document-access.server';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { resolveCurrentAssignmentModuleSession } from '~/utils/assignment-module-session-resume';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import type { SyncStatus } from '~/utils/sync-service';

import {
  displaySubmissionTitle,
  partitionSubmissionsByArchive,
  versionLabelForActiveSubmission,
} from '~/utils/submission-versions';
import {
  isApHistorySnapshot,
  type ApHistorySnapshot,
} from '~/domain/ap-history/schema';
import { pickLatestReleasedSubmission } from '~/utils/document-link-target';
import { cn } from '~/utils/misc';
import { TeacherDocumentNavigation } from '~/components/teacher-document-navigation';
import {
  buildDocumentNavigationHref,
  GRADING_QUEUE_SORT_PARAM,
  parseGradingQueueScope,
  parseGradingQueueSort,
} from '~/domain/grading/grading-queue';
import { loadDocumentNavigationNeighbors } from '~/domain/grading/grading-queue.server';
import { redactGradedAtFromStudentDocumentSubmissions } from '~/domain/submissions/student-submission-grade-visibility.server';
import { loadGuidedTours } from '~/domain/guided-tours/guided-tours.server';
import {
  documentEditorV2ForceCookie,
  isStaffForDocumentEditorOverride,
  resolveDocumentEditorV2Enabled,
  shouldClearDocumentEditorV2ForceCookie,
  shouldSetDocumentEditorV2ForceCookie,
} from '~/domain/document-editor/document-editor-v2-gate.server';
import {
  GuidedTour,
  startPageTour,
} from '~/components/guided-tour/guided-tour';

const SUBMIT_EMPTY_TOOLTIP =
  "You can't submit an empty document. Add text first.";
export const STUDENT_UNSUBMIT_BLOCKED_TOOLTIP =
  "This submission can't be unsubmitted right now. Ask your teacher if you need to make changes.";

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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

// Shared with the post-backfill refetch below so a session created on demand
// comes back in the same shape as one loaded on the initial document query.
const assignmentModuleSessionsOrderBy = [
  { assignmentModule: { position: 'asc' as const } },
  { createdAt: 'desc' as const },
];

const assignmentModuleSessionsInclude = {
  assignmentModule: {
    include: {
      instructions: {
        omit: { answerKey: true },
        orderBy: { position: 'asc' as const },
        include: {
          buttons: {
            orderBy: { position: 'asc' as const },
          },
        },
      },
      assignmentType: {
        select: {
          assignmentModules: {
            where: { deletedAt: null },
            select: { id: true, position: true },
            orderBy: { position: 'asc' as const },
          },
        },
      },
    },
  },
  messages: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
};

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
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);

  // A collaboration room never opens on this page.
  //
  // Students and teachers find their work through lists — my-documents, the
  // dashboard, a class page — and every one of them links at
  // `/app/documents/:id`. Only the two "start" routes and the share flow send
  // anyone to the collaborative page, so a group's shared draft reached any
  // other way landed in the solo editor: no collaborators, no live sync, and a
  // save path competing with the room's dual-write for the same columns.
  //
  // Additive by construction. Every document that predates this feature has no
  // group, so the predicate matches none of them and the loader below runs
  // exactly as it did. Scoped to what this person may read so the redirect does
  // not answer "is this id a shared draft?" for someone guessing ids — they get
  // the same not-found the query below would have given them.
  const collaborative = await prisma.document.findFirst({
    where: {
      id: params.id,
      artifactKind: 'STUDENT',
      ...collaborationRoomWhere(),
      AND: [documentReadWhere({ profileId: profile.id, isAdmin })],
    },
    select: { id: true },
  });
  if (collaborative) {
    throw redirect(`/app/collab-documents/${collaborative.id}${url.search}`);
  }

  const doc = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...(hasEffectivePlatformAdmin(user?.isAdmin)
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
      artifactKind: true,
      createdAt: true,
      updatedAt: true,
      revision: true,
      title: true,
      html: true,
      text: true,
      group: { select: { id: true } },
      apHistorySnapshot: true,
      assignmentType: {
        select: {
          id: true,
          title: true,
          allowsImageUploads: true,
          rubric: { select: { name: true } },
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          promptAttachmentName: true,
          apHistorySnapshot: true,
          tutorEnabled: true,
        },
      },
      classAssignment: {
        select: {
          class: {
            select: {
              id: true,
              title: true,
              period: true,
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
          unsubmittedAt: true,
        },
      },
      revisions: { orderBy: { createdAt: 'desc' } },
      assignmentModuleSessions: {
        orderBy: assignmentModuleSessionsOrderBy,
        include: assignmentModuleSessionsInclude,
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

  if (!doc || !doc.membership) {
    return redirectWithToast('/app', {
      description: 'Document not found.',
      type: 'error',
    });
  }
  const ownerMembership = doc.membership;

  const submissions = doc.submissions;
  const isOwner = ownerMembership.id === profile.id;
  const navigationScope =
    !isOwner && profile.role === 'TEACHER'
      ? parseGradingQueueScope(
          sanitizeExitTarget(url.searchParams.get('exitTo'))
        ) ?? parseGradingQueueScope('/app/documents')
      : null;
  const documentNavigation = navigationScope && profile.organization?.id
    ? await loadDocumentNavigationNeighbors({
        request,
        membershipId: profile.id,
        organizationId: profile.organization.id,
        userId,
        documentId: doc.id,
        scope: navigationScope,
        sort: parseGradingQueueSort(url.searchParams.get(GRADING_QUEUE_SORT_PARAM)),
      })
    : null;
  const wantsDraftEditor =
    url.searchParams.get('revise') === '1' ||
    url.searchParams.get('spa') === '1';

  if (
    isOwner &&
    profile.role === 'STUDENT' &&
    !wantsDraftEditor &&
    !hasEffectivePlatformAdmin(user?.isAdmin)
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

  // A document should always have a session per AssignmentModule — they're
  // created together in createDocumentForAssignmentType. If none exist here,
  // the document reached that state some other way (hand-written seed/import
  // data, or a module added after the document was created). Recover on the
  // spot rather than dead-ending the student/teacher: back-fill the missing
  // sessions and re-read them.
  let assignmentModuleSessions = doc.assignmentModuleSessions;
  if (assignmentModuleSessions.length === 0 && doc.assignmentType?.id) {
    const created = await ensureAssignmentModuleSessionsForDocument(
      doc.id,
      doc.assignmentType.id,
      []
    );
    if (created) {
      assignmentModuleSessions = await prisma.assignmentModuleSession.findMany({
        where: { documentId: doc.id, deletedAt: null },
        orderBy: assignmentModuleSessionsOrderBy,
        include: assignmentModuleSessionsInclude,
      });
    }
  }

  const moduleSessionsByModuleId = new Map<
    string,
    (typeof assignmentModuleSessions)[number]
  >();
  for (const session of assignmentModuleSessions) {
    if (!moduleSessionsByModuleId.has(session.assignmentModuleId)) {
      moduleSessionsByModuleId.set(session.assignmentModuleId, session);
    }
  }
  const orderedModuleSessions = Array.from(
    moduleSessionsByModuleId.values()
  ).filter((session) => session.assignmentModule.deletedAt == null);

  const { currentCms, currentCmsIdx } = resolveCurrentAssignmentModuleSession(
    orderedModuleSessions,
    explicitCmsIdx
  );

  if (!currentCms) {
    // The AssignmentType backing this document has no active modules to
    // create sessions from — a data problem the student/teacher can't fix
    // themselves, unlike an ordinary missing-session case above.
    return redirectWithToast('/app', {
      description:
        "This document's assignment has no active steps to open. Contact support.",
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

  const redactGradedAtForStudentOwner =
    isOwner &&
    profile.role === 'STUDENT' &&
    !hasEffectivePlatformAdmin(user?.isAdmin);

  const submissionsForResponse = redactGradedAtForStudentOwner
    ? redactGradedAtFromStudentDocumentSubmissions(submissions)
    : submissions;

  // Free classroom teachers get a tour of the writing page.
  const guidedTours = await loadGuidedTours(userId, profile, request);

  const isPlatformAdmin = isStaffForDocumentEditorOverride(user?.isAdmin);
  const documentEditorV2 = await resolveDocumentEditorV2Enabled({
    request,
    isStaff: isPlatformAdmin,
  });

  const headers = shouldSetDocumentEditorV2ForceCookie(request, isPlatformAdmin)
    ? {
        'Set-Cookie': await documentEditorV2ForceCookie.serialize('1'),
      }
    : shouldClearDocumentEditorV2ForceCookie(request, isPlatformAdmin)
      ? {
          'Set-Cookie': await documentEditorV2ForceCookie.serialize('', {
            maxAge: 0,
          }),
        }
      : undefined;

  return dataResponse(
    {
    documentEditorV2,
    guidedTours,
    doc: {
      ...doc,
      submissions: submissionsForResponse,
      membership: ownerMembership,
      assignmentModuleSessions: orderedModuleSessions,
      comments: sortedComments,
    },
    submissions: submissionsForResponse,
    currentCms,
    currentCmsIdx,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: currentCmsIdx > 0,
    // GBA 300's expansion report is graded on its graphics, so its authors get
    // the "Add image" control. Every other assignment type sees the toolbar it
    // has always seen.
    canUploadImages:
      isOwner &&
      isDocumentImageUploadEnabled({
        rubricName: doc.assignmentType?.rubric?.name ?? null,
        allowsImageUploads: doc.assignmentType?.allowsImageUploads ?? false,
        killSwitch: process.env[DOCUMENT_IMAGE_KILL_SWITCH_ENV],
      }),
    canSelfUnsubmit:
      isOwner &&
      profile.role === 'STUDENT' &&
      !hasEffectivePlatformAdmin(user?.isAdmin),
    documentNavigation,
    isTeacherAssignmentPreview:
      doc.artifactKind === 'TEACHER_ASSIGNMENT_PREVIEW',
    },
    headers ? { headers } : undefined
  );
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs) {
  // Teacher prev/next and the student dropdown hop between document ids on this
  // route. Without a pathname check the loader stays on the first document and
  // navigation looks broken even though the URL updates.
  if (args.currentUrl.pathname !== args.nextUrl.pathname) {
    return true;
  }

  // Revalidate when the module session index changes (navigating between modules).
  const currentCmsIdx = args.currentUrl.searchParams.get('cmsIdx');
  const nextCmsIdx = args.nextUrl.searchParams.get('cmsIdx');
  if (currentCmsIdx !== nextCmsIdx) return true;

  // Otherwise, never revalidate. The editor owns document state client-side.
  // Server state flows through explicit fetch() calls + local React state.
  return false;
}

export type SubmissionRow = {
  id: string;
  title: string;
  submittedAt: string | Date;
  gradedAt: string | null;
  releasedAt: string | null;
  archivedAt: string | Date | null;
  unsubmittedAt?: string | Date | null;
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

export function AssignmentPromptStrip({
  label,
  title,
  prompt,
  metadata = [],
}: {
  label?: string | null;
  title?: string | null;
  prompt: string;
  metadata?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const normalizedPrompt = prompt.trim();
  const canExpand =
    normalizedPrompt.length > 180 || normalizedPrompt.includes('\n');

  return (
    <section
      data-testid="assignment-prompt-strip"
      className="border-b bg-amber-50/80 px-3 py-2"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info-outlined" size="sm">
            Assignment Prompt
          </Badge>
          {label ? (
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {label}
            </span>
          ) : null}
          {title ? (
            <span className="text-sm font-medium text-foreground">{title}</span>
          ) : null}
          {metadata.map((item) => (
            <Badge key={item} variant="outline" size="sm">
              {item}
            </Badge>
          ))}
        </div>
        <div className="flex items-start gap-2">
          <p
            className={
              expanded
                ? 'min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90'
                : 'line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90'
            }
          >
            {normalizedPrompt}
          </p>
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show full prompt'}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Whether the tutor affordance (tab + panel) should be shown for a document.
 * A document with no linked assignment (e.g. free writing) keeps today's
 * behavior of always showing the tutor. Defaults to enabled when the flag
 * is missing, which preserves current behavior for existing assignments.
 */
export function isTutorEnabledForAssignment(
  assignment: { tutorEnabled?: boolean } | null | undefined
): boolean {
  return assignment?.tutorEnabled !== false;
}

import { DocumentEditorV1Page } from './editor-v1/document-editor-v1-page';
import { DocumentEditorV2Page } from './editor-v2/document-editor-v2-page';

export default function Route() {
  const { documentEditorV2 } = useLoaderData<typeof loader>();
  if (documentEditorV2) {
    return <DocumentEditorV2Page />;
  }
  return <DocumentEditorV1Page />;
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
