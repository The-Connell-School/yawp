import {
  type ActionFunctionArgs,
  data as dataResponse,
  type LoaderFunctionArgs,
} from 'react-router';
import { useLoaderData, useFetcher } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { UserImage } from '~/components/user-image';
import { Badge } from '~/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { Users, UserPlus, Mail, Calendar } from 'lucide-react';
import React from 'react';
import { validateCSRF } from '~/utils/csrf.server';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { prepareVerification } from '~/routes/auth.verify/utils';
import { sendEmail } from '~/utils/email.server';
import * as E from '@react-email/components';

type UserWithProfiles = {
  id: string;
  email: string;
  name: string | null;
  password: { hash: string } | null;
  studentProfile: { id: string } | null;
  teacherProfile: { id: string; isActive: boolean } | null;
  image: { id: string; altText: string | null } | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      isOwner: true, 
      organization: {
        include: {
          users: {
            include: {
              studentProfile: true,
              teacherProfile: true,
              image: true,
              password: true,
            },
          },
        },
      },
    },
  });

  if (!user?.isOwner || !user.organization) {
    throw new Response('Unauthorized', { status: 401 });
  }

  // Filter users to only count those with single profiles for seat calculation
  const students = user.organization.users.filter(
    (u: UserWithProfiles) => u.studentProfile && !u.teacherProfile
  );
  const teachers = user.organization.users.filter((u: UserWithProfiles) => u.teacherProfile);

  // Get pending invitations (users without passwords)
  const pendingTeachers = teachers.filter((u: UserWithProfiles) => !u.password);
  const pendingStudents = students.filter((u: UserWithProfiles) => !u.password);

  return dataResponse({ 
    organization: user.organization,
    teachers,
    students,
    pendingTeachers,
    pendingStudents,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  await validateCSRF(formData, request.headers);
  const intent = formData.get('intent');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isOwner: true, organizationId: true },
  });

  if (!user?.isOwner || !user.organizationId) {
    throw new Response('Unauthorized', { status: 401 });
  }

  if (intent === 'create-teachers') {
    const emails = formData.get('emails')?.toString().trim();
    if (!emails) {
      return dataResponse({ error: 'Emails are required' }, { status: 400 });
    }

    const emailList = emails
      .split(/[,\n]/)
      .map((email: string) => email.trim())
      .filter((email: string) => email && email.includes('@'));

    if (emailList.length === 0) {
      return dataResponse({ error: 'No valid emails provided' }, { status: 400 });
    }

    // Create teachers in bulk
    const createdUsers = [];
    for (const email of emailList) {
      try {
        const newUser = await prisma.user.create({
          data: {
            email,
            organizationId: user.organizationId,
            teacherProfile: {
              create: {
                isActive: true,
              },
            },
          },
        });
        createdUsers.push(newUser);
      } catch (error) {
        // Skip if user already exists
        console.log(`User with email ${email} already exists`);
      }
    }

    return dataResponse({ 
      success: true, 
      message: `Created ${createdUsers.length} teachers`,
      created: createdUsers.length,
    });
  }

  if (intent === 'create-students') {
    const emails = formData.get('emails')?.toString().trim();
    if (!emails) {
      return dataResponse({ error: 'Emails are required' }, { status: 400 });
    }

    const emailList = emails
      .split(/[,\n]/)
      .map((email: string) => email.trim())
      .filter((email: string) => email && email.includes('@'));

    if (emailList.length === 0) {
      return dataResponse({ error: 'No valid emails provided' }, { status: 400 });
    }

    // Create students in bulk
    const createdUsers = [];
    for (const email of emailList) {
      try {
        const newUser = await prisma.user.create({
          data: {
            email,
            organizationId: user.organizationId,
            studentProfile: {
              create: {},
            },
          },
        });
        createdUsers.push(newUser);
      } catch (error) {
        // Skip if user already exists
        console.log(`User with email ${email} already exists`);
      }
    }

    return dataResponse({ 
      success: true, 
      message: `Created ${createdUsers.length} students`,
      created: createdUsers.length,
    });
  }

  if (intent === 'invite-teachers') {
    // Get all teachers without passwords (pending)
    const pendingTeachers = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        teacherProfile: { isNot: null },
        password: null,
      },
    });

    // Send invitation emails to teachers
    let successCount = 0;
    for (const teacher of pendingTeachers) {
      try {
        const { verifyUrl, otp } = await prepareVerification({
          period: 10 * 60, // 10 minutes
          request,
          type: 'organization-teacher-invite',
          target: teacher.email,
        });

        await sendEmail({
          to: teacher.email,
          subject: 'You\'re invited to join your organization on Yawp!',
          react: (
            <OrganizationInviteEmail 
              verifyUrl={verifyUrl.toString()} 
              otp={otp}
              userType="teacher"
            />
          ),
        });
        
        successCount++;
      } catch (error) {
        console.error(`Failed to send invitation to ${teacher.email}:`, error);
      }
    }

    return dataResponse({ 
      success: true, 
      message: `Invitations sent to ${successCount} teachers`,
      invited: successCount,
    });
  }

  if (intent === 'invite-students') {
    // Get all students without passwords (pending)
    const pendingStudents = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        studentProfile: { isNot: null },
        teacherProfile: null,
        password: null,
      },
    });

    // Send invitation emails to students
    let successCount = 0;
    for (const student of pendingStudents) {
      try {
        const { verifyUrl, otp } = await prepareVerification({
          period: 10 * 60, // 10 minutes
          request,
          type: 'organization-student-invite',
          target: student.email,
        });

        await sendEmail({
          to: student.email,
          subject: 'You\'re invited to join your organization on Yawp!',
          react: (
            <OrganizationInviteEmail 
              verifyUrl={verifyUrl.toString()} 
              otp={otp}
              userType="student"
            />
          ),
        });
        
        successCount++;
      } catch (error) {
        console.error(`Failed to send invitation to ${student.email}:`, error);
      }
    }

    return dataResponse({ 
      success: true, 
      message: `Invitations sent to ${successCount} students`,
      invited: successCount,
    });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function OrganizationRoute() {
  const { organization, teachers, students, pendingTeachers, pendingStudents } = 
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isCreateTeachersOpen, setIsCreateTeachersOpen] = React.useState(false);
  const [isCreateStudentsOpen, setIsCreateStudentsOpen] = React.useState(false);

  React.useEffect(() => {
    if (fetcher.data?.success) {
      setIsCreateTeachersOpen(false);
      setIsCreateStudentsOpen(false);
    }
  }, [fetcher.data]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Organization Dashboard</h1>
          <p className="text-muted-foreground">{organization.name}</p>
        </div>
      </div>

      {/* Organization Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teachers.length} / {organization.numOfTeacherSeats}
            </div>
            <p className="text-xs text-muted-foreground">
              {organization.numOfTeacherSeats - teachers.length} seats available
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {students.length} / {organization.numOfStudentSeats}
            </div>
            <p className="text-xs text-muted-foreground">
              {organization.numOfStudentSeats - students.length} seats available
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingTeachers.length + pendingStudents.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {pendingTeachers.length} teachers, {pendingStudents.length} students
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Access Expires</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {organization.accessExpiresAt
                ? new Date(organization.accessExpiresAt).toLocaleDateString()
                : 'Never'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Sheet open={isCreateTeachersOpen} onOpenChange={setIsCreateTeachersOpen}>
          <SheetTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Teachers
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Add Teachers</SheetTitle>
            </SheetHeader>
            <fetcher.Form method="post" className="mt-4 space-y-4">
              <AuthenticityTokenInput />
              <input type="hidden" name="intent" value="create-teachers" />
              <div className="space-y-2">
                <Label htmlFor="emails">Email Addresses</Label>
                <Textarea
                  id="emails"
                  name="emails"
                  placeholder="Enter email addresses, separated by commas or new lines"
                  rows={6}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter one email per line or separate with commas
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={fetcher.state !== 'idle'}
              >
                {fetcher.state !== 'idle' ? 'Creating...' : 'Create Teachers'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>

        <Sheet open={isCreateStudentsOpen} onOpenChange={setIsCreateStudentsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Students
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Add Students</SheetTitle>
            </SheetHeader>
            <fetcher.Form method="post" className="mt-4 space-y-4">
              <AuthenticityTokenInput />
              <input type="hidden" name="intent" value="create-students" />
              <div className="space-y-2">
                <Label htmlFor="emails">Email Addresses</Label>
                <Textarea
                  id="emails"
                  name="emails"
                  placeholder="Enter email addresses, separated by commas or new lines"
                  rows={6}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter one email per line or separate with commas
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={fetcher.state !== 'idle'}
              >
                {fetcher.state !== 'idle' ? 'Creating...' : 'Create Students'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>

        {pendingTeachers.length > 0 && (
          <fetcher.Form method="post" className="inline">
            <AuthenticityTokenInput />
            <input type="hidden" name="intent" value="invite-teachers" />
            <Button
              type="submit"
              variant="secondary"
              disabled={fetcher.state !== 'idle'}
            >
              <Mail className="mr-2 h-4 w-4" />
              Invite Teachers ({pendingTeachers.length})
            </Button>
          </fetcher.Form>
        )}

        {pendingStudents.length > 0 && (
          <fetcher.Form method="post" className="inline">
            <AuthenticityTokenInput />
            <input type="hidden" name="intent" value="invite-students" />
            <Button
              type="submit"
              variant="secondary"
              disabled={fetcher.state !== 'idle'}
            >
              <Mail className="mr-2 h-4 w-4" />
              Invite Students ({pendingStudents.length})
            </Button>
          </fetcher.Form>
        )}
      </div>

      {/* Teachers Table */}
      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Teachers ({teachers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserImage user={user} size="xs" />
                      <span>{user.name || 'Not set'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {!user.password ? (
                      <Badge variant="outline">Pending Invite</Badge>
                    ) : !user.teacherProfile?.isActive ? (
                      <Badge variant="destructive">Inactive</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {teachers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No teachers added yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Students Table */}
      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Students ({students.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserImage user={user} size="xs" />
                      <span>{user.name || 'Not set'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {!user.password ? (
                      <Badge variant="outline">Pending Invite</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No students added yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

function OrganizationInviteEmail({
  verifyUrl,
  otp,
  userType,
}: {
  verifyUrl: string;
  otp: string;
  userType: 'teacher' | 'student';
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Welcome to Yawp!</E.Text>
        </h1>
        <p>
          <E.Text>
            You've been invited to join your organization as a {userType} on Yawp!
          </E.Text>
        </p>
        <p>
          <E.Text>
            Here's your verification code: <strong>{otp}</strong>
          </E.Text>
        </p>
        <p>
          <E.Text>Or click the link to get started:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
        <p>
          <E.Text>
            This invitation will expire in 10 minutes for security reasons.
          </E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}