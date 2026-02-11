import {
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Trash2,
  Plus,
  Pencil,
  Copy,
  Check,
  Archive,
  Files,
} from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { cn } from '~/utils/misc';
import { useFetcher } from 'react-router';
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';
import { requireProfile, requireOwner } from '~/utils/auth.server';
import {
  getOrganizationClassesTableCookie,
  setOrganizationClassesTableCookie,
  getOrganizationClassesTableCookieValue,
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
import { Tooltip } from '~/components/ui/tooltip';
import { useState, useEffect } from 'react';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { generateClassCode } from '~/utils/class';

const COLUMNS: CookieColumns = {
  school: {
    label: 'School',
    formatter: (cls) => cls.school.name,
  },
  title: {
    label: 'Class Title',
    value: 'title',
  },
  code: {
    label: 'Code',
    value: 'code',
  },
  schoolYear: {
    label: 'School Year',
    value: 'schoolYear',
  },
  grade: {
    label: 'Grade',
    value: 'grade',
  },
  period: {
    label: 'Period',
    value: 'period',
  },
  studentCount: {
    label: 'Students',
    formatter: (cls) => cls._count.students,
  },
  teacherCount: {
    label: 'Teachers',
    formatter: (cls) => cls._count.teachers,
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
    await getOrganizationClassesTableCookie(request);

  const where = {
    school: {
      organizationId: profile.organization.id,
    },
    isArchived: false, // Only show non-archived classes
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: 'insensitive' as const } },
            { schoolYear: { contains: q, mode: 'insensitive' as const } },
            { grade: { contains: q, mode: 'insensitive' as const } },
            { period: { contains: q, mode: 'insensitive' as const } },
            { title: { contains: q, mode: 'insensitive' as const } },
            {
              school: {
                name: { contains: q, mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {}),
  } as const;

  const [classes, totalCount, schools, teachers, studentCourses] =
    await Promise.all([
      prisma.class.findMany({
        where,
        include: {
          school: true,
          teachers: {
            include: {
              profile: {
                include: {
                  user: true,
                },
              },
            },
          },
          allowedStudentCourses: {
            include: {
              studentCourse: true,
            },
          },
          _count: {
            select: {
              students: true,
              teachers: true,
            },
          },
        },
        orderBy: { [sort]: direction },
        skip,
        take,
      }),
      prisma.class.count({ where }),
      prisma.school.findMany({
        where: { organizationId: profile.organization.id },
        orderBy: { name: 'asc' },
      }),
      prisma.teacherProfile.findMany({
        where: {
          profile: {
            organizationId: profile.organization.id,
          },
          isActive: true,
        },
        include: {
          profile: {
            include: {
              user: true,
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
      }),
      prisma.studentCourse.findMany({
        orderBy: { position: 'asc' },
      }),
    ]);

  return {
    classes,
    totalCount,
    schools,
    teachers,
    studentCourses,
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
      const cookie = await setOrganizationClassesTableCookie(request, {
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
        'code' | 'schoolYear' | 'grade' | 'period' | 'createdAt',
        'asc' | 'desc',
      ];
      const cookie = await setOrganizationClassesTableCookie(request, {
        sort,
        direction,
      });
      return dataResponse(
        { success: true },
        { headers: { 'Set-Cookie': cookie } }
      );
    }

    const cookie = await setOrganizationClassesTableCookie(request, {
      [key]: getOrganizationClassesTableCookieValue(key as any, value),
    });

    return dataResponse(
      { success: true },
      { headers: { 'Set-Cookie': cookie } }
    );
  }

  if (intent === 'create-class') {
    const schoolId = formData.get('schoolId') as string;
    const schoolYear = formData.get('schoolYear') as string;
    const grade = formData.get('grade') as string;
    const period = formData.get('period') as string;
    const title = (formData.get('title') as string)?.trim() || null;
    let code = (formData.get('code') as string)?.trim().toUpperCase() || '';
    const teacherIds = formData.getAll('teacherIds') as string[];
    const studentCourseIds = formData.getAll('studentCourseIds') as string[];

    if (!schoolId || !schoolYear || !grade || !period) {
      return dataResponse(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate school year format (YYYY-YYYY)
    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      return dataResponse(
        { error: 'School year must be in format YYYY-YYYY' },
        { status: 400 }
      );
    }

    // Generate code if not provided
    if (!code) {
      code = generateClassCode();
    }

    // Validate code format (alphanumeric, 3-10 chars)
    if (!/^[A-Z0-9]{3,10}$/.test(code)) {
      return dataResponse(
        { error: 'Code must be 3-10 alphanumeric characters' },
        { status: 400 }
      );
    }

    // Verify school belongs to organization
    const school = await prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
    });

    if (!school) {
      return dataResponse({ error: 'Invalid school' }, { status: 400 });
    }

    try {
      await prisma.class.create({
        data: {
          schoolId,
          schoolYear,
          grade,
          period,
          title,
          code,
          teachers: {
            connect: teacherIds.map((id) => ({ id })),
          },
          allowedStudentCourses: {
            create: studentCourseIds.map((studentCourseId) => ({
              studentCourseId,
            })),
          },
        },
      });

      return dataResponse({ success: true });
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Check which constraint was violated
        const target = error.meta?.target;
        if (target?.includes('code')) {
          return dataResponse(
            { error: 'A class with this code already exists' },
            { status: 400 }
          );
        }
        // Default to the combination constraint
        return dataResponse(
          {
            error:
              'A class with this school, year, grade, and period combination already exists. Each class must be unique.',
          },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (intent === 'edit-class') {
    const classId = formData.get('classId') as string;
    const schoolId = formData.get('schoolId') as string;
    const schoolYear = formData.get('schoolYear') as string;
    const grade = formData.get('grade') as string;
    const period = formData.get('period') as string;
    const title = (formData.get('title') as string)?.trim() || null;
    const code = (formData.get('code') as string)?.trim().toUpperCase() || '';
    const teacherIds = formData.getAll('teacherIds') as string[];
    const studentCourseIds = formData.getAll('studentCourseIds') as string[];

    if (!classId || !schoolId || !schoolYear || !grade || !period || !code) {
      return dataResponse(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate school year format (YYYY-YYYY)
    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      return dataResponse(
        { error: 'School year must be in format YYYY-YYYY' },
        { status: 400 }
      );
    }

    // Validate code format (alphanumeric, 3-10 chars)
    if (!/^[A-Z0-9]{3,10}$/.test(code)) {
      return dataResponse(
        { error: 'Code must be 3-10 alphanumeric characters' },
        { status: 400 }
      );
    }

    // Verify school belongs to organization
    const school = await prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
    });

    if (!school) {
      return dataResponse({ error: 'Invalid school' }, { status: 400 });
    }

    // Verify class belongs to organization
    const existingClass = await prisma.class.findFirst({
      where: {
        id: classId,
        school: { organizationId: profile.organization.id },
      },
    });

    if (!existingClass) {
      return dataResponse({ error: 'Class not found' }, { status: 404 });
    }

    try {
      // First, delete existing student course associations
      await prisma.classStudentCourse.deleteMany({
        where: { classId },
      });

      // Then update the class with new data
      await prisma.class.update({
        where: { id: classId },
        data: {
          school: {
            connect: { id: schoolId },
          },
          schoolYear,
          grade,
          period,
          title,
          code,
          teachers: {
            set: teacherIds.map((id) => ({ id })),
          },
          allowedStudentCourses: {
            create: studentCourseIds.map((studentCourseId) => ({
              studentCourseId,
            })),
          },
        },
      });

      return dataResponse({ success: true });
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Check which constraint was violated
        const target = error.meta?.target;
        if (target?.includes('code')) {
          return dataResponse(
            { error: 'A class with this code already exists' },
            { status: 400 }
          );
        }
        // Default to the combination constraint
        return dataResponse(
          {
            error:
              'A class with this school, year, grade, and period combination already exists. Each class must be unique.',
          },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (intent === 'delete-classes') {
    const classIds = formData.getAll('classIds') as string[];

    if (!classIds.length) {
      return dataResponse({ error: 'No classes selected' }, { status: 400 });
    }

    // Verify all classes belong to organization
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

    await prisma.class.deleteMany({
      where: { id: { in: classIds } },
    });

    return redirect('/app/organization/classes');
  }

  if (intent === 'archive-classes') {
    const classIds = formData.getAll('classIds') as string[];

    if (!classIds.length) {
      return dataResponse({ error: 'No classes selected' }, { status: 400 });
    }

    // Verify all classes belong to organization
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

    await prisma.class.updateMany({
      where: { id: { in: classIds } },
      data: { isArchived: true },
    });

    return redirect('/app/organization/classes');
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      className="h-6 w-6 ml-2"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      <span className="sr-only">Copy code</span>
    </Button>
  );
}

export default function OrganizationClassesRoute() {
  const { classes, totalCount, schools, teachers, studentCourses, table, q } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    selected,
    setSelected,
    isLoading,
    handleSelectAll,
    handleSelect,
    handleSort,
  } = useTable({ rows: classes });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<(typeof classes)[0] | null>(
    null
  );
  const [duplicatingClass, setDuplicatingClass] = useState<
    (typeof classes)[0] | null
  >(null);

  const handleEdit = (cls: (typeof classes)[0]) => {
    setEditingClass(cls);
    setDuplicatingClass(null);
    setSheetOpen(true);
  };

  const handleCreate = () => {
    setEditingClass(null);
    setDuplicatingClass(null);
    setSheetOpen(true);
  };

  const handleDuplicate = (cls: (typeof classes)[0]) => {
    setEditingClass(null);
    setDuplicatingClass(cls);
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

          <div className="flex gap-2">
            {selected.length > 0 && (
              <>
                {selected.length === 1 && (
                  <Tooltip text="Duplicate">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => {
                        const selectedClass = classes.find(
                          (cls) => cls.id === selected[0]
                        );
                        if (selectedClass) {
                          handleDuplicate(selectedClass);
                          setSelected([]);
                        }
                      }}
                    >
                      <Files className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
                <fetcher.Form method="post" className="inline">
                  <input type="hidden" name="intent" value="archive-classes" />
                  {selected.map((id) => (
                    <input key={id} type="hidden" name="classIds" value={id} />
                  ))}
                  <Tooltip text={`Archive ${selected.length}`}>
                    <Button
                      type="submit"
                      size="icon-sm"
                      variant="outline"
                      disabled={fetcher.state !== 'idle'}
                      onClick={(e) => {
                        if (
                          !confirm(
                            `Are you sure you want to archive ${selected.length} class(es)?`
                          )
                        ) {
                          e.preventDefault();
                          return;
                        }
                        setSelected([]);
                        e.currentTarget.form?.submit();
                      }}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </fetcher.Form>
                <fetcher.Form method="post" className="inline">
                  <input type="hidden" name="intent" value="delete-classes" />
                  {selected.map((id) => (
                    <input key={id} type="hidden" name="classIds" value={id} />
                  ))}
                  <Tooltip text={`Delete ${selected.length}`}>
                    <Button
                      type="submit"
                      size="icon-sm"
                      variant="destructive"
                      disabled={fetcher.state !== 'idle'}
                      onClick={(e) => {
                        if (
                          !confirm(
                            `Are you sure you want to delete ${selected.length} class(es)? This cannot be undone.`
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
              </>
            )}
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Class
            </Button>
          </div>
        </div>

        <div>
          <div className="relative flex-1 overflow-y-auto min-h-[200px]">
            {classes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 border border-dashed bg-muted p-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-lg font-bold">No classes found</span>
                  <span className="text-sm text-muted-foreground">
                    {q ? 'Try adjusting your search' : 'Create your first class to get started'}
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
                        setIsLoading(true);
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
                      <TableHead className="w-[50px] pl-4 rounded-tl-lg">
                        <Checkbox
                          checked={selected.length === classes.length}
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
                    {classes.map((cls) => (
                      <TableRow
                        key={cls.id}
                        className="transition-opacity duration-200"
                      >
                        <TableCell className="max-h-[37px] pl-4">
                          <Checkbox
                            checked={selected.includes(cls.id)}
                            onCheckedChange={() => handleSelect(cls.id)}
                          />
                        </TableCell>
                        <TableCell>{cls.school.name}</TableCell>
                        <TableCell>
                          {cls.title ? (
                            <span className="text-muted-foreground">
                              {cls.title}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50 italic">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <TooltipIdCopy id={cls.id}>
                              <span className="font-mono font-semibold">
                                {cls.code}
                              </span>
                            </TooltipIdCopy>
                            <CopyCodeButton code={cls.code} />
                          </div>
                        </TableCell>
                        <TableCell>{cls.schoolYear}</TableCell>
                        <TableCell>{cls.grade}</TableCell>
                        <TableCell>{cls.period}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {cls._count.students}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="info-outlined">
                            {cls._count.teachers}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(cls)}
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

      <ClassSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingClass={editingClass}
        duplicatingClass={duplicatingClass}
        schools={schools}
        teachers={teachers}
        studentCourses={studentCourses}
      />
    </div>
  );
}

function ClassSheet({
  open,
  onOpenChange,
  editingClass,
  duplicatingClass,
  schools,
  teachers,
  studentCourses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass: any | null;
  duplicatingClass: any | null;
  schools: any[];
  teachers: any[];
  studentCourses: any[];
}) {
  // Use a key that changes to reset fetcher when switching between create/edit/duplicate
  const fetcherKey = editingClass
    ? `edit-${editingClass.id}`
    : duplicatingClass
      ? `duplicate-${duplicatingClass.id}`
      : 'create';
  const fetcher = useFetcher({ key: fetcherKey });
  const [schoolId, setSchoolId] = useState('');
  const [schoolYear, setSchoolYear] = useState('');
  const [grade, setGrade] = useState('');
  const [period, setPeriod] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [selectedStudentCourses, setSelectedStudentCourses] = useState<
    string[]
  >([]);

  // Reset form when editingClass or duplicatingClass changes or sheet opens/closes
  useEffect(() => {
    const sourceClass = editingClass || duplicatingClass;
    setSchoolId(sourceClass?.schoolId || '');
    setSchoolYear(sourceClass?.schoolYear || '');
    setGrade(sourceClass?.grade || '');
    setPeriod(sourceClass?.period || '');
    setTitle(sourceClass?.title || '');
    // Generate new code for duplicates, use existing for edits
    setCode(
      editingClass?.code ||
        (duplicatingClass ? generateClassCode() : generateClassCode())
    );
    setSelectedTeachers(sourceClass?.teachers?.map((t: any) => t.id) || []);
    setSelectedStudentCourses(
      sourceClass?.allowedStudentCourses?.map(
        (asc: any) => asc.studentCourse.id
      ) || []
    );
  }, [editingClass, duplicatingClass, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('intent', editingClass ? 'edit-class' : 'create-class');
    if (editingClass) {
      formData.append('classId', editingClass.id);
    }
    formData.append('schoolId', schoolId);
    formData.append('schoolYear', schoolYear);
    formData.append('grade', grade);
    formData.append('period', period);
    formData.append('title', title);
    formData.append('code', code);
    selectedTeachers.forEach((teacherId) => {
      formData.append('teacherIds', teacherId);
    });
    selectedStudentCourses.forEach((studentCourseId) => {
      formData.append('studentCourseIds', studentCourseId);
    });
    fetcher.submit(formData, { method: 'POST' });
  };

  // Close sheet on successful submission
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {editingClass
              ? 'Edit Class'
              : duplicatingClass
                ? 'Duplicate Class'
                : 'Create Class'}
          </SheetTitle>
          <SheetDescription>
            {editingClass
              ? 'Update the class information below'
              : duplicatingClass
                ? 'Creating a copy of the class with a new code'
                : 'Fill in the details to create a new class'}
          </SheetDescription>
        </SheetHeader>

        {fetcher.data?.error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm">
            {fetcher.data.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="schoolId">School</Label>
            <Select value={schoolId} onValueChange={setSchoolId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a school" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Class Code</Label>
            <Input
              id="code"
              placeholder="A3B9X2"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={10}
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Short code (3-10 characters, letters and numbers)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schoolYear">School Year</Label>
            <Input
              id="schoolYear"
              placeholder="2024-2025"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Format: YYYY-YYYY (e.g., 2024-2025)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade">Grade</Label>
            <Select value={grade} onValueChange={setGrade} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="K">K</SelectItem>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="7">7</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="9">9</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="11">11</SelectItem>
                <SelectItem value="12">12</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="period">Period</Label>
            <Select value={period} onValueChange={setPeriod} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="7">7</SelectItem>
                <SelectItem value="8">8</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Class Title (Optional)</Label>
            <Input
              id="title"
              placeholder="e.g., AP English 11, British Lit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional descriptive title for the class
            </p>
          </div>

          <div className="space-y-2">
            <Label>Teachers (Optional)</Label>
            <div className="rounded-md border border-input bg-background">
              <div className="max-h-[200px] overflow-y-auto p-3 space-y-2">
                {teachers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No teachers available
                  </p>
                ) : (
                  teachers.map((teacher) => (
                    <div
                      key={teacher.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`teacher-${teacher.id}`}
                        checked={selectedTeachers.includes(teacher.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTeachers([
                              ...selectedTeachers,
                              teacher.id,
                            ]);
                          } else {
                            setSelectedTeachers(
                              selectedTeachers.filter((id) => id !== teacher.id)
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`teacher-${teacher.id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {teacher.profile.user.name ||
                          teacher.profile.user.email}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedTeachers.length > 0
                ? `${selectedTeachers.length} teacher${selectedTeachers.length !== 1 ? 's' : ''} selected`
                : 'Select teachers to assign to this class'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Student Courses (Optional)</Label>
            <div className="rounded-md border border-input bg-background">
              <div className="max-h-[200px] overflow-y-auto p-3 space-y-2">
                {studentCourses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No student courses available
                  </p>
                ) : (
                  studentCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`course-${course.id}`}
                        checked={selectedStudentCourses.includes(course.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedStudentCourses([
                              ...selectedStudentCourses,
                              course.id,
                            ]);
                          } else {
                            setSelectedStudentCourses(
                              selectedStudentCourses.filter(
                                (id) => id !== course.id
                              )
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`course-${course.id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {course.title}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedStudentCourses.length > 0
                ? `${selectedStudentCourses.length} course${selectedStudentCourses.length !== 1 ? 's' : ''} selected`
                : 'Select courses to show for this class (if none selected, all courses will be shown)'}
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {fetcher.state !== 'idle'
                ? 'Saving...'
                : editingClass
                  ? 'Update Class'
                  : 'Create Class'}
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
