import { useEffect, useState } from 'react';
import {
  ActionFunctionArgs,
  useLoaderData,
  type LoaderFunctionArgs,
  useSearchParams,
  useNavigate,
} from 'react-router';
import { CookieColumns, useTable } from '~/hooks/useTable';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Badge } from '~/components/ui/badge';
import { Checkbox } from '~/components/ui/checkbox';
import { ArrowDown, ArrowUp, ArrowUpDown, UserMinus } from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { cn } from '~/utils/misc';
import { useFetcher, useRevalidator } from 'react-router';
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';
import { MultiSelect } from '~/components/multi-select';
import { requireProfile } from '~/utils/auth.server';
import { requireOwner } from '~/utils/auth.server';
import { getOrganizationMembersTableCookie } from '~/utils/cookies.server';
import { prisma } from '~/utils/db.server';
import { organizationIndexAction } from './actions.server';
import { SearchInput } from '~/components/search-input';

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
  actions: {
    label: 'Actions',
  },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const { sort, direction, skip, take, seat } =
    await getOrganizationMembersTableCookie(request);

  const baseWhere = {
    profiles: { some: { organizationId: profile?.organization.id } },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  } as const;

  const seatFilters = (seat ?? []) as string[];
  const orConditions: any[] = [];
  for (const s of seatFilters) {
    if (s === 'owner') {
      orConditions.push({
        profiles: {
          some: { organizationId: profile?.organization.id, isOwner: true },
        },
      });
    }
    if (s === 'teacher') {
      orConditions.push({
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            teacherProfile: { isNot: null },
          },
        },
      });
    }
    if (s === 'student') {
      orConditions.push({
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            studentProfile: { isNot: null },
            teacherProfile: { is: null },
          },
        },
      });
    }
    if (s === 'unassigned') {
      orConditions.push({
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            studentProfile: { is: null },
            teacherProfile: { is: null },
          },
        },
      });
    }
  }

  const where =
    orConditions.length > 0
      ? { AND: [baseWhere, { OR: orConditions }] }
      : baseWhere;

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        profiles: {
          where: { organizationId: profile?.organization.id },
          include: { studentProfile: true, teacherProfile: true },
        },
      },
      orderBy: { [sort]: direction },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    totalCount,
    table: { sort, direction, skip, take },
    seat: seat ?? [],
    q,
  };
}

export async function action(args: ActionFunctionArgs) {
  return organizationIndexAction(args);
}

export default function OrganizationRoute() {
  const { users, totalCount, table, seat, q } = useLoaderData<typeof loader>();

  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [localSeat, setLocalSeat] = useState<string[]>(seat ?? []);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    selected,
    setSelected,
    isLoading,
    handleSelectAll,
    handleSelect,
    handleSort,
  } = useTable({ rows: users });

  useEffect(() => {
    if (revalidator.state === 'idle') {
      setLocalSeat(seat ?? []);
    }
  }, [revalidator.state, seat]);

  return (
    <div className="flex flex-col gap-4 pb-16 md:p-5 h-screen overflow-auto">
      <div className="flex-1 rounded-lg">
        <div className="flex justify-between items-center">
          <div className="my-2 flex gap-2">
            <SearchInput
              defaultQuery={searchParams.get('q') ?? ''}
              onSearch={(q) => {
                navigate(`${window.location.pathname}?q=${q}`);
              }}
            />
            <MultiSelect
              label="Seat"
              options={[
                { value: 'owner', label: 'Owners' },
                { value: 'teacher', label: 'Teachers' },
                { value: 'student', label: 'Students' },
                { value: 'unassigned', label: 'Unassigned' },
              ]}
              values={localSeat}
              onChange={(values) => {
                setLocalSeat(values);
                const payload = {
                  sort: table.sort,
                  direction: table.direction,
                  skip: 0,
                  take: table.take,
                  seat: values,
                } as const;
                fetcher.submit(
                  {
                    intent: 'updateFilters',
                    key: 'reset',
                    value: JSON.stringify(payload),
                  },
                  { method: 'POST' }
                );
              }}
            />
          </div>

          {selected.length > 0 && (
            <fetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="remove-members" />
              {selected.map((id) => (
                <input key={id} type="hidden" name="memberIds" value={id} />
              ))}
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={fetcher.state !== 'idle'}
                onClick={(e) => {
                  if (
                    !confirm(
                      `Are you sure you want to remove ${selected.length} member(s) from the organization? They will lose access to the platform.`
                    )
                  ) {
                    e.preventDefault();
                    return;
                  }
                  setSelected([]);
                  e.currentTarget.form?.submit();
                }}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Remove {selected.length} Member
                {selected.length !== 1 ? 's' : ''}
              </Button>
            </fetcher.Form>
          )}
        </div>

        <div>
          <div className="relative flex-1 overflow-y-auto min-h-[200px]">
            {users.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
                <span className="text-lg font-bold">No members found</span>
                <span className="text-sm text-muted-foreground">
                  Try adding some members to your organization
                </span>
              </div>
            ) : (
              <div
                className={cn(isLoading ? 'opacity-50 transition-opacity' : '')}
              >
                <Table className="rounded-lg bg-muted">
                  <TableHeader className="rounded-t-lg">
                    <TableRow className="bg-muted/50 rounded-t-lg">
                      <TableHead className="w-[50px] pl-4 rounded-tl-lg">
                        <Checkbox
                          checked={selected.length === users.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      {Object.entries(COLUMNS).map(
                        ([key, { label, value }]) => (
                          <TableHead
                            key={key}
                            className={key === 'actions' ? 'pr-4' : ''}
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
                        )
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow
                        key={user.id}
                        className="transition-opacity duration-200"
                      >
                        <TableCell className="max-h-[37px] pl-4">
                          <Checkbox
                            checked={selected.includes(user.id)}
                            onCheckedChange={() => handleSelect(user.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TooltipIdCopy id={user.id}>
                              {user.name || 'Not set'}
                            </TooltipIdCopy>
                            {user.profiles.some((p) => p.isOwner) && (
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
                          {user.profiles.some((p) => p.teacherProfile) ? (
                            <Badge variant="info-outlined">Teacher</Badge>
                          ) : user.profiles.some((p) => p.isOwner) ? (
                            <span className="text-muted-foreground">N/A</span>
                          ) : user.profiles.some((p) => p.studentProfile) ? (
                            <Badge variant="secondary">Student</Badge>
                          ) : (
                            <Badge variant="outline">Unassigned</Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {}}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {isLoading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : null}
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
        </div>
      </div>
    </div>
  );
}
