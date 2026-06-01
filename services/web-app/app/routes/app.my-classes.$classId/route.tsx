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
  useNavigate,
  useOutlet,
} from 'react-router';
import { Link } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { getSubmittedPapersFilter } from '~/utils/cookies.server';
import {
  isAssignmentsEnabledForContext,
  isDocumentSubmissionEnabledForScope,
  isReleasedGradesOrganizationEnabledForOrganization,
} from '~/utils/feature-flags.server';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { StudentArchiveCell } from '~/components/student-archive-cell';
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
import { DocumentLink } from '~/components/document-link';
import { Checkbox } from '~/components/ui/checkbox';
import { ReleaseGradesSheet } from './release-grades-sheet';
import {
  FileText,
  ClipboardCheck,
  Send,
  User,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { Pagination } from '~/components/table/pagination';
import { timeAgo } from '~/utils/timeAgo';
import { formatGrade } from '~/domain/grading/gradeMath';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { AssignmentSheet } from './assignment-sheet';
import { formatDateOnly } from '~/utils/date-only';
import {
  studentModuleSessionListSelect,
  studentModuleSessionSingleSelect,
} from './module-session-select.server';
import { buildClassDocumentScope } from './class-document-where.server';

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
    select: { id: true },
  });

  if (!classAccess) {
    return dataResponse(
      { success: false, message: 'Class not found.' },
      { status: 404 }
    );
  }

  const allowedAssignmentTypes = await prisma.assignmentType.findMany({
    where: {
      archivedAt: null,
      organizationAssignments: {
        some: { organizationId: profile.organization.id },
      },
    },
    select: { id: true },
  });
  const allowedAssignmentTypeIds = new Set(
    allowedAssignmentTypes.map((type) => type.id)
  );

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  if (
    intent === 'delete-assignment' ||
    intent === 'create-assignment' ||
    intent === 'update-assignment'
  ) {
    const classWithOrg = await prisma.class.findFirst({
      where: {
        id: classId,
        teachers: { some: { id: profile.teacherProfile.id } },
      },
      select: {
        id: true,
        school: { select: { id: true, organizationId: true } },
      },
    });
    if (!classWithOrg) {
      return dataResponse(
        { success: false, message: 'Class not found.' },
        { status: 404 }
      );
    }
    const assignmentsEnabled = await isAssignmentsEnabledForContext({
      organizationId: classWithOrg.school.organizationId,
      schoolId: classWithOrg.school.id,
      teacherProfileId: profile.teacherProfile.id,
      classIds: [classWithOrg.id],
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
    const timedModeRaw = formData.get('timedMode')?.toString() ?? '';
    const durationMinutesRaw = formData.get('durationMinutes')?.toString() ?? '';
    const coachingScopeRaw = formData.get('coachingScope')?.toString() ?? '';

    const title = titleRaw.trim() || null;
    const prompt = promptRaw.trim();
    const tutorContext = tutorContextRaw.trim() || null;
    const dueDateInput = dueDateRaw.trim();
    const dueDate = dueDateInput ? parseDateOnlyToUtc(dueDateInput) : null;
    const timedMode = timedModeRaw.trim() || null;
    const durationMinutes = durationMinutesRaw ? parseInt(durationMinutesRaw, 10) : null;
    const coachingScope = coachingScopeRaw.trim() || null;

    if (!assignmentTypeId) {
      return dataResponse(
        { success: false, message: 'Assignment type is required.' },
        { status: 400 }
      );
    }
    let existingAssignment: { id: string; assignmentTypeId: string } | null =
      null;
    if (intent === 'update-assignment') {
      if (!assignmentId) {
        return dataResponse(
          { success: false, message: 'Assignment is required.' },
          { status: 400 }
        );
      }

      existingAssignment = await prisma.assignment.findFirst({
        where: { id: assignmentId, classId },
        select: { id: true, assignmentTypeId: true },
      });

      if (!existingAssignment) {
        return dataResponse(
          { success: false, message: 'Assignment not found.' },
          { status: 404 }
        );
      }
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

    if (intent === 'create-assignment') {
      await prisma.assignment.create({
        data: {
          classId,
          assignmentTypeId,
          title,
          prompt,
          tutorContext,
          dueDate,
          timedMode,
          durationMinutes: durationMinutes && !isNaN(durationMinutes) ? durationMinutes : null,
          coachingScope,
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
        tutorContext,
        dueDate,
        timedMode,
        durationMinutes: durationMinutes && !isNaN(durationMinutes) ? durationMinutes : null,
        coachingScope,
      },
    });

    return dataResponse({
      success: true,
      message: 'Assignment updated successfully.',
    });
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

  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { id: profile.teacherProfile.id } },
    },
    select: {
      id: true,
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
  });
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

  const allowedAssignmentTypes = await prisma.assignmentType.findMany({
    where: {
      archivedAt: null,
      organizationAssignments: {
        some: { organizationId: profile.organization.id },
      },
    },
    select: { id: true, title: true },
    orderBy: { position: 'asc' },
  });

  const profiles = await prisma.profile.findMany({
    where: {
      studentProfile: {
        classes: { some: { id: classId } },
      },
    },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      documents: {
        where: classDocumentScope,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          html: true,
          text: true,
          assignmentModuleSessions: studentModuleSessionListSelect,
          _count: {
            select: {
              pasteAlerts: true,
            },
          },
        },
      },
    },
  });

  // Get recent paste alerts for this class
  const pasteAlerts = await prisma.pasteAlert.findMany({
    where: {
      document: classDocumentScope,
    },
    select: {
      id: true,
      createdAt: true,
      textLength: true,
      content: true,
      document: {
        select: {
          id: true,
          title: true,
          assignmentId: true,
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
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50, // Limit to most recent 50 alerts
  });

  // Check feature flags
  const [
    isDocumentSubmissionEnabled,
    assignmentsEnabled,
    releasedGradesEnabled,
  ] = await Promise.all([
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
      dueDate: true,
      assignmentTypeId: true,
      assignmentType: {
        select: {
          id: true,
          title: true,
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

  const submittedPapersFilter = await getSubmittedPapersFilter(request);

  return dataResponse({
    klass,
    allowedAssignmentTypes,
    profiles,
    pasteAlerts,
    submissions,
    inProgressDocuments,
    assignments,
    assignmentsEnabled,
    submittedPapersFilter,
    isDocumentSubmissionEnabled,
    releasedGradesEnabled,
  });
}

type TabValue =
  | 'in-progress'
  | 'to-grade'
  | 'graded'
  | 'released'
  | 'assignments'
  | 'paste-activity'
  | 'students';

type SortDirection = 'asc' | 'desc';
type AssignmentSort = {
  key: 'title' | 'dueDate';
  direction: SortDirection;
};

export default function ClassDetailRoute() {
  const outlet = useOutlet();
  if (outlet) return outlet;

  return <ClassDetailPage />;
}

function ClassDetailPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [selectedPasteContent, setSelectedPasteContent] = useState<
    string | null
  >(null);
  const [selectedGradedDocuments, setSelectedGradedDocuments] = useState<
    Set<string>
  >(new Set());
  const [isReleaseGradesSheetOpen, setIsReleaseGradesSheetOpen] =
    useState(false);
  const [studentNameSortDirection, setStudentNameSortDirection] =
    useState<SortDirection>('asc');
  const [assignmentSort, setAssignmentSort] = useState<AssignmentSort>({
    key: 'title',
    direction: 'asc',
  });
  const [selectedAssignmentTypeIds, setSelectedAssignmentTypeIds] = useState<
    Set<string>
  >(new Set());
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

  const assignmentsEnabled = data.assignmentsEnabled === true;
  const validTabs: TabValue[] = assignmentsEnabled
    ? ['students', 'assignments']
    : ['students'];
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
  const editingAssignment =
    data.assignments.find(
      (assignment) => assignment.id === editingAssignmentId
    ) ?? null;
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });
  const hasMeaningfulGrade = (submission: {
    score: string | null;
    feedback: string | null;
    rubricScores?: unknown | null;
    overallComment?: string | null;
    numericPercentage?: number | null;
    letterGrade?: string | null;
    gradedAt?: Date | string | null;
  }) =>
    Boolean(
      submission.gradedAt ||
      submission.score ||
      submission.feedback ||
      submission.overallComment ||
      submission.letterGrade ||
      submission.numericPercentage !== null ||
      (submission.rubricScores &&
        typeof submission.rubricScores === 'object' &&
        Object.keys(submission.rubricScores as Record<string, unknown>).length >
          0)
    );

  const students = data.klass.students;
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
    assignmentSort,
    selectedAssignmentTypeIds,
    studentNameSortDirection,
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

  const filteredInProgressDocuments = useMemo(
    () =>
      data.inProgressDocuments.filter((document) =>
        matchesSelectedAssignment(document.assignment?.id)
      ),
    [data.inProgressDocuments, selectedAssignmentId]
  );

  const filteredUngradedDocuments = useMemo(
    () =>
      ungradedDocuments.filter((submission) =>
        matchesSelectedAssignment(submission.document.assignment?.id)
      ),
    [ungradedDocuments, selectedAssignmentId]
  );

  const filteredGradedUnreleasedDocuments = useMemo(
    () =>
      gradedUnreleasedDocuments.filter((submission) =>
        matchesSelectedAssignment(submission.document.assignment?.id)
      ),
    [gradedUnreleasedDocuments, selectedAssignmentId]
  );

  const filteredReleasedDocuments = useMemo(
    () =>
      releasedDocuments.filter((submission) =>
        matchesSelectedAssignment(submission.document.assignment?.id)
      ),
    [releasedDocuments, selectedAssignmentId]
  );

  // Get unreleased grades for release functionality
  const unreleasedGrades = useMemo(() => {
    return filteredGradedUnreleasedDocuments.map((submission) => {
      const gradeDisplay =
        formatGrade(
          submission.numericPercentage ?? null,
          submission.letterGrade ?? null
        ) || submission.score;
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

  const unreleasedGradesBySubmissionId = useMemo(() => {
    return new Map(unreleasedGrades.map((grade) => [grade.id, grade]));
  }, [unreleasedGrades]);

  // Handle URL param for to-release action
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'to-release') {
      if (unreleasedGrades.length > 0) {
        setReleaseGradesForSheet(unreleasedGrades);
        setIsReleaseGradesSheetOpen(true);
        const next = new URLSearchParams(searchParams);
        next.set('tab', 'graded');
        navigate(`?${next.toString()}`, { replace: true });
      }
    }
  }, [searchParams, navigate, unreleasedGrades]);

  // Handle successful release
  const handleGradingSuccess = () => {
    setSelectedGradedDocuments(new Set());
    setReleaseGradesForSheet([]);
    window.location.reload();
  };

  const toggleGradedDocumentSelection = (docId: string) => {
    const newSelection = new Set(selectedGradedDocuments);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedGradedDocuments(newSelection);
  };

  const toggleAllGradedDocuments = () => {
    const submissionIds = filteredGradedUnreleasedDocuments.map((d) => d.id);
    if (submissionIds.every((id) => selectedGradedDocuments.has(id))) {
      const newSelection = new Set(selectedGradedDocuments);
      submissionIds.forEach((id) => newSelection.delete(id));
      setSelectedGradedDocuments(newSelection);
    } else {
      const newSelection = new Set(selectedGradedDocuments);
      submissionIds.forEach((id) => newSelection.add(id));
      setSelectedGradedDocuments(newSelection);
    }
  };

  const selectedUnreleasedGrades = useMemo(() => {
    return Array.from(selectedGradedDocuments)
      .map((submissionId) => unreleasedGradesBySubmissionId.get(submissionId))
      .filter((grade): grade is (typeof unreleasedGrades)[number] => !!grade);
  }, [selectedGradedDocuments, unreleasedGradesBySubmissionId]);

  const canReleaseSelected = selectedUnreleasedGrades.length > 0;

  const openReleaseSheetForMode = (mode: 'all' | 'selected') => {
    if (mode === 'selected') {
      if (!canReleaseSelected) return;
      setReleaseGradesForSheet(selectedUnreleasedGrades);
    } else {
      setReleaseGradesForSheet(unreleasedGrades);
    }
    setIsReleaseGradesSheetOpen(true);
  };

  const selectedDocs = selectedProfileId
    ? (data.profiles.find((p) => p.id === selectedProfileId)?.documents ?? [])
    : [];

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

  const assignmentTypeOptions = useMemo(() => {
    const typesById = new Map<string, { id: string; title: string }>();
    for (const assignment of data.assignments) {
      typesById.set(assignment.assignmentType.id, assignment.assignmentType);
    }
    return Array.from(typesById.values()).sort((a, b) =>
      collator.compare(a.title, b.title)
    );
  }, [collator, data.assignments]);

  const hasAssignmentTypeFilter = selectedAssignmentTypeIds.size > 0;

  const sortedFilteredAssignments = useMemo(() => {
    const visibleAssignments = hasAssignmentTypeFilter
      ? data.assignments.filter((assignment) =>
          selectedAssignmentTypeIds.has(assignment.assignmentType.id)
        )
      : data.assignments;

    return [...visibleAssignments].sort((a, b) => {
      const titleCompare = collator.compare(
        a.title || 'Untitled Assignment',
        b.title || 'Untitled Assignment'
      );
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : null;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : null;
      const bothHaveDueDates = aDue !== null && bDue !== null;
      const direction = assignmentSort.direction === 'asc' ? 1 : -1;

      if (assignmentSort.key === 'title') {
        if (titleCompare !== 0) return titleCompare * direction;
        if (bothHaveDueDates && aDue !== bDue) return aDue - bDue;
        if (aDue === null && bDue !== null) return 1;
        if (aDue !== null && bDue === null) return -1;
        return collator.compare(a.id, b.id);
      }

      if (bothHaveDueDates && aDue !== bDue) {
        return (aDue - bDue) * direction;
      }
      if (aDue === null && bDue !== null) return 1;
      if (aDue !== null && bDue === null) return -1;
      if (titleCompare !== 0) return titleCompare;
      return collator.compare(a.id, b.id);
    });
  }, [
    assignmentSort,
    collator,
    data.assignments,
    hasAssignmentTypeFilter,
    selectedAssignmentTypeIds,
  ]);

  // Get current tab data and paginate it
  const currentTabData = useMemo(() => {
    switch (activeTab) {
      case 'in-progress':
        return filteredInProgressDocuments;
      case 'to-grade':
        return filteredUngradedDocuments;
      case 'graded':
        return filteredGradedUnreleasedDocuments;
      case 'released':
        return filteredReleasedDocuments;
      case 'assignments':
        return sortedFilteredAssignments;
      case 'paste-activity':
        return data.pasteAlerts;
      case 'students':
        return sortedStudents;
      default:
        return [];
    }
  }, [
    activeTab,
    filteredInProgressDocuments,
    filteredUngradedDocuments,
    filteredGradedUnreleasedDocuments,
    filteredReleasedDocuments,
    data.pasteAlerts,
    sortedFilteredAssignments,
    sortedStudents,
  ]) as any[];

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

  const toggleStudentNameSort = () => {
    setStudentNameSortDirection((current) =>
      current === 'asc' ? 'desc' : 'asc'
    );
  };

  const toggleAssignmentSort = (key: AssignmentSort['key']) => {
    setAssignmentSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleAssignmentTypeFilter = (assignmentTypeId: string) => {
    setSelectedAssignmentTypeIds((current) => {
      const allTypeIds = assignmentTypeOptions.map((type) => type.id);
      const next = current.size === 0 ? new Set(allTypeIds) : new Set(current);

      if (next.has(assignmentTypeId)) {
        next.delete(assignmentTypeId);
      } else {
        next.add(assignmentTypeId);
      }

      return next.size === allTypeIds.length ? new Set() : next;
    });
  };

  const clearAssignmentTypeFilter = () => {
    setSelectedAssignmentTypeIds(new Set());
  };

  const handlePaginationChange = (skip: number, take: number) => {
    setPagination({ skip, take });
  };

  // Render table based on active tab
  const renderTable = () => {
    if (paginatedData.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          <p>
            {activeTab === 'in-progress' && 'No in-progress documents.'}
            {activeTab === 'to-grade' && 'All caught up! No essays to grade.'}
            {activeTab === 'graded' && 'No grades ready to release.'}
            {activeTab === 'released' && 'No released documents yet.'}
            {activeTab === 'assignments' &&
              (hasAssignmentTypeFilter
                ? 'No assignments match this filter.'
                : 'No assignments yet.')}
            {activeTab === 'paste-activity' &&
              'No copy/paste activity detected yet.'}
            {activeTab === 'students' && 'No students in this class yet.'}
          </p>
          {activeTab === 'assignments' && hasAssignmentTypeFilter ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={clearAssignmentTypeFilter}
            >
              Clear filter
            </Button>
          ) : null}
        </div>
      );
    }

    if (activeTab === 'in-progress') {
      return (
        <div className="rounded-lg bg-muted/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Document</TableHead>
                {assignmentsEnabled && <TableHead>Assignment</TableHead>}
                <TableHead>Course Module</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    {doc.profile.user.name || doc.profile.user.email}
                  </TableCell>
                  <TableCell>{getDraftDisplayTitle(doc)}</TableCell>
                  {assignmentsEnabled && (
                    <TableCell className="text-muted-foreground">
                      {doc.assignment?.title || '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {doc.assignmentModuleSessions[0]?.assignmentModule.title ||
                      '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(new Date(doc.updatedAt))}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to={`/app/documents/${doc.id}?left=tutor&exitTo=${encodedClassDetailExitTo}`}
                      >
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeTab === 'to-grade') {
      return (
        <div className="rounded-lg bg-muted/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Essay</TableHead>
                {assignmentsEnabled && <TableHead>Assignment</TableHead>}
                <TableHead>Course Module</TableHead>
                <TableHead>Student archive</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">
                    {submission.document.profile.user.name ||
                      submission.document.profile.user.email}
                  </TableCell>
                  <TableCell>{submission.title}</TableCell>
                  {assignmentsEnabled && (
                    <TableCell className="text-muted-foreground">
                      {submission.document.assignment?.title || '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {submission.document.assignmentModuleSessions[0]
                      ?.assignmentModule.title || '—'}
                  </TableCell>
                  <TableCell>
                    <StudentArchiveCell archivedAt={submission.archivedAt} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(
                      new Date(submission.submittedAt ?? submission.createdAt)
                    )}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to={`/app/submissions/${submission.id}?${
                          data.isDocumentSubmissionEnabled ? 'edit=1&' : ''
                        }exitTo=${encodedClassDetailExitTo}`}
                      >
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeTab === 'graded') {
      return (
        <div className="rounded-lg bg-muted/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      filteredGradedUnreleasedDocuments.length > 0 &&
                      filteredGradedUnreleasedDocuments.every((d) =>
                        selectedGradedDocuments.has(d.id)
                      )
                    }
                    onCheckedChange={toggleAllGradedDocuments}
                    aria-label="Select all graded documents"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Essay</TableHead>
                {assignmentsEnabled && <TableHead>Assignment</TableHead>}
                <TableHead>Student archive</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Graded</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((submission) => {
                const gradeDisplay =
                  formatGrade(
                    submission.numericPercentage ?? null,
                    submission.letterGrade ?? null
                  ) ||
                  submission.score ||
                  '—';
                return (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedGradedDocuments.has(submission.id)}
                        onCheckedChange={() =>
                          toggleGradedDocumentSelection(submission.id)
                        }
                        aria-label={`Select graded ${submission.title}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {submission.document.profile.user.name ||
                        submission.document.profile.user.email}
                    </TableCell>
                    <TableCell>{submission.title}</TableCell>
                    {assignmentsEnabled && (
                      <TableCell className="text-muted-foreground">
                        {submission.document.assignment?.title || '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <StudentArchiveCell archivedAt={submission.archivedAt} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{gradeDisplay}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(
                        new Date(submission.gradedAt ?? submission.createdAt)
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={`/app/submissions/${submission.id}?${
                            data.isDocumentSubmissionEnabled ? 'edit=1&' : ''
                          }exitTo=${encodedClassDetailExitTo}`}
                        >
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeTab === 'released') {
      return (
        <div className="rounded-lg bg-muted/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Essay</TableHead>
                {assignmentsEnabled && <TableHead>Assignment</TableHead>}
                <TableHead>Student archive</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((submission) => {
                const gradeDisplay =
                  formatGrade(
                    submission.numericPercentage ?? null,
                    submission.letterGrade ?? null
                  ) ||
                  submission.score ||
                  '—';
                return (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">
                      {submission.document.profile.user.name ||
                        submission.document.profile.user.email}
                    </TableCell>
                    <TableCell>{submission.title}</TableCell>
                    {assignmentsEnabled && (
                      <TableCell className="text-muted-foreground">
                        {submission.document.assignment?.title || '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <StudentArchiveCell archivedAt={submission.archivedAt} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{gradeDisplay}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(new Date(submission.releasedAt!))}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={`/app/submissions/${submission.id}?${
                            data.isDocumentSubmissionEnabled ? 'edit=1&' : ''
                          }exitTo=${encodedClassDetailExitTo}`}
                        >
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeTab === 'assignments') {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={assignmentTypeOptions.length === 0}
                  aria-label="Filter assignment types"
                >
                  <Filter className="h-4 w-4" />
                  Type
                  {hasAssignmentTypeFilter ? (
                    <span className="rounded border px-1.5 text-xs">
                      {selectedAssignmentTypeIds.size}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Assignment Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {assignmentTypeOptions.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type.id}
                    checked={
                      !hasAssignmentTypeFilter ||
                      selectedAssignmentTypeIds.has(type.id)
                    }
                    onCheckedChange={() => toggleAssignmentTypeFilter(type.id)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {type.title}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {hasAssignmentTypeFilter ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                aria-label="Clear assignment type filter"
                onClick={clearAssignmentTypeFilter}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
          </div>
          <Table aria-label="Assignments">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 gap-2 px-2"
                    aria-label={`Sort assignments by title ${
                      assignmentSort.key === 'title' &&
                      assignmentSort.direction === 'asc'
                        ? 'descending'
                        : 'ascending'
                    }`}
                    onClick={() => toggleAssignmentSort('title')}
                  >
                    Title
                    {assignmentSort.key === 'title' ? (
                      assignmentSort.direction === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-50" />
                    )}
                  </Button>
                </TableHead>
                <TableHead>Assignment Type</TableHead>
                <TableHead>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 gap-2 px-2"
                    aria-label={`Sort assignments by due date ${
                      assignmentSort.key === 'dueDate' &&
                      assignmentSort.direction === 'asc'
                        ? 'descending'
                        : 'ascending'
                    }`}
                    onClick={() => toggleAssignmentSort('dueDate')}
                  >
                    Due Date
                    {assignmentSort.key === 'dueDate' ? (
                      assignmentSort.direction === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-50" />
                    )}
                  </Button>
                </TableHead>
                <TableHead>In Progress</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Graded</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Copy &amp; Paste</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((assignment) => {
                const assignmentSubmissions = allSubmissions.filter(
                  (s) => s.document.assignment?.id === assignment.id
                );
                const inProgressCount = data.inProgressDocuments.filter(
                  (doc) => doc.assignment?.id === assignment.id
                ).length;
                const submittedCount = assignmentSubmissions.filter(
                  (s) => !hasMeaningfulGrade(s) && !s.releasedAt
                ).length;
                const gradedCount = assignmentSubmissions.filter(
                  (s) => hasMeaningfulGrade(s) && !s.releasedAt
                ).length;
                const releasedCount = assignmentSubmissions.filter(
                  (s) => !!s.releasedAt
                ).length;
                const pasteCount = data.pasteAlerts.filter(
                  (a) => a.document.assignmentId === assignment.id
                ).length;
                return (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      {assignment.title || 'Untitled Assignment'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {assignment.assignmentType.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {assignment.dueDate
                        ? formatDateOnly(assignment.dueDate)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/app/my-classes/${data.klass.id}/assignments/${assignment.id}?status=in-progress`}
                      >
                        <Badge
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80"
                        >
                          {inProgressCount}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/app/my-classes/${data.klass.id}/assignments/${assignment.id}?status=submitted`}
                      >
                        {submittedCount > 0 ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200 cursor-pointer">
                            {submittedCount}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-secondary/80"
                          >
                            {submittedCount}
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/app/my-classes/${data.klass.id}/assignments/${assignment.id}?status=graded`}
                      >
                        {gradedCount > 0 ? (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 cursor-pointer">
                            {gradedCount}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-secondary/80"
                          >
                            {gradedCount}
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/app/my-classes/${data.klass.id}/assignments/${assignment.id}?status=released`}
                      >
                        <Badge
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80"
                        >
                          {releasedCount}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {pasteCount > 0 ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                          {pasteCount}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{pasteCount}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => {
                            setEditingAssignmentId(assignment.id);
                            setIsAssignmentSheetOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Form
                          method="post"
                          onSubmit={(event) => {
                            if (
                              !window.confirm(
                                'Delete this assignment? Existing student documents will remain, but they will no longer be linked to this assignment.'
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input
                            type="hidden"
                            name="intent"
                            value="delete-assignment"
                          />
                          <input
                            type="hidden"
                            name="assignmentId"
                            value={assignment.id}
                          />
                          <Button size="sm" variant="destructive" type="submit">
                            Delete
                          </Button>
                        </Form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeTab === 'paste-activity') {
      return (
        <div className="rounded-lg bg-muted/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead className="text-right">Characters</TableHead>
                <TableHead>Content</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((alert) => {
                const truncatedContent = alert.content
                  ? alert.content.length > 100
                    ? alert.content.substring(0, 100) + '...'
                    : alert.content
                  : null;
                return (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">
                      {alert.profile.user.name || alert.profile.user.email}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/app/documents/${alert.document.id}?left=tutor&exitTo=${encodedClassDetailExitTo}`}
                        className="text-primary hover:underline"
                      >
                        {alert.document.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(new Date(alert.createdAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">
                        {alert.textLength.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {truncatedContent ? (
                        <button
                          onClick={() =>
                            setSelectedPasteContent(alert.content || null)
                          }
                          className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors max-w-xs truncate block"
                          title="Click to view full content"
                        >
                          {truncatedContent}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeTab === 'students') {
      return (
        <div className="rounded-lg bg-muted/50">
          <Table aria-label="Students">
            <TableHeader>
              <TableRow>
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
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((s) => {
                const studentProfileId = s.profile.id;
                const studentSubmissions = allSubmissions.filter(
                  (sub) => sub.document.profile.id === studentProfileId
                );
                const studentSubmitted = studentSubmissions.filter(
                  (sub) => !hasMeaningfulGrade(sub) && !sub.releasedAt
                );
                const studentGraded = studentSubmissions.filter(
                  (sub) => hasMeaningfulGrade(sub) && !sub.releasedAt
                );
                const studentReleased = studentSubmissions.filter(
                  (sub) => !!sub.releasedAt
                );
                const studentDrafts = data.inProgressDocuments.filter(
                  (doc) => doc.profile.id === studentProfileId
                );
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.profile.user.name ?? 'Unnamed Student'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.profile.user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {studentDrafts.length + studentSubmissions.length}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedProfileId(s.profile.id)}
                          >
                            View Details
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                          <SheetHeader>
                            <SheetTitle>
                              {s.profile.user.name ?? 'Unnamed Student'}
                            </SheetTitle>
                            <p className="text-sm text-muted-foreground">
                              {s.profile.user.email}
                            </p>
                          </SheetHeader>
                          <div className="mt-6 space-y-6">
                            {/* Submitted */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium">
                                  Submitted
                                </span>
                                {studentSubmitted.length > 0 && (
                                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                                    {studentSubmitted.length}
                                  </Badge>
                                )}
                              </div>
                              {studentSubmitted.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  None
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {studentSubmitted.map((sub) => (
                                    <div
                                      key={sub.id}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <div className="min-w-0">
                                        <Link
                                          to={`/app/submissions/${sub.id}?${
                                            data.isDocumentSubmissionEnabled
                                              ? 'edit=1&'
                                              : ''
                                          }exitTo=${encodedClassDetailExitTo}`}
                                          className="text-primary hover:underline truncate block"
                                        >
                                          {sub.title}
                                        </Link>
                                        {sub.document.assignment && (
                                          <span className="text-xs text-muted-foreground">
                                            {sub.document.assignment.title}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                        {timeAgo(
                                          new Date(
                                            sub.submittedAt ?? sub.createdAt
                                          )
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Graded */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium">
                                  Graded
                                </span>
                                {studentGraded.length > 0 && (
                                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
                                    {studentGraded.length}
                                  </Badge>
                                )}
                              </div>
                              {studentGraded.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  None
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {studentGraded.map((sub) => (
                                    <div
                                      key={sub.id}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <div className="min-w-0">
                                        <Link
                                          to={`/app/submissions/${sub.id}?${
                                            data.isDocumentSubmissionEnabled
                                              ? 'edit=1&'
                                              : ''
                                          }exitTo=${encodedClassDetailExitTo}`}
                                          className="text-primary hover:underline truncate block"
                                        >
                                          {sub.title}
                                        </Link>
                                        {sub.document.assignment && (
                                          <span className="text-xs text-muted-foreground">
                                            {sub.document.assignment.title}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 ml-2 shrink-0">
                                        {(sub.letterGrade ||
                                          sub.numericPercentage != null) && (
                                          <Badge variant="secondary">
                                            {formatGrade(
                                              sub.numericPercentage ?? null,
                                              sub.letterGrade ?? null
                                            )}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Released */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium">
                                  Released
                                </span>
                                {studentReleased.length > 0 && (
                                  <Badge variant="secondary">
                                    {studentReleased.length}
                                  </Badge>
                                )}
                              </div>
                              {studentReleased.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  None
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {studentReleased.map((sub) => (
                                    <div
                                      key={sub.id}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <div className="min-w-0">
                                        <Link
                                          to={`/app/submissions/${sub.id}?${
                                            data.isDocumentSubmissionEnabled
                                              ? 'edit=1&'
                                              : ''
                                          }exitTo=${encodedClassDetailExitTo}`}
                                          className="text-primary hover:underline truncate block"
                                        >
                                          {sub.title}
                                        </Link>
                                        {sub.document.assignment && (
                                          <span className="text-xs text-muted-foreground">
                                            {sub.document.assignment.title}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 ml-2 shrink-0">
                                        {(sub.letterGrade ||
                                          sub.numericPercentage != null) && (
                                          <Badge variant="secondary">
                                            {formatGrade(
                                              sub.numericPercentage ?? null,
                                              sub.letterGrade ?? null
                                            )}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Drafts in progress */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium">
                                  Drafts in progress
                                </span>
                                {studentDrafts.length > 0 && (
                                  <Badge variant="secondary">
                                    {studentDrafts.length}
                                  </Badge>
                                )}
                              </div>
                              {studentDrafts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  None
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {studentDrafts.map((doc) => (
                                    <div
                                      key={doc.id}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <div className="min-w-0">
                                        <Link
                                          to={`/app/documents/${doc.id}?left=tutor&exitTo=${encodedClassDetailExitTo}`}
                                          className="text-primary hover:underline truncate block"
                                        >
                                          {getDraftDisplayTitle(doc)}
                                        </Link>
                                        {doc.assignment && (
                                          <span className="text-xs text-muted-foreground">
                                            {doc.assignment.title}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                        {timeAgo(new Date(doc.updatedAt))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    }

    return null;
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      {/* Header */}
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>
              Grade {data.klass.grade} • Period {data.klass.period}
            </h2>
            {data.klass.title && (
              <p className="mt-1 font-medium">{data.klass.title}</p>
            )}
            {data.klass.school?.name ? (
              <p className="mt-1 text-muted-foreground">
                {data.klass.school.name}
              </p>
            ) : null}
            {data.releasedGradesEnabled ? (
              <Link
                to={`/app/my-classes/${data.klass.id}/released-grades`}
                className="mt-2 text-sm underline"
              >
                Released grades →
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-xl px-3 py-3 pb-24 sm:px-5">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/my-classes" className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to my classes
            </Link>
          </Button>
        </div>

        {/* Tabs and Table */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div>
            <div className="flex items-center justify-between">
              <TabsList className="flex h-auto">
                <TabsTrigger
                  value="students"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Students</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {students.length}
                  </span>
                </TabsTrigger>
                {assignmentsEnabled ? (
                  <TabsTrigger
                    value="assignments"
                    className="flex items-center gap-2 h-auto py-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Assignments</span>
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                      {data.assignments.length}
                    </span>
                  </TabsTrigger>
                ) : null}
              </TabsList>
              {assignmentsEnabled ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingAssignmentId(null);
                    setIsAssignmentSheetOpen(true);
                  }}
                >
                  + Create New Assignment
                </Button>
              ) : null}
            </div>
            <TabsContent value={activeTab} className="mt-4">
              <div>{renderTable()}</div>
              {currentTabData.length > 0 && (
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

      <AssignmentSheet
        classId={data.klass.id}
        allowedAssignmentTypes={data.allowedAssignmentTypes}
        open={isAssignmentSheetOpen}
        onOpenChange={(open) => {
          setIsAssignmentSheetOpen(open);
          if (!open) setEditingAssignmentId(null);
        }}
        editingAssignment={editingAssignment}
      />

      <Sheet
        open={selectedPasteContent !== null}
        onOpenChange={(open) => !open && setSelectedPasteContent(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Pasted Content</SheetTitle>
          </SheetHeader>
          <div className="mt-4 h-[calc(100vh-8rem)] overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-muted p-4 rounded-lg">
              {selectedPasteContent || ''}
            </pre>
          </div>
        </SheetContent>
      </Sheet>

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
