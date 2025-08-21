import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import React from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { CookieColumns, useTable } from '~/hooks/useTable';
import { OverviewCards } from './OverviewCards';
import { InviteSheet } from './InviteSheets';
import { InvitationsSheet } from './InvitationsSheet';
import { MembersTable } from './MembersTable';
import { SchoolsCard } from './SchoolSheet';
import { EditMemberSheet } from './EditMemberSheet';
import { loadOrganizationIndex } from './loader.server';
import { organizationIndexAction } from './actions.server';

const COLUMNS: CookieColumns = {
  name: {
    label: 'Name',
    value: 'name',
  },
  email: {
    label: 'Email',
    value: 'email',
  },
  seat: {
    label: 'Seat',
    formatter: (value) => {
      if (value.teacherProfile) return 'Teacher';
      if (value.studentProfile) return 'Student';
      return 'Unassigned';
    },
  },
  actions: {
    label: 'Actions',
  },
};

export async function loader(args: LoaderFunctionArgs) {
  return loadOrganizationIndex(args);
}

export async function action(args: ActionFunctionArgs) {
  return organizationIndexAction(args);
}

export default function OrganizationRoute() {
  const {
    users,
    totalCount,
    table,
    organization,
    invitations,
    schools,
    teacherProfiles,
    seat,
    totals,
  } = useLoaderData<typeof loader>();
  const teacherInvitations = invitations.filter(
    (inv) => inv.type === 'organization-teacher-invite'
  );
  const studentInvitations = invitations.filter(
    (inv) => inv.type === 'organization-student-invite'
  );
  const ownerInvitations = invitations.filter(
    (inv) => inv.type === 'organization-owner-invite'
  );
  const [isCreateTeachersOpen, setIsCreateTeachersOpen] = React.useState(false);
  const [isCreateStudentsOpen, setIsCreateStudentsOpen] = React.useState(false);
  const [isTeacherInvitationsOpen, setIsTeacherInvitationsOpen] =
    React.useState(false);
  const [isStudentInvitationsOpen, setIsStudentInvitationsOpen] =
    React.useState(false);
  const [isOwnerInvitationsOpen, setIsOwnerInvitationsOpen] =
    React.useState(false);
  const [isEditMemberOpen, setIsEditMemberOpen] = React.useState(false);
  const [selectedMember, setSelectedMember] = React.useState<
    (typeof users)[0] | null
  >(null);
  const { selected, setSelected, handleSelectAll, handleSort, handleSelect } =
    useTable({ rows: users });

  return (
    <div className="flex flex-col gap-4 pb-16 p-3 md:p-5 h-screen overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Organization Dashboard</h1>
          <p className="text-muted-foreground">{organization.name}</p>
        </div>
      </div>

      {
        <OverviewCards
          {...({
            users,
            organization,
            onOpenTeacherInvites: () => setIsTeacherInvitationsOpen(true),
            onOpenStudentInvites: () => setIsStudentInvitationsOpen(true),
            onOpenOwnerInvites: () => setIsOwnerInvitationsOpen(true),
            teacherInvitationsCount: teacherInvitations.length,
            studentInvitationsCount: studentInvitations.length,
            ownerInvitationsCount: ownerInvitations.length,
            totals,
          } as any)}
        />
      }

      <div className="flex gap-2 flex-wrap">
        <InviteSheet
          open={isCreateTeachersOpen}
          onOpenChange={setIsCreateTeachersOpen}
          triggerLabel="Add Teachers"
          intent="invite-teachers"
        />
        <InviteSheet
          open={isCreateStudentsOpen}
          onOpenChange={setIsCreateStudentsOpen}
          triggerLabel="Add Students"
          intent="invite-students"
          variant="outline"
        />
      </div>

      <InvitationsSheet
        title="Pending Teacher Invitations"
        invitations={teacherInvitations}
        open={isTeacherInvitationsOpen}
        onOpenChange={setIsTeacherInvitationsOpen}
      />
      <InvitationsSheet
        title="Pending Student Invitations"
        invitations={studentInvitations}
        open={isStudentInvitationsOpen}
        onOpenChange={setIsStudentInvitationsOpen}
      />
      <InvitationsSheet
        title="Pending Owner Invitations"
        invitations={ownerInvitations}
        open={isOwnerInvitationsOpen}
        onOpenChange={setIsOwnerInvitationsOpen}
      />

      <MembersTable
        users={users}
        totalCount={totalCount}
        table={table}
        columns={COLUMNS}
        selected={selected}
        onSelectAll={handleSelectAll}
        onSelect={handleSelect}
        onSort={handleSort}
        onClearSelection={() => setSelected([])}
        seat={seat}
        onEditMember={(userId) => {
          const u = users.find((x) => x.id === userId) ?? null;
          setSelectedMember(u);
          setIsEditMemberOpen(true);
        }}
      />

      <SchoolsCard schools={schools} />

      <EditMemberSheet
        open={isEditMemberOpen}
        onOpenChange={(o) => {
          setIsEditMemberOpen(o);
          if (!o) setSelectedMember(null);
        }}
        member={selectedMember}
        teacherProfiles={teacherProfiles}
        schools={schools}
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
