import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
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
import { ChevronLeft, Settings } from 'lucide-react';
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
import React from 'react';
import { requireAdmin } from '~/utils/auth.server';
import { listAdminOwnerInvitations } from '~/domain/organizations/owner-invitations.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await requireAdmin(request);
  const profile = await requireMembership(request, currentUser.id);

  const [organization, invitations, totalOrganizations, assignmentTypes] =
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
      listAdminOwnerInvitations(prisma, params.id),
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

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'deleteOrganization') {
    return dataResponse(
      {
        status: 'error',
        error:
          'Organization deletion is disabled on the platform admin surface.',
      },
      { status: 410 }
    );
  }

  if (intent === 'update') {
    return dataResponse(
      {
        status: 'error',
        error: 'Organization updates have moved to Yawp! Internal.',
      },
      { status: 410 }
    );
  }

  if (intent === 'legacy-update') {
    return dataResponse(
      {
        status: 'error',
        error: 'Organization updates have moved to Yawp! Internal.',
      },
      { status: 410 }
    );
  }

  if (intent === 'invite-owners') {
    return dataResponse(
      {
        status: 'error',
        error: 'Owner invitations are disabled on the platform admin surface.',
      },
      { status: 410 }
    );
  }

  return dataResponse({ status: 'error' });
}

export default function OrganizationRoute() {
  const { organization, invitations, assignmentTypes } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isEditSheetOpen, setIsEditSheetOpen] = React.useState(false);

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

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Organization create/update writes have moved to Yawp! Internal. This
        platform detail page is read-only for organization settings.
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/organizations">
            <ChevronLeft size={18} />
            All organizations
          </Link>
        </Button>
        <div className="flex gap-2">
          <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                disabled
                title="Edit organizations in Yawp! Internal"
              >
                <Settings className="mr-2 h-4 w-4" />
                Edit Organization
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-x-hidden sm:max-w-md">
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
                      Roll out pilot features independently by organization.
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
                          Enables assignment-level class summaries.
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
                        <span className="block font-medium">Yawp! Reporter</span>
                        <span className="block text-xs text-muted-foreground">
                          Retired: Reporter is always on for all organizations.
                          This toggle is kept for historical data only.
                        </span>
                      </span>
                    </label>
                    <label className="flex min-h-12 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="writingPracticeEnabled"
                        value="true"
                        defaultChecked={organization.writingPracticeEnabled}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          Writing Practice
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Retired: Writing Practice is always on for all
                          organizations. This toggle is kept for historical data
                          only.
                        </span>
                      </span>
                    </label>
                    <label className="flex min-h-12 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="submissionActivityEnabled"
                        value="true"
                        defaultChecked={organization.submissionActivityEnabled}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          Released grade activity
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Enables released-grade editing and staff-only
                          submission activity history.
                        </span>
                      </span>
                    </label>
                    <label className="flex min-h-12 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="revisionFlowEnabled"
                        value="true"
                        defaultChecked={organization.revisionFlowEnabled}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          Student revision flow
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Sends "Revise Essay" to the split-screen revision
                          page. Off keeps the current draft editor.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div
                  className="min-w-0 border-t pt-5"
                  data-testid="organization-assignment-types-manager"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Assignment Types</h3>
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
                    <div className="mt-3 grid min-w-0 gap-2">
                      {assignmentTypes.map((assignmentType) => (
                        <label
                          key={assignmentType.id}
                          className="flex min-h-12 min-w-0 items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="assignmentTypeIds"
                            value={assignmentType.id}
                            defaultChecked={assignedAssignmentTypeIds.has(
                              assignmentType.id
                            )}
                            className="mt-1 h-4 w-4 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium">
                              {assignmentType.title}
                            </span>
                            {assignmentType.description ? (
                              <span className="block break-words text-xs text-muted-foreground">
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
        </div>
      </div>

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
                    No owners found.
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
