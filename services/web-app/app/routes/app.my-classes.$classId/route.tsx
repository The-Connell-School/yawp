import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { useLoaderData } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
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
  });

  return dataResponse({ klass, profiles });
}

export default function ClassDetailRoute() {
  const data = useLoaderData<typeof loader>();
  console.log(data);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
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
            {data.klass.school?.name ? (
              <p className="mt-1 text-muted-foreground">
                {data.klass.school.name}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground/80">Students ({students.length})</h3>
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
