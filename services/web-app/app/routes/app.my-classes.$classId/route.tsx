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
  isDocumentSubmissionEnabledForSchool,
  isAssignmentsEnabledForOrganization,
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
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { Pagination } from '~/components/table/pagination';
import { timeAgo } from '~/utils/timeAgo';
import { formatGrade } from '~/domain/grading/gradeMath';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
      select: { school: { select: { organizationId: true } } },
    });
    if (!classWithOrg) {
      return dataResponse(
        { success: false, message: 'Class not found.' },
        { status: 404 }
      );
    }
    const assignmentsEnabled = await isAssignmentsEnabledForOrganization(
      classWithOrg.school.organizationId
    );
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
    const tutorContext = tutorContextRaw.trim() || null;
    const dueDateInput = dueDateRaw.trim();
    const dueDate = dueDateInput ? parseDateOnlyToUtc(dueDateInput) : null;

    if (!assignmentTypeId) {
      return dataResponse(
        { success: false, message: 'Assignment type is required.' },
        { status: 400 }
      );
    }
    if (!allowedAssignmentTypeIds.has(assignmentTypeId)) {
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
        },
      });

      return dataResponse({
        success: true,
        message: 'Assignment created successfully.',
      });
    }

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

    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        assignmentTypeId,
        title,
        prompt,
        tutorContext,
        dueDate,
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
    isDocumentSubmissionEnabledForSchool(klass.school?.id),
    isAssignmentsEnabledForOrganization(klass.school?.organizationId),
    isReleasedGradesOrganizationEnabledForOrganization(
      klass.school?.organizationId
    ),
  ]);

  // Get all submissions for this class
  const submissions = isDocumentSubmissionEnabled
    ? await prisma.submission.findMany({
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
      })
    : [];

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

  const assignments = assignmentsEnabled
    ? await prisma.assignment.findMany({
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
      })
    : [];

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

  const assignmentsEnabled = data.assignmentsEnabled ?? false;
  const validTabs: TabValue[] = [
    'in-progress',
    'to-grade',
    'graded',
    'released',
    ...(assignmentsEnabled ? (['assignments'] as const) : []),
    'paste-activity',
    'students',
  ];
  const requestedTab = searchParams.get('tab') as TabValue | null;
  const activeTab =
    requestedTab && validTabs.includes(requestedTab)
      ? requestedTab
      : 'in-progress';
  const assignmentFilterParam = searchParams.get('assignmentId') ?? 'all';
  const selectedAssignmentId =
    assignmentFilterParam !== 'all' &&
    data.assignments.some((assignment) => assignment.id === assignmentFilterParam)
      ? assignmentFilterParam
      : 'all';
  const editingAssignment =
    data.assignments.find((assignment) => assignment.id === editingAssignmentId) ??
    null;
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
          Object.keys(submission.rubricScores as Record<string, unknown>).length > 0)
    );

  const students = data.klass.students;
  const allSubmissions = useMemo(
    () => data.submissions,
    [data.submissions]
  );
  // Reset pagination when tab changes
  useEffect(() => {
    setPagination({ skip: 0, take: 20 });
  }, [activeTab]);

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
        return data.assignments;
      case 'paste-activity':
        return data.pasteAlerts;
      case 'students':
        return students;
      default:
        return [];
    }
  }, [
    activeTab,
    filteredInProgressDocuments,
    filteredUngradedDocuments,
    filteredGradedUnreleasedDocuments,
    filteredReleasedDocuments,
    data.assignments,
    data.pasteAlerts,
    students,
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
            {activeTab === 'assignments' && 'No assignments yet.'}
            {activeTab === 'paste-activity' &&
              'No copy/paste activity detected yet.'}
            {activeTab === 'students' && 'No students in this class yet.'}
          </p>
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
                  <TableCell>{doc.title}</TableCell>
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
                        to={`/app/submissions/${submission.id}?edit=1&exitTo=${encodedClassDetailExitTo}`}
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
                      {timeAgo(new Date(submission.gradedAt ?? submission.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={`/app/submissions/${submission.id}?edit=1&exitTo=${encodedClassDetailExitTo}`}
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
                          to={`/app/submissions/${submission.id}?edit=1&exitTo=${encodedClassDetailExitTo}`}
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
        <div className="rounded-lg bg-muted/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Assignment Type</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">
                    {assignment.title || 'Untitled Assignment'}
                  </TableCell>
                  <TableCell>{assignment.assignmentType.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {assignment.dueDate ? formatDateOnly(assignment.dueDate) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[320px]">
                    <p className="line-clamp-2">{assignment.prompt}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{assignment._count.documents}</Badge>
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
              ))}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((s) => {
                const studentDocs =
                  data.profiles.find((p) => p.id === s.profile.id)?.documents ??
                  [];
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.profile.user.name ?? 'Unnamed Student'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.profile.user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{studentDocs.length}</Badge>
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
                        <SheetContent className="w-full sm:max-w-lg">
                          <SheetHeader>
                            <SheetTitle>Student Details</SheetTitle>
                          </SheetHeader>
                          <div className="mt-4 space-y-4">
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">
                                Student
                              </div>
                              <div className="font-medium">
                                {s.profile.user.name ?? 'Unnamed Student'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {s.profile.user.email}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">
                                Documents
                              </div>
                              {studentDocs.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                  No documents yet.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 gap-2">
                                  {studentDocs.map((doc) => (
                                    <DocumentLink
                                      key={doc.id}
                                      doc={doc as any}
                                      exitTo={classDetailExitTo}
                                    />
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

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/my-classes" className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to my classes
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            {activeTab === 'assignments' ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingAssignmentId(null);
                  setIsAssignmentSheetOpen(true);
                }}
              >
                + New Assignment
              </Button>
            ) : null}
            {data.isDocumentSubmissionEnabled &&
              activeTab === 'graded' &&
              filteredGradedUnreleasedDocuments.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="default"
                      data-testid="class-release-grades-open"
                    >
                      Release Grades
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem
                      onSelect={() => openReleaseSheetForMode('all')}
                      className="rounded-lg"
                    >
                      All graded docs ({unreleasedGrades.length})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => openReleaseSheetForMode('selected')}
                      disabled={!canReleaseSelected}
                      className="rounded-lg"
                    >
                      Only selected docs ({selectedUnreleasedGrades.length})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
          </div>
        </div>

        {assignmentsEnabled &&
        ['in-progress', 'to-grade', 'graded', 'released'].includes(
          activeTab
        ) ? (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Assignment:</span>
            <Select
              value={selectedAssignmentId}
              onValueChange={handleAssignmentFilterChange}
            >
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue placeholder="All assignments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignments</SelectItem>
                {data.assignments.map((assignment) => (
                  <SelectItem key={assignment.id} value={assignment.id}>
                    {assignment.title || 'Untitled Assignment'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <button
            onClick={() => handleTabChange('students')}
            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 border hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <User className="w-4 h-4" />
              <span className="text-xs font-medium">Students</span>
            </div>
            <span className="text-3xl font-bold">{students.length}</span>
          </button>
          <button
            onClick={() => handleTabChange('in-progress')}
            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 border hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <FileText className="w-4 h-4" />
              <span className="text-xs font-medium">In Progress</span>
            </div>
            <span className="text-3xl font-bold">
              {filteredInProgressDocuments.length}
            </span>
          </button>
          {data.isDocumentSubmissionEnabled && (
            <button
              onClick={() => handleTabChange('to-grade')}
              className="flex flex-col items-center p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 mb-1">
                <ClipboardCheck className="w-4 h-4" />
                <span className="text-xs font-medium">Submitted</span>
              </div>
              <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                {filteredUngradedDocuments.length}
              </span>
            </button>
          )}
          {data.isDocumentSubmissionEnabled && (
            <button
              onClick={() => handleTabChange('graded')}
              className="flex flex-col items-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 mb-1">
                <Send className="w-4 h-4" />
                <span className="text-xs font-medium">To Release</span>
              </div>
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {filteredGradedUnreleasedDocuments.length}
              </span>
            </button>
          )}
        </div>

        {/* Tabs and Table */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div>
            <div className="flex items-center justify-between">
              <TabsList
                className={`grid w-full h-auto ${
                  data.isDocumentSubmissionEnabled
                    ? assignmentsEnabled
                      ? 'grid-cols-3 lg:grid-cols-7'
                      : 'grid-cols-3 lg:grid-cols-6'
                    : assignmentsEnabled
                      ? 'grid-cols-3 lg:grid-cols-4'
                      : 'grid-cols-3 lg:grid-cols-3'
                }`}
              >
                <TabsTrigger
                  value="in-progress"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">In Progress</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {filteredInProgressDocuments.length}
                  </span>
                </TabsTrigger>
                {data.isDocumentSubmissionEnabled && (
                  <TabsTrigger
                    value="to-grade"
                    className="flex items-center gap-2 h-auto py-2"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span className="hidden sm:inline">Submitted</span>
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                      {filteredUngradedDocuments.length}
                    </span>
                  </TabsTrigger>
                )}
                {data.isDocumentSubmissionEnabled && (
                  <TabsTrigger
                    value="graded"
                    className="flex items-center gap-2 h-auto py-2"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Graded</span>
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                      {filteredGradedUnreleasedDocuments.length}
                    </span>
                  </TabsTrigger>
                )}
                {data.isDocumentSubmissionEnabled && (
                  <TabsTrigger
                    value="released"
                    className="flex items-center gap-2 h-auto py-2"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span className="hidden sm:inline">Released</span>
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                      {filteredReleasedDocuments.length}
                    </span>
                  </TabsTrigger>
                )}
                {assignmentsEnabled && (
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
                )}
                <TabsTrigger
                  value="paste-activity"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Paste Activity</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {data.pasteAlerts.length}
                  </span>
                </TabsTrigger>
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
              </TabsList>
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

      {assignmentsEnabled && (
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
      )}

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
