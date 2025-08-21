import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Users, Calendar } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

export type User = {
  id: string;
  profiles: Array<{
    isOwner: boolean;
    teacherProfile?: unknown | null;
    studentProfile?: unknown | null;
  }>;
};

export type Organization = {
  name: string | null;
  numOfTeacherSeats: number;
  numOfStudentSeats: number;
  accessExpiresAt: string | Date | null;
};

type Totals = { teachers: number; students: number; owners: number };

type OverviewCardsProps = {
  users: User[];
  organization: Organization;
  onOpenTeacherInvites: () => void;
  onOpenStudentInvites: () => void;
  onOpenOwnerInvites: () => void;
  teacherInvitationsCount: number;
  studentInvitationsCount: number;
  ownerInvitationsCount: number;
  totals?: Totals;
};

export function OverviewCards({
  users,
  organization,
  onOpenTeacherInvites,
  onOpenStudentInvites,
  onOpenOwnerInvites,
  teacherInvitationsCount,
  studentInvitationsCount,
  ownerInvitationsCount,
  totals,
}: OverviewCardsProps) {
  const owners = totals
    ? Array.from({ length: totals.owners })
    : users.filter((u) => u.profiles.some((p) => p.isOwner));
  const teachers = totals
    ? Array.from({ length: totals.teachers })
    : users.filter((u) => u.profiles.some((p) => p.teacherProfile));
  const students = totals
    ? Array.from({ length: totals.students })
    : users.filter(
        (u) =>
          u.profiles.some((p) => p.studentProfile) &&
          !u.profiles.some((p) => p.teacherProfile)
      );

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {teachers.length} / {organization.numOfTeacherSeats}
          </div>
          <p className="text-xs text-muted-foreground">
            {organization.numOfTeacherSeats - teachers.length} seats available
            <button
              onClick={onOpenTeacherInvites}
              className={cn(
                'ml-1',
                teacherInvitationsCount === 0
                  ? 'text-muted-foreground cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-800 underline'
              )}
              disabled={teacherInvitationsCount === 0}
            >
              ({teacherInvitationsCount} invited)
            </button>
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Students</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {students.length} / {organization.numOfStudentSeats}
          </div>
          <p className="text-xs text-muted-foreground">
            {organization.numOfStudentSeats - students.length} seats available
            <button
              onClick={onOpenStudentInvites}
              className={cn(
                'ml-1',
                studentInvitationsCount === 0
                  ? 'text-muted-foreground cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-800 underline'
              )}
              disabled={studentInvitationsCount === 0}
            >
              ({studentInvitationsCount} invited)
            </button>
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Owners</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{owners.length}</div>
          <p className="text-xs text-muted-foreground">
            <button
              onClick={onOpenOwnerInvites}
              className={cn(
                'ml-1',
                ownerInvitationsCount === 0
                  ? 'text-muted-foreground cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-800 underline'
              )}
              disabled={ownerInvitationsCount === 0}
            >
              ({ownerInvitationsCount} invited)
            </button>
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Access Expires</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div>
            {organization.accessExpiresAt
              ? new Date(organization.accessExpiresAt).toLocaleDateString()
              : 'Never'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
