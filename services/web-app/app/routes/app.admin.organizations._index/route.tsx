import {
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react';
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
import { useEffect, useRef, useState } from 'react';
import { useForm } from '@rvf/react-router';
import { FormInput } from '~/components/forms/form-input-2';
import { CreateOrganizationSchema } from './schema';

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

export async function loader(args: LoaderFunctionArgs) {
  const { organizationsLoader } = await import('./route.server');
  return organizationsLoader(args);
}

export async function action(args: ActionFunctionArgs) {
  const { organizationsAction } = await import('./route.server');
  return organizationsAction(args);
}

export default function OrganizationsRoute() {
  const {
    organizations,
    stats,
    growthData,
    totalCount,
    table,
    previewSeatMode,
  } = useLoaderData<typeof loader>();
  const organizationFetcher = useFetcher();
  const seatFetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSeatSheetOpen, setIsSeatSheetOpen] = useState(false);
  const [copiedSeatCode, setCopiedSeatCode] = useState(false);
  const seatResultRef = useRef<HTMLDivElement>(null);
  const { handleSort } = useTable({ rows: organizations });
  const seatActionData = seatFetcher.data as
    | {
        error?: string;
        previewSeat?: {
          organizationName: string;
          previewSeatCode: string;
        };
      }
    | undefined;
  const createdSeat = seatActionData?.previewSeat;

  useEffect(() => {
    if (!createdSeat) return;
    setCopiedSeatCode(false);
    seatResultRef.current?.focus();
  }, [createdSeat]);

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
        <div className="mb-4 flex justify-end gap-2">
          {previewSeatMode ? (
            <Sheet open={isSeatSheetOpen} onOpenChange={setIsSeatSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Preview Seat
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Create Preview Seat</SheetTitle>
                </SheetHeader>
                <p className="mt-4 text-sm text-muted-foreground">
                  This creates a new isolated organization with the same
                  starting demo data as the Master seat. Existing seats are left
                  unchanged.
                </p>
                <seatFetcher.Form method="post" className="mt-6">
                  <input
                    type="hidden"
                    name="intent"
                    value="createPreviewSeat"
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={seatFetcher.state !== 'idle'}
                  >
                    {seatFetcher.state === 'idle'
                      ? 'Create and Seed Seat'
                      : 'Creating Seat...'}
                  </Button>
                </seatFetcher.Form>
                {createdSeat ? (
                  <div
                    ref={seatResultRef}
                    className="mt-6 rounded-lg border bg-muted p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    role="status"
                    aria-live="polite"
                    tabIndex={-1}
                  >
                    <p className="text-sm font-medium">Access code</p>
                    <code
                      className="mt-2 block select-all text-lg font-semibold"
                      data-preview-seat-code
                    >
                      {createdSeat.previewSeatCode}
                    </code>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {createdSeat.organizationName}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(createdSeat.previewSeatCode)
                          .then(() => setCopiedSeatCode(true));
                      }}
                    >
                      {copiedSeatCode ? 'Copied' : 'Copy Access Code'}
                    </Button>
                  </div>
                ) : seatActionData?.error ? (
                  <p
                    className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {seatActionData.error}
                  </p>
                ) : null}
              </SheetContent>
            </Sheet>
          ) : null}
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
              <organizationFetcher.Form
                className="mt-4 space-y-4"
                {...form.getFormProps()}
              >
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
                  disabled={organizationFetcher.state !== 'idle'}
                >
                  {organizationFetcher.state === 'idle'
                    ? 'Create Organization'
                    : 'Creating...'}
                </Button>
              </organizationFetcher.Form>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1 overflow-y-auto">
          {organizationFetcher.state !== 'idle' ? (
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
                    You're viewing page{' '}
                    {Math.floor(table.skip / table.take) + 1}. Results may be on
                    other pages.
                  </p>
                  <Button
                    variant="default"
                    onClick={() => {
                      organizationFetcher.submit(
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
                  {previewSeatMode ? <TableHead>Access Code</TableHead> : null}
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
                    <TableCell>{organization.memberships.length}</TableCell>
                    <TableCell>
                      {
                        organization.memberships.filter(
                          (membership) =>
                            membership.role === 'STUDENT' &&
                            !membership.isOrgOwner
                        ).length
                      }{' '}
                      / {organization.numOfStudentSeats}
                    </TableCell>
                    <TableCell>
                      {
                        organization.memberships.filter(
                          (membership) => membership.role === 'TEACHER'
                        ).length
                      }{' '}
                      / {organization.numOfTeacherSeats}
                    </TableCell>
                    {previewSeatMode ? (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        {organization.previewAccessCode ? (
                          <code className="select-all font-medium">
                            {organization.previewAccessCode}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
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
              organizationFetcher.submit(
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
