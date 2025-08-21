import * as React from 'react';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Checkbox } from '~/components/ui/checkbox';
import { Switch } from '~/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { useFetcher } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { cn } from '~/utils/misc';

export type TeacherProfile = {
  id: string;
  profileId: string;
  profile: { user: { id: string; name: string | null; email: string } };
  schools: { id: string; name: string }[];
  classes: {
    id: string;
    grade: string | number;
    period: string | number;
    schoolId: string;
  }[];
};

export type School = {
  id: string;
  name: string;
  classes: {
    id: string;
    grade: string | number;
    period: string | number;
    schoolId?: string;
  }[];
};

export type User = {
  id: string;
  name: string | null;
  email: string;
  profiles: Array<{
    isOwner: boolean;
    teacherProfile?: unknown | null;
    studentProfile?: unknown | null;
  }>;
};

type EditMemberSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: User | null;
  teacherProfiles: TeacherProfile[];
  schools: School[];
};

export function EditMemberSheet({
  open,
  onOpenChange,
  member,
  teacherProfiles,
  schools,
}: EditMemberSheetProps) {
  const editFetcher = useFetcher();
  const assignFetcher = useFetcher();

  const teacherProfile = React.useMemo(
    () =>
      member
        ? teacherProfiles.find((t) => t.profile.user.id === member.id)
        : undefined,
    [member, teacherProfiles]
  );

  const [assignedSchoolIds, setAssignedSchoolIds] = React.useState<Set<string>>(
    () => new Set(teacherProfile?.schools?.map((s) => s.id) ?? [])
  );
  const [assignedClassIds, setAssignedClassIds] = React.useState<Set<string>>(
    () => new Set(teacherProfile?.classes?.map((c) => c.id) ?? [])
  );
  const [expandedSchoolIds, setExpandedSchoolIds] = React.useState<Set<string>>(
    () => new Set<string>()
  );

  React.useEffect(() => {
    setAssignedSchoolIds(
      new Set(teacherProfile?.schools?.map((s) => s.id) ?? [])
    );
    setAssignedClassIds(
      new Set(teacherProfile?.classes?.map((c) => c.id) ?? [])
    );
  }, [teacherProfile?.id]);

  if (!member) return null;

  function toggleSchoolAssignment(schoolId: string, shouldAssign: boolean) {
    if (!teacherProfile) return;
    setAssignedSchoolIds((prev) => {
      const next = new Set(prev);
      if (shouldAssign) next.add(schoolId);
      else next.delete(schoolId);
      return next;
    });
    if (shouldAssign) {
      setExpandedSchoolIds((prev) => new Set(prev).add(schoolId));
    }
    assignFetcher.submit(
      {
        intent: shouldAssign
          ? 'assign-teacher-to-school'
          : 'unassign-teacher-from-school',
        teacherProfileId: teacherProfile.id,
        schoolId,
      },
      { method: 'POST', preventScrollReset: true }
    );
  }

  function toggleExpandSchool(schoolId: string) {
    setExpandedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(schoolId)) next.delete(schoolId);
      else next.add(schoolId);
      return next;
    });
  }

  function toggleClassAssignment(
    classId: string,
    schoolId: string,
    shouldAssign: boolean
  ) {
    if (!teacherProfile) return;
    // Ensure the school becomes assigned if assigning a class
    if (shouldAssign && !assignedSchoolIds.has(schoolId)) {
      setAssignedSchoolIds((prev) => new Set(prev).add(schoolId));
    }
    setAssignedClassIds((prev) => {
      const next = new Set(prev);
      if (shouldAssign) next.add(classId);
      else next.delete(classId);
      return next;
    });
    assignFetcher.submit(
      {
        intent: shouldAssign
          ? 'assign-teacher-to-class'
          : 'unassign-teacher-from-class',
        teacherProfileId: teacherProfile.id,
        classId,
      },
      { method: 'POST', preventScrollReset: true }
    );
  }

  function assignAllClassesForSchool(schoolId: string) {
    if (!teacherProfile) return;
    setAssignedSchoolIds((prev) => new Set(prev).add(schoolId));
    const school = schools.find((s) => s.id === schoolId);
    if (school) {
      setAssignedClassIds((prev) => {
        const next = new Set(prev);
        for (const c of school.classes) next.add(c.id);
        return next;
      });
    }
    assignFetcher.submit(
      {
        intent: 'assign-teacher-to-all-classes-in-school',
        teacherProfileId: teacherProfile.id,
        schoolId,
      },
      { method: 'POST', preventScrollReset: true }
    );
  }

  function unassignAllClassesForSchool(schoolId: string) {
    if (!teacherProfile) return;
    const school = schools.find((s) => s.id === schoolId);
    if (school) {
      setAssignedClassIds((prev) => {
        const next = new Set(prev);
        for (const c of school.classes) next.delete(c.id);
        return next;
      });
    }
    assignFetcher.submit(
      {
        intent: 'unassign-teacher-from-all-classes-in-school',
        teacherProfileId: teacherProfile.id,
        schoolId,
      },
      { method: 'POST', preventScrollReset: true }
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="sm:max-w-lg md:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Edit Member</SheetTitle>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="text-sm font-medium">Member Information</div>
            <div className="text-xs text-muted-foreground">
              <div>
                <strong>Name:</strong> {member.name || 'Not set'}
              </div>
              <div>
                <strong>Email:</strong> {member.email}
              </div>
              <div>
                <strong>Current Status:</strong>{' '}
                {member.profiles.some((p) => p.isOwner)
                  ? 'Owner'
                  : member.profiles.some((p) => p.teacherProfile)
                    ? 'Teacher'
                    : member.profiles.some((p) => p.studentProfile)
                      ? 'Student'
                      : 'Unassigned'}
              </div>
              {member.profiles.some((p) => p.isOwner) && (
                <div className="text-orange-600 font-medium">
                  <strong>Super Owner</strong> - Cannot be managed by regular
                  owners
                </div>
              )}
            </div>
          </div>

          <editFetcher.Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="edit-member" />
            <input type="hidden" name="memberId" value={member.id} />

            <div className="space-y-4">
              {member.profiles.some((p) => p.isOwner) &&
                member.profiles.some((p) => p.studentProfile) &&
                !member.profiles.some((p) => p.teacherProfile) && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="createTeacherProfile"
                        name="createTeacherProfile"
                      />
                      <Label htmlFor="createTeacherProfile">
                        Create Teacher Profile
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This will allow the student to also be a teacher
                    </p>
                  </div>
                )}

              {!member.profiles.some((p) => p.teacherProfile) &&
                !member.profiles.some((p) => p.studentProfile) && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="createStudentProfile"
                        name="createStudentProfile"
                      />
                      <Label htmlFor="createStudentProfile">
                        Create Student Profile
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This will allow the member to also be a student
                    </p>
                  </div>
                )}

              {member.profiles.some((p) => p.teacherProfile) && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isOwner"
                      name="isOwner"
                      defaultChecked={member.profiles.some((p) => p.isOwner)}
                      disabled={
                        member.profiles.some((p) => p.isOwner) ||
                        (!!member.profiles.some((p) => p.studentProfile) &&
                          !member.profiles.some((p) => p.teacherProfile))
                      }
                    />
                    <Label htmlFor="isOwner">Is an Owner</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {member.profiles.some((p) => p.isOwner)
                      ? 'Super owners cannot have their owner status changed'
                      : member.profiles.some((p) => p.studentProfile) &&
                          !member.profiles.some((p) => p.teacherProfile)
                        ? 'Students must have a teacher profile to become owners'
                        : 'Owners can manage organization members and settings'}
                  </p>
                </div>
              )}

              {teacherProfile ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Teacher Assignments</div>
                  <div className="space-y-2 pr-1">
                    {schools.map((s) => {
                      const isAssigned = assignedSchoolIds.has(s.id);
                      const isExpanded = expandedSchoolIds.has(s.id);
                      return (
                        <div key={s.id} className="border rounded">
                          <div className="flex w-full items-center justify-between p-2 gap-2">
                            <div
                              role="button"
                              tabIndex={0}
                              className="flex items-center gap-2 text-left cursor-pointer select-none min-w-0"
                              onClick={() =>
                                toggleSchoolAssignment(s.id, !isAssigned)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleSchoolAssignment(s.id, !isAssigned);
                                }
                              }}
                            >
                              <div
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={isAssigned}
                                  onCheckedChange={() =>
                                    toggleSchoolAssignment(s.id, !isAssigned)
                                  }
                                />
                              </div>
                              <span className="font-medium truncate w-full flex-1 min-w-0">
                                {s.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                type="button"
                                className={cn(
                                  'h-7 w-7 transition-transform',
                                  isExpanded ? 'rotate-180' : ''
                                )}
                                onClick={() => toggleExpandSchool(s.id)}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              {isAssigned ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    type="button"
                                    onClick={() =>
                                      assignAllClassesForSchool(s.id)
                                    }
                                    disabled={assignFetcher.state !== 'idle'}
                                    className="h-7 px-2 text-xs"
                                  >
                                    Assign all classes
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    type="button"
                                    onClick={() =>
                                      unassignAllClassesForSchool(s.id)
                                    }
                                    disabled={assignFetcher.state !== 'idle'}
                                    className="h-7 px-2 text-xs"
                                  >
                                    Unassign all
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                          {isExpanded ? (
                            <div className="px-2 pb-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {s.classes.map((c) => {
                                  const assigned = assignedClassIds.has(c.id);
                                  return (
                                    <div
                                      key={c.id}
                                      role="button"
                                      tabIndex={0}
                                      className="flex items-center justify-between border rounded-md p-2 cursor-pointer select-none text-xs"
                                      onClick={() =>
                                        toggleClassAssignment(
                                          c.id,
                                          s.id,
                                          !assigned
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === 'Enter' ||
                                          e.key === ' '
                                        ) {
                                          e.preventDefault();
                                          toggleClassAssignment(
                                            c.id,
                                            s.id,
                                            !assigned
                                          );
                                        }
                                      }}
                                    >
                                      <span className="flex items-center gap-2">
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          onKeyDown={(e) => e.stopPropagation()}
                                        >
                                          <Checkbox
                                            checked={assigned}
                                            onCheckedChange={() =>
                                              toggleClassAssignment(
                                                c.id,
                                                s.id,
                                                !assigned
                                              )
                                            }
                                          />
                                        </div>
                                        <span className="leading-tight">
                                          Grade {c.grade} • Period {c.period}
                                        </span>
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {assigned ? 'Assigned' : 'Assign'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={editFetcher.state !== 'idle'}
                className="flex-1"
              >
                {editFetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>

            {editFetcher.data?.error && (
              <div className="text-sm text-red-600">
                {editFetcher.data.error}
              </div>
            )}
          </editFetcher.Form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
