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
import { CaretLeftIcon } from '~/components/icons';
import { useMemo, useState } from 'react';
import { DocumentLink } from '~/components/document-link';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }
  const classId = params.classId!;

  const [klass, profiles] = await Promise.all([
    prisma.class.findFirst({
      where: {
        id: classId,
        teachers: { some: { id: profile.teacherProfile.id } },
      },
      select: {
        id: true,
        name: true,
        code: true,
        grade: true,
        period: true,
        school: { select: { name: true } },
        students: {
          select: {
            id: true,
            profile: {
              select: {
                id: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.profile.findMany({
      where: {
        studentProfile: {
          classId,
        },
      },
      select: {
        id: true,
        user: { select: { name: true, email: true } },
        documents: {
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
          },
        },
      },
    }),
  ]);
  if (!klass) throw new Response('Class not found', { status: 404 });

  return dataResponse({ klass, profiles });
}

export default function ClassDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const students = data.klass.students;

  const selectedDocs = selectedProfileId
    ? (data.profiles.find((p) => p.id === selectedProfileId)?.documents ?? [])
    : [];

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.origin + '/auth/inv/signup');
    if (data.klass.code) url.searchParams.set('classCode', data.klass.code);
    return url.toString();
  }, [data.klass.code]);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>
              {data.klass.name || (
                <>
                  Grade {data.klass.grade} • Period {data.klass.period}
                </>
              )}
            </h2>
            {data.klass.school?.name ? (
              <p className="mt-1 text-muted-foreground">
                {data.klass.school.name}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button asChild variant="outline">
            <Link to="/app/my-classes" className="w-fit my-4">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to my classes
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            {data.klass.code ? (
              <>
                <div className="text-sm">
                  <span className="text-muted-foreground">Class code:</span>{' '}
                  <span className="font-mono font-semibold">
                    {data.klass.code}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(data.klass.code!)
                  }
                >
                  Copy code
                </Button>
                {inviteUrl ? (
                  <Button
                    variant="default"
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                  >
                    Copy invite link
                  </Button>
                ) : null}
              </>
            ) : null}
            <h3 className="text-foreground/80">{students.length} students</h3>
          </div>
        </div>
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
                    <span className="text-xs text-muted-foreground">View</span>
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
      </div>
    </section>
  );
}
