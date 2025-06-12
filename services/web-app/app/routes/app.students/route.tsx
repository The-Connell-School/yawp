import { useLocalStorage } from 'usehooks-ts';
import {
  data as dataResponse,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
} from 'react-router';
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useParams,
  useFetcher,
} from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileIcon,
  LayoutGrid,
  ChevronDown,
  List,
  PencilIcon,
  Trash2,
  Bookmark,
  BookmarkIcon,
  ArrowUpDownIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ValidatedForm } from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormMultiSelect } from '~/components/forms/form-multi-select.tsx';
import { MultiSelect } from '~/components/multi-select.tsx';
import { SearchInput } from '~/components/search-input';
import { Pagination } from '~/components/table/pagination.tsx';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import {
  Table as TableComponent,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table';
import { UserImage } from '~/components/user-image';
import { useUser } from '~/hooks/useUser';
import { requireUserId } from '~/utils/auth.server';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { prisma } from '~/utils/db.server';
import { Period, Grade, Setting } from '~/utils/enums.ts';
import { cn } from '~/utils/misc.tsx';
import pluralize from '~/utils/pluralize/pluralize';
import {
  getStudentFilters,
  getStudentFiltersValue,
  setStudentFilters,
  type StudentFilters,
} from '~/utils/cookies.server';
import { createToastHeaders } from '~/utils/toast.server';
import { Prisma } from '@app/prisma';

export const handle: BreadcrumbHandle = { breadcrumb: 'Students' };

type SortField = 'name' | 'email' | 'school' | 'grade' | 'period' | 'createdAt';

const SORT_FIELDS: Array<{ label: string; value: SortField }> = [
  { label: 'Name', value: 'name' },
  { label: 'Email', value: 'email' },
  { label: 'School', value: 'school' },
  { label: 'Grade', value: 'grade' },
  { label: 'Period', value: 'period' },
];

const saveViewValidator = z.object({
  name: z.string().min(1),
  intent: z.string(),
  school: z.string(),
  grade: z.string(),
  period: z.string(),
  workshopLeader: z.string(),
  schoolTeacher: z.string(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const studentFilters = await getStudentFilters(request);
  const url = new URL(request.url);
  const newFiltersRaw = url.searchParams.get('filters');
  const parsedFilters = newFiltersRaw
    ? (JSON.parse(decodeURIComponent(newFiltersRaw)) as StudentFilters)
    : ({} as Partial<StudentFilters>);
  const filters = { ...studentFilters, ...parsedFilters };

  url.searchParams.delete('filters');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, teacherProfile: true },
  });

  const isAdmin = user?.isAdmin;
  const isTeacher = user?.teacherProfile !== null;

  const where: Prisma.StudentProfileWhereInput = {
    AND: [
      {
        OR: [
          { user: { name: { contains: filters.query } } },
          { user: { email: { contains: filters.query } } },
          // { user: { studentProfile: { school: { contains: filters.query } } } },
          { school: { contains: filters.query } },
          { grade: { contains: filters.query } },
          { period: { contains: filters.query } },
        ],
      },
      filters.school.filter(Boolean).length > 0 &&
      !filters.school.includes('all')
        ? {
            OR: filters.school.map((school) =>
              school === 'none'
                ? { school: null }
                : { school: { equals: school } }
            ),
          }
        : {},
      filters.grade.filter(Boolean).length > 0 && !filters.grade.includes('all')
        ? {
            OR: filters.grade.map((grade) =>
              grade === 'none' ? { grade: null } : { grade: { equals: grade } }
            ),
          }
        : {},
      filters.period.filter(Boolean).length > 0 &&
      !filters.period.includes('all')
        ? {
            OR: filters.period.map((period) =>
              period === 'none'
                ? { period: null }
                : { period: { equals: period } }
            ),
          }
        : {},
      filters.workshopLeader.filter(Boolean).length > 0 &&
      !filters.workshopLeader.includes('all')
        ? {
            OR: filters.workshopLeader.map((workshopLeader) =>
              workshopLeader === 'none'
                ? { workshopLeaderId: null }
                : { workshopLeaderId: { equals: workshopLeader } }
            ),
          }
        : {},
      filters.teacher.filter(Boolean).length > 0 &&
      !filters.teacher.includes('all')
        ? {
            OR: filters.teacher.map((teacher) =>
              teacher === 'none'
                ? { schoolTeacher: null }
                : { schoolTeacher: { equals: teacher } }
            ),
          }
        : {},
      !isAdmin && isTeacher ? { workshopLeaderId: userId } : {},
    ],
  };

  const orderBy =
    filters.sort === 'name' || filters.sort === 'email'
      ? { user: { [filters.sort]: filters.direction } }
      : { [filters.sort]: filters.direction };

  const [students, totalCount, settings, workshopLeaders] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      include: {
        user: {
          include: {
            documents: {
              include: {
                courseModuleSessions: {
                  include: {
                    courseModule: true,
                  },
                },
              },
            },
            image: true,
          },
        },
      },
      take: filters.take,
      skip: filters.skip,
      orderBy,
    }),
    prisma.studentProfile.count({ where }),
    prisma.setting.findMany(),
    isAdmin
      ? prisma.user.findMany({
          where: {
            teacherProfile: { isNot: null },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [],
  ]);

  const schools =
    settings.find((s) => s.name === Setting.Schools)?.value.split(',') ?? [];
  const teachers =
    settings.find((s) => s.name === Setting.Teachers)?.value.split(',') ?? [];

  return dataResponse(
    {
      students,
      filters: {
        schools,
        grades: Object.values(Grade),
        periods: Object.values(Period),
        teachers,
        workshopLeaders: isAdmin ? workshopLeaders : [],
      },
      isAdmin,
      cookieFilters: filters,
      totalCount,
    },
    newFiltersRaw
      ? {
          headers: {
            'Set-Cookie': await setStudentFilters(request, parsedFilters),
          },
        }
      : {}
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateFilters') {
    let filters = await getStudentFilters(request);
    const key = formData.get('key') as keyof StudentFilters | 'reset';
    const value = formData.get('value') as string;

    if (key === 'reset') {
      filters = JSON.parse(value) as StudentFilters;
    } else {
      filters[key] = getStudentFiltersValue(key, value) as never;
    }

    const cookie = await setStudentFilters(request, filters);
    return dataResponse(
      { success: true },
      { headers: { 'Set-Cookie': cookie } }
    );
  }

  if (intent === 'createView') {
    await prisma.studentView.create({
      data: {
        name: formData.get('name') as string,
        school: formData.get('school') as string,
        grade: formData.get('grade') as string,
        period: formData.get('period') as string,
        workshopLeader: formData.get('workshopLeader') as string,
        schoolTeacher: formData.get('schoolTeacher') as string,
        userId,
      },
    });

    return dataResponse(
      { success: true },
      {
        headers: await createToastHeaders({
          title: 'View Saved',
          description: 'Your Student View is now available on your Dashboard.',
        }),
      }
    );
  }

  if (intent === 'delete') {
    await prisma.studentProfile.deleteMany({
      where: {
        id: { in: formData.get('studentIds')?.toString().split(',') ?? [] },
      },
    });
    return dataResponse({ success: true });
  }

  if (intent === 'update') {
    await prisma.studentProfile.updateMany({
      where: {
        id: { in: formData.get('studentIds')?.toString().split(',') ?? [] },
      },
      data: {
        ...((formData.get('school')?.toString().length ?? 0) > 0
          ? { school: formData.get('school')?.toString() }
          : {}),
        ...((formData.get('grade')?.toString().length ?? 0) > 0
          ? { grade: formData.get('grade')?.toString() }
          : {}),
        ...((formData.get('period')?.toString().length ?? 0) > 0
          ? { period: formData.get('period')?.toString() }
          : {}),
        ...((formData.get('teacher')?.toString().length ?? 0) > 0
          ? { schoolTeacher: formData.get('teacher')?.toString() }
          : {}),
      },
    });
    return dataResponse({ success: true });
  }

  return dataResponse(
    { success: false, message: 'Unknown action intent' },
    { status: 400 }
  );
}

