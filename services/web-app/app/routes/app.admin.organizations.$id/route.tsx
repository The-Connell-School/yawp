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
import { requireAdmin } from '~/utils/permissions';
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
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { prepareVerification } from '~/routes/auth.verify/utils';
import { sendEmail } from '~/utils/email.server';
import * as E from '@react-email/components';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [organization, invitations] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: params.id },
      include: {
        users: {
          where: { isOwner: true },
          include: { image: { select: { id: true } } },
        },
      },
    }),
    prisma.verification.findMany({
      where: {
        organizationId: params.id,
        type: 'organization-owner-invite',
      },
    }),
  ]);

  if (!organization) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ organization, invitations });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    throw new Response('Unauthorized', { status: 401 });
  }

  if (intent === 'deleteOrganization') {
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

    if (!name) {
      throw new Response('Name is required', { status: 400 });
    }

    await prisma.organization.update({
      where: { id: params.id },
      data: {
        name,
        numOfStudentSeats,
        numOfTeacherSeats,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'invite-owners') {
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

    const organization = await prisma.organization.findUnique({
      where: { id: params.id },
      select: { name: true },
    });

    let successCount = 0;
    for (const email of emailList) {
      try {
        // Check for existing verification and delete if found
        const existingVerification = await prisma.verification.findFirst({
          where: {
            target: email,
            type: 'organization-owner-invite',
            organizationId: params.id,
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
          type: 'organization-owner-invite',
          target: email,
          organizationId: params.id,
        });

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
  const { organization, invitations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const inviteFetcher = useFetcher();
  const [isEditSheetOpen, setIsEditSheetOpen] = React.useState(false);
  const [isInviteSheetOpen, setIsInviteSheetOpen] = React.useState(false);

  const owners = organization.users.filter((user) => user.isOwner);

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
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit Organization</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="update" />
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={organization.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numOfStudentSeats">
                    Number of Student Seats
                  </Label>
                  <Input
                    id="numOfStudentSeats"
                    name="numOfStudentSeats"
                    type="number"
                    defaultValue={organization.numOfStudentSeats}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numOfTeacherSeats">
                    Number of Teacher Seats
                  </Label>
                  <Input
                    id="numOfTeacherSeats"
                    name="numOfTeacherSeats"
                    type="number"
                    defaultValue={organization.numOfTeacherSeats}
                    required
                  />
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
            description={`Are you sure you want to delete "${organization.name}"? This action cannot be undone and will permanently remove the organization and all its data.`}
            confirmText="Delete Organization"
            cancelText="Cancel"
            onConfirm={() => {
              fetcher.submit({ intent: 'deleteOrganization' }, { method: 'post' });
            }}
            onCancel={() => {
              // Dialog will close automatically
            }}
          >
            <Button variant="destructive-outline" size="icon">
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
            <AuthenticityTokenInput />
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
                owners.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserImage user={user} size="xs" />
                        <span>{user.name}</span>
                        <Badge variant="secondary">Owner</Badge>
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
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
