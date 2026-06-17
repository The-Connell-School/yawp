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
  useNavigate,
  useRevalidator,
} from 'react-router';
import { Link } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { parseAssignmentGradingIntent } from '~/utils/assignment-grading-intent.server';
import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  createAssignmentDeployedToClasses,
  deleteClassAssignmentDeployment,
} from '~/utils/assignment-deployment.server';
import {
  isAssignmentCreationStandardizationEnabledForContext,
  isAssignmentsEnabledForContext,
  isDocumentSubmissionEnabledForScope,
} from '~/utils/feature-flags.server';
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
  ClassDetailHeader,
  type ClassHeaderTab,
  resolveClassHeaderTab,
} from './class-detail-header';
import {
  TEACHER_DOCUMENT_STATUSES,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  buildReleaseGradeRows,
  countTeacherDocumentWorkStatuses,
  type ReleaseGradeRow,
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
import { filterClassStudentsByQuery } from './class-students-search';

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
  }>({
    scopes: [
      {
        organizationId: classAccess.school.organizationId,
        schoolId: classAccess.school.id,
        teacherProfileId: profile.id,
      },
    ],
    select: { id: true, systemKey: true },
  });
  const allowedAssignmentTypeIds = new Set(
    allowedAssignmentTypes
      .filter((type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY)
      .map((type) => type.id)
  );

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  if (
    intent === 'delete-assignment' ||
    intent === 'create-assignment' ||
    intent === 'update-assignment'
  ) {
    const assignmentsEnabled = await isAssignmentsEnabledForContext({
      organizationId: classAccess.school.organizationId,
      schoolId: classAccess.school.id,
      teacherProfileId: profile.id,
      classIds: [classAccess.id],
    });
    if (!assignmentsEnabled) {
      return dataResponse(
        {
          success: false,
          message: 'Assignments are not enabled for your organization.',
        },
        { status: 403 }
      );
    }
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

    await deleteClassAssignmentDeployment({ assignmentId, classId });

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
    const tutorContextRaw = formData.get('tutorContext')?.toString() ?? '';

    const title = titleRaw.trim() || null;
    const prompt = promptRaw.trim();
    const legacyTutorContext = tutorContextRaw.trim() || null;

    if (!assignmentTypeId) {
      return dataResponse(
        { success: false, message: 'Assignment type is required.' },
        { status: 400 }
      );
    }
    let existingAssignment: {
      id: string;
      assignmentTypeId: string;
      assignmentType: { systemKey: string | null };
      tutorContext: string | null;
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
          assignmentType: { select: { systemKey: true } },
          tutorContext: true,
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
    if (!prompt) {
      return dataResponse(
        { success: false, message: 'Prompt is required.' },
        { status: 400 }
      );
    }

    const assignmentCreationStandardizationEnabled =
      await isAssignmentCreationStandardizationEnabledForContext({
        organizationId: classAccess.school.organizationId,
        schoolId: classAccess.school.id,
        teacherProfileId: profile.id,
        classIds: [classId],
      });

    const gradingIntent = assignmentCreationStandardizationEnabled
      ? parseAssignmentGradingIntent(formData)
      : null;
    if (gradingIntent && !gradingIntent.success) {
      return dataResponse(
        { success: false, message: gradingIntent.message },
        { status: 400 }
      );
    }

    if (intent === 'create-assignment') {
      await createAssignmentDeployedToClasses({
        data: {
          assignmentTypeId,
          title,
          prompt,
          tutorContext: assignmentCreationStandardizationEnabled
            ? null
            : legacyTutorContext,
          ...(gradingIntent?.success
            ? {
                submitForGrade: gradingIntent.data.submitForGrade,
                pointValue: gradingIntent.data.pointValue,
              }
            : {}),
        },
        classIds: [classId],
      });

      return dataResponse({
        success: true,
        message: 'Assignment created successfully.',
      });
    }

    await prisma.assignment.update({
      where: { id: existingAssignment!.id },
      data: {
        assignmentTypeId,
        title,
        prompt,
        tutorContext: assignmentCreationStandardizationEnabled
          ? existingAssignment!.tutorContext
          : legacyTutorContext,
        ...(gradingIntent?.success
          ? {
              submitForGrade: gradingIntent.data.submitForGrade,
              pointValue: gradingIntent.data.pointValue,
            }
          : {}),
      },
    });

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

    for (const student of students) {
      await prisma.orgMembership.update({
        where: { id: student.id },
        data: { classesAsStudent: { disconnect: { id: classId } } },
      });
    }

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

    for (const student of students) {
      await prisma.orgMembership.update({
        where: { id: student.id },
        data: {
          classesAsStudent: {
            disconnect: { id: classId },
            connect: { id: targetClassId },
          },
        },
      });
    }

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
  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }
  const classId = params.classId!;

  // Assignment management moved to the teacher-level Assignments surface.
  if (new URL(request.url).searchParams.get('tab') === 'assignments') {
    return redirect('/app/assignments');
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
        school: { select: { id: true, name: true, organizationId: true } },
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

  const legacyClassDocumentIds = (
    await prisma.documentClassForensic.findMany({
      where: { oldClassId: classId },
      select: { documentId: true },
    })
  ).map((row) => row.documentId);

  const url = new URL(request.url);
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

  // Check feature flags
  const [isDocumentSubmissionEnabled, assignmentsEnabled] = await Promise.all([
    isDocumentSubmissionEnabledForScope({
      schoolIds: [klass.school?.id],
      organizationIds: [klass.school?.organizationId],
      teacherProfileIds: [profile.id],
      classIds: [klass.id],
    }),
    isAssignmentsEnabledForContext({
      organizationId: klass.school?.organizationId,
      schoolId: klass.school?.id,
      teacherProfileId: profile.id,
      classIds: [klass.id],
    }),
  ]);

  // Get all submissions for this class
  const submissions = await prisma.submission.findMany({
    where: {
      document: {
        is: {
          ...classDocumentScope,
          deletedAt: null,
        },
      },
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
      assignmentModuleSessions: studentModuleSessionSingleSelect,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  const classAssignments = await prisma.classAssignment.findMany({
    where: { classId },
    select: {
      id: true,
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          tutorContext: true,
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
        },
      },
      _count: {
        select: {
          documents: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const assignments = classAssignments.map((classAssignment) => ({
    id: classAssignment.assignment.id,
    classAssignmentId: classAssignment.id,
    title: classAssignment.assignment.title,
    prompt: classAssignment.assignment.prompt,
    tutorContext: classAssignment.assignment.tutorContext,
    submitForGrade: classAssignment.assignment.submitForGrade,
    pointValue: classAssignment.assignment.pointValue,
    assignmentTypeId: classAssignment.assignment.assignmentTypeId,
    assignmentType: classAssignment.assignment.assignmentType,
    _count: classAssignment._count,
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

  return dataResponse({
    klass,
    submissions,
    inProgressDocuments,
    assignments,
    assignmentsEnabled,
    isDocumentSubmissionEnabled,
    manageSchools: manageSchools?.schools ?? [],
    teacherClasses,
  });
}

type TabValue = 'students' | 'documents';

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

export default function ClassDetailRoute() {
  return <ClassDetailPage />;
}

function ClassDetailPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const studentFetcher = useFetcher();
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
  const [studentNameSortDirection, setStudentNameSortDirection] =
    useState<SortDirection>('asc');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [releaseGradesForSheet, setReleaseGradesForSheet] = useState<
    ReleaseGradeRow[]
  >([]);
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
  const validTabs: TabValue[] = ['students', 'documents'];
  const requestedTab = searchParams.get('tab') as TabValue | null;
  const activeTab =
    requestedTab && validTabs.includes(requestedTab)
      ? requestedTab
      : 'students';
  const classAssignmentFilterParam =
    searchParams.get('classAssignmentId') ?? 'all';
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

  const classDocuments = useMemo((): ClassDocumentRow[] => {
    const byDocumentId = new Map<string, ClassDocumentRow>();

    for (const document of data.inProgressDocuments) {
      byDocumentId.set(document.id, {
        id: document.id,
        title: document.title,
        updatedAt: new Date(document.updatedAt),
        membership: document.membership,
        assignment: document.assignment,
        submissions: [],
        latestSubmission: null,
      });
    }

    for (const submission of allSubmissions) {
      const existing = byDocumentId.get(submission.documentId);
      const row: ClassDocumentRow = existing ?? {
        id: submission.documentId,
        title: submission.document.title,
        updatedAt: new Date(submission.submittedAt ?? submission.createdAt),
        membership: submission.document.membership,
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

  const unreleasedGrades = useMemo(() => {
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

  // Handle URL param for to-release action (legacy deep link)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'to-release') {
      if (unreleasedGrades.length > 0) {
        setReleaseGradesForSheet(unreleasedGrades);
        setIsReleaseGradesSheetOpen(true);
        const next = new URLSearchParams(searchParams);
        next.set('tab', 'documents');
        navigate(`?${next.toString()}`, { replace: true });
      }
    }
  }, [searchParams, navigate, unreleasedGrades]);

  // Handle successful release
  const handleGradingSuccess = () => {
    setReleaseGradesForSheet([]);
    window.location.reload();
  };

  const openReleaseSheet = () => {
    if (unreleasedGrades.length === 0) return;
    setReleaseGradesForSheet(unreleasedGrades);
    setIsReleaseGradesSheetOpen(true);
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

    if (tab === 'students') {
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
          isDocumentSubmissionEnabled={data.isDocumentSubmissionEnabled}
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
              disabled:
                !data.isDocumentSubmissionEnabled ||
                unreleasedGrades.length === 0,
              onSelect: openReleaseSheet,
            },
          ]}
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
                        {klass.school.name} — Grade {klass.grade}, Period{' '}
                        {klass.period}
                        {klass.title ? ` — ${klass.title}` : ''}
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
                        (doc) => doc.membership.id === s.id
                      ).length +
                      new Set(
                        allSubmissions
                          .filter((sub) => sub.document.membership.id === s.id)
                          .map((sub) => sub.documentId)
                      ).size;

                    return (
                      <TableRow key={s.id}>
                        <TableCell className="max-h-[37px] pl-4">
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
                            onClick={() => handleViewStudentDocuments(s.id)}
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
            classArtIndex: data.klass.classArtIndex ?? null,
          }}
          studentCount={students.length}
          documentCount={classDocuments.length}
          activeTab={activeHeaderTab}
          onTabChange={handleHeaderTabChange}
          onEdit={() => setIsClassEditSheetOpen(true)}
        />

        <div
          key={activeHeaderTab}
          className="animate-in fade-in-0 slide-in-from-right-2 duration-300"
        >
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
      </div>

      <ClassManageSheet
        open={isClassEditSheetOpen}
        onOpenChange={setIsClassEditSheetOpen}
        editingClass={editingClass}
        schools={data.manageSchools}
        onSuccess={() => revalidator.revalidate()}
      />

      {data.isDocumentSubmissionEnabled ? (
        <ReleaseGradesSheet
          grades={releaseGradesForSheet}
          isOpen={isReleaseGradesSheetOpen}
          onClose={() => setIsReleaseGradesSheetOpen(false)}
          onSuccess={handleGradingSuccess}
        />
      ) : null}
    </section>
  );
}
