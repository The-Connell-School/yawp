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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { useState, useEffect } from 'react';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Plus, Pencil, Trash2, Copy, Check } from 'lucide-react';
import { SearchInput } from '~/components/search-input';
import { useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import { Tooltip } from '~/components/ui/tooltip';
import { TooltipIdCopy } from '~/components/ui/tooltip-id-copy';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  const where = {
    organizationId: profile.organization.id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { code: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  } as const;

  const [schools, teachers] = await Promise.all([
    prisma.school.findMany({
      where,
      include: {
        teachers: {
          include: {
            profile: {
              include: {
                user: true,
              },
            },
          },
        },
        _count: {
          select: {
            classes: true,
            teachers: true,
          },
        },
      },
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
  ]);

  return dataResponse({ schools, teachers, q });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create-school') {
    const name = formData.get('name') as string;
    const code = formData.get('code') as string;
    const teacherIds = formData.getAll('teacherIds') as string[];

    if (!name || !code) {
      return dataResponse(
        { error: 'Name and code are required' },
        { status: 400 }
      );
    }

    try {
      await prisma.school.create({
        data: {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          organizationId: profile.organization.id,
          teachers: {
            connect: teacherIds.map((id) => ({ id })),
          },
        },
      });

      return dataResponse({ success: true });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return dataResponse(
          { error: 'A school with this code already exists' },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (intent === 'edit-school') {
    const schoolId = formData.get('schoolId') as string;
    const name = formData.get('name') as string;
    const code = formData.get('code') as string;
    const teacherIds = formData.getAll('teacherIds') as string[];

    if (!schoolId || !name || !code) {
      return dataResponse(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    const school = await prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
    });

    if (!school) {
      return dataResponse({ error: 'School not found' }, { status: 404 });
    }

    try {
      await prisma.school.update({
        where: { id: schoolId },
        data: {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          teachers: {
            set: teacherIds.map((id) => ({ id })),
          },
        },
      });

      return dataResponse({ success: true });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return dataResponse(
          { error: 'A school with this code already exists' },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (intent === 'delete-schools') {
    const schoolIds = formData.getAll('schoolIds') as string[];

    if (!schoolIds.length) {
      return dataResponse({ error: 'No schools selected' }, { status: 400 });
    }

    const schools = await prisma.school.findMany({
      where: {
        id: { in: schoolIds },
        organizationId: profile.organization.id,
      },
      include: {
        _count: {
          select: {
            classes: true,
          },
        },
      },
    });

    if (schools.length !== schoolIds.length) {
      return dataResponse(
        { error: 'Some schools do not belong to your organization' },
        { status: 400 }
      );
    }

    const schoolsWithClasses = schools.filter((s) => s._count.classes > 0);
    if (schoolsWithClasses.length > 0) {
      return dataResponse(
        {
          error: `Cannot delete ${schoolsWithClasses.length} school(s) with classes. Please delete or reassign classes first.`,
        },
        { status: 400 }
      );
    }

    await prisma.school.deleteMany({
      where: { id: { in: schoolIds } },
    });

    return redirect('/app/organization/schools');
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function OrganizationSchoolsRoute() {
  const { schools, teachers, q } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selected, setSelected, isLoading, handleSelectAll, handleSelect } =
    useTable({ rows: schools });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<
    (typeof schools)[0] | null
  >(null);

  const handleEdit = (school: (typeof schools)[0]) => {
    setEditingSchool(school);
    setSheetOpen(true);
  };

  const handleCreate = () => {
    setEditingSchool(null);
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
              <fetcher.Form method="post" className="inline">
                <input type="hidden" name="intent" value="delete-schools" />
                {selected.map((id) => (
                  <input key={id} type="hidden" name="schoolIds" value={id} />
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
                          `Are you sure you want to delete ${selected.length} school(s)? This cannot be undone.`
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
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create School
            </Button>
          </div>
        </div>

        <div>
          <div className="relative flex-1 overflow-y-auto min-h-[200px]">
            {schools.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted p-12">
                <span className="text-lg font-bold">No schools found</span>
                <span className="text-sm text-muted-foreground">
                  {q
                    ? 'Try adjusting your search'
                    : 'Create your first school to get started'}
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
                          checked={selected.length === schools.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Teachers</TableHead>
                      <TableHead className="pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schools.map((school) => (
                      <TableRow key={school.id}>
                        <TableCell className="max-h-[37px] pl-4">
                          <Checkbox
                            checked={selected.includes(school.id)}
                            onCheckedChange={() => handleSelect(school.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <TooltipIdCopy id={school.id}>
                              <span className="font-mono font-semibold">
                                {school.code}
                              </span>
                            </TooltipIdCopy>
                            <CopyCodeButton code={school.code} />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {school.name}
                        </TableCell>
                        <TableCell>{school._count.classes}</TableCell>
                        <TableCell>{school._count.teachers}</TableCell>
                        <TableCell className="pr-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(school)}
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
        </div>
      </div>

      <SchoolSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingSchool={editingSchool}
        teachers={teachers}
      />
    </div>
  );
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

function SchoolSheet({
  open,
  onOpenChange,
  editingSchool,
  teachers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSchool: any | null;
  teachers: any[];
}) {
  const fetcherKey = editingSchool ? `edit-${editingSchool.id}` : 'create';
  const fetcher = useFetcher({ key: fetcherKey });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);

  useEffect(() => {
    setName(editingSchool?.name || '');
    if (editingSchool?.code) {
      setCode(editingSchool.code);
    } else {
      setCode(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    setSelectedTeachers(editingSchool?.teachers?.map((t: any) => t.id) || []);
  }, [editingSchool, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('intent', editingSchool ? 'edit-school' : 'create-school');
    if (editingSchool) {
      formData.append('schoolId', editingSchool.id);
    }
    formData.append('name', name);
    formData.append('code', code);
    selectedTeachers.forEach((teacherId) => {
      formData.append('teacherIds', teacherId);
    });
    fetcher.submit(formData, { method: 'POST' });
  };

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
            {editingSchool ? 'Edit School' : 'Create School'}
          </SheetTitle>
          <SheetDescription>
            {editingSchool
              ? 'Update the school information below'
              : 'Fill in the details to create a new school'}
          </SheetDescription>
        </SheetHeader>

        {fetcher.data?.error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm">
            {fetcher.data.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">School Name</Label>
            <Input
              id="name"
              placeholder="Lincoln Elementary School"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">School Code</Label>
            <Input
              id="code"
              placeholder="LES123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={20}
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for the school
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
                : 'Select teachers to assign to this school'}
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {fetcher.state !== 'idle'
                ? 'Saving...'
                : editingSchool
                  ? 'Update School'
                  : 'Create School'}
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
