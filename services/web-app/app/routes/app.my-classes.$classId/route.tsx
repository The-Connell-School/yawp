import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { useLoaderData, useFetcher, useRevalidator } from 'react-router';
import { Link } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { CaretLeftIcon } from '~/components/icons';
import { useState } from 'react';
import { DocumentLink } from '~/components/document-link';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';

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

  // Get all submissions (documents) for this class with grade information
  const submissions = await prisma.document.findMany({
    where: {
      classId,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      text: true,
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
      grade: {
        select: {
          id: true,
          score: true,
          maxScore: true,
          feedback: true,
          status: true,
          releasedAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return dataResponse({ klass, profiles, pasteAlerts, submissions });
}

export default function ClassDetailRoute() {
  const data = useLoaderData<typeof loader>();
  console.log(data);
  const gradeFetcher = useFetcher();
  const bulkGradeFetcher = useFetcher();
  const revalidator = useRevalidator();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [selectedPasteContent, setSelectedPasteContent] = useState<string | null>(
    null
  );
  const [gradeFilter, setGradeFilter] = useState<'all' | 'graded' | 'non-graded'>(
    'non-graded'
  );
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(
    new Set()
  );
  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const [bulkGradingDialogOpen, setBulkGradingDialogOpen] = useState(false);
  const [currentGrading, setCurrentGrading] = useState<{
    documentId: string;
    studentName: string;
    documentTitle: string;
    score: string;
    maxScore: string;
    feedback: string;
    existingGradeId?: string;
  } | null>(null);
  const [bulkGrading, setBulkGrading] = useState({
    score: '',
    maxScore: '100',
    feedback: '',
  });
  const students = data.klass.students;

  const selectedDocs = selectedProfileId
    ? (data.profiles.find((p) => p.id === selectedProfileId)?.documents ?? [])
    : [];

  // Filter submissions based on grading status
  const filteredSubmissions = data.submissions.filter((submission) => {
    if (gradeFilter === 'all') return true;
    if (gradeFilter === 'graded') return submission.grade !== null;
    if (gradeFilter === 'non-graded') return submission.grade === null;
    return true;
  });

  // Selection handlers
  const toggleSubmission = (id: string) => {
    const newSet = new Set(selectedSubmissions);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSubmissions(newSet);
  };

  const toggleAllSubmissions = () => {
    if (selectedSubmissions.size === filteredSubmissions.length) {
      setSelectedSubmissions(new Set());
    } else {
      setSelectedSubmissions(new Set(filteredSubmissions.map((s) => s.id)));
    }
  };

  const getWordCount = (text: string | null) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const openGradingDialog = (submission: typeof filteredSubmissions[0]) => {
    setCurrentGrading({
      documentId: submission.id,
      studentName: submission.profile.user.name || submission.profile.user.email,
      documentTitle: submission.title,
      score: submission.grade?.score?.toString() ?? '',
      maxScore: submission.grade?.maxScore?.toString() ?? '100',
      feedback: submission.grade?.feedback ?? '',
      existingGradeId: submission.grade?.id,
    });
    setGradingDialogOpen(true);
  };

  const closeGradingDialog = () => {
    setGradingDialogOpen(false);
    setCurrentGrading(null);
  };

  const submitGrade = (status: 'draft' | 'released') => {
    if (!currentGrading) return;

    const formData = new FormData();
    formData.append('documentId', currentGrading.documentId);
    formData.append('score', currentGrading.score);
    formData.append('maxScore', currentGrading.maxScore);
    formData.append('feedback', currentGrading.feedback);
    formData.append('status', status);

    gradeFetcher.submit(formData, {
      method: 'POST',
      action: '/api/model/grade',
    });

    closeGradingDialog();
    // Revalidate after a short delay to show updated data
    setTimeout(() => revalidator.revalidate(), 500);
  };

  const openBulkGradingDialog = () => {
    setBulkGradingDialogOpen(true);
  };

  const closeBulkGradingDialog = () => {
    setBulkGradingDialogOpen(false);
    setBulkGrading({ score: '', maxScore: '100', feedback: '' });
  };

  const submitBulkGrade = (status: 'draft' | 'released') => {
    const documentIds = Array.from(selectedSubmissions).join(',');

    const formData = new FormData();
    formData.append('documentIds', documentIds);
    formData.append('score', bulkGrading.score);
    formData.append('maxScore', bulkGrading.maxScore);
    formData.append('feedback', bulkGrading.feedback);
    formData.append('status', status);

    bulkGradeFetcher.submit(formData, {
      method: 'POST',
      action: '/api/model/grade-bulk',
    });

    closeBulkGradingDialog();
    setSelectedSubmissions(new Set());
    // Revalidate after a short delay to show updated data
    setTimeout(() => revalidator.revalidate(), 500);
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
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
        <div className="mb-4">
          <Button asChild variant="outline">
            <Link to="/app/my-classes" className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to my classes
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="students" className="w-full">
          <TabsList>
            <TabsTrigger value="students">
              Students ({students.length})
            </TabsTrigger>
            <TabsTrigger value="submitted-papers">
              Submitted Papers ({data.submissions.length})
            </TabsTrigger>
            <TabsTrigger value="paste-activity">
              Copy/Paste Activity ({data.pasteAlerts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="mt-4">
            {students.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p>No students in this class yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {students.map((s) => (
                  <Sheet key={s.id}>
                    <SheetTrigger asChild>
                      <button
                        className="flex w-full items-center justify-between rounded-lg border bg-muted p-3 text-left hover:shadow"
                        onClick={() => setSelectedProfileId(s.profile.id)}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium truncate">
                            {s.profile.user.name ?? 'Unnamed Student'}
                          </span>
                          <span className="text-sm text-muted-foreground truncate">
                            {s.profile.user.email}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          View
                        </span>
                      </button>
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
                          {selectedDocs.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              No documents yet.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2">
                              {selectedDocs.map((doc) => (
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
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="submitted-papers" className="mt-4">
            <div className="mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="grade-filter" className="text-sm font-medium">
                  Filter:
                </label>
                <Select
                  value={gradeFilter}
                  onValueChange={(value) =>
                    setGradeFilter(value as 'all' | 'graded' | 'non-graded')
                  }
                >
                  <SelectTrigger className="w-[180px]" id="grade-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non-graded">Non-Graded</SelectItem>
                    <SelectItem value="graded">Graded</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedSubmissions.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedSubmissions.size} selected
                  </span>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={openBulkGradingDialog}
                  >
                    Grade Selected ({selectedSubmissions.size})
                  </Button>
                </div>
              )}
            </div>

            {filteredSubmissions.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p>
                  {gradeFilter === 'non-graded'
                    ? 'No ungraded submissions.'
                    : gradeFilter === 'graded'
                      ? 'No graded submissions yet.'
                      : 'No submissions yet.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          filteredSubmissions.length > 0 &&
                          selectedSubmissions.size === filteredSubmissions.length
                        }
                        onCheckedChange={toggleAllSubmissions}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Document Title</TableHead>
                    <TableHead>Word Count</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSubmissions.has(submission.id)}
                          onCheckedChange={() => toggleSubmission(submission.id)}
                          aria-label={`Select ${submission.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {submission.profile.user.name ||
                          submission.profile.user.email}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/app/documents/${submission.id}`}
                          className="text-primary hover:underline"
                        >
                          {submission.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {getWordCount(submission.text)} words
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(submission.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {submission.grade ? (
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={
                                submission.grade.status === 'released'
                                  ? 'default'
                                  : 'outline'
                              }
                            >
                              {submission.grade.status === 'released'
                                ? 'Released'
                                : 'Draft'}
                            </Badge>
                            {submission.grade.score !== null && (
                              <span className="text-sm text-muted-foreground">
                                {submission.grade.score}/{submission.grade.maxScore}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary">Not Graded</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openGradingDialog(submission)}
                        >
                          {submission.grade ? 'Edit Grade' : 'Grade'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="paste-activity" className="mt-4">
            {data.pasteAlerts.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p>No copy/paste activity detected yet.</p>
              </div>
            ) : (
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
                  {data.pasteAlerts.map((alert) => {
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
                          {new Date(alert.createdAt).toLocaleDateString()}{' '}
                          {new Date(alert.createdAt).toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {alert.textLength.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {truncatedContent ? (
                            <button
                              onClick={() => setSelectedPasteContent(alert.content || null)}
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
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={gradingDialogOpen} onOpenChange={setGradingDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
            <DialogDescription>
              {currentGrading && (
                <>
                  Student: <strong>{currentGrading.studentName}</strong> •{' '}
                  Document: <strong>{currentGrading.documentTitle}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {currentGrading && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="score">Score</Label>
                  <Input
                    id="score"
                    type="number"
                    placeholder="0"
                    min="0"
                    step="0.5"
                    value={currentGrading.score}
                    onChange={(e) =>
                      setCurrentGrading({ ...currentGrading, score: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxScore">Max Score</Label>
                  <Input
                    id="maxScore"
                    type="number"
                    placeholder="100"
                    min="1"
                    value={currentGrading.maxScore}
                    onChange={(e) =>
                      setCurrentGrading({
                        ...currentGrading,
                        maxScore: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback">Feedback</Label>
                <Textarea
                  id="feedback"
                  placeholder="Enter your feedback for the student..."
                  rows={8}
                  value={currentGrading.feedback}
                  onChange={(e) =>
                    setCurrentGrading({
                      ...currentGrading,
                      feedback: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">Preview Document</p>
                  <p className="text-xs text-muted-foreground">
                    View the full submission before grading
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to={`/app/documents/${currentGrading.documentId}`}
                    target="_blank"
                  >
                    Open Document
                  </Link>
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={closeGradingDialog}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => submitGrade('draft')}
              disabled={gradeFetcher.state !== 'idle'}
            >
              {gradeFetcher.state !== 'idle' ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button
              onClick={() => submitGrade('released')}
              disabled={gradeFetcher.state !== 'idle'}
            >
              {gradeFetcher.state !== 'idle' ? 'Releasing...' : 'Release to Student'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkGradingDialogOpen} onOpenChange={setBulkGradingDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Grade Submissions</DialogTitle>
            <DialogDescription>
              Grading {selectedSubmissions.size} submission
              {selectedSubmissions.size !== 1 ? 's' : ''}. The same grade and
              feedback will be applied to all selected submissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-score">Score</Label>
                <Input
                  id="bulk-score"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="0.5"
                  value={bulkGrading.score}
                  onChange={(e) =>
                    setBulkGrading({ ...bulkGrading, score: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-maxScore">Max Score</Label>
                <Input
                  id="bulk-maxScore"
                  type="number"
                  placeholder="100"
                  min="1"
                  value={bulkGrading.maxScore}
                  onChange={(e) =>
                    setBulkGrading({ ...bulkGrading, maxScore: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-feedback">Feedback</Label>
              <Textarea
                id="bulk-feedback"
                placeholder="Enter feedback that will be applied to all selected submissions..."
                rows={8}
                value={bulkGrading.feedback}
                onChange={(e) =>
                  setBulkGrading({ ...bulkGrading, feedback: e.target.value })
                }
              />
            </div>

            <div className="rounded-lg border bg-muted p-3">
              <p className="text-sm font-medium">Selected Submissions:</p>
              <div className="mt-2 max-h-32 overflow-y-auto">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {filteredSubmissions
                    .filter((s) => selectedSubmissions.has(s.id))
                    .map((s) => (
                      <li key={s.id}>
                        • {s.profile.user.name || s.profile.user.email} -{' '}
                        {s.title}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={closeBulkGradingDialog}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => submitBulkGrade('draft')}
              disabled={bulkGradeFetcher.state !== 'idle'}
            >
              {bulkGradeFetcher.state !== 'idle'
                ? 'Saving...'
                : 'Save as Draft'}
            </Button>
            <Button
              onClick={() => submitBulkGrade('released')}
              disabled={bulkGradeFetcher.state !== 'idle'}
            >
              {bulkGradeFetcher.state !== 'idle'
                ? 'Releasing...'
                : 'Release to Students'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={selectedPasteContent !== null} onOpenChange={(open) => !open && setSelectedPasteContent(null)}>
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
    </section>
  );
}
