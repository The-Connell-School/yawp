import {
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
  useNavigate,
} from 'react-router';
import { CookieColumns } from '~/hooks/useTable';
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
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { cn } from '~/utils/misc';
import { useFetcher } from 'react-router';
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';
import { requireProfile, requireOwner } from '~/utils/auth.server';
import {
  getOrganizationStudentsTableCookie,
  setOrganizationStudentsTableCookie,
  getOrganizationStudentsTableCookieValue,
} from '~/utils/cookies.server';
import { prisma } from '~/utils/db.server';
import { SearchInput } from '~/components/search-input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { useState, useEffect } from 'react';
import { Label } from '~/components/ui/label';

const COLUMNS: CookieColumns = {
  name: {
    label: 'Name',
    value: 'name',
  },
  email: {
    label: 'Email',
    value: 'email',
  },
  classCount: {
    label: 'Classes',
    formatter: (student) => student._count.classes,
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
  const { sort, direction, skip, take } =
    await getOrganizationStudentsTableCookie(request);

  // Build the orderBy based on sort field
  let orderBy: any = { createdAt: direction };
  if (sort === 'name' || sort === 'email') {
    orderBy = {
      profile: {
        user: {
          [sort]: direction,
        },
      },
    };
  }

  const where = {
    profile: {
      organizationId: profile.organization.id,
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    },
  } as const;

  const [students, totalCount, classes] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      include: {
        profile: {
          include: {
            user: true,
          },
        },
        classes: {
          include: {
            school: true,
          },
        },
        _count: {
          select: {
            classes: true,
          },
        },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.studentProfile.count({ where }),
    prisma.class.findMany({
      where: {
        school: {
          organizationId: profile.organization.id,
        },
        isArchived: false,
      },
      include: {
        school: true,
      },
      orderBy: [
        { school: { name: 'asc' } },
        { grade: 'asc' },
        { period: 'asc' },
      ],
    }),
  ]);

  return {
    students,
    totalCount,
    classes,
    table: { sort, direction, skip, take },
    q,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateFilters') {
    const key = formData.get('key') as string;
    const value = formData.get('value') as string;

    if (key === 'skip-take') {
      const [skip, take] = value.split('-').map(Number);
      const cookie = await setOrganizationStudentsTableCookie(request, {
        skip,
        take,
      });
      return dataResponse(
        { success: true },
        { headers: { 'Set-Cookie': cookie } }
      );
    }

    if (key === 'sort') {
      const [sort, direction] = value.split('-') as [
        'name' | 'email' | 'createdAt',
        'asc' | 'desc',
      ];
      const cookie = await setOrganizationStudentsTableCookie(request, {
        sort,
        direction,
      });
      return dataResponse(
        { success: true },
        { headers: { 'Set-Cookie': cookie } }
      );
    }

    const cookie = await setOrganizationStudentsTableCookie(request, {
      [key]: getOrganizationStudentsTableCookieValue(key as any, value),
    });

    return dataResponse(
      { success: true },
      { headers: { 'Set-Cookie': cookie } }
    );
  }

  if (intent === 'edit-student') {
    const studentId = formData.get('studentId') as string;
    const classIds = formData.getAll('classIds') as string[];

    if (!studentId) {
      return dataResponse({ error: 'Student ID is required' }, { status: 400 });
    }

    // Verify student belongs to organization
    const existingStudent = await prisma.studentProfile.findFirst({
      where: {
        id: studentId,
        profile: { organizationId: profile.organization.id },
      },
    });

    if (!existingStudent) {
      return dataResponse({ error: 'Student not found' }, { status: 404 });
    }

    // Verify all classes belong to organization
    if (classIds.length > 0) {
      const classes = await prisma.class.findMany({
        where: {
          id: { in: classIds },
          school: { organizationId: profile.organization.id },
        },
      });

      if (classes.length !== classIds.length) {
        return dataResponse(
          { error: 'Some classes do not belong to your organization' },
          { status: 400 }
        );
      }
    }

    await prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        classes: {
          set: classIds.map((id) => ({ id })),
        },
      },
    });

    return dataResponse({ success: true });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function OrganizationStudentsRoute() {
  const { students, totalCount, classes, table, q } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<
    (typeof students)[0] | null
  >(null);

  const handleSort = (column: string, direction: 'asc' | 'desc') => {
    setIsLoading(true);
    fetcher.submit(
      {
        intent: 'updateFilters',
        key: 'sort',
        value: `${column}-${direction}`,
      },
      { method: 'POST' }
    );
  };

  useEffect(() => {
    if (fetcher.state === 'idle') {
      setIsLoading(false);
    }
  }, [fetcher.state]);

  const handleEdit = (student: (typeof students)[0]) => {
    setEditingStudent(student);
    setSheetOpen(true);
  };

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
        </div>

        <div>
          <div className="relative flex-1 overflow-y-auto min-h-[200px]">
            {students.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
                <span className="text-lg font-bold">No students found</span>
                <span className="text-sm text-muted-foreground">
                  {q
                    ? 'Try adjusting your search'
                    : 'Students will appear here once they sign up and join classes'}
                </span>
              </div>
            ) : (
              <div
                className={cn(isLoading ? 'opacity-50 transition-opacity' : '')}
              >
                <Table className="rounded-lg bg-muted">
                  <TableHeader className="rounded-t-lg">
                    <TableRow className="bg-muted/50 rounded-t-lg">
                      {Object.entries(COLUMNS).map(
                        ([key, { label, value }]) => (
                          <TableHead
                            key={key}
                            className={
                              key === 'name'
                                ? 'pl-4 rounded-tl-lg'
                                : key === 'actions'
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
                        )
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow
                        key={student.id}
                        className="transition-opacity duration-200"
                      >
                        <TableCell className="pl-4">
                          <TooltipIdCopy id={student.id}>
                            <span className="font-medium">
                              {student.profile.user.name || 'Not set'}
                            </span>
                          </TooltipIdCopy>
                        </TableCell>
                        <TableCell>{student.profile.user.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {student._count.classes}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(student)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
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

      <StudentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingStudent={editingStudent}
        classes={classes}
      />
    </div>
  );
}

function StudentSheet({
  open,
  onOpenChange,
  editingStudent,
  classes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStudent: any | null;
  classes: any[];
}) {
  const fetcherKey = editingStudent ? `edit-${editingStudent.id}` : 'none';
  const fetcher = useFetcher({ key: fetcherKey });
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  // Reset form when editingStudent changes or sheet opens/closes
  useEffect(() => {
    if (editingStudent) {
      setSelectedClasses(editingStudent.classes?.map((c: any) => c.id) || []);
    }
  }, [editingStudent, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    const formData = new FormData();
    formData.append('intent', 'edit-student');
    formData.append('studentId', editingStudent.id);
    selectedClasses.forEach((classId) => {
      formData.append('classIds', classId);
    });
    fetcher.submit(formData, { method: 'POST' });
  };

  // Close sheet on successful submission
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  if (!editingStudent) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Student</SheetTitle>
          <SheetDescription>
            Manage class assignments for this student
          </SheetDescription>
        </SheetHeader>

        {fetcher.data?.error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm">
            {fetcher.data.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label>Student Name</Label>
            <div className="text-sm font-medium text-muted-foreground">
              {editingStudent.profile.user.name || 'Not set'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <div className="text-sm font-medium text-muted-foreground">
              {editingStudent.profile.user.email}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Classes</Label>
            <div className="rounded-md border border-input bg-background">
              <div className="max-h-[300px] overflow-y-auto p-3 space-y-2">
                {classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No classes available
                  </p>
                ) : (
                  classes.map((cls) => (
                    <div key={cls.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`class-${cls.id}`}
                        checked={selectedClasses.includes(cls.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedClasses([...selectedClasses, cls.id]);
                          } else {
                            setSelectedClasses(
                              selectedClasses.filter((id) => id !== cls.id)
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`class-${cls.id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {cls.school.name} - {cls.grade} - Period {cls.period} (
                        {cls.schoolYear})
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedClasses.length > 0
                ? `${selectedClasses.length} class${selectedClasses.length !== 1 ? 'es' : ''} selected`
                : 'Select classes to assign to this student'}
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {fetcher.state !== 'idle' ? 'Saving...' : 'Update Student'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
