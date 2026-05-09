import {
  data as dataResponse,
  useFetcher,
  type LoaderFunctionArgs,
  useLoaderData,
  type ActionFunctionArgs,
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
import { Switch } from '~/components/ui/switch';
import {
  getTargetedFeatureFlagIds,
  setTargetedFeatureFlagTarget,
} from '~/utils/feature-flags.server';
import { requireUserId } from '~/utils/auth.server';
import {
  getOrganizationTableCookie,
  getOrganizationTableCookieValue,
  OrganizationTableCookie,
  setOrganizationTableCookie,
} from '~/utils/cookies.server';
import { Pagination } from '~/components/table/pagination';
import { CookieColumns, useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { useState } from 'react';
import { requireAdmin } from '~/utils/auth.server';
import { z } from 'zod';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { FormInput } from '~/components/forms/form-input-2';

type Stats = {
  total_organizations: number;
  active_organizations: number;
  total_students: number;
  total_teachers: number;
};

const CreateOrganizationSchema = z.object({
  name: z.string(),
  numOfStudentSeats: z.string().refine((value) => !isNaN(Number(value)), {
    message: 'Number of student seats must be a number',
  }),
  numOfTeacherSeats: z.string().refine((value) => !isNaN(Number(value)), {
    message: 'Number of teacher seats must be a number',
  }),
  accessExpiresAt: z.string().optional(),
});

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

  const [organizations, totalCount, stats, enabledAssignmentOrgIds] =
    await Promise.all([
    prisma.organization.findMany({
      skip,
      take,
      include: {
        profiles: {
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
        (SELECT COUNT(*) FROM "Organization")::int as total_organizations,
        (SELECT COUNT(*) FROM "Organization" WHERE "createdAt" > NOW() - INTERVAL '30 days')::int as active_organizations,
        (SELECT COUNT(*) FROM "StudentProfile")::int as total_students,
        (SELECT COUNT(*) FROM "TeacherProfile")::int as total_teachers
    `,
    getTargetedFeatureFlagIds('assignments'),
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
    enabledAssignmentOrgIds: Array.from(enabledAssignmentOrgIds),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();

  if (formData.get('intent') === 'create') {
    const { error, data } = await parseFormData(
      formData,
      CreateOrganizationSchema
    );
    if (error) return validationError(error);

    await prisma.organization.create({
      data: {
        name: data.name,
        numOfStudentSeats: Number(data.numOfStudentSeats),
        numOfTeacherSeats: Number(data.numOfTeacherSeats),
        accessExpiresAt: data.accessExpiresAt
          ? new Date(data.accessExpiresAt)
          : null,
      },
    });

    return dataResponse({ success: true });
  }

  if (formData.get('intent') === 'toggle-assignments') {
    const organizationId = formData.get('organizationId') as string;
    const enabled = formData.get('enabled') === 'true';

    if (!organizationId) {
      return dataResponse(
        { error: 'Organization is required.' },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      return dataResponse(
        { error: 'Organization not found.' },
        { status: 404 }
      );
    }

    await setTargetedFeatureFlagTarget('assignments', organizationId, enabled);

    return dataResponse({ success: true });
  }

  if (formData.get('intent') === 'updateFilters') {
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

  return new Response('Method not allowed', { status: 405 });
}

export default function OrganizationsRoute() {
  const {
    organizations,
    stats,
    growthData,
    totalCount,
    table,
    enabledAssignmentOrgIds,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const assignFetcher = useFetcher({ key: 'toggle-assignments' });
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { handleSort } = useTable({ rows: organizations });

  const form = useForm({
    schema: CreateOrganizationSchema,
    method: 'POST',
    defaultValues: {
      name: '',
      numOfStudentSeats: '10',
      numOfTeacherSeats: '10',
    },
    onSubmitSuccess: () => setIsSheetOpen(false),
  });

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
              <fetcher.Form className="mt-4 space-y-4" {...form.getFormProps()}>
                <input type="hidden" name="intent" value="create" />
                <FormInput scope={form.scope('name')} label="Name" />
                <FormInput
                  scope={form.scope('numOfStudentSeats')}
                  label="Number of Student Seats"
                  type="number"
                />
                <FormInput
                  scope={form.scope('numOfTeacherSeats')}
                  label="Number of Teacher Seats"
                  type="number"
                />
                <FormInput
                  scope={form.scope('accessExpiresAt')}
                  label="Access Expires At"
                  type="date"
                />
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
            <div className="flex h-full flex-col items-center justify-center gap-4 border border-dashed bg-muted p-8">
              <div className="flex flex-col items-center gap-2">
                <span className="text-lg font-bold">No results</span>
                <span className="text-sm text-muted-foreground">
                  Try adjusting your filters
                </span>
              </div>
              {table.skip > 0 && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    You're viewing page {Math.floor(table.skip / table.take) + 1}. Results may be on other pages.
                  </p>
                  <Button
                    variant="default"
                    onClick={() => {
                      fetcher.submit(
                        {
                          intent: 'updateFilters',
                          key: 'skip-take',
                          value: `0-${table.take}`,
                        },
                        { method: 'POST' }
                      );
                    }}
                  >
                    Go to Page 1
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table className="rounded-lg">
              <TableHeader className="rounded-t-lg">
                <TableRow className="bg-muted/50 rounded-t-lg">
                  {Object.entries(COLUMNS).map(([key, { label, value }]) => (
                    <TableHead key={key}>
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
                  <TableHead className="pr-4">Assignments</TableHead>
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
                    <TableCell>{organization.name}</TableCell>
                    <TableCell>
                      {organization.createdAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell>{organization.profiles.length}</TableCell>
                    <TableCell>
                      {
                        organization.profiles.filter(
                          (profile) =>
                            profile.studentProfile && !profile.isOwner
                        ).length
                      }{' '}
                      / {organization.numOfStudentSeats}
                    </TableCell>
                    <TableCell>
                      {
                        organization.profiles.filter(
                          (profile) => profile.teacherProfile
                        ).length
                      }{' '}
                      / {organization.numOfTeacherSeats}
                    </TableCell>
                    <TableCell
                      className="pr-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        checked={enabledAssignmentOrgIds.includes(
                          organization.id
                        )}
                        disabled={assignFetcher.state !== 'idle'}
                        onCheckedChange={(checked) => {
                          const formData = new FormData();
                          formData.append('intent', 'toggle-assignments');
                          formData.append('organizationId', organization.id);
                          formData.append(
                            'enabled',
                            checked ? 'true' : 'false'
                          );
                          assignFetcher.submit(formData, { method: 'POST' });
                        }}
                      />
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
