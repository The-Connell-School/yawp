import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData, useFetcher } from 'react-router';
import { PlusIcon, Users, Mail, Trash2, Edit } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { ValidatedForm } from '@rvf/react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { NoDataPlaceholder } from '~/components/no-data-placeholder';
import { UserImage } from '~/components/user-image';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'My Classes' };

const createClassValidator = z.object({
  name: z.string().min(1, 'Class name is required'),
  description: z.string().optional(),
  intent: z.literal('createClass'),
});

const inviteStudentValidator = z.object({
  email: z.string().email('Valid email is required'),
  classId: z.string().min(1),
  intent: z.literal('inviteStudent'),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teacherProfile: {
        include: {
          teacherClasses: {
            include: {
              students: {
                include: {
                  user: {
                    include: {
                      image: true,
                      documents: {
                        include: {
                          courseModuleSessions: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user?.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  return dataResponse({
    teacherClasses: user.teacherProfile.teacherClasses,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'createClass') {
    const result = createClassValidator.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return dataResponse(
        { success: false, errors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId },
    });

    if (!teacherProfile) {
      return dataResponse(
        { success: false, error: 'Teacher profile not found' },
        { status: 404 }
      );
    }

    await prisma.teacherClass.create({
      data: {
        name: result.data.name,
        description: result.data.description || null,
        teacherProfileId: teacherProfile.id,
      },
    });

    return dataResponse({ success: true });
  }

  if (intent === 'inviteStudent') {
    const result = inviteStudentValidator.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return dataResponse(
        { success: false, errors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // TODO: Implement student invitation logic
    // This would involve creating a verification token and sending an email
    // For now, just return success
    return dataResponse({ success: true });
  }

  if (intent === 'deleteClass') {
    const classId = formData.get('classId') as string;
    await prisma.teacherClass.delete({
      where: { id: classId },
    });
    return dataResponse({ success: true });
  }

  return dataResponse({ success: false }, { status: 400 });
}

export default function MyClassesRoute() {
  const { teacherClasses } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const openInviteModal = (classId: string) => {
    setSelectedClassId(classId);
    setIsInviteModalOpen(true);
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <h2>My Classes</h2>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <PlusIcon className="mr-2 h-4 w-4" />
                New Class
              </Button>
            </div>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
              Manage your classes and students. Create new classes and invite students to join.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        {teacherClasses.length === 0 ? (
          <NoDataPlaceholder
            title="No classes yet"
            subtitle="Create your first class to start managing students."
            action={
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Class
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {teacherClasses.map((teacherClass) => (
              <Card key={teacherClass.id} className="flex flex-col">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{teacherClass.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openInviteModal(teacherClass.id)}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                    <fetcher.Form method="post" className="inline">
                      <input type="hidden" name="intent" value="deleteClass" />
                      <input type="hidden" name="classId" value={teacherClass.id} />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        type="submit"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </fetcher.Form>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  {teacherClass.description && (
                    <p className="mb-4 text-sm text-muted-foreground">
                      {teacherClass.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {teacherClass.students.length} students
                  </div>
                  {teacherClass.students.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-sm font-medium">Students:</h4>
                      <div className="space-y-1">
                        {teacherClass.students.slice(0, 3).map((student) => (
                          <div key={student.id} className="flex items-center gap-2">
                            <UserImage user={student.user} size="xs" />
                            <span className="text-sm">{student.user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({student.user.documents.length} docs)
                            </span>
                          </div>
                        ))}
                        {teacherClass.students.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{teacherClass.students.length - 3} more students
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Class Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Class</DialogTitle>
            <DialogDescription>
              Create a new class to organize and manage your students.
            </DialogDescription>
          </DialogHeader>
          <ValidatedForm
            schema={createClassValidator}
            method="post"
            fetcher={fetcher}
            defaultValues={{
              name: '',
              description: '',
              intent: 'createClass' as const,
            }}
            onSubmit={() => {
              if (fetcher.data?.success) {
                setIsCreateModalOpen(false);
              }
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Class Name</label>
                <Input name="name" placeholder="Enter class name" required />
              </div>
              <div>
                <label className="text-sm font-medium">Description (Optional)</label>
                <Input name="description" placeholder="Enter class description" />
              </div>
              <input type="hidden" name="intent" value="createClass" />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state === 'submitting'}>
                {fetcher.state === 'submitting' ? 'Creating...' : 'Create Class'}
              </Button>
            </DialogFooter>
          </ValidatedForm>
        </DialogContent>
      </Dialog>

      {/* Invite Student Modal */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Student</DialogTitle>
            <DialogDescription>
              Send an invitation email to a student to join this class.
            </DialogDescription>
          </DialogHeader>
          <ValidatedForm
            schema={inviteStudentValidator}
            method="post"
            fetcher={fetcher}
            defaultValues={{
              email: '',
              classId: selectedClassId,
              intent: 'inviteStudent' as const,
            }}
            onSubmit={() => {
              if (fetcher.data?.success) {
                setIsInviteModalOpen(false);
              }
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Student Email</label>
                <Input name="email" type="email" placeholder="student@example.com" required />
              </div>
              <input type="hidden" name="classId" value={selectedClassId} />
              <input type="hidden" name="intent" value="inviteStudent" />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state === 'submitting'}>
                {fetcher.state === 'submitting' ? 'Sending...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </ValidatedForm>
        </DialogContent>
      </Dialog>
    </section>
  );
}