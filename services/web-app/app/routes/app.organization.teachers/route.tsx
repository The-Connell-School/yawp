import {
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
  useNavigate,
} from 'react-router';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Checkbox } from '~/components/ui/checkbox';
import { requireProfile, requireOwner } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Plus, Trash2 } from 'lucide-react';
import { SearchInput } from '~/components/search-input';
import { useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import { Tooltip } from '~/components/ui/tooltip';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  const where = {
    profile: {
      organizationId: profile.organization.id,
    },
    isActive: true,
    ...(q
      ? {
          profile: {
            organizationId: profile.organization.id,
            user: {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          },
        }
      : {}),
  } as const;

  const teachers = await prisma.teacherProfile.findMany({
    where,
    include: {
      profile: {
        include: {
          user: true,
        },
      },
      _count: {
        select: {
          classes: true,
        },
      },
    },
    orderBy: {
      profile: {
        user: {
          name: 'asc',
        },
      },
    },
  });

  return dataResponse({ teachers, q });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'delete-teachers') {
    const teacherIds = formData.getAll('teacherIds') as string[];

    if (!teacherIds.length) {
      return dataResponse({ error: 'No teachers selected' }, { status: 400 });
    }

    const teachers = await prisma.teacherProfile.findMany({
      where: {
        id: { in: teacherIds },
        profile: {
          organizationId: profile.organization.id,
        },
      },
    });

    if (teachers.length !== teacherIds.length) {
      return dataResponse(
        { error: 'Some teachers do not belong to your organization' },
        { status: 400 }
      );
    }

    await prisma.teacherProfile.updateMany({
      where: { id: { in: teacherIds } },
      data: { isActive: false },
    });

    return redirect('/app/organization/teachers');
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function OrganizationTeachersRoute() {
  const { teachers, q } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selected, setSelected, isLoading, handleSelectAll, handleSelect } =
    useTable({ rows: teachers });

  return (
    <div className="flex flex-col gap-4 pb-16 md:p-5 h-screen overflow-auto">
      <div className="flex-1 rounded-lg">
        <div className="flex justify-between items-center">
          <div className="my-2 flex gap-2 items-center">
            <SearchInput
              defaultQuery={searchParams.get('q') ?? ''}
              onSearch={(q) => {
                navigate(`${window.location.pathname}?q=${q}`);
              }}
            />
          </div>

          <div className="flex gap-2">
            {selected.length > 0 && (
              <fetcher.Form method="post" className="inline">
                <input type="hidden" name="intent" value="delete-teachers" />
                {selected.map((id) => (
                  <input key={id} type="hidden" name="teacherIds" value={id} />
                ))}
                <Tooltip text={`Remove ${selected.length}`}>
                  <Button
                    type="submit"
                    size="icon-sm"
                    variant="destructive"
                    disabled={fetcher.state !== 'idle'}
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Are you sure you want to remove ${selected.length} teacher(s)?`
                        )
                      ) {
                        e.preventDefault();
                        return;
                      }
                      setSelected([]);
                      e.currentTarget.form?.submit();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </fetcher.Form>
            )}
            <Button size="sm" variant="outline" disabled>
              <Plus className="mr-2 h-4 w-4" />
              Invite Teacher
            </Button>
          </div>
        </div>

        <div>
          <div className="relative flex-1 overflow-y-auto min-h-[200px]">
            {teachers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted p-12">
                <span className="text-lg font-bold">No teachers found</span>
                <span className="text-sm text-muted-foreground">
                  {q
                    ? 'Try adjusting your search'
                    : 'Invite teachers to join your organization'}
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
                          checked={selected.length === teachers.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Classes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teachers.map((teacher) => (
                      <TableRow key={teacher.id}>
                        <TableCell className="max-h-[37px] pl-4">
                          <Checkbox
                            checked={selected.includes(teacher.id)}
                            onCheckedChange={() => handleSelect(teacher.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {teacher.profile.user.name || 'Not set'}
                        </TableCell>
                        <TableCell>{teacher.profile.user.email}</TableCell>
                        <TableCell className="pr-4">
                          {teacher._count.classes}
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
        </div>
      </div>
    </div>
  );
}
