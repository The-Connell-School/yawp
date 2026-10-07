import {
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
  useNavigate,
  useFetcher,
} from 'react-router';
import { CookieColumns } from '~/hooks/useTable';
import { Button } from '~/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
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
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';
import {
  getPasswordHash,
  requireMembership,
  requireOwner,
} from '~/utils/auth.server';
import {
  getOrganizationStudentsTableCookie,
  setOrganizationStudentsTableCookie,
  getOrganizationStudentsTableCookieValue,
} from '~/utils/cookies.server';
import { prisma } from '~/utils/db.server';
import { enrollStudentInClassWithSeatCap } from '~/domain/free-tier/class-seat-cap.server';
import { SearchInput } from '~/components/search-input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { useState, useEffect, useMemo } from 'react';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { formatClassGradePeriod } from '~/utils/class-display';
import { replaceStudentClassRoster } from '~/domain/collaboration/student-roster.server';

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
    formatter: (student) => student._count.classesAsStudent,
  },
  actions: {
    label: 'Actions',
  },
};

const BulkStudentsSchema = z.object({
  students: z.string().min(1, 'At least one student is required'),
  classId: z.string().min(1, 'Class is required'),
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const looksLikeEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

const parseStudentRows = (raw: string) => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: Array<{
    name: string;
    email: string;
    password: string;
    line: number;
  }> = [];
  const invalidLines: number[] = [];

  lines.forEach((line, index) => {
    const parts = line.split(',').map((part) => part.trim());

    if (parts.length === 1) {
      const email = parts[0] ?? '';
      if (!looksLikeEmail(email)) {
        invalidLines.push(index + 1);
        return;
      }

      entries.push({ name: '', email, password: '', line: index + 1 });
      return;
    }

    if (parts.length < 3) {
      invalidLines.push(index + 1);
      return;
    }

    const name = parts[0] ?? '';
    const email = parts[1] ?? '';
    const password = parts.slice(2).join(',').trim();

    if (!name || !email || !password) {
      invalidLines.push(index + 1);
      return;
    }

    entries.push({ name, email, password, line: index + 1 });
  });

  return { entries, invalidLines, total: lines.length };
};

const createOrEnrollStudent = async (
  input: { name: string; email: string; password: string; classId: string },
  organizationId: string
) => {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const password = input.password.trim();
  const classId = input.classId;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      memberships: {
        where: { organizationId },
        select: {
          id: true,
          role: true,
          classesAsStudent: {
            where: { id: classId },
            select: { id: true },
          },
        },
      },
    },
  });

  if (existingUser) {
    const membership = existingUser.memberships[0];

    if (!membership) {
      return {
        success: false,
        email,
        error: 'User belongs to another organization.',
      };
    }

    if (membership.role !== 'STUDENT') {
      return {
        success: false,
        email,
        error: 'User already has a non-student role in this organization.',
      };
    }

    if (membership.classesAsStudent.length === 0) {
      const enrolled = await enrollStudentInClassWithSeatCap({
        membershipId: membership.id,
        classId,
        organizationId,
      });
      if (!enrolled.ok) {
        return { success: false, email, error: enrolled.error };
      }
    }

    return { success: true, email };
  }

  if (!name || !password) {
    return {
      success: false,
      email,
      error: 'Name and password are required to create a new student account.',
    };
  }

  const hashedPassword = await getPasswordHash(password);

  const membership = await prisma.orgMembership.create({
    data: {
      role: 'STUDENT',
      user: {
        create: {
          email,
          name,
          password: { create: { hash: hashedPassword } },
        },
      },
      organization: { connect: { id: organizationId } },
    },
    select: { id: true, userId: true },
  });

  const enrolled = await enrollStudentInClassWithSeatCap({
    membershipId: membership.id,
    classId,
    organizationId,
  });
  if (!enrolled.ok) {
    await prisma.orgMembership.delete({ where: { id: membership.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: membership.userId } }).catch(() => {});
    return { success: false, email, error: enrolled.error };
  }

  return { success: true, email };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireMembership(request, user.id);
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const { sort, direction, skip, take } =
    await getOrganizationStudentsTableCookie(request);

  // Build the orderBy based on sort field
  let orderBy: any = { createdAt: direction };
  if (sort === 'name' || sort === 'email') {
    orderBy = {
      user: {
        [sort]: direction,
      },
    };
  }

  const where = {
    organizationId: profile.organization.id,
    role: 'STUDENT' as const,
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
  } as const;

  const [students, totalCount, classes] = await Promise.all([
    prisma.orgMembership.findMany({
      where,
      include: {
        user: true,
        classesAsStudent: {
          include: {
            school: true,
          },
        },
        _count: {
          select: {
            classesAsStudent: true,
          },
        },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.orgMembership.count({ where }),
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
  const profile = await requireMembership(request, user.id);
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

  if (intent === 'import-students-bulk') {
    const { data, error } = await parseFormData(formData, BulkStudentsSchema);
    if (error) return validationError(error);

    const klass = await prisma.class.findFirst({
      where: {
        id: data.classId,
        school: { organizationId: profile.organization.id },
        isArchived: false,
      },
      select: { id: true },
    });

    if (!klass) {
      return dataResponse({ error: 'Class not found' }, { status: 404 });
    }

    const { entries, invalidLines } = parseStudentRows(data.students);

    if (entries.length === 0) {
      return dataResponse(
        {
          intent,
          error:
            invalidLines.length > 0
              ? `Invalid rows: ${invalidLines.join(', ')}`
              : 'No valid students found',
        },
        { status: 400 }
      );
    }

    const deduped = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      deduped.set(normalizeEmail(entry.email), entry);
    }

    const results = await Promise.all(
      Array.from(deduped.values()).map((entry) => {
        const validated = {
          name: entry.name,
          email: entry.email,
          password: entry.password,
          classId: data.classId,
        };
        return createOrEnrollStudent(validated, profile.organization.id);
      })
    );

    return dataResponse({
      intent,
      results,
      invalidLines,
      dedupedCount: deduped.size,
    });
  }

  if (intent === 'edit-student') {
    const studentId = formData.get('studentId') as string;
    const classIds = formData.getAll('classIds') as string[];

    if (!studentId) {
      return dataResponse({ error: 'Student ID is required' }, { status: 400 });
    }

    // Verify student belongs to organization
    const existingStudent = await prisma.orgMembership.findFirst({
      where: {
        id: studentId,
        organizationId: profile.organization.id,
        role: 'STUDENT',
      },
      select: {
        id: true,
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

    await replaceStudentClassRoster({
      membershipId: studentId,
      nextClassIds: classIds,
    });

    return dataResponse({ success: true });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function OrganizationStudentsRoute() {
  const { students, totalCount, classes, table, q } =
    useLoaderData<typeof loader>();
  const addStudentFetcher = useFetcher<typeof action>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [addStudentSheetOpen, setAddStudentSheetOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const classOptions = useMemo(
    () =>
      classes.map((klass) => ({
        value: klass.id,
        label: `${klass.school.name}${
          formatClassGradePeriod(klass)
            ? ` - ${formatClassGradePeriod(klass)}`
            : ''
        } (${klass.schoolYear})`,
      })),
    [classes]
  );
  const bulkPreview = useMemo(() => parseStudentRows(bulkInput), [bulkInput]);
  const actionResult =
    addStudentFetcher.data && 'results' in addStudentFetcher.data
      ? addStudentFetcher.data
      : null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<
    (typeof students)[0] | null
  >(null);

  useEffect(() => {
    if (
      (addStudentFetcher.data &&
        'success' in addStudentFetcher.data &&
        addStudentFetcher.data.success) ||
      actionResult?.results?.[0]?.success
    ) {
      setAddStudentSheetOpen(false);
    }
  }, [addStudentFetcher.data, actionResult]);

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
          <Button
            size="sm"
            disabled={classes.length === 0}
            onClick={() => setAddStudentSheetOpen(true)}
          >
            Add Students
          </Button>
        </div>

        <Sheet open={addStudentSheetOpen} onOpenChange={setAddStudentSheetOpen}>
          <SheetContent className="!w-[90vw] !max-w-[600px]">
            <SheetHeader>
              <SheetTitle>Add Students</SheetTitle>
            </SheetHeader>
            <addStudentFetcher.Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="import-students-bulk" />
              <div className="space-y-2">
                <Label htmlFor="classId">Class</Label>
                <select
                  id="classId"
                  name="classId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  {classOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="students">
                  Students (one per line: name, email, password)
                </Label>
                <Textarea
                  id="students"
                  name="students"
                  placeholder="John Doe, john@example.com, password123"
                  rows={8}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Parsed: {bulkPreview.entries.length} valid,{' '}
                  {bulkPreview.invalidLines.length} invalid
                </p>
              </div>
              {addStudentFetcher.data &&
                'error' in addStudentFetcher.data &&
                addStudentFetcher.data.error && (
                  <div className="text-sm text-red-600">
                    {addStudentFetcher.data.error}
                  </div>
                )}
              {actionResult?.intent === 'import-students-bulk' && (
                <div className="text-sm text-green-600">
                  {actionResult.results?.filter(
                    (r: { success: boolean }) => r.success
                  ).length ?? 0}{' '}
                  created,{' '}
                  {actionResult.results?.filter(
                    (r: { success: boolean }) => !r.success
                  ).length ?? 0}{' '}
                  failed
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={addStudentFetcher.state !== 'idle'}
              >
                {addStudentFetcher.state !== 'idle'
                  ? 'Creating...'
                  : 'Create Students'}
              </Button>
            </addStudentFetcher.Form>
          </SheetContent>
        </Sheet>

        <div>
          <div className="relative flex-1 overflow-y-auto min-h-[200px]">
            {students.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 border border-dashed bg-muted p-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-lg font-bold">No students found</span>
                  <span className="text-sm text-muted-foreground">
                    {q
                      ? 'Try adjusting your search'
                      : 'Students will appear here once they sign up and join classes'}
                  </span>
                </div>
                {table.skip > 0 && (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      You're viewing page{' '}
                      {Math.floor(table.skip / table.take) + 1}. Results may be
                      on other pages.
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
                              {student.user.name || 'Not set'}
                            </span>
                          </TooltipIdCopy>
                        </TableCell>
                        <TableCell>{student.user.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {student._count.classesAsStudent}
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
      setSelectedClasses(
        editingStudent.classesAsStudent?.map((c: { id: string }) => c.id) || []
      );
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
              {editingStudent.user.name || 'Not set'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <div className="text-sm font-medium text-muted-foreground">
              {editingStudent.user.email}
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
                        {cls.school.name}
                        {formatClassGradePeriod(cls)
                          ? ` - ${formatClassGradePeriod(cls)}`
                          : ''}{' '}
                        ({cls.schoolYear})
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
