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
import { Form } from 'react-router';
import React from 'react';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const organization = await prisma.organization.findUnique({
    where: { id: params.id },
    include: {
      users: {
        include: {
          studentProfile: true,
          teacherProfile: true,
          image: true,
        },
      },
    },
  });

  if (!organization) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ organization });
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

  return dataResponse({ status: 'error' });
}

export default function OrganizationRoute() {
  const { organization } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);

  const teachers = organization.users.filter((user) => user.teacherProfile);
  const students = organization.users.filter((user) => user.studentProfile);

  React.useEffect(() => {
    if (fetcher.data?.status === 'success') {
      setIsSheetOpen(false);
    }
  }, [fetcher.data]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/admin/organizations">
            <ChevronLeft size={18} />
            All organizations
          </Link>
        </Button>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
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
            <CardTitle>Student Seats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {students.length} / {organization.numOfStudentSeats}
            </div>
            <p className="text-sm text-muted-foreground">Students enrolled</p>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>Teacher Seats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teachers.length} / {organization.numOfTeacherSeats}
            </div>
            <p className="text-sm text-muted-foreground">Teachers enrolled</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Teachers</CardTitle>
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
                      <span>{user.name}</span>
                      {user.isOwner && <Badge variant="secondary">Owner</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {!user.teacherProfile?.isActive && (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Students</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserImage user={user} size="xs" />
                      <span>{user.name}</span>
                      {user.isOwner && <Badge variant="secondary">Owner</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                </TableRow>
              ))}
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
