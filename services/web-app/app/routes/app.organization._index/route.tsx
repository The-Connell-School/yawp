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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
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
import {
  Users,
  UserPlus,
  UserMinus,
  Mail,
  Calendar,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from 'lucide-react';
import React from 'react';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { prepareVerification } from '~/routes/auth.verify/utils';
import { sendEmail } from '~/utils/email.server';
import * as E from '@react-email/components';
import { Pagination } from '~/components/table/pagination';
import { Checkbox } from '~/components/ui/checkbox';
import { CookieColumns, useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import {
  getOrganizationMembersTableCookie,
  getOrganizationMembersTableCookieValue,
  OrganizationMembersTableCookie,
  setOrganizationMembersTableCookie,
} from '~/utils/cookies.server';
import { requireOwner } from '~/utils/permissions';

const COLUMNS: CookieColumns = {
  name: {
    label: 'Name',
    value: 'name',
  },
  email: {
    label: 'Email',
    value: 'email',
  },
  seat: {
    label: 'Seat',
    formatter: (value) => {
      if (value.teacherProfile) return 'Teacher';
      if (value.studentProfile) return 'Student';
      return 'Unassigned';
    },
  },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const { sort, direction, skip, take } =
    await getOrganizationMembersTableCookie(request);

  const [users, totalCount, organization, invitations] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: user.organization?.id },
      include: {
        studentProfile: { select: { id: true } },
        teacherProfile: { select: { id: true } },
      },
      orderBy: { [sort]: direction },
      skip,
      take,
    }),
    prisma.user.count({
      where: { organizationId: user.organization?.id },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: user.organization?.id },
      select: {
        name: true,
        numOfTeacherSeats: true,
        numOfStudentSeats: true,
        accessExpiresAt: true,
      },
    }),
    prisma.verification.findMany({
      where: {
        organizationId: user.organization?.id,
        type: {
          in: [
            'organization-teacher-invite',
            'organization-student-invite',
            'organization-owner-invite',
          ],
        },
      },
    }),
  ]);
  return dataResponse({
    organization,
    invitations,
    users,
    totalCount,
    table: { sort, direction, skip, take },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateFilters') {
    let filters = await getOrganizationMembersTableCookie(request);
    const key = formData.get('key') as
      | keyof OrganizationMembersTableCookie
      | 'skip-take'
      | 'reset';
    const value = formData.get('value') as string;

    if (key === 'sort') {
      const [field, direction] = value.split('-');
      filters.sort = field as 'name' | 'email';
      filters.direction = direction as 'asc' | 'desc';
    } else if (key === 'skip-take') {
      const [skip, take] = value.split('-');
      filters.skip = Number(skip);
      filters.take = Number(take);
    } else if (key === 'reset') {
      filters = JSON.parse(value) as OrganizationMembersTableCookie;
    } else {
      filters[key] = getOrganizationMembersTableCookieValue(
        key,
        value
      ) as never;
    }

    const cookie = await setOrganizationMembersTableCookie(request, filters);
    return dataResponse(
      { success: true },
      { headers: { 'Set-Cookie': cookie } }
    );
  }

  if (intent === 'invite-teachers') {
    const emails = formData.get('emails')?.toString().trim();
    if (!emails) {
      return dataResponse({ error: 'Emails are required' }, { status: 400 });
    }

    const emailList = emails
      .split(/[,\n]/)
      .map((email: string) => email.trim())
      .filter((email: string) => email && email.includes('@'));

    if (emailList.length === 0) {
      return dataResponse(
        { error: 'No valid emails provided' },
        { status: 400 }
      );
    }

    let successCount = 0;
    for (const email of emailList) {
      try {
        // Check for existing verification and delete if found
        const existingVerification = await prisma.verification.findFirst({
          where: {
            target: email,
            type: 'organization-teacher-invite',
            organizationId: user.organization?.id,
          },
        });

        if (existingVerification) {
          await prisma.verification.delete({
            where: { id: existingVerification.id },
          });
        }

        const { verifyUrl } = await prepareVerification({
          period: 3 * 24 * 60 * 60, // 3 days
          request,
          type: 'organization-teacher-invite',
          target: email,
          organizationId: user.organization?.id,
        });

        await sendEmail({
          to: email,
          subject: "You're invited to join your organization on Yawp!",
          react: (
            <OrganizationInviteEmail
              verifyUrl={verifyUrl.toString()}
              organizationName={user.organization?.name ?? 'your organization'}
              userType="teacher"
            />
          ),
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to send invitation to ${email}:`, error);
      }
    }

    return dataResponse({
      success: true,
      message: `Invitations sent to ${successCount} teachers`,
      invited: successCount,
    });
  }

  if (intent === 'invite-students') {
    const emails = formData.get('emails')?.toString().trim();
    if (!emails) {
      return dataResponse({ error: 'Emails are required' }, { status: 400 });
    }

    const emailList = emails
      .split(/[,\n]/)
      .map((email: string) => email.trim())
      .filter((email: string) => email && email.includes('@'));

    if (emailList.length === 0) {
      return dataResponse(
        { error: 'No valid emails provided' },
        { status: 400 }
      );
    }

    let successCount = 0;
    for (const email of emailList) {
      try {
        // Check for existing verification and delete if found
        const existingVerification = await prisma.verification.findFirst({
          where: {
            target: email,
            type: 'organization-student-invite',
            organizationId: user.organization?.id,
          },
        });

        if (existingVerification) {
          await prisma.verification.delete({
            where: { id: existingVerification.id },
          });
        }

        const { verifyUrl } = await prepareVerification({
          period: 3 * 24 * 60 * 60, // 3 days
          request,
          type: 'organization-student-invite',
          target: email,
          organizationId: user.organization?.id,
        });

        await sendEmail({
          to: email,
          subject: "You're invited to join your organization on Yawp!",
          react: (
            <OrganizationInviteEmail
              verifyUrl={verifyUrl.toString()}
              userType="student"
              organizationName={user.organization?.name ?? 'your organization'}
            />
          ),
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to send invitation to ${email}:`, error);
      }
    }

    return dataResponse({
      success: true,
      message: `Invitations sent to ${successCount} students`,
      invited: successCount,
    });
  }

  if (intent === 'remove-members') {
    const memberIds = formData.getAll('memberIds') as string[];
    if (!memberIds || memberIds.length === 0) {
      return dataResponse({ error: 'No members selected' }, { status: 400 });
    }

    // Prevent removing the last owner
    const owners = await prisma.user.count({
      where: { 
        organizationId: user.organization?.id, 
        isOwner: true,
        id: { notIn: memberIds }
      },
    });

    const removingOwners = await prisma.user.count({
      where: { 
        id: { in: memberIds },
        isOwner: true 
      },
    });

    if (removingOwners > 0 && owners === 0) {
      return dataResponse(
        { error: 'Cannot remove all owners from the organization' },
        { status: 400 }
      );
    }

    // Remove members from organization (don't delete users, just disassociate)
    const removedCount = await prisma.user.updateMany({
      where: {
        id: { in: memberIds },
        organizationId: user.organization?.id,
      },
      data: {
        organizationId: null,
        isOwner: false,
      },
    });

    return dataResponse({
      success: true,
      message: `${removedCount.count} member(s) removed from organization`,
      removed: removedCount.count,
    });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function OrganizationRoute() {
  const { users, totalCount, table, organization, invitations } =
    useLoaderData<typeof loader>();
  const teacherInvitations = invitations.filter(
    (invitation) => invitation.type === 'organization-teacher-invite'
  );
  const studentInvitations = invitations.filter(
    (invitation) => invitation.type === 'organization-student-invite'
  );
  const ownerInvitations = invitations.filter(
    (invitation) => invitation.type === 'organization-owner-invite'
  );
  const fetcher = useFetcher();
  const [isCreateTeachersOpen, setIsCreateTeachersOpen] = React.useState(false);
  const [isCreateStudentsOpen, setIsCreateStudentsOpen] = React.useState(false);
  const [isTeacherInvitationsOpen, setIsTeacherInvitationsOpen] =
    React.useState(false);
  const [isStudentInvitationsOpen, setIsStudentInvitationsOpen] =
    React.useState(false);
  const [isOwnerInvitationsOpen, setIsOwnerInvitationsOpen] =
    React.useState(false);
  const { selected, handleSelectAll, handleSort, handleSelect } = useTable({
    rows: users,
  });

  const owners = users.filter((user) => user.isOwner);
  const teachers = users.filter((user) => user.teacherProfile && !user.isOwner);
  const students = users.filter(
    (user) => user.studentProfile && !user.teacherProfile && !user.isOwner
  );

  React.useEffect(() => {
    if (fetcher.data?.success) {
      setIsCreateTeachersOpen(false);
      setIsCreateStudentsOpen(false);
    }
  }, [fetcher.data]);

  return (
    <div className="flex flex-col gap-4 p-3 md:p-5 h-screen overflow-auto">
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
            <CardTitle className="text-sm font-medium">
              Total Teachers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((user) => user.teacherProfile).length} /{' '}
              {organization.numOfTeacherSeats}
            </div>
            <p className="text-xs text-muted-foreground">
              {organization.numOfTeacherSeats - teachers.length} seats available
              <button
                onClick={() => setIsTeacherInvitationsOpen(true)}
                className={cn(
                  'ml-1',
                  teacherInvitations.length === 0
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-blue-600 hover:text-blue-800 underline'
                )}
                disabled={teacherInvitations.length === 0}
              >
                ({teacherInvitations.length} invited)
              </button>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Students
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {students.length} / {organization.numOfStudentSeats}
            </div>
            <p className="text-xs text-muted-foreground">
              {organization.numOfStudentSeats - students.length} seats available
              <button
                onClick={() => setIsStudentInvitationsOpen(true)}
                className={cn(
                  'ml-1',
                  studentInvitations.length === 0
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-blue-600 hover:text-blue-800 underline'
                )}
                disabled={studentInvitations.length === 0}
              >
                ({studentInvitations.length} invited)
              </button>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Owners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{owners.length}</div>
            <p className="text-xs text-muted-foreground">
              <button
                onClick={() => setIsOwnerInvitationsOpen(true)}
                className={cn(
                  'ml-1',
                  ownerInvitations.length === 0
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-blue-600 hover:text-blue-800 underline'
                )}
                disabled={ownerInvitations.length === 0}
              >
                ({ownerInvitations.length} invited)
              </button>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Access Expires
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div>
              {organization.accessExpiresAt
                ? new Date(organization.accessExpiresAt).toLocaleDateString()
                : 'Never'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Sheet
          open={isCreateTeachersOpen}
          onOpenChange={setIsCreateTeachersOpen}
        >
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
              <input type="hidden" name="intent" value="invite-teachers" />
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
                  Email invitations will be sent to the provided email addresses
                  if they are not already registered.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={fetcher.state !== 'idle'}
              >
                {fetcher.state !== 'idle' ? 'Inviting...' : 'Invite Teachers'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>

        <Sheet
          open={isCreateStudentsOpen}
          onOpenChange={setIsCreateStudentsOpen}
        >
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
              <input type="hidden" name="intent" value="invite-students" />
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
                {fetcher.state !== 'idle' ? 'Inviting...' : 'Invite Students'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>

        {/* Remove Members Button */}
        {selected.length > 0 && (
          <fetcher.Form method="post" className="inline">
            <AuthenticityTokenInput />
            <input type="hidden" name="intent" value="remove-members" />
            {selected.map((id) => (
              <input key={id} type="hidden" name="memberIds" value={id} />
            ))}
            <Button
              type="submit"
              variant="destructive"
              disabled={fetcher.state !== 'idle'}
              onClick={(e) => {
                if (!confirm(`Are you sure you want to remove ${selected.length} member(s) from the organization? They will lose access to the platform.`)) {
                  e.preventDefault();
                }
              }}
            >
              <UserMinus className="mr-2 h-4 w-4" />
              Remove {selected.length} Member{selected.length !== 1 ? 's' : ''}
            </Button>
          </fetcher.Form>
        )}
      </div>

      {/* Teacher Invitations Sheet */}
      <Sheet
        open={isTeacherInvitationsOpen}
        onOpenChange={setIsTeacherInvitationsOpen}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Pending Teacher Invitations</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {teacherInvitations.length === 0 ? (
              <p className="text-muted-foreground">
                No pending teacher invitations
              </p>
            ) : (
              <div className="space-y-2">
                {teacherInvitations.map((invitation) => (
                  <div key={invitation.id} className="p-3 border rounded-lg">
                    <p className="font-medium">{invitation.target}</p>
                    <p className="text-sm text-muted-foreground">
                      Invitation is valid until{' '}
                      {invitation.expiresAt
                        ? new Date(invitation.expiresAt).toLocaleString([], {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'Never'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => setIsTeacherInvitationsOpen(false)}
              className="w-full mt-6"
            >
              Ok
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Student Invitations Sheet */}
      <Sheet
        open={isStudentInvitationsOpen}
        onOpenChange={setIsStudentInvitationsOpen}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Pending Student Invitations</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {studentInvitations.length === 0 ? (
              <p className="text-muted-foreground">
                No pending student invitations
              </p>
            ) : (
              <div className="space-y-2">
                {studentInvitations.map((invitation) => (
                  <div key={invitation.id} className="p-3 border rounded-lg">
                    <p className="font-medium">{invitation.target}</p>
                    <p className="text-sm text-muted-foreground">
                      Invitation is valid until{' '}
                      {invitation.expiresAt
                        ? new Date(invitation.expiresAt).toLocaleString([], {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'Never'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => setIsStudentInvitationsOpen(false)}
              className="w-full mt-6"
            >
              Ok
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Owner Invitations Sheet */}
      <Sheet
        open={isOwnerInvitationsOpen}
        onOpenChange={setIsOwnerInvitationsOpen}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Pending Owner Invitations</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {ownerInvitations.length === 0 ? (
              <p className="text-muted-foreground">
                No pending owner invitations
              </p>
            ) : (
              <div className="space-y-2">
                {ownerInvitations.map((invitation) => (
                  <div key={invitation.id} className="p-3 border rounded-lg">
                    <p className="font-medium">{invitation.target}</p>
                    <p className="text-sm text-muted-foreground">
                      Invitation is valid until{' '}
                      {invitation.expiresAt
                        ? new Date(invitation.expiresAt).toLocaleString([], {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'Never'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => setIsOwnerInvitationsOpen(false)}
              className="w-full mt-6"
            >
              Ok
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Members Table */}
      <Card className="bg-muted flex-1">
        <CardHeader>
          <CardTitle>Members ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex-1 overflow-y-auto">
            {fetcher.state !== 'idle' ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="mt-2 text-sm text-muted-foreground">
                  Loading...
                </span>
              </div>
            ) : users.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
                <span className="text-lg font-bold">No members found</span>
                <span className="text-sm text-muted-foreground">
                  Try adding some members to your organization
                </span>
              </div>
            ) : (
              <Table className="rounded-lg">
                <TableHeader className="rounded-t-lg">
                  <TableRow className="bg-muted/50 rounded-t-lg">
                    <TableHead className="w-[50px] pl-4 rounded-tl-lg">
                      <Checkbox
                        checked={selected.length === users.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    {Object.entries(COLUMNS).map(([key, { label, value }]) => (
                      <TableHead
                        key={key}
                        className={
                          key ===
                          Object.keys(COLUMNS)[Object.keys(COLUMNS).length - 1]
                            ? 'pr-4'
                            : ''
                        }
                      >
                        <Button
                          variant="unstyled"
                          className={cn(
                            'h-8 p-0',
                            !value ? 'pointer-events-none' : ''
                          )}
                          onClick={() =>
                            value
                              ? handleSort(
                                  value,
                                  table.direction === 'asc' ? 'desc' : 'asc'
                                )
                              : undefined
                          }
                        >
                          {label}
                          {!value ? null : table.sort === value ? (
                            table.direction === 'desc' ? (
                              <ArrowUp
                                className="ml-2 h-4 w-4 text-primary"
                                strokeWidth={3}
                              />
                            ) : (
                              <ArrowDown
                                className="ml-2 h-4 w-4 text-primary"
                                strokeWidth={3}
                              />
                            )
                          ) : (
                            <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                          )}
                        </Button>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="max-h-[37px] pl-4">
                        <Checkbox
                          checked={selected.includes(user.id)}
                          onCheckedChange={() => handleSelect(user.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{user.name || 'Not set'}</span>
                          {user.isOwner && (
                            <Badge
                              variant="outline"
                              className="text-xs text-muted-foreground"
                            >
                              Owner
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.teacherProfile ? (
                          <Badge variant="info-outlined">Teacher</Badge>
                        ) : user.isOwner ? (
                          <span className="text-muted-foreground">N/A</span>
                        ) : user.studentProfile ? (
                          <Badge variant="secondary">Student</Badge>
                        ) : (
                          <Badge variant="outline">Unassigned</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="py-2">
            <Pagination
              totalCount={totalCount}
              skip={table.skip}
              take={table.take}
              onChange={(skip, take) => {
                fetcher.submit(
                  {
                    intent: 'updateFilters',
                    key: 'skip-take',
                    value: `${skip}-${take}`,
                  },
                  { method: 'POST' }
                );
              }}
            />
          </div>
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
  userType,
  organizationName,
}: {
  verifyUrl: string;
  userType: 'teacher' | 'student';
  organizationName: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Welcome to Yawp!</E.Text>
        </h1>
        <p>
          <E.Text>
            You've been invited to join {organizationName} as a {userType} on
            Yawp!
          </E.Text>
        </p>
        <p>
          <E.Text>Click the link to get started:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
        <p>
          <E.Text>
            This invitation will expire in 2 days for security reasons.
          </E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}
