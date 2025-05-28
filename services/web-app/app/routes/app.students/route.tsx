import { useLocalStorage } from 'usehooks-ts';
import {
  data as dataResponse,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useParams,
  useSearchParams,
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
} from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  parseFormData,
  ValidatedForm,
  validationError,
} from '@rvf/react-router';
import { toast as showToast } from 'sonner';
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

export const handle: BreadcrumbHandle = { breadcrumb: 'Students' };

type SortField = 'name' | 'email' | 'school' | 'grade' | 'period' | 'createdAt';
type SortDirection = 'asc' | 'desc';

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
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const skip = parseInt(url.searchParams.get('skip') ?? '0');
  const take = parseInt(url.searchParams.get('take') ?? '10');
  const sortField = (url.searchParams.get('sort') as SortField) ?? 'name';
  const sortDirection =
    (url.searchParams.get('direction') as SortDirection) ?? 'asc';
  const selectedSchools = url.searchParams.get('school')?.split(',') ?? [];
  const selectedGrades = url.searchParams.get('grade')?.split(',') ?? [];
  const selectedPeriods = url.searchParams.get('period')?.split(',') ?? [];
  const selectedWorkshopLeaders =
    url.searchParams.get('workshopLeader')?.split(',') ?? [];
  const selectedTeachers = url.searchParams.get('teacher')?.split(',') ?? [];
  const viewMode = url.searchParams.get('view') ?? 'table';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
      teacherProfile: true,
    },
  });

  const isAdmin = user?.roles.some((role) => role.name === 'admin');
  const isTeacher = user?.teacherProfile !== null;

  const where = {
    AND: [
      {
        OR: [
          { user: { name: { contains: query } } },
          { user: { email: { contains: query } } },
          { school: { contains: query } },
          { grade: { contains: query } },
          { period: { contains: query } },
        ],
      },
      selectedSchools.length > 0 && !selectedSchools.includes('all')
        ? {
            OR: selectedSchools.map((school) =>
              school === 'none'
                ? { school: null }
                : { school: { equals: school } }
            ),
          }
        : {},
      selectedGrades.length > 0 && !selectedGrades.includes('all')
        ? {
            OR: selectedGrades.map((grade) =>
              grade === 'none' ? { grade: null } : { grade: { equals: grade } }
            ),
          }
        : {},
      selectedPeriods.length > 0 && !selectedPeriods.includes('all')
        ? {
            OR: selectedPeriods.map((period) =>
              period === 'none'
                ? { period: null }
                : { period: { equals: period } }
            ),
          }
        : {},
      selectedWorkshopLeaders.length > 0 &&
      !selectedWorkshopLeaders.includes('all')
        ? {
            OR: selectedWorkshopLeaders.map((workshopLeader) =>
              workshopLeader === 'none'
                ? { workshopLeaderId: null }
                : { workshopLeaderId: { equals: workshopLeader } }
            ),
          }
        : {},
      selectedTeachers.length > 0 && !selectedTeachers.includes('all')
        ? {
            OR: selectedTeachers.map((teacher) =>
              teacher === 'none'
                ? { schoolTeacher: null }
                : { schoolTeacher: { equals: teacher } }
            ),
          }
        : {},
      // If user is a teacher (not admin), only show their students
      !isAdmin && isTeacher ? { workshopLeaderId: userId } : {},
    ],
  };

  const orderBy =
    sortField === 'name' || sortField === 'email'
      ? { user: { [sortField]: sortDirection } }
      : { [sortField]: sortDirection };

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
      take,
      skip,
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

  return dataResponse({
    students,
    sortField,
    sortDirection,
    totalCount,
    filters: {
      schools,
      grades: Object.values(Grade),
      periods: Object.values(Period),
      teachers,
      workshopLeaders: isAdmin ? workshopLeaders : [],
    },
    viewMode,
    isAdmin,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'createView') {
    const { error, data } = await parseFormData(request, saveViewValidator);
    if (error) return validationError(error);

    await prisma.studentView.create({
      data: {
        name: data.name,
        school: data.school,
        grade: data.grade,
        period: data.period,
        workshopLeader: data.workshopLeader,
        schoolTeacher: data.schoolTeacher,
        userId,
      },
    });

    return dataResponse({ success: true });
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
        ...(formData.get('school')?.toString()
          ? { school: formData.get('school')?.toString() }
          : {}),
        ...(formData.get('grade')?.toString()
          ? { grade: formData.get('grade')?.toString() }
          : {}),
        ...(formData.get('period')?.toString()
          ? { period: formData.get('period')?.toString() }
          : {}),
        ...(formData.get('teacher')?.toString()
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
  const {
    students,
    sortField,
    sortDirection,
    filters,
    totalCount,
    viewMode,
    isAdmin,
  } = useLoaderData<typeof loader>();
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const fetcher = useFetcher<typeof action>();
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const user = useUser();
  const isTeacher = user.teacherProfile !== null;

  const [storedFilter, setStoredFilter] = useLocalStorage<{ query: string }>(
    'students-filter',
    { query: '' }
  );

  const handleSort = (field: SortField) => {
    setSearchParams((prev) => {
      if (prev.get('sort') === field) {
        prev.set('direction', prev.get('direction') === 'asc' ? 'desc' : 'asc');
      } else {
        prev.set('sort', field);
        prev.set('direction', 'asc');
      }
      setStoredFilter({ query: prev.toString() });
      return prev;
    });
  };

  const handleFilter = (key: string, values: string[]) => {
    setSearchParams((prev) => {
      if (values.length > 0) {
        prev.set(key, values.join(','));
      } else {
        prev.delete(key);
      }
      setStoredFilter({ query: prev.toString() });
      return prev;
    });
  };

  const getSelectedValues = (key: string) => {
    const value = searchParams.get(key);
    return value ? value.split(',') : [];
  };

  const hasActiveFilters = [
    'school',
    'grade',
    'period',
    'workshopLeader',
    'teacher',
  ].some((key) => getSelectedValues(key).length > 0);

  const clearFilters = () => {
    setSearchParams((prev) => {
      prev.delete('school');
      prev.delete('grade');
      prev.delete('period');
      prev.delete('workshopLeader');
      prev.delete('teacher');
      setStoredFilter({ query: prev.toString() });
      return prev;
    });
  };

  const toggleView = (view?: 'table' | 'cards') => {
    setSearchParams((prev) => {
      prev.set('view', view ?? (viewMode === 'table' ? 'cards' : 'table'));
      setStoredFilter({ query: prev.toString() });
      return prev;
    });
  };

  const currentPage =
    Math.ceil(
      parseInt(searchParams.get('skip') ?? '0') /
        (parseInt(searchParams.get('take') ?? '10') ?? 10)
    ) + 1;

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
    const params = new URLSearchParams(window.location.search);
    navigate(`/app/students/${student.id}?${params}`);
  };

  useEffect(() => {
    if (
      fetcher.state === 'idle' &&
      fetcher.data &&
      !('fieldErrors' in fetcher.data) &&
      fetcher.data.success
    ) {
      setIsSaveViewOpen(false);
      showToast.success('View Saved', {
        description: 'Your Student View is now available on your Dashboard.',
      });
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <main className="flex h-screen overflow-hidden">
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between px-4 pt-4">
          <h1 className="text-2xl font-bold">Students</h1>
        </div>
        <div className="mb-2 flex flex-col gap-2 px-4">
          <div className="flex-1">
            <SearchInput />
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
                queryKey="school"
                onChange={(values) => handleFilter('school', values)}
              />
              <MultiSelect
                label="Grade"
                options={[
                  ...filters.grades.map((grade) => ({
                    value: grade ?? 'none',
                    label: grade ?? 'None',
                  })),
                ]}
                queryKey="grade"
                onChange={(values) => handleFilter('grade', values)}
              />
              <MultiSelect
                label="Period"
                options={[
                  ...filters.periods.map((period) => ({
                    value: period ?? 'none',
                    label: period ?? 'None',
                  })),
                ]}
                queryKey="period"
                onChange={(values) => handleFilter('period', values)}
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
                  queryKey="workshopLeader"
                  onChange={(values) => handleFilter('workshopLeader', values)}
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
                queryKey="teacher"
                onChange={(values) => handleFilter('teacher', values)}
              />
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              )}
              {hasActiveFilters && isTeacher && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setIsSaveViewOpen(true)}
                >
                  Save
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'cards' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Sort by{' '}
                      {SORT_FIELDS.find((f) => f.value === sortField)?.label}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {SORT_FIELDS.map(({ label, value }) => (
                      <DropdownMenuItem
                        key={value}
                        onClick={() => handleSort(value)}
                        className="flex items-center justify-between"
                      >
                        {label}
                        {sortField === value &&
                          (sortDirection === 'desc' ? (
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
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn(
                    'h-7 w-7 active:bg-white',
                    viewMode === 'table' && 'bg-white shadow hover:bg-white'
                  )}
                  onClick={() => toggleView('table')}
                >
                  <List className="h-[18px] w-[18px]" />
                </Button>
                <Button
                  variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn(
                    'h-7 w-7 active:bg-white',
                    viewMode === 'cards' && 'bg-white shadow hover:bg-white'
                  )}
                  onClick={() => toggleView('cards')}
                >
                  <LayoutGrid className="h-[18px] w-[18px]" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-b border-t">
          {students.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <span className="text-lg font-bold">No results</span>
              <span className="text-sm text-muted-foreground">
                Try adjusting your filters
              </span>
              {currentPage !== 1 ? (
                <div className="mt-4 max-w-[300px] rounded-lg border border-yellow-300/50 bg-yellow-100/50 p-4">
                  <h4 className="font-bold">Heads up!</h4>
                  <p className="text-sm">
                    You are currently on page <strong>{currentPage}</strong> of{' '}
                    <strong>
                      {Math.ceil(
                        totalCount /
                          parseInt(searchParams.get('take') ?? '10', 10)
                      )}
                    </strong>
                    . Results might show on the first page.
                  </p>
                </div>
              ) : null}
            </div>
          ) : viewMode === 'table' ? (
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
                        {sortField === value ? (
                          sortDirection === 'desc' ? (
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
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search);
                    navigate(`/app/students/${student.id}?${params}`);
                  }}
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
          <Pagination totalCount={totalCount} />
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
              school: '',
              grade: '',
              period: '',
              workshopLeader: '',
              schoolTeacher: '',
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
                value={searchParams.get('school') || ''}
              />
              <input
                type="hidden"
                name="grade"
                value={searchParams.get('grade') || ''}
              />
              <input
                type="hidden"
                name="period"
                value={searchParams.get('period') || ''}
              />
              <input
                type="hidden"
                name="workshopLeader"
                value={searchParams.get('workshopLeader') || ''}
              />
              <input
                type="hidden"
                name="schoolTeacher"
                value={searchParams.get('teacher') || ''}
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
