import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import {
  useFetcher,
  useLoaderData,
  useSearchParams,
  useNavigate,
} from 'react-router';
import { Link } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { getSubmittedPapersFilter } from '~/utils/cookies.server';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
import { DocumentLink } from '~/components/document-link';
import { Checkbox } from '~/components/ui/checkbox';
import { GradingSheet } from './grading-sheet';
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
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
      school: { select: { name: true } },
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
        where: { classId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          html: true,
          text: true,
          studentCourseModuleSessions: {
            select: {
              studentCourseModule: { select: { title: true } },
              document: { select: { title: true } },
            },
          },
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
      document: { classId },
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

  // Get submitted documents for this class with grades
  const submittedDocuments = await prisma.document.findMany({
    where: {
      classId,
      submittedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      submittedAt: true,
      submittedSnapshotId: true,
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
      studentCourseModuleSessions: {
        select: {
          studentCourseModule: { select: { title: true } },
        },
        take: 1,
      },
      submittedSnapshot: {
        select: {
          id: true,
          grades: {
            select: {
              id: true,
              score: true,
              feedback: true,
              rubricScores: true,
              overallScore: true,
              overallComment: true,
              aiMeta: true,
              releasedAt: true,
              createdAt: true,
            },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      submittedAt: 'desc',
    },
  });

  // Get in-progress documents (not submitted, recent activity)
  const inProgressDocuments = await prisma.document.findMany({
    where: {
      classId,
      submittedAt: null,
      updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
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
      studentCourseModuleSessions: {
        select: {
          studentCourseModule: { select: { title: true } },
        },
        take: 1,
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 20, // Limit to most recent 20
  });

  const submittedPapersFilter = await getSubmittedPapersFilter(request);

  return dataResponse({
    klass,
    profiles,
    pasteAlerts,
    submittedDocuments,
    inProgressDocuments,
    submittedPapersFilter,
  });
}

type TabValue =
  | 'in-progress'
  | 'to-grade'
  | 'graded'
  | 'released'
  | 'paste-activity'
  | 'students';

export default function ClassDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [selectedPasteContent, setSelectedPasteContent] = useState<
    string | null
  >(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(
    new Set()
  );
  const [gradingDocuments, setGradingDocuments] = useState<
    typeof data.submittedDocuments
  >([]);
  const [isGradingSheetOpen, setIsGradingSheetOpen] = useState(false);
  const [isReleaseGradesSheetOpen, setIsReleaseGradesSheetOpen] =
    useState(false);

  // Tab and pagination state
  const activeTab = (searchParams.get('tab') as TabValue) || 'in-progress';
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });

  const students = data.klass.students;

  // Reset pagination when tab changes
  useEffect(() => {
    setPagination({ skip: 0, take: 20 });
  }, [activeTab]);

  // Get ungraded documents
  const ungradedDocuments = useMemo(() => {
    return data.submittedDocuments.filter((doc) => {
      const grade = doc.submittedSnapshot?.grades?.[0];
      return !grade;
    });
  }, [data.submittedDocuments]);

  // Get graded but unreleased documents
  const gradedUnreleasedDocuments = useMemo(() => {
    return data.submittedDocuments.filter((doc) => {
      const grade = doc.submittedSnapshot?.grades?.[0];
      return grade && !grade.releasedAt;
    });
  }, [data.submittedDocuments]);

  // Get released documents
  const releasedDocuments = useMemo(() => {
    return data.submittedDocuments.filter((doc) => {
      const grade = doc.submittedSnapshot?.grades?.[0];
      return grade && grade.releasedAt;
    });
  }, [data.submittedDocuments]);

  // Get unreleased grades for release functionality
  const unreleasedGrades = useMemo(() => {
    return gradedUnreleasedDocuments.map((doc) => {
      const grade = doc.submittedSnapshot!.grades[0];
      return {
        id: grade.id,
        score: grade.score,
        feedback: grade.feedback,
        document: {
          id: doc.id,
          title: doc.title,
          profile: doc.profile,
        },
      };
    });
  }, [gradedUnreleasedDocuments]);

  // Handle URL param for to-release action
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'to-release') {
      if (unreleasedGrades.length > 0) {
        setIsReleaseGradesSheetOpen(true);
        navigate(`?tab=graded`, { replace: true });
      }
    }
  }, [searchParams, navigate, unreleasedGrades]);

  // Toggle document selection
  const toggleDocumentSelection = (docId: string) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedDocuments(newSelection);
  };

  // Toggle all documents for a specific list
  const toggleAllDocuments = (docList: typeof data.submittedDocuments) => {
    const docIds = docList.map((d) => d.id);
    if (docIds.every((id) => selectedDocuments.has(id))) {
      const newSelection = new Set(selectedDocuments);
      docIds.forEach((id) => newSelection.delete(id));
      setSelectedDocuments(newSelection);
    } else {
      const newSelection = new Set(selectedDocuments);
      docIds.forEach((id) => newSelection.add(id));
      setSelectedDocuments(newSelection);
    }
  };

  // Open grading sheet for selected documents
  const openGradingSheet = (documentIds: string[]) => {
    const docs = data.submittedDocuments.filter((d) =>
      documentIds.includes(d.id)
    );
    setGradingDocuments(docs);
    setIsGradingSheetOpen(true);
  };

  // Handle successful grading
  const handleGradingSuccess = () => {
    setSelectedDocuments(new Set());
    setGradingDocuments([]);
    // Reload the page to get updated data
    window.location.reload();
  };

  const selectedDocs = selectedProfileId
    ? (data.profiles.find((p) => p.id === selectedProfileId)?.documents ?? [])
    : [];

  // Get current tab data and paginate it
  const currentTabData = useMemo(() => {
    switch (activeTab) {
      case 'in-progress':
        return data.inProgressDocuments;
      case 'to-grade':
        return ungradedDocuments;
      case 'graded':
        return gradedUnreleasedDocuments;
      case 'released':
        return releasedDocuments;
      case 'paste-activity':
        return data.pasteAlerts;
      case 'students':
        return students;
      default:
        return [];
    }
  }, [
    activeTab,
    data.inProgressDocuments,
    ungradedDocuments,
    gradedUnreleasedDocuments,
    releasedDocuments,
    data.pasteAlerts,
    students,
  ]);

  const paginatedData = useMemo(() => {
    return currentTabData.slice(
      pagination.skip,
      pagination.skip + pagination.take
    );
  }, [currentTabData, pagination.skip, pagination.take]);

  const handleTabChange = (value: string) => {
    navigate(`?tab=${value}`);
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
                <TableHead>Course Module</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map(
                (doc: (typeof data.inProgressDocuments)[0]) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.profile.user.name || doc.profile.user.email}
                    </TableCell>
                    <TableCell>{doc.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.studentCourseModuleSessions[0]?.studentCourseModule
                        .title || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(new Date(doc.updatedAt))}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={`/app/documents/${doc.id}?exitTo=/app/my-classes/${data.klass.id}`}
                        >
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              )}
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
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      ungradedDocuments.length > 0 &&
                      ungradedDocuments.every((d) =>
                        selectedDocuments.has(d.id)
                      )
                    }
                    onCheckedChange={() =>
                      toggleAllDocuments(ungradedDocuments)
                    }
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Essay</TableHead>
                <TableHead>Course Module</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((doc: (typeof ungradedDocuments)[0]) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedDocuments.has(doc.id)}
                      onCheckedChange={() => toggleDocumentSelection(doc.id)}
                      aria-label={`Select ${doc.title}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {doc.profile.user.name || doc.profile.user.email}
                  </TableCell>
                  <TableCell>{doc.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.studentCourseModuleSessions[0]?.studentCourseModule
                      .title || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(new Date(doc.submittedAt!))}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={`/app/documents/${doc.id}?exitTo=/app/my-classes/${data.klass.id}`}
                        >
                          View
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openGradingSheet([doc.id])}
                      >
                        Grade
                      </Button>
                    </div>
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
                <TableHead>Student</TableHead>
                <TableHead>Essay</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Graded</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map(
                (doc: (typeof gradedUnreleasedDocuments)[0]) => {
                  const grade = doc.submittedSnapshot!.grades[0];
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        {doc.profile.user.name || doc.profile.user.email}
                      </TableCell>
                      <TableCell>{doc.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{grade.score || '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {timeAgo(new Date(grade.createdAt))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to={`/app/documents/${doc.id}?exitTo=/app/my-classes/${data.klass.id}`}
                            >
                              View
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openGradingSheet([doc.id])}
                          >
                            Edit Grade
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
              )}
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
                <TableHead>Score</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((doc: (typeof releasedDocuments)[0]) => {
                const grade = doc.submittedSnapshot!.grades[0];
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.profile.user.name || doc.profile.user.email}
                    </TableCell>
                    <TableCell>{doc.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{grade.score || '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(new Date(grade.releasedAt!))}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={`/app/documents/${doc.id}?exitTo=/app/my-classes/${data.klass.id}`}
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
              {paginatedData.map((alert: (typeof data.pasteAlerts)[0]) => {
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
                        to={`/app/documents/${alert.document.id}`}
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
              {paginatedData.map((s: (typeof students)[0]) => {
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
                                      exitTo={`/app/my-classes/${data.klass.id}`}
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
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/my-classes" className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to my classes
            </Link>
          </Button>
        </div>

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
              {data.inProgressDocuments.length}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('to-grade')}
            className="flex flex-col items-center p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 mb-1">
              <ClipboardCheck className="w-4 h-4" />
              <span className="text-xs font-medium">To Grade</span>
            </div>
            <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {ungradedDocuments.length}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('graded')}
            className="flex flex-col items-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 mb-1">
              <Send className="w-4 h-4" />
              <span className="text-xs font-medium">To Release</span>
            </div>
            <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {gradedUnreleasedDocuments.length}
            </span>
          </button>
        </div>

        {/* Tabs and Table */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div>
            <div className="flex items-center justify-between">
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto">
                <TabsTrigger
                  value="in-progress"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">In Progress</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {data.inProgressDocuments.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="to-grade"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">To Grade</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {ungradedDocuments.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="graded"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Graded</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {gradedUnreleasedDocuments.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="released"
                  className="flex items-center gap-2 h-auto py-2"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Released</span>
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {releasedDocuments.length}
                  </span>
                </TabsTrigger>
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
              {activeTab === 'to-grade' && selectedDocuments.size > 0 && (
                <Button
                  size="sm"
                  onClick={() =>
                    openGradingSheet(Array.from(selectedDocuments))
                  }
                  className="ml-4"
                >
                  Grade{' '}
                  {selectedDocuments.size === 1
                    ? 'Essay'
                    : `${selectedDocuments.size} Essays`}
                </Button>
              )}
              {activeTab === 'graded' &&
                gradedUnreleasedDocuments.length > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setIsReleaseGradesSheetOpen(true)}
                    className="ml-4"
                  >
                    Release {gradedUnreleasedDocuments.length}{' '}
                    {gradedUnreleasedDocuments.length === 1
                      ? 'Grade'
                      : 'Grades'}
                  </Button>
                )}
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

      <GradingSheet
        documents={gradingDocuments}
        isOpen={isGradingSheetOpen}
        onClose={() => {
          setIsGradingSheetOpen(false);
          setGradingDocuments([]);
        }}
        onSuccess={handleGradingSuccess}
      />

      <ReleaseGradesSheet
        grades={unreleasedGrades}
        isOpen={isReleaseGradesSheetOpen}
        onClose={() => setIsReleaseGradesSheetOpen(false)}
        onSuccess={handleGradingSuccess}
      />
    </section>
  );
}
