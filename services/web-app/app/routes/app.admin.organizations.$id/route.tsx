import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
  redirect,
} from 'react-router';
import { useLoaderData, useFetcher } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireMembership } from '~/utils/auth.server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { ChevronLeft, Settings, UserPlus, TrashIcon } from 'lucide-react';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { Badge } from '~/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import React from 'react';
import { sendEmail } from '~/utils/email.server';
import * as E from '@react-email/components';
import { requireAdmin } from '~/utils/auth.server';
import { generateTOTP } from '~/utils/totp.server';
import { getDomainUrl } from '~/utils/misc';
import { Prisma } from '@app/prisma';
import { normalizeEmail } from '~/utils/normalize-email';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await requireAdmin(request);
  const profile = await requireMembership(request, currentUser.id);

  const [
    organization,
    invitations,
    totalOrganizations,
    assignmentTypes,
  ] =
    await Promise.all([
    prisma.organization.findUnique({
      where: { id: params.id },
      include: {
        memberships: {
          where: { isOrgOwner: true },
          include: { user: { select: { name: true, email: true } } },
        },
        assignmentTypeAssignments: {
          include: {
            assignmentType: {
              select: { id: true, title: true, description: true },
            },
          },
          orderBy: { assignmentType: { position: 'asc' } },
        },
      },
    }),
    prisma.invitation.findMany({
      where: {
        metadata: JSON.stringify({ organizationId: params.id }),
        type: 'onboard-owner',
      },
    }),
    prisma.organization.count(),
    prisma.assignmentType.findMany({
      where: { archivedAt: null },
      select: { id: true, title: true, description: true },
      orderBy: { position: 'asc' },
    }),
  ]);

  if (!organization) {
    throw new Response('Not Found', { status: 404 });
  }

  // Check if current user is assigned to this organization
  const isUserAssignedToOrg = profile?.organization?.id === params.id;
  // Check if this is the only organization
  const isOnlyOrganization = totalOrganizations <= 1;

  return dataResponse({
    organization,
    invitations,
    assignmentTypes,
    canDelete: !isUserAssignedToOrg && !isOnlyOrganization,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentAdmin = await requireAdmin(request);
  const userId = currentAdmin.id;
  const formData = await request.formData();
  const intent = formData.get('intent');
  const profile = await requireMembership(request, userId);

  if (intent === 'deleteOrganization') {
    // Get current user and organization count to validate deletion
    const [currentUser, totalOrganizations] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      }),
      prisma.organization.count(),
    ]);

    if (!currentUser) {
      throw new Response('User not found', { status: 404 });
    }

    // Prevent deletion if user is assigned to this organization
    if (profile?.organization.id === params.id) {
      throw new Response('Cannot delete organization you are assigned to it', {
        status: 400,
      });
    }

    // Prevent deletion if this is the only organization
    if (totalOrganizations <= 1) {
      throw new Response('Cannot delete the only organization', {
        status: 400,
      });
    }

    await prisma.organization.delete({
      where: { id: params.id },
    });

    return redirect('/app/admin/organizations');
  }

  if (intent === 'update') {
    const name = formData.get('name')?.toString();
    const numOfStudentSeats = parseInt(
      formData.get('numOfStudentSeats')?.toString() || '10'
    );
    const numOfTeacherSeats = parseInt(
      formData.get('numOfTeacherSeats')?.toString() || '10'
    );
    const accessExpiresAt = formData.get('accessExpiresAt')?.toString();
    const reporterEnabled = formData.get('reporterEnabled') === 'true';
    const classInsightsEnabled =
      formData.get('classInsightsEnabled') === 'true';
    const assignmentTypeIds = Array.from(
      new Set(
        formData
          .getAll('assignmentTypeIds')
          .map((value) => value.toString())
          .filter(Boolean)
      )
    );
    if (!name) {
      throw new Response('Name is required', { status: 400 });
    }

    if (assignmentTypeIds.length > 0) {
      const validAssignmentTypes = await prisma.assignmentType.findMany({
        where: { id: { in: assignmentTypeIds }, archivedAt: null },
        select: { id: true },
      });
      if (validAssignmentTypes.length !== assignmentTypeIds.length) {
        throw new Response('Assignment type not found', { status: 404 });
      }
    }

    await prisma.$transaction([
      prisma.organization.update({
        where: { id: params.id },
        data: {
          name,
          numOfStudentSeats,
          numOfTeacherSeats,
          accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
          reporterEnabled,
          classInsightsEnabled,
        },
      }),
      prisma.organizationAssignmentType.deleteMany({
        where: { organizationId: params.id },
      }),
      ...(assignmentTypeIds.length > 0
        ? [
            prisma.organizationAssignmentType.createMany({
              data: assignmentTypeIds.map((assignmentTypeId) => ({
                organizationId: params.id!,
                assignmentTypeId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return dataResponse({ status: 'success' });
  }

  if (intent === 'invite-owners') {
    const emails = formData.get('emails')?.toString().trim();
    if (!emails) {
      return dataResponse({ error: 'Emails are required' }, { status: 400 });
    }

    const emailList = Array.from(
      new Set(
        emails
          .split(/[,\n]/)
          .map((email: string) => normalizeEmail(email))
          .filter((email: string) => email && email.includes('@'))
      )
    );

    if (emailList.length === 0) {
      return dataResponse(
        { error: 'No valid emails provided' },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: params.id },
      select: { name: true },
    });

    let successCount = 0;
    for (const email of emailList) {
      try {
        // Check for existing verification and delete if found
        const existingInvitation = await prisma.invitation.findFirst({
          where: {
            target: { equals: email, mode: 'insensitive' },
            type: 'onboard-owner',
            metadata: JSON.stringify({ organizationId: params.id }),
          },
        });

        if (existingInvitation) {
          await prisma.invitation.delete({
            where: { id: existingInvitation.id },
          });
        }

        const { otp, ...verificationConfig } = await generateTOTP({
          algorithm: 'SHA-256',
          charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789', // Leaving off 0 and O on purpose to avoid confusing users.
          period: 3 * 24 * 60 * 60,
        });

        const type = 'onboard-owner';
        const target = email;
        const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
        verifyUrl.searchParams.set('type', type);
        verifyUrl.searchParams.set('target', target);
        verifyUrl.searchParams.set('code', otp);

        const verificationData: Prisma.InvitationCreateInput = {
          type,
          target,
          ...verificationConfig,
          expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
          metadata: JSON.stringify({ organizationId: params.id }),
        };

        await prisma.invitation.create({ data: verificationData });

        await sendEmail({
          to: email,
          subject: "You're invited to join your organization on Yawp!",
          react: (
            <OrganizationInviteEmail
              verifyUrl={verifyUrl.toString()}
              organizationName={organization?.name ?? 'your organization'}
              userType="owner"
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
      message: `Invitations sent to ${successCount} owners`,
      invited: successCount,
    });
  }

  return dataResponse({ status: 'error' });
}

function OrganizationInviteEmail({
  verifyUrl,
  userType,
  organizationName,
}: {
  verifyUrl: string;
  userType: 'teacher' | 'student' | 'owner';
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
            You've been invited to join {organizationName} as{' '}
            {userType === 'owner' ? 'an owner' : `a ${userType}`} on Yawp!
          </E.Text>
        </p>
        <p>
          <E.Text>Click the link to get started:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
        <p>
          <E.Text>
            This invitation will expire in 3 days for security reasons.
          </E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}

export default function OrganizationRoute() {
  const {
    organization,
    invitations,
    assignmentTypes,
    canDelete,
  } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const inviteFetcher = useFetcher();
  const [isEditSheetOpen, setIsEditSheetOpen] = React.useState(false);
  const [isInviteSheetOpen, setIsInviteSheetOpen] = React.useState(false);

  const owners = organization.memberships.filter(
    (membership) => membership.isOrgOwner
  );
  const assignedAssignmentTypeIds = new Set(
    organization.assignmentTypeAssignments.map(
      (assignment) => assignment.assignmentType.id
    )
  );

  React.useEffect(() => {
    if (fetcher.data?.status === 'success') {
      setIsEditSheetOpen(false);
    }
  }, [fetcher.data]);

  React.useEffect(() => {
    if (inviteFetcher.data?.success) {
      setIsInviteSheetOpen(false);
    }
  }, [inviteFetcher.data]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/organizations">
            <ChevronLeft size={18} />
            All organizations
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => setIsInviteSheetOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Owner
          </Button>
          <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Edit Organization
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Edit Organization</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-5">
                <input type="hidden" name="intent" value="update" />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={organization.name}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="numOfStudentSeats">Student Seats</Label>
                      <Input
                        id="numOfStudentSeats"
                        name="numOfStudentSeats"
                        type="number"
                        defaultValue={organization.numOfStudentSeats}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numOfTeacherSeats">Teacher Seats</Label>
                      <Input
                        id="numOfTeacherSeats"
                        name="numOfTeacherSeats"
                        type="number"
                        defaultValue={organization.numOfTeacherSeats}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accessExpiresAt">Access Expires At</Label>
                    <Input
                      id="accessExpiresAt"
                      name="accessExpiresAt"
                      type="datetime-local"
                      defaultValue={organization.accessExpiresAt
                        ?.toISOString()
                        .slice(0, 16)}
                    />
                  </div>
                </div>

                <div
                  className="border-t pt-5"
                  data-testid="organization-ai-feature-manager"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">
                      Production pilot features
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Roll out Class Summary and Yawp Reporter independently by
                      organization.
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="flex min-h-12 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="classInsightsEnabled"
                        value="true"
                        defaultChecked={organization.classInsightsEnabled}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">Class Summary</span>
                        <span className="block text-xs text-muted-foreground">
                          Enables assignment-level AI class summaries.
                        </span>
                      </span>
                    </label>
                    <label className="flex min-h-12 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="reporterEnabled"
                        value="true"
                        defaultChecked={organization.reporterEnabled}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          Yawp Reporter
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Adds Reporter to the teacher sidebar.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div
                  className="border-t pt-5"
                  data-testid="organization-assignment-types-manager"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">
                      Assignment Types
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Select the assignment types teachers in this organization
                      can see and use.
                    </p>
                  </div>
                  {assignmentTypes.length === 0 ? (
                    <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      No assignment types exist yet.
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {assignmentTypes.map((assignmentType) => (
                        <label
                          key={assignmentType.id}
                          className="flex min-h-12 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="assignmentTypeIds"
                            value={assignmentType.id}
                            defaultChecked={assignedAssignmentTypeIds.has(
                              assignmentType.id
                            )}
                            className="mt-1 h-4 w-4"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {assignmentType.title}
                            </span>
                            {assignmentType.description ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {assignmentType.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
          <ConfirmationDialog
            variant="destructive"
            title="Delete Organization"
            description={
              !canDelete
                ? "This organization cannot be deleted because either you are assigned to it or it's the only organization in the system."
                : `Are you sure you want to delete "${organization.name}"? This action cannot be undone and will permanently remove the organization and all its data.`
            }
            confirmText={canDelete ? 'Delete Organization' : 'Cannot Delete'}
            cancelText="Cancel"
            onConfirm={() => {
              if (canDelete) {
                fetcher.submit(
                  { intent: 'deleteOrganization' },
                  { method: 'post' }
                );
              }
            }}
            onCancel={() => {
              // Dialog will close automatically
            }}
          >
            <Button
              variant="destructive-outline"
              size="icon"
              disabled={!canDelete}
              title={
                !canDelete
                  ? "Cannot delete: you are assigned to this organization or it's the only organization"
                  : 'Delete organization'
              }
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </ConfirmationDialog>
        </div>
      </div>

      {/* Invite Owner Sheet */}
      <Sheet open={isInviteSheetOpen} onOpenChange={setIsInviteSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invite Owners</SheetTitle>
          </SheetHeader>
          <inviteFetcher.Form method="post" className="mt-4 space-y-4">
            <input type="hidden" name="intent" value="invite-owners" />
            <div className="space-y-2">
              <Label htmlFor="emails">
                Email addresses (comma or line separated)
              </Label>
              <Textarea
                id="emails"
                name="emails"
                placeholder="owner1@example.com, owner2@example.com"
                rows={4}
                required
              />
            </div>
            {inviteFetcher.data?.error && (
              <div className="text-sm text-red-600">
                {inviteFetcher.data.error}
              </div>
            )}
            {inviteFetcher.data?.success && (
              <div className="text-sm text-green-600">
                {inviteFetcher.data.message}
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={inviteFetcher.state !== 'idle'}
            >
              {inviteFetcher.state !== 'idle'
                ? 'Sending...'
                : 'Send Invitations'}
            </Button>
          </inviteFetcher.Form>
        </SheetContent>
      </Sheet>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Name
                </dt>
                <dd className="text-base font-medium">{organization.name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created At
                </dt>
                <dd className="text-base">
                  {new Date(organization.createdAt).toLocaleDateString()}
                </dd>
              </div>
              {organization.accessExpiresAt && (
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Access Expires
                  </dt>
                  <dd className="text-base">
                    {new Date(
                      organization.accessExpiresAt
                    ).toLocaleDateString()}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Owners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{owners.length}</div>
            <p className="text-sm text-muted-foreground">Owners enrolled</p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invitations.length}</div>
            <p className="text-sm text-muted-foreground">Pending invitations</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Organization Owners</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.length > 0 ? (
                owners.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{profile.user.name}</span>
                        <Badge variant="secondary">Owner</Badge>
                      </div>
                    </TableCell>
                    <TableCell>{profile.user.email}</TableCell>
                    <TableCell>
                      {new Date(profile.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    No owners found. Use the "Invite Owner" button to invite new
                    owners.
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
