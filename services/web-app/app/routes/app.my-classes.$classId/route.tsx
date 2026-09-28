import { Prisma } from '@app/prisma';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import {
  Form,
  useLoaderData,
  useSearchParams,
  useFetcher,
  useLocation,
  useNavigate,
  useOutlet,
  useRevalidator,
} from 'react-router';
import { Link } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import {
  parseAssignmentGradingIntent,
  parseAssignmentRubricOverrides,
} from '~/utils/assignment-grading-intent.server';
import { parseAssignmentTutorEnabled } from '~/utils/assignment-tutor-enabled.server';
import {
  exitTicketGradingModeFor,
  resolveAssignmentPrompt,
} from '~/utils/assignment-exit-ticket.server';
import {
  formatClassLabel,
  type ClassDisplayFields,
} from '~/utils/class-display';
import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  AssignmentHasCollaborativeWorkError,
  createAssignmentDeployedToClasses,
  deleteClassAssignmentDeployment,
} from '~/utils/assignment-deployment.server';
import {
  AssignmentPromptAttachmentError,
  assignmentPromptAttachmentRequestTooLarge,
  deleteAssignmentPromptAttachment,
  uploadAssignmentPromptAttachment,
} from '~/domain/assignments/assignment-prompt-attachment.server';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { badgeVariants } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { CaretLeftIcon } from '~/components/icons';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ClassManageSheet,
  type ClassManageRow,
} from '~/components/class-manage-sheet';
import { DocumentLink } from '~/components/document-link';
import { Checkbox } from '~/components/ui/checkbox';
import { ReleaseGradesSheet } from '~/components/teacher-document-work/release-grades-sheet';
import { UnsubmitSubmissionsSheet } from '~/components/teacher-document-work/unsubmit-submissions-sheet';
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  Plus,
  UserMinus,
  Search,
  ChevronRight,
} from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { timeAgo } from '~/utils/timeAgo';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { studentModuleSessionSingleSelect } from './module-session-select.server';
import { buildClassDocumentScope } from './class-document-where.server';
import { parseDocumentGroupMode } from './class-documents-grouping';
import {
  getStoredCollapsedDocumentGroups,
  mergeClassDocumentsViewPreferences,
  mergeStoredClassDocumentsSearchParams,
  readClassDocumentsViewPreferences,
  withStoredCollapsedDocumentGroups,
} from './class-documents-view-preferences';
import {
  TeacherDocumentWorkPanel,
  type TeacherDocumentWorkFilters,
} from '~/components/teacher-document-work/teacher-document-work-panel';
import {
  parseDocumentWorkFilterIds,
  serializeDocumentWorkFilterIds,
} from '~/utils/teacher-document-work-filter-options';
import {
  DEFAULT_DOCUMENT_WORK_SORT,
  type DocumentWorkSort,
} from '~/utils/teacher-document-work-sort';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  parseGradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import {
  ClassDetailHeader,
  type ClassHeaderTab,
  resolveClassHeaderTab,
} from './class-detail-header';
import { loadStudentClassDetail } from './student-class-detail.server';
import { StudentClassDetailView } from './student-class-detail-view';
import {
  TEACHER_DOCUMENT_STATUSES,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  buildReleaseGradeRows,
  buildTeacherUnsubmitRows,
  countTeacherDocumentWorkStatuses,
  type ReleaseGradeRow,
  type TeacherUnsubmitRow,
  type TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';
import { cn } from '~/utils/misc';
import { useTable } from '~/hooks/useTable';
import { Tooltip } from '~/components/ui/tooltip';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { SheetDescription } from '~/components/ui/sheet';
import {
  enrollExistingStudentInClass,
  lookupStudentEmailForClass,
  sendStudentClassInvite,
} from './class-student-enrollment.server';
import {
  lockClassCollaborationDeployments,
  lockStudentRosters,
} from '~/domain/collaboration/class-assignment-lock.server';
import { filterClassStudentsByQuery } from './class-students-search';
import {
  StudentGrowthPlansSheet,
  type StudentGrowthPlan,
} from './student-growth-plans-sheet';
import {
  ClassAssignmentsTab,
  type ClassAssignmentsTabAssignment,
} from './class-assignments-tab';
import type { ClassInsightSummary } from '../app.my-classes.$classId_.assignments.$assignmentId/class-insights-panel';
import { buildGradedCountByAssignmentId } from './graded-count';
import {
  buildPasteAlertsByStudentId,
  summarizeStudentPasteActivity,
} from './class-paste-alerts';
import { getGrammarGradingAssignmentTypeIds } from '~/domain/assignment-types/assignment-type-grading-config.server';

export function getDraftDisplayTitle(document: {
  title?: string | null;
  assignment?: { title?: string | null } | null;
}) {
  const documentTitle = document.title?.trim();
  if (documentTitle) return documentTitle;

  const assignmentTitle = document.assignment?.title?.trim();
  if (assignmentTitle) return assignmentTitle;

  return 'Untitled draft';
}

export function classAssignmentOptionLabel(klass: ClassDisplayFields) {
  return formatClassLabel(klass);
}

async function getClassStudentMemberships(
  classId: string,
  membershipIds: string[],
  organizationId: string
) {
  return prisma.orgMembership.findMany({
    where: {
      id: { in: membershipIds },
      role: 'STUDENT',
      classesAsStudent: { some: { id: classId } },
      organizationId,
    },
    select: { id: true },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can manage assignments.' },
      { status: 403 }
    );
  }

  const classId = params.classId;
  if (!classId) {
    return dataResponse(
      { success: false, message: 'Class is required.' },
      { status: 400 }
    );
  }

  const classAccess = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { id: profile.id } },
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });

  if (!classAccess) {
    return dataResponse(
      { success: false, message: 'Class not found.' },
      { status: 404 }
    );
  }

  const allowedAssignmentTypes = await getAvailableAssignmentTypesForScopes<{
    id: string;
    systemKey: string | null;
    kind: string | null;
  }>({
    scopes: [
      {
        organizationId: classAccess.school.organizationId,
        schoolId: classAccess.school.id,
        teacherProfileId: profile.id,
      },
    ],
    select: { id: true, systemKey: true, kind: true },
  });
  const allowedAssignmentTypeIds = new Set(
    allowedAssignmentTypes
      .filter((type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY)
      .map((type) => type.id)
  );

  if (assignmentPromptAttachmentRequestTooLarge(request)) {
    return dataResponse(
      { success: false, message: 'PDF is too large. Maximum size is 10 MB.' },
      { status: 413 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  if (intent === 'delete-assignments') {
    const assignmentIds = formData.getAll('assignmentIds') as string[];

    if (!assignmentIds.length) {
      return dataResponse(
        { success: false, message: 'Select at least one assignment.' },
        { status: 400 }
      );
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        id: { in: assignmentIds },
        classAssignments: { some: { classId } },
      },
      select: { id: true },
    });

    if (assignments.length !== assignmentIds.length) {
      return dataResponse(
        { success: false, message: 'Some assignments were not found.' },
        { status: 400 }
      );
    }

    const protectedDeployment = await prisma.documentGroup.findFirst({
      where: {
        documentId: { not: null },
        classAssignment: { classId, assignmentId: { in: assignmentIds } },
      },
      select: { id: true },
    });
    if (protectedDeployment) {
      return dataResponse(
        {
          success: false,
          message: 'Assignments with shared group work cannot be deleted.',
        },
        { status: 409 }
      );
    }

    try {
      for (const assignmentId of assignmentIds) {
        await deleteClassAssignmentDeployment({ assignmentId, classId });
      }
    } catch (error) {
      if (error instanceof AssignmentHasCollaborativeWorkError) {
        return dataResponse(
          { success: false, message: error.message },
          { status: 409 }
        );
      }
      throw error;
    }

    return dataResponse({
      success: true,
      message: `Deleted ${assignmentIds.length} assignment(s).`,
    });
  }

  if (intent === 'delete-assignment') {
    const assignmentId = formData.get('assignmentId')?.toString();
    if (!assignmentId) {
      return dataResponse(
        { success: false, message: 'Assignment is required.' },
        { status: 400 }
      );
    }

    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        classAssignments: { some: { classId } },
      },
      select: { id: true },
    });

    if (!assignment) {
      return dataResponse(
        { success: false, message: 'Assignment not found.' },
        { status: 404 }
      );
    }

    try {
      await deleteClassAssignmentDeployment({ assignmentId, classId });
    } catch (error) {
      if (error instanceof AssignmentHasCollaborativeWorkError) {
        return dataResponse(
          { success: false, message: error.message },
          { status: 409 }
        );
      }
      throw error;
    }

    return dataResponse({
      success: true,
      message: 'Assignment deleted successfully.',
    });
  }

  if (intent === 'create-assignment' || intent === 'update-assignment') {
    const assignmentId = formData.get('assignmentId')?.toString();
    const assignmentTypeId = formData.get('assignmentTypeId')?.toString();
    const titleRaw = formData.get('title')?.toString() ?? '';
    const promptRaw = formData.get('prompt')?.toString() ?? '';
    const postAtRaw = formData.get('postAt')?.toString()?.trim() ?? '';
    const dueAtRaw = formData.get('dueAt')?.toString()?.trim() ?? '';
    const strictnessRaw = formData.get('gradingAssistantStrictnessLevel');

    const title = titleRaw.trim() || null;
    const prompt = promptRaw.trim();
    const gradingAssistantStrictnessLevel =
      intent === 'create-assignment'
        ? strictnessRaw
          ? parseGradingAssistantStrictnessLevel(strictnessRaw)
          : DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
        : null;

    if (!assignmentTypeId) {
      return dataResponse(
        { success: false, message: 'Assignment type is required.' },
        { status: 400 }
      );
    }
    let existingAssignment: {
      id: string;
      assignmentTypeId: string;
      promptAttachmentKey: string | null;
      assignmentType: { systemKey: string | null };
    } | null = null;
    if (intent === 'update-assignment') {
      if (!assignmentId) {
        return dataResponse(
          { success: false, message: 'Assignment is required.' },
          { status: 400 }
        );
      }

      existingAssignment = await prisma.assignment.findFirst({
        where: {
          id: assignmentId,
          classAssignments: { some: { classId } },
        },
        select: {
          id: true,
          assignmentTypeId: true,
          promptAttachmentKey: true,
          assignmentType: { select: { systemKey: true } },
        },
      });

      if (!existingAssignment) {
        return dataResponse(
          { success: false, message: 'Assignment not found.' },
          { status: 404 }
        );
      }
    }

    const selectedAssignmentType = allowedAssignmentTypes.find(
      (type) => type.id === assignmentTypeId
    );
    if (
      selectedAssignmentType?.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY ||
      existingAssignment?.assignmentType.systemKey ===
        AP_HISTORY_ASSIGNMENT_TYPE_KEY
    ) {
      return dataResponse(
        {
          success: false,
          message: 'Choose an APUSH prompt from the library first.',
        },
        { status: 400 }
      );
    }

    const isPreservingCurrentArchivedType =
      intent === 'update-assignment' &&
      existingAssignment?.assignmentTypeId === assignmentTypeId;

    if (
      !allowedAssignmentTypeIds.has(assignmentTypeId) &&
      !isPreservingCurrentArchivedType
    ) {
      return dataResponse(
        {
          success: false,
          message: 'Selected assignment type is not available.',
        },
        { status: 400 }
      );
    }
    // An exit ticket's prompt is composed from the form answers, here as well
    // as on the create API, so editing one cannot replace a composed prompt
    // with whatever the browser happened to post.
    const resolvedPrompt = resolveAssignmentPrompt({
      assignmentTypeKind: selectedAssignmentType?.kind,
      postedPrompt: prompt,
      formData,
    });
    if (!resolvedPrompt.success) {
      return dataResponse(
        { success: false, message: resolvedPrompt.message },
        { status: 400 }
      );
    }
    const assignmentPrompt = resolvedPrompt.prompt;
    const exitTicketConfigJson = resolvedPrompt.exitTicketConfigJson;

    if (!assignmentPrompt) {
      return dataResponse(
        { success: false, message: 'Prompt is required.' },
        { status: 400 }
      );
    }
    if (intent === 'create-assignment' && !gradingAssistantStrictnessLevel) {
      return dataResponse(
        {
          success: false,
          message: 'Grading assistant strictness level is invalid.',
        },
        { status: 400 }
      );
    }

    const gradingIntent = parseAssignmentGradingIntent(formData);
    if (!gradingIntent.success) {
      return dataResponse(
        { success: false, message: gradingIntent.message },
        { status: 400 }
      );
    }
    const rubricOverrides = parseAssignmentRubricOverrides(formData);
    if (!rubricOverrides.success) {
      return dataResponse(
        { success: false, message: rubricOverrides.message },
        { status: 400 }
      );
    }
    const rubricOverrideData = {
      ...(formData.has('rubricTotalPoints')
        ? { rubricTotalPoints: rubricOverrides.data.rubricTotalPoints }
        : {}),
      ...(formData.has('gradingMode')
        ? {
            gradingMode: exitTicketGradingModeFor({
              assignmentTypeKind: selectedAssignmentType?.kind,
              formData,
              gradingMode: rubricOverrides.data.gradingMode,
            }),
          }
        : {}),
    };

    const promptAttachment = formData.get('promptAttachment');
    let promptAttachmentData:
      | {
          promptAttachmentKey: string | null;
          promptAttachmentName: string | null;
          promptAttachmentSize: number | null;
        }
      | undefined =
      formData.get('removePromptAttachment') === 'true'
        ? {
            promptAttachmentKey: null,
            promptAttachmentName: null,
            promptAttachmentSize: null,
          }
        : undefined;
    if (promptAttachment instanceof File && promptAttachment.size > 0) {
      try {
        promptAttachmentData =
          await uploadAssignmentPromptAttachment(promptAttachment);
      } catch (error) {
        if (error instanceof AssignmentPromptAttachmentError) {
          return dataResponse(
            { success: false, message: error.message },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    const tutorEnabledResult = parseAssignmentTutorEnabled(formData);
    if (!tutorEnabledResult.success) {
      return dataResponse(
        { success: false, message: tutorEnabledResult.message },
        { status: 400 }
      );
    }

    // Optional deployment dates (applied/updated for this class deployment)
    let postAt: Date | null | undefined = undefined;
    let dueAt: Date | null | undefined = undefined;
    if (postAtRaw) {
      const parsed = new Date(postAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return dataResponse(
          { success: false, message: 'The post date is invalid.' },
          { status: 400 }
        );
      }
      postAt = parsed;
    } else if (formData.has('postAt')) {
      postAt = null;
    }
    if (dueAtRaw) {
      const parsed = new Date(dueAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return dataResponse(
          { success: false, message: 'The due date is invalid.' },
          { status: 400 }
        );
      }
      dueAt = parsed;
    } else if (formData.has('dueAt')) {
      dueAt = null;
    }

    if (intent === 'create-assignment') {
      try {
        await createAssignmentDeployedToClasses({
          data: {
            assignmentTypeId,
            title,
            prompt: assignmentPrompt,
            ...(exitTicketConfigJson ? { exitTicketConfigJson } : {}),
            submitForGrade: gradingIntent.data.submitForGrade,
            pointValue: gradingIntent.data.pointValue,
            ...rubricOverrideData,
            gradingAssistantStrictnessLevel: gradingAssistantStrictnessLevel!,
            tutorEnabled: tutorEnabledResult.value,
            ...promptAttachmentData,
          },
          classIds: [classId],
          deployment: {
            postAt: postAt ?? null,
            dueAt: dueAt ?? null,
          },
        });
      } catch (error) {
        if (promptAttachmentData?.promptAttachmentKey) {
          await deleteAssignmentPromptAttachment(
            promptAttachmentData.promptAttachmentKey
          ).catch(() => {});
        }
        throw error;
      }

      return dataResponse({
        success: true,
        message: 'Assignment created successfully.',
      });
    }

    try {
      await prisma.assignment.update({
        where: { id: existingAssignment!.id },
        data: {
          assignmentTypeId,
          title,
          prompt: assignmentPrompt,
          // Cleared rather than left alone: a type changed away from Exit
          // Ticket must not keep a config describing a prompt it no longer
          // has. Prisma.DbNull is how a nullable Json column is set to null.
          exitTicketConfigJson: exitTicketConfigJson ?? Prisma.DbNull,
          submitForGrade: gradingIntent.data.submitForGrade,
          pointValue: gradingIntent.data.pointValue,
          ...(formData.has('rubricTotalPoints')
            ? { rubricTotalPoints: rubricOverrides.data.rubricTotalPoints }
            : {}),
          ...(formData.has('gradingMode')
            ? {
                gradingMode: exitTicketGradingModeFor({
                  assignmentTypeKind: selectedAssignmentType?.kind,
                  formData,
                  gradingMode: rubricOverrides.data.gradingMode,
                }),
              }
            : {}),
          // Both controls now live on the edit form as well as the create
          // form. Only write them when the form actually sent them, so an
          // older caller that omits them leaves the stored value alone.
          ...(gradingAssistantStrictnessLevel
            ? { gradingAssistantStrictnessLevel }
            : {}),
          ...(formData.has('tutorEnabled')
            ? { tutorEnabled: tutorEnabledResult.value }
            : {}),
          ...promptAttachmentData,
        },
      });
      // Update the class deployment dates when present in the form
      if (postAt !== undefined || dueAt !== undefined) {
        await prisma.classAssignment.updateMany({
          where: { assignmentId: existingAssignment!.id, classId },
          data: {
            ...(postAt !== undefined ? { postAt } : {}),
            ...(dueAt !== undefined ? { dueAt } : {}),
          },
        });
      }
    } catch (error) {
      if (
        promptAttachmentData?.promptAttachmentKey &&
        promptAttachmentData.promptAttachmentKey !==
          existingAssignment!.promptAttachmentKey
      ) {
        await deleteAssignmentPromptAttachment(
          promptAttachmentData.promptAttachmentKey
        ).catch(() => {});
      }
      throw error;
    }
    if (
      promptAttachmentData &&
      existingAssignment!.promptAttachmentKey &&
      existingAssignment!.promptAttachmentKey !==
        promptAttachmentData.promptAttachmentKey
    ) {
      await deleteAssignmentPromptAttachment(
        existingAssignment!.promptAttachmentKey
      ).catch(() => {});
    }

    return dataResponse({
      success: true,
      message: 'Assignment updated successfully.',
    });
  }

  if (intent === 'lookup-student-email') {
    const email = formData.get('email')?.toString() ?? '';
    const result = await lookupStudentEmailForClass({
      email,
      classId,
      organizationId: classAccess.school.organizationId,
    });

    if (result.status === 'error') {
      return dataResponse({ error: result.error }, { status: 400 });
    }

    if (result.status === 'needs_invite') {
      return dataResponse({ needsInvite: true, email: result.email });
    }

    if (result.status === 'already_enrolled') {
      return dataResponse({
        alreadyEnrolled: true,
        email: result.email,
        message: result.message,
      });
    }

    return dataResponse({ hasAccount: true, email: result.email });
  }

  if (intent === 'enroll-student') {
    const email = formData.get('email')?.toString() ?? '';
    const result = await enrollExistingStudentInClass({
      email,
      classId,
      organizationId: classAccess.school.organizationId,
    });

    if (result.status === 'error') {
      return dataResponse({ error: result.error }, { status: 400 });
    }

    return dataResponse({
      success: true,
      message: result.message,
    });
  }

  if (intent === 'invite-student') {
    const email = formData.get('email')?.toString() ?? '';
    const result = await sendStudentClassInvite({
      email,
      classId,
      organizationId: classAccess.school.organizationId,
      request,
    });

    if (result.status === 'error') {
      return dataResponse({ error: result.error }, { status: 400 });
    }

    return dataResponse({
      success: true,
      message: `Invitation sent to ${result.email}.`,
    });
  }

  // Removes class enrollment only — student profiles and accounts stay intact.
  if (intent === 'remove-students') {
    const studentProfileIds = formData.getAll('studentProfileIds') as string[];

    if (!studentProfileIds.length) {
      return dataResponse({ error: 'No students selected.' }, { status: 400 });
    }

    const students = await getClassStudentMemberships(
      classId,
      studentProfileIds,
      classAccess.school.organizationId
    );

    if (students.length !== studentProfileIds.length) {
      return dataResponse(
        { error: 'Some selected students were not found in this class.' },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await lockStudentRosters(tx, studentProfileIds);
      await lockClassCollaborationDeployments(tx, classId);
      await tx.documentGroupMember.updateMany({
        where: {
          membershipId: { in: studentProfileIds },
          removedAt: null,
          group: { classAssignment: { classId } },
        },
        data: { removedAt: new Date() },
      });
      for (const student of students) {
        await tx.orgMembership.update({
          where: { id: student.id },
          data: { classesAsStudent: { disconnect: { id: classId } } },
        });
      }
    });

    return dataResponse({ success: true });
  }

  // Reassigns class enrollment only — student profiles and accounts stay intact.
  if (intent === 'move-students') {
    const studentProfileIds = formData.getAll('studentProfileIds') as string[];
    const targetClassId = formData.get('targetClassId')?.toString();

    if (!studentProfileIds.length || !targetClassId) {
      return dataResponse(
        { error: 'Students and target class are required.' },
        { status: 400 }
      );
    }

    if (targetClassId === classId) {
      return dataResponse(
        { error: 'Choose a different class to move students into.' },
        { status: 400 }
      );
    }

    const targetClass = await prisma.class.findFirst({
      where: {
        id: targetClassId,
        isArchived: false,
        teachers: { some: { id: profile.id } },
      },
      select: { id: true },
    });

    if (!targetClass) {
      return dataResponse(
        { error: 'Target class not found.' },
        { status: 404 }
      );
    }

    const students = await getClassStudentMemberships(
      classId,
      studentProfileIds,
      classAccess.school.organizationId
    );

    if (students.length !== studentProfileIds.length) {
      return dataResponse(
        { error: 'Some selected students were not found in this class.' },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await lockStudentRosters(tx, studentProfileIds);
      for (const lockedClassId of [classId, targetClassId].sort()) {
        await lockClassCollaborationDeployments(tx, lockedClassId);
      }
      await tx.documentGroupMember.updateMany({
        where: {
          membershipId: { in: studentProfileIds },
          removedAt: null,
          group: { classAssignment: { classId } },
        },
        data: { removedAt: new Date() },
      });
      for (const student of students) {
        await tx.orgMembership.update({
          where: { id: student.id },
          data: {
            classesAsStudent: {
              disconnect: { id: classId },
              connect: { id: targetClassId },
            },
          },
        });
      }
    });

    return dataResponse({ success: true });
  }

  return dataResponse(
    { success: false, message: 'Unsupported action.' },
    { status: 400 }
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const classId = params.classId!;

  // Students get their own read-only view of the same URL. `loadStudentClassDetail`
  // only resolves classes they are enrolled in, so a student who follows a link
  // to someone else's class gets a 404 rather than any part of this page.
  if (profile.role === 'STUDENT') {
    const studentDetail = await loadStudentClassDetail({
      membershipId: profile.id,
      classId,
    });
    if (!studentDetail) throw new Response('Class not found', { status: 404 });

    return dataResponse({ role: 'STUDENT' as const, ...studentDetail });
  }

  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }

  const url = new URL(request.url);
  if (url.searchParams.get('tab') === 'summary') {
    url.searchParams.set('tab', 'assignments');
    return redirect(`${url.pathname}?${url.searchParams.toString()}`);
  }

  const [klass, manageSchools] = await Promise.all([
    prisma.class.findFirst({
      where: {
        id: classId,
        teachers: { some: { id: profile.id } },
      },
      select: {
        id: true,
        schoolId: true,
        schoolYear: true,
        code: true,
        grade: true,
        period: true,
        title: true,
        classArtIndex: true,
        classArtKey: true,
        school: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: { classInsightsEnabled: true, reporterEnabled: true },
            },
          },
        },
        students: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.orgMembership.findUnique({
      where: { id: profile.id },
      select: {
        schools: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    }),
  ]);
  if (!klass) throw new Response('Class not found', { status: 404 });

  const classInsightsEnabled = klass.school.organization.classInsightsEnabled;
  const reporterEnabled = klass.school.organization.reporterEnabled;

  const legacyClassDocumentIds = (
    await prisma.documentClassForensic.findMany({
      where: { oldClassId: classId },
      select: { documentId: true },
    })
  ).map((row) => row.documentId);

  const studentProfileIdFilters = parseDocumentWorkFilterIds(
    url.searchParams.get('studentId')
  );
  const studentProfileIdFilter =
    studentProfileIdFilters.length === 1 ? studentProfileIdFilters[0] : null;
  const enrolledStudent = studentProfileIdFilter
    ? klass.students.find((student) => student.id === studentProfileIdFilter)
    : null;
  const classDocumentScope = buildClassDocumentScope(
    classId,
    legacyClassDocumentIds,
    enrolledStudent
      ? { membershipId: enrolledStudent.id }
      : { enrolledMembershipIds: klass.students.map((student) => student.id) }
  );

  // Get all submissions for this class
  const submissions = await prisma.submission.findMany({
    where: {
      document: {
        is: {
          ...classDocumentScope,
          deletedAt: null,
        },
      },
      // A teacher-unsubmitted submission is withdrawn, not just archived —
      // exclude it from the class's document/grading views entirely.
      unsubmittedAt: null,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      submittedAt: true,
      documentId: true,
      score: true,
      feedback: true,
      rubricScores: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      aiMeta: true,
      releasedAt: true,
      gradedAt: true,
      archivedAt: true,
      document: {
        select: {
          id: true,
          title: true,
          assignment: {
            select: {
              id: true,
              title: true,
              submitForGrade: true,
              pointValue: true,
            },
          },
          membership: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          group: {
            select: {
              id: true,
              label: true,
              members: {
                where: { removedAt: null },
                orderBy: { membershipId: 'asc' },
                select: {
                  membershipId: true,
                  membership: {
                    select: {
                      id: true,
                      user: { select: { id: true, name: true, email: true } },
                    },
                  },
                },
              },
            },
          },
          assignmentModuleSessions: studentModuleSessionSingleSelect,
        },
      },
    },
    orderBy: {
      submittedAt: 'desc',
    },
  });

  // Get in-progress documents (all unsubmitted drafts for this class)
  const inProgressDocuments = await prisma.document.findMany({
    where: {
      ...classDocumentScope,
      deletedAt: null,
      archivedAt: null,
      submissions: { none: {} },
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          submitForGrade: true,
          pointValue: true,
        },
      },
      membership: {
        select: {
          id: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      group: {
        select: {
          id: true,
          label: true,
          members: {
            where: { removedAt: null },
            orderBy: { membershipId: 'asc' },
            select: {
              membershipId: true,
              membership: {
                select: {
                  id: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      },
      assignmentModuleSessions: studentModuleSessionSingleSelect,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  const [classAssignments, availableAssignmentTypes] = await Promise.all([
    prisma.classAssignment.findMany({
      where: { classId },
      select: {
        id: true,
        assignment: {
          select: {
            id: true,
            title: true,
            prompt: true,
            promptAttachmentName: true,
            submitForGrade: true,
            pointValue: true,
            assignmentTypeId: true,
            assignmentType: {
              select: {
                id: true,
                title: true,
                systemKey: true,
              },
            },
            _count: { select: { classAssignments: true } },
          },
        },
        _count: {
          select: {
            documents: true,
          },
        },
        documentGroups: {
          where: { documentId: { not: null } },
          take: 1,
          select: { id: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    getAvailableAssignmentTypesForScopes<{
      id: string;
      title: string;
      systemKey: string | null;
      kind: string | null;
      collaborationSupported: boolean;
    }>({
      scopes: [
        {
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: profile.id,
        },
      ],
      select: {
        id: true,
        title: true,
        systemKey: true,
        kind: true,
        collaborationSupported: true,
      },
      orderBy: { position: 'asc' },
    }),
  ]);

  // Class-wide, assignment-level performance summaries (see
  // ClassAssignmentInsight) are generated from the assignment sheet on this
  // page. Batch-load whatever's already been generated so the sheet can open
  // straight to the cached summary instead of always starting blank.
  const classAssignmentIds = classAssignments.map((ca) => ca.id);
  const insightRows =
    classInsightsEnabled && classAssignmentIds.length > 0
      ? await prisma.classAssignmentInsight.findMany({
          where: { classAssignmentId: { in: classAssignmentIds } },
          select: {
            classAssignmentId: true,
            status: true,
            submissionCount: true,
            generatedAt: true,
            summaryJson: true,
          },
        })
      : [];
  const insightByClassAssignmentId = new Map(
    insightRows
      .filter((row) => row.status === 'ready' && row.summaryJson)
      .map((row) => [
        row.classAssignmentId,
        {
          status: 'ready' as const,
          submissionCount: row.submissionCount,
          generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
          summary: row.summaryJson as unknown as ClassInsightSummary,
        },
      ])
  );

  const assignments = classAssignments.map((classAssignment) => ({
    id: classAssignment.assignment.id,
    classAssignmentId: classAssignment.id,
    title: classAssignment.assignment.title,
    prompt: classAssignment.assignment.prompt,
    promptAttachmentName: classAssignment.assignment.promptAttachmentName,
    submitForGrade: classAssignment.assignment.submitForGrade,
    pointValue: classAssignment.assignment.pointValue,
    assignmentTypeId: classAssignment.assignment.assignmentTypeId,
    assignmentType: classAssignment.assignment.assignmentType,
    otherClassCount: Math.max(
      classAssignment.assignment._count.classAssignments - 1,
      0
    ),
    _count: classAssignment._count,
    insight: insightByClassAssignmentId.get(classAssignment.id) ?? null,
    hasSharedWork: classAssignment.documentGroups.length > 0,
  }));

  const teacherClasses = await prisma.class.findMany({
    where: {
      teachers: { some: { id: profile.id } },
      isArchived: false,
      id: { not: classId },
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { name: true } },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  // Growth plans are only ever created via Reporter, so skip the query
  // entirely for organizations that don't have it enabled.
  const growthPlans = reporterEnabled
    ? await prisma.reporterGrowthPlan.findMany({
        where: {
          organizationId: klass.school.organizationId,
          studentMembershipId: { in: klass.students.map((s) => s.id) },
        },
        select: {
          id: true,
          focus: true,
          targetSkills: true,
          body: true,
          checkInAt: true,
          status: true,
          createdAt: true,
          studentMembershipId: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const growthPlansByStudentId = growthPlans.reduce<
    Record<string, typeof growthPlans>
  >((acc, plan) => {
    (acc[plan.studentMembershipId] ??= []).push(plan);
    return acc;
  }, {});

  // Paste alerts, per student, for the student sheet on this page. One
  // query for the whole class (scoped to this class's enrolled students, so
  // it can't leak another teacher's data) rather than one per student.
  const pasteAlerts = klass.students.length
    ? await prisma.pasteAlert.findMany({
        where: { membershipId: { in: klass.students.map((s) => s.id) } },
        select: {
          id: true,
          documentId: true,
          membershipId: true,
          textLength: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const pasteAlertsByStudentId = buildPasteAlertsByStudentId(pasteAlerts);

  const creationTypeRows = availableAssignmentTypes.filter(
    (assignmentType) =>
      assignmentType.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
  );
  // One query for the list, so the creation sheet knows which types can offer
  // the teacher's grammar-grading toggle.
  const gradesGrammarIds = await getGrammarGradingAssignmentTypeIds(
    creationTypeRows.map((assignmentType) => assignmentType.id)
  );

  return dataResponse({
    role: 'TEACHER' as const,
    klass,
    submissions,
    inProgressDocuments,
    assignments,
    assignmentTypes: creationTypeRows.map(
      ({ id, title, collaborationSupported, kind }) => ({
        id,
        title,
        collaborationSupported,
        gradesGrammar: gradesGrammarIds.has(id),
        kind,
      })
    ),
    assignmentsEnabled: true,
    manageSchools: manageSchools?.schools ?? [],
    teacherClasses,
    classInsightsEnabled,
    reporterEnabled,
    growthPlansByStudentId,
    pasteAlertsByStudentId,
  });
}

type TabValue = 'students' | 'documents' | 'assignments';

type ClassDocumentSubmission = {
  id: string;
  title: string;
  submittedAt: Date | string | null;
  createdAt: Date | string;
  releasedAt: Date | string | null;
  score: string | null;
  feedback: string | null;
  rubricScores?: unknown | null;
  overallComment?: string | null;
  numericPercentage?: number | null;
  letterGrade?: string | null;
  gradedAt?: Date | string | null;
};

type ClassDocumentRow = {
  id: string;
  title: string | null;
  updatedAt: Date;
  membership: {
    id: string;
    user: { name: string | null; email: string };
  };
  group: TeacherDocumentWorkRow['group'];
  assignment: {
    id: string;
    title: string | null;
    submitForGrade?: boolean;
    pointValue?: number | null;
  } | null;
  submissions: ClassDocumentSubmission[];
  latestSubmission: ClassDocumentSubmission | null;
};

type SortDirection = 'asc' | 'desc';

type TeacherClassDetailData = Extract<
  ReturnType<typeof useLoaderData<typeof loader>>,
  { role: 'TEACHER' }
>;

export default function ClassDetailRoute() {
  const data = useLoaderData<typeof loader>();

  if (data.role === 'STUDENT') {
    return <StudentClassDetailView data={data} />;
  }

  return <ClassDetailPage data={data} />;
}

function ClassDetailPage({ data }: { data: TeacherClassDetailData }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const revalidator = useRevalidator();
  const studentFetcher = useFetcher();
  // Non-null when a nested detail route matches — either the assignment
  // detail route (app.my-classes.$classId.assignment.$assignmentId) or the
  // class summary route (app.my-classes.$classId.summary.$assignmentId).
  // Either way the teacher drilled into one assignment, and that region
  // swaps for the table/search bar in place, sliding in over the same
  // footprint.
  const assignmentDetailOutlet = useOutlet();
  const isAssignmentDetailActive = assignmentDetailOutlet != null;
  // Only the assignment-detail route forces the header's Assignments tab
  // active — the summary route is reached from Documents, so the header
  // should keep reflecting whichever tab got you here.
  const isSummaryRouteActive = location.pathname.includes('/summary/');
  // Tracks which way we just transitioned so the incoming panel (table or
  // detail) slides in from the correct side — right when opening an
  // assignment, left when returning to the table.
  const wasAssignmentDetailActive = useRef(isAssignmentDetailActive);
  const enteringAssignmentDetail =
    isAssignmentDetailActive && !wasAssignmentDetailActive.current;
  const leavingAssignmentDetail =
    !isAssignmentDetailActive && wasAssignmentDetailActive.current;
  useEffect(() => {
    wasAssignmentDetailActive.current = isAssignmentDetailActive;
  }, [isAssignmentDetailActive]);
  const [isClassEditSheetOpen, setIsClassEditSheetOpen] = useState(false);
  const [isAddStudentSheetOpen, setIsAddStudentSheetOpen] = useState(false);
  const [addStudentStep, setAddStudentStep] = useState<'email' | 'confirm'>(
    'email'
  );
  const [addStudentEmail, setAddStudentEmail] = useState('');
  const [addStudentConfirmAction, setAddStudentConfirmAction] = useState<
    'enroll' | 'invite' | 'already_enrolled' | null
  >(null);
  const [isMoveStudentsSheetOpen, setIsMoveStudentsSheetOpen] = useState(false);
  const [moveTargetClassId, setMoveTargetClassId] = useState('');
  const [collapsedDocumentGroups, setCollapsedDocumentGroups] = useState<
    Set<string>
  >(new Set());
  const [documentSort, setDocumentSort] = useState<DocumentWorkSort>(
    DEFAULT_DOCUMENT_WORK_SORT
  );
  const hasHydratedCollapsedDocumentGroups = useRef(false);
  const hasHydratedDocumentSort = useRef(false);
  const [isReleaseGradesSheetOpen, setIsReleaseGradesSheetOpen] =
    useState(false);
  const [isUnsubmitSheetOpen, setIsUnsubmitSheetOpen] = useState(false);
  const [studentNameSortDirection, setStudentNameSortDirection] =
    useState<SortDirection>('asc');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [releaseGradesForSheet, setReleaseGradesForSheet] = useState<
    ReleaseGradeRow[]
  >([]);
  const [unsubmitRowsForSheet, setUnsubmitRowsForSheet] = useState<
    TeacherUnsubmitRow[]
  >([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [growthPlanStudent, setGrowthPlanStudent] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const classDetailPath = `/app/my-classes/${data.klass.id}`;
  const classDetailSearch = searchParams.toString();
  const classDetailExitTo = classDetailSearch
    ? `${classDetailPath}?${classDetailSearch}`
    : classDetailPath;
  const editingClass: ClassManageRow = {
    id: data.klass.id,
    schoolId: data.klass.schoolId,
    schoolYear: data.klass.schoolYear,
    grade: data.klass.grade,
    period: data.klass.period,
    title: data.klass.title,
    code: data.klass.code,
  };

  const assignmentsEnabled = data.assignmentsEnabled === true;
  const classInsightsEnabled = data.classInsightsEnabled === true;
  const reporterEnabled = data.reporterEnabled === true;
  const validTabs: TabValue[] = assignmentsEnabled
    ? ['students', 'documents', 'assignments']
    : ['students', 'documents'];
  const requestedTab = searchParams.get('tab') as TabValue | null;
  const activeTab =
    requestedTab && validTabs.includes(requestedTab)
      ? requestedTab
      : 'students';
  const classAssignmentFilterParam =
    searchParams.get('classAssignmentId') ?? 'all';
  // When Documents is scoped to one assignment, link to that assignment's
  // class-wide performance summary.
  const selectedClassAssignment =
    classAssignmentFilterParam !== 'all'
      ? (data.assignments.find(
          (assignment) =>
            assignment.classAssignmentId === classAssignmentFilterParam
        ) ?? null)
      : null;
  const assignmentIdParam = searchParams.get('assignmentId');
  const studentIdParam = searchParams.get('studentId');
  const students = data.klass.students;
  const resolvedAssignmentFilterIds = useMemo(() => {
    if (classAssignmentFilterParam !== 'all') {
      const assignmentId = data.assignments.find(
        (assignment) =>
          assignment.classAssignmentId === classAssignmentFilterParam
      )?.id;
      return assignmentId ? [assignmentId] : [];
    }

    return parseDocumentWorkFilterIds(assignmentIdParam);
  }, [assignmentIdParam, classAssignmentFilterParam, data.assignments]);
  const validAssignmentIds = useMemo(
    () => new Set(data.assignments.map((assignment) => assignment.id)),
    [data.assignments]
  );
  const selectedAssignmentIds = useMemo(
    () =>
      resolvedAssignmentFilterIds.filter((assignmentId) =>
        validAssignmentIds.has(assignmentId)
      ),
    [resolvedAssignmentFilterIds, validAssignmentIds]
  );
  const documentFilterStudentIds = useMemo(
    () =>
      parseDocumentWorkFilterIds(studentIdParam).filter((studentId) =>
        students.some((student) => student.id === studentId)
      ),
    [studentIdParam, students]
  );
  const statusFilterParam = searchParams.get('status') ?? 'all';
  const statusFilter: TeacherDocumentStatus | 'all' =
    TEACHER_DOCUMENT_STATUSES.includes(
      statusFilterParam as TeacherDocumentStatus
    )
      ? (statusFilterParam as TeacherDocumentStatus)
      : 'all';
  const activeHeaderTab = resolveClassHeaderTab(activeTab);
  const documentGroupMode = parseDocumentGroupMode(
    searchParams.get('documentGroup')
  );
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });
  const hasHydratedDocumentPreferences = useRef(false);

  const allSubmissions = useMemo(() => data.submissions, [data.submissions]);
  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );

  // Reset pagination when tab changes
  useEffect(() => {
    hasHydratedDocumentPreferences.current = false;
    hasHydratedCollapsedDocumentGroups.current = false;
    hasHydratedDocumentSort.current = false;
  }, [data.klass.id]);

  useEffect(() => {
    if (activeTab !== 'documents' || hasHydratedDocumentPreferences.current) {
      return;
    }

    hasHydratedDocumentPreferences.current = true;

    if (
      searchParams.get('status') ||
      searchParams.get('documentGroup') ||
      searchParams.get('studentId') ||
      searchParams.get('assignmentId')
    ) {
      mergeClassDocumentsViewPreferences(searchParams);
    }

    const merged = mergeStoredClassDocumentsSearchParams({
      searchParams,
      storedPreferences: readClassDocumentsViewPreferences(),
    });

    if (!merged.shouldReplace) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    for (const [key, value] of merged.searchParams.entries()) {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }, [
    activeTab,
    assignmentIdParam,
    classAssignmentFilterParam,
    data.klass.id,
    searchParams,
    setSearchParams,
    studentIdParam,
  ]);

  useEffect(() => {
    setPagination({ skip: 0, take: 20 });
  }, [
    activeTab,
    studentNameSortDirection,
    studentSearchQuery,
    documentFilterStudentIds,
    selectedAssignmentIds,
    statusFilter,
    documentGroupMode,
    documentSort,
    searchParams.get('q'),
  ]);

  useEffect(() => {
    if (activeTab !== 'documents' || !hasHydratedDocumentPreferences.current) {
      return;
    }

    if (documentGroupMode === 'none') {
      setCollapsedDocumentGroups(new Set());
      return;
    }

    if (hasHydratedCollapsedDocumentGroups.current) {
      return;
    }

    hasHydratedCollapsedDocumentGroups.current = true;
    setCollapsedDocumentGroups(
      getStoredCollapsedDocumentGroups(
        readClassDocumentsViewPreferences(),
        documentGroupMode
      )
    );
  }, [activeTab, documentGroupMode]);

  useEffect(() => {
    if (
      activeTab !== 'documents' ||
      !hasHydratedDocumentPreferences.current ||
      hasHydratedDocumentSort.current
    ) {
      return;
    }

    hasHydratedDocumentSort.current = true;
    const storedSort = readClassDocumentsViewPreferences().documentSort;
    if (storedSort) {
      setDocumentSort(storedSort);
    }
  }, [activeTab, documentGroupMode]);

  const sortedStudents = useMemo(() => {
    const direction = studentNameSortDirection === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const aName = a.user.name || a.user.email;
      const bName = b.user.name || b.user.email;
      const primary = collator.compare(aName, bName);
      if (primary !== 0) return primary * direction;
      return collator.compare(a.user.email, b.user.email);
    });
  }, [collator, studentNameSortDirection, students]);

  const filteredStudents = useMemo(
    () => filterClassStudentsByQuery(sortedStudents, studentSearchQuery),
    [sortedStudents, studentSearchQuery]
  );

  // Graded counts per assignment, derived from the same submissions already
  // loaded for the Documents tab — no second query. Shared with the
  // assignment detail page so both read the same computation.
  const gradedCountByAssignmentId = useMemo(
    () => buildGradedCountByAssignmentId(allSubmissions),
    [allSubmissions]
  );

  const managedAssignments = useMemo(
    (): ClassAssignmentsTabAssignment[] =>
      data.assignments.map((assignment) => ({
        ...assignment,
        gradedCount: gradedCountByAssignmentId.get(assignment.id) ?? 0,
        documentCount: assignment._count.documents,
      })),
    [data.assignments, gradedCountByAssignmentId]
  );

  const classDocuments = useMemo((): ClassDocumentRow[] => {
    const byDocumentId = new Map<string, ClassDocumentRow>();

    for (const document of data.inProgressDocuments) {
      const subject = document.membership ?? {
        id: `group:${document.group?.id ?? document.id}`,
        user: {
          name: document.group?.label ?? 'Collaborative group',
          email: '',
        },
      };
      byDocumentId.set(document.id, {
        id: document.id,
        title: document.title,
        updatedAt: new Date(document.updatedAt),
        membership: subject,
        group: document.group,
        assignment: document.assignment,
        submissions: [],
        latestSubmission: null,
      });
    }

    for (const submission of allSubmissions) {
      const existing = byDocumentId.get(submission.documentId);
      const subject = submission.document.membership ?? {
        id: `group:${submission.document.group?.id ?? submission.documentId}`,
        user: {
          name: submission.document.group?.label ?? 'Collaborative group',
          email: '',
        },
      };
      const row: ClassDocumentRow = existing ?? {
        id: submission.documentId,
        title: submission.document.title,
        updatedAt: new Date(submission.submittedAt ?? submission.createdAt),
        membership: subject,
        group: submission.document.group,
        assignment: submission.document.assignment,
        submissions: [],
        latestSubmission: null,
      };

      row.submissions.push(submission);
      const submissionUpdatedAt = new Date(
        submission.submittedAt ?? submission.createdAt
      );
      if (submissionUpdatedAt > row.updatedAt) {
        row.updatedAt = submissionUpdatedAt;
      }

      byDocumentId.set(submission.documentId, row);
    }

    for (const row of byDocumentId.values()) {
      row.submissions.sort(
        (a, b) =>
          new Date(b.submittedAt ?? b.createdAt).getTime() -
          new Date(a.submittedAt ?? a.createdAt).getTime()
      );
      row.latestSubmission = row.submissions[0] ?? null;
    }

    return Array.from(byDocumentId.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }, [allSubmissions, data.inProgressDocuments]);

  const teacherDocumentWorkRows = useMemo((): TeacherDocumentWorkRow[] => {
    return classDocuments.map((document) => ({
      ...document,
      resolvedClass: {
        id: data.klass.id,
        grade: data.klass.grade,
        period: data.klass.period,
        title: data.klass.title,
      },
      submissionCount: document.submissions.length,
    }));
  }, [classDocuments, data.klass]);

  const selectedDocuments = useMemo(() => {
    const selected = new Set(selectedDocumentIds);
    return teacherDocumentWorkRows.filter((document) =>
      selected.has(document.id)
    );
  }, [selectedDocumentIds, teacherDocumentWorkRows]);

  const releaseRowsForLegacyDeepLink = useMemo(() => {
    const rows =
      selectedAssignmentIds.length === 0
        ? teacherDocumentWorkRows
        : teacherDocumentWorkRows.filter((document) =>
            document.assignment?.id
              ? selectedAssignmentIds.includes(document.assignment.id)
              : false
          );

    return buildReleaseGradeRows(rows);
  }, [selectedAssignmentIds, teacherDocumentWorkRows]);

  useEffect(() => {
    const currentDocumentIds = new Set(
      teacherDocumentWorkRows.map((document) => document.id)
    );
    setSelectedDocumentIds((current) =>
      current.filter((documentId) => currentDocumentIds.has(documentId))
    );
  }, [teacherDocumentWorkRows]);

  const unreleasedGrades = useMemo(
    () => buildReleaseGradeRows(selectedDocuments),
    [selectedDocuments]
  );

  const unsubmitRows = useMemo(
    () => buildTeacherUnsubmitRows(selectedDocuments),
    [selectedDocuments]
  );

  // Handle URL param for to-release action (legacy deep link)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'to-release') {
      if (releaseRowsForLegacyDeepLink.length > 0) {
        setReleaseGradesForSheet(releaseRowsForLegacyDeepLink);
        setIsReleaseGradesSheetOpen(true);
        const next = new URLSearchParams(searchParams);
        next.set('tab', 'documents');
        navigate(`?${next.toString()}`, { replace: true });
      }
    }
  }, [searchParams, navigate, releaseRowsForLegacyDeepLink]);

  // Handle successful release
  const handleGradingSuccess = () => {
    setReleaseGradesForSheet([]);
    setSelectedDocumentIds([]);
    window.location.reload();
  };

  const openReleaseSheet = () => {
    if (unreleasedGrades.length === 0) return;
    setReleaseGradesForSheet(unreleasedGrades);
    setIsReleaseGradesSheetOpen(true);
  };

  const openUnsubmitSheet = () => {
    if (unsubmitRows.length === 0) return;
    setUnsubmitRowsForSheet(unsubmitRows);
    setIsUnsubmitSheetOpen(true);
  };

  const handleUnsubmitSuccess = () => {
    setUnsubmitRowsForSheet([]);
    setSelectedDocumentIds([]);
    window.location.reload();
  };

  const documentWorkStatusCounts = useMemo(
    () => countTeacherDocumentWorkStatuses(teacherDocumentWorkRows),
    [teacherDocumentWorkRows]
  );

  const documentWorkFilters = useMemo(
    (): TeacherDocumentWorkFilters => ({
      studentIds: documentFilterStudentIds,
      classIds: [],
      assignmentIds: selectedAssignmentIds,
      status: statusFilter,
      group: documentGroupMode,
      query: searchParams.get('q') ?? '',
    }),
    [
      documentGroupMode,
      searchParams,
      selectedAssignmentIds,
      documentFilterStudentIds,
      statusFilter,
    ]
  );

  const {
    selected: selectedStudentIds,
    setSelected: setSelectedStudentIds,
    handleSelectAll: handleSelectAllStudents,
    handleSelect: handleSelectStudent,
  } = useTable({ rows: filteredStudents });

  const handleAddStudentSheetOpenChange = (open: boolean) => {
    setIsAddStudentSheetOpen(open);
    if (!open) {
      setAddStudentStep('email');
      setAddStudentEmail('');
      setAddStudentConfirmAction(null);
    }
  };

  useEffect(() => {
    if (studentFetcher.state !== 'idle' || !studentFetcher.data) {
      return;
    }

    if (addStudentStep !== 'email') {
      if ('success' in studentFetcher.data && studentFetcher.data.success) {
        setSelectedStudentIds([]);
        setIsAddStudentSheetOpen(false);
        setAddStudentStep('email');
        setAddStudentEmail('');
        setAddStudentConfirmAction(null);
        setIsMoveStudentsSheetOpen(false);
        setMoveTargetClassId('');
        revalidator.revalidate();
      }
      return;
    }

    if (
      'needsInvite' in studentFetcher.data &&
      studentFetcher.data.needsInvite
    ) {
      setAddStudentEmail(studentFetcher.data.email);
      setAddStudentConfirmAction('invite');
      setAddStudentStep('confirm');
      return;
    }

    if ('hasAccount' in studentFetcher.data && studentFetcher.data.hasAccount) {
      setAddStudentEmail(studentFetcher.data.email);
      setAddStudentConfirmAction('enroll');
      setAddStudentStep('confirm');
      return;
    }

    if (
      'alreadyEnrolled' in studentFetcher.data &&
      studentFetcher.data.alreadyEnrolled
    ) {
      setAddStudentEmail(studentFetcher.data.email);
      setAddStudentConfirmAction('already_enrolled');
      setAddStudentStep('confirm');
    }
  }, [
    addStudentStep,
    studentFetcher.state,
    studentFetcher.data,
    revalidator,
    setSelectedStudentIds,
  ]);

  // Get current tab data and paginate it
  const currentTabData = useMemo(() => {
    if (activeTab === 'students') {
      return filteredStudents;
    }

    return [];
  }, [activeTab, filteredStudents]) as any[];

  const paginatedData = useMemo(() => {
    return currentTabData.slice(
      pagination.skip,
      pagination.skip + pagination.take
    );
  }, [currentTabData, pagination.skip, pagination.take]) as any[];

  const persistDocumentViewPreferences = (next: URLSearchParams) => {
    mergeClassDocumentsViewPreferences(next);
  };

  const persistCollapsedDocumentGroups = (collapsedGroupKeys: Set<string>) => {
    if (documentGroupMode === 'none') return;

    mergeClassDocumentsViewPreferences(searchParams, {
      collapsedGroups: withStoredCollapsedDocumentGroups(
        readClassDocumentsViewPreferences(),
        documentGroupMode,
        collapsedGroupKeys
      ).collapsedGroups,
    });
  };

  const handleDocumentSortChange = (next: DocumentWorkSort) => {
    setDocumentSort(next);
    mergeClassDocumentsViewPreferences(searchParams, { documentSort: next });
  };

  const navigateWithDocumentPreferences = (next: URLSearchParams) => {
    persistDocumentViewPreferences(next);
    navigate(`?${next.toString()}`);
  };

  const handleHeaderTabChange = (tab: ClassHeaderTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);

    if (tab === 'students' || tab === 'assignments') {
      next.delete('status');
      navigate(`?${next.toString()}`);
      return;
    }

    navigateWithDocumentPreferences(next);
  };

  const handleViewStudentDocuments = (profileId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'documents');
    next.set('studentId', profileId);
    navigateWithDocumentPreferences(next);
  };

  const handleViewAssignmentDocuments = (assignmentId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'documents');
    next.set('assignmentId', assignmentId);
    next.delete('classAssignmentId');
    navigateWithDocumentPreferences(next);
  };

  const handleDocumentWorkFiltersChange = (
    updates: Partial<TeacherDocumentWorkFilters>
  ) => {
    const next = new URLSearchParams(searchParams);

    if ('studentIds' in updates) {
      const serialized = serializeDocumentWorkFilterIds(
        updates.studentIds ?? []
      );
      if (!serialized) {
        next.delete('studentId');
      } else {
        next.set('studentId', serialized);
      }
    }

    if ('assignmentIds' in updates) {
      const serialized = serializeDocumentWorkFilterIds(
        updates.assignmentIds ?? []
      );
      if (!serialized) {
        next.delete('assignmentId');
        next.delete('classAssignmentId');
      } else {
        next.set('assignmentId', serialized);
        next.delete('classAssignmentId');
      }
    }

    if ('status' in updates) {
      if (!updates.status || updates.status === 'all') {
        next.delete('status');
      } else {
        next.set('status', updates.status);
      }
    }

    if ('group' in updates) {
      if (!updates.group || updates.group === 'none') {
        next.delete('documentGroup');
      } else {
        next.set('documentGroup', updates.group);
      }
    }

    if ('query' in updates) {
      if (!updates.query?.trim()) {
        next.delete('q');
      } else {
        next.set('q', updates.query.trim());
      }
    }

    navigateWithDocumentPreferences(next);
  };

  const toggleStudentNameSort = () => {
    setStudentNameSortDirection((current) =>
      current === 'asc' ? 'desc' : 'asc'
    );
  };

  const handlePaginationChange = (skip: number, take: number) => {
    setPagination({ skip, take });
  };

  // Render table based on active tab
  const renderTable = () => {
    if (activeTab === 'documents') {
      return (
        <TeacherDocumentWorkPanel
          tableLabel="Class documents"
          documents={teacherDocumentWorkRows}
          statusCounts={documentWorkStatusCounts}
          students={sortedStudents.map((student) => ({
            id: student.id,
            label: student.user.name || student.user.email,
          }))}
          assignments={data.assignments.map((assignment) => ({
            id: assignment.id,
            label: assignment.title ?? 'Untitled assignment',
          }))}
          assignmentsEnabled={assignmentsEnabled}
          exitTo={classDetailExitTo}
          filters={documentWorkFilters}
          onFiltersChange={handleDocumentWorkFiltersChange}
          onClearFilters={() => {
            const next = new URLSearchParams(searchParams);
            next.delete('studentId');
            next.delete('assignmentId');
            next.delete('status');
            next.delete('q');
            navigateWithDocumentPreferences(next);
          }}
          collapsedGroups={collapsedDocumentGroups}
          onCollapsedGroupsChange={(next, options) => {
            setCollapsedDocumentGroups(next);
            if (options?.persist === false) return;
            persistCollapsedDocumentGroups(next);
          }}
          pagination={{
            skip: pagination.skip,
            take: pagination.take,
            onChange: handlePaginationChange,
          }}
          actions={[
            {
              id: 'release-grades',
              label: 'Release grades',
              count:
                unreleasedGrades.length > 0
                  ? unreleasedGrades.length
                  : undefined,
              disabled: unreleasedGrades.length === 0,
              onSelect: openReleaseSheet,
            },
            {
              id: 'unsubmit',
              label: 'Unsubmit',
              count: unsubmitRows.length > 0 ? unsubmitRows.length : undefined,
              disabled: unsubmitRows.length === 0,
              onSelect: openUnsubmitSheet,
            },
          ]}
          selection={{
            selectedDocumentIds,
            onSelectedDocumentIdsChange: setSelectedDocumentIds,
          }}
          emptyMessageSecondary="Student documents will appear here once work begins"
          testIds={{
            statusChips: 'class-documents-status-chips',
            groupSelect: 'class-documents-group-filter',
          }}
          collapseAllGroupsWhenGroupChanges
          clickableRows
          compactRows
          sort={documentSort}
          onSortChange={handleDocumentSortChange}
        />
      );
    }

    if (activeTab === 'assignments') {
      return (
        <ClassAssignmentsTab
          classOption={{
            id: data.klass.id,
            name: classAssignmentOptionLabel(data.klass),
          }}
          assignments={managedAssignments}
          assignmentTypes={data.assignmentTypes}
          classInsightsEnabled={classInsightsEnabled}
          onViewDocuments={handleViewAssignmentDocuments}
          onSelectAssignment={(assignmentId) =>
            navigate(
              `/app/assignments/${assignmentId}?classId=${data.klass.id}`
            )
          }
        />
      );
    }

    if (activeTab === 'students') {
      const studentIsLoading = studentFetcher.state !== 'idle';

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-0 w-full max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="class-students-search"
                value={studentSearchQuery}
                onChange={(event) => setStudentSearchQuery(event.target.value)}
                placeholder="Search students"
                className="h-9 rounded-md border-0 bg-background pl-9 shadow-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Search students"
                data-testid="class-students-search"
              />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {selectedStudentIds.length > 0 && (
                <>
                  <studentFetcher.Form method="post" className="inline">
                    <input
                      type="hidden"
                      name="intent"
                      value="remove-students"
                    />
                    {selectedStudentIds.map((id) => (
                      <input
                        key={id}
                        type="hidden"
                        name="studentProfileIds"
                        value={id}
                      />
                    ))}
                    <Tooltip
                      text={`Remove from class (${selectedStudentIds.length})`}
                    >
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="outline"
                        disabled={studentIsLoading}
                        aria-label={`Remove ${selectedStudentIds.length} student(s) from this class`}
                        onClick={(e) => {
                          if (
                            !confirm(
                              `Remove ${selectedStudentIds.length} student(s) from this class? Their accounts and work are not deleted.`
                            )
                          ) {
                            e.preventDefault();
                            return;
                          }
                          setSelectedStudentIds([]);
                        }}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </studentFetcher.Form>
                  <Tooltip
                    text={`Move to another class (${selectedStudentIds.length})`}
                  >
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={
                        studentIsLoading || data.teacherClasses.length === 0
                      }
                      aria-label={`Move ${selectedStudentIds.length} student(s) to another class`}
                      onClick={() => {
                        setMoveTargetClassId(data.teacherClasses[0]?.id ?? '');
                        setIsMoveStudentsSheetOpen(true);
                      }}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </>
              )}
              <Button
                size="sm"
                type="button"
                onClick={() => setIsAddStudentSheetOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Student
              </Button>
            </div>
          </div>

          <Sheet
            open={isAddStudentSheetOpen}
            onOpenChange={handleAddStudentSheetOpenChange}
          >
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Add Student by Email</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {addStudentStep === 'email'
                    ? 'Enter a student email to add them to this class.'
                    : 'Review the next step before continuing.'}
                </p>
              </SheetHeader>
              {addStudentStep === 'email' ? (
                <studentFetcher.Form method="post" className="mt-4 space-y-4">
                  <input
                    type="hidden"
                    name="intent"
                    value="lookup-student-email"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="add-student-email">Email</Label>
                    <Input
                      id="add-student-email"
                      data-testid="add-student-email-input"
                      name="email"
                      type="email"
                      required
                      autoComplete="off"
                      value={addStudentEmail}
                      onChange={(event) =>
                        setAddStudentEmail(event.target.value)
                      }
                    />
                  </div>
                  {studentFetcher.data &&
                    'error' in studentFetcher.data &&
                    studentFetcher.data.error && (
                      <p className="text-sm text-red-600">
                        {studentFetcher.data.error}
                      </p>
                    )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={studentIsLoading}
                    data-testid="add-student-next-button"
                  >
                    {studentIsLoading ? 'Checking...' : 'Next'}
                  </Button>
                </studentFetcher.Form>
              ) : (
                <studentFetcher.Form method="post" className="mt-4 space-y-4">
                  <input
                    type="hidden"
                    name="intent"
                    value={
                      addStudentConfirmAction === 'enroll'
                        ? 'enroll-student'
                        : 'invite-student'
                    }
                  />
                  <input type="hidden" name="email" value={addStudentEmail} />
                  <p
                    className="text-sm"
                    data-testid="add-student-confirm-message"
                  >
                    {addStudentConfirmAction === 'enroll'
                      ? 'They have an account in the system. Are you ready to add them to the class?'
                      : addStudentConfirmAction === 'invite'
                        ? "They don't have an account in the system. Should I send them an invite?"
                        : (studentFetcher.data &&
                            'message' in studentFetcher.data &&
                            studentFetcher.data.message) ||
                          'This student is already in this class.'}
                  </p>
                  <p className="rounded-md border bg-muted/40 p-3 text-sm">
                    {addStudentEmail}
                  </p>
                  {studentFetcher.data &&
                    'error' in studentFetcher.data &&
                    studentFetcher.data.error && (
                      <p className="text-sm text-red-600">
                        {studentFetcher.data.error}
                      </p>
                    )}
                  {addStudentConfirmAction !== 'already_enrolled' && (
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={studentIsLoading}
                      data-testid="add-student-confirm-button"
                    >
                      {studentIsLoading
                        ? addStudentConfirmAction === 'enroll'
                          ? 'Adding...'
                          : 'Sending invite...'
                        : 'Confirm'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setAddStudentStep('email');
                      setAddStudentConfirmAction(null);
                    }}
                    disabled={studentIsLoading}
                  >
                    Back
                  </Button>
                </studentFetcher.Form>
              )}
            </SheetContent>
          </Sheet>

          <Sheet
            open={isMoveStudentsSheetOpen}
            onOpenChange={setIsMoveStudentsSheetOpen}
          >
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Move Students</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  Changes which class these student profiles belong to. Accounts
                  and work are not deleted.
                </p>
              </SheetHeader>
              <studentFetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="move-students" />
                {selectedStudentIds.map((id) => (
                  <input
                    key={id}
                    type="hidden"
                    name="studentProfileIds"
                    value={id}
                  />
                ))}
                <div className="space-y-2">
                  <Label htmlFor="move-target-class">Target class</Label>
                  <select
                    id="move-target-class"
                    name="targetClassId"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={moveTargetClassId}
                    onChange={(e) => setMoveTargetClassId(e.target.value)}
                    required
                  >
                    {data.teacherClasses.map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {klass.school.name} —{' '}
                        {formatClassLabel({
                          grade: klass.grade,
                          period: klass.period,
                          title: klass.title,
                        })}
                      </option>
                    ))}
                  </select>
                </div>
                {studentFetcher.data &&
                  'error' in studentFetcher.data &&
                  studentFetcher.data.error && (
                    <p className="text-sm text-red-600">
                      {studentFetcher.data.error}
                    </p>
                  )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={studentIsLoading || !moveTargetClassId}
                >
                  {studentIsLoading
                    ? 'Moving...'
                    : `Move ${selectedStudentIds.length} student(s)`}
                </Button>
              </studentFetcher.Form>
            </SheetContent>
          </Sheet>

          {sortedStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed bg-muted/50 p-12 rounded-lg">
              <span className="text-lg font-bold">No students yet</span>
              <span className="text-sm text-muted-foreground">
                Add students to this class to get started
              </span>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed bg-muted/50 p-12 rounded-lg">
              <span className="text-lg font-bold">No students found</span>
              <span className="text-sm text-muted-foreground">
                Try a different search term
              </span>
            </div>
          ) : (
            <div
              className={cn(
                'rounded-lg bg-muted/50',
                studentIsLoading ? 'opacity-50 transition-opacity' : ''
              )}
            >
              <Table aria-label="Students">
                <TableHeader className="rounded-t-lg">
                  <TableRow className="bg-muted/50 rounded-t-lg">
                    <TableHead className="w-[50px] pl-4 rounded-tl-lg">
                      <Checkbox
                        checked={
                          filteredStudents.length > 0 &&
                          selectedStudentIds.length === filteredStudents.length
                        }
                        onCheckedChange={handleSelectAllStudents}
                      />
                    </TableHead>
                    <TableHead>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 gap-2 px-2"
                        aria-label={`Sort students by name ${
                          studentNameSortDirection === 'asc'
                            ? 'descending'
                            : 'ascending'
                        }`}
                        onClick={toggleStudentNameSort}
                      >
                        Student Name
                        {studentNameSortDirection === 'asc' ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap pr-4">
                      Documents
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((s) => {
                    const studentDocumentCount =
                      data.inProgressDocuments.filter(
                        (doc) =>
                          doc.membership?.id === s.id ||
                          doc.group?.members.some(
                            (member) => member.membershipId === s.id
                          )
                      ).length +
                      new Set(
                        allSubmissions
                          .filter(
                            (sub) =>
                              sub.document.membership?.id === s.id ||
                              sub.document.group?.members.some(
                                (member) => member.membershipId === s.id
                              )
                          )
                          .map((sub) => sub.documentId)
                      ).size;

                    const pasteActivity = summarizeStudentPasteActivity(
                      data.pasteAlertsByStudentId[s.id]
                    );
                    const studentSheetAvailable =
                      reporterEnabled || pasteActivity !== null;

                    return (
                      <TableRow
                        key={s.id}
                        className={cn(
                          studentSheetAvailable && 'cursor-pointer'
                        )}
                        onClick={() => {
                          if (!studentSheetAvailable) return;
                          setGrowthPlanStudent({
                            id: s.id,
                            name: s.user.name ?? s.user.email,
                            email: s.user.email,
                          });
                        }}
                      >
                        <TableCell
                          className="max-h-[37px] pl-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedStudentIds.includes(s.id)}
                            onCheckedChange={() => handleSelectStudent(s.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.user.name ?? 'Unnamed Student'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.user.email}
                        </TableCell>
                        <TableCell className="pr-4">
                          <button
                            type="button"
                            className={cn(
                              badgeVariants({ variant: 'secondary' }),
                              'cursor-pointer gap-1 py-1 pl-2 pr-1'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewStudentDocuments(s.id);
                            }}
                            aria-label={`View ${s.user.name ?? s.user.email}'s documents`}
                          >
                            {studentDocumentCount}{' '}
                            {studentDocumentCount === 1 ? 'doc' : 'docs'}
                            <ChevronRight
                              className="size-3 shrink-0"
                              aria-hidden="true"
                            />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-screen-xl px-3 py-3 pb-24 sm:px-5">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/my-classes" className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to my classes
            </Link>
          </Button>
        </div>

        <ClassDetailHeader
          klass={{
            id: data.klass.id,
            grade: data.klass.grade,
            period: data.klass.period,
            title: data.klass.title,
            school: data.klass.school,
            schoolYear: data.klass.schoolYear,
            code: data.klass.code,
            classArtKey: data.klass.classArtKey ?? null,
            legacyClassArtIndex: data.klass.classArtIndex ?? null,
          }}
          studentCount={students.length}
          documentCount={classDocuments.length}
          assignmentCount={data.assignments.length}
          showAssignmentsTab={assignmentsEnabled}
          activeTab={
            isAssignmentDetailActive && !isSummaryRouteActive
              ? 'assignments'
              : activeHeaderTab
          }
          onTabChange={handleHeaderTabChange}
          onEdit={() => setIsClassEditSheetOpen(true)}
        />

        {isAssignmentDetailActive ? (
          <div
            key="assignment-detail"
            data-testid="assignment-detail-panel"
            className={cn(
              'motion-reduce:animate-none',
              'animate-in fade-in-0 duration-300',
              enteringAssignmentDetail && 'slide-in-from-right-8'
            )}
          >
            {assignmentDetailOutlet}
          </div>
        ) : (
          <div
            key={activeHeaderTab}
            data-testid="class-detail-table-panel"
            className={cn(
              'motion-reduce:animate-none',
              'animate-in fade-in-0 duration-300',
              leavingAssignmentDetail
                ? 'slide-in-from-left-8'
                : 'slide-in-from-right-2'
            )}
          >
            {activeTab === 'documents' &&
            classInsightsEnabled &&
            selectedClassAssignment ? (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground">
                  See how the whole class did on{' '}
                  <span className="font-medium text-foreground">
                    {selectedClassAssignment.title ?? 'this assignment'}
                  </span>
                  .
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={`/app/my-classes/${data.klass.id}/summary/${selectedClassAssignment.id}?${searchParams.toString()}`}
                  >
                    Class performance summary
                  </Link>
                </Button>
              </div>
            ) : null}
            <div>{renderTable()}</div>
            {activeTab === 'students' && currentTabData.length > 0 ? (
              <div className="mt-4">
                <Pagination
                  totalCount={currentTabData.length}
                  skip={pagination.skip}
                  take={pagination.take}
                  onChange={handlePaginationChange}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ClassManageSheet
        open={isClassEditSheetOpen}
        onOpenChange={setIsClassEditSheetOpen}
        editingClass={editingClass}
        schools={data.manageSchools}
        onSuccess={() => revalidator.revalidate()}
      />

      <ReleaseGradesSheet
        grades={releaseGradesForSheet}
        isOpen={isReleaseGradesSheetOpen}
        onClose={() => setIsReleaseGradesSheetOpen(false)}
        onSuccess={handleGradingSuccess}
      />

      <UnsubmitSubmissionsSheet
        submissions={unsubmitRowsForSheet}
        isOpen={isUnsubmitSheetOpen}
        onClose={() => setIsUnsubmitSheetOpen(false)}
        onSuccess={handleUnsubmitSuccess}
      />

      <StudentGrowthPlansSheet
        open={growthPlanStudent !== null}
        onOpenChange={(open) => {
          if (!open) setGrowthPlanStudent(null);
        }}
        student={growthPlanStudent}
        growthPlans={
          growthPlanStudent
            ? ((data.growthPlansByStudentId[growthPlanStudent.id] ??
                []) as unknown as StudentGrowthPlan[])
            : []
        }
        onViewDocuments={() => {
          if (!growthPlanStudent) return;
          const studentId = growthPlanStudent.id;
          setGrowthPlanStudent(null);
          handleViewStudentDocuments(studentId);
        }}
        pasteAlerts={
          growthPlanStudent
            ? (data.pasteAlertsByStudentId[growthPlanStudent.id] ?? [])
            : []
        }
        pasteAlertsExitTo={classDetailExitTo}
        showGrowthPlans={reporterEnabled}
      />
    </section>
  );
}
