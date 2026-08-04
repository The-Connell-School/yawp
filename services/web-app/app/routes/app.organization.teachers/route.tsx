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
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { requireMembership, requireOwner } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { SearchInput } from '~/components/search-input';
import { useTable } from '~/hooks/useTable';
import { cn, getDomainUrl } from '~/utils/misc';
import { Tooltip } from '~/components/ui/tooltip';
import { sendEmail } from '~/utils/email.server';
import * as E from '@react-email/components';
import { generateTOTP } from '~/utils/totp.server';
import { Prisma } from '@app/prisma';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { useEffect, useState } from 'react';
import { normalizeEmail } from '~/utils/normalize-email';

function getSchoolEffectiveAssignmentTypeIds({
  school,
  orgAssignmentTypeIds,
}: {
  school: {
    assignmentTypesCustomized: boolean;
    assignmentTypeAssignments: Array<{ assignmentTypeId: string }>;
  };
  orgAssignmentTypeIds: string[];
}) {
  if (school.assignmentTypesCustomized) {
    return school.assignmentTypeAssignments.map(
      (assignment) => assignment.assignmentTypeId
    );
  }
  return orgAssignmentTypeIds;
}

function getTeacherInheritedAssignmentTypeIds({
  teacher,
  schoolsById,
  orgAssignmentTypeIds,
}: {
  teacher: {
    schools: Array<{ id: string }>;
  };
  schoolsById: Map<
    string,
    {
      assignmentTypesCustomized: boolean;
      assignmentTypeAssignments: Array<{ assignmentTypeId: string }>;
    }
  >;
  orgAssignmentTypeIds: string[];
}) {
  const inheritedIds = new Set<string>();
  for (const school of teacher.schools) {
    const schoolConfig = schoolsById.get(school.id);
    if (!schoolConfig) continue;
    for (const assignmentTypeId of getSchoolEffectiveAssignmentTypeIds({
      school: schoolConfig,
      orgAssignmentTypeIds,
    })) {
      inheritedIds.add(assignmentTypeId);
    }
  }
  if (inheritedIds.size === 0) {
    return orgAssignmentTypeIds;
  }
  return Array.from(inheritedIds);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireMembership(request, user.id);
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  const where = {
    organizationId: profile.organization.id,
    role: 'TEACHER' as const,
    isActive: true,
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

  const [teachers, teacherTrainings, assignmentTypes, orgAssignments, schools] =
    await Promise.all([
      prisma.orgMembership.findMany({
        where,
        include: {
          user: true,
          schools: {
            select: { id: true },
          },
          assignmentTypeAssignments: {
            select: { assignmentTypeId: true },
          },
          assignedTeacherTrainings: {
            select: { id: true },
          },
          _count: {
            select: {
              classesAsTeacher: true,
              assignedTeacherTrainings: true,
            },
          },
        },
        orderBy: {
          user: {
            name: 'asc',
          },
        },
      }),
      prisma.teacherTraining.findMany({
        select: { id: true, title: true },
        orderBy: { position: 'asc' },
      }),
      prisma.assignmentType.findMany({
        where: { archivedAt: null },
        select: { id: true, title: true },
        orderBy: { position: 'asc' },
      }),
      prisma.organizationAssignmentType.findMany({
        where: { organizationId: profile.organization.id },
        select: { assignmentTypeId: true },
      }),
      prisma.school.findMany({
        where: { organizationId: profile.organization.id },
        select: {
          id: true,
          assignmentTypesCustomized: true,
          assignmentTypeAssignments: {
            select: { assignmentTypeId: true },
          },
        },
      }),
    ]);

  const orgAssignmentTypeIds = orgAssignments.map(
    (assignment) => assignment.assignmentTypeId
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const teachersWithAssignmentDefaults = teachers.map((teacher) => ({
    ...teacher,
    inheritedAssignmentTypeIds: teacher.assignmentTypesCustomized
      ? teacher.assignmentTypeAssignments.map(
          (assignment) => assignment.assignmentTypeId
        )
      : getTeacherInheritedAssignmentTypeIds({
          teacher,
          schoolsById,
          orgAssignmentTypeIds,
        }),
  }));

  return dataResponse({
    teachers: teachersWithAssignmentDefaults,
    teacherTrainings,
    assignmentTypes: assignmentTypes.filter((type) =>
      orgAssignmentTypeIds.includes(type.id)
    ),
    orgAssignmentTypeIds,
    q,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireMembership(request, user.id);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'edit-teacher') {
    const teacherId = formData.get('teacherId')?.toString();
    if (!teacherId) {
      return dataResponse({ error: 'Teacher ID is required' }, { status: 400 });
    }

    const teacherTrainingIds = formData
      .getAll('teacherTrainingIds')
      .map((v) => v.toString())
      .filter(Boolean);
    const assignmentTypesCustomized =
      formData.get('assignmentTypesCustomized') === 'true';
    const assignmentTypeIds = Array.from(
      new Set(
        formData
          .getAll('assignmentTypeIds')
          .map((value) => value.toString())
          .filter(Boolean)
      )
    );

    const teacher = await prisma.orgMembership.findFirst({
      where: {
        id: teacherId,
        organizationId: profile.organization.id,
        role: 'TEACHER',
      },
      select: { id: true },
    });

    if (!teacher) {
      return dataResponse(
        { error: 'Teacher not found in your organization' },
        { status: 404 }
      );
    }

    if (teacherTrainingIds.length > 0) {
      const courses = await prisma.teacherTraining.findMany({
        where: { id: { in: teacherTrainingIds } },
        select: { id: true },
      });

      if (courses.length !== teacherTrainingIds.length) {
        return dataResponse(
          { error: 'One or more teacher trainings are invalid' },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction([
      prisma.orgMembership.update({
        where: { id: teacherId },
        data: {
          assignmentTypesCustomized,
          assignedTeacherTrainings: {
            set: teacherTrainingIds.map((id) => ({ id })),
          },
        },
      }),
      prisma.teacherAssignmentType.deleteMany({
        where: { membershipId: teacherId },
      }),
      ...(assignmentTypesCustomized && assignmentTypeIds.length > 0
        ? [
            prisma.teacherAssignmentType.createMany({
              data: assignmentTypeIds.map((assignmentTypeId) => ({
                membershipId: teacherId,
                assignmentTypeId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return dataResponse({ success: true });
  }

  if (intent === 'delete-teachers') {
    const teacherIds = formData.getAll('teacherIds') as string[];

    if (!teacherIds.length) {
      return dataResponse({ error: 'No teachers selected' }, { status: 400 });
    }

    const teachers = await prisma.orgMembership.findMany({
      where: {
        id: { in: teacherIds },
        organizationId: profile.organization.id,
        role: 'TEACHER',
      },
    });

    if (teachers.length !== teacherIds.length) {
      return dataResponse(
        { error: 'Some teachers do not belong to your organization' },
        { status: 400 }
      );
    }

    await prisma.orgMembership.updateMany({
      where: { id: { in: teacherIds } },
      data: { isActive: false },
    });

    return redirect('/app/organization/teachers');
  }

  if (intent === 'invite-teachers') {
    const emails = formData.get('emails')?.toString().trim();
    if (!emails) {
      return dataResponse({ error: 'Emails are required' }, { status: 400 });
    }

    const emailList = Array.from(
      new Set(
        emails
          .split(/[,\n]/)
          .map((email: string) => normalizeEmail(email))
          .filter((email: string) => email && email.includes('@'))
      )
    );

    if (emailList.length === 0) {
      return dataResponse(
        { error: 'No valid emails provided' },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: profile.organization.id },
      select: { name: true },
    });

    let successCount = 0;
    for (const email of emailList) {
      try {
        // Check for existing invitation and delete if found
        const existingInvitation = await prisma.invitation.findFirst({
          where: {
            target: { equals: email, mode: 'insensitive' },
            type: 'onboard-teacher',
            metadata: JSON.stringify({
              organizationId: profile.organization.id,
            }),
          },
        });

        if (existingInvitation) {
          await prisma.invitation.delete({
            where: { id: existingInvitation.id },
          });
        }

        const { otp, ...verificationConfig } = await generateTOTP({
          algorithm: 'SHA-256',
          charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
          period: 3 * 24 * 60 * 60,
        });

        const type = 'onboard-teacher';
        const target = email;
        const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
        verifyUrl.searchParams.set('type', type);
        verifyUrl.searchParams.set('target', target);
        verifyUrl.searchParams.set('code', otp);

        const verificationData: Prisma.InvitationCreateInput = {
          type,
          target,
          ...verificationConfig,
          expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
          metadata: JSON.stringify({
            organizationId: profile.organization.id,
          }),
        };

        await prisma.invitation.create({ data: verificationData });

        await sendEmail({
          to: email,
          subject: "You're invited to join your organization on Yawp!",
          react: (
            <OrganizationInviteEmail
              verifyUrl={verifyUrl.toString()}
              organizationName={organization?.name ?? 'your organization'}
              userType="teacher"
            />
          ),
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to send invitation to ${email}:`, error);
      }
    }

    return dataResponse({
      success: true,
      message: `Invitations sent to ${successCount} teacher(s)`,
      invited: successCount,
    });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

function OrganizationInviteEmail({
  verifyUrl,
  userType,
  organizationName,
}: {
  verifyUrl: string;
  userType: 'teacher' | 'student' | 'owner';
  organizationName: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Welcome to Yawp!</E.Text>
        </h1>
        <p>
          <E.Text>
            You've been invited to join {organizationName} as{' '}
            {userType === 'owner' ? 'an owner' : `a ${userType}`} on Yawp!
          </E.Text>
        </p>
        <p>
          <E.Text>Click the link to get started:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
        <p>
          <E.Text>
            This invitation will expire in 3 days for security reasons.
          </E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}

export default function OrganizationTeachersRoute() {
  const {
    teachers,
    teacherTrainings,
    assignmentTypes,
    orgAssignmentTypeIds,
    q,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const inviteFetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isInviteSheetOpen, setIsInviteSheetOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<
    (typeof teachers)[0] | null
  >(null);
  const { selected, setSelected, isLoading, handleSelectAll, handleSelect } =
    useTable({ rows: teachers });

  const handleEdit = (teacher: (typeof teachers)[0]) => {
    setEditingTeacher(teacher);
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
            <Button size="sm" onClick={() => setIsInviteSheetOpen(true)}>
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
                      <TableHead>Teacher Trainings</TableHead>
                      <TableHead className="pr-4">Actions</TableHead>
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
                          {teacher.user.name || 'Not set'}
                        </TableCell>
                        <TableCell>{teacher.user.email}</TableCell>
                        <TableCell>{teacher._count.classesAsTeacher}</TableCell>
                        <TableCell>
                          {teacher._count.assignedTeacherTrainings}
                        </TableCell>
                        <TableCell className="pr-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(teacher)}
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

      <TeacherSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingTeacher={editingTeacher}
        teacherTrainings={teacherTrainings}
        assignmentTypes={assignmentTypes}
        orgAssignmentTypeIds={orgAssignmentTypeIds}
      />

      {/* Invite Teacher Sheet */}
      <Sheet open={isInviteSheetOpen} onOpenChange={setIsInviteSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invite Teachers</SheetTitle>
          </SheetHeader>
          <inviteFetcher.Form method="post" className="mt-4 space-y-4">
            <input type="hidden" name="intent" value="invite-teachers" />
            <div className="space-y-2">
              <Label htmlFor="emails">
                Email addresses (comma or line separated)
              </Label>
              <Textarea
                id="emails"
                name="emails"
                placeholder="teacher1@example.com, teacher2@example.com"
                rows={4}
                required
              />
            </div>
            {inviteFetcher.data?.error && (
              <div className="text-sm text-red-600">
                {inviteFetcher.data.error}
              </div>
            )}
            {inviteFetcher.data?.success && (
              <div className="text-sm text-green-600">
                {inviteFetcher.data.message}
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={inviteFetcher.state !== 'idle'}
            >
              {inviteFetcher.state !== 'idle'
                ? 'Sending...'
                : 'Send Invitations'}
            </Button>
          </inviteFetcher.Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TeacherSheet({
  open,
  onOpenChange,
  editingTeacher,
  teacherTrainings,
  assignmentTypes,
  orgAssignmentTypeIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTeacher: any | null;
  teacherTrainings: { id: string; title: string }[];
  assignmentTypes: Array<{ id: string; title: string }>;
  orgAssignmentTypeIds: string[];
}) {
  const fetcherKey = editingTeacher ? `edit-${editingTeacher.id}` : 'none';
  const fetcher = useFetcher({ key: fetcherKey });
  const [selectedTeacherTrainings, setSelectedTeacherTrainings] = useState<
    string[]
  >([]);
  const [assignmentTypesMode, setAssignmentTypesMode] = useState<
    'inherit' | 'customize'
  >('inherit');
  const [selectedAssignmentTypes, setSelectedAssignmentTypes] = useState<
    string[]
  >([]);

  useEffect(() => {
    if (!editingTeacher) return;
    setSelectedTeacherTrainings(
      editingTeacher.assignedTeacherTrainings?.map((c: any) => c.id) || []
    );
    if (editingTeacher.assignmentTypesCustomized) {
      setAssignmentTypesMode('customize');
      setSelectedAssignmentTypes(
        editingTeacher.assignmentTypeAssignments?.map(
          (assignment: { assignmentTypeId: string }) =>
            assignment.assignmentTypeId
        ) || []
      );
    } else {
      setAssignmentTypesMode('inherit');
      setSelectedAssignmentTypes(
        editingTeacher.inheritedAssignmentTypeIds || orgAssignmentTypeIds
      );
    }
  }, [editingTeacher, open, orgAssignmentTypeIds]);

  const handleAssignmentTypesModeChange = (mode: 'inherit' | 'customize') => {
    setAssignmentTypesMode(mode);
    if (mode === 'customize' && editingTeacher) {
      setSelectedAssignmentTypes(
        editingTeacher.inheritedAssignmentTypeIds || orgAssignmentTypeIds
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;

    const formData = new FormData();
    formData.append('intent', 'edit-teacher');
    formData.append('teacherId', editingTeacher.id);
    formData.append(
      'assignmentTypesCustomized',
      assignmentTypesMode === 'customize' ? 'true' : 'false'
    );
    selectedTeacherTrainings.forEach((teacherTrainingId) => {
      formData.append('teacherTrainingIds', teacherTrainingId);
    });
    if (assignmentTypesMode === 'customize') {
      selectedAssignmentTypes.forEach((assignmentTypeId) => {
        formData.append('assignmentTypeIds', assignmentTypeId);
      });
    }
    fetcher.submit(formData, { method: 'POST' });
  };

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  if (!editingTeacher) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Teacher</SheetTitle>
          <SheetDescription>
            Manage teacher trainings and assignment type access
          </SheetDescription>
        </SheetHeader>

        {fetcher.data?.error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm">
            {fetcher.data.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label>Teacher Name</Label>
            <div className="text-sm font-medium text-muted-foreground">
              {editingTeacher.user.name || 'Not set'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <div className="text-sm font-medium text-muted-foreground">
              {editingTeacher.user.email}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Teacher Trainings</Label>
            <div className="rounded-md border border-input bg-background">
              <div className="max-h-[300px] overflow-y-auto p-3 space-y-2">
                {teacherTrainings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No teacher trainings available
                  </p>
                ) : (
                  teacherTrainings.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`teacher-training-${course.id}`}
                        checked={selectedTeacherTrainings.includes(course.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTeacherTrainings([
                              ...selectedTeacherTrainings,
                              course.id,
                            ]);
                          } else {
                            setSelectedTeacherTrainings(
                              selectedTeacherTrainings.filter(
                                (id) => id !== course.id
                              )
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`teacher-training-${course.id}`}
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
              {selectedTeacherTrainings.length > 0
                ? `${selectedTeacherTrainings.length} training${selectedTeacherTrainings.length !== 1 ? 's' : ''} selected`
                : 'No trainings selected (teacher will see all trainings)'}
            </p>
          </div>

          <div
            className="space-y-2"
            data-testid="teacher-assignment-types-manager"
          >
            <Label>Assignment Types</Label>
            <RadioGroup
              value={assignmentTypesMode}
              onValueChange={(value) =>
                handleAssignmentTypesModeChange(
                  value as 'inherit' | 'customize'
                )
              }
              className="grid gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="inherit"
                  id="teacher-assignment-inherit"
                />
                <Label
                  htmlFor="teacher-assignment-inherit"
                  className="text-sm font-normal cursor-pointer"
                >
                  Inherit from school
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="customize"
                  id="teacher-assignment-customize"
                />
                <Label
                  htmlFor="teacher-assignment-customize"
                  className="text-sm font-normal cursor-pointer"
                >
                  Customize for this teacher
                </Label>
              </div>
            </RadioGroup>
            {assignmentTypesMode === 'customize' ? (
              <div className="rounded-md border border-input bg-background">
                <div className="max-h-[300px] overflow-y-auto p-3 space-y-2">
                  {assignmentTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No assignment types available for this organization
                    </p>
                  ) : (
                    assignmentTypes.map((assignmentType) => (
                      <div
                        key={assignmentType.id}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`teacher-assignment-type-${assignmentType.id}`}
                          checked={selectedAssignmentTypes.includes(
                            assignmentType.id
                          )}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedAssignmentTypes([
                                ...selectedAssignmentTypes,
                                assignmentType.id,
                              ]);
                            } else {
                              setSelectedAssignmentTypes(
                                selectedAssignmentTypes.filter(
                                  (id) => id !== assignmentType.id
                                )
                              );
                            }
                          }}
                        />
                        <Label
                          htmlFor={`teacher-assignment-type-${assignmentType.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {assignmentType.title}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {fetcher.state !== 'idle' ? 'Saving...' : 'Update Teacher'}
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
