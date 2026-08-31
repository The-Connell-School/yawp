import { invariant } from '@epic-web/invariant';
import {
  Form,
  Link,
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
import {
  addGroup,
  createLateStudentGroup,
  GroupEditingError,
  moveStudentToGroup,
  removeEmptyGroup,
} from '~/domain/collaboration/group-editing.server';
import { unassignedMembershipIds } from '~/domain/collaboration/groups';
import {
  arrangeGroups,
  GroupProvisioningError,
  openGroups,
} from '~/domain/collaboration/groups.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { GroupBoard } from './group-board';

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
  const nameFor = new Map(
    roster.map((entry) => [entry.membershipId, entry.name])
  );

  const unassigned = unassignedMembershipIds({
    rosterMembershipIds: roster.map((entry) => entry.membershipId),
    groups,
  }).map((membershipId) => ({
    membershipId,
    name: nameFor.get(membershipId) ?? 'Unknown student',
  }));
  const nonemptyGroups = groups.filter((group) =>
    group.members.some((member) => member.removedAt === null)
  );
  const finalized = groups.some(
    (group) => group.openedAt !== null || group.documentId !== null
  );
  const complete =
    finalized &&
    nonemptyGroups.length > 0 &&
    unassigned.length === 0 &&
    nonemptyGroups.every(
      (group) => group.openedAt !== null && group.documentId !== null
    );

  return dataResponse({
    classAssignmentId: classAssignment.id,
    assignmentId: classAssignment.assignment.id,
    classId: classAssignment.class.id,
    assignmentTitle: classAssignment.assignment.title,
    className: classAssignment.class.title,
    period: classAssignment.class.period,
    defaultGroupSize:
      classAssignment.assignment.collaborationGroupSize ??
      MIN_COLLABORATION_GROUP_SIZE,
    isWholeClass:
      classAssignment.assignment.collaborationGroupMode === 'whole-class',
    finalized,
    complete,
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

  const { profile, classAssignment } = await requireTeacherClassAssignment(
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

  // Drag-and-drop edits arrive as fetcher submissions and must not navigate, so
  // they answer with data the page reads inline rather than a redirect+toast. A
  // fetcher that receives a redirect navigates the whole app, which would throw
  // the teacher off the page mid-arrangement.
  const editIntents = [
    'move-student',
    'add-group',
    'remove-group',
    'create-late-group',
  ];
  if (intent && editIntents.includes(intent)) {
    try {
      if (intent === 'move-student') {
        const membershipId = formData.get('membershipId')?.toString();
        if (!membershipId) {
          return dataResponse(
            { success: false, message: 'No student to move.' },
            { status: 400 }
          );
        }
        // The empty string is the unassigned bucket, which has no group id.
        const rawTarget = formData.get('targetGroupId')?.toString() ?? '';
        await moveStudentToGroup({
          classAssignmentId: classAssignment.id,
          membershipId,
          targetGroupId: rawTarget === '' ? null : rawTarget,
        });
      }

      if (intent === 'add-group') {
        await addGroup({ classAssignmentId: classAssignment.id });
      }

      if (intent === 'remove-group') {
        const groupId = formData.get('groupId')?.toString();
        if (!groupId) {
          return dataResponse(
            { success: false, message: 'No group to remove.' },
            { status: 400 }
          );
        }
        await removeEmptyGroup({
          classAssignmentId: classAssignment.id,
          groupId,
        });
      }

      if (intent === 'create-late-group') {
        const membershipId = formData.get('membershipId')?.toString();
        if (!membershipId) {
          return dataResponse(
            { success: false, message: 'No student to assign.' },
            { status: 400 }
          );
        }
        await createLateStudentGroup({
          classAssignmentId: classAssignment.id,
          membershipId,
        });
      }

      return dataResponse({ success: true });
    } catch (error) {
      if (error instanceof GroupEditingError) {
        return dataResponse(
          { success: false, message: error.message },
          { status: 400 }
        );
      }
      throw error;
    }
  }

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

      const remainingDeployments = await prisma.classAssignment.findMany({
        where: {
          id: { not: classAssignment.id },
          assignmentId: classAssignment.assignment.id,
          class: { teachers: { some: { id: profile.id } } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          class: { select: { students: { select: { id: true } } } },
          documentGroups: {
            select: {
              documentId: true,
              openedAt: true,
              members: {
                where: { removedAt: null },
                select: { membershipId: true },
              },
            },
          },
        },
      });
      const nextDeployment = remainingDeployments.find((deployment) => {
        const roster = new Set(
          deployment.class.students.map((student) => student.id)
        );
        const assigned = new Set(
          deployment.documentGroups.flatMap((group) =>
            group.openedAt !== null && group.documentId !== null
              ? group.members.map((member) => member.membershipId)
              : []
          )
        );
        return (
          roster.size === 0 ||
          assigned.size !== roster.size ||
          [...roster].some((membershipId) => !assigned.has(membershipId))
        );
      });
      const nextUrl = nextDeployment
        ? `/app/class-assignments/${nextDeployment.id}/groups`
        : backTo;

      return redirectWithToast(nextUrl, {
        type: 'success',
        description:
          provisioned === 0
            ? 'Groups were already finalized.'
            : `Finalized ${provisioned} ${provisioned === 1 ? 'group' : 'groups'}. Students can start writing.`,
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
    // The app shell hands each page a fixed-height box and expects the page to
    // own its scrolling; a roster long enough to overflow was otherwise stuck.
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto w-full max-w-4xl p-6">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link
              to={`/app/assignments/${data.assignmentId}?classId=${data.classId}`}
              className="w-fit"
            >
              ← Back to assignment
            </Link>
          </Button>
        </div>
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

        {data.finalized ? (
          <p
            className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Groups are finalized and each one has its own draft. Existing
            members stay with their original artifact. If a student joins the
            class later, place that student into an existing group or create a
            new group for them below.
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

        {data.groups.length === 0 && data.unassigned.length === 0 ? (
          <p className="text-sm text-gray-600">
            No groups yet. Choose a size and shuffle to get started.
          </p>
        ) : (
          <>
            <GroupBoard
              groups={data.groups}
              unassigned={data.unassigned}
              disabled={data.complete}
              frozenMembers={data.finalized}
              wholeClass={data.isWholeClass}
            />

            {data.finalized && data.unassigned.length > 0 ? (
              <div className="mt-6 rounded border p-4">
                <h2 className="text-sm font-semibold">New students</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag a student into a group above, or give them a new shared
                  draft without changing any existing group.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.unassigned.map((student) => (
                    <Form method="post" key={student.membershipId}>
                      <input
                        type="hidden"
                        name="intent"
                        value="create-late-group"
                      />
                      <input
                        type="hidden"
                        name="membershipId"
                        value={student.membershipId}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        New group for {student.name}
                      </Button>
                    </Form>
                  ))}
                </div>
              </div>
            ) : null}

            {data.finalized &&
            !data.complete &&
            data.unassigned.length === 0 ? (
              <Form method="post" className="mt-6 border-t pt-6">
                <input type="hidden" name="intent" value="open" />
                <Button type="submit" disabled={busy}>
                  Finish finalization
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  This safely creates any missing group drafts without replacing
                  artifacts that already exist.
                </p>
              </Form>
            ) : null}

            {data.finalized ? null : (
              <Form method="post" className="mt-8 border-t pt-6">
                <input type="hidden" name="intent" value="open" />
                <Button
                  type="submit"
                  disabled={busy || data.unassigned.length > 0}
                >
                  Finalize groups
                </Button>
                <p className="mt-2 text-xs text-gray-600">
                  {data.unassigned.length > 0
                    ? 'Assign every student to a group before finalizing.'
                    : 'This creates one shared draft per group and lets students start writing. Group arrangements are locked afterwards.'}
                </p>
              </Form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
