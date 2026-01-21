import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { useLoaderData } from 'react-router';
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

  // Get submitted documents for this class
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
    },
    orderBy: {
      submittedAt: 'desc',
    },
  });

  return dataResponse({ klass, profiles, pasteAlerts, submittedDocuments });
}

export default function ClassDetailRoute() {
  const data = useLoaderData<typeof loader>();
  console.log(data);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [selectedPasteContent, setSelectedPasteContent] = useState<string | null>(
    null
  );
  const students = data.klass.students;

  const selectedDocs = selectedProfileId
    ? (data.profiles.find((p) => p.id === selectedProfileId)?.documents ?? [])
    : [];

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
              Submitted Papers ({data.submittedDocuments.length})
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
            {data.submittedDocuments.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p>No submitted essays yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Essay Title</TableHead>
                    <TableHead>Course Module</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.submittedDocuments.map((doc) => (
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
                        {new Date(doc.submittedAt!).toLocaleDateString()}{' '}
                        {new Date(doc.submittedAt!).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to={`/app/documents/${doc.id}?exitTo=/app/my-classes/${data.klass.id}`}
                          >
                            View Essay
                          </Link>
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
