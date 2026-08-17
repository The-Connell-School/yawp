import { invariant } from '@epic-web/invariant';
import {
  Form,
  data as dataResponse,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { Button } from '~/components/ui/button';
import {
  MAX_COLLABORATION_GROUP_SIZE,
  MIN_COLLABORATION_GROUP_SIZE,
} from '~/domain/assignments/collaboration';
import { unassignedMembershipIds } from '~/domain/collaboration/groups';
import {
  arrangeGroups,
  GroupProvisioningError,
  openGroups,
} from '~/domain/collaboration/groups.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

/**
 * The teacher's group builder for one class assignment.
 *
 * ⚠️ The loader and action are unit-tested; the RENDERED UI IS UNVERIFIED — it has
 * never been executed in a browser. It is deliberately the minimum that makes a
 * preview clickable: pick a size, shuffle, review, open. The drag-and-drop
 * breakout panel from the design sketch (move/exchange between groups, the
 * always-visible unassigned bucket as a drop target) is not built yet.
 *
 * The lifecycle boundary is real though, and enforced server-side: once groups are
 * opened they own drafts students have written in, so rearranging is refused
 * rather than merely hidden.
 */
async function requireTeacherClassAssignment(
  request: Request,
  classAssignmentId: string
) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: classAssignmentId,
      class: { teachers: { some: { id: profile.id } } },
    },
    select: {
      id: true,
      assignment: {
        select: {
          id: true,
          title: true,
          collaborationEnabled: true,
          collaborationGroupSize: true,
          collaborationGroupMode: true,
          assignmentType: { select: { collaborationSupported: true } },
        },
      },
      class: {
        select: {
          id: true,
          title: true,
          period: true,
          students: {
            orderBy: { id: 'asc' },
            select: { id: true, user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  return { profile, classAssignment };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.classAssignmentId, 'No class assignment id provided');

  const { classAssignment } = await requireTeacherClassAssignment(
    request,
    params.classAssignmentId
  );

  if (
    !classAssignment ||
    !classAssignment.assignment.collaborationEnabled ||
    !classAssignment.assignment.assignmentType.collaborationSupported
  ) {
    // Indistinguishable from nonexistent for anyone who is not this class's
    // teacher, and for any assignment that is not a collaborative one.
    throw dataResponse(
      { message: 'Not found.' },
      { status: 404, statusText: 'Not Found' }
    );
  }

  const groups = await prisma.documentGroup.findMany({
    where: { classAssignmentId: classAssignment.id },
    orderBy: { ordinal: 'asc' },
    select: {
      id: true,
      label: true,
      ordinal: true,
      openedAt: true,
      documentId: true,
      members: {
        select: { membershipId: true, removedAt: true },
      },
    },
  });

  const roster = classAssignment.class.students.map((student) => ({
    membershipId: student.id,
    name: student.user.name?.trim() || student.user.email,
  }));
  const nameFor = new Map(roster.map((entry) => [entry.membershipId, entry.name]));

  const unassigned = unassignedMembershipIds({
    rosterMembershipIds: roster.map((entry) => entry.membershipId),
    groups,
  }).map((membershipId) => ({
    membershipId,
    name: nameFor.get(membershipId) ?? 'Unknown student',
  }));

  return dataResponse({
    classAssignmentId: classAssignment.id,
    assignmentTitle: classAssignment.assignment.title,
    className: classAssignment.class.title,
    period: classAssignment.class.period,
    defaultGroupSize:
      classAssignment.assignment.collaborationGroupSize ??
      MIN_COLLABORATION_GROUP_SIZE,
    isWholeClass: classAssignment.assignment.collaborationGroupMode === 'whole-class',
    opened: groups.some((group) => group.openedAt !== null),
    groups: groups.map((group) => ({
      id: group.id,
      label: group.label,
      openedAt: group.openedAt ? group.openedAt.toISOString() : null,
      documentId: group.documentId,
      members: group.members
        .filter((member) => member.removedAt === null)
        .map((member) => ({
          membershipId: member.membershipId,
          name: nameFor.get(member.membershipId) ?? 'Former student',
        })),
    })),
    unassigned,
    rosterCount: roster.length,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.classAssignmentId, 'No class assignment id provided');

  const { classAssignment } = await requireTeacherClassAssignment(
    request,
    params.classAssignmentId
  );

  const backTo = `/app/class-assignments/${params.classAssignmentId}/groups`;

  if (
    !classAssignment ||
    !classAssignment.assignment.collaborationEnabled ||
    !classAssignment.assignment.assignmentType.collaborationSupported
  ) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'That assignment is not set up for collaborative drafts.',
    });
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  try {
    if (intent === 'arrange') {
      const isWholeClass =
        classAssignment.assignment.collaborationGroupMode === 'whole-class';
      const rawSize = formData.get('groupSize')?.toString() ?? '';
      const parsedSize = /^\d+$/.test(rawSize) ? Number(rawSize) : NaN;

      if (!isWholeClass && !Number.isFinite(parsedSize)) {
        return redirectWithToast(backTo, {
          type: 'error',
          description: 'Choose how many students should be in each group.',
        });
      }
      if (
        !isWholeClass &&
        (parsedSize < MIN_COLLABORATION_GROUP_SIZE ||
          parsedSize > MAX_COLLABORATION_GROUP_SIZE)
      ) {
        return redirectWithToast(backTo, {
          type: 'error',
          description: `Group size must be between ${MIN_COLLABORATION_GROUP_SIZE} and ${MAX_COLLABORATION_GROUP_SIZE} students.`,
        });
      }

      const { groupCount } = await arrangeGroups({
        classAssignmentId: classAssignment.id,
        groupSize: isWholeClass ? null : parsedSize,
        shuffle: formData.get('shuffle')?.toString() === 'true',
      });

      return redirectWithToast(backTo, {
        type: 'success',
        description: `Arranged ${groupCount} ${groupCount === 1 ? 'group' : 'groups'}.`,
      });
    }

    if (intent === 'open') {
      const { provisioned } = await openGroups({
        classAssignmentId: classAssignment.id,
      });

      return redirectWithToast(backTo, {
        type: 'success',
        description:
          provisioned === 0
            ? 'Groups were already open.'
            : `Opened ${provisioned} ${provisioned === 1 ? 'group' : 'groups'}. Students can start writing.`,
      });
    }
  } catch (error) {
    if (error instanceof GroupProvisioningError) {
      return redirectWithToast(backTo, {
        type: 'error',
        description: error.message,
      });
    }
    throw error;
  }

  return redirectWithToast(backTo, {
    type: 'error',
    description: 'Unsupported action.',
  });
}

export default function GroupsRoute() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const sizeOptions = Array.from(
    { length: MAX_COLLABORATION_GROUP_SIZE - MIN_COLLABORATION_GROUP_SIZE + 1 },
    (_, index) => MIN_COLLABORATION_GROUP_SIZE + index
  );

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">
          Groups · {data.assignmentTitle ?? 'Collaborative draft'}
        </h1>
        <p className="text-sm text-gray-600">
          {data.className}
          {data.period ? ` · Period ${data.period}` : ''} · {data.rosterCount}{' '}
          students
        </p>
      </header>

      {data.opened ? (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Groups are open and each one has its own draft. Rearranging is turned
          off now — moving a student would move them between documents their group
          has already written in.
        </p>
      ) : (
        <Form method="post" className="mb-6 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="arrange" />
          <input type="hidden" name="shuffle" value="true" />
          {data.isWholeClass ? (
            <p className="text-sm text-gray-700">
              This assignment uses one document for the whole class.
            </p>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              Students per group
              <select
                name="groupSize"
                defaultValue={data.defaultGroupSize}
                className="rounded border px-2 py-1"
              >
                {sizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit" disabled={busy}>
            {data.groups.length > 0 ? 'Shuffle again' : 'Shuffle into groups'}
          </Button>
        </Form>
      )}

      {data.unassigned.length > 0 ? (
        <section className="mb-6 rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-900">
            Not in a group ({data.unassigned.length})
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.unassigned.map((student) => (
              <li
                key={student.membershipId}
                className="rounded bg-white px-2 py-1 text-sm"
              >
                {student.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.groups.length === 0 ? (
        <p className="text-sm text-gray-600">
          No groups yet. Choose a size and shuffle to get started.
        </p>
      ) : (
        <>
          <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.groups.map((group) => (
              <li key={group.id} className="rounded border p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="text-xs text-gray-500">
                    {group.members.length}
                  </span>
                </div>
                <ul className="grid gap-1 text-sm">
                  {group.members.map((member) => (
                    <li key={member.membershipId}>{member.name}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {data.opened ? null : (
            <Form method="post">
              <input type="hidden" name="intent" value="open" />
              <Button type="submit" disabled={busy}>
                Open groups
              </Button>
              <p className="mt-2 text-xs text-gray-600">
                This creates one shared draft per group and lets students start
                writing. Group arrangements are locked afterwards.
              </p>
            </Form>
          )}
        </>
      )}
    </div>
  );
}