export default function StudentsRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { students, filters, isAdmin, cookieFilters, totalCount } =
    useLoaderData<typeof loader>();
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const fetcher = useFetcher<typeof action>();
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const user = useUser();
  const isTeacher = user.teacherProfile !== null;
  const isLoading = fetcher.state !== 'idle';

  useEffect(() => {
    if (searchParams.get('filters')) {
      setSearchParams((prev) => {
        prev.delete('filters');
        return prev;
      });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      setIsSaveViewOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSort = (field: SortField) => {
    fetcher.submit(
      {
        intent: 'updateFilters',
        key: 'sort',
        value: field,
      },
      { method: 'POST' }
    );

    fetcher.submit(
      {
        intent: 'updateFilters',
        key: 'direction',
        value:
          cookieFilters.sort === field && cookieFilters.direction === 'asc'
            ? 'desc'
            : 'asc',
      },
      { method: 'POST' }
    );
  };

  const handleFilter = (key: keyof StudentFilters, values: string[]) => {
    fetcher.submit(
      {
        intent: 'updateFilters',
        key,
        value: values.join(','),
      },
      { method: 'POST' }
    );
  };

  const hasActiveFilters = [
    'school',
    'grade',
    'period',
    'workshopLeader',
    'teacher',
  ].some((key) => {
    const value = cookieFilters[key as keyof StudentFilters];
    return Array.isArray(value) && value.length > 0;
  });

  const clearFilters = () => {
    const defaultFilters: StudentFilters = {
      query: '',
      school: [],
      grade: [],
      period: [],
      workshopLeader: [],
      teacher: [],
      view: 'table',
      sort: 'name',
      direction: 'asc',
      skip: 0,
      take: 10,
    };

    fetcher.submit(
      {
        intent: 'updateFilters',
        key: 'reset',
        value: JSON.stringify(defaultFilters),
      },
      { method: 'POST' }
    );
  };

  const toggleView = (view?: 'table' | 'cards') => {
    fetcher.submit(
      {
        intent: 'updateFilters',
        key: 'view',
        value: view ?? (cookieFilters.view === 'table' ? 'cards' : 'table'),
      },
      { method: 'POST' }
    );
  };

  const handleSelectAll = () => {
    setSelectedStudents((prev) =>
      prev.length === students.length ? [] : students.map((s) => s.id)
    );
  };

  const handleSelect = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    fetcher.submit(
      {
        intent: 'delete',
        studentIds: selectedStudents.join(','),
      },
      { method: 'POST' }
    );
    setIsDeleteModalOpen(false);
    setSelectedStudents([]);
  };

  const handleBulkUpdate = (formData: FormData) => {
    formData.append('intent', 'update');
    formData.append('studentIds', selectedStudents.join(','));
    fetcher.submit(formData, { method: 'POST' });
    setIsEditModalOpen(false);
    setSelectedStudents([]);
  };

  const onCellClick = (student: { id: string }) => {
    navigate(`/app/students/${student.id}`);
  };

  return (
    <main className="flex h-screen overflow-hidden">
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between px-4 pt-4">
          <h1 className="text-2xl font-bold">Students</h1>
        </div>
        <div className="mb-2 flex flex-col gap-2 px-4">
          <div className="flex-1">
            <SearchInput
              defaultQuery={cookieFilters.query}
              onSearch={(query) => {
                fetcher.submit(
                  {
                    intent: 'updateFilters',
                    key: 'query',
                    value: query,
                  },
                  { method: 'POST' }
                );
              }}
            />
          </div>
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-start gap-2">
              {selectedStudents.length === 0 ? null : (
                <>
                  <Button size="sm" onClick={() => setIsEditModalOpen(true)}>
                    <PencilIcon className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setIsDeleteModalOpen(true)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </>
              )}
              <MultiSelect
                label="School"
                options={[
                  ...filters.schools.map((school) => ({
                    value: school ?? 'none',
                    label: school ?? 'None',
                  })),
                ]}
                values={cookieFilters.school}
                onChange={(values) => handleFilter('school', values)}
                disabled={isLoading}
              />
              <MultiSelect
                label="Grade"
                options={[
                  ...filters.grades.map((grade) => ({
                    value: grade ?? 'none',
                    label: grade ?? 'None',
                  })),
                ]}
                values={cookieFilters.grade}
                onChange={(values) => handleFilter('grade', values)}
                disabled={isLoading}
              />
              <MultiSelect
                label="Period"
                options={[
                  ...filters.periods.map((period) => ({
                    value: period ?? 'none',
                    label: period ?? 'None',
                  })),
                ]}
                values={cookieFilters.period}
                onChange={(values) => handleFilter('period', values)}
                disabled={isLoading}
              />
              {isAdmin && (
                <MultiSelect
                  label="Workshop Leader"
                  options={[
                    ...filters.workshopLeaders.map((leader) => ({
                      value: leader.id,
                      label: leader.name ?? leader.id,
                    })),
                  ]}
                  values={cookieFilters.workshopLeader}
                  onChange={(values) => handleFilter('workshopLeader', values)}
                  disabled={isLoading}
                />
              )}
              <MultiSelect
                label="Teacher"
                options={[
                  ...filters.teachers.map((teacher) => ({
                    value: teacher ?? 'none',
                    label: teacher ?? 'None',
                  })),
                ]}
                values={cookieFilters.teacher}
                onChange={(values) => handleFilter('teacher', values)}
                disabled={isLoading}
              />
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  disabled={isLoading}
                >
                  Clear
                </Button>
              )}
              {hasActiveFilters && isTeacher && (
                <Button
                  variant="outline-primary"
                  size="icon-sm"
                  onClick={() => setIsSaveViewOpen(true)}
                  disabled={isLoading}
                >
                  <BookmarkIcon className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {cookieFilters.view === 'cards' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isLoading}>
                      <ArrowUpDownIcon
                        className="mr-1 h-3.5 w-3.5 opacity-50"
                        strokeWidth={3}
                      />{' '}
                      {
                        SORT_FIELDS.find((f) => f.value === cookieFilters.sort)
                          ?.label
                      }
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {SORT_FIELDS.map(({ label, value }) => (
                      <DropdownMenuItem
                        key={value}
                        onClick={() => handleSort(value)}
                        className="flex items-center justify-between"
                        disabled={isLoading}
                      >
                        {label}
                        {cookieFilters.sort === value &&
                          (cookieFilters.direction === 'desc' ? (
                            <ArrowUp className="ml-2 h-4 w-4" />
                          ) : (
                            <ArrowDown className="ml-2 h-4 w-4" />
                          ))}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="flex items-center rounded-full border bg-muted p-0.5">
                <Button
                  variant={
                    cookieFilters.view === 'table' ? 'secondary' : 'ghost'
                  }
                  size="icon"
                  className={cn(
                    'h-7 w-7 active:bg-white',
                    cookieFilters.view === 'table' &&
                      'bg-white shadow hover:bg-white'
                  )}
                  onClick={() => toggleView('table')}
                  disabled={isLoading}
                >
                  <List className="h-[18px] w-[18px]" />
                </Button>
                <Button
                  variant={
                    cookieFilters.view === 'cards' ? 'secondary' : 'ghost'
                  }
                  size="icon"
                  className={cn(
                    'h-7 w-7 active:bg-white',
                    cookieFilters.view === 'cards' &&
                      'bg-white shadow hover:bg-white'
                  )}
                  onClick={() => toggleView('cards')}
                  disabled={isLoading}
                >
                  <LayoutGrid className="h-[18px] w-[18px]" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-b border-t">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="mt-2 text-sm text-muted-foreground">
                Loading...
              </span>
            </div>
          ) : students.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <span className="text-lg font-bold">No results</span>
              <span className="text-sm text-muted-foreground">
                Try adjusting your filters
              </span>
            </div>
          ) : cookieFilters.view === 'table' ? (
            <TableComponent>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] pl-4">
                    <Checkbox
                      checked={selectedStudents.length === students.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  {SORT_FIELDS.map(({ label, value }, index) => (
                    <TableHead
                      key={value}
                      className={index === SORT_FIELDS.length - 1 ? 'pr-4' : ''}
                    >
                      <Button
                        variant="unstyled"
                        className="h-8 p-0"
                        onClick={() => handleSort(value)}
                      >
                        {label}
                        {cookieFilters.sort === value ? (
                          cookieFilters.direction === 'desc' ? (
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
                {students.map((student) => (
                  <TableRow
                    key={student.id}
                    className={cn(
                      'cursor-pointer',
                      params?.id === student.id
                        ? 'bg-primary/10 hover:bg-primary/10'
                        : 'hover:bg-primary/5'
                    )}
                  >
                    <TableCell
                      className="max-h-[37px] pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedStudents.includes(student.id)}
                        onCheckedChange={() => handleSelect(student.id)}
                      />
                    </TableCell>
                    <TableCell onClick={() => onCellClick(student)}>
                      {student.user.name}
                    </TableCell>
                    <TableCell onClick={() => onCellClick(student)}>
                      {student.user.email}
                    </TableCell>
                    <TableCell onClick={() => onCellClick(student)}>
                      {student.school}
                    </TableCell>
                    <TableCell onClick={() => onCellClick(student)}>
                      {student.grade}
                    </TableCell>
                    <TableCell
                      onClick={() => onCellClick(student)}
                      className="pr-4"
                    >
                      {student.period}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableComponent>
          ) : (
            <div className="my-2 grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:grid-cols-5">
              {students.map((student) => (
                <div
                  key={student.id}
                  onClick={() => onCellClick(student)}
                  className={cn(
                    'flex h-32 cursor-pointer flex-col rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md',
                    params?.id === student.id && 'bg-primary/10'
                  )}
                >
                  <span className="flex gap-2 pb-2">
                    <UserImage
                      user={student.user}
                      size="xs"
                      className="h-9 w-9 rounded-md"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-bold">
                        {student.user.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {student.grade !== null ? `${student.grade} grade` : ''}
                        {student.period !== null
                          ? `, period ${student.period}`
                          : ''}
                        {student.grade === null && student.period === null
                          ? `No grade`
                          : ''}
                      </span>
                    </span>
                  </span>
                  <span className="mt-auto flex items-center gap-2 text-sm text-muted-foreground">
                    <FileIcon size={18} />
                    {student.user.documents.length}{' '}
                    {pluralize({
                      word: 'document',
                      count: student.user.documents.length,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 pb-8 pt-2">
          <Pagination
            totalCount={totalCount}
            skip={cookieFilters.skip}
            take={cookieFilters.take}
            setSkip={(skip) => {
              fetcher.submit(
                {
                  intent: 'updateFilters',
                  key: 'skip',
                  value: skip.toString(),
                },
                { method: 'POST' }
              );
            }}
            setTake={(take) => {
              fetcher.submit(
                {
                  intent: 'updateFilters',
                  key: 'take',
                  value: take.toString(),
                },
                { method: 'POST' }
              );
            }}
          />
        </div>
      </div>
      <Outlet />

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Students</DialogTitle>
            <DialogDescription>
              Update details for {selectedStudents.length} selected students
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form
            onSubmit={(e) => {
              e.preventDefault();
              handleBulkUpdate(new FormData(e.currentTarget));
            }}
          >
            <div className="grid gap-4 py-4">
              <FormMultiSelect
                multiple={false}
                label="School"
                name="school"
                options={[
                  ...filters.schools.map((school) => ({
                    value: school ?? 'none',
                    label: school ?? 'None',
                  })),
                ]}
                queryKey="school"
              />
              <FormMultiSelect
                multiple={false}
                label="Grade"
                name="grade"
                options={[
                  ...filters.grades.map((grade) => ({
                    value: grade ?? 'none',
                    label: grade ?? 'None',
                  })),
                ]}
                queryKey="grade"
              />
              <FormMultiSelect
                multiple={false}
                label="Period"
                name="period"
                options={[
                  ...filters.periods.map((period) => ({
                    value: period ?? 'none',
                    label: period ?? 'None',
                  })),
                ]}
                queryKey="period"
              />
              <FormMultiSelect
                multiple={false}
                label="Teacher"
                name="teacher"
                options={[
                  ...filters.teachers.map((teacher) => ({
                    value: teacher ?? 'none',
                    label: teacher ?? 'None',
                  })),
                ]}
                queryKey="teacher"
              />
            </div>
            <DialogFooter>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Students</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedStudents.length}{' '}
              students? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveViewOpen} onOpenChange={setIsSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Student View</DialogTitle>
            <DialogDescription>
              Save your current filters and sorting preferences for quick access
              in the Sections of your Dashboard.
            </DialogDescription>
          </DialogHeader>
          <ValidatedForm
            schema={saveViewValidator}
            method="post"
            fetcher={fetcher}
            defaultValues={{
              name: '',
              intent: 'createView',
              school: cookieFilters.school.join(','),
              grade: cookieFilters.grade.join(','),
              period: cookieFilters.period.join(','),
              workshopLeader: cookieFilters.workshopLeader.join(','),
              schoolTeacher: cookieFilters.teacher.join(','),
            }}
          >
            <div className="grid gap-4 py-4">
              <Input
                name="name"
                placeholder="Enter view name"
                autoFocus
                required
              />
              <input type="hidden" name="intent" value="createView" />
              <input
                type="hidden"
                name="school"
                value={cookieFilters.school.join(',')}
              />
              <input
                type="hidden"
                name="grade"
                value={cookieFilters.grade.join(',')}
              />
              <input
                type="hidden"
                name="period"
                value={cookieFilters.period.join(',')}
              />
              <input
                type="hidden"
                name="workshopLeader"
                value={cookieFilters.workshopLeader.join(',')}
              />
              <input
                type="hidden"
                name="schoolTeacher"
                value={cookieFilters.teacher.join(',')}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={fetcher.state === 'submitting'}>
                {fetcher.state === 'submitting' ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </ValidatedForm>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
