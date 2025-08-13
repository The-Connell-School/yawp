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

  if (!member) return null;

  const teacherProfile = teacherProfiles.find(
    (t) => t.profile.user.id === member.id
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Member</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Member Information</div>
            <div className="text-sm text-muted-foreground">
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

          <editFetcher.Form method="post" className="space-y-4">
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
                <div className="space-y-4">
                  <div className="text-sm font-medium">Teacher Assignments</div>
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Schools</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {schools.map((s) => {
                        const isAssigned = teacherProfile.schools.some(
                          (x) => x.id === s.id
                        );
                        return (
                          <assignFetcher.Form
                            method="post"
                            key={s.id}
                            className="flex items-center justify-between border rounded p-2"
                          >
                            <span>{s.name}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="hidden"
                                name="teacherProfileId"
                                value={teacherProfile.id}
                              />
                              <input
                                type="hidden"
                                name="schoolId"
                                value={s.id}
                              />
                              <Button
                                size="sm"
                                type="submit"
                                variant={isAssigned ? 'outline' : 'default'}
                                name="intent"
                                value={
                                  isAssigned
                                    ? 'unassign-teacher-from-school'
                                    : 'assign-teacher-to-school'
                                }
                              >
                                {isAssigned ? 'Unassign' : 'Assign'}
                              </Button>
                            </div>
                          </assignFetcher.Form>
                        );
                      })}
                    </div>
                  </div>

                  {teacherProfile.schools.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Classes
                      </div>
                      <div className="space-y-4">
                        {schools
                          .filter((s) =>
                            teacherProfile.schools.some((x) => x.id === s.id)
                          )
                          .map((s) => (
                            <div key={s.id} className="border rounded p-2">
                              <div className="font-medium mb-2">{s.name}</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {s.classes.map((c) => {
                                  const assigned = teacherProfile.classes.some(
                                    (x) => x.id === c.id
                                  );
                                  return (
                                    <assignFetcher.Form
                                      method="post"
                                      key={c.id}
                                      className="flex items-center justify-between border rounded p-2"
                                    >
                                      <span>
                                        Grade {c.grade} • Period {c.period}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="hidden"
                                          name="teacherProfileId"
                                          value={teacherProfile.id}
                                        />
                                        <input
                                          type="hidden"
                                          name="classId"
                                          value={c.id}
                                        />
                                        <Button
                                          size="sm"
                                          type="submit"
                                          variant={
                                            assigned ? 'outline' : 'default'
                                          }
                                          name="intent"
                                          value={
                                            assigned
                                              ? 'unassign-teacher-from-class'
                                              : 'assign-teacher-to-class'
                                          }
                                        >
                                          {assigned ? 'Unassign' : 'Assign'}
                                        </Button>
                                      </div>
                                    </assignFetcher.Form>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
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
