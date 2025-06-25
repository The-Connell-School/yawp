import {
  data as dataResponse,
  useFetcher,
  type LoaderFunctionArgs,
  useLoaderData,
  type ActionFunctionArgs,
  redirect,
  useNavigate,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { GrowthChart } from '~/components/growth-chart';
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
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react';
import { requireUserId } from '~/utils/auth.server';
import {
  getOrganizationTableCookie,
  getOrganizationTableCookieValue,
  OrganizationTableCookie,
  setOrganizationTableCookie,
} from '~/utils/cookies.server';
import { requireAdmin } from '~/utils/permissions';
import { Pagination } from '~/components/table/pagination';
import { Checkbox } from '~/components/ui/checkbox';
import { CookieColumns, useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { useEffect, useState } from 'react';

type Stats = {
  total_organizations: number;
  active_organizations: number;
  total_students: number;
  total_teachers: number;
};

const COLUMNS: CookieColumns = {
  name: {
    label: 'Name',
    value: 'name',
  },
  createdAt: {
    label: 'Created At',
    value: 'createdAt',
    formatter: (value) => new Date(value),
  },
  users: {
    label: 'Users',
    formatter: (value) => value.length,
  },
  studentSeats: {
    label: 'Student Seats',
  },
  teacherSeats: {
    label: 'Teacher Seats',
  },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const { sort, direction, skip, take } =
    await getOrganizationTableCookie(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const [organizations, totalCount, stats] = await Promise.all([
    prisma.organization.findMany({
      skip,
      take,
      include: {
        users: {
          include: {
            studentProfile: true,
            teacherProfile: true,
          },
        },
      },
      orderBy: {
        [sort ?? 'createdAt']: direction === 'asc' ? 'asc' : 'desc',
      },
    }),
    prisma.organization.count(),
    prisma.$queryRaw<Stats[]>`
      SELECT
        COUNT(DISTINCT o.id)::int as total_organizations,
        COUNT(DISTINCT CASE WHEN o."createdAt" > NOW() - INTERVAL '30 days' THEN o.id END)::int as active_organizations,
        COUNT(DISTINCT CASE WHEN sp.id IS NOT NULL THEN u.id END)::int as total_students,
        COUNT(DISTINCT CASE WHEN tp.id IS NOT NULL THEN u.id END)::int as total_teachers
      FROM "Organization" o
      LEFT JOIN "User" u ON u."organizationId" = o.id
      LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
      LEFT JOIN "TeacherProfile" tp ON tp."userId" = u.id
    `,
  ]);

  const growthData = await prisma.organization.groupBy({
    by: ['createdAt'],
    _count: true,
    orderBy: { createdAt: 'asc' },
  });

  return dataResponse({
    organizations,
    stats: stats[0],
    growthData,
    totalCount,
    table: { sort, direction, skip, take },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create') {
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

    const organization = await prisma.organization.create({
      data: {
        name,
        numOfStudentSeats,
        numOfTeacherSeats,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
      },
    });

    return redirect(`/app/admin/organizations/${organization.id}`);
  }

  if (intent === 'updateFilters') {
    let filters = await getOrganizationTableCookie(request);
    const key = formData.get('key') as
      | keyof OrganizationTableCookie
      | 'skip-take'
      | 'reset';
    const value = formData.get('value') as string;

    if (key === 'sort') {
      const [field, direction] = value.split('-');
      filters.sort = field as 'name' | 'createdAt';
      filters.direction = direction as 'asc' | 'desc';
    } else if (key === 'skip-take') {
      const [skip, take] = value.split('-');
      filters.skip = Number(skip);
      filters.take = Number(take);
    } else if (key === 'reset') {
      filters = JSON.parse(value) as OrganizationTableCookie;
    } else {
      filters[key] = getOrganizationTableCookieValue(key, value) as never;
    }

    const cookie = await setOrganizationTableCookie(request, filters);
    return dataResponse(
      { success: true },
      { headers: { 'Set-Cookie': cookie } }
    );
  }
  return {};
}

export default function OrganizationsRoute() {
  const { organizations, stats, growthData, totalCount, table } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { selected, handleSelectAll, handleSort, handleSelect } = useTable({
    rows: organizations,
  });

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setIsSheetOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="p-3 sm:p-5">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="grid gap-4 grid-cols-2">
          <Card className="bg-muted">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.total_organizations}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.active_organizations}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_students}</div>
            </CardContent>
          </Card>
          <Card className="bg-muted">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Teachers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_teachers}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-muted flex-1">
          <CardHeader>
            <CardTitle>Organization Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <GrowthChart data={growthData} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 flex-col mt-4">
        <div className="flex justify-end mb-4">
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create Organization</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="create" />
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numOfStudentSeats">
                    Number of Student Seats
                  </Label>
                  <Input
                    id="numOfStudentSeats"
                    name="numOfStudentSeats"
                    type="number"
                    defaultValue="10"
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
                    defaultValue="10"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accessExpiresAt">Access Expires At</Label>
                  <Input
                    id="accessExpiresAt"
                    name="accessExpiresAt"
                    type="datetime-local"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state === 'idle'
                    ? 'Create Organization'
                    : 'Creating...'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1 overflow-y-auto">
          {fetcher.state !== 'idle' ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="mt-2 text-sm text-muted-foreground">
                Loading...
              </span>
            </div>
          ) : organizations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <span className="text-lg font-bold">No results</span>
              <span className="text-sm text-muted-foreground">
                Try adjusting your filters
              </span>
            </div>
          ) : (
            <Table className="rounded-lg">
              <TableHeader className="rounded-t-lg">
                <TableRow className="bg-muted/50 rounded-t-lg">
                  <TableHead className="w-[50px] pl-4 rounded-tl-lg">
                    <Checkbox
                      checked={selected.length === organizations.length}
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
                {organizations.map((organization) => (
                  <TableRow
                    key={organization.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      navigate(`/app/admin/organizations/${organization.id}`)
                    }
                  >
                    <TableCell className="max-h-[37px] pl-4">
                      <Checkbox
                        checked={selected.includes(organization.id)}
                        onCheckedChange={() => handleSelect(organization.id)}
                      />
                    </TableCell>
                    <TableCell>{organization.name}</TableCell>
                    <TableCell>
                      {organization.createdAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell>{organization.users.length}</TableCell>
                    <TableCell>
                      {
                        organization.users.filter(
                          (user) => user.studentProfile && !user.isOwner
                        ).length
                      }{' '}
                      / {organization.numOfStudentSeats}
                    </TableCell>
                    <TableCell>
                      {
                        organization.users.filter((user) => user.teacherProfile)
                          .length
                      }{' '}
                      / {organization.numOfTeacherSeats}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="px-4 pb-8 pt-2">
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
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
