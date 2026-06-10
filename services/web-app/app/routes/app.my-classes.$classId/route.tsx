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
  useOutlet,
  useRevalidator,
} from 'react-router';
import { Link } from 'react-router';
import {
  getPasswordHash,
  requireProfile,
  requireUserId,
} from '~/utils/auth.server.js';
import { parseAssignmentGradingIntent } from '~/utils/assignment-grading-intent.server';
import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  isAssignmentCreationStandardizationEnabledForContext,
  isAssignmentsEnabledForContext,
  isDocumentSubmissionEnabledForScope,
  isReleasedGradesOrganizationEnabledForOrganization,
} from '~/utils/feature-flags.server';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { CaretLeftIcon } from '~/components/icons';
import { useState, useMemo, useEffect } from 'react';
import {
  ClassManageSheet,
  type ClassManageRow,
} from '~/components/class-manage-sheet';
import { DocumentLink } from '~/components/document-link';
import { Checkbox } from '~/components/ui/checkbox';
import { ReleaseGradesSheet } from './release-grades-sheet';
import {
  Files,
  ClipboardCheck,
  Send,
  User,
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  UserMinus,
  Users,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { Pagination } from '~/components/table/pagination';
import { timeAgo } from '~/utils/timeAgo';
import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { studentModuleSessionSingleSelect } from './module-session-select.server';
import { buildClassDocumentScope } from './class-document-where.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { ClassArt } from '~/components/class-art';
import {
  TEACHER_DOCUMENT_STATUSES,
  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  getTeacherDocumentStatus,
  hasMeaningfulGrade,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import { cn } from '~/utils/misc';
import { useTable } from '~/hooks/useTable';
import { Tooltip } from '~/components/ui/tooltip';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { SheetDescription } from '~/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';

function parseDateOnlyToUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

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

async function getClassStudentProfiles(
  classId: string,
  studentProfileIds: string[],
  organizationId: string
) {
  return prisma.studentProfile.findMany({
    where: {
      id: { in: studentProfileIds },
      classes: { some: { id: classId } },
      profile: { organizationId },
    },
    select: { id: true },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
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
      teachers: { some: { id: profile.teacherProfile.id } },
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
        teacherProfileId: profile.teacherProfile.id,
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
      teacherProfileId: profile.teacherProfile.id,
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
      where: { id: assignmentId, classId },
      select: { id: true },
    });

    if (!assignment) {
      return dataResponse(
        { success: false, message: 'Assignment not found.' },
        { status: 404 }
      );
    }

    await prisma.assignment.delete({
      where: { id: assignment.id },
    });

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
    const dueDateRaw = formData.get('dueDate')?.toString() ?? '';

    const title = titleRaw.trim() || null;
    const prompt = promptRaw.trim();
    const legacyTutorContext = tutorContextRaw.trim() || null;
    const dueDateInput = dueDateRaw.trim();
    const dueDate = dueDateInput ? parseDateOnlyToUtc(dueDateInput) : null;

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
        where: { id: assignmentId, classId },
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
    if (dueDateInput && !dueDate) {
      return dataResponse(
        { success: false, message: 'Due date is invalid.' },
        { status: 400 }
      );
    }

    const assignmentCreationStandardizationEnabled =
      await isAssignmentCreationStandardizationEnabledForContext({
        organizationId: classAccess.school.organizationId,
        schoolId: classAccess.school.id,
        teacherProfileId: profile.teacherProfile.id,
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
      await prisma.assignment.create({
        data: {
          classId,
          assignmentTypeId,
          title,
          prompt,
          tutorContext: assignmentCreationStandardizationEnabled
            ? null
            : legacyTutorContext,
          dueDate,
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
        dueDate,
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

  if (intent === 'add-student') {
    const email = formData.get('email')?.toString().trim().toLowerCase();
    const name = formData.get('name')?.toString().trim() || '';
    const password = formData.get('password')?.toString().trim() || '';

    if (!email) {
      return dataResponse({ error: 'Email is required.' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        profiles: {
          select: {
            id: true,
            organizationId: true,
            studentProfile: {
              select: {
                id: true,
                classes: {
                  where: { id: classId },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (existingUser) {
      const orgProfile = existingUser.profiles.find(
        (p) => p.organizationId === classAccess.school.organizationId
      );

      if (!orgProfile) {
        return dataResponse(
          { error: 'This user belongs to another organization.' },
          { status: 400 }
        );
      }

      if (orgProfile.studentProfile) {
        if (orgProfile.studentProfile.classes.length > 0) {
          return dataResponse({
            success: true,
            message: 'Student is already in this class.',
          });
        }

        await prisma.studentProfile.update({
          where: { id: orgProfile.studentProfile.id },
          data: { classes: { connect: { id: classId } } },
        });

        return dataResponse({ success: true });
      }

      await prisma.studentProfile.create({
        data: {
          profile: { connect: { id: orgProfile.id } },
          classes: { connect: { id: classId } },
        },
      });

      return dataResponse({ success: true });
    }

    if (!name || !password) {
      return dataResponse(
        {
          error:
            'Name and password are required to create a new student account.',
        },
        { status: 400 }
      );
    }

    const hashedPassword = await getPasswordHash(password);

    await prisma.profile.create({
      data: {
        user: {
          create: {
            email,
            name,
            password: { create: { hash: hashedPassword } },
          },
        },
        organization: { connect: { id: classAccess.school.organizationId } },
        studentProfile: { create: { classes: { connect: { id: classId } } } },
      },
    });

    return dataResponse({ success: true });
  }

  // Removes class enrollment only — student profiles and accounts stay intact.
  if (intent === 'remove-students') {
    const studentProfileIds = formData.getAll('studentProfileIds') as string[];

    if (!studentProfileIds.length) {
      return dataResponse({ error: 'No students selected.' }, { status: 400 });
    }

    const students = await getClassStudentProfiles(
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
      await prisma.studentProfile.update({
        where: { id: student.id },
        data: { classes: { disconnect: { id: classId } } },
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
        teachers: { some: { id: profile.teacherProfile!.id } },
      },
      select: { id: true },
    });

    if (!targetClass) {
      return dataResponse({ error: 'Target class not found.' }, { status: 404 });
    }

    const students = await getClassStudentProfiles(
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
      await prisma.studentProfile.update({
        where: { id: student.id },
        data: {
          classes: {
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
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
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
      teachers: { some: { id: profile.teacherProfile.id } },
    },
    select: {
      id: true,
      schoolId: true,
      schoolYear: true,
      code: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { id: true, name: true, organizationId: true } },
      students: {
        select: {
          id: true,
          profile: {
            select: { id: true, user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  }),
    prisma.teacherProfile.findUnique({
      where: { id: profile.teacherProfile.id },
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
  const classDocumentScope = buildClassDocumentScope(
    classId,
    legacyClassDocumentIds
  );

  // Check feature flags
  const [isDocumentSubmissionEnabled, assignmentsEnabled, releasedGradesEnabled] =
    await Promise.all([
      isDocumentSubmissionEnabledForScope({
        schoolIds: [klass.school?.id],
        organizationIds: [klass.school?.organizationId],
        teacherProfileIds: [profile.teacherProfile.id],
        classIds: [klass.id],
      }),
      isAssignmentsEnabledForContext({
        organizationId: klass.school?.organizationId,
        schoolId: klass.school?.id,
        teacherProfileId: profile.teacherProfile.id,
        classIds: [klass.id],
      }),
      isReleasedGradesOrganizationEnabledForOrganization(
        klass.school?.organizationId
      ),
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
          profile: {
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
      profile: {
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

  const assignments = await prisma.assignment.findMany({
    where: { classId },
    select: {
      id: true,
      title: true,
      prompt: true,
      tutorContext: true,
      submitForGrade: true,
      pointValue: true,
      dueDate: true,
      assignmentTypeId: true,
      assignmentType: {
        select: {
          id: true,
          title: true,
          systemKey: true,
        },
      },
      _count: {
        select: {
          documents: true,
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  const teacherClasses = await prisma.class.findMany({
    where: {
      teachers: { some: { id: profile.teacherProfile.id } },
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
    releasedGradesEnabled,
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
  profile: {
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

type DocumentGroupMode = 'none' | 'student' | 'assignment';

type ClassDocumentGroup = {
  key: string;
  label: string;
  documents: ClassDocumentRow[];
};

type SortDirection = 'asc' | 'desc';

export default function ClassDetailRoute() {
  const outlet = useOutlet();
  if (outlet) return outlet;

  return <ClassDetailPage />;
}

function ClassDetailPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const studentFetcher = useFetcher();
  const [isClassEditSheetOpen, setIsClassEditSheetOpen] = useState(false);
  const [isAddStudentSheetOpen, setIsAddStudentSheetOpen] = useState(false);
  const [isMoveStudentsSheetOpen, setIsMoveStudentsSheetOpen] = useState(false);
  const [moveTargetClassId, setMoveTargetClassId] = useState('');
  const [collapsedDocumentGroups, setCollapsedDocumentGroups] = useState<
    Set<string>
  >(new Set());
  const [isReleaseGradesSheetOpen, setIsReleaseGradesSheetOpen] =
    useState(false);
  const [studentNameSortDirection, setStudentNameSortDirection] =
    useState<SortDirection>('asc');
  const [releaseGradesForSheet, setReleaseGradesForSheet] = useState<
    {
      id: string;
      score: string | null;
      feedback: string | null;
      archivedAt: Date | string | null;
      document: {
        id: string;
        title: string;
        profile: {
          user: {
            name: string | null;
            email: string;
          };
        };
      };
    }[]
  >([]);
  const classDetailPath = `/app/my-classes/${data.klass.id}`;
  const classDetailSearch = searchParams.toString();
  const classDetailExitTo = classDetailSearch
    ? `${classDetailPath}?${classDetailSearch}`
    : classDetailPath;
  const encodedClassDetailExitTo = encodeURIComponent(classDetailExitTo);
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
  const assignmentFilterParam = searchParams.get('assignmentId') ?? 'all';
  const selectedAssignmentId =
    assignmentFilterParam !== 'all' &&
    data.assignments.some(
      (assignment) => assignment.id === assignmentFilterParam
    )
      ? assignmentFilterParam
      : 'all';
  const studentFilterParam = searchParams.get('studentId') ?? 'all';
  const statusFilterParam = searchParams.get('status') ?? 'all';
  const statusFilter: TeacherDocumentStatus | 'all' =
    TEACHER_DOCUMENT_STATUSES.includes(
      statusFilterParam as TeacherDocumentStatus
    )
      ? (statusFilterParam as TeacherDocumentStatus)
      : 'all';
  const documentGroupParam = searchParams.get('documentGroup') ?? 'none';
  const documentGroupMode: DocumentGroupMode =
    documentGroupParam === 'student' || documentGroupParam === 'assignment'
      ? documentGroupParam
      : 'none';
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });

  const students = data.klass.students;
  const selectedStudentFilter =
    studentFilterParam !== 'all' &&
    students.some((student) => student.id === studentFilterParam)
      ? studentFilterParam
      : 'all';
  const allSubmissions = useMemo(() => data.submissions, [data.submissions]);
  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );

  // Reset pagination when tab changes
  useEffect(() => {
    setPagination({ skip: 0, take: 20 });
  }, [
    activeTab,
    studentNameSortDirection,
    selectedStudentFilter,
    selectedAssignmentId,
    statusFilter,
    documentGroupMode,
  ]);

  useEffect(() => {
    setCollapsedDocumentGroups(new Set());
  }, [
    documentGroupMode,
    selectedStudentFilter,
    selectedAssignmentId,
    statusFilter,
  ]);

  // Get ungraded submissions (submitted but not meaningfully graded)
  const ungradedDocuments = useMemo(() => {
    return allSubmissions.filter((submission) => {
      return !hasMeaningfulGrade(submission) && !submission.releasedAt;
    });
  }, [allSubmissions]);

  // Get graded but unreleased submissions
  const gradedUnreleasedDocuments = useMemo(() => {
    return allSubmissions.filter((submission) => {
      return hasMeaningfulGrade(submission) && !submission.releasedAt;
    });
  }, [allSubmissions]);

  // Get released submissions
  const releasedDocuments = useMemo(() => {
    return allSubmissions.filter((submission) => {
      return hasMeaningfulGrade(submission) && !!submission.releasedAt;
    });
  }, [allSubmissions]);

  const matchesSelectedAssignment = (assignmentId?: string | null) =>
    selectedAssignmentId === 'all' || assignmentId === selectedAssignmentId;

  const filteredGradedUnreleasedDocuments = useMemo(
    () =>
      gradedUnreleasedDocuments.filter((submission) =>
        matchesSelectedAssignment(submission.document.assignment?.id)
      ),
    [gradedUnreleasedDocuments, selectedAssignmentId]
  );

  // Get unreleased grades for release functionality
  const unreleasedGrades = useMemo(() => {
    return filteredGradedUnreleasedDocuments.map((submission) => {
      const gradeDisplay = formatAssignmentGrade({
        submitForGrade: submission.document.assignment?.submitForGrade,
        numericPercentage: submission.numericPercentage ?? null,
        letterGrade: submission.letterGrade ?? null,
        pointValue: submission.document.assignment?.pointValue ?? null,
        score: submission.score,
      });
      return {
        id: submission.id,
        score: gradeDisplay,
        feedback: submission.feedback,
        archivedAt: submission.archivedAt,
        document: {
          id: submission.document.id,
          title: submission.title,
          profile: submission.document.profile,
        },
      };
    });
  }, [filteredGradedUnreleasedDocuments]);

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

  const sortedStudents = useMemo(() => {
    const direction = studentNameSortDirection === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const aName = a.profile.user.name || a.profile.user.email;
      const bName = b.profile.user.name || b.profile.user.email;
      const primary = collator.compare(aName, bName);
      if (primary !== 0) return primary * direction;
      return collator.compare(a.profile.user.email, b.profile.user.email);
    });
  }, [collator, studentNameSortDirection, students]);

  const classDocuments = useMemo((): ClassDocumentRow[] => {
    const byDocumentId = new Map<string, ClassDocumentRow>();

    for (const document of data.inProgressDocuments) {
      byDocumentId.set(document.id, {
        id: document.id,
        title: document.title,
        updatedAt: new Date(document.updatedAt),
        profile: document.profile,
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
        profile: submission.document.profile,
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

  const filteredClassDocuments = useMemo(() => {
    const matchesSelectedStudentProfile = (profileId: string) => {
      if (selectedStudentFilter === 'all') return true;
      const student = students.find((s) => s.id === selectedStudentFilter);
      return student?.profile.id === profileId;
    };

    return classDocuments.filter(
      (document) =>
        matchesSelectedStudentProfile(document.profile.id) &&
        matchesSelectedAssignment(document.assignment?.id) &&
        (statusFilter === 'all' ||
          getTeacherDocumentStatus(document.latestSubmission) === statusFilter)
    );
  }, [
    classDocuments,
    selectedAssignmentId,
    selectedStudentFilter,
    statusFilter,
    students,
  ]);

  const classDocumentGroups = useMemo((): ClassDocumentGroup[] => {
    const sortedDocuments = [...filteredClassDocuments].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    if (documentGroupMode === 'none') {
      return [
        {
          key: 'all',
          label: '',
          documents: sortedDocuments,
        },
      ];
    }

    const groups = new Map<string, ClassDocumentGroup>();

    for (const document of sortedDocuments) {
      const key =
        documentGroupMode === 'student'
          ? document.profile.id
          : (document.assignment?.id ?? 'no-assignment');
      const label =
        documentGroupMode === 'student'
          ? document.profile.user.name || document.profile.user.email
          : document.assignment?.title || 'No assignment';

      const existing = groups.get(key);
      if (existing) {
        existing.documents.push(document);
      } else {
        groups.set(key, { key, label, documents: [document] });
      }
    }

    return Array.from(groups.values()).sort((a, b) =>
      collator.compare(a.label, b.label)
    );
  }, [collator, documentGroupMode, filteredClassDocuments]);

  const {
    selected: selectedStudentIds,
    setSelected: setSelectedStudentIds,
    handleSelectAll: handleSelectAllStudents,
    handleSelect: handleSelectStudent,
  } = useTable({ rows: sortedStudents });

  useEffect(() => {
    if (
      studentFetcher.state === 'idle' &&
      studentFetcher.data &&
      'success' in studentFetcher.data &&
      studentFetcher.data.success
    ) {
      setSelectedStudentIds([]);
      setIsAddStudentSheetOpen(false);
      setIsMoveStudentsSheetOpen(false);
      setMoveTargetClassId('');
      revalidator.revalidate();
    }
  }, [
    studentFetcher.state,
    studentFetcher.data,
    revalidator,
    setSelectedStudentIds,
  ]);

  // Get current tab data and paginate it
  const currentTabData = useMemo(() => {
    switch (activeTab) {
      case 'students':
        return sortedStudents;
      case 'documents':
        return filteredClassDocuments;
      default:
        return [];
    }
  }, [activeTab, sortedStudents, filteredClassDocuments]) as any[];

  const paginatedData = useMemo(() => {
    return currentTabData.slice(
      pagination.skip,
      pagination.skip + pagination.take
    );
  }, [currentTabData, pagination.skip, pagination.take]) as any[];

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    navigate(`?${next.toString()}`);
  };

  const handleAssignmentFilterChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('assignmentId');
    } else {
      next.set('assignmentId', value);
    }
    navigate(`?${next.toString()}`);
  };

  const handleStudentFilterChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('studentId');
    } else {
      next.set('studentId', value);
    }
    navigate(`?${next.toString()}`);
  };

  const handleViewStudentDocuments = (studentProfileId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'documents');
    next.set('studentId', studentProfileId);
    navigate(`?${next.toString()}`);
  };

  const handleDocumentGroupChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'none') {
      next.delete('documentGroup');
    } else {
      next.set('documentGroup', value);
    }
    navigate(`?${next.toString()}`);
  };

  const handleStatusFilterChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('status');
    } else {
      next.set('status', value);
    }
    navigate(`?${next.toString()}`);
  };

  const getClassDocumentDetailLink = (document: ClassDocumentRow) => {
    if (document.latestSubmission) {
      return `/app/submissions/${document.latestSubmission.id}?${
        data.isDocumentSubmissionEnabled ? 'edit=1&' : ''
      }exitTo=${encodedClassDetailExitTo}`;
    }

    return `/app/documents/${document.id}?left=tutor&exitTo=${encodedClassDetailExitTo}`;
  };

  const getClassDocumentGradeDisplay = (document: ClassDocumentRow) => {
    const submission = document.latestSubmission;
    if (!submission || !hasMeaningfulGrade(submission)) {
      return null;
    }

    return formatAssignmentGrade({
      submitForGrade: document.assignment?.submitForGrade,
      numericPercentage: submission.numericPercentage ?? null,
      letterGrade: submission.letterGrade ?? null,
      pointValue: document.assignment?.pointValue ?? null,
    });
  };

  const getClassDocumentStatus = (document: ClassDocumentRow) => {
    const status = getTeacherDocumentStatus(document.latestSubmission);
    const grade =
      status === 'graded' || status === 'released'
        ? getClassDocumentGradeDisplay(document)
        : null;

    return {
      label: grade
        ? `${TEACHER_DOCUMENT_STATUS_LABELS[status]} · ${grade}`
        : TEACHER_DOCUMENT_STATUS_LABELS[status],
      badgeClassName: TEACHER_DOCUMENT_STATUS_BADGE_CLASSES[status],
      variant: 'secondary' as const,
    };
  };

  const renderClassDocumentRows = (
    documents: ClassDocumentRow[],
    options: { showStudent: boolean; showAssignment: boolean }
  ) =>
    documents.map((document) => {
      const status = getClassDocumentStatus(document);
      const displayTitle =
        document.latestSubmission?.title || getDraftDisplayTitle(document);
      const latestSubmission = document.latestSubmission;

      return (
        <TableRow key={document.id}>
          {options.showStudent ? (
            <TableCell className="font-medium">
              {document.profile.user.name || document.profile.user.email}
            </TableCell>
          ) : null}
          <TableCell>{displayTitle}</TableCell>
          {options.showAssignment && assignmentsEnabled ? (
            <TableCell className="text-muted-foreground">
              {document.assignment?.title || '—'}
            </TableCell>
          ) : null}
          <TableCell>
            <div className="flex items-center gap-2">
              <Badge
                variant={status.variant}
                className={cn(
                  status.badgeClassName,
                  'shrink-0 whitespace-nowrap'
                )}
              >
                {status.label}
              </Badge>
              {document.submissions.length >= 2 ? (
                <span className="text-xs text-muted-foreground">
                  v{document.submissions.length}
                </span>
              ) : null}
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {latestSubmission
              ? timeAgo(
                  new Date(latestSubmission.submittedAt ?? latestSubmission.createdAt)
                )
              : '—'}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {latestSubmission?.gradedAt
              ? timeAgo(new Date(latestSubmission.gradedAt))
              : '—'}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {timeAgo(document.updatedAt)}
          </TableCell>
          <TableCell className="pr-4">
            <Button asChild size="sm" variant="outline">
              <Link to={getClassDocumentDetailLink(document)}>View details</Link>
            </Button>
          </TableCell>
        </TableRow>
      );
    });

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
      const hasDocumentFilters =
        selectedStudentFilter !== 'all' ||
        selectedAssignmentId !== 'all' ||
        statusFilter !== 'all';
      const showStudentColumn = documentGroupMode !== 'student';
      const showAssignmentColumn =
        assignmentsEnabled && documentGroupMode !== 'assignment';
      const documentsToRender =
        documentGroupMode === 'none'
          ? (paginatedData as ClassDocumentRow[])
          : filteredClassDocuments;

      const renderDocumentsTable = (
        documents: ClassDocumentRow[],
        nested = false
      ) => (
        <Table
          aria-label="Class documents"
          containerClassName={
            nested ? 'rounded-none border-0 shadow-none' : undefined
          }
        >
          <TableHeader>
            <TableRow>
              {showStudentColumn ? <TableHead>Student</TableHead> : null}
              <TableHead>Document</TableHead>
              {showAssignmentColumn ? <TableHead>Assignment</TableHead> : null}
              <TableHead>Status</TableHead>
              <TableHead>Submitted at</TableHead>
              <TableHead>Graded at</TableHead>
              <TableHead>Last edited</TableHead>
              <TableHead className="pr-4">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderClassDocumentRows(documents, {
              showStudent: showStudentColumn,
              showAssignment: showAssignmentColumn,
            })}
          </TableBody>
        </Table>
      );

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedStudentFilter}
                onValueChange={handleStudentFilterChange}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All students" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All students</SelectItem>
                  {sortedStudents.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.profile.user.name || student.profile.user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedAssignmentId}
                onValueChange={handleAssignmentFilterChange}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All assignments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignments</SelectItem>
                  {data.assignments.map((assignment) => (
                    <SelectItem key={assignment.id} value={assignment.id}>
                      {assignment.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={handleStatusFilterChange}
              >
                <SelectTrigger
                  className="w-[180px]"
                  data-testid="class-documents-status-filter"
                >
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {TEACHER_DOCUMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TEACHER_DOCUMENT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasDocumentFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('studentId');
                    next.delete('assignmentId');
                    next.delete('status');
                    navigate(`?${next.toString()}`);
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.isDocumentSubmissionEnabled && unreleasedGrades.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  data-testid="class-release-grades-open"
                  onClick={openReleaseSheet}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Release grades ({unreleasedGrades.length})
                </Button>
              ) : null}
              <Select
                value={documentGroupMode}
                onValueChange={handleDocumentGroupChange}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="No grouping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  <SelectItem value="student">Group by student</SelectItem>
                  <SelectItem value="assignment">Group by assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredClassDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed bg-muted/50 p-12 rounded-lg">
              <span className="text-lg font-bold">No documents found</span>
              <span className="text-sm text-muted-foreground">
                {hasDocumentFilters
                  ? 'Try adjusting your filters'
                  : 'Student documents will appear here once work begins'}
              </span>
            </div>
          ) : documentGroupMode === 'none' ? (
            <div className="rounded-lg bg-muted/50">
              {renderDocumentsTable(documentsToRender)}
            </div>
          ) : (
            <div className="space-y-3">
              {classDocumentGroups.map((group) => {
                const isOpen = !collapsedDocumentGroups.has(group.key);

                return (
                  <Collapsible
                    key={group.key}
                    open={isOpen}
                    onOpenChange={(open) => {
                      setCollapsedDocumentGroups((current) => {
                        const next = new Set(current);
                        if (open) {
                          next.delete(group.key);
                        } else {
                          next.add(group.key);
                        }
                        return next;
                      });
                    }}
                    className="overflow-hidden rounded-lg border bg-background shadow-sm"
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 border-b bg-muted/70 px-4 py-3 text-left transition-colors hover:bg-muted"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-base font-semibold text-foreground">
                          {group.label}
                        </span>
                        <Badge variant="secondary" className="ml-1">
                          {group.documents.length}
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-muted/50">
                        {renderDocumentsTable(group.documents, true)}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'students') {
      const studentIsLoading = studentFetcher.state !== 'idle';

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            {selectedStudentIds.length > 0 && (
              <>
                <studentFetcher.Form method="post" className="inline">
                  <input type="hidden" name="intent" value="remove-students" />
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
                <Tooltip text={`Move to another class (${selectedStudentIds.length})`}>
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

          <Sheet
            open={isAddStudentSheetOpen}
            onOpenChange={setIsAddStudentSheetOpen}
          >
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Add Student by Email</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  Enrolls an existing student profile in this class. Name and
                  password are only needed to create a brand-new account.
                </p>
              </SheetHeader>
              <studentFetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="add-student" />
                <div className="space-y-2">
                  <Label htmlFor="add-student-email">Email</Label>
                  <Input
                    id="add-student-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">New account only</p>
                  <div className="space-y-2">
                    <Label htmlFor="add-student-name">Name</Label>
                    <Input
                      id="add-student-name"
                      name="name"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-student-password">Password</Label>
                    <Input
                      id="add-student-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                    />
                  </div>
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
                >
                  {studentIsLoading ? 'Adding...' : 'Add Student'}
                </Button>
              </studentFetcher.Form>
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
                          sortedStudents.length > 0 &&
                          selectedStudentIds.length === sortedStudents.length
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
                    <TableHead>Email</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead className="pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((s) => {
                    const studentDocumentCount =
                      data.inProgressDocuments.filter(
                        (doc) => doc.profile.id === s.profile.id
                      ).length +
                      new Set(
                        allSubmissions
                          .filter(
                            (sub) => sub.document.profile.id === s.profile.id
                          )
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
                          {s.profile.user.name ?? 'Unnamed Student'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.profile.user.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {studentDocumentCount}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => handleViewStudentDocuments(s.id)}
                          >
                            View Details
                          </Button>
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

        <div
          data-testid="class-detail-header"
          className="mb-6 overflow-hidden rounded-lg border"
        >
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded-md border sm:block">
                <ClassArt seed={data.klass.id} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">
                  Grade {data.klass.grade} • Period {data.klass.period}
                  {data.klass.title ? ` — ${data.klass.title}` : ''}
                </h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {data.klass.school?.name ? (
                    <span>{data.klass.school.name}</span>
                  ) : null}
                  <span>{data.klass.schoolYear}</span>
                  <Badge variant="outline" size="sm" className="font-mono">
                    {data.klass.code}
                  </Badge>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" size="sm" className="gap-1">
                    <Users className="h-3 w-3" />
                    {students.length} student{students.length === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant="secondary" size="sm" className="gap-1">
                    <Files className="h-3 w-3" />
                    {classDocuments.length} document
                    {classDocuments.length === 1 ? '' : 's'}
                  </Badge>
                  {ungradedDocuments.length > 0 ? (
                    <Badge className="gap-1 border-orange-200 bg-orange-100 text-orange-700">
                      <ClipboardCheck className="h-3 w-3" />
                      {ungradedDocuments.length} to grade
                    </Badge>
                  ) : null}
                  {releasedDocuments.length > 0 ? (
                    <Badge className="gap-1 border-green-200 bg-green-100 text-green-700">
                      <Send className="h-3 w-3" />
                      {releasedDocuments.length} released
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setIsClassEditSheetOpen(true)}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit Class
              </Button>
              {data.releasedGradesEnabled ? (
                <Link
                  to={`/app/my-classes/${data.klass.id}/released-grades`}
                  className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                >
                  Released grades →
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Tabs and Table */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div>
            <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger
                  value="students"
                  className="flex h-auto items-center justify-center gap-2 py-2"
                >
                  <User className="w-4 h-4" />
                  <span>Students</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {students.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="flex h-auto items-center justify-center gap-2 py-2"
                >
                  <Files className="w-4 h-4" />
                  <span>Documents</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {classDocuments.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              <div>{renderTable()}</div>
              {currentTabData.length > 0 &&
                !(activeTab === 'documents' && documentGroupMode !== 'none') && (
                <div className="mt-4">
                  <Pagination
                    totalCount={currentTabData.length}
                    skip={pagination.skip}
                    take={pagination.take}
                    onChange={handlePaginationChange}
                  />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
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
